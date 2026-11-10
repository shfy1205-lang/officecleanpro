-- 2026-11-10 급여 조정(상여·차감) 줄
-- 업체별 배정은 그대로 두고, 직원·월 단위로 +/− 금액과 사유를 남긴다. 담당자급여 상세에서 추가·삭제.
-- 급여가 확정된 직원·월은 고칠 수 없다(대신 근무와 같은 잠금).
create table if not exists public.pay_adjustments (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  amount integer not null,
  note text not null,
  created_by uuid references public.workers(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_pay_adjustments_month on public.pay_adjustments (month);
alter table public.pay_adjustments enable row level security;
drop policy if exists pay_adjustments_admin_all on public.pay_adjustments;
create policy pay_adjustments_admin_all on public.pay_adjustments for all using (is_admin()) with check (is_admin());

create or replace function public.guard_pay_adjustments_lock()
 returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op in ('UPDATE', 'DELETE') and pay_month_locked(old.worker_id, old.month) then
    raise exception '%월 급여가 확정돼 있어 조정을 바꿀 수 없어요. 확정을 해제한 뒤 고치세요.', right(old.month, 2);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and pay_month_locked(new.worker_id, new.month) then
    raise exception '%월 급여가 확정돼 있어 조정을 바꿀 수 없어요. 확정을 해제한 뒤 고치세요.', right(new.month, 2);
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_pay_adjustments_lock on public.pay_adjustments;
create trigger trg_pay_adjustments_lock before insert or update or delete on public.pay_adjustments
  for each row execute function public.guard_pay_adjustments_lock();

-- 10월 대표가 대신 간 몫 차감 (사용자 지정 금액, 2026-11-01 합의)
insert into public.pay_adjustments (worker_id, month, amount, note)
select w.id, '2026-10', v.amount, v.note
from (values
  ('이정의', -279231, '세종화재해상 2.5일 대표 대신 근무'),
  ('이정의', -104240, '가양 주말 5곳 대표 대신 근무 (10%)'),
  ('이돈혁', -168000, '토요일 5곳 대표 대신 근무 (1/5, 한라시그마밸리 3곳 제외)')
) as v(name, amount, note)
join public.workers w on w.name = v.name
where not exists (select 1 from public.pay_adjustments a where a.worker_id = w.id and a.month = '2026-10' and a.note = v.note);
