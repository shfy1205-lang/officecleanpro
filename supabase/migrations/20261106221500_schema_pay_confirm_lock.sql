-- 2026-11-06 급여 확정 = 잠금
-- 직원의 그 달 급여가 확정(pay_confirmations.confirmed)되면, 화면/API에서 그 직원의 그 달
-- 월 배정(company_workers)과 대신 근무(substitutions)를 고칠 수 없다. 고치려면 확정을 해제한다.
-- cron·마이그레이션(로그인 없는 서버 작업)은 막지 않는다 (auth.uid() is null).
create or replace function public.pay_month_locked(p_worker uuid, p_month text)
 returns boolean language sql stable security definer set search_path to 'public'
as $$ select exists (select 1 from pay_confirmations where worker_id = p_worker and month = p_month and confirmed) $$;
revoke execute on function public.pay_month_locked(uuid, text) from anon, public;
grant execute on function public.pay_month_locked(uuid, text) to authenticated;

create or replace function public.guard_company_workers_lock()
 returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op in ('UPDATE', 'DELETE') and pay_month_locked(old.worker_id, old.month) then
    raise exception '% %월 급여가 확정돼 있어 바꿀 수 없어요. 확정을 해제한 뒤 고치세요.',
      (select name from workers where id = old.worker_id), right(old.month, 2);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and pay_month_locked(new.worker_id, new.month) then
    raise exception '% %월 급여가 확정돼 있어 바꿀 수 없어요. 확정을 해제한 뒤 고치세요.',
      (select name from workers where id = new.worker_id), right(new.month, 2);
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_company_workers_lock on public.company_workers;
create trigger trg_company_workers_lock before insert or update or delete on public.company_workers
  for each row execute function public.guard_company_workers_lock();

create or replace function public.guard_substitutions_lock()
 returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare m text;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op in ('UPDATE', 'DELETE') then
    m := to_char(old.work_date, 'YYYY-MM');
    if pay_month_locked(old.original_worker_id, m) or pay_month_locked(old.substitute_worker_id, m) then
      raise exception '%월 급여가 확정된 직원이 포함돼 있어 대신 근무를 바꿀 수 없어요. 확정을 해제한 뒤 고치세요.', right(m, 2);
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    m := to_char(new.work_date, 'YYYY-MM');
    if pay_month_locked(new.original_worker_id, m) or pay_month_locked(new.substitute_worker_id, m) then
      raise exception '%월 급여가 확정된 직원이 포함돼 있어 대신 근무를 바꿀 수 없어요. 확정을 해제한 뒤 고치세요.', right(m, 2);
    end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_substitutions_lock on public.substitutions;
create trigger trg_substitutions_lock before insert or update or delete on public.substitutions
  for each row execute function public.guard_substitutions_lock();
