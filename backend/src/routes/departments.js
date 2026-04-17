const express = require('express');
const { getDb } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const depts = getDb().prepare(`
    SELECT d.*, COUNT(e.id) as employee_count
    FROM departments d LEFT JOIN employees e ON e.department_id = d.id
    GROUP BY d.id ORDER BY d.name
  `).all();
  res.json(depts);
});

router.post('/', requireRole('admin'), (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Department name required' });
  try {
    const info = getDb().run('INSERT INTO departments (name) VALUES (?)', name.trim());
    res.status(201).json({ id: Number(info.lastInsertRowid), name: name.trim() });
  } catch {
    res.status(409).json({ error: 'Department already exists' });
  }
});

router.put('/:id', requireRole('admin'), (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Department name required' });
  const info = getDb().run('UPDATE departments SET name = ? WHERE id = ?', [name.trim(), Number(req.params.id)]);
  if (!info.changes) return res.status(404).json({ error: 'Department not found' });
  res.json({ id: Number(req.params.id), name: name.trim() });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as c FROM employees WHERE department_id = ?').get(Number(req.params.id)).c;
  if (count > 0) return res.status(400).json({ error: 'Cannot delete department with employees' });
  db.run('DELETE FROM departments WHERE id = ?', Number(req.params.id));
  res.json({ message: 'Deleted' });
});

module.exports = router;
