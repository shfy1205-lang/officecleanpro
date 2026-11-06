-- 2026-11-06 월 데이터 생성 서버 일원화
-- 1) materialize_month: 새 재무 행의 OCP/에코 수수료를 직전 달 같은 업체 값에서 이어받음
--    (지금까지는 브라우저 ensureMonthData가 지난달 행을 복사하면서 수수료를 이어 왔음. 서버는 0으로 넣었음)
-- 2) daily_maintenance: 매월 25일부터 다음 달도 미리 생성 (대시보드가 브라우저에서 만들던 것을 대체)
create or replace function public.materialize_month(p_month text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_start date; v_end date; v_cur text; v_prev text; v_cw int := 0; v_fin int := 0; v_bill int := 0;
begin
  if auth.uid() is not null and not is_admin() then raise exception 'admin only'; end if;
  if p_month !~ '^[0-9]{4}-[0-9]{2}$' then raise exception 'month must be YYYY-MM'; end if;
  v_cur := to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM');
  if p_month < v_cur then raise exception 'past months are read-only (%)', p_month; end if;
  v_start := to_date(p_month || '-01', 'YYYY-MM-DD');
  v_end := (v_start + interval '1 month' - interval '1 day')::date;
  v_prev := to_char(v_start - interval '1 month', 'YYYY-MM');

  insert into company_workers (company_id, worker_id, month, pay_amount, share, is_primary)
  select wa.company_id, wa.worker_id, p_month, wa.pay_amount, wa.share, wa.is_primary
  from worker_assignments wa
  join companies c on c.id = wa.company_id
  where c.status = 'active'
    and wa.effective_from <= v_end
    and (wa.effective_to is null or wa.effective_to >= v_start)
  on conflict (company_id, worker_id, month) do nothing;
  get diagnostics v_cw = row_count;

  insert into company_financials (company_id, month, contract_amount, eco_amount, ocp_amount, worker_pay_total,
                                  eco_contract_override, eco_fee_override)
  select k.company_id, p_month, k.monthly_amount,
         coalesce(p.eco_amount, 0), coalesce(p.ocp_amount, 0), 0,
         p.eco_contract_override, p.eco_fee_override
  from (
    select distinct on (company_id) company_id, monthly_amount
    from contracts
    where start_date <= v_end and (end_date is null or end_date >= v_start) and status <> 'ended'
    order by company_id, start_date desc
  ) k
  join companies c on c.id = k.company_id and c.status = 'active'
  left join company_financials p on p.company_id = k.company_id and p.month = v_prev
  on conflict (company_id, month) do update set contract_amount = excluded.contract_amount;
  get diagnostics v_fin = row_count;

  update company_financials f
  set worker_pay_total = coalesce((select sum(cw.pay_amount) from company_workers cw where cw.company_id = f.company_id and cw.month = p_month), 0)
  where f.month = p_month;

  insert into billing_records (company_id, month, billed_amount, paid_amount, status)
  select k.company_id, p_month, k.monthly_amount, 0, 'pending'
  from (
    select distinct on (company_id) company_id, monthly_amount
    from contracts
    where start_date <= v_end and (end_date is null or end_date >= v_start) and status <> 'ended'
    order by company_id, start_date desc
  ) k
  join companies c on c.id = k.company_id and c.status = 'active'
  on conflict (company_id, month) do update set billed_amount = excluded.billed_amount
    where billing_records.status = 'pending' and billing_records.paid_amount = 0;
  get diagnostics v_bill = row_count;

  return jsonb_build_object('month', p_month, 'workers_inserted', v_cw, 'financials_upserted', v_fin, 'billing_upserted', v_bill);
end; $function$;

create or replace function public.daily_maintenance()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_month text := to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM');
  v_next text := to_char(((now() at time zone 'Asia/Seoul')::date + interval '1 month')::date, 'YYYY-MM');
  v_mat jsonb; v_mat_next jsonb := null; v_created int := 0; v_resolved int := 0;
begin
  if auth.uid() is not null and not is_admin() then raise exception 'admin only'; end if;
  v_mat := materialize_month(v_month);
  if extract(day from v_today) >= 25 then
    v_mat_next := materialize_month(v_next);
  end if;
  insert into tasks (company_id, worker_id, task_date, status, task_source)
  select cs.company_id, wa.worker_id, v_today, 'scheduled', 'auto'
  from company_schedule cs
  join companies c on c.id = cs.company_id and c.status = 'active'
  join lateral (
    select w.worker_id from worker_assignments w
    where w.company_id = cs.company_id and w.effective_from <= v_today
      and (w.effective_to is null or w.effective_to >= v_today)
    order by w.is_primary desc, w.created_at limit 1
  ) wa on true
  where cs.is_active
    and cs.weekday = extract(dow from v_today)::int
    and (cs.frequency = 'weekly' or (cs.frequency = 'biweekly' and cs.anchor_date is not null and mod((v_today - cs.anchor_date) / 7, 2) = 0))
    and not exists (select 1 from tasks t where t.company_id = cs.company_id and t.task_date = v_today);
  get diagnostics v_created = row_count;
  if v_created > 0 then
    insert into schedule_generation_log (action_type, target_month, created_count, skipped_count, excluded_inactive, excluded_no_worker)
    values ('today_generate', v_month, v_created, 0, 0, 0);
  end if;
  update requests set is_resolved = true, updated_at = now() where is_resolved = false and expires_at < now();
  get diagnostics v_resolved = row_count;
  return jsonb_build_object('date', v_today, 'materialize', v_mat, 'materialize_next', v_mat_next, 'tasks_created', v_created, 'requests_auto_resolved', v_resolved);
end; $function$;
