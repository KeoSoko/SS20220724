---
name: Receipt scan timeouts
description: Why receipt scans time out and the two coupled constraints that prevent it
---

# Receipt scan "scanning timed out"

Two independent constraints must hold or single (camera) receipt scans time out:

1. **Client timeout must exceed the backend OCR cap.** The scan route races Azure OCR against a 60s server cap; the client also races the request against its own timeout. If the client timeout is shorter than 60s, it aborts mid-scan with a generic "timed out" message even though the server would have answered. Keep client timeout > backend cap so the server's real response (success or its own 504 with a useful message) wins.

**Why:** while OCR was broken (instant 403) nobody hit the client cap; once OCR actually ran, real Azure processing time on larger images exposed the too-short client timeout.

2. **The camera capture path must optimize images before scanning, same as file upload.** File uploads run `optimizeImage(file, 'receipt')` (≈1920px / 2MB) but the camera handler historically sent the raw capture (can be 10MB+) straight to OCR — slow enough to time out. Convert the camera data URL to a File and run the same optimization before preview + scan.

**How to apply:** any change to scan timeouts must keep client > server. Any new image-capture entry point must optimize before hitting `/api/receipts/scan`.

## Local OCR (Tesseract) fallback bounding

The scan route falls back to a local Tesseract engine when Azure OCR fails. Two non-obvious rules keep it from breaking the timeout budget:

- **A `Promise.race` around the fallback does NOT cancel Tesseract.** The worker keeps running in the background; only the race rejects. To actually stop a hung worker the timeout must live *inside* `analyzeReceipt`, so leaving the try block triggers the `finally` that calls `worker.terminate()`. Pass the timeout in; don't wrap from outside.
- **Gate the fallback on remaining time budget, not a fixed timeout.** OCR is sequential (Azure first, then fallback). If Azure consumes most of the end-to-end budget (e.g. it *timed out* rather than failing fast like a 403), starting a fresh fallback just runs useless work past the point the client already gave up. Compute remaining budget against an end-to-end deadline kept under the client cap and skip the fallback if too little is left.

**Why:** the fallback is meant for *fast* Azure failures (403/auth/config), which leave plenty of budget; for slow-Azure cases it can't help in time anyway.
