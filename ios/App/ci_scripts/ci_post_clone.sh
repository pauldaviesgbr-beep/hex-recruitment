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

# `sync`, NOT `copy`, AND THE VERB IS THE WHOLE BUG.
#
# `copy` writes web assets and config. `sync` is copy PLUS update, and it is
# update that regenerates CapApp-SPM/Package.swift with the installed native
# plugins. This script ran `copy` from the day it was written, when there were
# no plugins and the two verbs were indistinguishable. By the time
# @capacitor/browser and @capacitor/app arrived, nothing regenerated the
# manifest — so build 7 shipped to TestFlight with a Browser plugin whose JS
# half was present and whose native half had never been compiled. The app said
# `"Browser" plugin is not implemented on ios` and Google sign-in could not
# start.
#
# Package.swift is NO LONGER COMMITTED (see ios/.gitignore). This command is
# now the only thing that produces it, on every build, which is why the
# assertions below are not optional.
echo "--- npx cap sync ios (config, web assets, AND the SPM plugin manifest) ---"
npx cap sync ios

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

echo "--- proving the SPM manifest was generated and names every plugin ---"
# THE FILE IS NOT IN THE REPOSITORY. A clone has no Package.swift at all, so
# a sync that failed or was skipped is now a BUILD FAILURE rather than a
# silently wrong binary. That is the point of the change.
test -f ios/App/CapApp-SPM/Package.swift || { echo "MISSING: ios/App/CapApp-SPM/Package.swift - cap sync did not generate it"; exit 1; }

# And the manifest must name every @capacitor plugin package.json depends on.
# Exits non-zero and stops the run; a warning in a green build is the failure
# shape that produced this bug in the first place.
node scripts/prove-capacitor-plugins.mjs || exit 1

echo "--- ci_post_clone: done, both generated files present and correct ---"
