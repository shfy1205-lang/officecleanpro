-- 2026-11-06 대신 근무 기록
-- 원래 담당 대신 다른 사람(또는 대표)이 간 날을 남기면, 급여에서
-- 원래 담당은 그 업체 월 지급액 ÷ 그 달 일정 횟수만큼 빠지고, 대신 간 직원은 같은 금액이 더해진다.
-- substitute_worker_id 가 null 이면 대표 등 급여를 받지 않는 사람이 간 것.
create table if not exists public.substitutions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  work_date date not null,
  original_worker_id uuid references public.workers(id),
  substitute_worker_id uuid references public.workers(id),
  memo text,
  created_by uuid references public.workers(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_substitutions_date on public.substitutions (work_date);
create index if not exists idx_substitutions_company on public.substitutions (company_id);
alter table public.substitutions enable row level security;
drop policy if exists substitutions_admin_all on public.substitutions;
create policy substitutions_admin_all on public.substitutions for all using (is_admin()) with check (is_admin());
