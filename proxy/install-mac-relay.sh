#!/bin/sh
set -eu

relay_dir="${DELAYRACE_RELAY_DIR:-$HOME/Library/Application Support/DelayRace}"
plist_path="$HOME/Library/LaunchAgents/com.delayrace.bahn-relay.plist"
template_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

if ! command -v tailscale >/dev/null 2>&1; then
  echo "tailscale is required: install it from https://tailscale.com/download/mac" >&2
  exit 1
fi
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required to install Caddy: https://brew.sh" >&2
  exit 1
fi

tailscale_ip="$(tailscale ip -4 | sed -n '1p')"
if [ -z "$tailscale_ip" ]; then
  echo "Could not determine the Mac Tailscale IPv4 address" >&2
  exit 1
fi

caddy_bin="$(brew --prefix caddy 2>/dev/null)/bin/caddy"
if [ ! -x "$caddy_bin" ]; then
  brew install caddy
fi
caddy_bin="$(brew --prefix caddy)/bin/caddy"

mkdir -p "$relay_dir" "$HOME/Library/LaunchAgents"
sed "s/__TAILSCALE_IP__/$tailscale_ip/g" "$template_dir/Caddyfile.template" > "$relay_dir/Caddyfile"
sed \
  -e "s#__CADDY_BIN__#$caddy_bin#g" \
  -e "s#__CADDYFILE__#$relay_dir/Caddyfile#g" \
  -e "s#__RELAY_DIR__#$relay_dir#g" \
  "$template_dir/com.delayrace.bahn-relay.plist.template" > "$plist_path"

"$caddy_bin" validate --config "$relay_dir/Caddyfile" --adapter caddyfile
launchctl bootout "gui/$(id -u)/com.delayrace.bahn-relay" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist_path"
launchctl kickstart -k "gui/$(id -u)/com.delayrace.bahn-relay"

echo "Relay installed at $tailscale_ip:8088"
echo "Caddy config: $relay_dir/Caddyfile"
echo "Logs: $relay_dir/caddy.{stdout,stderr}.log"
