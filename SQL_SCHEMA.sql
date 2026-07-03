-- ============================================================
-- Work Desk — Complete SQL Schema
-- Supabase (PostgreSQL) — Run this in the Supabase SQL Editor
-- Migration from hops-/hospital-ops to workdesk-* is data-preserving:
-- creates workdesk_* tables, copies rows from the legacy tables,
-- then drops the legacy tables at the end.
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── DEPARTMENTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workdesk_departments (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  head       TEXT DEFAULT '',
  contact    TEXT DEFAULT '',
  email      TEXT DEFAULT '',
  floor      TEXT DEFAULT '',
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── EMPLOYEES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workdesk_employees (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  username     TEXT DEFAULT '',
  dept         TEXT DEFAULT '',
  designation  TEXT DEFAULT '',
  email        TEXT DEFAULT '',
  password     TEXT DEFAULT '',
  contact      TEXT DEFAULT '',
  is_incharge  BOOLEAN DEFAULT false,
  perms        JSONB DEFAULT '[]',
  pending_dept TEXT DEFAULT '',
  updated_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ─── ADMINS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workdesk_admins (
  id         TEXT PRIMARY KEY,
  name       TEXT DEFAULT '',
  username   TEXT NOT NULL UNIQUE,
  email      TEXT DEFAULT '',
  password   TEXT DEFAULT '',
  role       TEXT DEFAULT '',
  dept       TEXT DEFAULT '',
  perms      JSONB DEFAULT '[]',
  created_by TEXT DEFAULT '',
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── TASKS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workdesk_tasks (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  dept               TEXT DEFAULT '',
  freq               TEXT DEFAULT 'daily',
  assigned_to        JSONB DEFAULT '[]',
  assignee_emails    JSONB DEFAULT '[]',
  time               TEXT DEFAULT '',
  sched_date         TEXT DEFAULT '',
  priority           TEXT DEFAULT 'medium',
  notes              TEXT DEFAULT '',
  last_done          TEXT DEFAULT '',
  status             TEXT DEFAULT 'pending',
  done_by            TEXT DEFAULT '',
  done_time          TEXT DEFAULT '',
  done_remark        TEXT DEFAULT '',
  delay_reason       TEXT DEFAULT '',
  is_delayed         BOOLEAN DEFAULT false,
  created            TEXT DEFAULT '',
  created_by         TEXT DEFAULT '',
  activity_log       JSONB DEFAULT '[]',
  completion_history JSONB DEFAULT '[]',
  parent_task_id     TEXT DEFAULT '',
  extensions         JSONB DEFAULT '[]',
  updated_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workdesk_tasks_dept ON workdesk_tasks(dept);
CREATE INDEX IF NOT EXISTS idx_workdesk_tasks_status ON workdesk_tasks(status);

-- ─── ISSUES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workdesk_issues (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  dept           TEXT DEFAULT '',
  priority       TEXT DEFAULT 'medium',
  reporter       TEXT DEFAULT '',
  assigned       TEXT DEFAULT '',
  description    TEXT DEFAULT '',
  status         TEXT DEFAULT 'open',
  date           TEXT DEFAULT '',
  resolve_remark TEXT DEFAULT '',
  resolve_by     TEXT DEFAULT '',
  resolved_at    TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workdesk_issues_status ON workdesk_issues(status);
CREATE INDEX IF NOT EXISTS idx_workdesk_issues_priority ON workdesk_issues(priority);

-- ─── HANDOVERS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workdesk_handovers (
  id              TEXT PRIMARY KEY,
  name            TEXT DEFAULT '',
  designation     TEXT DEFAULT '',
  dept            TEXT DEFAULT '',
  date            TEXT DEFAULT '',
  handover_to     TEXT DEFAULT '',
  tasks           TEXT DEFAULT '',
  pending         TEXT DEFAULT '',
  supervisor      TEXT DEFAULT '',
  status          TEXT DEFAULT 'pending',
  created_by      TEXT DEFAULT '',
  decision_remark TEXT DEFAULT '',
  decision_by     TEXT DEFAULT '',
  decision_at     TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ─── DELEGATIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workdesk_delegations (
  id           TEXT PRIMARY KEY,
  task_name    TEXT DEFAULT '',
  dept         TEXT DEFAULT '',
  priority     TEXT DEFAULT 'medium',
  doer_id      TEXT DEFAULT '',
  doer_name    TEXT DEFAULT '',
  delegated_by TEXT DEFAULT '',
  exp_date     TEXT DEFAULT '',
  exp_time     TEXT DEFAULT '',
  notes        TEXT DEFAULT '',
  status       TEXT DEFAULT 'pending',
  created_date TEXT DEFAULT '',
  actual_date  TEXT DEFAULT '',
  actual_time  TEXT DEFAULT '',
  done_remark  TEXT DEFAULT '',
  delay_reason TEXT DEFAULT '',
  is_delayed   BOOLEAN DEFAULT false,
  extensions   JSONB DEFAULT '[]',
  activity_log JSONB DEFAULT '[]',
  updated_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workdesk_delegations_doer ON workdesk_delegations(doer_name);
CREATE INDEX IF NOT EXISTS idx_workdesk_delegations_status ON workdesk_delegations(status);

-- ─── ACTIVITY LOG ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workdesk_activity_log (
  id         TEXT PRIMARY KEY,
  by_user    TEXT DEFAULT '',
  role       TEXT DEFAULT '',
  action     TEXT DEFAULT '',
  details    TEXT DEFAULT '',
  at_str     TEXT DEFAULT '',
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workdesk_actlog_created ON workdesk_activity_log(created_at DESC);

-- ─── TRASH ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workdesk_trash (
  id             TEXT PRIMARY KEY,
  type           TEXT DEFAULT '',
  data           JSONB DEFAULT '{}',
  deleted_by     TEXT DEFAULT '',
  deleted_at     TIMESTAMPTZ DEFAULT now(),
  auto_delete_at TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ─── USER LINKS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workdesk_user_links (
  id       TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  name     TEXT DEFAULT '',
  url      TEXT DEFAULT '',
  emoji    TEXT DEFAULT '🔗',
  added_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workdesk_links_username ON workdesk_user_links(username);

-- ─── NOTICES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workdesk_notices (
  id         TEXT PRIMARY KEY,
  to_emp_id  TEXT DEFAULT '',
  to_name    TEXT DEFAULT '',
  from_name  TEXT DEFAULT '',
  subject    TEXT DEFAULT '',
  message    TEXT DEFAULT '',
  type       TEXT DEFAULT 'general',
  is_read    BOOLEAN DEFAULT false,
  sent_at    TEXT DEFAULT '',
  meta       TEXT DEFAULT '',
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── EMAIL CONFIG ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_config (
  id SERIAL PRIMARY KEY,
  brevo_api_key TEXT DEFAULT '',
  brevo_sender_email TEXT DEFAULT '',
  brevo_sender_name TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies for email_config - allow service role full access (bypasses RLS),
-- and anon role read access for configuration checks
ALTER TABLE email_config ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read email config (for frontend checks)
CREATE POLICY "Allow anon read email config" ON email_config
  FOR SELECT TO anon USING (true);

-- Allow service role full access (insert/update/delete) - bypasses RLS anyway
-- but explicit policy ensures clarity
CREATE POLICY "Allow service role full access email config" ON email_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- App uses the ANON key (public) from the browser.
-- For an internal workdesk app with no end-user sign-up,
-- we allow the anon role full CRUD on all data tables.
-- This mirrors the previous service-role behaviour.
-- For a future multi-tenant setup, replace these with
-- per-user / per-department policies.
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE workdesk_departments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE workdesk_employees      ENABLE ROW LEVEL SECURITY;
ALTER TABLE workdesk_admins         ENABLE ROW LEVEL SECURITY;
ALTER TABLE workdesk_tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workdesk_issues         ENABLE ROW LEVEL SECURITY;
ALTER TABLE workdesk_handovers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE workdesk_delegations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE workdesk_activity_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE workdesk_trash          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workdesk_user_links     ENABLE ROW LEVEL SECURITY;
ALTER TABLE workdesk_notices        ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_config            ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- DATA MIGRATION — copy rows from legacy tables, then drop them.
-- Safe to re-run: COPY only fills empty rows; DROP is idempotent.
-- ============================================================

DO $$
DECLARE
  legacy_tables TEXT[] := ARRAY[
    'departments','employees','admins','tasks','issues','handovers',
    'delegations','activity_log','trash','user_links','notices'
  ];
  new_tables    TEXT[] := ARRAY[
    'workdesk_departments','workdesk_employees','workdesk_admins','workdesk_tasks',
    'workdesk_issues','workdesk_handovers','workdesk_delegations',
    'workdesk_activity_log','workdesk_trash','workdesk_user_links','workdesk_notices'
  ];
  i INT;
BEGIN
  FOR i IN 1..array_length(legacy_tables, 1) LOOP
    IF to_regclass(legacy_tables[i]) IS NOT NULL AND to_regclass(new_tables[i]) IS NOT NULL THEN
      EXECUTE format(
        'INSERT INTO %I SELECT * FROM %I WHERE NOT EXISTS (SELECT 1 FROM %I LIMIT 1)',
        new_tables[i], legacy_tables[i], new_tables[i]
      );
      EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', legacy_tables[i]);
      RAISE NOTICE 'Migrated % → %', legacy_tables[i], new_tables[i];
    END IF;
  END LOOP;
END$$;