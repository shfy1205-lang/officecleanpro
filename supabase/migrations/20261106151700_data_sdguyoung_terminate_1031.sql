-- 2026-11-06 데이터 정리: 에스디구영 2026-10-31 종료 (사용자 승인)
-- 10월분 청구(760,000)는 미수금으로 유지. 11·12월 자동 생성분만 정리.
update contracts set end_date='2026-10-31', status='ended'
 where id='87d690e8-f625-481a-896f-01de882ec600' and status='active';
delete from billing_records
 where id in ('9f0e0dde-5d5a-4f0e-a24f-2c97bdedf3f1','d9da9e25-935a-4470-b11d-e1bf9e9d2a9b')
   and status='pending' and coalesce(paid_amount,0)=0;
update company_financials set contract_amount=0, ocp_amount=0, eco_amount=0,
       memo=coalesce(memo||' / ','')||'해지 정리 2026-11-06 (10/31 종료)'
 where id in ('a84488e7-2ffc-401c-886e-66ecef603b92','fc3fd08f-b640-4ee3-86db-4301c7fd446a');
update company_schedule set is_active=false
 where id in ('802cc8dd-8f9a-46e5-a850-5faa0e28dce4','363d51db-fd63-40d3-a670-30fa99889bb9','09c71698-65e3-4b4b-8be7-84e901e2cd9c');
