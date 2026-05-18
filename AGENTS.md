# AGENTS.md - IoT Attendance Backend

## Quick Start
```bash
npm start          # Production
npm run dev        # Dev with auto-reload
```

## Architecture
```
server.js → src/config/ → src/routes/ → src/controllers/ → src/models/
                ↓
         src/services/mqtt.handler.js (attendance logic)
```

## Critical Gotchas
- **CommonJS only** - uses `require()`, NOT `import/export`
- **Neon PostgreSQL** - requires SSL; tables auto-created on startup
- **Embedded Aedes MQTT broker** on port 1883
- **ESP32 topics**: `hutech_lms/attendance/scan` → `result`
- **No test suite** - manual API testing only

## API Endpoints
- `POST /api/auth/register`, `/api/auth/login`
- `GET /api/auth/me` (requires `Authorization: Bearer <token>`)
- CRUD `/api/students/*`, `/api/attendance/*`
- `GET /api/health`

## Environment (.env)
`DATABASE_URL`, `PORT=3000`, `MQTT_PORT=1883`, `JWT_SECRET`
