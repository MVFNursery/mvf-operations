#!/usr/bin/env bash
# Enable Kodi's web interface (Chorus2, :8080) and remote JSON-RPC (:9090)
# on this machine. Run ON megamachine over SSH — see
# runbooks/kodi-mobile-access.md for the full picture.
#
# Usage: ./mm-enable-kodi-web.sh '<web-ui-password>'
set -euo pipefail

PASS="${1:?usage: $0 '<web-ui-password>'}"
GS="${KODI_USERDATA:-$HOME/.kodi/userdata}/guisettings.xml"
HOSTNAME_TS="megamachine.taile865b6.ts.net"

[ -f "$GS" ] || { echo "ERROR: $GS not found — set KODI_USERDATA to Kodi's userdata dir" >&2; exit 1; }

# Kodi rewrites guisettings.xml on exit, so it MUST be fully stopped before
# the edit or the change is silently lost.
if pgrep -x kodi >/dev/null 2>&1 || pgrep -x kodi.bin >/dev/null 2>&1 || pgrep -x kodi-x11 >/dev/null 2>&1; then
  echo "Stopping Kodi..."
  systemctl --user stop kodi 2>/dev/null \
    || sudo systemctl stop kodi 2>/dev/null \
    || killall kodi kodi.bin kodi-x11 2>/dev/null \
    || true
  for _ in $(seq 1 30); do
    pgrep -x kodi >/dev/null 2>&1 || pgrep -x kodi.bin >/dev/null 2>&1 || pgrep -x kodi-x11 >/dev/null 2>&1 || break
    sleep 1
  done
  if pgrep -x kodi >/dev/null 2>&1 || pgrep -x kodi.bin >/dev/null 2>&1; then
    echo "ERROR: Kodi still running after 30s — stop it manually, then re-run" >&2
    exit 1
  fi
fi

cp -a "$GS" "$GS.bak.$(date +%Y%m%d-%H%M%S)"
echo "Backed up guisettings.xml"

python3 - "$GS" "$PASS" <<'PY'
import sys, xml.etree.ElementTree as ET

path, pw = sys.argv[1], sys.argv[2]
want = {
    "services.webserver": "true",
    "services.webserverport": "8080",
    "services.webserverusername": "kodi",
    "services.webserverpassword": pw,
    "services.webserverauthentication": "true",
    "services.esenabled": "true",        # JSON-RPC/EventServer on
    "services.esallinterfaces": "true",  # ...listening beyond localhost (:9090)
}
tree = ET.parse(path)
root = tree.getroot()
seen = set()
for s in root.iter("setting"):
    sid = s.get("id")
    if sid in want:
        s.text = want[sid]
        # the default="true" attribute marks "value equals default" — no longer true
        s.attrib.pop("default", None)
        seen.add(sid)
for sid in want:
    if sid not in seen:
        e = ET.SubElement(root, "setting")
        e.set("id", sid)
        e.text = want[sid]
tree.write(path, encoding="utf-8", xml_declaration=True)
print("Updated settings:", ", ".join(sorted(want)))
PY

echo "Restarting Kodi..."
systemctl --user start kodi 2>/dev/null \
  || sudo systemctl start kodi 2>/dev/null \
  || { nohup kodi >/dev/null 2>&1 & }

echo
echo "Done. From any tailnet device:"
echo "  Web UI:  http://$HOSTNAME_TS:8080   (user: kodi)"
echo "  Kore/JSON-RPC: host $HOSTNAME_TS, HTTP port 8080, TCP port 9090"
