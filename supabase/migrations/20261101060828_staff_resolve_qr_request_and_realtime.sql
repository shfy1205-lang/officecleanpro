-- 2026-11-01 (MCP apply_migration 으로 이미 적용됨 — 이력 일치용 기록)
-- 작업자가 담당 업체의 client_qr 요청만 처리 완료 표시. requests 테이블 realtime 추가.
create or replace function public.resolve_qr_request(p_request_id uuid, p_resolved boolean default true)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_row requests%rowtype;
begin
  select * into v_row from requests where id = p_request_id;
  if not found then raise exception 'request not found'; end if;
  if v_row.request_source is distinct from 'client_qr' then raise exception 'only client QR requests'; end if;
  if not (is_admin() or v_row.company_id in (select my_company_ids())) then
    raise exception 'not your company';
  end if;
  update requests set is_resolved = p_resolved, updated_at = now() where id = p_request_id;
  return jsonb_build_object('id', p_request_id, 'is_resolved', p_resolved);
end; $function$;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='requests') then
    alter publication supabase_realtime add table public.requests;
  end if;
end $$;
