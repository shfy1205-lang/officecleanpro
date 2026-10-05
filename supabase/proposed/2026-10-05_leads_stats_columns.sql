-- ============================================================================
-- [제안 / 미적용] 견적 통계 정확도 향상을 위한 leads 컬럼 추가
-- 작성: 2026-10-05 (fix/quote-admin-cleanup 브랜치)
--
-- ※ 이 파일은 Supabase 에 적용되지 않았습니다. 검토 후 SQL Editor 에서 직접 실행하세요.
-- ※ 현재 견적 통계 화면은 이 변경 없이도 동작합니다 (기존 컬럼만으로 클라이언트 계산).
--   아래 컬럼이 생기면 다음이 가능해집니다:
--     - 월별 "성공/실패" 를 문의 등록월이 아니라 실제 결정일 기준으로 집계 (won_at / lost_at)
--     - 유입경로를 추정이 아닌 실제 값으로 집계 (source)
--     - 실패 사유 분석 (lost_reason)
--
-- 현재 확인된 leads 컬럼 (코드 + 읽기전용 스키마 확인 기준):
--   id, company_name, contact_name, contact_phone, location, status, assigned_to, notes,
--   work_items(jsonb), estimated_amount, quote_date, quote_amount, quote_spec,
--   quote_frequency, quote_work_items, created_at, updated_at
--   (source / won_at / lost_at / lost_reason / status_changed_at 은 없음)
-- status 값: new, contacted, visit_plan, visit_done, proposal, won, lost
-- ============================================================================

begin;

alter table public.leads
  add column if not exists source            text,         -- 'homepage' | 'qr' | 'admin' | 'phone' ...
  add column if not exists status_changed_at timestamptz,
  add column if not exists won_at            timestamptz,
  add column if not exists lost_at           timestamptz,
  add column if not exists lost_reason       text;

-- 상태가 바뀔 때 결정일 자동 기록 (클라이언트 코드 수정 불필요)
create or replace function public.leads_track_status()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.status_changed_at := now();
    if new.status = 'won'  then new.won_at  := coalesce(new.won_at,  now()); new.lost_at := null; end if;
    if new.status = 'lost' then new.lost_at := coalesce(new.lost_at, now()); new.won_at  := null; end if;
    if new.status not in ('won', 'lost') then new.won_at := null; new.lost_at := null; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_leads_track_status on public.leads;
create trigger trg_leads_track_status
  before insert or update of status on public.leads
  for each row execute function public.leads_track_status();

-- 기존 데이터 백필 (근사치: 마지막 수정일을 결정일로 간주)
update public.leads set won_at  = coalesce(updated_at, created_at) where status = 'won'  and won_at  is null;
update public.leads set lost_at = coalesce(updated_at, created_at) where status = 'lost' and lost_at is null;

-- 유입경로 백필 (현재 화면의 추정 규칙과 동일)
update public.leads set source = 'qr'       where source is null and notes like '[QR 견적문의]%';
update public.leads set source = 'homepage' where source is null and contact_name is null
                                              and (notes ~ '^(평수|상주인원):' or quote_spec is not null);
update public.leads set source = 'admin'    where source is null;

create index if not exists leads_status_idx     on public.leads (status);
create index if not exists leads_created_at_idx on public.leads (created_at desc);

commit;

-- ----------------------------------------------------------------------------
-- 후속 작업 (컬럼 추가 후에만 배포할 것 — 먼저 배포하면 문의 접수가 실패함)
--   index.html  : leads insert 에 source: 'homepage' 추가
--   quote.html  : leads insert 에 source: 'qr' 추가
--   admin-leads : 신규 등록 시 source: 'admin', 실패 전환 시 lost_reason 입력,
--                 leadSourceOf() 가 l.source 를 우선 사용하도록 변경
--
-- RLS: 통계는 관리자 화면이 이미 불러온 leads 데이터로 계산하므로 정책 변경 불필요.
--   (참고) 익명 문의 insert 정책이 status='new' 만 허용하는지 한 번 확인 권장:
--   create policy ... on public.leads for insert to anon with check (status = 'new');
-- ----------------------------------------------------------------------------
