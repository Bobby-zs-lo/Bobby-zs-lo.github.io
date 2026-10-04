#!/usr/bin/env bash
# Run every running/ test. Usage: bash running/tests/run-all.sh [--smoke]
#   --smoke also runs the Playwright smoke test (needs `playwright` resolvable,
#   e.g. PLAYWRIGHT_NODE_MODULES=/path/to/node_modules).
set -e
cd "$(dirname "$0")/../.."
for t in format markdown router sparkline changes; do
  node --test-reporter=dot "running/tests/$t.test.mjs"
  echo "ok - $t"
done
if [ "$1" = "--smoke" ]; then
  node running/tests/smoke.playwright.mjs
fi
echo "All running tests passed."
