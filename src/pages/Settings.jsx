import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { Alert } from '../components/common/Alert';
import { Modal } from '../components/common/Modal';
import {
  buildYearRange,
  collectExportData,
  buildExportPayload,
  downloadJsonFile,
  readJsonFile,
  validateImportPayload,
  detectDuplicates,
  mergeImport,
  toDay,
  fDate,
} from '../utils';

// Types we import / export. Order is fixed so the UI lists rows predictably.
const IMPORT_TYPES = ['tasks', 'issues', 'handovers', 'delegations', 'notices', 'actLog'];
const TYPE_LABELS = {
  tasks:       'Tasks',
  issues:      'Issues',
  handovers:   'Handovers',
  delegations: 'Delegations',
  notices:     'Notices',
  actLog:      'Activity Log',
};
const TYPE_ICONS = {
  tasks:       '✅',
  issues:      '⚠️',
  handovers:   '📥',
  delegations: '📤',
  notices:     '🔔',
  actLog:      '📜',
};

const IS = { width: '100%', padding: '9px 13px', borderRadius: 8, border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif", fontSize: 13, color: '#1a2535', outline: 'none', background: 'white', fontWeight: 600 };

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 15 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ background: 'white', borderRadius: 14, border: '1px solid #d8e2ef', padding: 22, marginBottom: 18 }}>
      <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: '#0b1e3d', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid #f0f4f8' }}>{title}</h3>
      {children}
    </div>
  );
}

function CopyBtn({ text, label = '📋 Copy' }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{ padding: '4px 12px', borderRadius: 6, background: copied ? '#d4edda' : '#f3f7fc', border: `1px solid ${copied ? '#86efac' : '#d8e2ef'}`, color: copied ? '#1a7a4a' : '#4a5568', fontSize: 11, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
    >
      {copied ? '✅ Copied!' : label}
    </button>
  );
}

// ── EmailJS template definitions ──────────────────────────────────────────────
// Body of every EmailJS template = {{{message_html}}}  (triple braces)
// Subject is set per-template below.

export default function Settings() {
  const { currentRole, currentUser, refreshPermsFromEmployees } = useAuth();
  const { employees, admins, tasks, issues, handovers, delegations, notices, actLog, save, logAct } = useApp();

  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwMsg,  setPwMsg]  = useState('');
  const [showPw, setShowPw] = useState(false);

  const [profileForm, setProfileForm] = useState({ contact: '', email: '', username: '' });
  const [profileMsg,  setProfileMsg]  = useState('');

  useEffect(() => {
    if (currentRole !== 'staff' && currentRole !== 'admin') return;
    const emp = employees.find(e => e.id === currentUser.empId);
    if (emp) setProfileForm({ contact: emp.contact || '', email: emp.email || '', username: emp.username || emp.name || '' });
  }, [employees, currentUser.empId, currentRole]);

  const saved = (() => { try { return JSON.parse(localStorage.getItem('workdesk-emailcfg') || '{}'); } catch { return {}; } })();
  const [emailForm, setEmailForm] = useState({
    hospitalName: saved.hospitalName || 'Work Desk',
  });
  const [emailMsg, setEmailMsg] = useState('');

  // Brevo config state
  const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
  const [brevoForm, setBrevoForm] = useState({ apiKey: '', senderEmail: '', senderName: '' });
  const [brevoMasked, setBrevoMasked] = useState({ apiKey: '', senderEmail: '', senderName: '', configured: false });
  const [brevoMsg, setBrevoMsg] = useState('');
  const [brevoLoading, setBrevoLoading] = useState(false);
  const [showBrevo, setShowBrevo] = useState({ apiKey: false, senderEmail: false });

  useEffect(() => {
    if (currentRole !== 'mainadmin') return;
    fetch(`${SERVER}/api/email/config`)
      .then(r => r.json())
      .then(d => setBrevoMasked(d))
      .catch(() => {});
  }, [currentRole]);

  async function saveBrevoConfig() {
    const payload = {};
    if (brevoForm.apiKey.trim())      payload.apiKey      = brevoForm.apiKey.trim();
    if (brevoForm.senderEmail.trim()) payload.senderEmail = brevoForm.senderEmail.trim();
    if (brevoForm.senderName.trim())  payload.senderName  = brevoForm.senderName.trim();
    if (!Object.keys(payload).length) { setBrevoMsg('❌ Please enter at least one field to update!'); return; }
    setBrevoLoading(true);
    try {
      const r = await fetch(`${SERVER}/api/email/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error();
      setBrevoMsg('✅ Configuration saved! Please restart the server.');
      setBrevoForm({ apiKey: '', senderEmail: '', senderName: '' });
      const d = await fetch(`${SERVER}/api/email/config`).then(r2 => r2.json());
      setBrevoMasked(d);
      await logAct('BREVO CONFIG UPDATED', '');
    } catch {
      setBrevoMsg('❌ Could not connect to the server.');
    } finally {
      setBrevoLoading(false);
    }
  }

  async function removeBrevoConfig() {
    if (!window.confirm('Are you sure you want to remove the email configuration? Emails will stop working until you configure it again.')) return;
    setBrevoLoading(true);
    try {
      const r = await fetch(`${SERVER}/api/email/config/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!r.ok) throw new Error();
      setBrevoMsg('✅ Email configuration removed! Please restart the server.');
      setBrevoMasked({ apiKey: '', senderEmail: '', senderName: '', configured: false });
      setBrevoForm({ apiKey: '', senderEmail: '', senderName: '' });
      await logAct('BREVO CONFIG REMOVED', '');
    } catch {
      setBrevoMsg('❌ Could not connect to the server.');
    } finally {
      setBrevoLoading(false);
    }
  }

  async function saveProfile() {
    const emp = employees.find(e => e.id === currentUser.empId);
    if (!emp) { setProfileMsg('❌ Employee record not found!'); return; }
    const newUsername = (profileForm.username || '').trim();
    if (!newUsername) { setProfileMsg('❌ Username cannot be empty!'); return; }
    const sanitized = newUsername.toLowerCase().replace(/\s+/g, '');
    if (!/^[a-z0-9_.]+$/.test(sanitized)) { setProfileMsg('❌ Username may only contain letters, digits, dot or underscore.'); return; }
    const collision = employees.find(e => e.id !== emp.id && (
      (e.username && e.username.toLowerCase() === sanitized) ||
      (e.name && e.name.toUpperCase() === sanitized.toUpperCase())
    ));
    if (collision) { setProfileMsg(`❌ Username "${sanitized}" is already in use by ${collision.name}.`); return; }
    await save('workdesk-employees', employees.map(e =>
      e.id === emp.id ? { ...e, contact: profileForm.contact, email: profileForm.email, username: sanitized } : e
    ));
    if (refreshPermsFromEmployees) await refreshPermsFromEmployees();
    await logAct('PROFILE UPDATED', currentUser.name);
    setProfileMsg('✅ Profile updated successfully!');
  }

  async function changePw() {
    if (!pwForm.newPw.trim())                    { setPwMsg('❌ Password required!');      return; }
    if (pwForm.newPw !== pwForm.confirm)          { setPwMsg('❌ Passwords do not match!'); return; }
    if (currentRole === 'staff') {
      const emp = employees.find(e => e.name === currentUser.name);
      if (!emp)                                  { setPwMsg('❌ Employee not found!');      return; }
      if (emp.password !== pwForm.current)        { setPwMsg('❌ Current password wrong!'); return; }
      await save('workdesk-employees', employees.map(e => e.id === emp.id ? { ...e, password: pwForm.newPw } : e));
    } else if (currentRole === 'admin') {
      const adm = admins.find(a => a.username === currentUser.name);
      if (!adm)                                  { setPwMsg('❌ Admin not found!');         return; }
      if (adm.password !== pwForm.current)        { setPwMsg('❌ Current password wrong!'); return; }
      await save('workdesk-admins', admins.map(a => a.id === adm.id ? { ...a, password: pwForm.newPw } : a));
    } else {
      setPwMsg('❌ Main admin password is hardcoded — change in constants/index.js'); return;
    }
    await logAct('PASSWORD CHANGED', currentUser.name);
    setPwMsg('✅ Password changed successfully!');
    setPwForm({ current: '', newPw: '', confirm: '' });
  }

  async function saveEmailCfg() {
    localStorage.setItem('workdesk-emailcfg', JSON.stringify(emailForm));
    setEmailMsg('✅ Email config saved!');
    await logAct('EMAIL CONFIG UPDATED', '');
  }

  // ── Export / Import state ────────────────────────────────────────────────
  // Both flows live as modals so the user can't navigate away mid-download.
  // The import flow is a small state machine: pick file → review → decide
  // per-type (skip / keep-both) → confirm → write to Supabase.
  const [showExport, setShowExport] = useState(false);
  const [exportFileName, setExportFileName] = useState('');
  const [exportYearMode, setExportYearMode] = useState('current'); // 'current' | 'custom' | 'all'
  const [exportCustomFrom, setExportCustomFrom] = useState('');
  const [exportCustomTo, setExportCustomTo] = useState('');
  const [exportError, setExportError] = useState('');

  const [showImport, setShowImport] = useState(false);
  const [importError, setImportError] = useState('');
  const [importPreview, setImportPreview] = useState(null); // { detected, fileName }
  const [importChoices, setImportChoices] = useState({});   // { type: 'skip' | 'keep-both' }
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  // Default export filename = "workdesk_<role>_<YYYY-MM-DD>"
  useEffect(() => {
    if (showExport && !exportFileName) {
      const role = currentRole || 'user';
      setExportFileName(`workdesk_${role}_${toDay()}`);
    }
  }, [showExport, exportFileName, currentRole]);

  // Live preview of what will be exported (counts only — keeps the modal fast)
  const exportPreview = useMemo(() => {
    if (!showExport) return null;
    const yr = buildYearRange(exportYearMode, exportCustomFrom, exportCustomTo);
    const cols = collectExportData({
      currentRole, currentUser,
      tasks, issues, handovers, delegations, notices, actLog,
      yearRange: yr,
    });
    const total = Object.values(cols).reduce((a, b) => a + (b?.length || 0), 0);
    return { yr, cols, total };
  }, [showExport, exportYearMode, exportCustomFrom, exportCustomTo, currentRole, currentUser, tasks, issues, handovers, delegations, notices, actLog]);

  function doExport() {
    setExportError('');
    const name = (exportFileName || `workdesk_${currentRole || 'user'}_${toDay()}`).trim();
    if (!name) { setExportError('File name is required.'); return; }
    if (!exportPreview || exportPreview.total === 0) {
      setExportError('No data to export with the current filter.');
      return;
    }
    const yr = exportPreview.yr;
    const payload = buildExportPayload({
      currentRole, currentUser,
      collections: exportPreview.cols, yearRange: yr,
    });
    downloadJsonFile(payload, name);
    logAct('DATA EXPORTED', `${name} (${exportPreview.total} records)`);
    setShowExport(false);
  }

  function closeExport() {
    setShowExport(false);
    setExportError('');
    setExportFileName('');
    setExportYearMode('current');
    setExportCustomFrom('');
    setExportCustomTo('');
  }

  async function onPickFile(e) {
    const file = e.target.files?.[0];
    // Clear the input so picking the SAME file twice still triggers onChange.
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    setImportError('');
    const res = await readJsonFile(file);
    if (!res.ok) { setImportError(res.error); return; }
    const validationIssues = validateImportPayload(res.payload);
    if (validationIssues.length) { setImportError(validationIssues.join(' ')); return; }

    const detected = detectDuplicates(res.payload, {
      tasks, issues, handovers, delegations, notices, actLog,
    });
    // Default per-type choices: keep-both if any dupes (so user can review),
    // otherwise skip (no decision needed — fresh rows just get added).
    const initialChoices = {};
    IMPORT_TYPES.forEach((t) => {
      initialChoices[t] = detected[t].duplicates.length > 0 ? 'keep-both' : 'skip';
    });
    setImportChoices(initialChoices);
    setImportPreview({ detected, fileName: file.name });
  }

  async function doImport() {
    if (!importPreview) return;
    setImporting(true);
    setImportError('');
    try {
      const { detected } = importPreview;
      const merged = mergeImport({ detected, choices: importChoices });
      // Persist every non-empty bucket to its hops-* table via save().
      const typeToKey = {
        tasks:       'workdesk-tasks',
        issues:      'workdesk-issues',
        handovers:   'workdesk-handovers',
        delegations: 'workdesk-delegations',
        notices:     'workdesk-notices',
        actLog:      'workdesk-actlog',
      };
      const stateToArr = {
        tasks:       tasks,
        issues:      issues,
        handovers:   handovers,
        delegations: delegations,
        notices:     notices,
        actLog:      actLog,
      };
      let totalAdded = 0;
      for (const t of IMPORT_TYPES) {
        const add = merged[t] || [];
        if (!add.length) continue;
        const next = [...(stateToArr[t] || []), ...add];
        await save(typeToKey[t], next);
        totalAdded += add.length;
      }
      await logAct('DATA IMPORTED', `${importPreview.fileName} (${totalAdded} records added)`);
      setShowImport(false);
      setImportPreview(null);
      setImportChoices({});
    } catch (e) {
      setImportError('Import failed: ' + (e?.message || 'unknown error'));
    } finally {
      setImporting(false);
    }
  }

  function closeImport() {
    setShowImport(false);
    setImportError('');
    setImportPreview(null);
    setImportChoices({});
    setImporting(false);
  }


  return (
    <div>
      <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, color: '#0b1e3d', marginBottom: 20 }}>⚙️ Settings</h2>

      {/* ── My Profile — staff/admin only ── */}
      {(currentRole === 'staff' || currentRole === 'admin') && (
        <Card title="👤 My Profile">
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: '#f3f7fc', border: '1px solid #e4eaf2' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, color: '#6b7a90', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>Name</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1a2535' }}>{currentUser.name}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, color: '#6b7a90', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>Department</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1a2535' }}>🔒 {currentUser.dept || '—'}</div>
            </div>
          </div>
          {profileMsg && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: profileMsg.startsWith('✅') ? '#d4edda' : '#fde8e8', color: profileMsg.startsWith('✅') ? '#1a7a4a' : '#c0392b', fontWeight: 700, fontSize: 12 }}>
              {profileMsg}
            </div>
          )}
          <Field label="Username (your login ID)">
            <input value={profileForm.username} onChange={e => setProfileForm({ ...profileForm, username: e.target.value })} placeholder="login-id" style={IS} />
          </Field>
          <Field label="Contact / Phone">
            <input value={profileForm.contact} onChange={e => setProfileForm({ ...profileForm, contact: e.target.value })} placeholder="PHONE NUMBER" style={IS} />
          </Field>
          <Field label="Email">
            <input value={profileForm.email} onChange={e => setProfileForm({ ...profileForm, email: e.target.value })} placeholder="EMAIL ADDRESS" style={IS} />
          </Field>
          <button onClick={saveProfile} style={{ padding: '9px 20px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>💾 Save Profile</button>
        </Card>
      )}

      {/* ── Password ── */}
      <Card title="🔐 Change Password">
        {pwMsg && (
          <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: pwMsg.startsWith('✅') ? '#d4edda' : '#fde8e8', color: pwMsg.startsWith('✅') ? '#1a7a4a' : '#c0392b', fontWeight: 700, fontSize: 12 }}>
            {pwMsg}
          </div>
        )}
        <Field label="Current Password">
          <input type={showPw ? 'text' : 'password'} value={pwForm.current} onChange={e => setPwForm({ ...pwForm, current: e.target.value })} placeholder="CURRENT PASSWORD" style={IS} />
        </Field>
        <Field label="New Password">
          <input type={showPw ? 'text' : 'password'} value={pwForm.newPw} onChange={e => setPwForm({ ...pwForm, newPw: e.target.value })} placeholder="NEW PASSWORD" style={IS} />
        </Field>
        <Field label="Confirm New Password">
          <input type={showPw ? 'text' : 'password'} value={pwForm.confirm} onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })} placeholder="CONFIRM NEW PASSWORD" style={IS} />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, marginBottom: 14 }}>
          <input type="checkbox" checked={showPw} onChange={e => setShowPw(e.target.checked)} style={{ accentColor: '#0d7377' }} /> Show Password
        </label>
        <button onClick={changePw} style={{ padding: '9px 20px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>🔐 Change Password</button>
      </Card>

      {/* ── EmailJS Config — mainadmin only ── */}
      {currentRole === 'mainadmin' && (<>

        <Card title="📧 Email Config (Brevo)">
          {emailMsg && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#d4edda', color: '#1a7a4a', fontWeight: 700, fontSize: 12 }}>
              {emailMsg}
            </div>
          )}

          {/* Status badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '8px 12px', borderRadius: 8, background: brevoMasked.configured ? '#d4edda' : '#fff3cd', border: `1px solid ${brevoMasked.configured ? '#86efac' : '#ffc107'}` }}>
            <span style={{ fontSize: 16 }}>{brevoMasked.configured ? '✅' : '⚠️'}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: brevoMasked.configured ? '#1a7a4a' : '#856404' }}>
              {brevoMasked.configured ? 'Brevo is configured — emails are active' : 'Brevo is not yet configured — emails will not be sent'}
            </span>
          </div>

          {/* Current masked values */}
          {brevoMasked.configured && (
            <div style={{ background: '#f3f7fc', border: '1px solid #d8e2ef', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Current Config (masked)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontSize: 12, color: '#4a5568' }}>🔑 API Key: <code style={{ fontFamily: 'monospace', color: '#0d7377' }}>{brevoMasked.apiKey || '••••••••••••••'}</code></div>
                <div style={{ fontSize: 12, color: '#4a5568' }}>📧 Sender: <code style={{ fontFamily: 'monospace', color: '#0d7377' }}>{brevoMasked.senderEmail || '••••'}</code></div>
                <div style={{ fontSize: 12, color: '#4a5568' }}>🏥 Name: <span style={{ fontWeight: 700 }}>{brevoMasked.senderName || '—'}</span></div>
              </div>
            </div>
          )}

          {brevoMsg && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: brevoMsg.startsWith('✅') ? '#d4edda' : '#f8d7da', color: brevoMsg.startsWith('✅') ? '#1a7a4a' : '#721c24', fontWeight: 700, fontSize: 12 }}>
              {brevoMsg}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* API Key */}
            <Field label="Brevo API Key">
              <div style={{ position: 'relative' }}>
                <input
                  type={showBrevo.apiKey ? 'text' : 'password'}
                  value={brevoForm.apiKey}
                  onChange={e => setBrevoForm({ ...brevoForm, apiKey: e.target.value })}
                  placeholder={brevoMasked.configured ? '(leave blank = no change)' : 'xkeysib-xxxxxxxx...'}
                  style={{ ...IS, paddingRight: 44 }}
                />
                <button type="button" onClick={() => setShowBrevo(s => ({ ...s, apiKey: !s.apiKey }))} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: '#6b7a90' }}>
                  {showBrevo.apiKey ? '🙈' : '👁️'}
                </button>
              </div>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Sender Email */}
              <Field label="Sender Email (Gmail)">
                <div style={{ position: 'relative' }}>
                  <input
                    type={showBrevo.senderEmail ? 'text' : 'password'}
                    value={brevoForm.senderEmail}
                    onChange={e => setBrevoForm({ ...brevoForm, senderEmail: e.target.value })}
                    placeholder={brevoMasked.configured ? '(no change)' : 'you@gmail.com'}
                    style={{ ...IS, paddingRight: 44 }}
                  />
                  <button type="button" onClick={() => setShowBrevo(s => ({ ...s, senderEmail: !s.senderEmail }))} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: '#6b7a90' }}>
                    {showBrevo.senderEmail ? '🙈' : '👁️'}
                  </button>
                </div>
              </Field>

              {/* Sender Name */}
              <Field label="Sender Name">
                <input
                  type="text"
                  value={brevoForm.senderName}
                  onChange={e => setBrevoForm({ ...brevoForm, senderName: e.target.value })}
                  placeholder={brevoMasked.senderName || 'Work Desk'}
                  style={IS}
                />
              </Field>
            </div>

            {/* Organization Name */}
            <Field label="Organization Name (shown in email footer)">
              <input value={emailForm.hospitalName} onChange={e => setEmailForm({ ...emailForm, hospitalName: e.target.value })} placeholder="Work Desk" style={IS} />
            </Field>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={saveBrevoConfig} disabled={brevoLoading} style={{ padding: '9px 20px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: brevoLoading ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13, opacity: brevoLoading ? 0.7 : 1 }}>
              {brevoLoading ? '⏳ Saving...' : '💾 Save Brevo Config'}
            </button>
            <button onClick={saveEmailCfg} style={{ padding: '9px 20px', borderRadius: 8, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
              💾 Save Organization Name
            </button>
            {brevoMasked.configured && (
              <button onClick={removeBrevoConfig} disabled={brevoLoading} style={{ padding: '9px 20px', borderRadius: 8, background: '#dc2626', color: 'white', border: 'none', cursor: brevoLoading ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13, opacity: brevoLoading ? 0.7 : 1 }}>
                🗑️ Remove Config
              </button>
            )}
          </div>
        </Card>

      </>)}

      {/* ── Export & Import — mainadmin only ──
          JSON backup/restore gives full read/write to every hops-* table.
          Sub-admins and staff don't get this — they only see their own
          scoped data via the regular Excel export buttons on individual
          pages. The whole card is wrapped in the role gate (including its
          description text, since the "you will only export your own" copy
          was misleading for users who don't get the card at all). */}
      {currentRole === 'mainadmin' && (
      <Card title="📦 Export & Import Data">
        <div style={{ fontSize: 12, color: '#6b7a90', marginBottom: 14, lineHeight: 1.5 }}>
          Back up your records to a JSON file, or restore them on another device.
          <br />
          <span style={{ fontWeight: 800, color: '#0d7377' }}>
            As Main Admin you will export everything.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowExport(true)}
            style={{ padding: '10px 18px', borderRadius: 9, background: '#1a7a4a', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            ⬇️ Export to JSON
          </button>
          <button
            onClick={() => { setShowImport(true); setImportError(''); setImportPreview(null); }}
            style={{ padding: '10px 18px', borderRadius: 9, background: '#0d7377', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            ⬆️ Import from JSON
          </button>
        </div>
      </Card>
      )}

      {/* ── System Info ── */}
      <Card title="ℹ️ System Info">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            ['Logged in as', currentUser.name],
            ['Role', currentRole.toUpperCase()],
            ['Department', currentUser.dept || '—'],
            ['Build', 'Work Desk v1.0'],
          ].map(([k, v]) => (
            <div key={k} style={{ background: '#f3f7fc', padding: '10px 13px', borderRadius: 9, border: '1px solid #e4eaf2' }}>
              <div style={{ fontSize: 10.5, color: '#6b7a90', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>{k}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1a2535' }}>{v}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Export + Import modals — mainadmin only ──
          Wrapped in the role gate as defense in depth: even if a determined
          non-mainadmin sets showExport/showImport to true via React DevTools,
          the modal JSX never mounts so nothing renders. */}
      {currentRole === 'mainadmin' && (<>
      {/* ── Export modal — file name + year filter + live count preview ── */}
      <Modal open={showExport} onClose={closeExport} title="📤 Export Data to JSON" maxWidth="max-w-lg">
        <Field label="File Name">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              value={exportFileName}
              onChange={(e) => setExportFileName(e.target.value)}
              placeholder="workdesk_export"
              style={IS}
            />
            <span style={{ fontSize: 12, color: '#6b7a90', fontWeight: 700 }}>.json</span>
          </div>
        </Field>

        <Field label="Date Range">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'current', label: `📅 This Year (${new Date().getFullYear()})` },
              { id: 'custom',  label: '🗓 Custom Range' },
              { id: 'all',     label: '∞ All Data' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setExportYearMode(opt.id)}
                style={{
                  flex: '1 1 0', minWidth: 0, padding: '9px 8px', borderRadius: 8,
                  border: `1.5px solid ${exportYearMode === opt.id ? '#0d7377' : '#d8e2ef'}`,
                  background: exportYearMode === opt.id ? '#e8f8ef' : 'white',
                  color: exportYearMode === opt.id ? '#0d7377' : '#475569',
                  fontWeight: 800, fontSize: 11.5, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>

        {exportYearMode === 'custom' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <Field label="From">
              <input type="date" value={exportCustomFrom} onChange={(e) => setExportCustomFrom(e.target.value)} style={IS} />
            </Field>
            <Field label="To">
              <input type="date" value={exportCustomTo} onChange={(e) => setExportCustomTo(e.target.value)} style={IS} />
            </Field>
          </div>
        )}

        {/* Live preview — shows count of records per type that will be exported */}
        {exportPreview && (
          <div style={{ background: '#f3f7fc', border: '1px solid #d8e2ef', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7a90', textTransform: 'uppercase', letterSpacing: 0.5 }}>Preview</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0d7377' }}>
                {exportPreview.total} record{exportPreview.total === 1 ? '' : 's'} ready
              </div>
            </div>
            {exportPreview.yr.from || exportPreview.yr.to ? (
              <div style={{ fontSize: 11, color: '#475569', marginBottom: 8 }}>
                Range: <strong>{exportPreview.yr.from || '—'}</strong> to <strong>{exportPreview.yr.to || '—'}</strong>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: '#475569', marginBottom: 8 }}>Range: <strong>All time</strong></div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {IMPORT_TYPES.map((t) => (
                <div key={t} style={{ background: 'white', border: '1px solid #e4eaf2', borderRadius: 7, padding: '7px 9px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13 }}>{TYPE_ICONS[t]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: '#6b7a90', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>{TYPE_LABELS[t]}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#1a2535' }}>{(exportPreview.cols[t] || []).length}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {exportError && (
          <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#fde8e8', color: '#c0392b', fontWeight: 700, fontSize: 12 }}>
            ❌ {exportError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
          <button
            onClick={doExport}
            disabled={!exportPreview || exportPreview.total === 0}
            style={{ flex: 1, padding: '10px', borderRadius: 8, background: '#1a7a4a', color: 'white', border: 'none', cursor: (!exportPreview || exportPreview.total === 0) ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13, opacity: (!exportPreview || exportPreview.total === 0) ? 0.6 : 1 }}
          >
            ⬇️ Download JSON
          </button>
          <button onClick={closeExport} style={{ flex: 1, padding: '10px', borderRadius: 8, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
            Cancel
          </button>
        </div>
      </Modal>

      {/* ── Import modal — file picker → preview → per-type choice → confirm ── */}
      <Modal open={showImport} onClose={closeImport} title="📥 Import Data from JSON" maxWidth="max-w-lg">
        {!importPreview ? (
          <>
            <div style={{ fontSize: 12, color: '#6b7a90', marginBottom: 14, lineHeight: 1.5 }}>
              Upload a JSON file previously exported from Work Desk. We'll scan it and show you
              any duplicates before adding anything to your account.
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={onPickFile}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ width: '100%', padding: '26px', borderRadius: 10, border: '2px dashed #0d7377', background: '#f0fafa', color: '#0d7377', fontWeight: 800, fontSize: 14, cursor: 'pointer', marginBottom: 14 }}
            >
              📂 Click to Choose JSON File
            </button>
            {importError && (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: '#fde8e8', color: '#c0392b', fontWeight: 700, fontSize: 12 }}>
                ❌ {importError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid #e2e8f0', marginTop: 4 }}>
              <button onClick={closeImport} style={{ flex: 1, padding: '10px', borderRadius: 8, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ background: '#f3f7fc', border: '1px solid #d8e2ef', borderRadius: 9, padding: '10px 12px', marginBottom: 14, fontSize: 12 }}>
              <div style={{ fontSize: 10, color: '#6b7a90', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4 }}>File</div>
              <div style={{ fontWeight: 800, color: '#1a2535', marginTop: 2 }}>📄 {importPreview.fileName}</div>
            </div>

            {/* Per-type summary with duplicate count and choice selector */}
            <div style={{ border: '1px solid #d8e2ef', borderRadius: 9, overflow: 'hidden', marginBottom: 14 }}>
              {IMPORT_TYPES.map((t, i) => {
                const d = importPreview.detected[t];
                const hasDupes = d.duplicates.length > 0;
                return (
                  <div key={t} style={{ padding: '11px 13px', borderTop: i === 0 ? 'none' : '1px solid #e4eaf2', background: hasDupes ? '#fff8eb' : 'white' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <span style={{ fontSize: 14 }}>{TYPE_ICONS[t]}</span>
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#1a2535' }}>{TYPE_LABELS[t]}</div>
                          <div style={{ fontSize: 11, color: '#6b7a90', marginTop: 1 }}>
                            {d.incoming.length} in file
                            {hasDupes && <span style={{ color: '#c0392b', fontWeight: 800 }}> · {d.duplicates.length} duplicate{d.duplicates.length === 1 ? '' : 's'}</span>}
                            {d.fresh.length > 0 && <span style={{ color: '#1a7a4a', fontWeight: 800 }}> · {d.fresh.length} new</span>}
                          </div>
                        </div>
                      </div>
                      {hasDupes ? (
                        <div style={{ display: 'flex', gap: 5 }}>
                          {[
                            { id: 'skip',      label: 'Skip dupes' },
                            { id: 'keep-both', label: 'Import as new' },
                          ].map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setImportChoices({ ...importChoices, [t]: opt.id })}
                              style={{
                                padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800,
                                border: `1.5px solid ${(importChoices[t] || 'skip') === opt.id ? '#0d7377' : '#d8e2ef'}`,
                                background: (importChoices[t] || 'skip') === opt.id ? '#e8f8ef' : 'white',
                                color: (importChoices[t] || 'skip') === opt.id ? '#0d7377' : '#6b7a90',
                                cursor: 'pointer',
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: '#1a7a4a', fontWeight: 800, padding: '4px 9px', borderRadius: 6, background: '#d4edda' }}>
                          ✓ Will add
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Duplicate list — show all flagged rows so user knows what they look like */}
            {(() => {
              const totalDupes = IMPORT_TYPES.reduce((a, t) => a + importPreview.detected[t].duplicates.length, 0);
              if (totalDupes === 0) return null;
              return (
                <div style={{ background: '#fff8eb', border: '1.5px solid #f5b7b1', borderRadius: 9, padding: '10px 12px', marginBottom: 14, maxHeight: 180, overflowY: 'auto' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#c0392b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                    ⚠️ {totalDupes} duplicate{totalDupes === 1 ? '' : 's'} found
                  </div>
                  {IMPORT_TYPES.map((t) => {
                    const dupes = importPreview.detected[t].duplicates;
                    if (!dupes.length) return null;
                    return (
                      <div key={t} style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#92400E', marginBottom: 3 }}>{TYPE_LABELS[t]}:</div>
                        {dupes.slice(0, 5).map((row, i) => (
                          <div key={i} style={{ fontSize: 11, color: '#6b7a90', paddingLeft: 8, fontFamily: 'monospace' }}>
                            · {row.name || row.title || row.taskName || row.subject || row.id}
                          </div>
                        ))}
                        {dupes.length > 5 && <div style={{ fontSize: 11, color: '#6b7a90', paddingLeft: 8, fontStyle: 'italic' }}>… and {dupes.length - 5} more</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {importError && (
              <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#fde8e8', color: '#c0392b', fontWeight: 700, fontSize: 12 }}>
                ❌ {importError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
              <button
                onClick={doImport}
                disabled={importing}
                style={{ flex: 1, padding: '10px', borderRadius: 8, background: '#0d7377', color: 'white', border: 'none', cursor: importing ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13, opacity: importing ? 0.6 : 1 }}
              >
                {importing ? '⏳ Importing...' : '✅ Confirm Import'}
              </button>
              <button onClick={() => { setImportPreview(null); setImportChoices({}); setImportError(''); }} style={{ flex: 1, padding: '10px', borderRadius: 8, background: 'transparent', color: '#0d7377', border: '1.5px solid #0d7377', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
                ← Choose Different File
              </button>
            </div>
          </>
        )}
      </Modal>
      </>)}
    </div>
  );
}
