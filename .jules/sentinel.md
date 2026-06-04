## 2024-05-30 - [CWE-208: Length-Mismatch Timing Leak]
**Vulnerability:** Found crypto.timingSafeEqual used directly on user inputs of varying lengths, creating a timing leak (and unhandled exception DoS) via early length-mismatch checks.
**Learning:** Using `crypto.timingSafeEqual` requires lengths to match exactly. Comparing different lengths throws an exception or returns early. This can create a side-channel timing attack and cause application crashes.
**Prevention:** Always hash both inputs before comparing them with `crypto.timingSafeEqual` to guarantee they have identical lengths, or use a constant-time comparison that handles different lengths.
