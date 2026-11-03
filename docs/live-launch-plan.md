# Live launch plan

The app now has a Vercel serverless API, a MySQL backend, and a one-time importer for the existing local SQLite records. The school database has not been connected or moved: no database credentials are configured in this project.

## 1. Choose the live hosting

Vercel will host the React app and Node API functions. Vercel does not itself provide the MySQL database for this project, so choose a separate managed MySQL 8 host that provides:

- MySQL 8.x with encrypted connections and automated backups.
- A pooled connection URL that can be reached from Vercel functions, TLS, and automated backups.
- A private staff-only URL and a domain the school controls for Vercel.

Keep the database private; only the app server should be allowed to connect. Do not use a public database endpoint without access restrictions.

**Recommended fit:** TiDB Cloud Serverless. It is listed as a Vercel integration and offers a MySQL-compatible SQL interface; the current backend already uses the `mysql2` driver. Install the TiDB integration for the Vercel project, create/select a cluster, and use its `TIDB_*` environment values. The API also accepts those variables directly. Check the selected cluster's region and backup/retention options before putting real student records there.

## 2. Prepare and migrate

1. Make a dated backup copy of `school.sqlite` and keep the original unchanged.
2. Create an empty MySQL-compatible database and restricted app user on the chosen database host.
3. Copy `.env.example` to `.env` for local migration, and set `DATABASE_URL` and `MYSQL_SSL` using the provider's values. Never commit `.env` or send its credentials in chat.
4. Run `npm run db:import:mysql` with a `DATABASE_URL` for the empty database. It creates the schema and stops if the target already contains records. Review the printed table counts and compare them with `npm run db:inspect`.
5. Keep the local SQLite file as a rollback copy until the hosted app has been checked against the imported students, guardians, payments, and receipts.

The import preserves existing user password hashes and data. It does not delete or modify `school.sqlite`. If the production database is already populated, stop and plan a deliberate merge; do not rerun the importer against it.

## 3. Deploy the app

1. Push the project to the school’s GitHub repository and connect that repository in Vercel. Vercel can then create preview deployments for changes and deploy the selected production branch automatically.
2. Set the Vercel framework to Vite, build command to `npm run build`, and output directory to `dist`; the project includes a Vercel function for `/api/*` and an SPA rewrite for client-side pages.
3. Add `DATABASE_URL`, `MYSQL_SSL=true` (if required by the provider), and `MYSQL_CONNECTION_LIMIT=3` as private Vercel environment settings for Production and Preview as appropriate. Never expose these as `VITE_*` variables.
4. Deploy the production branch. Vercel serves the frontend and invokes the MySQL API through Node functions.
5. Add the school domain and HTTPS in Vercel, then verify login, student profile and class update, payment recording, receipt print/share, logout, and re-login.
6. Give access only to named school staff. Set strong unique account passwords before real records are entered.

The app currently creates random first-login credentials if the MySQL database has no users; capture them from the private deployment logs immediately. When importing the current SQLite database, its existing user accounts are imported instead.

## 4. Operate it safely

- Enable automated daily database backups and periodically confirm a restore works.
- Decide who can create staff accounts and reset passwords; the user management screen is not built yet.
- Review access, retention, and consent procedures for children's personal information before using it with families.
- Record payments manually. The app does not yet reconcile bank or mobile money transactions.
- Keep a named owner for updates, backups, staff access, and incident response.

## Still needed from the school

The GitHub repository URL is now known. To publish, the repository still needs to be connected and receive the project commit. We also need to create the TiDB cluster (or choose another MySQL host), import the local records, and configure its credentials directly in Vercel's encrypted environment settings. Do not put real passwords or database URLs in project files or chat.
