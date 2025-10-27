#!/usr/bin/env bash
set -euo pipefail

export CLEAR_DISPATCH_LOG=1
export DISPATCH_DEBUG_SPEED=60

npm run dev
