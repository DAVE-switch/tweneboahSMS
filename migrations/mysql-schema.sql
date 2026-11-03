CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(100) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  role ENUM('Director','Administrator') NOT NULL,
  salt CHAR(32) NOT NULL,
  password_hash CHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  csrf VARCHAR(64) NOT NULL,
  expires_at BIGINT NOT NULL,
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS classes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  level VARCHAR(80),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS academic_years (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(40) NOT NULL UNIQUE,
  start_date DATE,
  end_date DATE,
  is_current TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS students (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_code VARCHAR(32) NOT NULL UNIQUE,
  full_name VARCHAR(160) NOT NULL,
  date_of_birth DATE,
  gender VARCHAR(32),
  admission_date DATE NOT NULL,
  class_name VARCHAR(120) NOT NULL,
  academic_year VARCHAR(40),
  address VARCHAR(500),
  status ENUM('Active','On hold','Withdrawn','Transferred','Graduated') NOT NULL DEFAULT 'Active',
  guardian_name VARCHAR(160),
  guardian_relationship VARCHAR(80),
  guardian_phone VARCHAR(48),
  guardian_alt_phone VARCHAR(48),
  guardian_email VARCHAR(190),
  notes TEXT,
  class_id BIGINT UNSIGNED,
  academic_year_id BIGINT UNSIGNED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX students_name_idx (full_name),
  CONSTRAINT students_class_fk FOREIGN KEY (class_id) REFERENCES classes(id),
  CONSTRAINT students_year_fk FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS guardians (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(160) NOT NULL,
  relationship VARCHAR(80),
  phone VARCHAR(48),
  alt_phone VARCHAR(48),
  email VARCHAR(190),
  address VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX guardians_phone_idx (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS student_guardians (
  student_id BIGINT UNSIGNED NOT NULL,
  guardian_id BIGINT UNSIGNED NOT NULL,
  relationship VARCHAR(80),
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  is_emergency_contact TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (student_id, guardian_id),
  CONSTRAINT student_guardians_student_fk FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT student_guardians_guardian_fk FOREIGN KEY (guardian_id) REFERENCES guardians(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS enrollments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NOT NULL,
  academic_year_id BIGINT UNSIGNED,
  start_date DATE NOT NULL,
  end_date DATE,
  status ENUM('Active','Completed','Transferred','Cancelled') NOT NULL DEFAULT 'Active',
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX enrollments_student_year_idx (student_id, academic_year_id),
  CONSTRAINT enrollments_student_fk FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT enrollments_class_fk FOREIGN KEY (class_id) REFERENCES classes(id),
  CONSTRAINT enrollments_year_fk FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS student_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  previous_status VARCHAR(32),
  new_status VARCHAR(32) NOT NULL,
  changed_on DATE NOT NULL,
  reason VARCHAR(500),
  changed_by BIGINT UNSIGNED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX student_status_history_student_idx (student_id, changed_on),
  CONSTRAINT student_status_student_fk FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT student_status_user_fk FOREIGN KEY (changed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS fee_structures (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  class_id BIGINT UNSIGNED,
  academic_year_id BIGINT UNSIGNED,
  due_date DATE,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX fee_structures_class_year_idx (class_id, academic_year_id),
  CONSTRAINT fees_class_fk FOREIGN KEY (class_id) REFERENCES classes(id),
  CONSTRAINT fees_year_fk FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS invoices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(48) NOT NULL UNIQUE,
  student_id BIGINT UNSIGNED NOT NULL,
  academic_year_id BIGINT UNSIGNED,
  issued_on DATE NOT NULL,
  due_on DATE,
  amount_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('Draft','Issued','Partially paid','Paid','Cancelled') NOT NULL DEFAULT 'Issued',
  notes TEXT,
  created_by BIGINT UNSIGNED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX invoices_student_status_idx (student_id, status),
  CONSTRAINT invoices_student_fk FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT invoices_year_fk FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
  CONSTRAINT invoices_user_fk FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS invoice_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  invoice_id BIGINT UNSIGNED NOT NULL,
  fee_structure_id BIGINT UNSIGNED,
  description VARCHAR(200) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT invoice_items_invoice_fk FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  CONSTRAINT invoice_items_fee_fk FOREIGN KEY (fee_structure_id) REFERENCES fee_structures(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  paid_at DATE NOT NULL,
  method VARCHAR(40) NOT NULL,
  reference VARCHAR(120),
  fee_description VARCHAR(200) NOT NULL,
  academic_year VARCHAR(40),
  received_by BIGINT UNSIGNED NOT NULL,
  invoice_id BIGINT UNSIGNED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX payments_student_idx (student_id, paid_at),
  CONSTRAINT payments_student_fk FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT payments_user_fk FOREIGN KEY (received_by) REFERENCES users(id),
  CONSTRAINT payments_invoice_fk FOREIGN KEY (invoice_id) REFERENCES invoices(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS receipts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  payment_id BIGINT UNSIGNED NOT NULL UNIQUE,
  receipt_number VARCHAR(48) NOT NULL UNIQUE,
  issued_at DATETIME NOT NULL,
  CONSTRAINT receipts_payment_fk FOREIGN KEY (payment_id) REFERENCES payments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(80) NOT NULL,
  entity_id BIGINT UNSIGNED,
  details TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT audit_user_fk FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
