-- 2026-11-06 월 자금 요약: 직원 지급 완료 표시 + 월별 통장 잔고
alter table public.pay_confirmations add column if not exists paid_at timestamptz;
create table if not exists public.monthly_cash (
  month text primary key,
  bank_balance bigint,
  memo text,
  updated_at timestamptz not null default now()
);
alter table public.monthly_cash enable row level security;
drop policy if exists monthly_cash_admin_all on public.monthly_cash;
create policy monthly_cash_admin_all on public.monthly_cash for all using (is_admin()) with check (is_admin());
