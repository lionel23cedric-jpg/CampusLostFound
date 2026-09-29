import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { Tokenizer } from "@huggingface/tokenizers";
import * as ort from "onnxruntime-web/wasm";
import sharp from "sharp";

import {
  imageCategoryResponseSchema,
  type ImageCategoryResponse,
} from "./contracts";

// MobileCLIP-S0 keeps the complete text-and-image model small enough for the
// Vercel function. All files are pinned and packaged with the application.
const MODEL_ID = "Xenova/mobileclip_s0";
const HYPOTHESIS_TEMPLATE = "This is a photo of a {}";
const LOGIT_SCALE = 100;
const TOKEN_COUNT = 77;
const IMAGE_SIZE = 256;

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

function tokenTensor(tokenizer: Tokenizer, prompts: string[]) {
  const inputIds = new BigInt64Array(prompts.length * TOKEN_COUNT);
  const eosTokenId = tokenizer.token_to_id("<|endoftext|>") ?? 49407;
  prompts.forEach((prompt, promptIndex) => {
    const encoded = tokenizer.encode(prompt).ids;
    const ids = encoded.slice(0, TOKEN_COUNT);
    if (encoded.length > TOKEN_COUNT) ids[TOKEN_COUNT - 1] = eosTokenId;
    const offset = promptIndex * TOKEN_COUNT;
    ids.forEach((id, tokenIndex) => {
      inputIds[offset + tokenIndex] = BigInt(id);
    });
  });
  return new ort.Tensor("int64", inputIds, [prompts.length, TOKEN_COUNT]);
}

async function imageTensor(image: Blob) {
  const { data, info } = await sharp(Buffer.from(await image.arrayBuffer()))
    .rotate()
    .resize(IMAGE_SIZE, IMAGE_SIZE, { fit: "cover", position: "centre" })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== IMAGE_SIZE || info.height !== IMAGE_SIZE || info.channels < 3) {
    throw new Error("Invalid prepared image");
  }

  const pixelsPerChannel = IMAGE_SIZE * IMAGE_SIZE;
  const values = new Float32Array(pixelsPerChannel * 3);
  for (let pixel = 0; pixel < pixelsPerChannel; pixel += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      values[channel * pixelsPerChannel + pixel] =
        data[pixel * info.channels + channel] / 255;
    }
  }
  return new ort.Tensor("float32", values, [1, 3, IMAGE_SIZE, IMAGE_SIZE]);
}

async function getClassifier() {
  classifierPromise ??= (async () => {
    const modelRoot = resolveLocalModelRoot();
    const modelDirectory = path.join(modelRoot, MODEL_ID);
    const wasmRoot = resolveWasmRuntimeRoot();
    const [tokenizerJson, tokenizerConfig, wasmBinary] = await Promise.all([
      fs.promises.readFile(path.join(modelDirectory, "tokenizer.json"), "utf8"),
      fs.promises.readFile(
        path.join(modelDirectory, "tokenizer_config.json"),
        "utf8",
      ),
      fs.promises.readFile(path.join(wasmRoot, "ort-wasm-simd-threaded.wasm")),
    ]);
    const tokenizer = new Tokenizer(
      JSON.parse(tokenizerJson) as object,
      JSON.parse(tokenizerConfig) as object,
    );

    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = {
      mjs: pathToFileURL(path.join(wasmRoot, "ort-wasm-simd-threaded.mjs")).href,
    };
    ort.env.wasm.wasmBinary = wasmBinary;

    const [textSession, visionSession] = await Promise.all([
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
      if (!(image instanceof Blob)) throw new Error("Invalid image input");
      const prompts = candidateLabels.map((label) =>
        options.hypothesis_template.replace("{}", label),
      );
      const [textOutput, imageOutput] = await Promise.all([
        textSession.run({ input_ids: tokenTensor(tokenizer, prompts) }),
        imageSessionRun(visionSession, image),
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
      fromBlob: async (image: Blob) => image,
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

async function imageSessionRun(session: ort.InferenceSession, image: Blob) {
  return session.run({ pixel_values: await imageTensor(image) });
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
