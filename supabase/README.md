# supabase/

| 폴더 | 용도 |
|---|---|
| `migrations/` | 운영 DB에 적용할 SQL. `main` 에 push 하면 Supabase GitHub 통합이 자동 적용 (Project Settings > Integrations > GitHub, Deploy to production 켜짐). |
| `proposed/` | 제안만 하고 아직 적용하지 않은 SQL. 적용하려면 `migrations/` 로 옮기고 타임스탬프 파일명으로 변경. |

## 새 마이그레이션 추가 규칙
1. 파일명 `YYYYMMDDHHMMSS_설명.sql` (KST 기준 시각, 기존 파일보다 뒤여야 함)
2. 스키마 변경(ALTER/CREATE/함수/RLS)만 넣기. 특정 행 삭제·수정 같은 데이터 변경은 SQL Editor 에서 직접 실행.
3. 가능하면 `if not exists` / `create or replace` 로 재실행 안전하게.
4. push 후 Supabase 대시보드 > Branches(또는 Integrations) 에서 배포 로그 확인.
