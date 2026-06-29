## 2024-06-29 - Missing Rate Limiting on Login Endpoint
**Vulnerability:** The `/api/auth/login` endpoint lacked rate limiting, exposing the application to brute-force attacks and credential stuffing.
**Learning:** Security controls like rate limiting are often overlooked for individual endpoints in REST APIs.
**Prevention:** Implement endpoint-specific rate limiting (e.g., using `express-rate-limit`) for all authentication and sensitive operations.
