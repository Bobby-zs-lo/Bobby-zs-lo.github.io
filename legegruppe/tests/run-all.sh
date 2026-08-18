#!/usr/bin/env bash
# Run every legegruppe test. Usage: bash legegruppe/tests/run-all.sh [--full]
set -e
cd "$(dirname "$0")/../.."
for t in model constraints scoring heuristic exact rota infeasibility solve generate api form plan; do
  node "legegruppe/tests/$t.test.mjs"
done
if [ "$1" = "--full" ]; then
  node legegruppe/tests/acceptance.test.mjs
else
  node legegruppe/tests/simulate.mjs 50 > /dev/null && echo "ok - simulate (50, smoke)"
fi
echo "All legegruppe tests passed."
