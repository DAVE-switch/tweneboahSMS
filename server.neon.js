const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool, types } = require('pg');
const { attachDatabasePool } = require('@vercel/functions');

const ROOT = __dirname;
const STATIC_ROOT = fs.existsSync(path.join(ROOT, 'dist')) ? path.join(ROOT, 'dist') : path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3002);
const DATABASE_URL = process.env.DATABASE_URL;
const mime = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml' };

types.setTypeParser(20, value => Number(value));
types.setTypeParser(1700, value => Number(value));
types.setTypeParser(1082, value => value);
const idTables = new Set(['users','classes','academic_years','students','guardians','enrollments','student_status_history','fee_structures','invoices','invoice_items','payments','receipts','audit_logs']);
function postgresSql(sql) {
  let text = sql.trim().replace(/;$/, '');
  text = text.replace(/DATE_FORMAT\(paid_at,'%Y-%m'\)/gi, "TO_CHAR(paid_at,'YYYY-MM')");
  text = text.replace(/DATE_FORMAT\(CURDATE\(\),'%Y-%m'\)/gi, "TO_CHAR(CURRENT_DATE,'YYYY-MM')");
  text = text.replace(/CURDATE\(\)/gi, 'CURRENT_DATE').replace(/UTC_TIMESTAMP\(\)/gi, "(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')");
  text = text.replace(/\bis_primary\s*=\s*1\b/gi, 'is_primary=TRUE').replace(/\bis_primary\s*=\s*0\b/gi, 'is_primary=FALSE');
  text = text.replace(/VALUES\(\?,\?,\?,1\)/gi, 'VALUES(?,?,?,TRUE)');
  const ignore = /^INSERT\s+IGNORE\s+INTO\s+/i.test(text);
  text = text.replace(/^INSERT\s+IGNORE\s+INTO\s+/i, 'INSERT INTO ');
  const insert = text.match(/^INSERT\s+INTO\s+([a-z_]+)/i);
  if (ignore) text += ' ON CONFLICT DO NOTHING';
  if (insert && idTables.has(insert[1].toLowerCase()) && !/\bRETURNING\b/i.test(text)) text += ' RETURNING id';
  let index = 0;
  text = text.replace(/\?/g, () => `$${++index}`);
  return { text, isInsert: Boolean(insert) };
}
function createPool() {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is required. Copy .env.example to .env and add the Neon pooled connection string.');
  const pgPool = new Pool({ connectionString: DATABASE_URL, max: Number(process.env.PG_POOL_SIZE || 3), idleTimeoutMillis: 5000, connectionTimeoutMillis: 10000, ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: true } });
  if (process.env.VERCEL) attachDatabasePool(pgPool);
  const execute = async (client, sql, params = []) => {
    const statement = postgresSql(sql);
    const result = await client.query(statement.text, params);
    return [statement.isInsert ? { insertId: Number(result.rows[0]?.id || 0), affectedRows: result.rowCount } : result.rows, []];
  };
  pgPool.execute = (sql, params) => execute(pgPool, sql, params);
  pgPool.getConnection = async () => {
    const client = await pgPool.connect();
    return { execute: (sql, params) => execute(client, sql, params), beginTransaction: () => client.query('BEGIN'), commit: () => client.query('COMMIT'), rollback: () => client.query('ROLLBACK'), release: () => client.release() };
  };
  return pgPool;
}
const pool = createPool();
const sendJson = (res,status,data,headers={}) => { res.writeHead(status,{'content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff','cache-control':'no-store',...headers});res.end(JSON.stringify(data)); };
const safeEqual=(a,b)=>{const x=Buffer.from(a);const y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);};
function readBody(req){return new Promise((resolve,reject)=>{let raw='';req.on('data',chunk=>{raw+=chunk;if(raw.length>1_000_000)req.destroy();});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{});}catch{reject(new Error('Invalid JSON'));}});req.on('error',reject);});}
function cookie(req,name){return(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(`${name}=`))?.slice(name.length+1);}
async function currentUser(req){const raw=cookie(req,'school_session');if(!raw)return null;let token;try{token=decodeURIComponent(raw);}catch{return null;}const tokenHash=crypto.createHash('sha256').update(token).digest('hex');const [rows]=await pool.execute('SELECT s.csrf,s.expires_at,u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?',[tokenHash]);const row=rows[0];if(!row||Number(row.expires_at)<Date.now()){if(row)await pool.execute('DELETE FROM sessions WHERE token_hash=?',[tokenHash]);return null;}return{...row,tokenHash};}
async function requireUser(req,res){const user=await currentUser(req);if(!user)sendJson(res,401,{error:'Please sign in to continue.'});return user;}
function requireCsrf(req,res,user){if(!safeEqual(String(req.headers['x-csrf-token']||''),String(user.csrf))){sendJson(res,403,{error:'Your session expired. Refresh and try again.'});return false;}return true;}
async function audit(userId,action,entity,entityId,details,executor=pool){await executor.execute('INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)',[userId,action,entity,entityId||null,details||null]);}
async function studentRow(id,executor=pool){const [rows]=await executor.execute('SELECT s.*,COALESCE((SELECT SUM(amount) FROM payments p WHERE p.student_id=s.id),0) AS total_paid FROM students s WHERE s.id=?',[id]);return rows[0];}
async function transaction(work){const connection=await pool.getConnection();try{await connection.beginTransaction();const result=await work(connection);await connection.commit();return result;}catch(error){await connection.rollback();throw error;}finally{connection.release();}}
function amountWords(value){let n=Math.round(Number(value));if(!n)return'Zero Ghana cedis';const ones=['','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];const tens=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];const under=x=>x<20?ones[x]:`${tens[Math.floor(x/10)]}${x%10?`-${ones[x%10]}`:''}`;const chunk=x=>`${Math.floor(x/100)?`${ones[Math.floor(x/100)]} hundred${x%100?' ':''}`:''}${x%100?under(x%100):''}`;const parts=[];if(n>=1_000_000){parts.push(`${chunk(Math.floor(n/1_000_000))} million`);n%=1_000_000;}if(n>=1000){parts.push(`${chunk(Math.floor(n/1000))} thousand`);n%=1000;}if(n)parts.push(chunk(n));return`${parts.join(' ')} Ghana cedis`;}

async function api(req,res,url){
  const method=req.method;
  if(url.pathname==='/api/login'&&method==='POST'){
    const body=await readBody(req);const [rows]=await pool.execute('SELECT * FROM users WHERE email=?',[String(body.email||'').trim().toLowerCase()]);const user=rows[0];const supplied=String(body.password||'');const hash=user?crypto.scryptSync(supplied,user.salt,64).toString('hex'):'0'.repeat(128);
    if(!user||!safeEqual(hash,user.password_hash))return sendJson(res,401,{error:'Email or password is incorrect.'});
    const token=crypto.randomBytes(32).toString('base64url');const csrf=crypto.randomBytes(24).toString('base64url');const tokenHash=crypto.createHash('sha256').update(token).digest('hex');const expiresAt=Date.now()+12*60*60*1000;
    await pool.execute('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)',[tokenHash,user.id,csrf,expiresAt]);const secure=process.env.NODE_ENV==='production'?'; Secure':'';
    return sendJson(res,200,{user:{id:user.id,name:user.name,email:user.email,role:user.role},csrf},{'set-cookie':`school_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}`});
  }
  if(url.pathname==='/api/logout'&&method==='POST'){const user=await requireUser(req,res);if(!user||!requireCsrf(req,res,user))return;await pool.execute('DELETE FROM sessions WHERE token_hash=?',[user.tokenHash]);return sendJson(res,200,{ok:true},{'set-cookie':'school_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
  const user=await requireUser(req,res);if(!user)return;
  if(url.pathname==='/api/me'&&method==='GET')return sendJson(res,200,{user:{id:user.id,name:user.name,email:user.email,role:user.role},csrf:user.csrf});
  if(method!=='GET'&&!requireCsrf(req,res,user))return;

  if(url.pathname==='/api/dashboard'&&method==='GET'){
    const [[statuses],[today],[month],[recent],[count]] = await Promise.all([
      pool.execute('SELECT status,COUNT(*) AS total FROM students GROUP BY status'),
      pool.execute('SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE paid_at=CURDATE()'),
      pool.execute("SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE DATE_FORMAT(paid_at,'%Y-%m')=DATE_FORMAT(CURDATE(),'%Y-%m')"),
      pool.execute('SELECT p.id,p.amount,p.paid_at,p.method,p.fee_description,r.receipt_number,s.full_name,s.student_code FROM payments p JOIN students s ON s.id=p.student_id JOIN receipts r ON r.payment_id=p.id ORDER BY p.id DESC LIMIT 6'),
      pool.execute('SELECT COUNT(*) AS n FROM students'),
    ]);
    return sendJson(res,200,{totalStudents:count[0].n,statuses,today:today[0].total,month:month[0].total,recent});
  }
  if(url.pathname==='/api/students'&&method==='GET'){
    const q=`%${String(url.searchParams.get('q')||'').trim()}%`;const status=String(url.searchParams.get('status')||'');const [students]=await pool.execute("SELECT s.*,COALESCE((SELECT SUM(amount) FROM payments p WHERE p.student_id=s.id),0) AS total_paid FROM students s WHERE (s.full_name LIKE ? OR s.student_code LIKE ? OR s.class_name LIKE ?) AND (?='' OR s.status=?) ORDER BY s.id DESC",[q,q,q,status,status]);return sendJson(res,200,{students});
  }
  if(url.pathname==='/api/students'&&method==='POST'){
    const body=await readBody(req);const name=String(body.full_name||'').trim();const className=String(body.class_name||'').trim();const admission=String(body.admission_date||'').trim();if(!name||!className||!/^\d{4}-\d{2}-\d{2}$/.test(admission))return sendJson(res,422,{error:'Full name, class and a valid admission date are required.'});
    const id=await transaction(async connection=>{
      await connection.execute('INSERT IGNORE INTO classes(name) VALUES(?)',[className]);const [[classRow]]=await connection.execute('SELECT id FROM classes WHERE name=?',[className]);const yearName=String(body.academic_year||'').trim();let yearId=null;if(yearName){await connection.execute('INSERT IGNORE INTO academic_years(name) VALUES(?)',[yearName]);const [[yearRow]]=await connection.execute('SELECT id FROM academic_years WHERE name=?',[yearName]);yearId=yearRow.id;}
      const pendingCode=`TMP-${crypto.randomBytes(10).toString('hex')}`;const [inserted]=await connection.execute('INSERT INTO students(student_code,full_name,date_of_birth,gender,admission_date,class_name,academic_year,address,guardian_name,guardian_relationship,guardian_phone,guardian_alt_phone,guardian_email,notes,class_id,academic_year_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[pendingCode,name,body.date_of_birth||null,body.gender||null,admission,className,yearName||null,body.address||null,body.guardian_name||null,body.guardian_relationship||null,body.guardian_phone||null,body.guardian_alt_phone||null,body.guardian_email||null,body.notes||null,classRow.id,yearId]);
      const studentId=inserted.insertId;const code=`TK${String(studentId).padStart(3,'0')}`;await connection.execute('UPDATE students SET student_code=? WHERE id=?',[code,studentId]);await connection.execute("INSERT INTO enrollments(student_id,class_id,academic_year_id,start_date,status) VALUES(?,?,?,?,'Active')",[studentId,classRow.id,yearId,admission]);await connection.execute("INSERT INTO student_status_history(student_id,previous_status,new_status,changed_on,reason,changed_by) VALUES(?,NULL,'Active',?,'Initial student record',?)",[studentId,admission,user.id]);
      const guardianName=String(body.guardian_name||'').trim();const phone=String(body.guardian_phone||'').trim();if(guardianName||phone||body.guardian_email){const safeName=guardianName||'Guardian';const [matches]=await connection.execute("SELECT id FROM guardians WHERE full_name=? AND COALESCE(phone,'')=COALESCE(?,'') LIMIT 1",[safeName,phone||null]);let guardian=matches[0];if(!guardian){const [saved]=await connection.execute('INSERT INTO guardians(full_name,phone,alt_phone,email,address) VALUES(?,?,?,?,?)',[safeName,phone||null,body.guardian_alt_phone||null,body.guardian_email||null,body.address||null]);guardian={id:saved.insertId};}await connection.execute('INSERT IGNORE INTO student_guardians(student_id,guardian_id,relationship,is_primary) VALUES(?,?,?,1)',[studentId,guardian.id,body.guardian_relationship||null]);}
      await audit(user.id,'student.registered','student',studentId,code,connection);return studentId;
    });return sendJson(res,201,{student:await studentRow(id)});
  }

  const studentMatch=url.pathname.match(/^\/api\/students\/(\d+)$/);
  if(studentMatch&&method==='GET'){
    const id=Number(studentMatch[1]);const student=await studentRow(id);if(!student)return sendJson(res,404,{error:'Student not found.'});
    const [[guardians],[enrollments],[statusHistory],[payments]]=await Promise.all([
      pool.execute('SELECT g.*,sg.relationship AS student_relationship,sg.is_primary,sg.is_emergency_contact FROM student_guardians sg JOIN guardians g ON g.id=sg.guardian_id WHERE sg.student_id=? ORDER BY sg.is_primary DESC,g.id',[id]),
      pool.execute('SELECT e.*,c.name AS class_name,y.name AS academic_year FROM enrollments e JOIN classes c ON c.id=e.class_id LEFT JOIN academic_years y ON y.id=e.academic_year_id WHERE e.student_id=? ORDER BY e.start_date DESC,e.id DESC',[id]),
      pool.execute('SELECT h.*,u.name AS changed_by_name FROM student_status_history h LEFT JOIN users u ON u.id=h.changed_by WHERE h.student_id=? ORDER BY h.changed_on DESC,h.id DESC',[id]),
      pool.execute('SELECT p.id,p.amount,p.paid_at,p.method,p.reference,p.fee_description,p.academic_year,r.receipt_number,u.name AS received_by_name FROM payments p JOIN receipts r ON r.payment_id=p.id JOIN users u ON u.id=p.received_by WHERE p.student_id=? ORDER BY p.paid_at DESC,p.id DESC',[id]),
    ]);return sendJson(res,200,{student,guardians,enrollments,statusHistory,payments});
  }

  const classMatch=url.pathname.match(/^\/api\/students\/(\d+)\/class$/);
  if(classMatch&&method==='PATCH'){
    const body=await readBody(req);const id=Number(classMatch[1]);const existing=await studentRow(id);const className=String(body.class_name||'').trim();const effectiveDate=String(body.effective_date||new Date().toISOString().slice(0,10));if(!existing)return sendJson(res,404,{error:'Student not found.'});if(!className||!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate))return sendJson(res,422,{error:'Enter a class and a valid effective date.'});const yearName=body.academic_year===undefined?String(existing.academic_year||'').trim():String(body.academic_year||'').trim();
    await transaction(async connection=>{await connection.execute('INSERT IGNORE INTO classes(name) VALUES(?)',[className]);const [[cls]]=await connection.execute('SELECT id FROM classes WHERE name=?',[className]);let yearId=null;if(yearName){await connection.execute('INSERT IGNORE INTO academic_years(name) VALUES(?)',[yearName]);const [[year]]=await connection.execute('SELECT id FROM academic_years WHERE name=?',[yearName]);yearId=year.id;}if(Number(existing.class_id)!==Number(cls.id)||Number(existing.academic_year_id||0)!==Number(yearId||0)){await connection.execute("UPDATE enrollments SET end_date=?,status='Completed' WHERE student_id=? AND end_date IS NULL AND status='Active'",[effectiveDate,id]);await connection.execute("INSERT INTO enrollments(student_id,class_id,academic_year_id,start_date,status,notes) VALUES(?,?,?,?,'Active',?)",[id,cls.id,yearId,effectiveDate,`Class updated from ${existing.class_name}${existing.academic_year?` (${existing.academic_year})`:''} to ${className}${yearName?` (${yearName})`:''}`]);await connection.execute('UPDATE students SET class_name=?,class_id=?,academic_year=?,academic_year_id=? WHERE id=?',[className,cls.id,yearName||null,yearId,id]);await audit(user.id,'student.class_changed','student',id,`${existing.class_name} -> ${className}; ${existing.academic_year||''} -> ${yearName}`,connection);}});
    return sendJson(res,200,{student:await studentRow(id)});
  }

  const profileMatch=url.pathname.match(/^\/api\/students\/(\d+)\/profile$/);
  if(profileMatch&&method==='PATCH'){
    const body=await readBody(req);const id=Number(profileMatch[1]);const existing=await studentRow(id);if(!existing)return sendJson(res,404,{error:'Student not found.'});const name=String(body.full_name||'').trim();if(!name)return sendJson(res,422,{error:'Student full name is required.'});const email=String(body.guardian_email||'').trim();if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return sendJson(res,422,{error:'Enter a valid guardian email address.'});
    await transaction(async connection=>{await connection.execute('UPDATE students SET full_name=?,date_of_birth=?,gender=?,address=?,guardian_name=?,guardian_relationship=?,guardian_phone=?,guardian_alt_phone=?,guardian_email=?,notes=? WHERE id=?',[name,body.date_of_birth||null,body.gender||null,body.address||null,body.guardian_name||null,body.guardian_relationship||null,body.guardian_phone||null,body.guardian_alt_phone||null,email||null,body.notes||null,id]);const guardianName=String(body.guardian_name||'').trim();const phone=String(body.guardian_phone||'').trim();const altPhone=String(body.guardian_alt_phone||'').trim();const [[primary]]=await connection.execute('SELECT guardian_id FROM student_guardians WHERE student_id=? AND is_primary=1 LIMIT 1',[id]);if(guardianName||phone||altPhone||email){const safeName=guardianName||'Guardian';if(primary){await connection.execute('UPDATE guardians SET full_name=?,relationship=?,phone=?,alt_phone=?,email=?,address=? WHERE id=?',[safeName,body.guardian_relationship||null,phone||null,altPhone||null,email||null,body.address||null,primary.guardian_id]);await connection.execute('UPDATE student_guardians SET relationship=? WHERE student_id=? AND guardian_id=?',[body.guardian_relationship||null,id,primary.guardian_id]);}else{const [saved]=await connection.execute('INSERT INTO guardians(full_name,relationship,phone,alt_phone,email,address) VALUES(?,?,?,?,?,?)',[safeName,body.guardian_relationship||null,phone||null,altPhone||null,email||null,body.address||null]);await connection.execute('INSERT INTO student_guardians(student_id,guardian_id,relationship,is_primary) VALUES(?,?,?,1)',[id,saved.insertId,body.guardian_relationship||null]);}}else if(primary){await connection.execute('DELETE FROM student_guardians WHERE student_id=? AND guardian_id=?',[id,primary.guardian_id]);}await audit(user.id,'student.profile_updated','student',id,name,connection);});return sendJson(res,200,{student:await studentRow(id)});
  }

  if(studentMatch&&method==='PATCH'){
    const body=await readBody(req);const id=Number(studentMatch[1]);const status=String(body.status||'');if(!['Active','On hold','Withdrawn','Transferred','Graduated'].includes(status))return sendJson(res,422,{error:'Choose a valid student status.'});const existing=await studentRow(id);if(!existing)return sendJson(res,404,{error:'Student not found.'});
    if(existing.status!==status){const changedOn=new Date().toISOString().slice(0,10);await transaction(async connection=>{await connection.execute('UPDATE students SET status=? WHERE id=?',[status,id]);await connection.execute('INSERT INTO student_status_history(student_id,previous_status,new_status,changed_on,reason,changed_by) VALUES(?,?,?,?,?,?)',[id,existing.status,status,changedOn,String(body.reason||'').slice(0,240)||null,user.id]);if(status==='Active'&&existing.status!=='Active'&&existing.class_id){await connection.execute("INSERT INTO enrollments(student_id,class_id,academic_year_id,start_date,status,notes) VALUES(?,?,?,?,'Active','Student status reactivated')",[id,existing.class_id,existing.academic_year_id,changedOn]);}else if(status!=='Active'){const enrollmentStatus=status==='Transferred'?'Transferred':'Completed';await connection.execute("UPDATE enrollments SET end_date=?,status=? WHERE student_id=? AND end_date IS NULL AND status='Active'",[changedOn,enrollmentStatus,id]);}await audit(user.id,'student.status_changed','student',id,`${existing.status} -> ${status}; ${String(body.reason||'').slice(0,240)}`,connection);});}return sendJson(res,200,{student:await studentRow(id)});
  }

  if(url.pathname==='/api/payments'&&method==='GET'){const q=`%${String(url.searchParams.get('q')||'').trim()}%`;const [payments]=await pool.execute('SELECT p.*,r.receipt_number,s.full_name,s.student_code,s.class_name,u.name AS received_by_name FROM payments p JOIN receipts r ON r.payment_id=p.id JOIN students s ON s.id=p.student_id JOIN users u ON u.id=p.received_by WHERE s.full_name LIKE ? OR s.student_code LIKE ? ORDER BY p.id DESC LIMIT 250',[q,q]);return sendJson(res,200,{payments});}
  if(url.pathname==='/api/payments'&&method==='POST'){
    const body=await readBody(req);const student=await studentRow(Number(body.student_id));const amount=Number(body.amount);const methodName=String(body.method||'');const paidAt=String(body.paid_at||'');const description=String(body.fee_description||'').trim();if(!student||!Number.isFinite(amount)||amount<=0||!['Cash','Mobile Money','Bank Transfer'].includes(methodName)||!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)||!description)return sendJson(res,422,{error:'Select a student and enter a positive amount, valid date, payment method and fee description.'});
    const paymentId=await transaction(async connection=>{const [inserted]=await connection.execute('INSERT INTO payments(student_id,amount,paid_at,method,reference,fee_description,academic_year,received_by) VALUES(?,?,?,?,?,?,?,?)',[student.id,amount,paidAt,methodName,String(body.reference||'').trim()||null,description,String(body.academic_year||'').trim()||null,user.id]);const id=inserted.insertId;const receiptNo=`TKRA-${new Date(`${paidAt}T00:00:00Z`).getUTCFullYear()}-${String(id).padStart(5,'0')}`;await connection.execute('INSERT INTO receipts(payment_id,receipt_number,issued_at) VALUES(?,?,UTC_TIMESTAMP())',[id,receiptNo]);await audit(user.id,'payment.recorded','payment',id,`${receiptNo}: GHS ${amount.toFixed(2)}`,connection);return id;});
    const [rows]=await pool.execute('SELECT p.*,r.receipt_number,s.full_name,s.student_code,s.class_name,u.name AS received_by_name FROM payments p JOIN receipts r ON r.payment_id=p.id JOIN students s ON s.id=p.student_id JOIN users u ON u.id=p.received_by WHERE p.id=?',[paymentId]);return sendJson(res,201,{payment:rows[0]});
  }
  const receiptMatch=url.pathname.match(/^\/api\/receipts\/(\d+)$/);
  if(receiptMatch&&method==='GET'){const [rows]=await pool.execute('SELECT r.receipt_number,r.issued_at,p.*,s.full_name,s.student_code,s.class_name,s.status,COALESCE((SELECT SUM(amount) FROM payments allp WHERE allp.student_id=s.id),0) AS total_paid,u.name AS received_by_name FROM receipts r JOIN payments p ON p.id=r.payment_id JOIN students s ON s.id=p.student_id JOIN users u ON u.id=p.received_by WHERE p.id=?',[Number(receiptMatch[1])]);return rows[0]?sendJson(res,200,{receipt:rows[0],amount_words:amountWords(rows[0].amount)}):sendJson(res,404,{error:'Receipt not found.'});}
  return sendJson(res,404,{error:'Not found.'});
}

async function seedFirstUsers(){const [rows]=await pool.execute('SELECT COUNT(*) AS n FROM users');if(Number(rows[0].n))return;for(const[name,email,role]of[['School Director','director@twk.local','Director'],['School Administrator','admin@twk.local','Administrator']]){const password=crypto.randomBytes(9).toString('base64url');const salt=crypto.randomBytes(16).toString('hex');const hash=crypto.scryptSync(password,salt,64).toString('hex');await pool.execute('INSERT INTO users(name,email,role,salt,password_hash) VALUES(?,?,?,?,?)',[name,email,role,salt,hash]);console.log(`Initial ${role} login: ${email} / ${password}`);}console.log('Save these credentials now; password hashes are stored in Neon.');}

const server=http.createServer((req,res)=>{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);if(url.pathname.startsWith('/api/')){api(req,res,url).catch(error=>{console.error('Neon API request failed:',error.message);if(!res.headersSent)sendJson(res,500,{error:'The server could not complete this request.'});else res.destroy();});return;}const requested=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname);const file=path.resolve(STATIC_ROOT,`.${requested}`);if(!file.startsWith(STATIC_ROOT+path.sep)&&file!==path.join(STATIC_ROOT,'index.html')){res.writeHead(403);return res.end('Forbidden');}fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','x-content-type-options':'nosniff'});res.end(data);});});

async function start(){await pool.query('SELECT 1');await pool.query('SELECT version FROM schema_migrations LIMIT 1');await seedFirstUsers();server.listen(PORT,()=>console.log(`Tweneboah Koduah Royal Academy Neon backend: http://localhost:${PORT}`));}

async function vercelHandler(req,res){
  const url=new URL(req.url,`https://${req.headers.host||'localhost'}`);
  if(!url.pathname.startsWith('/api/'))return sendJson(res,404,{error:'Not found.'});
  try{return await api(req,res,url);}catch(error){console.error('Neon API request failed:',error.message);if(!res.headersSent)return sendJson(res,500,{error:'The server could not complete this request.'});res.destroy();}
}

module.exports=vercelHandler;
module.exports.vercelHandler=vercelHandler;

if(require.main===module){
  start().catch(async error=>{console.error(`Neon backend did not start: ${error.message}`);console.error('Run the SQLite-to-Neon migration after configuring DATABASE_URL, then start the Neon backend.');await pool.end().catch(()=>{});process.exitCode=1;});
}
