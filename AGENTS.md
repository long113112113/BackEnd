# AGENTS.md - IoT Attendance Backend

The backend system handles automatic attendance tracking through IoT devices (ESP32 + NFC/RFID). The system integrates an Express Web Server and an Embedded MQTT Broker (Aedes) running concurrently within the same application.

## 🚀 Quick Start

Start the application:
```bash
npm start          # Production (runs server.js)
npm run dev        # Development (uses Node.js built-in --watch feature)
```

## 📂 Project Structure

```text
d:\PJ\BackEnd\
├── server.js               # Application entry point (Initializes DB, MQTT Broker, Express Server)
├── package.json            # Project configuration & dependencies (Express v5, Aedes v1, pg v8, mqtt v5)
├── AGENTS.md               # Instruction manual for AI Agents / Developers
├── .env                    # Environment configuration (Database, Ports, JWT Secrets)
└── src/
    ├── config/             # System configuration
    │   ├── index.js        # Global configuration (Port, Node Env, JWT Secret)
    │   ├── db.js           # Neon PostgreSQL Pool connection (SSL required)
    │   ├── aedes.js        # Configuration & control of the Embedded MQTT Broker (Aedes)
    │   └── mqtt.js         # Internal MQTT Client connecting to Broker for pub/sub
    ├── routes/             # API Routing
    │   ├── index.js        # Aggregates all router branches & API Health check
    │   ├── auth.routes.js  # Admin authentication routes (/api/auth/*)
    │   ├── student.routes.js # Student information CRUD (/api/students/*)
    │   ├── attendance.routes.js # Attendance data retrieval & statistics (/api/attendance/*)
    │   └── unknownCard.routes.js # Manage cards not registered in the system (/api/unknown-cards/*)
    ├── controllers/        # API business logic controllers
    │   ├── auth.controller.js
    │   ├── student.controller.js
    │   ├── attendance.controller.js
    │   └── unknownCard.controller.js
    ├── models/             # Schema definitions & SQL queries (PostgreSQL)
    │   ├── user.model.js        # `users` table (Admin/Teacher accounts)
    │   ├── student.model.js     # `students` table (Student info & card UID)
    │   ├── attendance.model.js  # `attendance_records` table (Attendance history)
    │   └── unknownCard.model.js # `unknown_cards` table (Unregistered cards scanned)
    ├── middlewares/        # Express Middlewares
    │   ├── auth.middleware.js   # JWT token authentication via Bearer header
    │   └── error.middleware.js  # Centralized error handling & 404 Route
    ├── services/           # Business support services
    │   └── mqtt.handler.js # Central logic handling card swipes from MQTT
    └── utils/
        └── initDb.js       # Auto-initialization of database tables on startup
```

## 🏗️ Architecture & Flow

The system runs on two parallel mechanisms:
1. **REST HTTP API**: For the Web Admin interface (login, student directory management, viewing attendance statistics).
2. **MQTT Event Loop**: Communicating directly with the ESP32 hardware devices.

```text
               +-----------------------------------------+
               |                server.js                |
               +----+-------------------------------+----+
                    |                               |
                    v (HTTP REST)                   v (MQTT TCP 1883)
             +--------------+                +-------------+
             |  Express JS  |                | Aedes Broker|
             +------+-------+                +------+------+
                    |                               |
                    v (Routing)                     v (Pub/Sub)
             +--------------+                +-------------+
             | src/routes/  |                | mqtt.js &   |
             |  Controller  |                | mqtt.handler|
             +------+-------+                +------+------+
                    |                               |
                    +---------------+---------------+
                                    |
                                    v
                            +---------------+
                            | Models (db.js)|
                            +-------+-------+
                                    |
                                    v
                           [ Neon PostgreSQL ]
```

### Attendance Processing Flow via MQTT:
1. The ESP32 device scans an NFC card and publishes a JSON payload of the form `{ "card_uid": "...", "device_id": "..." }` to the topic `hutech_lms/attendance/scan`.
2. `src/services/mqtt.handler.js` receives the message and executes:
   * **Card Lookup**: Finds the student with the corresponding `card_uid` in the `students` table (must be active).
   * **Unregistered Card case**: If not found, stores the card in the `unknown_cards` table (increments `seen_count` and updates the latest scan timestamp). It also publishes the result `{ "status": "unknown", "card_uid": "...", ... }` back to the topic `hutech_lms/attendance/result`.
   * **Duplicate Swipe case**: If the student has already checked in today (`hasCheckedInToday`), ignores and publishes status `duplicate` to `hutech_lms/attendance/result`.
   * **Success case**: Creates a new attendance record in `attendance_records` with status `present`. Publishes status `success` along with the student's personal information back to `hutech_lms/attendance/result` for the device to display on the LCD screen.

## 💾 Database Schema

PostgreSQL tables are automatically created when the project starts (`src/utils/initDb.js` invokes `.createTable()` on the models):

### 1. `users` (Admin Accounts)
* `id`: SERIAL (PK)
* `username`: VARCHAR(50) (UNIQUE, NOT NULL)
* `email`: VARCHAR(100) (UNIQUE, NOT NULL)
* `password`: VARCHAR(255) (NOT NULL, bcrypt encrypted)
* `full_name`: VARCHAR(100)
* `role`: VARCHAR(20) (Default: `'admin'`)
* `is_active`: BOOLEAN (Default: `true`)
* `created_at` / `updated_at`: TIMESTAMP

### 2. `students` (Student Information)
* `id`: SERIAL (PK)
* `student_id`: VARCHAR(20) (UNIQUE, NOT NULL) - Student ID (MSSV)
* `full_name`: VARCHAR(100) (NOT NULL)
* `class`: VARCHAR(50) - Class name
* `card_uid`: VARCHAR(50) (UNIQUE) - NFC card UID
* `email`: VARCHAR(100)
* `phone`: VARCHAR(20)
* `avatar_url`: TEXT
* `is_active`: BOOLEAN (Default: `true`)
* `created_at` / `updated_at`: TIMESTAMP

### 3. `attendance_records` (Attendance Log)
* `id`: SERIAL (PK)
* `student_id`: INTEGER (FK -> `students.id`)
* `card_uid`: VARCHAR(50) (NOT NULL)
* `check_in_time`: TIMESTAMP (Default: `CURRENT_TIMESTAMP`)
* `device_id`: VARCHAR(50) - Scanner device ID
* `status`: VARCHAR(20) (Default: `'present'`)
* `note`: TEXT
* `created_at`: TIMESTAMP

### 4. `unknown_cards` (Unregistered Cards)
* `id`: SERIAL (PK)
* `card_uid`: VARCHAR(50) (UNIQUE, NOT NULL)
* `device_id`: VARCHAR(50)
* `first_seen`: TIMESTAMP (Default: `CURRENT_TIMESTAMP`)
* `seen_count`: INTEGER (Default: `1`)
* `latest_seen`: TIMESTAMP

## 📡 MQTT Broker & Topics

* **Default port**: `1883`
* **Broker URL**: `mqtt://localhost:1883` (Embedded directly in the server via Aedes)
* **Topic prefix**: `hutech_lms` (Customizable via `.env`)

### Topics Definitions:
1. `hutech_lms/attendance/scan`: Listens to NFC card swipe messages from the ESP32 device.
   * *Sample Payload*: `{"card_uid": "A1B2C3D4", "device_id": "ESP32-ROOM102"}`
2. `hutech_lms/attendance/result`: Server responds back to the device to display the result.
   * *Success Payload*: `{"status": "success", "name": "Nguyen Van A", "mssv": "201106xxxx", "class": "20DTHx1", "card_uid": "...", "device_id": "..."}`
   * *Duplicate Payload*: `{"status": "duplicate", "name": "...", "mssv": "...", "class": "...", "card_uid": "...", "device_id": "..."}`
   * *Unknown Payload*: `{"status": "unknown", "card_uid": "...", "device_id": "...", "message": "The chua dang ky"}`
   * *Error Payload*: `{"status": "error", "message": "Server Error"}`
3. `hutech_lms/device/status`: Receives health / connection status from the ESP32 device.

## 🔌 API Endpoints

All API routes except registration/login and health check require the following header: `Authorization: Bearer <JWT_TOKEN>`.

### 1. Authentication (`/api/auth`)
* `POST /api/auth/register` - Registers a new Admin account.
* `POST /api/auth/login` - Logs in and receives a JWT Token.
* `GET /api/auth/me` - Retrieves information about the currently logged-in account.

### 2. Student Directory (`/api/students`)
* `GET /api/students` - Retrieves all active students.
* `GET /api/students/:id` - Retrieves details of a specific student by ID.
* `POST /api/students` - Creates a new student record.
* `PUT /api/students/:id` - Updates a student's information.
* `DELETE /api/students/:id` - Deletes a student (Soft delete - sets `is_active` to `false`).

### 3. Attendance Logs (`/api/attendance`)
* `GET /api/attendance` - Retrieves attendance logs by date (queried via query string `?date=YYYY-MM-DD`, defaults to today).
* `GET /api/attendance/stats` - Retrieves daily attendance count statistics (up to 30 days back).
* `GET /api/attendance/student/:id` - Retrieves all attendance logs for a specific student using their `student_id`.

### 4. Unregistered Cards Management (`/api/unknown-cards`)
* `GET /api/unknown-cards` - Lists unregistered cards scanned into the system.
* `DELETE /api/unknown-cards/:cardUid` - Deletes an unregistered card from the list.

### 5. General System (`/api`)
* `GET /` - Root index page, returns server status and a summary of API branches.
* `GET /api/health` - Health check endpoint returning `success: true` and the current `timestamp`.

## ⚙️ Environment Variables (`.env`)

```ini
PORT=3000                 # Express HTTP server port
NODE_ENV=development      # Running environment (development | production)
DATABASE_URL=postgres://... # Neon PostgreSQL connection URL (SSL must be enabled)
JWT_SECRET=your_jwt_secret_key # Secret key used to sign & verify JWTs
JWT_EXPIRES_IN=7d         # JWT Token lifetime (e.g., 7d, 24h)
MQTT_PORT=1883            # TCP port running the Aedes MQTT broker
MQTT_TOPIC_PREFIX=hutech_lms # Prefix for MQTT topics
MQTT_BROKER_URL=mqtt://localhost:1883 # Internal client connection URL to the Broker
```

## ⚠️ Critical Gotchas & Developer Notes

* **CommonJS Only**: The project is written entirely in CommonJS (`require` / `module.exports`). Do NOT use ES Modules syntax (`import` / `export`), except for the `aedes` library which is loaded dynamically via `await import('aedes')` in `src/config/aedes.js` because Aedes v1+ is ESM-only.
* **Neon PostgreSQL Database**: Requires SSL configuration in the PG client (configured with `ssl: { rejectUnauthorized: false }`).
* **Auto-created Database Schema**: Tables are automatically initialized upon server start (`initDb.js`). No manual migration is needed.
* **No Automated Test Suite**: Manual testing is conducted via REST Client tools (like Postman/Insomnia/Thunder Client) or directly using the hardware device or an MQTT simulator client (such as MQTTX).
