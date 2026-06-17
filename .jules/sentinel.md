## 2023-10-27 - Fix CWE-208 Timing Leak in timingSafeEqual
**Vulnerability:** Length comparison before `crypto.timingSafeEqual` creates a timing leak, revealing the length of secrets.
**Learning:** Returning early on length mismatch defeats the purpose of constant-time comparison, allowing attackers to infer secret lengths. Node.js `timingSafeEqual` requires equal length buffers, leading to exceptions if lengths mismatch, enabling DoS.
**Prevention:** Always hash both inputs (e.g., with SHA-256) before calling `timingSafeEqual`. This guarantees equal buffer lengths and prevents both timing attacks and DoS.
