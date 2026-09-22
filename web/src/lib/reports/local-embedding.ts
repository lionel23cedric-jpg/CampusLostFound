// Loaded only when a member requests matches: builds and ordinary tests never download a model.
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const MODEL_REVISION = "751bff37182d3f1213fa05d7196b954e230abad9";

type Extractor = (
  text: string,
  options: { pooling: "mean"; normalize: true },
) => Promise<{ data: ArrayLike<number> }>;
let extractorPromise: Promise<Extractor> | undefined;

async function getExtractor() {
  extractorPromise ??= import("@huggingface/transformers")
    .then(({ pipeline }) => {
      const featurePipeline = pipeline as unknown as (
        task: "feature-extraction",
        model: string,
        options: { dtype: "q8"; revision: string },
      ) => Promise<Extractor>;
      return featurePipeline("feature-extraction", MODEL_ID, {
        dtype: "q8",
        revision: MODEL_REVISION,
      });
    })
    .catch((error: unknown) => {
      extractorPromise = undefined;
      throw error;
    });
  return extractorPromise;
}

export async function embedPublicText(text: string): Promise<Float32Array> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  const vector = Float32Array.from(output.data);
  if (vector.length === 0 || vector.some((value) => !Number.isFinite(value))) {
    throw new Error("Invalid local embedding");
  }
  return vector;
}
