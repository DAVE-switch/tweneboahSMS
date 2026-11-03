CREATE TABLE classes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  level TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE academic_years (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  start_date TEXT,
  end_date TEXT,
  is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE students ADD COLUMN class_id INTEGER REFERENCES classes(id);
ALTER TABLE students ADD COLUMN academic_year_id INTEGER REFERENCES academic_years(id);

CREATE TABLE guardians (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  relationship TEXT,
  phone TEXT,
  alt_phone TEXT,
  email TEXT,
  address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE student_guardians (
  student_id INTEGER NOT NULL REFERENCES students(id),
  guardian_id INTEGER NOT NULL REFERENCES guardians(id),
  relationship TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  is_emergency_contact INTEGER NOT NULL DEFAULT 0 CHECK (is_emergency_contact IN (0,1)),
  PRIMARY KEY (student_id, guardian_id)
);

CREATE TABLE enrollments (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  class_id INTEGER NOT NULL REFERENCES classes(id),
  academic_year_id INTEGER REFERENCES academic_years(id),
  start_date TEXT NOT NULL,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Completed','Transferred','Cancelled')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE student_status_history (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_on TEXT NOT NULL,
  reason TEXT,
  changed_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE fee_structures (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  class_id INTEGER REFERENCES classes(id),
  academic_year_id INTEGER REFERENCES academic_years(id),
  due_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invoices (
  id INTEGER PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  student_id INTEGER NOT NULL REFERENCES students(id),
  academic_year_id INTEGER REFERENCES academic_years(id),
  issued_on TEXT NOT NULL,
  due_on TEXT,
  amount_total REAL NOT NULL DEFAULT 0 CHECK (amount_total >= 0),
  status TEXT NOT NULL DEFAULT 'Issued' CHECK (status IN ('Draft','Issued','Partially paid','Paid','Cancelled')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invoice_items (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  fee_structure_id INTEGER REFERENCES fee_structures(id),
  description TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE payments ADD COLUMN invoice_id INTEGER REFERENCES invoices(id);

CREATE INDEX enrollments_student_year_idx ON enrollments(student_id, academic_year_id);
CREATE INDEX guardians_phone_idx ON guardians(phone);
CREATE INDEX student_status_history_student_idx ON student_status_history(student_id, changed_on);
CREATE INDEX invoices_student_status_idx ON invoices(student_id, status);
CREATE INDEX fee_structures_class_year_idx ON fee_structures(class_id, academic_year_id);

INSERT OR IGNORE INTO classes(name)
SELECT DISTINCT TRIM(class_name) FROM students WHERE TRIM(class_name) <> '';

INSERT OR IGNORE INTO academic_years(name)
SELECT DISTINCT TRIM(academic_year) FROM students WHERE academic_year IS NOT NULL AND TRIM(academic_year) <> '';

UPDATE students
SET class_id=(SELECT id FROM classes WHERE classes.name=TRIM(students.class_name)),
    academic_year_id=(SELECT id FROM academic_years WHERE academic_years.name=TRIM(students.academic_year))
WHERE class_name IS NOT NULL;

INSERT INTO enrollments(student_id,class_id,academic_year_id,start_date,status)
SELECT id,class_id,academic_year_id,admission_date,status FROM students WHERE class_id IS NOT NULL;

INSERT INTO student_status_history(student_id,previous_status,new_status,changed_on,reason)
SELECT id,NULL,status,admission_date,'Initial student record' FROM students;
