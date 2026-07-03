import {
  buildWelcomeHtml,
  buildAssignedHtml,
  buildCompletedHtml,
  buildReminderHtml,
  buildHandoverCreatedHtml,
  buildHandoverTasksHtml,
  buildHandoverResponseHtml,
} from './emailTemplates';

// Use relative path for API calls - works on both localhost and deployed sites
// On Vercel, API routes are at /api/* which are proxied to the server
const SERVER = ''; // Empty string means relative to current domain

// Read the email config. The settings page writes it as `workdesk-email`; an
// older version of this service used the `workdesk-emailcfg` key which left a
// bunch of deployments with empty cfg. New key wins; fall back to old key
// only if new key is missing — never overwrite, so user-saved config
// can't be clobbered.
function getCfg() {
  try {
    const newer = JSON.parse(localStorage.getItem('workdesk-email') || '{}');
    if (newer && Object.keys(newer).length > 0) return newer;
    return JSON.parse(localStorage.getItem('workdesk-emailcfg') || '{}');
  } catch {
    return {};
  }
}

async function send({ to_email, to_name, subject, message_html }) {
  if (!to_email) return;
  const res = await fetch(`${SERVER}/api/email/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to_email, to_name, subject, message_html }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
}

// ── 1. Welcome email — sent when a new employee is added ─────────────────────
export async function sendWelcomeEmail(employee) {
  if (!employee?.email) return;
  const cfg = getCfg();
  const hospital_name = cfg.hospitalName || 'Work Desk';
  const message_html = buildWelcomeHtml({
    to_name: employee.name,
    to_email: employee.email,
    dept:    employee.dept  || '—',
    role:    employee.role  || 'Staff',
    hospital_name,
    username: employee.username || (employee.email ? employee.email.split('@')[0] : '—'),
    password: employee.password || '—',
  });
  await send({
    to_email:     employee.email,
    to_name:      employee.name,
    subject:      `🗂️ Work Desk — Your Account Is Ready, ${employee.name}!`,
    message_html,
  });
}

// ── 2. Task assigned email ─────────────────────────────────────────────────────
// taskType: 'Normal Task' | 'Handover Task' | 'Delegation Task'
export async function sendTaskAssignedEmail(task, assignees, assignedBy, taskType = 'Normal Task') {
  if (!assignees?.length) return;
  const cfg = getCfg();
  const hospital_name = cfg.hospitalName || 'Work Desk';

  for (const emp of assignees) {
    if (!emp?.email) continue;
    const message_html = buildAssignedHtml({
      to_name:     emp.name,
      task_name:   task.name,
      task_type:   taskType,
      assigned_by: assignedBy || '—',
      dept:        task.dept       || '—',
      sched_date:  task.schedDate  || '—',
      task_time:   task.time       || '—',
      freq:        task.freq       || '—',
      priority:    task.priority   || 'Medium',
      notes:       task.notes      || '',
      hospital_name,
    });
    await send({
      to_email:     emp.email,
      to_name:      emp.name,
      subject:      `📋 ${taskType} Assigned: ${task.name}`,
      message_html,
    });
  }
}

// ── 3. Task completed email ────────────────────────────────────────────────────
export async function sendTaskCompletedEmail(task, employee) {
  if (!employee?.email) return;
  const cfg = getCfg();
  const hospital_name = cfg.hospitalName || 'Work Desk';
  const now = new Date();
  const message_html = buildCompletedHtml({
    to_name:      employee.name,
    task_name:    task.name,
    dept:         task.dept     || '—',
    completed_on: now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    completed_at: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    priority:     task.priority || 'Medium',
    freq:         task.freq     || '—',
    hospital_name,
  });
  await send({
    to_email:     employee.email,
    to_name:      employee.name,
    subject:      `✅ Task Completed: ${task.name}`,
    message_html,
  });
}

// ── 4a. Handover accepted tasks — email to toName (recipient) ────────────────
export async function sendHandoverTasksEmail(handover, toEmployee, taskList) {
  if (!toEmployee?.email || !taskList?.length) return;
  const cfg = getCfg();
  const hospital_name = cfg.hospitalName || 'Work Desk';
  const message_html = buildHandoverTasksHtml({
    to_name:    toEmployee.name,
    from_name:  handover.fromName,
    dept:       handover.dept      || '—',
    date_start: handover.dateStart || '—',
    date_end:   handover.dateEnd   || '—',
    tasks:      taskList,
    hospital_name,
  });
  await send({
    to_email:     toEmployee.email,
    to_name:      toEmployee.name,
    subject:      `📋 ${taskList.length} Handover Tasks — From ${handover.fromName} (${handover.dateStart} → ${handover.dateEnd})`,
    message_html,
  });
}

// ── 4b. Handover created — email to recipient (toName) ────────────────────────
export async function sendHandoverCreatedEmail(handover, toEmployee) {
  if (!toEmployee?.email) return;
  const cfg = getCfg();
  const hospital_name = cfg.hospitalName || 'Work Desk';
  const message_html = buildHandoverCreatedHtml({
    to_name:    toEmployee.name,
    from_name:  handover.fromName,
    dept:       handover.dept       || '—',
    date_start: handover.dateStart  || '—',
    date_end:   handover.dateEnd    || '—',
    task_count: (handover.taskIds   || []).length,
    notes:      handover.notes      || '',
    hospital_name,
  });
  await send({
    to_email:     toEmployee.email,
    to_name:      toEmployee.name,
    subject:      `🔄 Handover Request from ${handover.fromName} — ${(handover.taskIds || []).length} tasks`,
    message_html,
  });
}

// ── 4b. Handover response — email to creator (fromName) ───────────────────────
export async function sendHandoverResponseEmail(handover, fromEmployee, decision) {
  if (!fromEmployee?.email) return;
  const cfg = getCfg();
  const hospital_name = cfg.hospitalName || 'Work Desk';
  const message_html = buildHandoverResponseHtml({
    to_name:    fromEmployee.name,
    by_name:    handover.toName,
    decision,
    remark:     handover.decisionRemark || '',
    dept:       handover.dept           || '—',
    date_start: handover.dateStart      || '—',
    date_end:   handover.dateEnd        || '—',
    task_count: (handover.taskIds       || []).length,
    hospital_name,
  });
  const icon = decision === 'accepted' ? '✅' : '❌';
  await send({
    to_email:     fromEmployee.email,
    to_name:      fromEmployee.name,
    subject:      `${icon} Handover ${decision === 'accepted' ? 'Accepted' : 'Rejected'} by ${handover.toName}`,
    message_html,
  });
}

// ── 4. Task reminder email ─────────────────────────────────────────────────────
// reminderType: 'overdue' | 'due_today' | 'scheduled'
export async function sendReminderEmail(task, employee, reminderType = 'scheduled') {
  if (!employee?.email) return;
  const cfg = getCfg();
  const hospital_name = cfg.hospitalName || 'Work Desk';
  const message_html = buildReminderHtml({
    to_name:       employee.name,
    task_name:     task.name,
    dept:          task.dept      || '—',
    sched_date:    task.schedDate || '—',
    task_time:     task.time      || '—',
    freq:          task.freq      || '—',
    priority:      task.priority  || 'Medium',
    assigned_by:   (task.assignedTo || []).join(', ') || '—',
    reminder_type: reminderType,
    hospital_name,
  });
  const subjectMap = {
    overdue:   `🚨 Overdue Task: ${task.name}`,
    due_today: `⏰ Due Today: ${task.name}`,
    scheduled: `📅 Task Reminder: ${task.name}`,
  };
  await send({
    to_email:     employee.email,
    to_name:      employee.name,
    subject:      subjectMap[reminderType] || subjectMap.scheduled,
    message_html,
  });
}
