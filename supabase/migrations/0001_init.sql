-- Dreamer initial schema.
--
-- Identity: rely on Supabase's built-in auth.users — no public.users
-- table. Profile fields come from the JWT (user_metadata).
--
-- Storage shape: one row per project / thread / agent_run; full domain
-- payload lives in `data jsonb`. Columns are canonical for the few fields
-- we filter/order/version on. The repo layer strips duplicated keys from
-- the JSONB on write and re-stitches them on read.

-- ── projects ──────────────────────────────────────────────────────────────

create table public.projects (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  version int not null default 0,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_owner_updated on public.projects (owner_id, updated_at desc);

alter table public.projects enable row level security;

create policy projects_owner_select on public.projects
  for select using (owner_id = auth.uid());
create policy projects_owner_insert on public.projects
  for insert with check (owner_id = auth.uid());
create policy projects_owner_update on public.projects
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy projects_owner_delete on public.projects
  for delete using (owner_id = auth.uid());

-- ── threads ───────────────────────────────────────────────────────────────

create table public.threads (
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index threads_project on public.threads (project_id);

alter table public.threads enable row level security;

create policy threads_owner_select on public.threads
  for select using (
    exists (select 1 from public.projects p
            where p.id = threads.project_id and p.owner_id = auth.uid())
  );
create policy threads_owner_insert on public.threads
  for insert with check (
    exists (select 1 from public.projects p
            where p.id = threads.project_id and p.owner_id = auth.uid())
  );
create policy threads_owner_update on public.threads
  for update using (
    exists (select 1 from public.projects p
            where p.id = threads.project_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.projects p
            where p.id = threads.project_id and p.owner_id = auth.uid())
  );
create policy threads_owner_delete on public.threads
  for delete using (
    exists (select 1 from public.projects p
            where p.id = threads.project_id and p.owner_id = auth.uid())
  );

-- ── agent_runs ────────────────────────────────────────────────────────────

create table public.agent_runs (
  id uuid primary key,
  thread_id uuid not null references public.threads(id) on delete cascade,
  project_id uuid not null,
  status text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index agent_runs_thread on public.agent_runs (thread_id, created_at);

alter table public.agent_runs enable row level security;

create policy agent_runs_owner_select on public.agent_runs
  for select using (
    exists (select 1 from public.projects p
            where p.id = agent_runs.project_id and p.owner_id = auth.uid())
  );
create policy agent_runs_owner_insert on public.agent_runs
  for insert with check (
    exists (select 1 from public.projects p
            where p.id = agent_runs.project_id and p.owner_id = auth.uid())
  );
create policy agent_runs_owner_update on public.agent_runs
  for update using (
    exists (select 1 from public.projects p
            where p.id = agent_runs.project_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.projects p
            where p.id = agent_runs.project_id and p.owner_id = auth.uid())
  );
create policy agent_runs_owner_delete on public.agent_runs
  for delete using (
    exists (select 1 from public.projects p
            where p.id = agent_runs.project_id and p.owner_id = auth.uid())
  );

-- ── audit_events ──────────────────────────────────────────────────────────
-- Append-only. API uses service-role client only; no policies.

create table public.audit_events (
  id bigserial primary key,
  ts timestamptz not null default now(),
  user_id uuid,
  action text not null,
  project_id uuid,
  extra jsonb
);

create index audit_user_ts on public.audit_events (user_id, ts desc);
create index audit_project on public.audit_events (project_id, ts desc);

alter table public.audit_events enable row level security;
-- No policies → service role only.

-- ── app_logs ──────────────────────────────────────────────────────────────
-- Service-role only. PR3 wires the runtime logger sink here.

create table public.app_logs (
  id bigserial primary key,
  ts timestamptz not null default now(),
  level text not null,
  tag text not null,
  message text not null,
  data jsonb,
  user_id uuid,
  request_id text
);

create index app_logs_ts on public.app_logs (ts desc);
create index app_logs_level_ts on public.app_logs (level, ts desc);

alter table public.app_logs enable row level security;
-- No policies → service role only.

-- ── Realtime publication ──────────────────────────────────────────────────
-- Schema ready for future client subscriptions; PR1/PR2 don't subscribe yet.

alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.threads;
alter publication supabase_realtime add table public.agent_runs;

-- ── Storage bucket: project-assets ────────────────────────────────────────
-- Private bucket. API uses service role; the route layer mints short-lived
-- signed URLs after explicit ownership checks. Storage RLS is intentionally
-- empty for this bucket — only the service role accesses storage.objects.

insert into storage.buckets (id, name, public)
values ('project-assets', 'project-assets', false)
on conflict (id) do nothing;
