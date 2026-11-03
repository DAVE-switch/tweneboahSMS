# Tweneboah Koduah Royal Academy — School Management

The project is an early, local-first school records system for authorised school staff. It covers staff sign-in, the student register, permanent TK student IDs, editable student and guardian details, class promotion history, manual payment recording, student payment history and printable/shareable receipts.

## Run locally

Requirements: Node.js 22.13 or later. The backend uses Node's built-in SQLite support and creates `school.sqlite` in this folder the first time it starts. The React interface is built with Vite and Tailwind CSS.

Install the frontend packages once:

```powershell
npm install
```

Start the API server in one PowerShell window:

```powershell
npm start
```

Start the React and Tailwind development server in a second window:

```powershell
npm run dev
```

Open <http://localhost:5173>. The Vite server forwards `/api` requests to the backend at port 3002. If another program already uses port 3002, set the same alternate port for the backend and proxy (example):

```powershell
$env:PORT=3003; npm start
```

```powershell
$env:BACKEND_PORT=3003; npm run dev
```

## Access the database

The development database file is `school.sqlite` in the project folder. It is created and updated by the backend; use the app to change school data. To see which tables exist and how many rows each contains, run:

```powershell
npm run db:inspect
```

For a visual view of the schema and records, open `school.sqlite` in DB Browser for SQLite or another SQLite viewer. Do not edit production records directly in a database viewer, and do not put the file on a shared/network drive. The backend applies versioned schema changes at startup while preserving the existing student and payment records.

See [docs/database-guide.md](docs/database-guide.md) for the database path, table summary and how to inspect it visually.

The first backend run prints one-time passwords for the initial accounts (`director@twk.local` and `admin@twk.local`). Save the passwords from the backend terminal. They are salted and hashed in the database; the app does not print them again. The development interface is at <http://localhost:5173>. To change an account password, use the `users` table in the local SQLite database until the account management screen is built.

To build the frontend and serve it from the Node backend:

```powershell
npm run build
$env:PORT=3002; npm start
```

Then open <http://localhost:3002>.

The database is local and persistent. Back up `school.sqlite` regularly. Keep it out of shared or public folders because it contains children's personal and school fee records.

## Prepare MySQL for live hosting

The original SQLite setup remains available for local development. The MySQL 8 backend uses `server.mysql.js`; its Vercel function entry point is `api/[...path].js`. The schema is in `migrations/mysql-schema.sql`. Copy `.env.example` to `.env`, set `DATABASE_URL` and `MYSQL_SSL`, then run `npm run db:import:mysql` to create the MySQL schema and import the existing SQLite data. The importer refuses a non-empty target and leaves `school.sqlite` untouched. Start the MySQL version locally with `npm run start:mysql`.

Vercel hosts the app and API functions; MySQL must be provided by a separate managed database host. Do not add `.env` to source control or share its database credentials. The project has not been connected to a production database or deployed. Review [the live launch plan](docs/live-launch-plan.md) before moving school records online.

## Project files

- `server.js` — Node HTTP server, SQLite schema, session authentication, student/payment APIs and initial account creation.
- `server.mysql.js` — MySQL-backed version of the same API for hosting.
- `api/[...path].js` — Vercel serverless entry point for the MySQL API.
- `src/` — React school office screens and Tailwind CSS styles.
- `vite.config.mjs` — React/Tailwind build configuration and local API proxy.
- `migrations/002-school-structure.sql` — additive schema for classes, academic years, guardians, enrolments, status history, fees and invoices.
- `scripts/inspect-db.js` — read-only table and row-count summary.
- `scripts/migrate-sqlite-to-mysql.js` — guarded first import from SQLite to an empty MySQL database.
- `public/` — supplied school logo and other static assets.
- `docs/receipt-reference.jpg` — supplied receipt photograph used as the layout reference.
- `school.sqlite` — created automatically on first launch; do not commit live school data.

## Current scope

This is an initial usable foundation. Fee and invoice management screens, academic-year administration, payment reversals, report exports, user management and deployment hardening still need to be added before production use. The database records payments made by school staff; it does not connect to a bank or mobile-money gateway.
