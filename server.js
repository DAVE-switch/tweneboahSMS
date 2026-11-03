const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const STATIC_ROOT = fs.existsSync(path.join(ROOT, 'dist')) ? path.join(ROOT, 'dist') : path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3002);
const db = new DatabaseSync(path.join(ROOT, 'school.sqlite'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL CHECK(role IN ('Director','Administrator')), salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY, student_code TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL, date_of_birth TEXT, gender TEXT, admission_date TEXT NOT NULL, class_name TEXT NOT NULL, academic_year TEXT, address TEXT, status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','On hold','Withdrawn','Transferred','Graduated')), guardian_name TEXT, guardian_relationship TEXT, guardian_phone TEXT, guardian_alt_phone TEXT, guardian_email TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id), amount REAL NOT NULL CHECK(amount > 0), paid_at TEXT NOT NULL, method TEXT NOT NULL, reference TEXT, fee_description TEXT NOT NULL, academic_year TEXT, received_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS receipts (id INTEGER PRIMARY KEY, payment_id INTEGER NOT NULL UNIQUE REFERENCES payments(id), receipt_number TEXT NOT NULL UNIQUE, issued_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), action TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER, details TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS students_name_idx ON students(full_name);
  CREATE INDEX IF NOT EXISTS payments_student_idx ON payments(student_id, paid_at);
`);

// Versioned, additive schema migration. Existing SQLite student and payment rows stay in place.
db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
const schoolStructureMigration = '002-school-structure';
if (!db.prepare('SELECT version FROM schema_migrations WHERE version=?').get(schoolStructureMigration)) {
  const migrationSql = fs.readFileSync(path.join(ROOT, 'migrations', '002-school-structure.sql'), 'utf8');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(migrationSql);
    db.prepare('INSERT INTO schema_migrations(version) VALUES(?)').run(schoolStructureMigration);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  const legacyStudents = db.prepare(`SELECT id,guardian_name,guardian_relationship,guardian_phone,guardian_alt_phone,guardian_email FROM students WHERE guardian_name IS NOT NULL OR guardian_phone IS NOT NULL OR guardian_email IS NOT NULL`).all();
  const findGuardian = db.prepare(`SELECT id FROM guardians WHERE full_name=? AND COALESCE(phone,'')=COALESCE(?,'') LIMIT 1`);
  const addGuardian = db.prepare(`INSERT INTO guardians(full_name,phone,alt_phone,email) VALUES(?,?,?,?)`);
  const linkGuardian = db.prepare(`INSERT OR IGNORE INTO student_guardians(student_id,guardian_id,relationship,is_primary) VALUES(?,?,?,1)`);
  for (const student of legacyStudents) {
    const name = student.guardian_name || 'Guardian';
    let guardian = findGuardian.get(name, student.guardian_phone || null);
    if (!guardian) {
      const result = addGuardian.run(name,student.guardian_phone||null,student.guardian_alt_phone||null,student.guardian_email||null);
      guardian = { id: Number(result.lastInsertRowid) };
    }
    linkGuardian.run(student.id,guardian.id,student.guardian_relationship||null);
  }
}

const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (!count) {
  for (const [name, email, role] of [['School Director', 'director@twk.local', 'Director'], ['School Administrator', 'admin@twk.local', 'Administrator']]) {
    const password = crypto.randomBytes(9).toString('base64url');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    db.prepare('INSERT INTO users(name,email,role,salt,password_hash) VALUES(?,?,?,?,?)').run(name, email, role, salt, hash);
    console.log(`Initial ${role} login: ${email} / ${password}`);
  }
  console.log('Save these credentials now. Passwords are stored as salted hashes.');
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const json = (res, status, value, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(value)); };
const safeEqual = (a, b) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''; req.on('data', chunk => { raw += chunk; if (raw.length > 1_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
function cookie(req, name) { return (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.slice(name.length + 1); }
function currentUser(req) {
  const raw = cookie(req, 'school_session'); if (!raw) return null;
  const tokenHash = crypto.createHash('sha256').update(decodeURIComponent(raw)).digest('hex');
  const row = db.prepare('SELECT s.csrf,s.expires_at,u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?').get(tokenHash);
  if (!row || row.expires_at < Date.now()) { if (row) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash); return null; }
  return { ...row, tokenHash };
}
function requireUser(req, res) { const user = currentUser(req); if (!user) { json(res, 401, { error: 'Please sign in to continue.' }); return null; } return user; }
function requireCsrf(req, res, user) { if (!safeEqual(String(req.headers['x-csrf-token'] || ''), user.csrf)) { json(res, 403, { error: 'Your session expired. Refresh and try again.' }); return false; } return true; }
function audit(userId, action, entity, entityId, details) { db.prepare('INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)').run(userId, action, entity, entityId || null, details || null); }
function amountWords(value) {
  let n = Math.round(Number(value)); if (!n) return 'Zero Ghana cedis';
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const under = x => x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? `-${ones[x % 10]}` : ''}`;
  const chunk = x => `${Math.floor(x / 100) ? `${ones[Math.floor(x / 100)]} hundred${x % 100 ? ' ' : ''}` : ''}${x % 100 ? under(x % 100) : ''}`;
  const parts = []; if (n >= 1000000) { parts.push(`${chunk(Math.floor(n / 1000000))} million`); n %= 1000000; } if (n >= 1000) { parts.push(`${chunk(Math.floor(n / 1000))} thousand`); n %= 1000; } if (n) parts.push(chunk(n));
  return `${parts.join(' ')} Ghana cedis`;
}
function studentRow(id) {
  return db.prepare(`SELECT s.*, COALESCE((SELECT SUM(amount) FROM payments p WHERE p.student_id=s.id),0) AS total_paid FROM students s WHERE s.id=?`).get(id);
}
function handleApi(req, res, url) {
  const method = req.method;
  if (url.pathname === '/api/login' && method === 'POST') {
    return readBody(req).then(body => {
      const user = db.prepare('SELECT * FROM users WHERE email=?').get(String(body.email || '').trim().toLowerCase());
      const supplied = String(body.password || '');
      const hash = user ? crypto.scryptSync(supplied, user.salt, 64).toString('hex') : '0'.repeat(128);
      if (!user || !safeEqual(hash, user.password_hash)) return json(res, 401, { error: 'Email or password is incorrect.' });
      const token = crypto.randomBytes(32).toString('base64url'); const csrf = crypto.randomBytes(24).toString('base64url'); const tokenHash = crypto.createHash('sha256').update(token).digest('hex'); const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
      db.prepare('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)').run(tokenHash, user.id, csrf, expiresAt);
      return json(res, 200, { user: { id: user.id, name: user.name, email: user.email, role: user.role }, csrf }, { 'set-cookie': `school_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200` });
    }).catch(() => json(res, 400, { error: 'Could not read sign-in details.' }));
  }
  if (url.pathname === '/api/logout' && method === 'POST') {
    const user = requireUser(req, res); if (!user || !requireCsrf(req, res, user)) return;
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(user.tokenHash);
    return json(res, 200, { ok: true }, { 'set-cookie': 'school_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }
  const user = requireUser(req, res); if (!user) return;
  if (url.pathname === '/api/me' && method === 'GET') return json(res, 200, { user: { id: user.id, name: user.name, email: user.email, role: user.role }, csrf: user.csrf });
  if (method !== 'GET' && !requireCsrf(req, res, user)) return;
  if (url.pathname === '/api/dashboard' && method === 'GET') {
    const statuses = db.prepare(`SELECT status,COUNT(*) AS total FROM students GROUP BY status`).all();
    const sums = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE date(paid_at)=date('now','localtime')`).get();
    const month = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE strftime('%Y-%m',paid_at)=strftime('%Y-%m','now','localtime')`).get();
    const recent = db.prepare(`SELECT p.id,p.amount,p.paid_at,p.method,p.fee_description,r.receipt_number,s.full_name,s.student_code FROM payments p JOIN students s ON s.id=p.student_id JOIN receipts r ON r.payment_id=p.id ORDER BY p.id DESC LIMIT 6`).all();
    return json(res, 200, { totalStudents: db.prepare('SELECT COUNT(*) AS n FROM students').get().n, statuses, today: sums.total, month: month.total, recent });
  }
  if (url.pathname === '/api/students' && method === 'GET') {
    const q = `%${String(url.searchParams.get('q') || '').trim()}%`; const status = String(url.searchParams.get('status') || '');
    const rows = db.prepare(`SELECT s.*, COALESCE((SELECT SUM(amount) FROM payments p WHERE p.student_id=s.id),0) AS total_paid FROM students s WHERE (s.full_name LIKE ? OR s.student_code LIKE ? OR s.class_name LIKE ?) AND (?='' OR s.status=?) ORDER BY s.id DESC`).all(q,q,q,status,status);
    return json(res, 200, { students: rows });
  }
  if (url.pathname === '/api/students' && method === 'POST') {
    return readBody(req).then(body => {
      const name = String(body.full_name || '').trim(); const className = String(body.class_name || '').trim(); const admission = String(body.admission_date || '').trim();
      if (!name || !className || !/^\d{4}-\d{2}-\d{2}$/.test(admission)) return json(res, 422, { error: 'Full name, class and a valid admission date are required.' });
      db.exec('BEGIN IMMEDIATE');
      try {
        const next = db.prepare(`SELECT COALESCE(MAX(id),0)+1 AS n FROM students`).get().n;
        const code = `TK${String(next).padStart(3, '0')}`;
        db.prepare('INSERT OR IGNORE INTO classes(name) VALUES(?)').run(className);
        const classId = db.prepare('SELECT id FROM classes WHERE name=?').get(className).id;
        const academicYear = String(body.academic_year || '').trim();
        let academicYearId = null;
        if (academicYear) {
          db.prepare('INSERT OR IGNORE INTO academic_years(name) VALUES(?)').run(academicYear);
          academicYearId = db.prepare('SELECT id FROM academic_years WHERE name=?').get(academicYear).id;
        }
        const result = db.prepare(`INSERT INTO students(student_code,full_name,date_of_birth,gender,admission_date,class_name,academic_year,address,guardian_name,guardian_relationship,guardian_phone,guardian_alt_phone,guardian_email,notes,class_id,academic_year_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(code,name,body.date_of_birth||null,body.gender||null,admission,className,academicYear||null,body.address||null,body.guardian_name||null,body.guardian_relationship||null,body.guardian_phone||null,body.guardian_alt_phone||null,body.guardian_email||null,body.notes||null,classId,academicYearId);
        const studentId = Number(result.lastInsertRowid);
        db.prepare('INSERT INTO enrollments(student_id,class_id,academic_year_id,start_date,status) VALUES(?,?,?,?,?)').run(studentId,classId,academicYearId,admission,'Active');
        db.prepare(`INSERT INTO student_status_history(student_id,previous_status,new_status,changed_on,reason,changed_by) VALUES(?,NULL,'Active',?,'Initial student record',?)`).run(studentId,admission,user.id);
        const guardianName = String(body.guardian_name || '').trim(); const guardianPhone = String(body.guardian_phone || '').trim();
        if (guardianName || guardianPhone || body.guardian_email) {
          const safeName = guardianName || 'Guardian';
          let guardian = db.prepare(`SELECT id FROM guardians WHERE full_name=? AND COALESCE(phone,'')=COALESCE(?,'') LIMIT 1`).get(safeName,guardianPhone||null);
          if (!guardian) {
            const saved = db.prepare('INSERT INTO guardians(full_name,phone,alt_phone,email,address) VALUES(?,?,?,?,?)').run(safeName,guardianPhone||null,body.guardian_alt_phone||null,body.guardian_email||null,body.address||null);
            guardian = { id: Number(saved.lastInsertRowid) };
          }
          db.prepare('INSERT OR IGNORE INTO student_guardians(student_id,guardian_id,relationship,is_primary) VALUES(?,?,?,1)').run(studentId,guardian.id,body.guardian_relationship||null);
        }
        audit(user.id,'student.registered','student',studentId,code);
        db.exec('COMMIT');
        return json(res, 201, { student: studentRow(studentId) });
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }).catch(() => json(res, 400, { error: 'Could not save student details.' }));
  }
  const studentMatch = url.pathname.match(/^\/api\/students\/(\d+)$/);
  if (studentMatch && method === 'GET') {
    const id = Number(studentMatch[1]); const student = studentRow(id);
    if (!student) return json(res,404,{error:'Student not found.'});
    const guardians = db.prepare(`SELECT g.*,sg.relationship AS student_relationship,sg.is_primary,sg.is_emergency_contact FROM student_guardians sg JOIN guardians g ON g.id=sg.guardian_id WHERE sg.student_id=? ORDER BY sg.is_primary DESC,g.id`).all(id);
    const enrollments = db.prepare(`SELECT e.*,c.name AS class_name,y.name AS academic_year FROM enrollments e JOIN classes c ON c.id=e.class_id LEFT JOIN academic_years y ON y.id=e.academic_year_id WHERE e.student_id=? ORDER BY e.start_date DESC,e.id DESC`).all(id);
    const statusHistory = db.prepare(`SELECT h.*,u.name AS changed_by_name FROM student_status_history h LEFT JOIN users u ON u.id=h.changed_by WHERE h.student_id=? ORDER BY h.changed_on DESC,h.id DESC`).all(id);
    const payments = db.prepare(`SELECT p.id,p.amount,p.paid_at,p.method,p.reference,p.fee_description,p.academic_year,r.receipt_number,u.name AS received_by_name FROM payments p JOIN receipts r ON r.payment_id=p.id JOIN users u ON u.id=p.received_by WHERE p.student_id=? ORDER BY p.paid_at DESC,p.id DESC`).all(id);
    return json(res,200,{student,guardians,enrollments,statusHistory,payments});
  }
  const classMatch = url.pathname.match(/^\/api\/students\/(\d+)\/class$/);
  if (classMatch && method === 'PATCH') {
    return readBody(req).then(body => {
      const id=Number(classMatch[1]); const existing=studentRow(id); const className=String(body.class_name||'').trim(); const effectiveDate=String(body.effective_date||new Date().toISOString().slice(0,10));
      if(!existing)return json(res,404,{error:'Student not found.'});
      if(!className||!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate))return json(res,422,{error:'Enter a class and a valid effective date.'});
      const yearValue=body.academic_year===undefined?String(existing.academic_year||'').trim():String(body.academic_year||'').trim();
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT OR IGNORE INTO classes(name) VALUES(?)').run(className);
        const classId=db.prepare('SELECT id FROM classes WHERE name=?').get(className).id;
        let yearId=null;
        if(yearValue){db.prepare('INSERT OR IGNORE INTO academic_years(name) VALUES(?)').run(yearValue);yearId=db.prepare('SELECT id FROM academic_years WHERE name=?').get(yearValue).id;}
        const changed=existing.class_id!==classId||existing.academic_year_id!==yearId;
        if(changed){
          db.prepare(`UPDATE enrollments SET end_date=?,status='Completed' WHERE student_id=? AND end_date IS NULL AND status='Active'`).run(effectiveDate,id);
          db.prepare(`INSERT INTO enrollments(student_id,class_id,academic_year_id,start_date,status,notes) VALUES(?,?,?,?,'Active',?)`).run(id,classId,yearId,effectiveDate,`Class updated from ${existing.class_name}${existing.academic_year?` (${existing.academic_year})`:''} to ${className}${yearValue?` (${yearValue})`:''}`);
          db.prepare('UPDATE students SET class_name=?,class_id=?,academic_year=?,academic_year_id=? WHERE id=?').run(className,classId,yearValue||null,yearId,id);
          audit(user.id,'student.class_changed','student',id,`${existing.class_name} -> ${className}; ${existing.academic_year||''} -> ${yearValue}`);
        }
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      return json(res,200,{student:studentRow(id)});
    }).catch(()=>json(res,400,{error:'Could not update the student class.'}));
  }
  const profileMatch = url.pathname.match(/^\/api\/students\/(\d+)\/profile$/);
  if (profileMatch && method === 'PATCH') {
    return readBody(req).then(body => {
      const id=Number(profileMatch[1]); const existing=studentRow(id); if(!existing)return json(res,404,{error:'Student not found.'});
      const name=String(body.full_name||'').trim(); if(!name)return json(res,422,{error:'Student full name is required.'});
      const email=String(body.guardian_email||'').trim(); if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(res,422,{error:'Enter a valid guardian email address.'});
      db.exec('BEGIN IMMEDIATE');
      try{
        db.prepare(`UPDATE students SET full_name=?,date_of_birth=?,gender=?,address=?,guardian_name=?,guardian_relationship=?,guardian_phone=?,guardian_alt_phone=?,guardian_email=?,notes=? WHERE id=?`).run(name,body.date_of_birth||null,body.gender||null,body.address||null,body.guardian_name||null,body.guardian_relationship||null,body.guardian_phone||null,body.guardian_alt_phone||null,email||null,body.notes||null,id);
        const guardianName=String(body.guardian_name||'').trim();const phone=String(body.guardian_phone||'').trim();const altPhone=String(body.guardian_alt_phone||'').trim();
        const primary=db.prepare('SELECT guardian_id FROM student_guardians WHERE student_id=? AND is_primary=1 LIMIT 1').get(id);
        if(guardianName||phone||altPhone||email){
          const safeName=guardianName||'Guardian';
          if(primary){
            db.prepare('UPDATE guardians SET full_name=?,relationship=?,phone=?,alt_phone=?,email=?,address=? WHERE id=?').run(safeName,body.guardian_relationship||null,phone||null,altPhone||null,email||null,body.address||null,primary.guardian_id);
            db.prepare('UPDATE student_guardians SET relationship=? WHERE student_id=? AND guardian_id=?').run(body.guardian_relationship||null,id,primary.guardian_id);
          }else{
            const saved=db.prepare('INSERT INTO guardians(full_name,relationship,phone,alt_phone,email,address) VALUES(?,?,?,?,?,?)').run(safeName,body.guardian_relationship||null,phone||null,altPhone||null,email||null,body.address||null);
            db.prepare('INSERT INTO student_guardians(student_id,guardian_id,relationship,is_primary) VALUES(?,?,?,1)').run(id,Number(saved.lastInsertRowid),body.guardian_relationship||null);
          }
        }else if(primary){db.prepare('DELETE FROM student_guardians WHERE student_id=? AND guardian_id=?').run(id,primary.guardian_id);}
        audit(user.id,'student.profile_updated','student',id,name);
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      return json(res,200,{student:studentRow(id)});
    }).catch(()=>json(res,400,{error:'Could not update the student profile.'}));
  }
  if (studentMatch && method === 'PATCH') {
    return readBody(req).then(body => {
      const status = String(body.status || ''); if (!['Active','On hold','Withdrawn','Transferred','Graduated'].includes(status)) return json(res,422,{error:'Choose a valid student status.'});
      const existing = studentRow(Number(studentMatch[1])); if (!existing) return json(res,404,{error:'Student not found.'});
      if (existing.status !== status) {
        const changedOn = new Date().toISOString().slice(0,10);
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare('UPDATE students SET status=? WHERE id=?').run(status,existing.id);
          db.prepare('INSERT INTO student_status_history(student_id,previous_status,new_status,changed_on,reason,changed_by) VALUES(?,?,?,?,?,?)').run(existing.id,existing.status,status,changedOn,String(body.reason||'').slice(0,240)||null,user.id);
          if(status==='Active'&&existing.status!=='Active'&&existing.class_id){
            db.prepare(`INSERT INTO enrollments(student_id,class_id,academic_year_id,start_date,status,notes) VALUES(?,?,?,?,'Active','Student status reactivated')`).run(existing.id,existing.class_id,existing.academic_year_id,changedOn);
          }else if(status!=='Active'){
            const enrollmentStatus=status==='Transferred'?'Transferred':'Completed';
            db.prepare(`UPDATE enrollments SET end_date=?,status=? WHERE student_id=? AND end_date IS NULL AND status='Active'`).run(changedOn,enrollmentStatus,existing.id);
          }
          audit(user.id,'student.status_changed','student',existing.id,`${existing.status} -> ${status}; ${String(body.reason||'').slice(0,240)}`);
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      }
      return json(res,200,{student:studentRow(existing.id)});
    }).catch(() => json(res,400,{error:'Could not update status.'}));
  }
  if (url.pathname === '/api/payments' && method === 'GET') {
    const q = `%${String(url.searchParams.get('q') || '').trim()}%`;
    const payments = db.prepare(`SELECT p.*,r.receipt_number,s.full_name,s.student_code,s.class_name,u.name AS received_by_name FROM payments p JOIN receipts r ON r.payment_id=p.id JOIN students s ON s.id=p.student_id JOIN users u ON u.id=p.received_by WHERE s.full_name LIKE ? OR s.student_code LIKE ? ORDER BY p.id DESC LIMIT 250`).all(q,q);
    return json(res,200,{payments});
  }
  if (url.pathname === '/api/payments' && method === 'POST') {
    return readBody(req).then(body => {
      const student = studentRow(Number(body.student_id)); const amount = Number(body.amount); const methodName = String(body.method || ''); const paidAt = String(body.paid_at || ''); const description = String(body.fee_description || '').trim();
      if (!student || !Number.isFinite(amount) || amount <= 0 || !['Cash','Mobile Money','Bank Transfer'].includes(methodName) || !/^\d{4}-\d{2}-\d{2}$/.test(paidAt) || !description) return json(res,422,{error:'Select a student and enter a positive amount, valid date, payment method and fee description.'});
      db.exec('BEGIN IMMEDIATE');
      let paymentId;
      try {
        const result = db.prepare('INSERT INTO payments(student_id,amount,paid_at,method,reference,fee_description,academic_year,received_by) VALUES(?,?,?,?,?,?,?,?)').run(student.id,amount,paidAt,methodName,String(body.reference||'').trim()||null,description,String(body.academic_year||'').trim()||null,user.id);
        paymentId = Number(result.lastInsertRowid); const receiptNo = `TKRA-${new Date(paidAt).getFullYear()}-${String(paymentId).padStart(5,'0')}`;
        db.prepare('INSERT INTO receipts(payment_id,receipt_number,issued_at) VALUES(?,?,?)').run(paymentId,receiptNo,new Date().toISOString()); audit(user.id,'payment.recorded','payment',paymentId,`${receiptNo}: GHS ${amount.toFixed(2)}`);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return json(res,201,{payment:db.prepare(`SELECT p.*,r.receipt_number,s.full_name,s.student_code,s.class_name,u.name AS received_by_name FROM payments p JOIN receipts r ON r.payment_id=p.id JOIN students s ON s.id=p.student_id JOIN users u ON u.id=p.received_by WHERE p.id=?`).get(paymentId)});
    }).catch(() => json(res,400,{error:'Could not record payment.'}));
  }
  const receiptMatch = url.pathname.match(/^\/api\/receipts\/(\d+)$/);
  if (receiptMatch && method === 'GET') {
    const receipt = db.prepare(`SELECT r.receipt_number,r.issued_at,p.*,s.full_name,s.student_code,s.class_name,s.status,COALESCE((SELECT SUM(amount) FROM payments allp WHERE allp.student_id=s.id),0) AS total_paid,u.name AS received_by_name FROM receipts r JOIN payments p ON p.id=r.payment_id JOIN students s ON s.id=p.student_id JOIN users u ON u.id=p.received_by WHERE p.id=?`).get(Number(receiptMatch[1]));
    return receipt ? json(res,200,{receipt,amount_words:amountWords(receipt.amount)}) : json(res,404,{error:'Receipt not found.'});
  }
  return json(res,404,{error:'Not found.'});
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return handleApi(req,res,url);
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const file = path.resolve(STATIC_ROOT, `.${requested}`);
  if (!file.startsWith(STATIC_ROOT + path.sep) && file !== path.join(STATIC_ROOT,'index.html')) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file,(err,data) => { if(err){res.writeHead(404);return res.end('Not found');} res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','x-content-type-options':'nosniff'});res.end(data); });
});
server.listen(PORT, () => console.log(`Tweneboah Koduah Royal Academy system: http://localhost:${PORT}`));
