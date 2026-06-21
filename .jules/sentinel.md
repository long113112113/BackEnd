## 2025-02-15 - Fix CWE-208 Timing Leak in MQTT Auth
**Vulnerability:** Early return on buffer length mismatch in `timingSafeEqual` created a timing leak (CWE-208) allowing attackers to guess MQTT credential lengths.
**Learning:** Comparing lengths before using `crypto.timingSafeEqual` defeats its purpose.
**Prevention:** Always hash both inputs (e.g., SHA-256) before using `crypto.timingSafeEqual` to guarantee equal buffer lengths without leaking length information.
