const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const dbPath = path.join(__dirname, '..', 'school.sqlite');
const db = new DatabaseSync(dbPath, { readOnly: true });
const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all();
console.log(`Database: ${dbPath}\n`);
for (const { name } of tables) {
  const count = db.prepare(`SELECT COUNT(*) AS count FROM "${name.replaceAll('"','""')}"`).get().count;
  console.log(`${name.padEnd(26)} ${count} row${count === 1 ? '' : 's'}`);
}
db.close();
