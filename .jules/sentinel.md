## 2026-06-25 - Fix CWE-208 Timing Leak in MQTT Authentication
**Vulnerability:** The `timingSafeEqual` wrapper in src/config/aedes.js returned early if input lengths differed, exposing password lengths via timing attacks.
**Learning:** Using `crypto.timingSafeEqual` directly on inputs of different lengths causes an exception. Returning early avoids the exception but re-introduces the timing leak.
**Prevention:** Always hash both inputs (e.g., using SHA-256) before passing them to `crypto.timingSafeEqual` to guarantee equal lengths without leaking information.
