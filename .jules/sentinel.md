## 2024-05-24 - Fix CWE-208 Timing Leak in Aedes MQTT Auth
**Vulnerability:** A timing attack (CWE-208) existed in `aedes.js`'s custom `timingSafeEqual` function due to returning early when password lengths didn't match.
**Learning:** Developers sometimes add early returns for length mismatches to prevent Node.js's `crypto.timingSafeEqual` from throwing errors on unequal buffer lengths, unaware this introduces a timing leak revealing the secret's length.
**Prevention:** Always hash both inputs (e.g. SHA-256) before passing them to `timingSafeEqual`, ensuring buffers are always identically sized without revealing any length metadata to attackers.
