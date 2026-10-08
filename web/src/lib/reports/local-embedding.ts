import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { Tokenizer } from "@huggingface/tokenizers";
import * as ort from "onnxruntime-web/wasm";

// Loaded only when a member requests an AI text feature. The pinned model and
// tokenizer are packaged with the app; runtime inference never calls a remote API.
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const MODEL_CONFIG_PATH = path.join(MODEL_ID, "config.json");

function resolveLocalModelRoot() {
  const candidates = [
    path.join(process.cwd(), "models"),
    path.join(process.cwd(), "web", "models"),
    path.join(process.cwd(), ".next", "server", "models"),
  ];
  return (
    candidates.find((candidate) => fs.existsSync(path.join(candidate, MODEL_CONFIG_PATH))) ??
    candidates[0]
  );
}

const MODEL_DIRECTORY = path.join(resolveLocalModelRoot(), MODEL_ID);
const MODEL_PATH = path.join(MODEL_DIRECTORY, "onnx", "model_quantized.onnx");
const TOKENIZER_PATH = path.join(MODEL_DIRECTORY, "tokenizer.json");
const TOKENIZER_CONFIG_PATH = path.join(MODEL_DIRECTORY, "tokenizer_config.json");

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

const WASM_RUNTIME_ROOT = resolveWasmRuntimeRoot();
const WASM_MODULE_PATH = path.join(WASM_RUNTIME_ROOT, "ort-wasm-simd-threaded.mjs");
const WASM_BINARY_PATH = path.join(WASM_RUNTIME_ROOT, "ort-wasm-simd-threaded.wasm");

let tokenizer: Tokenizer | undefined;
let sessionPromise: Promise<ort.InferenceSession> | undefined;

function getTokenizer() {
  tokenizer ??= new Tokenizer(
    JSON.parse(fs.readFileSync(TOKENIZER_PATH, "utf8")) as object,
    JSON.parse(fs.readFileSync(TOKENIZER_CONFIG_PATH, "utf8")) as object,
  );
  return tokenizer;
}

async function getSession() {
  sessionPromise ??= (async () => {
    // One thread avoids worker/blob loading, which is unsupported in Vercel's
    // Node runtime. The WASM backend stays portable and needs no native addon.
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = { mjs: pathToFileURL(WASM_MODULE_PATH).href };
    const [model, wasmBinary] = await Promise.all([
      fs.promises.readFile(MODEL_PATH),
      fs.promises.readFile(WASM_BINARY_PATH),
    ]);
    ort.env.wasm.wasmBinary = wasmBinary;
    return ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
  })().catch((error: unknown) => {
    console.warn(
      "[local-embedding] packaged text model unavailable; using the caller fallback",
      error instanceof Error ? error.message : "unknown loader error",
    );
    sessionPromise = undefined;
    throw error;
  });
  return sessionPromise;
}
/**
 * Converts token embeddings into a sentence vector.
 *
 * Mean pooling uses the attention mask to exclude
 * padding tokens from the average.
 *
 * L2 normalization produces a unit-length vector
 * suitable for cosine similarity comparison.
 */
function normalizedMeanPool(
  hiddenState: ort.Tensor,
  attentionMask: number[],
): Float32Array {
  const [batchSize, tokenCount, dimensions] = hiddenState.dims;
  if (
    batchSize !== 1 ||
    tokenCount !== attentionMask.length ||
    !dimensions ||
    hiddenState.data.length !== tokenCount * dimensions
  ) {
    throw new Error("Invalid local embedding output");
  }

  const vector = new Float32Array(dimensions);
  let includedTokens = 0;
  for (let tokenIndex = 0; tokenIndex < tokenCount; tokenIndex += 1) {
    if (!attentionMask[tokenIndex]) continue;
    includedTokens += 1;
    const offset = tokenIndex * dimensions;
    for (let dimension = 0; dimension < dimensions; dimension += 1) {
      vector[dimension] += Number(hiddenState.data[offset + dimension]);
    }
  }
  if (includedTokens === 0) throw new Error("Invalid local embedding input");

  let squaredNorm = 0;
  for (let dimension = 0; dimension < dimensions; dimension += 1) {
    vector[dimension] /= includedTokens;
    squaredNorm += vector[dimension] ** 2;
  }
  const norm = Math.sqrt(squaredNorm);
  if (!Number.isFinite(norm) || norm === 0) throw new Error("Invalid local embedding");
  for (let dimension = 0; dimension < dimensions; dimension += 1) {
    vector[dimension] /= norm;
  }
  return vector;
}

export async function embedPublicText(text: string): Promise<Float32Array> {
  const encoding = getTokenizer().encode(text);
  const inputIds = BigInt64Array.from(encoding.ids, BigInt);
  const attentionMask = encoding.attention_mask;
  const dimensions: [number, number] = [1, inputIds.length];
  const session = await getSession();
  const output = await session.run({
    input_ids: new ort.Tensor("int64", inputIds, dimensions),
    attention_mask: new ort.Tensor(
      "int64",
      BigInt64Array.from(attentionMask, BigInt),
      dimensions,
    ),
    token_type_ids: new ort.Tensor("int64", new BigInt64Array(inputIds.length), dimensions),
  });
  const hiddenState = output.last_hidden_state;
  if (!hiddenState) throw new Error("Invalid local embedding output");
  return normalizedMeanPool(hiddenState, attentionMask);
}
