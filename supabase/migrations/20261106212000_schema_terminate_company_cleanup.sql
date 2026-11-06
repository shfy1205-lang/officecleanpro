-- 2026-11-06 해지 처리 일원화: terminate_company가 종료월 이후 자동 생성분까지 정리
-- 지우는 것: 종료월 이후의 '대기(pending) + 입금 0' 청구, 종료월 이후 재무 행, 종료월 이후 월 배정
-- 입금된 청구·청구서 발행(billed) 건은 건드리지 않음
create or replace function public.terminate_company(p_company_id uuid, p_end_date date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_tasks int := 0; v_bill int := 0; v_fin int := 0; v_cw int := 0;
  v_end_month text := to_char(p_end_date, 'YYYY-MM');
begin
  if auth.uid() is not null and not is_admin() then raise exception 'admin only'; end if;
  if p_end_date is null then raise exception 'end date required'; end if;
  update companies set status = 'terminated', terminated_at = p_end_date, contract_end_date = p_end_date::text where id = p_company_id;
  update contracts set end_date = p_end_date, status = 'ended', updated_at = now()
  where company_id = p_company_id and (end_date is null or end_date > p_end_date);
  update worker_assignments set effective_to = p_end_date, updated_at = now()
  where company_id = p_company_id and (effective_to is null or effective_to > p_end_date);
  update company_schedule set is_active = false where company_id = p_company_id;
  update tasks set status = 'cancelled', updated_at = now()
  where company_id = p_company_id and task_date > p_end_date and status = 'scheduled';
  get diagnostics v_tasks = row_count;
  delete from billing_records
  where company_id = p_company_id and month > v_end_month and status = 'pending' and coalesce(paid_amount, 0) = 0;
  get diagnostics v_bill = row_count;
  delete from company_financials where company_id = p_company_id and month > v_end_month;
  get diagnostics v_fin = row_count;
  delete from company_workers where company_id = p_company_id and month > v_end_month;
  get diagnostics v_cw = row_count;
  return jsonb_build_object('terminated', p_company_id, 'end_date', p_end_date, 'future_tasks_cancelled', v_tasks,
                            'billing_removed', v_bill, 'financials_removed', v_fin, 'month_assignments_removed', v_cw);
end; $function$;
