## 2026-07-04 - [Missing Rate Limiting on Authentication Endpoints]
**Vulnerability:** No rate limiting was present on the `/login` and `/refresh` endpoints.
**Learning:** This exposes the application to brute-force attacks and credential stuffing.
**Prevention:** Implement rate limiting middleware for all sensitive authentication routes using standard libraries like `express-rate-limit`.
