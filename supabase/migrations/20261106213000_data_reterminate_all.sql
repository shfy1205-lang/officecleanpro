-- 2026-11-06 데이터 정리 (사용자 승인: 디스글로벌·씨딘 포함 "전에 했던 건 상관하지 말고 해지 처리")
-- 해지 업체 12곳: 해지월 이후 행 삭제, 계약·담당 종료, 일정 끄기, 해지일 이후 예정 일정 취소.
-- 대상 행은 2026-11-06 21:05 조회 결과 id로 고정. 입금된 청구는 대상 아님.

-- 1) 해지월 이후 대기 청구(입금 0) 4건
delete from billing_records where status = 'pending' and coalesce(paid_amount, 0) = 0 and id in (
  '226405d3-3b74-4518-816a-8510bb78b6f6',
  '24eef9f9-d6db-422a-ad12-995ead439dc2',
  '7b9e6c8a-beff-4a8e-85fc-d8667b392579',
  'ce29fb82-1acc-48d0-b122-48da65555b57');

-- 2) 해지월 이후 재무 행 14건
delete from company_financials where id in (
  '381b96d5-5c11-4302-a65e-211518007646',
  'b5494d55-b727-4f93-b708-8250bff3f500',
  '6e7d541b-e6f1-4198-9952-7ef1901c9727',
  '4f80fa56-e3e1-428f-9e57-5b9a9ad29955',
  '88f327f3-ad0a-4cac-aa35-b6021401dee9',
  'a7c87a12-b356-4b44-aa7a-4ad3745d6717',
  '41d12cd1-eaff-443a-a41a-e39e6ead9b3b',
  '1201a8d8-dac8-4f1f-855c-ea62a6f335f1',
  '56f48e2e-ba5a-4488-8ff1-106f73efe3b6',
  '431ea4a3-3cf0-48c8-8539-c63078ecb0d1',
  'fc3fd08f-b640-4ee3-86db-4301c7fd446a',
  'a84488e7-2ffc-401c-886e-66ecef603b92',
  'e0d817a3-58b8-44dc-9961-9377fb20f00e',
  '6bd1c15f-0819-40f2-9638-89ed6974d445');

-- 3) 해지월 이후 월 배정 8건
delete from company_workers where id in (
  '5e293984-f8f6-44e8-a479-309b009ec3f6',
  '160a9fdd-6d55-49af-a709-16553e7dc93e',
  '2f6b6d33-d92c-4cd6-8d52-58b6843f0805',
  '579c911f-ba3b-41a3-8d2d-01fa4926ba2b',
  '38ca8ed4-3808-4220-a16c-d586ad42247a',
  '1fb707e6-28cc-48fa-8f77-c4b9ea70a0f6',
  '23cb9d77-07db-495f-b41a-189abc411f36',
  '7479e099-e151-4480-96d7-684fe9f024c7');

-- 4) 계약 10건: 해지일로 종료
update contracts c set end_date = v.d, status = 'ended', updated_at = now()
from (values
  ('79ed1cb5-e71d-4f5f-8ce2-6e4ce2b29346'::uuid, date '2026-04-17'),
  ('e2191f7b-3b30-490a-a2f2-3df0991efe3c'::uuid, date '2026-08-05'),
  ('9b020e42-f4e2-4aaa-a3a5-c79b29bac672'::uuid, date '2026-04-30'),
  ('38a0560d-062b-4b8d-9178-bf4b312d27c0'::uuid, date '2026-03-19'),
  ('01866766-10c6-4538-9fa1-53ac3b264ec4'::uuid, date '2026-03-17'),
  ('b67ffa5d-3c7c-4798-a056-89d94cc1c3ad'::uuid, date '2026-04-01'),
  ('e2c362a7-c0af-4c15-91cb-2fa6e727c826'::uuid, date '2026-07-12'),
  ('41d32ee7-25b2-49a8-895b-1e16aedb82aa'::uuid, date '2026-06-30'),
  ('e3315549-e5b3-453f-a38b-08f3a6d7cc3e'::uuid, date '2026-06-30'),
  ('85dfee2f-5a8b-479d-b4bf-e298bad59ed5'::uuid, date '2026-06-30')) as v(id, d)
where c.id = v.id;

-- 5) 담당 배정 13건: 해지일로 종료
update worker_assignments w set effective_to = v.d, updated_at = now()
from (values
  ('cda40c5c-25fe-4eaa-8269-b182bbced903'::uuid, date '2026-03-17'),
  ('0c29020a-4f36-441b-b4e0-98741c3bfd96'::uuid, date '2026-04-01'),
  ('55da4b3c-d3bb-454e-a3c2-fef43d6f3e1c'::uuid, date '2026-04-01'),
  ('7594ce0e-0d11-473b-bb9f-142cdb344337'::uuid, date '2026-03-19'),
  ('4beecb10-efdd-4e1c-8fe5-d38a225b3d4f'::uuid, date '2026-04-17'),
  ('4b5cdf6a-d9ca-475e-beb9-6a92c520f42b'::uuid, date '2026-04-30'),
  ('07fae5fc-0390-432a-a9cf-5a4b433a78b1'::uuid, date '2026-06-30'),
  ('0b5805d8-54b3-44ed-a5b2-ccfa8d193ed0'::uuid, date '2026-06-30'),
  ('9ee918af-055f-42a3-865d-ed302ccd792f'::uuid, date '2026-08-05'),
  ('37259bcd-5a56-4385-8e56-67cf2bbbede6'::uuid, date '2026-06-30'),
  ('010218e7-c508-476b-9191-d0f77aaeca08'::uuid, date '2026-07-12'),
  ('62dd9bce-0926-43c9-aaa6-2a3771456e5b'::uuid, date '2026-07-12'),
  ('e166a917-aef4-490a-af8c-c9685238ccf8'::uuid, date '2026-09-01')) as v(id, d)
where w.id = v.id;

-- 6) 요일 일정 13건 끄기
update company_schedule set is_active = false where id in (
  '28a2e45a-6447-45cc-8ef5-025d7f47f344',
  '86c510c8-3e87-41a3-9b63-3881e73b3400',
  '710229f7-6453-4110-b638-be74d5cbe445',
  '6995ef26-607b-45f7-b576-98335f63da1c',
  'e4cece30-ccf6-4b28-bb66-b4408300d969',
  '1b49662f-348a-4327-9417-21bfa69a10d6',
  '53215f3b-b914-495d-9073-c1c0ff645e56',
  '6f5d432b-4960-4ca9-99fe-3026b10e3e9b',
  '629a7965-a0be-4c24-9669-70daaccd1cf6',
  'ba16ee58-3382-4100-804a-1eae50b48d59',
  'ac5b5df5-f4c7-4135-a8be-d91b06c6291d',
  '7d5cf4e6-2b54-4ce1-8fb8-52cb37a12ef0',
  '73b942f4-ed7a-4d5e-a0d6-291fdaa7b7c8');

-- 7) 해지일 이후 예정(scheduled) 일정 취소 (해지 업체만, 삭제 아님)
update tasks t set status = 'cancelled', updated_at = now()
from companies c
where c.id = t.company_id and c.status = 'terminated' and c.terminated_at is not null
  and t.task_date > c.terminated_at and t.status = 'scheduled';
