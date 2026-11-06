#!/usr/bin/env bash
# 바뀐 JS/CSS 파일의 캐시 버전(?v=)을 오늘 날짜+순번으로 올린다.
# 사용: tools/bump-version.sh  (커밋 전에 실행, git diff 기준)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
stamp=$(TZ=Asia/Seoul date +%Y%m%d)
changed=$(git diff --name-only HEAD -- 'js/*' 'css/*'; git diff --name-only --cached -- 'js/*' 'css/*')
[ -z "$changed" ] && { echo "바뀐 JS/CSS 없음"; exit 0; }
for f in $(echo "$changed" | sort -u); do
  for h in *.html; do
    grep -q "$f?v=" "$h" || continue
    cur=$(grep -oE "$f\?v=[0-9]{8}r[0-9]+" "$h" | head -1 | sed -E 's/.*r([0-9]+)$/\1/')
    prev=$(grep -oE "$f\?v=[0-9]{8}" "$h" | head -1 | sed -E 's/.*v=//')
    n=1; [ "$prev" = "$stamp" ] && n=$(( ${cur:-0} + 1 ))
    sed -i -E "s#$f\?v=[0-9A-Za-z]+#$f?v=${stamp}r${n}#g" "$h"
    echo "$h: $f -> ${stamp}r${n}"
  done
done
