# Packaged MiniLM text encoder

These quantized ONNX weights and tokenizer files come from
[Xenova/all-MiniLM-L6-v2, revision 751bff37182d3f1213fa05d7196b954e230abad9](https://huggingface.co/Xenova/all-MiniLM-L6-v2/tree/751bff37182d3f1213fa05d7196b954e230abad9).
The upstream model is
[sentence-transformers/all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2).
The pinned Xenova model card identifies its licence as
[Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0).

The application uses the packaged `onnx/model_quantized.onnx` file through
ONNX Runtime WebAssembly. It mean-pools non-padding token embeddings and
L2-normalises the resulting 384-dimensional vector. Inference is limited to
512 tokens, including boundary tokens. See
[`src/lib/reports/local-embedding.ts`](../../../src/lib/reports/local-embedding.ts)
for the implementation and
[`docs/ai-feature-suite.md`](../../../../docs/ai-feature-suite.md) for its callers.
