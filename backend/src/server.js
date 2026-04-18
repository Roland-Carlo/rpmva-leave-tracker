require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db/database');

const app = express();
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

initDb();

app.use('/api/auth',        require('./routes/auth'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/employees',   require('./routes/employees').router);
app.use('/api/leaves',      require('./routes/leaves'));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
