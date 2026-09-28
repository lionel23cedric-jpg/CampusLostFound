import {
  imageCategoryResponseSchema,
  type ImageCategoryResponse,
} from "./contracts";

const MODEL_ID = "Xenova/clip-vit-base-patch32";
const MODEL_REVISION = "d15189d";
const HYPOTHESIS_TEMPLATE = "This is a photo of a {}";

type CategoryCandidate = { id: string; name: string };
type Classification = { label: string; score: number };
type Classifier = (
  image: unknown,
  candidateLabels: string[],
  options: { hypothesis_template: string },
) => Promise<Classification[]>;

type ClassifierRuntime = {
  classifier: Classifier;
  fromBlob: (image: Blob) => Promise<unknown>;
};

let classifierPromise: Promise<ClassifierRuntime> | undefined;

async function getClassifier() {
  classifierPromise ??= import("@huggingface/transformers")
    .then(async ({ pipeline, RawImage }) => {
      const createClassifier = pipeline as unknown as (
        task: "zero-shot-image-classification",
        model: string,
        options: { dtype: "q4"; revision: string },
      ) => Promise<Classifier>;
      const classifier = await createClassifier("zero-shot-image-classification", MODEL_ID, {
        dtype: "q4",
        revision: MODEL_REVISION,
      });
      return {
        classifier,
        fromBlob: (image: Blob) => RawImage.fromBlob(image),
      };
    })
    .catch((error: unknown) => {
      classifierPromise = undefined;
      throw error;
    });
  return classifierPromise;
}

function normalizedScore(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export async function suggestImageCategories(
  image: Blob,
  categories: CategoryCandidate[],
): Promise<ImageCategoryResponse> {
  if (categories.length === 0) {
    return imageCategoryResponseSchema.parse({
      method: "fallback",
      suggestions: [],
    });
  }

  try {
    const { classifier, fromBlob } = await getClassifier();
    const preparedImage = await fromBlob(image);
    const output = await classifier(
      preparedImage,
      categories.map(({ name }) => name),
      { hypothesis_template: HYPOTHESIS_TEMPLATE },
    );
    const categoriesByName = new Map(
      categories.map((category) => [category.name, category] as const),
    );
    const suggestions = output
      .map((result) => {
        const category = categoriesByName.get(result.label);
        return category
          ? {
              categoryId: category.id,
              categoryName: category.name,
              confidence: normalizedScore(result.score),
            }
          : null;
      })
      .filter((suggestion) => suggestion !== null)
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, 3);

    return imageCategoryResponseSchema.parse({
      method: "model_assisted",
      suggestions,
    });
  } catch {
    return imageCategoryResponseSchema.parse({
      method: "fallback",
      suggestions: [],
    });
  }
}
