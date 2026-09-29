import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import * as ort from "onnxruntime-web/wasm";

import {
  imageCategoryResponseSchema,
  type ImageCategoryResponse,
} from "./contracts";

// MobileCLIP-S0 keeps the complete text-and-image model small enough for the
// Vercel function. All files are pinned and packaged with the application.
const MODEL_ID = "Xenova/mobileclip_s0";
const HYPOTHESIS_TEMPLATE = "This is a photo of a {}";
const LOGIT_SCALE = 100;

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

type TokenTensor = {
  data: BigInt64Array;
  dims: number[];
};

type FloatTensor = {
  data: Float32Array;
  dims: number[];
};

let classifierPromise: Promise<ClassifierRuntime> | undefined;

function resolveLocalModelRoot() {
  const configPath = path.join(MODEL_ID, "config.json");
  const candidates = [
    path.join(process.cwd(), "models"),
    path.join(process.cwd(), "web", "models"),
    path.join(process.cwd(), ".next", "server", "models"),
  ];
  return (
    candidates.find((candidate) => fs.existsSync(path.join(candidate, configPath))) ??
    candidates[0]
  );
}

function resolveWasmRuntimeRoot() {
  const candidates = [
    path.join(process.cwd(), "node_modules", "onnxruntime-web", "dist"),
    path.join(process.cwd(), "web", "node_modules", "onnxruntime-web", "dist"),
  ];
  return (
    candidates.find((candidate) =>
      fs.existsSync(path.join(candidate, "ort-wasm-simd-threaded.mjs")),
    ) ?? candidates[0]
  );
}

function normalizedScores(
  labels: string[],
  textEmbeddings: ort.Tensor,
  imageEmbeddings: ort.Tensor,
) {
  const dimensions = imageEmbeddings.dims[1];
  if (
    imageEmbeddings.dims[0] !== 1 ||
    textEmbeddings.dims[0] !== labels.length ||
    textEmbeddings.dims[1] !== dimensions ||
    !dimensions
  ) {
    throw new Error("Invalid image classification output");
  }

  const logits = labels.map((label, labelIndex) => {
    let dotProduct = 0;
    let textNorm = 0;
    let imageNorm = 0;
    const offset = labelIndex * dimensions;
    for (let index = 0; index < dimensions; index += 1) {
      const textValue = Number(textEmbeddings.data[offset + index]);
      const imageValue = Number(imageEmbeddings.data[index]);
      dotProduct += textValue * imageValue;
      textNorm += textValue ** 2;
      imageNorm += imageValue ** 2;
    }
    const denominator = Math.sqrt(textNorm * imageNorm);
    if (!Number.isFinite(denominator) || denominator === 0) {
      throw new Error("Invalid image classification output");
    }
    return { label, logit: (dotProduct / denominator) * LOGIT_SCALE };
  });

  const maxLogit = Math.max(...logits.map(({ logit }) => logit));
  const weights = logits.map(({ logit }) => Math.exp(logit - maxLogit));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return logits
    .map(({ label }, index) => ({ label, score: weights[index] / total }))
    .sort((left, right) => right.score - left.score);
}

async function getClassifier() {
  classifierPromise ??= (async () => {
    const [{ AutoProcessor, AutoTokenizer, RawImage, env }, wasmBinary] =
      await Promise.all([
        import("@huggingface/transformers"),
        fs.promises.readFile(
          path.join(resolveWasmRuntimeRoot(), "ort-wasm-simd-threaded.wasm"),
        ),
      ]);
    const modelRoot = resolveLocalModelRoot();
    const modelDirectory = path.join(modelRoot, MODEL_ID);

    // Remote downloads are deliberately disabled: inference must use only the
    // audited model files bundled with this application.
    env.allowRemoteModels = false;
    env.localModelPath = modelRoot;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = {
      mjs: pathToFileURL(
        path.join(resolveWasmRuntimeRoot(), "ort-wasm-simd-threaded.mjs"),
      ).href,
    };
    ort.env.wasm.wasmBinary = wasmBinary;

    const [tokenizer, processor, textSession, visionSession] = await Promise.all([
      AutoTokenizer.from_pretrained(MODEL_ID, { local_files_only: true }),
      AutoProcessor.from_pretrained(MODEL_ID, { local_files_only: true }),
      ort.InferenceSession.create(
        await fs.promises.readFile(
          path.join(modelDirectory, "onnx", "text_model_quantized.onnx"),
        ),
        { executionProviders: ["wasm"] },
      ),
      ort.InferenceSession.create(
        await fs.promises.readFile(
          path.join(modelDirectory, "onnx", "vision_model_quantized.onnx"),
        ),
        { executionProviders: ["wasm"] },
      ),
    ]);

    const classifier: Classifier = async (image, candidateLabels, options) => {
      const prompts = candidateLabels.map((label) =>
        options.hypothesis_template.replace("{}", label),
      );
      const tokenized = tokenizer(prompts, {
        padding: "max_length",
        truncation: true,
      }) as { input_ids: TokenTensor };
      const processed = (await processor(image)) as { pixel_values: FloatTensor };
      const [textOutput, imageOutput] = await Promise.all([
        textSession.run({
          input_ids: new ort.Tensor(
            "int64",
            tokenized.input_ids.data,
            tokenized.input_ids.dims,
          ),
        }),
        visionSession.run({
          pixel_values: new ort.Tensor(
            "float32",
            processed.pixel_values.data,
            processed.pixel_values.dims,
          ),
        }),
      ]);
      const textEmbeddings = textOutput.text_embeds;
      const imageEmbeddings = imageOutput.image_embeds;
      if (!textEmbeddings || !imageEmbeddings) {
        throw new Error("Invalid image classification output");
      }
      return normalizedScores(candidateLabels, textEmbeddings, imageEmbeddings);
    };

    return {
      classifier,
      fromBlob: (image: Blob) => RawImage.fromBlob(image),
    };
  })().catch((error: unknown) => {
    console.warn(
      "[image-classifier] packaged model unavailable; using the safe fallback",
      error instanceof Error ? error.message : "unknown loader error",
    );
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
  loadRuntime: () => Promise<ClassifierRuntime> = getClassifier,
): Promise<ImageCategoryResponse> {
  if (categories.length === 0) {
    return imageCategoryResponseSchema.parse({
      method: "fallback",
      suggestions: [],
    });
  }

  try {
    const { classifier, fromBlob } = await loadRuntime();
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
