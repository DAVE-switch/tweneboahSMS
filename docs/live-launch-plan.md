# Live launch plan

The project is prepared for Vercel with Neon PostgreSQL. The GitHub repository has the app code, but no production database has been connected and no school records have been moved online.

## 1. Connect Neon

1. Create or select a Neon project. Choose a region reasonably close to the Vercel function region to reduce request delay.
2. Keep two connection strings: the pooled URL for the running app, and the direct URL for the one-time data import.
3. Connect the Neon project to Vercel using the Neon integration, or add `DATABASE_URL` and `DATABASE_URL_UNPOOLED` directly as encrypted Vercel environment variables. Never expose them with a `VITE_` prefix.

The app uses `pg` and Neon's standard PostgreSQL connection strings. Vercel's pool helper is attached to its PostgreSQL pool to close idle connections cleanly when function instances suspend.

## 2. Import the school's local data

1. Make a dated backup of `school.sqlite`; keep the original unchanged.
2. Set `DATABASE_URL_UNPOOLED` in `.env` to the direct Neon connection string. `DATABASE_URL` can also be used by the importer if the direct variable is not set.
3. Run `npm run db:import:neon`. It creates the PostgreSQL schema and refuses to import if the target already contains records.
4. Compare the printed row counts with `npm run db:inspect`. Keep the SQLite backup until you have checked students, guardians, payments, and receipts in Neon and through the app.

The importer preserves IDs, password hashes, relationships, and the original SQLite file. If the Neon target already contains data, stop and plan a deliberate merge; do not rerun the initial importer against it.

## 3. Deploy from GitHub to Vercel

1. In Vercel, import `DAVE-switch/tweneboahSMS` and select `master` as the production branch.
2. Use Vite's defaults: build command `npm run build`, output directory `dist`. The repository includes a Vercel function for `/api/*` and an SPA rewrite for page routes.
3. Add the pooled Neon connection string as `DATABASE_URL` for Production and Preview as needed. If the Neon integration injects it automatically, verify it is present in Vercel's project environment settings.
4. Deploy the production branch. New pushes to that branch can deploy automatically; other branches and pull requests can receive preview deployments.
5. Add the school's domain and check login, student details/class promotion, payment history, receipt print/share, logout, and re-login.

The SQLite import brings the existing staff accounts into Neon. Keep their current passwords only if they are strong and unique; otherwise reset them before staff use the live site.

## 4. Operate it safely

- Enable and periodically verify database backups/restore for the selected Neon plan.
- Restrict access to named school staff and decide who can reset accounts; the user management screen is not built yet.
- Review access, retention, and consent procedures for children's personal information before using the site with families.
- Payments are recorded manually; the app does not connect to a bank or mobile-money gateway.
- Keep a named owner for updates, backups, staff access, and incident response.
