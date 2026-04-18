const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLog');

const router = express.Router();
router.use(authenticate);

const ANNUAL_RATE = 1.67;
const SICK_RATE = 1.25;

async function calcLeaveBalance(empId, startDate, leaveType, rate, targetYear) {
  const fyStart = new Date(`${targetYear}-01-01`);
  const fyEnd = new Date(`${targetYear}-12-31`);
  const now = new Date();
  const empStart = new Date(startDate);

  const accrualStart = empStart > fyStart ? empStart : fyStart;
  const accrualEnd = now < fyEnd ? now : fyEnd;

  let totalAccrued = 0;
  if (accrualStart <= accrualEnd) {
    const month = new Date(accrualStart.getFullYear(), accrualStart.getMonth(), 1);
    while (month <= accrualEnd) {
      totalAccrued += rate;
      month.setMonth(month.getMonth() + 1);
    }
  }

  const [carryRes, takenRes] = await Promise.all([
    pool.query(
      'SELECT days FROM leave_carry_overs WHERE employee_id = $1 AND fiscal_year = $2 AND leave_type = $3',
      [empId, targetYear, leaveType]
    ),
    pool.query(
      `SELECT COALESCE(SUM(days), 0) as total
       FROM leave_applications
       WHERE employee_id = $1 AND status = 'approved' AND leave_type = $2
         AND EXTRACT(YEAR FROM start_date) = $3`,
      [empId, leaveType, targetYear]
    ),
  ]);

  const carryOver = parseFloat(carryRes.rows[0]?.days || 0);
  const leaveTaken = parseFloat(takenRes.rows[0]?.total || 0);
  const remaining = carryOver + totalAccrued - leaveTaken;

  return {
    carryOver:    Math.round(carryOver    * 100) / 100,
    totalAccrued: Math.round(totalAccrued * 100) / 100,
    leaveTaken:   Math.round(leaveTaken   * 100) / 100,
    remaining:    Math.round(remaining    * 100) / 100,
  };
}

async function calcBalance(emp, year) {
  const targetYear = year || new Date().getFullYear();
  const [annual, sick] = await Promise.all([
    calcLeaveBalance(emp.id, emp.start_date, 'Annual Leave', ANNUAL_RATE, targetYear),
    calcLeaveBalance(emp.id, emp.start_date, 'Sick Leave',   SICK_RATE,   targetYear),
  ]);
  return { year: targetYear, annual, sick };
}

async function setCarryOver(empId, fiscalYear, leaveType, days) {
  await pool.query(
    `INSERT INTO leave_carry_overs (employee_id, fiscal_year, leave_type, days)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (employee_id, fiscal_year, leave_type) DO UPDATE SET days = $4`,
    [empId, fiscalYear, leaveType, Number(days) || 0]
  );
}

const EMP_SELECT = `
  SELECT e.*,
    (e.first_name || ' ' || e.last_name) as name,
    d.name as department_name,
    (s.first_name || ' ' || s.last_name) as supervisor_name,
    u.role as user_role
  FROM employees e
  LEFT JOIN departments d ON e.department_id = d.id
  LEFT JOIN employees s ON e.supervisor_id = s.id
  LEFT JOIN users u ON u.employee_id = e.id
`;

router.get('/', async (req, res) => {
  try {
    const { role, employeeId } = req.user;
    const { year, supervisor_id } = req.query;
    const targetYear = Number(year) || new Date().getFullYear();

    let rows;
    if (role === 'employee') {
      const r = await pool.query(EMP_SELECT + ' WHERE e.id = $1', [employeeId]);
      rows = r.rows;
    } else if (role === 'supervisor') {
      // Supervisors see their direct reports
      const r = await pool.query(EMP_SELECT + ' WHERE e.supervisor_id = $1 ORDER BY d.name, e.last_name, e.first_name', [employeeId]);
      rows = r.rows;
    } else {
      // Admin sees all; optional supervisor_id filter
      if (supervisor_id) {
        const r = await pool.query(EMP_SELECT + ' WHERE e.supervisor_id = $1 ORDER BY d.name, e.last_name, e.first_name', [supervisor_id]);
        rows = r.rows;
      } else {
        const r = await pool.query(EMP_SELECT + ' ORDER BY d.name, e.last_name, e.first_name');
        rows = r.rows;
      }
    }

    const result = await Promise.all(rows.map(async emp => ({
      ...emp,
      balance: await calcBalance(emp, targetYear),
    })));
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/balance', async (req, res) => {
  try {
    const { role, employeeId } = req.user;
    const targetId = Number(req.params.id);
    if (role === 'employee' && employeeId !== targetId) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await pool.query('SELECT * FROM employees WHERE id = $1', [targetId]);
    if (!rows[0]) return res.status(404).json({ error: 'Employee not found' });

    const year = Number(req.query.year) || new Date().getFullYear();
    res.json(await calcBalance(rows[0], year));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { role, employeeId } = req.user;
    const targetId = Number(req.params.id);
    if (role === 'employee' && employeeId !== targetId) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await pool.query(EMP_SELECT + ' WHERE e.id = $1', [targetId]);
    if (!rows[0]) return res.status(404).json({ error: 'Employee not found' });

    const year = Number(req.query.year) || new Date().getFullYear();
    res.json({ ...rows[0], balance: await calcBalance(rows[0], year) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', requireRole('admin', 'supervisor'), async (req, res) => {
  const {
    first_name, last_name, email, department_id, start_date,
    job_title, supervisor_id, supervisor_position,
    password, carry_over_annual, carry_over_sick, year,
  } = req.body;

  if (!first_name || !last_name || !email || !start_date) {
    return res.status(400).json({ error: 'First name, last name, email, and start date are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const empRes = await client.query(
      `INSERT INTO employees (first_name, last_name, email, department_id, start_date, job_title, supervisor_id, supervisor_position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        first_name.trim(), last_name.trim(), email.toLowerCase().trim(),
        department_id || null, start_date,
        job_title || null, supervisor_id || null, supervisor_position || null,
      ]
    );
    const empId = empRes.rows[0].id;
    const fiscalYear = Number(year) || new Date().getFullYear();

    if (Number(carry_over_annual) > 0) await setCarryOver(empId, fiscalYear, 'Annual Leave', carry_over_annual);
    if (Number(carry_over_sick) > 0)   await setCarryOver(empId, fiscalYear, 'Sick Leave', carry_over_sick);

    const hash = bcrypt.hashSync(password || 'password123', 10);
    await client.query(
      "INSERT INTO users (email, password_hash, role, employee_id) VALUES ($1, $2, 'employee', $3)",
      [email.toLowerCase().trim(), hash, empId]
    );

    await client.query('COMMIT');
    await logAudit(req.user.id, 'create_employee', 'employee', empId, { email });
    res.status(201).json({ id: empId, message: 'Employee created' });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

router.put('/:id', requireRole('admin', 'supervisor'), async (req, res) => {
  const {
    first_name, last_name, email, department_id, start_date,
    job_title, supervisor_id, supervisor_position,
    carry_over_annual, carry_over_sick, year, role,
  } = req.body;
  const empId = Number(req.params.id);
  const fiscalYear = Number(year) || new Date().getFullYear();

  try {
    await pool.query(
      `UPDATE employees SET
        first_name = $1, last_name = $2, email = $3, department_id = $4, start_date = $5,
        job_title = $6, supervisor_id = $7, supervisor_position = $8
       WHERE id = $9`,
      [
        first_name, last_name, email?.toLowerCase().trim(),
        department_id || null, start_date,
        job_title || null, supervisor_id || null, supervisor_position || null,
        empId,
      ]
    );

    if (carry_over_annual !== undefined) await setCarryOver(empId, fiscalYear, 'Annual Leave', carry_over_annual);
    if (carry_over_sick !== undefined)   await setCarryOver(empId, fiscalYear, 'Sick Leave', carry_over_sick);

    // Update user email and optionally role
    if (email) {
      await pool.query('UPDATE users SET email = $1 WHERE employee_id = $2', [email.toLowerCase().trim(), empId]);
    }
    if (role && ['admin', 'supervisor', 'employee'].includes(role)) {
      await pool.query('UPDATE users SET role = $1 WHERE employee_id = $2', [role, empId]);
    }

    await logAudit(req.user.id, 'update_employee', 'employee', empId, { email });
    res.json({ message: 'Updated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE employee_id = $1', [req.params.id]);
    await pool.query('DELETE FROM employees WHERE id = $1', [req.params.id]);
    await logAudit(req.user.id, 'delete_employee', 'employee', Number(req.params.id));
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = { router, calcBalance };
