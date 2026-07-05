## 2025-02-12 - Fix timing attack vulnerability in Aedes authentication
**Vulnerability:** A CWE-208 timing attack vulnerability existed in `src/config/aedes.js` due to an early return on length mismatch and passing variable-length buffers to `crypto.timingSafeEqual()`, which throws an error if lengths differ.
**Learning:** The implementation tried to avoid the exception by checking `bufA.length !== bufB.length`, which introduced a timing leak. Node.js `crypto.timingSafeEqual` requires equal lengths.
**Prevention:** Always hash inputs (e.g., using SHA-256) before passing them to `crypto.timingSafeEqual` to guarantee equal lengths, preventing both timing attacks and unhandled length-mismatch exceptions (DoS).
