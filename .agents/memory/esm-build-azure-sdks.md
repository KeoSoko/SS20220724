---
name: ESM build + Azure CommonJS SDKs
description: Why Azure SDKs 403/fail in production but work in dev, and the esbuild banner fix
---

# Azure SDKs fail in production ESM bundle (work in dev)

The production server is bundled by esbuild with `--format=esm --packages=external`. Azure SDKs (`@azure/storage-blob`, `@azure/ai-form-recognizer`) are CommonJS and call `require()` internally. In an ESM bundle `require` is undefined, so those calls throw "Dynamic require of X is not supported".

**Symptom:** Blob uploads log "Azure upload failed, falling back to local" in production but work in dev (`tsx`, real `require` available). Receipt OCR also intermittently 403'd in prod during the broken window. Credentials and the Azure resource were fine — it was a runtime bundling issue.

**Verified:** after the banner fix, storage init succeeds in prod, and a controlled reproduction (the exact `@azure/ai-form-recognizer` call bundled with the same esbuild ESM+banner flags, run via `node`) returns SUCCESS with the real creds — identical to the `tsx` dev path. Don't over-attribute a specific "auth header dropped" mechanism; the durable fact is ESM bundle needs `require` defined or CommonJS Azure deps break.

**Fix:** add a banner to the esbuild build command that defines `require` in the ESM output. Must alias `createRequire` because `server/pdf-converter.ts` already imports it — an unaliased import collides ("Identifier 'createRequire' has already been declared"):

```
--banner:js="import{createRequire as __cjsRequire}from'module';const require=__cjsRequire(import.meta.url);"
```

**Why:** ESM has no implicit `require`; CommonJS deps that call it at runtime break silently (caught/fallback) or send malformed requests (Azure 403).

**How to apply:** any time a CommonJS dependency must run inside this ESM production bundle. Verify with `npm run build` then `PORT=5050 NODE_ENV=production node dist/index.js` — boot must be clean (no SyntaxError, "Azure Storage initialized successfully"). Dev is unaffected (uses tsx).
