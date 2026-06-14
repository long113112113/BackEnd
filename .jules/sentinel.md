## 2024-06-14 - Fix CWE-208 Timing leak in crypto.timingSafeEqual
**Vulnerability:** Timing attack and DoS vulnerability when using `crypto.timingSafeEqual` with inputs of varying lengths.
**Learning:** Checking lengths and returning early before calling `crypto.timingSafeEqual` creates a timing leak. Also, if lengths are different, `crypto.timingSafeEqual` throws an error which can lead to DoS if not caught.
**Prevention:** Always hash inputs (e.g., using SHA-256) to ensure they are the same length before comparing them with `crypto.timingSafeEqual`.
