const express = require('express');
const pool = require('../db/pool');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLog');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT d.*, COUNT(e.id)::int as employee_count
      FROM departments d LEFT JOIN employees e ON e.department_id = d.id
      GROUP BY d.id ORDER BY d.name
    `);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Department name required' });

    const { rows } = await pool.query(
      'INSERT INTO departments (name) VALUES ($1) RETURNING id, name',
      [name.trim()]
    );
    await logAudit(req.user.id, 'create_department', 'department', rows[0].id, { name: name.trim() });
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Department already exists' });
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Department name required' });

    const { rowCount } = await pool.query(
      'UPDATE departments SET name = $1 WHERE id = $2',
      [name.trim(), Number(req.params.id)]
    );
    if (!rowCount) return res.status(404).json({ error: 'Department not found' });
    await logAudit(req.user.id, 'update_department', 'department', Number(req.params.id), { name: name.trim() });
    res.json({ id: Number(req.params.id), name: name.trim() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int as c FROM employees WHERE department_id = $1',
      [Number(req.params.id)]
    );
    if (rows[0].c > 0) return res.status(400).json({ error: 'Cannot delete department with employees' });

    await pool.query('DELETE FROM departments WHERE id = $1', [Number(req.params.id)]);
    await logAudit(req.user.id, 'delete_department', 'department', Number(req.params.id));
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
