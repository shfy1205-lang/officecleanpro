-- 2026-11-06 미수금 기준을 시스템에: 업체별 미수금 제외 표시 + 입금 계좌 정보
alter table public.companies
  add column if not exists exclude_from_receivables boolean not null default false,
  add column if not exists receivable_note text;
alter table public.tax_config
  add column if not exists bank_name text,
  add column if not exists bank_account text,
  add column if not exists account_holder text;
-- 사용자가 정한 기존 기준: 경창·옴니는 미수금 집계에서 제외 (화면에서 언제든 다시 포함 가능)
update public.companies set exclude_from_receivables = true
 where id in ('8b72f88b-7953-46e8-ad7f-d4bb75bbefb2', '12214ffa-3886-40f4-8e74-5504ab1ff6bb');
