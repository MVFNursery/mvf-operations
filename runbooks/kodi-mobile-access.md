# Kodi on megamachine from mobile — remote setup runbook

Goal: watch/control Kodi on megamachine (MM) from a phone, with **nobody physically
at MM**. Everything here runs over the tailnet (`megamachine.taile865b6.ts.net`),
so the phone (or homelab) just needs Tailscale connected.

## Step 0 — is MM even reachable?

MM dropped off the tailnet on 8/17 (see the note in `mvfn-auth.js`). Nothing below
works until it's back. From the phone (Termux/Termius) or from homelab:

```sh
ping -c2 megamachine.taile865b6.ts.net
```

If that fails, MM is offline or off the tailnet — stop here, remote config is
impossible until it reappears.

## Path A — no SSH needed: flip the web UI on via Kodi's JSON-RPC port

If "Allow remote control from applications on other systems" was ever enabled on
MM's Kodi (it is if a remote app like Kore or Yatse was ever paired), Kodi is
already listening on TCP **9090**, and the web interface can be switched on from
any tailnet machine without touching MM.

Check the port (from homelab or Termux):

```sh
nc -vz megamachine.taile865b6.ts.net 9090
```

If it's open, set a web-UI password and enable the web server in one shot:

```sh
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"Settings.SetSettingValue","params":{"setting":"services.webserverpassword","value":"CHANGE-ME"}}' \
  '{"jsonrpc":"2.0","id":2,"method":"Settings.SetSettingValue","params":{"setting":"services.webserver","value":true}}' \
  | nc -q1 megamachine.taile865b6.ts.net 9090
```

(Each line should come back with `"result":true`. Kodi 19+ refuses an
unauthenticated web server, which is why the password is set first.)

Then from the phone browser: **http://megamachine.taile865b6.ts.net:8080**
(user `kodi`, the password you set). That's Chorus2 — full library browse +
remote control, and "play in browser" for files the phone can natively decode.

## Path B — SSH into MM

If MM runs sshd (or Tailscale SSH), run the committed script on it:

```sh
ssh <user>@megamachine.taile865b6.ts.net
# then, with this repo's script copied over (or curl it from GitHub raw):
./mm-enable-kodi-web.sh 'CHANGE-ME'
```

Script: [`scripts/mm-enable-kodi-web.sh`](../scripts/mm-enable-kodi-web.sh).
It stops Kodi (required — Kodi rewrites `guisettings.xml` on exit and would
clobber the edit), backs up and edits `~/.kodi/userdata/guisettings.xml` to
enable the web server on :8080 **and** JSON-RPC on :9090 (so Path A works
forever after, and the Kore remote app can pair), then restarts Kodi.

## Path C — neither port 9090 nor SSH reachable

Then there is no remote way in: Kodi's settings can only be changed through an
interface that's already open. Options become "wait until someone is at the box"
(enable SSH + tick Settings → Services → Control → both "Allow remote control"
boxes — after that, Paths A/B work from anywhere forever) or a remote-hands
reboot into something reachable.

## What you get, and the honest caveat

- **Chorus2 web UI (:8080)** — browse/queue/control from any phone browser;
  in-browser playback is **direct-play only** (no transcoding), so mostly
  h264 MP4s work, exotic MKVs won't.
- **Kore app** (official Kodi remote, iOS/Android) — pairs against the same
  :8080/:9090 and drives the TV from the couch or anywhere on the tailnet.
- **Actually watching everything on the phone** — that wants a transcoding
  server (Jellyfin on MM pointed at the same media folders). Also SSH-installable
  remotely once Path B access exists; ask when ready.
