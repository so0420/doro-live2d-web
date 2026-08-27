#!/usr/bin/env sh
# Doro Live2D 뷰어 실행 (Linux / macOS)
#   ./start.sh [포트]        기본 포트 8012
set -eu

cd "$(dirname "$0")"

PORT="${1:-8012}"

if command -v node >/dev/null 2>&1; then
  RUNNER="node server.js $PORT"
elif command -v python3 >/dev/null 2>&1; then
  # node 가 없으면 파이썬 기본 정적 서버로 대체 (public/ 을 루트로)
  RUNNER="python3 -m http.server $PORT --directory public --bind 127.0.0.1"
else
  echo "node 또는 python3 가 필요합니다." >&2
  exit 1
fi

URL="http://localhost:$PORT/"

# 브라우저 자동 실행 (없으면 조용히 넘어간다)
open_browser() {
  sleep 1
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then open "$URL" >/dev/null 2>&1 || true
  fi
}
open_browser &

echo ""
echo "  Doro Live2D viewer"
echo "  ▶  $URL"
echo "  (종료: Ctrl+C)"
echo ""

exec $RUNNER
