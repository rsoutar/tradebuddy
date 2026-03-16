#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
STATE_DIR="${BACKEND_DIR}/.data/state"
LOG_DIR="${BACKEND_DIR}/.data/logs"
DB_PATH="${STATE_DIR}/paper_trading.sqlite3"
SNAPSHOT_PATH="${STATE_DIR}/market_snapshot.json"
LOG_PATH="${LOG_DIR}/trading-bot.log"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_PATH="${STATE_DIR}/paper_trading.backup-${TIMESTAMP}.sqlite3"

printf '\nFull paper reset for Oscar trading bot\n'
printf 'Backend dir: %s\n' "${BACKEND_DIR}"
printf 'This will remove:\n'
printf '  - paper bots\n'
printf '  - trade history\n'
printf '  - paper wallet balances\n'
printf '  - system event log entries stored in SQLite\n'
printf '  - latest backtest summary\n'
printf '  - cached shared market snapshot\n'
printf 'Optional:\n'
printf '  - current backend log file\n\n'

read -r -p "Continue with full reset? [y/N] " confirm
if [[ ! "${confirm}" =~ ^[Yy]$ ]]; then
  printf 'Aborted.\n'
  exit 0
fi

printf '\nStopping bot worker processes...\n'
pkill -f "trading_bot.cli run-bot" || true

mkdir -p "${STATE_DIR}" "${LOG_DIR}"

if [[ -f "${DB_PATH}" ]]; then
  cp "${DB_PATH}" "${BACKUP_PATH}"
  printf 'Database backup created: %s\n' "${BACKUP_PATH}"
else
  printf 'No existing paper database found at %s\n' "${DB_PATH}"
fi

printf '\nRemoving paper database and cached snapshot...\n'
rm -f "${DB_PATH}"
rm -f "${SNAPSHOT_PATH}"

read -r -p "Delete backend log file too? [y/N] " remove_log
if [[ "${remove_log}" =~ ^[Yy]$ ]]; then
  rm -f "${LOG_PATH}"
  printf 'Removed log file: %s\n' "${LOG_PATH}"
else
  printf 'Kept log file: %s\n' "${LOG_PATH}"
fi

printf '\nReset complete.\n'
printf 'Cleared:\n'
printf '  - bot history\n'
printf '  - trade history\n'
printf '  - system event log entries\n'
printf '  - paper wallet state\n'
printf '  - cached market snapshot\n'
printf 'Next steps:\n'
printf '  1. Restart the backend API.\n'
printf '  2. Open the dashboard to recreate a fresh paper account.\n'
printf '  3. Start new bots.\n\n'
