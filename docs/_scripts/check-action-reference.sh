#!/usr/bin/env bash
set -euo pipefail

# The filter that builds the reference from action.yml warns and leaves its
# placeholder in place when it cannot find the file, which a render alone
# reports as success. Fail here instead of publishing a reference page with no
# reference on it. Both tables have to be there, so count the tables rather
# than grep for a name the surrounding prose also uses.

if [ -z "${QUARTO_PROJECT_RENDER_ALL:-}" ]; then
	echo "Partial render; skipping the action reference check."
	exit 0
fi

page="${QUARTO_PROJECT_OUTPUT_DIR:-_site}/reference/action.html"
if [ ! -f "${page}" ]; then
	echo "Expected the action reference at ${page}, found nothing." >&2
	exit 1
fi

tables=$(grep -c '<table' "${page}" || true)
if [ "${tables}" -lt 2 ]; then
	echo "Expected the inputs and outputs tables, found ${tables} table(s)." >&2
	exit 1
fi
