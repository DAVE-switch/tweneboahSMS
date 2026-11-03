const fs = require('node:fs/promises');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { Pool } = require('pg');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = process.env.SQLITE_PATH || path.join(ROOT, 'school.sqlite');
const DATABASE_URL = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const TABLES = [
  'users', 'classes', 'academic_years', 'students', 'guardians', 'student_guardians',
  'enrollments', 'student_status_history', 'fee_structures', 'invoices', 'invoice_items',
  'payments', 'receipts', 'audit_logs',
];
const BOOLEAN_COLUMNS = new Set([
  'classes.is_active', 'academic_years.is_current', 'student_guardians.is_primary',
  'student_guardians.is_emergency_contact', 'fee_structures.is_active',
]);
const ID_TABLES = TABLES.filter(table => !['student_guardians'].includes(table));

async function createSchema(pool) {
  const schema = await fs.readFile(path.join(ROOT, 'migrations', 'neon-schema.sql'), 'utf8');
  for (const statement of schema.split(';').map(part => part.trim()).filter(Boolean)) await pool.query(statement);
}

async function main() {
  if (!DATABASE_URL) throw new Error('Set DATABASE_URL (or DATABASE_URL_UNPOOLED for migrations) before importing.');
  const source = new DatabaseSync(SOURCE, { readOnly: true });
  const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  try {
    console.log(`Source SQLite file: ${SOURCE}`);
    console.log('Creating PostgreSQL tables from migrations/neon-schema.sql…');
    await createSchema(pool);

    const existing = {};
    for (const table of TABLES) {
      const result = await pool.query(`SELECT COUNT(*) AS n FROM "${table}"`);
      existing[table] = Number(result.rows[0].n);
    }
    const nonEmpty = Object.entries(existing).filter(([, count]) => count > 0);
    if (nonEmpty.length) throw new Error(`Import stopped because the Neon database already contains records: ${nonEmpty.map(([table, count]) => `${table} (${count})`).join(', ')}. Use a clean target branch/database for the initial import.`);

    const sourceTables = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    const client = await pool.connect();
    const counts = {};
    try {
      await client.query('BEGIN');
      for (const table of TABLES) {
        if (!sourceTables.has(table)) { counts[table] = 0; continue; }
        const rows = source.prepare(`SELECT * FROM "${table}"`).all();
        counts[table] = rows.length;
        if (!rows.length) continue;
        const columns = Object.keys(rows[0]);
        const names = columns.map(column => `"${column}"`).join(',');
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(',');
        const insert = `INSERT INTO "${table}" (${names}) VALUES (${placeholders})`;
        for (const row of rows) {
          const values = columns.map(column => {
            const value = row[column];
            if (BOOLEAN_COLUMNS.has(`${table}.${column}`)) return Boolean(value);
            if (table === 'receipts' && column === 'issued_at' && typeof value === 'string') return value.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace(/Z$/, '');
            return value;
          });
          await client.query(insert, values);
        }
      }
      for (const table of ID_TABLES) {
        await client.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM "${table}"`);
      }
      await client.query('INSERT INTO schema_migrations(version) VALUES($1)', ['neon-initial-import']);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }

    console.log('Import complete. Row counts:');
    for (const [table, count] of Object.entries(counts)) console.log(`  ${table.padEnd(26)} ${count}`);
    console.log('The SQLite source was left unchanged. Keep its backup until the Neon app has been checked.');
  } finally {
    source.close();
    await pool.end();
  }
}

main().catch(error => { console.error(`Neon import failed: ${error.message}`); process.exitCode = 1; });
