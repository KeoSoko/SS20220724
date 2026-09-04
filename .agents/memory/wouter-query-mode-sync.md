---
name: Wouter query-mode synchronization
description: Reliable query-driven UI state for direct links and browser history in this project's Wouter setup.
---

For UI modes encoded in query parameters, read `window.location.pathname` and `window.location.search` directly for initial state and mode changes, and synchronize state on `popstate`.

**Why:** In browser verification, Wouter's location value did not consistently include query parameters on a fresh direct load or refresh state after Back/Forward, leaving the URL and visible auth mode out of sync.

Explicit `mode` values take precedence over legacy `tab` values. Recognized legacy auth URLs remain readable but are immediately canonicalized with `history.replaceState`, preserving unrelated parameters so old links do not create stale Back/Forward entries.

**How to apply:** Whenever a page uses query parameters as its mode source of truth, verify direct URL loading plus Back and Forward. Preserve unrelated parameters when switching or canonicalizing modes, and emit only canonical URLs from owned navigation.