require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/auth', require('./routes/authRoutes'));
app.use('/tasks', require('./routes/taskRoutes'));
app.use('/issues', require('./routes/issueRoutes'));
app.use('/staff', require('./routes/staffRoutes'));
app.use('/departments', require('./routes/departmentRoutes'));
app.use('/admins', require('./routes/adminRoutes'));
app.use('/delegations', require('./routes/delegationRoutes'));
app.use('/trash',  require('./routes/trashRoutes'));
app.use('/email',  require('./routes/emailRoutes'));

// Activity log — simple in-memory store (upgradeable to Supabase table)
const actLog = [];
app.get('/activity', (req, res) => res.json(actLog.slice(0, 300)));
app.post('/activity', (req, res) => { actLog.unshift({ id: Date.now(), ...req.body, at: new Date().toISOString() }); if (actLog.length > 500) actLog.length = 500; res.json({ ok: true }); });

app.get('/health', (_, res) => res.json({ status: 'ok' }));

// Export the Express app for Vercel Serverless Functions
module.exports = app;
