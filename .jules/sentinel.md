## 2026-06-15 - Added Rate Limiter on Authentication Endpoint
**Vulnerability:** Missing rate limit on /api/auth/login endpoint
**Learning:** The application was not using rate-limiting, making it vulnerable to brute force and credential stuffing attacks.
**Prevention:** Apply rate-limiting middleware to sensitive endpoints such as authentication
