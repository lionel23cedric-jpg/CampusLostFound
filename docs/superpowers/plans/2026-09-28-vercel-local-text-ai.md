# Vercel Local Text AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the pinned MiniLM text-embedding model with the Next.js server functions so Vercel production uses `model_assisted` text AI without a runtime model download.

**Architecture:** Vendor only the four fixed MiniLM runtime assets (about 23 MB), configure the existing `embedPublicText` loader for local-only inference, and use narrow Next.js output-file traces for the four API routes that consume text embeddings. All consumers retain the current public contracts and deterministic fallbacks.

**Tech Stack:** Next.js 16.3.5, TypeScript, `@huggingface/transformers` 4.3.0, ONNX Runtime, Vitest, Vercel Functions.

## Global Constraints

- Work only in `D:\Massey\CampusLostFound-project-quality-polish`.
- Use model `Xenova/all-MiniLM-L6-v2` revision `751bff37182d3f1213fa05d7196b954e230abad9`.
- Add no paid AI service, API key, database migration, stored embedding index, or new dependency.
- Keep AI inference server-side and use only privacy-safe public report wording.
- Preserve every existing fallback and browser response contract.
- Do not bundle the separate CLIP image model in this change.
- Do not change ranking weights, UI layout, report visibility, or role permissions.

---

## File structure

- Create `web/models/Xenova/all-MiniLM-L6-v2/config.json`: pinned model configuration.
- Create `web/models/Xenova/all-MiniLM-L6-v2/tokenizer.json`: pinned tokenizer vocabulary and rules.
- Create `web/models/Xenova/all-MiniLM-L6-v2/tokenizer_config.json`: pinned tokenizer settings.
- Create `web/models/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx`: quantized text-embedding weights.
- Create `web/models/Xenova/all-MiniLM-L6-v2/MODEL_SOURCE.md`: identifier, revision, checksums, upstream source, and Apache-2.0 attribution.
- Modify `web/src/lib/reports/local-embedding.test.ts`: require local-only configuration and singleton reuse.
- Modify `web/src/lib/reports/local-embedding.ts`: point Transformers.js at packaged model assets and prohibit remote loading.
- Modify `web/next.config.ts`: include model assets only in text-AI route traces.
- Create `web/next-config.test.ts`: lock the narrow route-to-model mapping.

---

### Task 1: Vendor the pinned MiniLM runtime assets

**Files:**
- Create: `web/models/Xenova/all-MiniLM-L6-v2/config.json`
- Create: `web/models/Xenova/all-MiniLM-L6-v2/tokenizer.json`
- Create: `web/models/Xenova/all-MiniLM-L6-v2/tokenizer_config.json`
- Create: `web/models/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx`
- Create: `web/models/Xenova/all-MiniLM-L6-v2/MODEL_SOURCE.md`

**Interfaces:**
- Consumes: the already downloaded fixed-revision cache at `web/node_modules/@huggingface/transformers/.cache/Xenova/all-MiniLM-L6-v2/751bff37182d3f1213fa05d7196b954e230abad9/`.
- Produces: local model root `web/models` consumed by `embedPublicText` and Next.js output tracing.

- [ ] **Step 1: Copy only the four required runtime assets**

Run from the repository root:

```powershell
$source = "web\node_modules\@huggingface\transformers\.cache\Xenova\all-MiniLM-L6-v2\751bff37182d3f1213fa05d7196b954e230abad9"
$target = "web\models\Xenova\all-MiniLM-L6-v2"
New-Item -ItemType Directory -Force "$target\onnx" | Out-Null
Copy-Item "$source\config.json" "$target\config.json"
Copy-Item "$source\tokenizer.json" "$target\tokenizer.json"
Copy-Item "$source\tokenizer_config.json" "$target\tokenizer_config.json"
Copy-Item "$source\onnx\model_quantized.onnx" "$target\onnx\model_quantized.onnx"
```

- [ ] **Step 2: Verify exact sizes and SHA-256 hashes**

Run:

```powershell
Get-ChildItem "web\models\Xenova\all-MiniLM-L6-v2" -Recurse -File |
  Sort-Object FullName |
  ForEach-Object {
    [PSCustomObject]@{
      File = $_.FullName
      Bytes = $_.Length
      SHA256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()
    }
  }
```

Expected assets:

```text
config.json                  650 bytes      7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7
onnx/model_quantized.onnx    22972370 bytes afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1
tokenizer_config.json        366 bytes      9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3
tokenizer.json               711661 bytes   da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0
```

- [ ] **Step 3: Add model attribution**

Create `MODEL_SOURCE.md` with:

```markdown
# Model source

- Model: `Xenova/all-MiniLM-L6-v2`
- Revision: `751bff37182d3f1213fa05d7196b954e230abad9`
- Upstream: https://huggingface.co/Xenova/all-MiniLM-L6-v2
- Original model: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
- License: Apache-2.0
- Purpose: server-side embeddings of privacy-safe public lost-and-found wording.

Only the quantized ONNX model and its required configuration/tokenizer files are vendored. The project does not send report data to a third-party inference API.

## SHA-256

- `config.json`: `7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7`
- `onnx/model_quantized.onnx`: `afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1`
- `tokenizer_config.json`: `9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3`
- `tokenizer.json`: `da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0`
```

- [ ] **Step 4: Confirm scope and repository size**

Run:

```powershell
Get-ChildItem "web\models" -Recurse -File | Measure-Object Length -Sum
git status --short
```

Expected: five new files under the MiniLM directory, about 23 MB total, and no CLIP files.

- [ ] **Step 5: Commit the assets**

```powershell
git add web/models/Xenova/all-MiniLM-L6-v2
git commit -m "build(ai): vendor pinned MiniLM text model"
```

---

### Task 2: Make the shared embedding loader local-only

**Files:**
- Modify: `web/src/lib/reports/local-embedding.test.ts`
- Modify: `web/src/lib/reports/local-embedding.ts`

**Interfaces:**
- Consumes: model root `web/models` from Task 1 and `@huggingface/transformers` exports `env` and `pipeline`.
- Produces: unchanged `embedPublicText(text: string): Promise<Float32Array>` for every existing text-AI consumer.

- [ ] **Step 1: Write the failing local-only loader test**

Replace the Transformers.js mock setup with an explicit mutable environment object:

```ts
const extractor = vi.fn();
const pipeline = vi.fn();
const env = {
  allowLocalModels: false,
  allowRemoteModels: true,
  localModelPath: "",
};
vi.mock("@huggingface/transformers", () => ({ env, pipeline }));
```

Extend the existing assertion:

```ts
expect(env.allowLocalModels).toBe(true);
expect(env.allowRemoteModels).toBe(false);
expect(env.localModelPath.replaceAll("\\", "/")).toMatch(/\/models$/);
expect(pipeline).toHaveBeenCalledWith(
  "feature-extraction",
  "Xenova/all-MiniLM-L6-v2",
  {
    dtype: "q8",
    local_files_only: true,
    revision: "751bff37182d3f1213fa05d7196b954e230abad9",
  },
);
```

- [ ] **Step 2: Run the focused test and observe failure**

```powershell
cd web
npx vitest run src/lib/reports/local-embedding.test.ts
```

Expected: FAIL because the loader has not configured `env` and has not supplied `local_files_only`.

- [ ] **Step 3: Implement the minimal local-only loader**

Update `local-embedding.ts`:

```ts
import path from "node:path";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const MODEL_REVISION = "751bff37182d3f1213fa05d7196b954e230abad9";
const LOCAL_MODEL_ROOT = path.join(process.cwd(), "models");

// Existing Extractor type and singleton stay unchanged.

async function getExtractor() {
  extractorPromise ??= import("@huggingface/transformers")
    .then(({ env, pipeline }) => {
      env.localModelPath = LOCAL_MODEL_ROOT;
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      const featurePipeline = pipeline as unknown as (
        task: "feature-extraction",
        model: string,
        options: {
          dtype: "q8";
          local_files_only: true;
          revision: string;
        },
      ) => Promise<Extractor>;
      return featurePipeline("feature-extraction", MODEL_ID, {
        dtype: "q8",
        local_files_only: true,
        revision: MODEL_REVISION,
      });
    })
    .catch((error: unknown) => {
      extractorPromise = undefined;
      throw error;
    });
  return extractorPromise;
}
```

- [ ] **Step 4: Run the focused test**

```powershell
npx vitest run src/lib/reports/local-embedding.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run real inference with remote loading prohibited**

```powershell
npm run evaluate:matching:ai
```

Expected: exit code 0, 12 cases, top-match accuracy 1, and no model download.

- [ ] **Step 6: Commit the loader change**

```powershell
git add web/src/lib/reports/local-embedding.ts web/src/lib/reports/local-embedding.test.ts
git commit -m "fix(ai): load text embeddings from packaged model"
```

---

### Task 3: Trace the model into only the text-AI functions

**Files:**
- Modify: `web/next.config.ts`
- Create: `web/next-config.test.ts`

**Interfaces:**
- Consumes: `web/models/Xenova/all-MiniLM-L6-v2/**/*` from Task 1.
- Produces: Next.js `outputFileTracingIncludes` entries for the four server routes that can reach `embedPublicText`.

- [ ] **Step 1: Write the failing configuration test**

Create `web/next-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

const modelGlob = "./models/Xenova/all-MiniLM-L6-v2/**/*";

describe("Next.js local text-model tracing", () => {
  it("includes MiniLM only in routes that perform text inference", () => {
    expect(nextConfig.outputFileTracingIncludes).toEqual({
      "/api/reports": [modelGlob],
      "/api/reports/\\[id\\]/matches": [modelGlob],
      "/api/ai/report-assistant": [modelGlob],
      "/api/admin/ai/duplicates": [modelGlob],
    });
    expect(nextConfig.outputFileTracingIncludes).not.toHaveProperty("/*");
  });
});
```

- [ ] **Step 2: Run the test and observe failure**

```powershell
npx vitest run next-config.test.ts
```

Expected: FAIL because `outputFileTracingIncludes` is undefined.

- [ ] **Step 3: Add the narrow trace mapping**

Update `web/next.config.ts`:

```ts
import type { NextConfig } from "next";

const textModelGlob = "./models/Xenova/all-MiniLM-L6-v2/**/*";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/reports": [textModelGlob],
    "/api/reports/\\[id\\]/matches": [textModelGlob],
    "/api/ai/report-assistant": [textModelGlob],
    "/api/admin/ai/duplicates": [textModelGlob],
  },
};

export default nextConfig;
```

- [ ] **Step 4: Run the configuration and loader tests**

```powershell
npx vitest run next-config.test.ts src/lib/reports/local-embedding.test.ts
```

Expected: both test files PASS.

- [ ] **Step 5: Build and inspect emitted traces**

```powershell
npm run build
rg -l "models[/\\\\]Xenova[/\\\\]all-MiniLM-L6-v2" .next/server/app/api -g "*.nft.json"
```

Expected traces:

```text
.next/server/app/api/reports/route.js.nft.json
.next/server/app/api/reports/[id]/matches/route.js.nft.json
.next/server/app/api/ai/report-assistant/route.js.nft.json
.next/server/app/api/admin/ai/duplicates/route.js.nft.json
```

No unrelated authentication, account, claim, image, notification, or moderation mutation route trace may contain the model path.

- [ ] **Step 6: Commit the packaging configuration**

```powershell
git add web/next.config.ts web/next-config.test.ts
git commit -m "build(ai): trace MiniLM into text inference routes"
```

---

### Task 4: Complete validation, deploy, and prove production inference

**Files:**
- Verify only; no source file is expected to change.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: a clean, tested Git commit on `develop`, synchronized `main`, and production evidence showing `AI-assisted search`.

- [ ] **Step 1: Run focused text-AI tests**

```powershell
npx vitest run src/lib/reports/local-embedding.test.ts src/lib/reports/browse-service.test.ts src/lib/reports/matching-service.test.ts src/lib/ai/report-assistant.test.ts src/lib/ai/duplicate-detection.test.ts next-config.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run all repository checks**

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Expected: every command exits 0.

- [ ] **Step 3: Check scope and working tree**

```powershell
git diff --check
git status --short
git log --oneline --max-count=6
```

Expected: no whitespace errors and only the intended commits.

- [ ] **Step 4: Push `develop` and update production `main` using the existing safe fast-forward workflow**

```powershell
git push github develop
git fetch github main develop
$isAncestor = git merge-base --is-ancestor github/main develop; $ancestorExit = $LASTEXITCODE
if ($ancestorExit -ne 0) {
  git merge --no-ff github/main -m "Merge main into develop before local AI deployment"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  git push github develop
}
git diff --stat github/main...develop
git push github develop:main
```

Before the final push, require `git diff --stat github/main...develop` to contain only this design, plan, model, loader, tests, and trace configuration. The push to `main` must remain a fast-forward; do not force-push.

- [ ] **Step 5: Wait for Vercel Production to report Ready**

Open the project's production deployments page and verify that the newest `main` commit is marked `Production` and `Ready`.

- [ ] **Step 6: Verify smart search in production**

On `https://campus-lost-found-flame.vercel.app/reports`, enter:

```text
I lost a red canvas backpack near the library
```

Submit with **Search reports**. Require all of the following:

- URL contains `smartQuery=I+lost+a+red+canvas+backpack+near+the+library`;
- visible status says `AI-assisted search`;
- the red canvas backpack reports rank ahead of unrelated reports;
- no browser console error and no Vercel 5xx runtime log.

- [ ] **Step 7: Verify the shared model consumers**

Use existing non-destructive demo data to verify:

- **Find possible matches** displays `AI-assisted`;
- the report form assistant labels suggestions `AI-assisted`;
- administrator duplicate scanning labels model-scored candidates `AI-assisted` when candidates exist.

Do not create, approve, hide, suspend, or delete production records solely for this verification.

---

## Plan self-review

- Spec coverage: model assets, loader, route tracing, fallbacks, privacy, tests, deployment, and production proof are covered.
- Scope: one shared text-model deployment issue; image classification remains explicitly excluded.
- Type consistency: the existing `embedPublicText(text: string): Promise<Float32Array>` interface is unchanged.
- Placeholder scan: every implementation and verification step contains concrete files, commands, and expected results.
