const express       = require('express');
const router        = express.Router();
const { BrevoClient } = require('@getbrevo/brevo');
const fs            = require('fs');
const path          = require('path');

const ENV_PATH = path.join(__dirname, '../.env');

function readEnv() {
  try { return fs.readFileSync(ENV_PATH, 'utf8'); } catch { return ''; }
}

function writeEnvKey(key, value) {
  let content = readEnv();
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`;
  }
  fs.writeFileSync(ENV_PATH, content, 'utf8');
  process.env[key] = value;
}

// GET /api/email/config — returns masked values
router.get('/config', (req, res) => {
  const apiKey      = process.env.BREVO_API_KEY      || '';
  const senderEmail = process.env.BREVO_SENDER_EMAIL || '';
  const senderName  = process.env.BREVO_SENDER_NAME  || '';
  const isDefault   = (v) => !v || v.startsWith('your_');
  res.json({
    apiKey:      isDefault(apiKey)      ? '' : apiKey.slice(0, 6)      + '••••••••••••••',
    senderEmail: isDefault(senderEmail) ? '' : senderEmail.replace(/(.{2}).+(@.+)/, '$1••••$2'),
    senderName,
    configured:  !isDefault(apiKey) && !isDefault(senderEmail),
  });
});

// POST /api/email/config — update .env values
router.post('/config', (req, res) => {
  const { apiKey, senderEmail, senderName } = req.body;
  if (apiKey      !== undefined) writeEnvKey('BREVO_API_KEY',      apiKey);
  if (senderEmail !== undefined) writeEnvKey('BREVO_SENDER_EMAIL', senderEmail);
  if (senderName  !== undefined) writeEnvKey('BREVO_SENDER_NAME',  senderName);
  res.json({ ok: true });
});

// POST /api/email/config/remove — clear Brevo configuration
router.post('/config/remove', (req, res) => {
  writeEnvKey('BREVO_API_KEY', '');
  writeEnvKey('BREVO_SENDER_EMAIL', '');
  writeEnvKey('BREVO_SENDER_NAME', '');
  res.json({ ok: true });
});

function getClient() {
  return new BrevoClient({ apiKey: process.env.BREVO_API_KEY || '' });
}

const SENDER = () => ({
  email: process.env.BREVO_SENDER_EMAIL || '',
  name:  process.env.BREVO_SENDER_NAME  || 'Work Desk',
});

// POST /api/email/send
// Body: { to_email, to_name, subject, message_html }
router.post('/send', async (req, res) => {
  const { to_email, to_name, subject, message_html } = req.body;

  if (!to_email || !subject || !message_html) {
    return res.status(400).json({ error: 'to_email, subject, message_html required' });
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey || apiKey === 'your_brevo_api_key_here') {
    return res.status(503).json({ error: 'Brevo API key not configured in server/.env' });
  }

  try {
    const brevo = getClient();
    await brevo.transactionalEmails.sendTransacEmail({
      sender:      SENDER(),
      to:          [{ email: to_email, name: to_name || to_email }],
      subject,
      htmlContent: message_html,
    });
    res.json({ ok: true });
  } catch (err) {
    const msg = err?.response?.body?.message || err?.message || 'Unknown error';
    console.error('[Brevo] send error:', msg);
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
