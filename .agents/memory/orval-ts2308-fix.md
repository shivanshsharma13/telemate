---
name: Orval TS2308 collision fix
description: How to fix TS2308 collision between generated/api.ts and generated/types in api-zod
---

**Problem**: Orval with `schemas: { path: "generated/types", type: "typescript" }` generates TypeScript interfaces in `generated/types/` AND also emits Zod schemas with the same names (e.g. `ListChannelFilesParams`) in `generated/api.ts`. Both get re-exported from `lib/api-zod/src/index.ts`, causing TS2308.

**Why it's subtle**: Orval itself succeeds, but `pnpm -w run typecheck:libs` (chained in the codegen script) fails. Looks like a codegen error but is a downstream barrel collision.

**Fix applied**:
1. Removed `schemas: { ... }` option from the `zod` output config in `lib/api-spec/orval.config.ts`
2. Added `sed -i "/generated\/types/d" ../api-zod/src/index.ts` to the codegen script in `lib/api-spec/package.json` — Orval still regenerates the barrel with the types export line, so sed strips it after generation

**How to apply**: If you change the OpenAPI spec and run codegen, this fix is automatic. If you see TS2308 about `Params` or `QueryParams`, check that the sed step is still in the codegen script.
