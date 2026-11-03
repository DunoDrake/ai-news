#!/usr/bin/env bash
# Publish the version in ./VERSION as a GitHub release on the releases repo.
# Usage: scripts/release.sh
# Env: AI_NEWS_RELEASES_REPO (default DunoDrake/ai-news-releases)
#
# The zip is built with `git archive`, so only committed files ship: never .env, data/ or other local state.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

REPO="${AI_NEWS_RELEASES_REPO:-DunoDrake/ai-news-releases}"
VERSION="$(tr -d '[:space:]' < VERSION)"
TAG="v$VERSION"
NAME="ai-news-$VERSION"

for bin in git gh shasum; do
	command -v "$bin" >/dev/null 2>&1 || { echo "Missing required command: $bin" >&2; exit 1; }
done
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "VERSION must look like 1.2.3, got: $VERSION" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "Working tree is not clean. Commit or stash first." >&2; exit 1; }
if gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
	echo "Release $TAG already exists on $REPO. Bump VERSION first." >&2
	exit 1
fi

# Notes: commit subjects since the previous release tag (all commits for the first release).
PREV="$(git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null || true)"
if [ -n "$PREV" ]; then RANGE="$PREV..HEAD"; else RANGE="HEAD"; fi
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
{
	echo "AI News $VERSION"
	echo
	git log --no-merges --pretty='- %s' "$RANGE"
	echo
	echo "Run: unzip, then \`node server.mjs\`. Put CC_ROUTER_API_KEY in .env (see README.md). Verify with \`shasum -a 256 -c SHA256SUMS\`."
} > "$OUT/NOTES.md"

git archive --format=zip --prefix="$NAME/" -o "$OUT/$NAME.zip" HEAD
(cd "$OUT" && shasum -a 256 "$NAME.zip" > SHA256SUMS)

git tag -a "$TAG" -m "AI News $VERSION"
git push origin "$TAG"

gh release create "$TAG" "$OUT/$NAME.zip" "$OUT/SHA256SUMS" \
	-R "$REPO" --title "AI News $VERSION (internal test)" --notes-file "$OUT/NOTES.md" --prerelease

# Verify what GitHub actually serves.
CHECK="$(mktemp -d)"
trap 'rm -rf "$OUT" "$CHECK"' EXIT
gh release download "$TAG" -R "$REPO" -D "$CHECK"
(cd "$CHECK" && shasum -a 256 -c SHA256SUMS)
echo "Published $TAG: $(gh release view "$TAG" -R "$REPO" --json url -q .url)"
