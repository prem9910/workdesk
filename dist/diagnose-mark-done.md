# Mark Done → Refresh Reverts: Fix + Diagnostic

## Root cause hypothesis

When `handleDone` runs:

1. AppContext updates local state + localStorage with the task marked done.
2. Supabase upsert is sent.
3. If Supabase silently loses the write (returns success but DB unchanged), then on every refresh the init merge prefers the (stale) Supabase state over the (correct) localStorage state, causing the task to revert to pending.

This is a known silent-failure mode in Supabase's REST API — the upsert call returns 200 OK but no row is written. Rare, but happens (network timing, RLS filtering, replication lag).

## Fix applied

**Init merge** (`src/context/AppContext.jsx`) — when the same row id exists in BOTH Supabase and localStorage, prefer whichever has the newer `updatedAt`. If LS is newer, use the LS row and re-upsert to Supabase.

**Realtime handler** (`src/context/AppContext.jsx`) — same per-row newer-LS-wins logic, so a stale realtime echo doesn't clobber the user's local change.

## How to verify the fix is working

Open DevTools → Console with "Preserve log" ON.

### Mark a task done

Watch for these logs IN ORDER:

1. `[handleDone] task "..." (id): newAll has N rows ({"done":1, "pending":...}), target row status="done", lastDone="2026-06-28"`
2. `[upsertRecord] hops-tasks → N rows (status: {"done":1, "pending":...})`
3. `[upsertRecord] ✅ hops-tasks upsert completed without error`
4. `[realtime] hops-tasks event: recentLocalWrite=true, fresh breakdown: {done: 1, pending: N}`

### Refresh the page

Watch for:

- `[init] hops-tasks: sbData (N)={done: M, pending: ...}, lsData (N)={done: M, pending: ...}, pending=K, stale=0, lsNewer=0`

**If `lsNewer` > 0:** the fix kicked in — LS had a newer version than SB. The task status will be preserved across refreshes, and the re-upsert will eventually bring SB in sync.

**If `lsNewer` = 0 and SB has the done row:** everything is in sync, no fix needed.

**If `lsNewer` = 0 but SB shows pending and LS shows done:** the `tsOf` comparison missed the conflict (e.g. clock skew or missing updatedAt). Share the full `[init]` log line so the timestamps can be inspected.

## Manual cross-check (optional)

```js
(async () => {
  const TASK = 'YOUR TASK NAME';  // ← replace
  const lsTasks = JSON.parse(localStorage.getItem('hops-tasks') || '[]');
  const lsMatch = lsTasks.filter(t => (t.name || '').toUpperCase().includes(TASK.toUpperCase()));
  console.log('=== LS rows for "' + TASK + '" ===');
  console.table(lsMatch.map(t => ({
    id: t.id, name: t.name, status: t.status,
    lastDone: t.lastDone, doneBy: t.doneBy, doneTime: t.doneTime,
    schedDate: t.schedDate, parentTaskId: t.parentTaskId,
    updatedAt: t.updatedAt,
  })));

  const mod = await import('/src/lib/supabase.js');
  const { data: sbRows, error } = await mod.supabase
    .from('tasks')
    .select('id, name, status, last_done, done_by, done_time, sched_date, parent_task_id, updated_at')
    .ilike('name', '%' + TASK + '%');
  if (error) { console.error('SB load failed:', error.message); return; }
  console.log('=== SB rows for "' + TASK + '" ===');
  console.table(sbRows.map(t => ({
    id: t.id, name: t.name, status: t.status,
    lastDone: t.last_done, doneBy: t.done_by, doneTime: t.done_time,
    schedDate: t.sched_date, parentTaskId: t.parent_task_id,
    updatedAt: t.updated_at,
  })));
})();
```

**Expected after Mark Done:** both LS and SB rows have `status='done'`. If SB still says `pending`, the upsert is being lost — share the `[upsertRecord]` log line.

## Files changed

- `src/services/db.js` — added debug logging in `upsertRecord`
- `src/context/AppContext.jsx` — init-merge conflict resolution + realtime-handler conflict resolution + debug logging
- `src/pages/MyTasks.jsx` — added debug logging in `handleDone`
