const { Database } = require('node-sqlite3-wasm');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/leave_tracker.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      start_date DATE NOT NULL,
      accrual_rate REAL DEFAULT 1.67,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'hr', 'employee')),
      employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS leave_carry_overs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      fiscal_year INTEGER NOT NULL,
      leave_type TEXT NOT NULL DEFAULT 'Annual Leave',
      days REAL DEFAULT 0,
      UNIQUE(employee_id, fiscal_year, leave_type)
    );

    CREATE TABLE IF NOT EXISTS leave_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      leave_type TEXT DEFAULT 'Annual Leave',
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      days REAL NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      reviewed_by INTEGER REFERENCES users(id),
      reviewed_at DATETIME,
      reviewer_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: add leave_type column to leave_carry_overs if missing
  const cols = db.prepare('PRAGMA table_info(leave_carry_overs)').all();
  if (!cols.some(c => c.name === 'leave_type')) {
    db.exec('ALTER TABLE leave_carry_overs RENAME TO leave_carry_overs_old');
    db.exec(`
      CREATE TABLE leave_carry_overs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        fiscal_year INTEGER NOT NULL,
        leave_type TEXT NOT NULL DEFAULT 'Annual Leave',
        days REAL DEFAULT 0,
        UNIQUE(employee_id, fiscal_year, leave_type)
      )
    `);
    db.exec(`
      INSERT INTO leave_carry_overs (employee_id, fiscal_year, leave_type, days)
        SELECT employee_id, fiscal_year, 'Annual Leave', days FROM leave_carry_overs_old
    `);
    db.exec('DROP TABLE leave_carry_overs_old');
  }

  seedData(db);
}

function seedData(db) {
  const deptCount = db.prepare('SELECT COUNT(*) as c FROM departments').get().c;
  if (deptCount > 0) return;

  const departments = [
    'People and Culture / HSEQ',
    'Accounts Team',
    'Sales Team',
    'Barrier Team',
    'Ops Team',
    'Workshop Team',
  ];
  departments.forEach(name => db.run('INSERT OR IGNORE INTO departments (name) VALUES (?)', name));

  const employees = [
    { name: 'Pat Silva',           email: 'pat.silva@company.com',           dept: 'People and Culture / HSEQ', start: '2025-01-01', carryOver: 1 },
    { name: 'Jennilyn Alias',      email: 'jennilyn.alias@company.com',      dept: 'People and Culture / HSEQ', start: '2026-04-01', carryOver: 0 },
    { name: 'Mariel Cabando',      email: 'mariel.cabando@company.com',      dept: 'Accounts Team',             start: '2025-01-01', carryOver: 10.5 },
    { name: 'Julie Ann Zapanta',   email: 'julieann.zapanta@company.com',    dept: 'Accounts Team',             start: '2025-01-01', carryOver: 2 },
    { name: 'Carmelo Hinacay',     email: 'carmelo.hinacay@company.com',     dept: 'Accounts Team',             start: '2026-04-01', carryOver: 0 },
    { name: 'Alejandra Garcia',    email: 'alejandra.garcia@company.com',    dept: 'Sales Team',                start: '2025-01-01', carryOver: 0 },
    { name: 'Aby Martinez',        email: 'aby.martinez@company.com',        dept: 'Sales Team',                start: '2025-09-01', carryOver: 0 },
    { name: 'Carlo Tolentino',     email: 'carlo.tolentino@company.com',     dept: 'Sales Team',                start: '2026-04-01', carryOver: 0 },
    { name: 'Cherry Bo Fernandez', email: 'cherrybo.fernandez@company.com',  dept: 'Barrier Team',              start: '2025-02-01', carryOver: 0 },
    { name: 'Elle Abella',         email: 'elle.abella@company.com',         dept: 'Ops Team',                  start: '2025-06-01', carryOver: 0 },
    { name: 'Virozette Janea',     email: 'virozette.janea@company.com',     dept: 'Workshop Team',             start: '2025-11-01', carryOver: 0 },
  ];

  const leaveTaken = {
    'pat.silva@company.com':          18,
    'mariel.cabando@company.com':     31.5,
    'julieann.zapanta@company.com':   14,
    'alejandra.garcia@company.com':   14,
    'aby.martinez@company.com':       1,
    'cherrybo.fernandez@company.com': 18,
    'elle.abella@company.com':        7.5,
    'virozette.janea@company.com':    6,
  };

  employees.forEach(emp => {
    const deptRow = db.get('SELECT id FROM departments WHERE name = ?', emp.dept);
    const info = db.run(
      'INSERT OR IGNORE INTO employees (name, email, department_id, start_date) VALUES (?, ?, ?, ?)',
      [emp.name, emp.email, deptRow.id, emp.start]
    );
    const empId = Number(info.lastInsertRowid);

    if (emp.carryOver > 0) {
      db.run(
        "INSERT OR IGNORE INTO leave_carry_overs (employee_id, fiscal_year, leave_type, days) VALUES (?, ?, 'Annual Leave', ?)",
        [empId, 2025, emp.carryOver]
      );
    }

    const taken = leaveTaken[emp.email] || 0;
    if (taken > 0) {
      db.run(
        "INSERT OR IGNORE INTO leave_applications (employee_id, leave_type, start_date, end_date, days, reason, status) VALUES (?, 'Annual Leave', ?, ?, ?, 'Historical leave record', 'approved')",
        [empId, '2025-01-01', '2025-12-31', taken]
      );
    }
  });

  const adminHash = bcrypt.hashSync('admin123', 10);
  db.run("INSERT OR IGNORE INTO users (email, password_hash, role) VALUES ('admin@company.com', ?, 'admin')", adminHash);

  const hrHash = bcrypt.hashSync('hr1234', 10);
  db.run("INSERT OR IGNORE INTO users (email, password_hash, role) VALUES ('hr@company.com', ?, 'hr')", hrHash);

  const defaultPass = bcrypt.hashSync('password123', 10);
  employees.forEach(emp => {
    const empRow = db.get('SELECT id FROM employees WHERE email = ?', emp.email);
    if (empRow) {
      db.run(
        "INSERT OR IGNORE INTO users (email, password_hash, role, employee_id) VALUES (?, ?, 'employee', ?)",
        [emp.email, defaultPass, empRow.id]
      );
    }
  });

  console.log('Database seeded successfully.');
}

module.exports = { getDb, initDb };
