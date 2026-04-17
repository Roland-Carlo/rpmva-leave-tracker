const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const ANNUAL_RATE = 1.67;
const SICK_RATE = 1.25;

function calcLeaveBalance(db, emp, leaveType, rate, targetYear) {
  const startDate = new Date(emp.start_date);
  const now = new Date();

  let totalAccrued = 0;
  const fyStart = new Date(`${targetYear}-01-01`);
  const fyEnd = new Date(`${targetYear}-12-31`);
  const accrualStart = startDate > fyStart ? startDate : fyStart;
  const accrualEnd = now < fyEnd ? now : fyEnd;

  if (accrualStart <= accrualEnd) {
    const month = new Date(accrualStart.getFullYear(), accrualStart.getMonth(), 1);
    while (month <= accrualEnd) {
      totalAccrued += rate;
      month.setMonth(month.getMonth() + 1);
    }
  }

  const carryRow = db.prepare(
    'SELECT days FROM leave_carry_overs WHERE employee_id = ? AND fiscal_year = ? AND leave_type = ?'
  ).get([emp.id, targetYear, leaveType]);

  const takenRow = db.prepare(
    "SELECT COALESCE(SUM(days), 0) as total FROM leave_applications WHERE employee_id = ? AND status = 'approved' AND leave_type = ? AND strftime('%Y', start_date) = ?"
  ).get([emp.id, leaveType, String(targetYear)]);

  const carryOver = carryRow?.days || 0;
  const leaveTaken = takenRow?.total || 0;
  const remaining = carryOver + totalAccrued - leaveTaken;

  return {
    carryOver: Math.round(carryOver * 100) / 100,
    totalAccrued: Math.round(totalAccrued * 100) / 100,
    leaveTaken: Math.round(leaveTaken * 100) / 100,
    remaining: Math.round(remaining * 100) / 100,
  };
}

function calcBalance(emp, year) {
  const db = getDb();
  const targetYear = year || new Date().getFullYear();
  return {
    year: targetYear,
    annual: calcLeaveBalance(db, emp, 'Annual Leave', ANNUAL_RATE, targetYear),
    sick:   calcLeaveBalance(db, emp, 'Sick Leave',   SICK_RATE,   targetYear),
  };
}

function setCarryOver(db, empId, year, leaveType, days) {
  db.run(
    'INSERT OR REPLACE INTO leave_carry_overs (employee_id, fiscal_year, leave_type, days) VALUES (?, ?, ?, ?)',
    [empId, year, leaveType, Number(days) || 0]
  );
}

router.get('/', (req, res) => {
  const db = getDb();
  const { role, employeeId } = req.user;

  let employees;
  if (role === 'employee') {
    employees = db.prepare(`
      SELECT e.*, d.name as department_name
      FROM employees e LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.id = ?
    `).all(employeeId);
  } else {
    employees = db.prepare(`
      SELECT e.*, d.name as department_name
      FROM employees e LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY d.name, e.name
    `).all();
  }

  const year = Number(req.query.year) || new Date().getFullYear();
  res.json(employees.map(emp => ({ ...emp, balance: calcBalance(emp, year) })));
});

router.get('/:id/balance', (req, res) => {
  const db = getDb();
  const { role, employeeId } = req.user;
  const targetId = Number(req.params.id);
  if (role === 'employee' && employeeId !== targetId) return res.status(403).json({ error: 'Forbidden' });

  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(targetId);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const year = Number(req.query.year) || new Date().getFullYear();
  res.json(calcBalance(emp, year));
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const { role, employeeId } = req.user;
  const targetId = Number(req.params.id);
  if (role === 'employee' && employeeId !== targetId) return res.status(403).json({ error: 'Forbidden' });

  const emp = db.prepare(`
    SELECT e.*, d.name as department_name
    FROM employees e LEFT JOIN departments d ON e.department_id = d.id
    WHERE e.id = ?
  `).get(targetId);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const year = Number(req.query.year) || new Date().getFullYear();
  res.json({ ...emp, balance: calcBalance(emp, year) });
});

router.post('/', requireRole('admin', 'hr'), (req, res) => {
  const { name, email, department_id, start_date, password, carry_over_annual, carry_over_sick, year } = req.body;
  if (!name || !email || !start_date) return res.status(400).json({ error: 'Name, email, and start date are required' });

  const db = getDb();
  const fiscalYear = year || new Date().getFullYear();
  try {
    const info = db.run(
      'INSERT INTO employees (name, email, department_id, start_date) VALUES (?, ?, ?, ?)',
      [name.trim(), email.toLowerCase().trim(), department_id || null, start_date]
    );
    const empId = Number(info.lastInsertRowid);

    if (Number(carry_over_annual) > 0) setCarryOver(db, empId, fiscalYear, 'Annual Leave', carry_over_annual);
    if (Number(carry_over_sick) > 0)   setCarryOver(db, empId, fiscalYear, 'Sick Leave', carry_over_sick);

    const hash = bcrypt.hashSync(password || 'password123', 10);
    db.run(
      "INSERT INTO users (email, password_hash, role, employee_id) VALUES (?, ?, 'employee', ?)",
      [email.toLowerCase().trim(), hash, empId]
    );

    res.status(201).json({ id: empId, message: 'Employee created' });
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
    throw e;
  }
});

router.put('/:id', requireRole('admin', 'hr'), (req, res) => {
  const { name, email, department_id, start_date, carry_over_annual, carry_over_sick, year } = req.body;
  const db = getDb();
  const empId = Number(req.params.id);
  const fiscalYear = year || new Date().getFullYear();

  db.run(
    'UPDATE employees SET name = ?, email = ?, department_id = ?, start_date = ? WHERE id = ?',
    [name, email?.toLowerCase().trim(), department_id || null, start_date, empId]
  );

  if (carry_over_annual !== undefined) setCarryOver(db, empId, fiscalYear, 'Annual Leave', carry_over_annual);
  if (carry_over_sick !== undefined)   setCarryOver(db, empId, fiscalYear, 'Sick Leave', carry_over_sick);

  db.run('UPDATE users SET email = ? WHERE employee_id = ?', [email?.toLowerCase().trim(), empId]);
  res.json({ message: 'Updated' });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  db.run('DELETE FROM users WHERE employee_id = ?', req.params.id);
  db.run('DELETE FROM employees WHERE id = ?', req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = { router, calcBalance };
