## 2026-06-27 - Fix CWE-208 Timing Leak in MQTT Auth
**Vulnerability:** Node.js crypto.timingSafeEqual would return early if the lengths of the two buffers were different, leading to a timing attack vulnerability (CWE-208).
**Learning:** Comparing passwords or tokens of different lengths using timingSafeEqual requires hashing both inputs first, because timingSafeEqual throws or reveals length mismatch timing differences.
**Prevention:** Always hash both inputs (e.g., using SHA-256) to ensure equal lengths before calling crypto.timingSafeEqual.
