-- ============================================================
-- Leave Tracker — Supabase (PostgreSQL) Schema
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Employees
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  job_title TEXT,
  start_date DATE NOT NULL,
  supervisor_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  supervisor_position TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (authentication)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'supervisor', 'employee')),
  employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leave carry-overs per fiscal year and type
CREATE TABLE IF NOT EXISTS leave_carry_overs (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  leave_type TEXT NOT NULL DEFAULT 'Annual Leave',
  days NUMERIC(6,2) DEFAULT 0,
  UNIQUE(employee_id, fiscal_year, leave_type)
);

-- Leave applications
CREATE TABLE IF NOT EXISTS leave_applications (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type TEXT DEFAULT 'Annual Leave',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days NUMERIC(6,2) NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'returned', 'cancelled')),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,
  cancelled_by INTEGER REFERENCES users(id),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Seed data (optional — run after table creation)
-- ============================================================

INSERT INTO departments (name) VALUES
  ('People and Culture / HSEQ'),
  ('Accounts Team'),
  ('Sales Team'),
  ('Barrier Team'),
  ('Ops Team'),
  ('Workshop Team')
ON CONFLICT (name) DO NOTHING;
