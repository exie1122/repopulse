#!/usr/bin/env bash
set -euo pipefail

APP_NAME="repopulse"
BIN_PATH="/usr/local/bin/repopulse"
ENV_PATH="/etc/repopulse.env"
DB_DIR="/var/lib/repopulse"
DB_PATH="$DB_DIR/repopulse.db"
SERVICE_PATH="/etc/systemd/system/repopulse.service"
DEFAULT_INTERVAL_MINUTES="240"

usage() {
  cat <<'EOF'
RepoPulse Raspberry Pi installer

Usage:
  ./installer
  ./installer ghp_your_token owner/repo another/repo
  REPOPULSE_GITHUB_TOKEN=ghp_your_token ./installer owner/repo

Options:
  --interval-minutes N   Sync interval. Default: 240
  --help                 Show this help

Run ./installer by itself for the safest path. It will prompt for your token
without showing it on screen, then ask which repositories to track.
EOF
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    return 1
  fi
}

info() {
  printf '\n\033[1;34m==>\033[0m %s\n' "$1"
}

warn() {
  printf '\n\033[1;33mWarning:\033[0m %s\n' "$1"
}

die() {
  printf '\n\033[1;31mError:\033[0m %s\n' "$1" >&2
  exit 1
}

TOKEN="${REPOPULSE_GITHUB_TOKEN:-}"
INTERVAL_MINUTES="$DEFAULT_INTERVAL_MINUTES"
REPOS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --interval-minutes)
      [[ $# -ge 2 ]] || die "--interval-minutes needs a value"
      INTERVAL_MINUTES="$2"
      shift 2
      ;;
    --interval-minutes=*)
      INTERVAL_MINUTES="${1#*=}"
      shift
      ;;
    ghp_*|github_pat_*)
      if [[ -n "$TOKEN" ]]; then
        die "Token was provided more than once"
      fi
      TOKEN="$1"
      warn "Passing tokens as command arguments can leave them in shell history. Prefer running ./installer and using the hidden prompt."
      shift
      ;;
    *)
      REPOS+=("$1")
      shift
      ;;
  esac
done

[[ "$INTERVAL_MINUTES" =~ ^[0-9]+$ ]] || die "Interval must be a number"
if (( INTERVAL_MINUTES < 5 )); then
  warn "Intervals below 5 minutes are too aggressive for GitHub traffic sync. Using 5 minutes."
  INTERVAL_MINUTES="5"
fi

if [[ "$(id -u)" -eq 0 ]]; then
  die "Run this as your normal Pi user, not root. The script will use sudo when needed."
fi

SERVICE_USER="$(id -un)"
SERVICE_GROUP="$(id -gn)"

if [[ -z "$TOKEN" ]]; then
  printf "GitHub token: "
  read -r -s TOKEN
  printf '\n'
fi

[[ -n "$TOKEN" ]] || die "A GitHub token is required"

if [[ ${#REPOS[@]} -eq 0 ]]; then
  printf "Repositories to track, separated by spaces (owner/repo): "
  read -r REPO_LINE
  if [[ -n "${REPO_LINE:-}" ]]; then
    read -r -a REPOS <<<"$REPO_LINE"
  fi
fi

for repo in "${REPOS[@]}"; do
  if [[ ! "$repo" =~ ^[^/[:space:]]+/[^/[:space:]]+$ ]]; then
    die "Repository '$repo' should look like owner/repo"
  fi
done

info "Installing system dependencies"
if need_cmd apt-get; then
  sudo apt-get update
  sudo apt-get install -y build-essential pkg-config libssl-dev ca-certificates curl
else
  warn "apt-get was not found. Install build-essential, pkg-config, libssl-dev, ca-certificates, and curl manually if the build fails."
fi

info "Installing Rust toolchain if needed"
if ! need_cmd cargo; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  # shellcheck disable=SC1090
  source "$HOME/.cargo/env"
fi

need_cmd cargo || die "cargo was not found after Rust installation"

info "Building RepoPulse CLI"
cargo build -p repopulse-cli --release

info "Installing repopulse binary"
sudo install -m 755 target/release/repopulse "$BIN_PATH"

info "Creating database directory"
sudo install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$DB_DIR"

info "Writing token environment file"
sudo install -m 600 -o root -g root /dev/null "$ENV_PATH"
printf 'REPOPULSE_GITHUB_TOKEN=%s\n' "$TOKEN" | sudo tee "$ENV_PATH" >/dev/null
sudo chmod 600 "$ENV_PATH"

if [[ ${#REPOS[@]} -gt 0 ]]; then
  info "Tracking repositories"
  for repo in "${REPOS[@]}"; do
    printf 'Tracking %s\n' "$repo"
    REPOPULSE_GITHUB_TOKEN="$TOKEN" "$BIN_PATH" --db "$DB_PATH" track "$repo"
  done
else
  warn "No repositories were added. You can add one later with: REPOPULSE_GITHUB_TOKEN=... repopulse --db $DB_PATH track owner/repo"
fi

info "Installing systemd service"
SERVICE_FILE="$(mktemp)"
cat >"$SERVICE_FILE" <<EOF
[Unit]
Description=RepoPulse GitHub traffic collector
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP
EnvironmentFile=$ENV_PATH
StateDirectory=repopulse
ExecStart=$BIN_PATH --db $DB_PATH daemon --interval-minutes $INTERVAL_MINUTES
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
EOF

sudo install -m 644 "$SERVICE_FILE" "$SERVICE_PATH"
rm -f "$SERVICE_FILE"

info "Starting RepoPulse collector"
sudo systemctl daemon-reload
sudo systemctl enable --now "$APP_NAME"

info "Collector status"
systemctl --no-pager --full status "$APP_NAME" || true

cat <<EOF

RepoPulse is installed.

Useful commands:
  repopulse --db $DB_PATH status
  sudo journalctl -u repopulse -f
  sudo systemctl restart repopulse

Database:
  $DB_PATH
EOF
