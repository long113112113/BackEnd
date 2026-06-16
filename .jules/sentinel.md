
## 2024-05-21 - [CWE-208] Fix Timing Leak in MQTT Authentication
**Vulnerability:** The `timingSafeEqual` implementation in `src/config/aedes.js` returned early `if (bufA.length !== bufB.length) return false;`. This length check can be exploited using a timing attack to determine the true length of a secret credential, as the function returns quicker when the lengths are mismatched.
**Learning:** Returning early on length mismatch defeats the purpose of `crypto.timingSafeEqual` and introduces a CWE-208 vulnerability.
**Prevention:** Always hash inputs using a secure cryptographic hash function (like SHA-256) before passing them to `crypto.timingSafeEqual` to guarantee that both inputs have identical lengths, which avoids both timing attacks and potential unhandled exceptions for length mismatches.
