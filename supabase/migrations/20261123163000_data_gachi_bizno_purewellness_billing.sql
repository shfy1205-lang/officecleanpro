-- 2026-11-23 홈택스 발급내역 대조 결과 반영 (준희님 확인)
-- 1) 가치경영원 사업자번호 오타 수정 (132-81-96422 → 132-81-96442, 홈택스 기준)
update public.companies set biz_no = '132-81-96442'
 where id = '8a387169-44f2-47bb-a986-424a86948b77';

-- 2) 퓨어웰니스 청구액 198,000 → 240,000 (공급가 218,182 + 세액 21,818), 10·11·12월
update public.billing_records set billed_amount = 240000
 where id in ('ce87fbd0-485d-404f-aef0-d71fd9c2d7a6',
              '6470452d-6f32-42dc-b966-1db877264f0c',
              '6e353eb6-07a1-4ff2-8ee3-622fb177101f');
