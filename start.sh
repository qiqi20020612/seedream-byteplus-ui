#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' '错误：未找到 Node.js，请先安装 Node.js 20 或更高版本。' >&2
  exit 1
fi

NODE_MAJOR=$(node -p 'Number(process.versions.node.split(".")[0])')
if [ "$NODE_MAJOR" -lt 20 ]; then
  printf '%s\n' '错误：需要 Node.js 20 或更高版本。' >&2
  exit 1
fi

exec node server.js
