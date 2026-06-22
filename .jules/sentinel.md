
## 2024-06-22 - Prevent timing leak and DoS via crypto.timingSafeEqual
**Vulnerability:** Timing leak and potential DoS when using `crypto.timingSafeEqual`.
**Learning:** `crypto.timingSafeEqual` throws an exception if buffers have different lengths, which can cause DoS if unhandled. Adding an explicit length check before calling it creates a CWE-208 timing leak.
**Prevention:** Always hash both inputs (e.g., using SHA-256) before comparison. This guarantees equal lengths, preventing both the timing attack (from the early length check) and the unhandled length-mismatch exception (DoS).
