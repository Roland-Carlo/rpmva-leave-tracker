const express = require('express');
const { getDb } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { calcBalance } = require('./employees');

const router = express.Router();
router.use(authenticate);

function workingDays(start, end) {
  let count = 0;
  const cur = new Date(start);
  const last = new Date(end);
  while (cur <= last) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

router.get('/', (req, res) => {
  const db = getDb();
  const { role, employeeId } = req.user;
  const { status, year, employee_id } = req.query;

  let sql = `
    SELECT la.*, e.name as employee_name, d.name as department_name, u.email as reviewer_email
    FROM leave_applications la
    JOIN employees e ON la.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN users u ON la.reviewed_by = u.id
    WHERE 1=1
  `;
  const params = [];

  if (role === 'employee') {
    sql += ' AND la.employee_id = ?'; params.push(employeeId);
  } else if (employee_id) {
    sql += ' AND la.employee_id = ?'; params.push(employee_id);
  }
  if (status) { sql += ' AND la.status = ?'; params.push(status); }
  if (year)   { sql += " AND strftime('%Y', la.start_date) = ?"; params.push(String(year)); }

  sql += ' ORDER BY la.created_at DESC';

  const rows = params.length
    ? db.prepare(sql).all(params)
    : db.prepare(sql).all();
  res.json(rows);
});

router.get('/pending-count', requireRole('admin', 'hr'), (req, res) => {
  const row = getDb().prepare("SELECT COUNT(*) as c FROM leave_applications WHERE status = 'pending'").get();
  res.json({ count: row.c });
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const leave = db.prepare(`
    SELECT la.*, e.name as employee_name, d.name as department_name
    FROM leave_applications la
    JOIN employees e ON la.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE la.id = ?
  `).get(Number(req.params.id));

  if (!leave) return res.status(404).json({ error: 'Not found' });
  if (req.user.role === 'employee' && leave.employee_id !== req.user.employeeId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(leave);
});

router.post('/', (req, res) => {
  const { role, employeeId } = req.user;
  const { start_date, end_date, leave_type, reason, employee_id } = req.body;

  const VALID_TYPES = ['Annual Leave', 'Sick Leave'];
  const type = leave_type || 'Annual Leave';
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Leave type must be Annual Leave or Sick Leave' });

  if (!start_date || !end_date) return res.status(400).json({ error: 'Start and end dates required' });
  if (new Date(start_date) > new Date(end_date)) return res.status(400).json({ error: 'End date must be after start date' });

  const targetEmpId = role === 'employee' ? employeeId : (employee_id || employeeId);
  const db = getDb();
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(targetEmpId);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const days = workingDays(start_date, end_date);
  if (days === 0) return res.status(400).json({ error: 'No working days in selected range' });

  const year = new Date(start_date).getFullYear();
  const balance = calcBalance(emp, year);
  const typeBalance = type === 'Sick Leave' ? balance.sick : balance.annual;
  if (days > typeBalance.remaining) {
    return res.status(400).json({
      error: `Insufficient ${type} balance. You have ${typeBalance.remaining} days remaining but requested ${days} days.`,
    });
  }

  const overlap = db.prepare(
    "SELECT id FROM leave_applications WHERE employee_id = ? AND status != 'rejected' AND NOT (end_date < ? OR start_date > ?)"
  ).get([targetEmpId, start_date, end_date]);
  if (overlap) return res.status(400).json({ error: 'You already have a leave application for this period' });

  const info = db.run(
    'INSERT INTO leave_applications (employee_id, leave_type, start_date, end_date, days, reason) VALUES (?, ?, ?, ?, ?, ?)',
    [targetEmpId, leave_type || 'Annual Leave', start_date, end_date, days, reason || null]
  );
  res.status(201).json({ id: Number(info.lastInsertRowid), days, message: 'Leave application submitted' });
});

router.put('/:id/approve', requireRole('admin', 'hr'), (req, res) => {
  const db = getDb();
  const leave = db.prepare('SELECT * FROM leave_applications WHERE id = ?').get(Number(req.params.id));
  if (!leave) return res.status(404).json({ error: 'Not found' });
  if (leave.status !== 'pending') return res.status(400).json({ error: 'Leave is not pending' });

  db.run(
    "UPDATE leave_applications SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, reviewer_notes = ? WHERE id = ?",
    [req.user.id, req.body.notes || null, Number(req.params.id)]
  );
  res.json({ message: 'Approved' });
});

router.put('/:id/reject', requireRole('admin', 'hr'), (req, res) => {
  const db = getDb();
  const leave = db.prepare('SELECT * FROM leave_applications WHERE id = ?').get(Number(req.params.id));
  if (!leave) return res.status(404).json({ error: 'Not found' });
  if (leave.status !== 'pending') return res.status(400).json({ error: 'Leave is not pending' });

  db.run(
    "UPDATE leave_applications SET status = 'rejected', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, reviewer_notes = ? WHERE id = ?",
    [req.user.id, req.body.notes || null, Number(req.params.id)]
  );
  res.json({ message: 'Rejected' });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const leave = db.prepare('SELECT * FROM leave_applications WHERE id = ?').get(Number(req.params.id));
  if (!leave) return res.status(404).json({ error: 'Not found' });
  if (req.user.role === 'employee' && leave.employee_id !== req.user.employeeId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (leave.status !== 'pending') return res.status(400).json({ error: 'Only pending leaves can be cancelled' });
  db.run('DELETE FROM leave_applications WHERE id = ?', Number(req.params.id));
  res.json({ message: 'Cancelled' });
});

module.exports = router;
