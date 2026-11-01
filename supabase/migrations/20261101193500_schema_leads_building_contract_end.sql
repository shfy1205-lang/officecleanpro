-- 2026-11-01 견적관리: 방문영업용 건물명·현재 계약 만료월 칸
-- building           : 건물명 (예: 코오롱디지털타워, 우림라이온스밸리 A동)
-- contract_end_month : 상대 업체의 현재 청소 계약 만료월 'YYYY-MM' (재방문 시점 판단용)
alter table public.leads
  add column if not exists building text,
  add column if not exists contract_end_month text;
