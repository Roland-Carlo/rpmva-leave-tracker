const express = require('express');
const pool = require('../db/pool');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(requireRole('admin', 'supervisor'));

router.get('/leaves', async (req, res) => {
  try {
    const { year, status, department_id, leave_type } = req.query;
    const { role, employeeId } = req.user;

    let sql = `
      SELECT
        (e.first_name || ' ' || e.last_name) as "Employee Name",
        d.name as "Department",
        e.job_title as "Job Title",
        la.leave_type as "Leave Type",
        TO_CHAR(la.start_date, 'YYYY-MM-DD') as "Start Date",
        TO_CHAR(la.end_date, 'YYYY-MM-DD') as "End Date",
        la.days as "Days",
        la.status as "Status",
        la.reason as "Reason",
        la.reviewer_notes as "Reviewer Notes",
        TO_CHAR(la.created_at, 'YYYY-MM-DD') as "Applied On"
      FROM leave_applications la
      JOIN employees e ON la.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (role === 'supervisor') {
      sql += ` AND e.supervisor_id = $${idx++}`;
      params.push(employeeId);
    }
    if (year)          { sql += ` AND EXTRACT(YEAR FROM la.start_date) = $${idx++}`; params.push(Number(year)); }
    if (status)        { sql += ` AND la.status = $${idx++}`; params.push(status); }
    if (department_id) { sql += ` AND e.department_id = $${idx++}`; params.push(Number(department_id)); }
    if (leave_type)    { sql += ` AND la.leave_type = $${idx++}`; params.push(leave_type); }

    sql += ' ORDER BY la.created_at DESC';

    const { rows } = await pool.query(sql, params);

    if (!rows.length) {
      return res.status(200)
        .setHeader('Content-Type', 'text/csv')
        .send('No records found');
    }

    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map(row =>
        headers.map(h => {
          const val = row[h] == null ? '' : String(row[h]);
          return val.includes(',') || val.includes('"') || val.includes('\n')
            ? `"${val.replace(/"/g, '""')}"`
            : val;
        }).join(',')
      ),
    ].join('\n');

    const filename = `leaves_${year || 'all'}_${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
