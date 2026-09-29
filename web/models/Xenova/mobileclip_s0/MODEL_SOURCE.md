# Packaged MobileCLIP-S0 model

- Source: `https://huggingface.co/Xenova/mobileclip_s0`
- Pinned revision: `20c6e4f26ad3f7f7e9cde13c4f9bb54852dd42c6`
- Runtime: local ONNX Runtime WebAssembly; remote model downloads are disabled.
- Purpose: user-confirmed, zero-shot report-category suggestions from the first selected image.

The original `LICENSE` and `README.md` are included beside these files. The two
quantized ONNX files are the smallest compatible text and vision weights exposed
by the pinned model revision.

| File | SHA-256 |
| --- | --- |
| `config.json` | `9653c701b559b191c969929f640615ea386afb9d16deb08ba1520078bf4be23a` |
| `preprocessor_config.json` | `b031f09fbd69e22a605b6cc7433993249ee893b7fc1b79321f669cd015493dd4` |
| `tokenizer_config.json` | `a7d9d24f248071b792e4a3b56ab0539c2f40eec8da56d6fd91fb3a50058acebd` |
| `tokenizer.json` | `72ed5c96db5729294468543e4bc75fce14ca63f58e37300290189ba1c1e52b85` |
| `onnx/text_model_quantized.onnx` | `b8557b10e5c23a0126c6d2e6eba48d240484979007917d128953b31618a04211` |
| `onnx/vision_model_quantized.onnx` | `fcbd153d1aa1314fb72ea39b20c37e0572e7e7b05359b51f3efee5d682658472` |
