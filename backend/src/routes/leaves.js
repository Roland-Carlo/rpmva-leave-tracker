const express = require('express');
const pool = require('../db/pool');
const { authenticate, requireRole } = require('../middleware/auth');
const { calcBalance } = require('./employees');
const { logAudit } = require('../middleware/auditLog');

const router = express.Router();
router.use(authenticate);

const VALID_STATUSES = ['pending', 'approved', 'rejected', 'returned', 'cancelled'];

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

async function canActOnLeave(req, leave) {
  const { role, employeeId } = req.user;
  if (role === 'admin') return true;
  if (role === 'supervisor') {
    const { rows } = await pool.query(
      'SELECT supervisor_id FROM employees WHERE id = $1',
      [leave.employee_id]
    );
    return rows[0]?.supervisor_id === employeeId;
  }
  return false;
}

router.get('/', async (req, res) => {
  try {
    const { role, employeeId } = req.user;
    const { status, year, employee_id } = req.query;

    let sql = `
      SELECT la.*, e.first_name, e.last_name, (e.first_name || ' ' || e.last_name) as employee_name,
             d.name as department_name, u.email as reviewer_email
      FROM leave_applications la
      JOIN employees e ON la.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users u ON la.reviewed_by = u.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (role === 'employee') {
      sql += ` AND la.employee_id = $${idx++}`; params.push(employeeId);
    } else if (role === 'supervisor') {
      // Show only direct reports' leaves
      sql += ` AND e.supervisor_id = $${idx++}`; params.push(employeeId);
      if (employee_id) { sql += ` AND la.employee_id = $${idx++}`; params.push(employee_id); }
    } else {
      if (employee_id) { sql += ` AND la.employee_id = $${idx++}`; params.push(employee_id); }
    }

    if (status) { sql += ` AND la.status = $${idx++}`; params.push(status); }
    if (year)   { sql += ` AND EXTRACT(YEAR FROM la.start_date) = $${idx++}`; params.push(Number(year)); }

    sql += ' ORDER BY la.created_at DESC';

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/pending-count', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { role, employeeId } = req.user;
    let sql = "SELECT COUNT(*)::int as count FROM leave_applications la JOIN employees e ON la.employee_id = e.id WHERE la.status = 'pending'";
    const params = [];

    if (role === 'supervisor') {
      sql += ' AND e.supervisor_id = $1';
      params.push(employeeId);
    }

    const { rows } = await pool.query(sql, params);
    res.json({ count: rows[0].count });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT la.*, (e.first_name || ' ' || e.last_name) as employee_name, d.name as department_name
      FROM leave_applications la
      JOIN employees e ON la.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE la.id = $1
    `, [Number(req.params.id)]);

    const leave = rows[0];
    if (!leave) return res.status(404).json({ error: 'Not found' });
    if (req.user.role === 'employee' && leave.employee_id !== req.user.employeeId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(leave);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { role, employeeId } = req.user;
    const { start_date, end_date, leave_type, reason, employee_id } = req.body;

    const VALID_TYPES = ['Annual Leave', 'Sick Leave'];
    const type = leave_type || 'Annual Leave';
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Leave type must be Annual Leave or Sick Leave' });
    if (!start_date || !end_date) return res.status(400).json({ error: 'Start and end dates required' });
    if (new Date(start_date) > new Date(end_date)) return res.status(400).json({ error: 'End date must be after start date' });

    const targetEmpId = role === 'employee' ? employeeId : (Number(employee_id) || employeeId);
    const { rows: empRows } = await pool.query('SELECT * FROM employees WHERE id = $1', [targetEmpId]);
    if (!empRows[0]) return res.status(404).json({ error: 'Employee not found' });

    const days = workingDays(start_date, end_date);
    if (days === 0) return res.status(400).json({ error: 'No working days in selected range' });

    const year = new Date(start_date).getFullYear();
    const balance = await calcBalance(empRows[0], year);
    const typeBalance = type === 'Sick Leave' ? balance.sick : balance.annual;
    if (days > typeBalance.remaining) {
      return res.status(400).json({
        error: `Insufficient ${type} balance. You have ${typeBalance.remaining} days remaining but requested ${days} days.`,
      });
    }

    const { rows: overlap } = await pool.query(
      `SELECT id FROM leave_applications
       WHERE employee_id = $1 AND status NOT IN ('rejected', 'cancelled')
         AND NOT (end_date < $2 OR start_date > $3)`,
      [targetEmpId, start_date, end_date]
    );
    if (overlap.length) return res.status(400).json({ error: 'You already have a leave application for this period' });

    const { rows } = await pool.query(
      `INSERT INTO leave_applications (employee_id, leave_type, start_date, end_date, days, reason)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [targetEmpId, type, start_date, end_date, days, reason || null]
    );
    const leaveId = rows[0].id;
    await logAudit(req.user.id, 'submit_leave', 'leave', leaveId, { type, start_date, end_date, days });
    res.status(201).json({ id: leaveId, days, message: 'Leave application submitted' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Edit a returned leave (employee only, resets to pending)
router.put('/:id/edit', async (req, res) => {
  try {
    const { role, employeeId } = req.user;
    const { start_date, end_date, leave_type, reason } = req.body;

    const { rows } = await pool.query('SELECT * FROM leave_applications WHERE id = $1', [Number(req.params.id)]);
    const leave = rows[0];
    if (!leave) return res.status(404).json({ error: 'Not found' });
    if (role === 'employee' && leave.employee_id !== employeeId) return res.status(403).json({ error: 'Forbidden' });
    if (leave.status !== 'returned') return res.status(400).json({ error: 'Only returned leaves can be edited' });

    const VALID_TYPES = ['Annual Leave', 'Sick Leave'];
    const type = leave_type || leave.leave_type;
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid leave type' });
    if (!start_date || !end_date) return res.status(400).json({ error: 'Start and end dates required' });
    if (new Date(start_date) > new Date(end_date)) return res.status(400).json({ error: 'End date must be after start date' });

    const days = workingDays(start_date, end_date);
    if (days === 0) return res.status(400).json({ error: 'No working days in selected range' });

    const { rows: empRows } = await pool.query('SELECT * FROM employees WHERE id = $1', [leave.employee_id]);
    const year = new Date(start_date).getFullYear();
    const balance = await calcBalance(empRows[0], year);
    const typeBalance = type === 'Sick Leave' ? balance.sick : balance.annual;
    if (days > typeBalance.remaining) {
      return res.status(400).json({
        error: `Insufficient ${type} balance. ${typeBalance.remaining} days remaining, ${days} requested.`,
      });
    }

    await pool.query(
      `UPDATE leave_applications
       SET leave_type = $1, start_date = $2, end_date = $3, days = $4, reason = $5,
           status = 'pending', reviewed_by = NULL, reviewed_at = NULL, reviewer_notes = NULL, updated_at = NOW()
       WHERE id = $6`,
      [type, start_date, end_date, days, reason || null, Number(req.params.id)]
    );
    await logAudit(req.user.id, 'edit_leave', 'leave', Number(req.params.id), { type, start_date, end_date, days });
    res.json({ message: 'Leave updated and resubmitted' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id/approve', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM leave_applications WHERE id = $1', [Number(req.params.id)]);
    const leave = rows[0];
    if (!leave) return res.status(404).json({ error: 'Not found' });
    if (leave.status !== 'pending') return res.status(400).json({ error: 'Leave is not pending' });
    if (!(await canActOnLeave(req, leave))) return res.status(403).json({ error: 'Forbidden' });

    await pool.query(
      `UPDATE leave_applications
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), reviewer_notes = $2, updated_at = NOW()
       WHERE id = $3`,
      [req.user.id, req.body.notes || null, Number(req.params.id)]
    );
    await logAudit(req.user.id, 'approve_leave', 'leave', Number(req.params.id));
    res.json({ message: 'Approved' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id/reject', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM leave_applications WHERE id = $1', [Number(req.params.id)]);
    const leave = rows[0];
    if (!leave) return res.status(404).json({ error: 'Not found' });
    if (leave.status !== 'pending') return res.status(400).json({ error: 'Leave is not pending' });
    if (!(await canActOnLeave(req, leave))) return res.status(403).json({ error: 'Forbidden' });

    await pool.query(
      `UPDATE leave_applications
       SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), reviewer_notes = $2, updated_at = NOW()
       WHERE id = $3`,
      [req.user.id, req.body.notes || null, Number(req.params.id)]
    );
    await logAudit(req.user.id, 'reject_leave', 'leave', Number(req.params.id));
    res.json({ message: 'Rejected' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id/return', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM leave_applications WHERE id = $1', [Number(req.params.id)]);
    const leave = rows[0];
    if (!leave) return res.status(404).json({ error: 'Not found' });
    if (leave.status !== 'pending') return res.status(400).json({ error: 'Leave is not pending' });
    if (!(await canActOnLeave(req, leave))) return res.status(403).json({ error: 'Forbidden' });
    if (!req.body.notes?.trim()) return res.status(400).json({ error: 'A note is required when returning a leave' });

    await pool.query(
      `UPDATE leave_applications
       SET status = 'returned', reviewed_by = $1, reviewed_at = NOW(), reviewer_notes = $2, updated_at = NOW()
       WHERE id = $3`,
      [req.user.id, req.body.notes.trim(), Number(req.params.id)]
    );
    await logAudit(req.user.id, 'return_leave', 'leave', Number(req.params.id), { notes: req.body.notes });
    res.json({ message: 'Returned for revision' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id/cancel', async (req, res) => {
  try {
    const { role, employeeId } = req.user;
    const { rows } = await pool.query('SELECT * FROM leave_applications WHERE id = $1', [Number(req.params.id)]);
    const leave = rows[0];
    if (!leave) return res.status(404).json({ error: 'Not found' });

    if (role === 'employee') {
      if (leave.employee_id !== employeeId) return res.status(403).json({ error: 'Forbidden' });
      if (!['pending', 'returned'].includes(leave.status)) return res.status(400).json({ error: 'Only pending or returned leaves can be cancelled' });
    } else if (role === 'supervisor') {
      if (!(await canActOnLeave(req, leave))) return res.status(403).json({ error: 'Forbidden' });
    }
    // admin can cancel anything

    await pool.query(
      `UPDATE leave_applications
       SET status = 'cancelled', cancelled_by = $1, cancelled_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [req.user.id, Number(req.params.id)]
    );
    await logAudit(req.user.id, 'cancel_leave', 'leave', Number(req.params.id));
    res.json({ message: 'Cancelled' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Keep DELETE for backward compat — redirects to cancel
router.delete('/:id', async (req, res) => {
  try {
    const { role, employeeId } = req.user;
    const { rows } = await pool.query('SELECT * FROM leave_applications WHERE id = $1', [Number(req.params.id)]);
    const leave = rows[0];
    if (!leave) return res.status(404).json({ error: 'Not found' });
    if (role === 'employee' && leave.employee_id !== employeeId) return res.status(403).json({ error: 'Forbidden' });
    if (!['pending', 'returned'].includes(leave.status)) return res.status(400).json({ error: 'Only pending or returned leaves can be cancelled' });

    await pool.query(
      `UPDATE leave_applications SET status = 'cancelled', cancelled_by = $1, cancelled_at = NOW() WHERE id = $2`,
      [req.user.id, Number(req.params.id)]
    );
    res.json({ message: 'Cancelled' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
