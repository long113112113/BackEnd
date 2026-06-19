## 2024-06-19 - [Missing Rate Limiter]
**Vulnerability:** Missing rate limiting on the sensitive endpoint `api/auth/login`.
**Learning:** This exposes the application to brute-force attacks and credential stuffing.
**Prevention:** Implement express-rate-limit middleware for all sensitive endpoints, particularly authentication ones.
