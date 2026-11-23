-- 2026-11-23 뉴로다임: 격주 화요일, 1회 55,000원(VAT 포함) 기준
-- 11월 2회(11/10, 11/24), 12월 2회(12/8, 12/22) → 각 110,000
update public.billing_records set billed_amount = 110000
 where id in ('f0510fcd-1a29-4681-8b96-ceb87c7aafea')  -- 2026-11
    or (company_id = (select company_id from public.billing_records where id = 'f0510fcd-1a29-4681-8b96-ceb87c7aafea')
        and month = '2026-12' and status = 'pending');
