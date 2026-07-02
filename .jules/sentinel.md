## 2024-07-02 - Fix CWE-208 Timing Leak in Authentication
**Vulnerability:** The `timingSafeEqual` function in `src/config/aedes.js` performed a length check `if (bufA.length !== bufB.length) return false;` before calling `crypto.timingSafeEqual`. This early return creates a timing leak that can be used to infer the length of a password.
**Learning:** Node.js `crypto.timingSafeEqual` throws an error if buffer lengths don't match. Developers sometimes add a length check to avoid the error, unknowingly introducing a timing leak.
**Prevention:** Always hash both inputs (e.g., using SHA-256) before using `crypto.timingSafeEqual`. This guarantees the buffers are identical in length without exposing the original input's length.
