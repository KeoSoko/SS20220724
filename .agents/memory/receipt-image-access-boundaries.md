---
name: Receipt image access boundaries
description: Refresh must not imply that the browser can load an image; keep diagnostic and retry states separate.
---

A generated receipt image link confirms server metadata access and signing, not
successful browser access. Only the browser load event confirms recovery.
Browser failures alone cannot establish missing credentials or blob existence.

**Why:** The earlier fallback mislabeled repeated browser load failures as missing
Azure configuration and implied the image existed, hiding both client retry
defects and possible provider/network problems.

**How to apply:** Keep browser failures neutral, use sanitized server classifications
when available, and never include signed links in diagnostics. Check service-worker
behavior as well as HTTP cache headers: custom Cache API writes do not automatically
respect `no-store`. Do not initiate archive restoration as part of receipt-detail
link refresh without a separately approved restoration decision.
