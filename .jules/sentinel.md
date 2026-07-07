## 2025-02-12 - Fix timing attack vulnerability in Aedes authentication
**Vulnerability:** A CWE-208 timing attack vulnerability existed in `src/config/aedes.js` due to an early return on length mismatch and passing variable-length buffers to `crypto.timingSafeEqual()`, which throws an error if lengths differ.
**Learning:** The implementation tried to avoid the exception by checking `bufA.length !== bufB.length`, which introduced a timing leak. Node.js `crypto.timingSafeEqual` requires equal lengths.
**Prevention:** Always hash inputs (e.g., using SHA-256) before passing them to `crypto.timingSafeEqual` to guarantee equal lengths, preventing both timing attacks and unhandled length-mismatch exceptions (DoS).

## 2025-02-13 - Add rate limiting to login endpoint
**Vulnerability:** Missing rate limiting on sensitive login endpoint (`/api/auth/login`), exposing it to brute-force credential stuffing attacks.
**Learning:** The application lacked basic protection against rapid authentication attempts.
**Prevention:** Implement `express-rate-limit` middleware on all authentication endpoints, particularly login. Use specific configurations (e.g., 5 requests per 15 minutes per IP) tailored to expected usage patterns. Ensure appropriate proxy trust configuration exists in the main app to accurately track origin IPs.
