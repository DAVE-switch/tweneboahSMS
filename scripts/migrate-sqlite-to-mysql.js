const fs = require('node:fs/promises');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const mysql = require('mysql2/promise');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = process.env.SQLITE_PATH || path.join(ROOT, 'school.sqlite');
const DATABASE_URL = process.env.DATABASE_URL;
const TABLES = [
  'users', 'classes', 'academic_years', 'students', 'guardians', 'student_guardians',
  'enrollments', 'student_status_history', 'fee_structures', 'invoices', 'invoice_items',
  'payments', 'receipts', 'audit_logs',
];

function poolFromUrl(value) {
  if (!value) throw new Error('Set DATABASE_URL in the environment or local .env file before migrating.');
  const url = new URL(value);
  if (!['mysql:', 'mysql2:'].includes(url.protocol)) throw new Error('DATABASE_URL must use the mysql:// scheme.');
  return mysql.createPool({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    waitForConnections: true,
    connectionLimit: 4,
    queueLimit: 0,
    decimalNumbers: true,
    dateStrings: true,
    timezone: 'Z',
    ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  });
}

async function createSchema(pool) {
  const schema = await fs.readFile(path.join(ROOT, 'migrations', 'mysql-schema.sql'), 'utf8');
  for (const statement of schema.split(';').map(x => x.trim()).filter(Boolean)) await pool.query(statement);
}

async function main() {
  const source = new DatabaseSync(SOURCE, { readOnly: true });
  const pool = poolFromUrl(DATABASE_URL);
  try {
    console.log(`Source SQLite file: ${SOURCE}`);
    console.log('Creating MySQL tables from migrations/mysql-schema.sql…');
    await createSchema(pool);

    const existing = {};
    for (const table of TABLES) {
      const [rows] = await pool.execute(`SELECT COUNT(*) AS n FROM \`${table}\``);
      existing[table] = Number(rows[0].n);
    }
    const nonEmpty = Object.entries(existing).filter(([, count]) => count > 0);
    if (nonEmpty.length) {
      throw new Error(`Import stopped because the MySQL database already contains records: ${nonEmpty.map(([table,count]) => `${table} (${count})`).join(', ')}. Use a clean target database for the initial import.`);
    }

    const sourceTables = new Set(source.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(row => row.name));
    const connection = await pool.getConnection();
    const counts = {};
    try {
      await connection.beginTransaction();
      for (const table of TABLES) {
        if (!sourceTables.has(table)) { counts[table] = 0; continue; }
        const rows = source.prepare(`SELECT * FROM \`${table}\``).all();
        counts[table] = rows.length;
        if (!rows.length) continue;
        const columns = Object.keys(rows[0]);
        const names = columns.map(column => `\`${column}\``).join(',');
        const placeholders = columns.map(() => '?').join(',');
        const insert = `INSERT INTO \`${table}\` (${names}) VALUES (${placeholders})`;
        for (const row of rows) {
          const values = columns.map(column => {
            const value = row[column];
            // SQLite stores receipt timestamps as ISO strings; MySQL DATETIME expects a space separator and no Z suffix.
            if (table === 'receipts' && column === 'issued_at' && typeof value === 'string') return value.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace(/Z$/, '');
            return value;
          });
          await connection.execute(insert, values);
        }
      }
      await connection.execute(`INSERT INTO schema_migrations(version) VALUES(?)`, ['mysql-initial-import']);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }

    console.log('Import complete. Row counts:');
    for (const [table, count] of Object.entries(counts)) console.log(`  ${table.padEnd(26)} ${count}`);
    console.log('The SQLite source was left unchanged. Keep its backup until the MySQL app has been checked.');
  } finally {
    source.close();
    await pool.end();
  }
}

main().catch(error => { console.error(`MySQL migration failed: ${error.message}`); process.exitCode = 1; });
