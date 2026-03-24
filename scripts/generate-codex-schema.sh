#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
SCHEMA_DIR="$ROOT_DIR/schemas/codex-app-server"

mkdir -p "$SCHEMA_DIR/ts" "$SCHEMA_DIR/json-schema"

codex app-server generate-ts --out "$SCHEMA_DIR/ts"
codex app-server generate-json-schema --out "$SCHEMA_DIR/json-schema"

printf 'Generated Codex app-server schemas in %s\n' "$SCHEMA_DIR"
