#!/usr/bin/env bash
# 빈자리 레이더 실행 — 의존성 없음(파이썬 표준 라이브러리만).
#   ./run.sh            → 데모 모드로 즉시 실행
#   SEOUL_API_KEY=xxx ./run.sh   → 서울 공개 API 실시간 모드
cd "$(dirname "$0")"
exec python3 -m app.server
