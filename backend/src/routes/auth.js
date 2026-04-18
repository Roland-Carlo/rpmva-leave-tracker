const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLog');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { rows } = await pool.query(`
      SELECT u.*, (e.first_name || ' ' || e.last_name) as employee_name, e.id as emp_id
      FROM users u LEFT JOIN employees e ON u.employee_id = e.id
      WHERE u.email = $1
    `, [email.toLowerCase().trim()]);

    const user = rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, employeeId: user.employee_id },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    await logAudit(user.id, 'login', 'user', user.id, { email: user.email });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        employeeId: user.employee_id,
        name: user.employee_name || user.email,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.email, u.role, u.employee_id,
             (e.first_name || ' ' || e.last_name) as employee_name,
             d.name as department_name
      FROM users u
      LEFT JOIN employees e ON u.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE u.id = $1
    `, [req.user.id]);

    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.employee_id,
      name: user.employee_name || user.email,
      department: user.department_name,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    await logAudit(req.user.id, 'change_password', 'user', req.user.id);
    res.json({ message: 'Password updated successfully' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
