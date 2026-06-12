## 2024-05-24 - [Fix CWE-208 Timing Leak in timingSafeEqual]
**Vulnerability:** A custom wrapper for `crypto.timingSafeEqual` in `src/config/aedes.js` compared input lengths first and returned early if they did not match, creating a timing leak (CWE-208) as well as bypassing the constant-time characteristics of `crypto.timingSafeEqual` for differing length inputs.
**Learning:** Comparing input lengths prior to calling a constant-time equality function exposes the length of secrets to timing attacks.
**Prevention:** Always hash arbitrary length inputs (e.g., using SHA-256) first to guarantee identical lengths, then call the constant-time equality function on the resulting hashes. This prevents both timing attacks and unhandled exceptions from length mismatch.
