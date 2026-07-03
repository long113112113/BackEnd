## 2024-07-03 - [CWE-208] Fix Timing Leak in timingSafeEqual
**Vulnerability:** A timing leak (CWE-208) existed in `src/config/aedes.js` because `timingSafeEqual` checked input lengths and returned early if they mismatched, which allows timing attacks.
**Learning:** Returning early on length mismatches defeats the purpose of `crypto.timingSafeEqual`.
**Prevention:** Always hash both inputs before comparison using `crypto.timingSafeEqual` to guarantee equal lengths without early returns or unhandled exceptions.
