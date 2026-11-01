-- 2026-11-01 견적서 자동 등록: 유효기간(일)·기타사항 컬럼
-- (SQL Editor 로 이미 적용됨 — if not exists 라 재실행해도 안전. GitHub 통합 첫 배포 확인용)
alter table public.leads
  add column if not exists quote_valid_days integer,
  add column if not exists quote_note text;
