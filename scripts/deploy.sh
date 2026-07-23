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
git init -b gh-pages -q
git add -A
git commit -q -m "deploy ${SHA}"
git push -f "$REMOTE" gh-pages
rm -rf .git
echo "deployed ${SHA} → gh-pages"
