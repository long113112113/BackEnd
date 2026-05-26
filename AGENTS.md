# AGENTS.md - IoT Attendance Backend

Backend for automatic attendance tracking via ESP32 + NFC/RFID. Runs an Express web server and an embedded Aedes MQTT broker concurrently in the same process.

## Quick Start

```bash
npm start          # Production (node server.js)
npm run dev        # Development (watches src/ and .env, auto-restarts)
npm test           # Run test suite once (vitest run)
npm run test:watch # Run tests in watch mode (vitest)
```

## Project Conventions

- **CommonJS only** (`require`/`module.exports`). `package.json` sets `"type": "commonjs"`. Do NOT use `import`/`export`, except the `Aedes` library which is ESM-only and loaded via dynamic `await import('aedes')` in `src/config/aedes.js`.
- **Password hashing uses argon2**, NOT bcrypt. (The old AGENTS was wrong about this.)
- **No registration endpoint**: `POST /api/auth/register` returns 404. Admins are created only via the seed script (`src/utils/seedAdmin.js`) using `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` from `.env`.
- **Authentication accepts both cookie AND Bearer header**. JWT is stored in an `httpOnly`, `SameSite=Strict` cookie, but the auth middleware also checks the `Authorization: Bearer <token>` header.
- **Test suite**: 13 test files under `tests/`. Vitest config (`vitest.config.js`) is ESM (uses `import` syntax) even though the app is CJS. Tests run serially (`maxConcurrency: 1`, `fileParallelism: false`). Test setup (`tests/setup.js`) initializes the DB, cleans all tables, and re-seeds the admin account before each suite.
- **.env is gitignored**. Keep a template or document vars elsewhere.

## Architecture

```
server.js                    # Entry point: dotenv → initDB → seedAdmin → seedDevices → MQTT broker → Express listen
  ├── src/app.js             # Express app: helmet, CORS, cookieParser, morgan, JSON body limit (10kb), routes
  ├── src/config/
  │   ├── index.js           # port, nodeEnv, clientOrigins, jwt config
  │   ├── db.js              # pg Pool (Neon PostgreSQL, SSL via DATABASE_URL)
  │   ├── aedes.js           # Embedded MQTT broker (Aedes) with authentication & ACL
  │   └── mqtt.js            # Internal MQTT client subscribing to scan/status topics
  ├── src/routes/            # Route definitions: auth, students, attendance, unknown-cards, device-keys
  ├── src/controllers/       # Request handlers (auth, student, attendance, unknownCard, deviceKey)
  ├── src/models/            # DB queries + table creation (user, student, attendance, unknownCard, deviceKey)
  ├── src/middlewares/        # auth (JWT), error (centralized handler), validate (express-validator)
  ├── src/validations/       # express-validator chains (auth, student, attendance, unknownCard, deviceKey)
  ├── src/services/          # mqtt.handler.js — core card-swipe processing logic
  ├── src/utils/
  │   ├── initDb.js          # Auto-creates all tables on startup
  │   ├── seedAdmin.js       # Creates default admin from .env if users table is empty
  │   ├── seedDevices.js     # Provisions device HMAC keys from DEVICE_HMAC_KEYS env var
  │   ├── crypto.js          # HMAC-SHA256, AES-256-GCM encrypt/decrypt, nonce replay protection, seq verification
  │   └── pick.js            # Utility: filters object to given keys
  └── tests/                 # Vitest test suite (13 files, serial execution)
```

## Database

- Neon PostgreSQL (serverless). SSL configured via DATABASE_URL.
- Tables are **auto-created** on startup by `initDb.js`. No migrations needed.
- Tables: `users`, `students`, `attendance_records`, `unknown_cards`, `device_keys`.
- SSL: set `DB_SSL_REJECT_UNAUTHORIZED=false` in `.env` if the connection string doesn't include `sslmode`.
- The `device_keys` table stores `device_id`, `hmac_key`, `last_seq` (for anti-replay).

## MQTT Security (Critical)

The old AGENTS described plain JSON messages. The actual system uses **end-to-end encryption**:

1. **Device provisioning**: Each ESP32 device has a unique HMAC key stored in `DEVICE_HMAC_KEYS` env var (format: `DEVICE_ID:HEX_KEY,DEVICE_ID2:HEX_KEY2`). Seeded into `device_keys` table on startup.
2. **Encrypted payloads**: ESP32 must AES-256-GCM encrypt its inner payload using a key derived from the HMAC key via HMAC-SHA256 with domain separator `attendance-aes-gcm-v1`.
3. **Inner payload** (after decrypt): `{ card_uid, nonce, seq, hmac }`.
4. **HMAC verification**: Server computes `HMAC-SHA256(key, device_id + card_uid + nonce + seq)` and compares via `timingSafeEqual`.
5. **Nonce replay protection**: 32-char nonces stored in memory, TTL 60 seconds.
6. **Seq monotonic counter**: Prevents message reordering; supports NVS reset recovery (gap > 1000 treated as reset).
7. **Result encryption**: All result messages back to ESP32 are AES-256-GCM encrypted.

### MQTT Topics

- `hutech_lms/attendance/scan` — ESP32 → Server (encrypted scan payload)
- `hutech_lms/attendance/result/{device_id}` — Server → ESP32 (per-device result, encrypted)
- `hutech_lms/device/status` — ESP32 → Server (health/status, plaintext)

### MQTT Auth & ACL

- Two credential pairs: `MQTT_USERNAME`/`MQTT_PASSWORD` for ESP32 devices, `MQTT_INTERNAL_USERNAME`/`MQTT_INTERNAL_PASSWORD` for the internal client.
- ESP32 clients can only subscribe to their own result topic (`hutech_lms/attendance/result/{their_client_id}`).
- ESP32 clients cannot publish to result topics.

## Attendance Processing Flow

1. ESP32 publishes encrypted payload to `hutech_lms/attendance/scan`.
2. `mqtt.handler.js` decrypts, verifies HMAC → nonce → seq.
3. Looks up student by `card_uid` → if unknown, upserts `unknown_cards` → returns `status: "unknown"`.
4. If student found but already checked in today → returns `status: "duplicate"`.
5. Otherwise creates `attendance_records` row → returns `status: "success"` with student info.
6. All results published to `hutech_lms/attendance/result/{device_id}`, encrypted.

## API Endpoints

All routes except `/api/health` and `/api/auth/login` require auth (cookie or Bearer token).

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/auth/login` | Returns JWT in httpOnly cookie + response body |
| POST | `/api/auth/logout` | Clears cookie |
| GET | `/api/auth/me` | Current user info |
| GET | `/api/students` | All active students |
| GET | `/api/students/:id` | Student by ID |
| POST | `/api/students` | Create student |
| PUT | `/api/students/:id` | Update student |
| DELETE | `/api/students/:id` | Soft delete (is_active=false) |
| GET | `/api/attendance?date=YYYY-MM-DD` | Logs by date, defaults to today |
| GET | `/api/attendance/stats` | Daily stats (30 days) |
| GET | `/api/attendance/student/:id` | Attendance by student_id |
| GET | `/api/unknown-cards` | List unknown cards |
| DELETE | `/api/unknown-cards/:cardUid` | Remove unknown card |
| GET | `/api/device-keys` | List provisioned devices (hmac_key hidden) |
| POST | `/api/device-keys` | Provision single device key |
| POST | `/api/device-keys/batch` | Provision multiple device keys |
| DELETE | `/api/device-keys/:deviceId` | Remove device key |
| GET | `/api/health` | Health check (no auth) |
| GET | `/` | Server status and endpoint summary |

## Environment Variables

```ini
NODE_ENV=development
PORT=3000
CLIENT_ORIGIN=http://localhost:5173,http://localhost:3000
DATABASE_URL=postgresql://...     # Neon, includes SSL params
DB_SSL_REJECT_UNAUTHORIZED=false  # Set if DATABASE_URL lacks sslmode
JWT_SECRET=...
JWT_EXPIRES_IN=7d
MQTT_PORT=1883
MQTT_TOPIC_PREFIX=hutech_lms
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=esp32_device
MQTT_PASSWORD=esp32_secret_2026
MQTT_INTERNAL_USERNAME=internal_broker
MQTT_INTERNAL_PASSWORD=internal_broker_secret_2026
DEVICE_HMAC_KEYS=ESP32_XXXX:hexkey,...
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin123
```

## Gotchas

- **Vitest config is ESM** despite the app being CommonJS. Don't convert it to CJS.
- **Tests need a real PostgreSQL database** (Neon). They assume the DATABASE_URL in `.env` is valid.
- **Tests run serially** — they share a DB and clean tables between suites. Do not parallelize them.
- **`aedes` is dynamically imported** — it's the only ESM dependency. Import it with `const { Aedes } = await import('aedes')`.
- **Express v5** — error handling signature is `(err, req, res, next)`. Routes use `express.Router()`.
- **Body limit**: JSON and URL-encoded bodies are capped at 10kb in `app.js`.
- **Cookie + Bearer dual auth**: The auth middleware checks `req.cookies.token` first, then falls back to `Authorization: Bearer` header.
- **Admin seed is conditional**: Only runs if the `users` table is empty. To re-seed, manually delete all users first.
