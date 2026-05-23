## 2024-05-23 - Express Error Handler Information Disclosure
**Vulnerability:** The default global error handler in `src/middlewares/error.middleware.js` was passing `err.message` directly to the client response, even for HTTP 500 internal server errors.
**Learning:** In production environments, internal error messages (like database query failures) can leak sensitive information such as table names, syntax, or internal logic.
**Prevention:** Always mask `err.message` for 500 status codes in non-development environments, sending a generic "Internal server error" to the client instead, while keeping the full error message in the server logs.
