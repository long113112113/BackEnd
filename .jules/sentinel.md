## 2026-06-06 - Rate Limiting Import Syntax
**Vulnerability:** Application crash due to incorrect CommonJS import syntax for express-rate-limit.
**Learning:** express-rate-limit v8+ uses named exports in CommonJS, requiring destructuring.
**Prevention:** Always use `const { rateLimit } = require('express-rate-limit');` in CommonJS environments.
