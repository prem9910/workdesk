const express       = require('express');
const router        = express.Router();
const { BrevoClient } = require('@getbrevo/brevo');
const fs            = require('fs');
const path          = require('path');
const supabase      = require('../supabase');

const ENV_PATH = path.join(__dirname, '../.env');
const IS_VERCEL = !!process.env.VERCEL;

function readEnv() {
  try { return fs.readFileSync(ENV_PATH, 'utf8'); } catch { return ''; }
}

function writeEnvKey(key, value) {
  // Skip filesystem writes on Vercel (read-only filesystem)
  if (IS_VERCEL) {
    process.env[key] = value;
    return;
  }
  
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

// Store config in Supabase for Vercel compatibility
const CONFIG_TABLE = 'email_config';

async function getDbConfig() {
  const { data, error } = await supabase
    .from(CONFIG_TABLE)
    .select('*')
    .single();

  if (error || !data) {
    return {
      brevo_api_key: '',
      brevo_sender_email: '',
      brevo_sender_name: ''
    };
  }
  return data;
}

async function saveDbConfig(config) {
  const { data, error } = await supabase
    .from(CONFIG_TABLE)
    .upsert(config)
    .select()
    .single();

  if (error) {
    console.error('Error saving email config to Supabase:', error.message);
    return null;
  }
  return data;
}

async function removeDbConfig() {
  const { error } = await supabase
    .from(CONFIG_TABLE)
    .delete()
    .eq('id', 1);

  if (error) {
    console.error('Error removing email config from Supabase:', error.message);
    return false;
  }
  return true;
}

// GET /api/email/config — returns masked values
router.get('/config', async (req, res) => {
  try {
    // Try Supabase first, fall back to .env for local development
    const dbConfig = await getDbConfig();
    const apiKey = dbConfig.brevo_api_key || process.env.BREVO_API_KEY || '';
    const senderEmail = dbConfig.brevo_sender_email || process.env.BREVO_SENDER_EMAIL || '';
    const senderName = dbConfig.brevo_sender_name || process.env.BREVO_SENDER_NAME || '';

    const isDefault = (v) => !v || v.startsWith('your_');
    res.json({
      apiKey:      isDefault(apiKey)      ? '' : apiKey.slice(0, 6)      + '••••••••••••••',
      senderEmail: isDefault(senderEmail) ? '' : senderEmail.replace(/(.{2}).+(@.+)/, '$1••••$2'),
      senderName,
      configured:  !isDefault(apiKey) && !isDefault(senderEmail),
    });
  } catch (err) {
    // Fallback to .env only
    const apiKey = process.env.BREVO_API_KEY || '';
    const senderEmail = process.env.BREVO_SENDER_EMAIL || '';
    const senderName = process.env.BREVO_SENDER_NAME || '';
    const isDefault = (v) => !v || v.startsWith('your_');
    res.json({
      apiKey:      isDefault(apiKey)      ? '' : apiKey.slice(0, 6)      + '••••••••••••••',
      senderEmail: isDefault(senderEmail) ? '' : senderEmail.replace(/(.{2}).+(@.+)/, '$1••••$2'),
      senderName,
      configured:  !isDefault(apiKey) && !isDefault(senderEmail),
    });
  }
});

// POST /api/email/config — update configuration
router.post('/config', async (req, res) => {
  const { apiKey, senderEmail, senderName } = req.body;

  try {
    // Save to Supabase
    const config = {};
    if (apiKey !== undefined) config.brevo_api_key = apiKey;
    if (senderEmail !== undefined) config.brevo_sender_email = senderEmail;
    if (senderName !== undefined) config.brevo_sender_name = senderName;

    if (Object.keys(config).length > 0) {
      await saveDbConfig({ id: 1, ...config });
    }

    // Also update .env for local development
    if (apiKey !== undefined) writeEnvKey('BREVO_API_KEY', apiKey);
    if (senderEmail !== undefined) writeEnvKey('BREVO_SENDER_EMAIL', senderEmail);
    if (senderName !== undefined) writeEnvKey('BREVO_SENDER_NAME', senderName);

    res.json({ ok: true });
  } catch (err) {
    console.error('Error saving config:', err.message);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// POST /api/email/config/remove — clear configuration
router.post('/config/remove', async (req, res) => {
  try {
    // Remove from Supabase
    await removeDbConfig();

    // Also clear .env for local development
    writeEnvKey('BREVO_API_KEY', '');
    writeEnvKey('BREVO_SENDER_EMAIL', '');
    writeEnvKey('BREVO_SENDER_NAME', '');

    res.json({ ok: true });
  } catch (err) {
    console.error('Error removing config:', err.message);
    res.status(500).json({ error: 'Failed to remove configuration' });
  }
});

// Helper to get config (checks Supabase first, then .env)
async function getConfig() {
  try {
    const dbConfig = await getDbConfig();
    return {
      apiKey: dbConfig.brevo_api_key || process.env.BREVO_API_KEY || '',
      senderEmail: dbConfig.brevo_sender_email || process.env.BREVO_SENDER_EMAIL || '',
      senderName: dbConfig.brevo_sender_name || process.env.BREVO_SENDER_NAME || 'Work Desk',
    };
  } catch {
    return {
      apiKey: process.env.BREVO_API_KEY || '',
      senderEmail: process.env.BREVO_SENDER_EMAIL || '',
      senderName: process.env.BREVO_SENDER_NAME || 'Work Desk',
    };
  }
}

function getClient() {
  return new BrevoClient({ apiKey: process.env.BREVO_API_KEY || '' });
}

// POST /api/email/send
router.post('/send', async (req, res) => {
  const { to_email, to_name, subject, message_html } = req.body;

  if (!to_email || !subject || !message_html) {
    return res.status(400).json({ error: 'to_email, subject, message_html required' });
  }

  // Get config from Supabase or .env
  const config = await getConfig();
  const apiKey = config.apiKey;

  if (!apiKey || apiKey === 'your_brevo_api_key_here') {
    console.error('[Brevo] API key not configured. Config:', { 
      hasApiKey: !!config.apiKey, 
      hasSenderEmail: !!config.senderEmail,
      senderName: config.senderName 
    });
    return res.status(503).json({ error: 'Brevo API key not configured. Please configure email settings in Admin panel.' });
  }

  if (!config.senderEmail) {
    console.error('[Brevo] Sender email not configured');
    return res.status(503).json({ error: 'Sender email not configured. Please configure email settings in Admin panel.' });
  }

  try {
    const brevo = new BrevoClient({ apiKey });
    const result = await brevo.transactionalEmails.sendTransacEmail({
      sender:      { email: config.senderEmail, name: config.senderName || 'Work Desk' },
      to:          [{ email: to_email, name: to_name || to_email }],
      subject,
      htmlContent: message_html,
    });
    console.log('[Brevo] Email sent successfully to:', to_email, 'messageId:', result.messageId);
    res.json({ ok: true, messageId: result.messageId });
  } catch (err) {
    const msg = err?.response?.body?.message || err?.message || 'Unknown error';
    console.error('[Brevo] send error:', msg, 'status:', err?.response?.status, 'details:', err?.response?.body);
    res.status(500).json({ error: msg });
  }
});

// GET /api/email/test-config - test if email config is valid
router.get('/test-config', async (req, res) => {
  try {
    const config = await getConfig();
    const isValid = config.apiKey && config.apiKey !== 'your_brevo_api_key_here' && config.senderEmail;
    
    res.json({
      configured: isValid,
      hasApiKey: !!config.apiKey,
      hasSenderEmail: !!config.senderEmail,
      senderName: config.senderName || 'Work Desk',
      source: config.apiKey ? 'supabase' : 'env'
    });
  } catch (err) {
    console.error('[Email] test-config error:', err.message);
    res.status(500).json({ error: err.message, configured: false });
  }
});

module.exports = router;
