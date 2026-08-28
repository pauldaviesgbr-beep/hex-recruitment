#!/bin/sh
#
# XCODE CLOUD RUNS THIS AFTER CLONING AND BEFORE BUILDING.
#
# WITHOUT IT THE BUILD SUCCEEDS AND SHIPS A BROKEN APP, which is the whole
# reason it exists and is worse than any failure. Capacitor's own
# ios/.gitignore excludes two files because `cap copy` generates them:
#
#   ios/App/App/capacitor.config.json   the native runtime config —
#                                       server.url, the app id, everything
#                                       the shell needs to know where to load
#   ios/App/App/public/                 the web assets, i.e. the offline page
#
# They are correctly not in git. So a clean clone has neither, and Xcode is
# perfectly happy to compile an app without them: no error, no warning, a
# green pipeline and a binary that launches to nothing. A generated file
# missing from a clone is invisible to every check that reads the repo.
#
# WHERE THIS FILE HAS TO LIVE, AND IT IS NOT OBVIOUS. Xcode Cloud looks for
# ci_scripts/ NEXT TO THE .xcodeproj — here that is ios/App/ci_scripts/, not
# the repository root. A correctly written script in the wrong directory is
# silently never run, and the symptom is identical to not having written it.
# It must also be executable (mode 100755); Xcode Cloud will not chmod it.
#
# It runs from its own directory, so everything below is relative to
# ios/App/ci_scripts.

set -e   # any failure here must stop the build rather than let it ship short

# RESOLVED FROM THE SCRIPT'S OWN LOCATION, NOT FROM THE CALLER'S.
#
# It was `cd ../../..`, which is correct only when the working directory is
# ios/App/ci_scripts — true for Xcode Cloud, which runs it from there, and
# false for GitHub Actions, which runs from the repository root. That one line
# was the difference between one source of truth and two copies of these
# assertions drifting apart.
#
# Both callers now get the same script and the same checks.
echo "--- ci_post_clone: repository root ---"
cd "$(dirname "$0")/../../.."
pwd

echo "--- node and npm as Xcode Cloud provides them ---"
# Xcode Cloud images ship Node. If that ever stops being true this line fails
# loudly, which is the correct outcome — the alternative is a build that
# silently skips `cap copy`.
node --version
npm --version

echo "--- npm ci (lockfile exactly, no resolution drift in CI) ---"
npm ci

echo "--- npx cap copy ios (generates capacitor.config.json and App/public) ---"
npx cap copy ios

echo "--- proving the two generated files now exist ---"
# ASSERT, DO NOT ANNOUNCE. `cap copy` exiting 0 is not the same as the files
# being on disk, and this script's entire purpose is those two paths.
test -f ios/App/App/capacitor.config.json || { echo "MISSING: capacitor.config.json"; exit 1; }
test -f ios/App/App/public/index.html     || { echo "MISSING: App/public/index.html"; exit 1; }

# And the config must carry the live URL rather than a default — a copy that
# ran against a stale or absent capacitor.config.ts would produce a file that
# exists and is wrong.
grep -q 'thrivecareer.co.uk' ios/App/App/capacitor.config.json \
  || { echo "capacitor.config.json does not name the site"; exit 1; }

echo "--- ci_post_clone: done, both generated files present and correct ---"
