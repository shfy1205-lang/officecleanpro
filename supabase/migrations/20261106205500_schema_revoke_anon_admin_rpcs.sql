-- 2026-11-06 보안: 관리자 RPC 비로그인(anon) 실행 차단
-- 함수 내부 검사(auth.uid() is not null and not is_admin())가 비로그인 요청을 통과시키는 문제.
-- cron(postgres)과 로그인 관리자(authenticated)는 그대로 동작.
revoke execute on function public.terminate_company(uuid, date) from anon, public;
revoke execute on function public.change_contract(uuid, integer, text) from anon, public;
revoke execute on function public.change_assignment(uuid, uuid, integer, text, boolean, boolean) from anon, public;
revoke execute on function public.register_company(text, text, text, text, text, date, integer, smallint[], time without time zone, time without time zone, uuid, integer, text, text, text) from anon, public;
revoke execute on function public.materialize_month(text) from anon, public;
revoke execute on function public.daily_maintenance() from anon, public;
grant execute on function public.terminate_company(uuid, date) to authenticated;
grant execute on function public.change_contract(uuid, integer, text) to authenticated;
grant execute on function public.change_assignment(uuid, uuid, integer, text, boolean, boolean) to authenticated;
grant execute on function public.register_company(text, text, text, text, text, date, integer, smallint[], time without time zone, time without time zone, uuid, integer, text, text, text) to authenticated;
grant execute on function public.materialize_month(text) to authenticated;
grant execute on function public.daily_maintenance() to authenticated;
