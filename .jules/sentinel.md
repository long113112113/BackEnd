## 2024-05-18 - [Fix CWE-208 Timing Leak in aedes authentication]
**Vulnerability:** A CWE-208 timing leak existed in `src/config/aedes.js` because `timingSafeEqual` returned early if input lengths mismatched.
**Learning:** Checking lengths prior to `crypto.timingSafeEqual` (or allowing mismatched lengths to throw exceptions) can allow attackers to infer credential lengths via timing analysis or cause DoS via unhandled exceptions.
**Prevention:** Always hash both inputs (e.g., using SHA-256) prior to `crypto.timingSafeEqual`. This guarantees inputs are always of equal length, avoiding early returns and preventing timing side channels.
