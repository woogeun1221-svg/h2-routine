#!/usr/bin/env bash
# 테스트 → 빌드 → dist/를 gh-pages 브랜치로 강제 푸시.
# gh 토큰에 workflow 스코프가 없어 Actions 대신 사용 중 —
# `gh auth refresh -h github.com -s workflow` 후에는 .github/workflows/deploy.yml 커밋으로 전환 가능.
set -euo pipefail
cd "$(dirname "$0")/.."

npm test
npm run build

REMOTE=$(git remote get-url origin)
SHA=$(git rev-parse --short HEAD)

cd dist
rm -rf .git
# Jekyll 처리를 끔 — 없으면 `_` 프리픽스 산출물이 서빙에서 빠져 SW precache가 조용히 실패한다
touch .nojekyll
git init -b gh-pages -q
git add -A
git commit -q -m "deploy ${SHA}"
git push -f "$REMOTE" gh-pages
rm -rf .git
echo "deployed ${SHA} → gh-pages"
