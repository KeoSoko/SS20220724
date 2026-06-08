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
