# Finding the school database

## What is the database?

The backend is the program in `server.js`. The database is the file `school.sqlite` in the project folder. The backend reads and writes that file when staff use the school system.

Current file:

```text
C:\Users\AYOMIDE\Documents\ChatGPT\tkcollection\school.sqlite
```

The database is not a web page. It is a local SQLite file. The app's database migration runs when the backend starts and records completed migrations in `schema_migrations`.

## Quick table summary

Open PowerShell in the project folder and run:

```powershell
npm run db:inspect
```

This prints the table names and row counts without showing private student or payment details. To review the table columns, relationships and records visually, install [DB Browser for SQLite](https://sqlitebrowser.org/) from its official website, choose **Open Database**, and select `school.sqlite`. Use **Database Structure** to see tables and **Browse Data** to view rows.

Avoid manually changing school data or schema in a database viewer. Make changes through the app or through a reviewed migration so that records and relationships stay consistent. Keep regular backups of `school.sqlite`, and do not put it on a network share for multiple computers to open directly.

## Tables added for the next backend stage

- `classes` and `academic_years` hold reusable school terms.
- `enrollments` preserves a student's class placement over time.
- `guardians` and `student_guardians` support more than one guardian per student.
- `student_status_history` records status changes and who made them.
- `fee_structures`, `invoices`, and `invoice_items` prepare the system for configured fees and balances.
- `payments.invoice_id` can link a payment to an invoice.

The additions are in `migrations/002-school-structure.sql`. The migration keeps the original student and payment tables and adds the related tables. Existing student class, year, and guardian details are carried into the new relationships when present.

## See the interface changes

The React interface source is in `src/App.jsx` and `src/styles.css`. Once dependencies install successfully, run the backend with `npm start` and the frontend with `npm run dev` in separate PowerShell windows. Open `http://localhost:5173`.
