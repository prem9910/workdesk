require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/tasks', require('./routes/taskRoutes'));
app.use('/api/issues', require('./routes/issueRoutes'));
app.use('/api/staff', require('./routes/staffRoutes'));
app.use('/api/departments', require('./routes/departmentRoutes'));
app.use('/api/admins', require('./routes/adminRoutes'));
app.use('/api/delegations', require('./routes/delegationRoutes'));
app.use('/api/trash',  require('./routes/trashRoutes'));
app.use('/api/email',  require('./routes/emailRoutes'));

// Activity log — simple in-memory store (upgradeable to Supabase table)
const actLog = [];
app.get('/api/activity', (req, res) => res.json(actLog.slice(0, 300)));
app.post('/api/activity', (req, res) => { actLog.unshift({ id: Date.now(), ...req.body, at: new Date().toISOString() }); if (actLog.length > 500) actLog.length = 500; res.json({ ok: true }); });

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

// Export the Express app for Vercel Serverless Functions
module.exports = app;
