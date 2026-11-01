# supabase/

| 폴더 | 용도 |
|---|---|
| `migrations/` | 운영 DB에 적용할 SQL. `main` 에 push 하면 Supabase GitHub 통합이 자동 적용 (Project Settings > Integrations > GitHub, Deploy to production 켜짐). |
| `proposed/` | 제안만 하고 아직 적용하지 않은 SQL. 적용하려면 `migrations/` 로 옮기고 타임스탬프 파일명으로 변경. |

## 새 마이그레이션 추가 규칙
1. 파일명 `YYYYMMDDHHMMSS_설명.sql` (KST 기준 시각, 기존 파일보다 뒤여야 함)
2. 스키마 변경(ALTER/CREATE/함수/RLS)은 `..._schema_설명.sql`, 데이터 변경(특정 행 DELETE/UPDATE)은 `..._data_설명.sql` 로 구분.
3. 가능하면 `if not exists` / `create or replace` 로 재실행 안전하게.
4. push 후 Supabase 대시보드 > Branches > main > View Logs 에서 배포 로그 확인. 보통 1분 내 적용. 실패한 마이그레이션은 이후 것도 막으므로 바로 고쳐 push.

## 데이터 변경(DELETE/UPDATE) 규칙 — 2026-11-01 합의
- 되돌릴 수 없으므로 반드시 **id 또는 (업체·월·금액·상태) 조건을 명시**. 테이블 전체를 건드리는 문장 금지.
- push 전에 대상 행을 SELECT 로 확인해 건수·내용을 사용자에게 보여주고, **사용자가 채팅에서 승인("ㅇㅇ")한 뒤** push 한다.
- 적용 후 SELECT 로 결과를 검증해 보고한다.
- 반복되는 정리 작업(0원 배정 행 삭제, 해지 업체 pending 청구 삭제, 계약 종료 처리 등)은 관리자 화면 기능으로 옮기는 것을 우선 검토.

## 상태
- 2026-11-01: GitHub 통합 활성화 (저장소 shfy1205-lang/officecleanpro, 작업 디렉토리 `.`, 운영 브랜치 `main`, Deploy to production ON)
