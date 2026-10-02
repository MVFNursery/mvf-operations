/* mvfn-auth.js — shared one-time unlock + auth header for MVFN field PWAs.
 *
 * Include in <head> BEFORE the app's own script:
 *   <script src="mvfn-auth.js" data-validate-url="https://.../webhook/mvfn-field-get"></script>
 *   <script src="mvfn-auth.js" data-token-key="mvfn_ops_token" data-validate-url="https://.../webhook/mvfn-get-ops"></script>
 *
 * What it does:
 *  - Stores an access token in localStorage (one-time unlock per device).
 *  - Monkeypatches fetch() to add the "X-MVFN-Token" header to every request
 *    aimed at the n8n host. n8n's webhook Header Auth checks it server-side.
 *  - Shows a blocking unlock overlay when there's no token. The overlay
 *    VALIDATES the entered token against data-validate-url (an authed GET) and
 *    only accepts it on success — a wrong token is rejected on the spot rather
 *    than letting the user in and failing later.
 *  - Re-shows the overlay if the server rejects the token mid-session (401/403).
 *
 * The token is NEVER hard-coded here — it lives only in the user's localStorage.
 *
 * Usage ping (docs/usage_tracking_design.md in the infra repo): a page whose tag
 * carries data-usage-app="<app>" sends one fire-and-forget hit per open to the
 * usage webhook (data-usage-url, default the business one). It also re-counts an
 * open when the page comes back after 30+ min hidden, since phones keep PWAs alive
 * in the background. window.mvfnUsageHit(feature) logs an in-app feature. A failed
 * ping is swallowed, and it uses the ORIGINAL fetch so a 401/403 from the usage
 * webhook can never trip the lock-out handler below.
 */
(function () {
  var script = document.currentScript;
  var ds = (script && script.dataset) || {};
  var TOKEN_KEY = ds.tokenKey || 'mvfn_field_token';
  var VALIDATE_URL = ds.validateUrl || '';
  var HEADER = 'X-MVFN-Token';
  // homelab only since 2026-08-17: megamachine's :5678/:5680 serve bridges are
  // RETIRED (they'd already been dead through the 8/17 MM tailnet outage, so
  // no cached-HTML device can still be working through them). If a stale
  // cached app ever resurfaces pointing at megamachine, the fix is a reload,
  // not re-adding the host here.
  var N8N_HOSTS = ['homelab.taile865b6.ts.net'];

  function getTok() { return (localStorage.getItem(TOKEN_KEY) || '').trim(); }
  function setTok(t) {
    if (t) localStorage.setItem(TOKEN_KEY, t.trim());
    else localStorage.removeItem(TOKEN_KEY);
  }
  function isN8n(url) {
    if (typeof url !== 'string') return false;
    for (var i = 0; i < N8N_HOSTS.length; i++) {
      if (url.indexOf(N8N_HOSTS[i]) !== -1) return true;
    }
    return false;
  }

  // expose controls for apps that want a "Lock" button
  window.mvfnLock = function () { setTok(''); showOverlay(); };
  window.mvfnToken = getTok;

  // ---- fetch monkeypatch: attach the auth header to n8n requests ----
  var _fetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = (typeof input === 'string') ? input : (input && input.url) || '';
    var hitN8n = isN8n(url);
    if (hitN8n) {
      init = init || {};
      var h = new Headers((init && init.headers) || (typeof input !== 'string' && input.headers) || {});
      var t = getTok();
      if (t) h.set(HEADER, t);
      init.headers = h;
      if (typeof input !== 'string') { input = new Request(input, { headers: h }); }
    }
    return _fetch(input, init).then(function (res) {
      // n8n rejects a missing/wrong Header Auth with 401 or 403 -> re-prompt for the token.
      if (hitN8n && res && (res.status === 401 || res.status === 403)) {
        setTok('');
        showOverlay('Access token rejected — check and re-enter.');
      }
      return res;
    });
  };

  // Validate a candidate token against the authed GET endpoint, bypassing the
  // monkeypatch (use the original fetch + explicit header) so we don't trip the
  // global 401/403 handler while checking. Resolves: 'ok' | 'bad' | 'unreachable'.
  function validateToken(tok) {
    if (!VALIDATE_URL) return Promise.resolve('ok');   // no validator configured -> accept
    var hdrs = {}; hdrs[HEADER] = tok;
    return _fetch(VALIDATE_URL, { headers: hdrs, cache: 'no-store' }).then(function (res) {
      if (res.status === 401 || res.status === 403) return 'bad';
      return 'ok';
    }).catch(function () { return 'unreachable'; });
  }

  // ---- blocking unlock overlay ----
  function showOverlay(reason) {
    var existing = document.getElementById('mvfn-auth-ov');
    if (existing) {
      if (reason) { var m = existing.querySelector('#mvfn-auth-msg'); if (m) m.textContent = reason; }
      return;
    }
    var ov = document.createElement('div');
    ov.id = 'mvfn-auth-ov';
    ov.setAttribute('style',
      'position:fixed;inset:0;z-index:2147483647;background:#1a2e0f;display:flex;' +
      'align-items:center;justify-content:center;font-family:Georgia,serif;padding:20px;');
    ov.innerHTML =
      '<div style="background:#f5f0e8;border-radius:16px;padding:28px 26px;width:100%;max-width:300px;' +
      'text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.45)">' +
      '<div style="font-size:1.3rem;font-weight:700;color:#2d5016;margin-bottom:4px">MVFN</div>' +
      '<div style="font-size:.85rem;color:#5a6b2d;margin-bottom:16px">Enter access token to continue</div>' +
      '<input id="mvfn-auth-in" type="password" inputmode="text" autocomplete="off" autocapitalize="off" ' +
      'spellcheck="false" placeholder="access token" ' +
      'style="width:100%;padding:12px;border:2px solid #5a6b2d;border-radius:8px;font-size:1rem;' +
      'box-sizing:border-box;font-family:monospace">' +
      '<div id="mvfn-auth-msg" style="font-size:.72rem;color:#9b2c1f;min-height:1em;margin:6px 0 0">' +
      (reason || '') + '</div>' +
      '<button id="mvfn-auth-go" type="button" ' +
      'style="margin-top:10px;width:100%;padding:12px;border:0;border-radius:8px;background:#2d5016;' +
      'color:#fff;font-size:1rem;font-weight:700;cursor:pointer">Unlock</button>' +
      '</div>';
    document.body.appendChild(ov);
    var inp = ov.querySelector('#mvfn-auth-in');
    var go = ov.querySelector('#mvfn-auth-go');
    var msg = ov.querySelector('#mvfn-auth-msg');
    function submit() {
      var v = inp.value.trim();
      if (!v) { msg.textContent = 'Token required'; return; }
      go.disabled = true; msg.style.color = '#5a6b2d'; msg.textContent = 'Checking…';
      validateToken(v).then(function (result) {
        if (result === 'bad') {
          go.disabled = false; msg.style.color = '#9b2c1f';
          msg.textContent = 'Token rejected — check and re-enter.';
          return;
        }
        if (result === 'unreachable') {
          go.disabled = false; msg.style.color = '#9b2c1f';
          msg.textContent = "Can't reach server — check Tailscale and retry.";
          return;
        }
        setTok(v);
        ov.remove();
        location.reload();   // re-run the app's normal load path, now authed
      });
    }
    go.addEventListener('click', submit);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 50);
  }

  // ---- usage ping (opt-in per page via data-usage-app) ----
  var USAGE_APP = (ds.usageApp || '').trim();
  var USAGE_URL = (ds.usageUrl || 'https://homelab.taile865b6.ts.net:5678/webhook/mvfn-usage').trim();
  var ACTOR_KEY = 'mvfn_usage_actor';
  function ls(k) { try { return (localStorage.getItem(k) || '').trim(); } catch (e) { return ''; } }
  function usageHit(feature) {
    if (!USAGE_APP) return;
    try {
      var t = getTok();
      if (!t) return;                       // locked device: nothing to count yet
      var hdrs = { 'Content-Type': 'application/json' }; hdrs[HEADER] = t;
      _fetch(USAGE_URL, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({
          app: USAGE_APP, feature: String(feature || 'open').trim(),
          device_token: ls('mvfn_device_token'), actor_choice: ls(ACTOR_KEY)
        })
      }).catch(function () {});
    } catch (e) {}
  }
  window.mvfnUsageHit = usageHit;

  // One-time, non-blocking "who uses this device?" chip -- only when the server
  // can't tell (no per-user device_token) and nobody has answered yet.
  function askActor() {
    if (!USAGE_APP || ls('mvfn_device_token') || ls(ACTOR_KEY) || !getTok()) return;
    var bar = document.createElement('div');
    bar.setAttribute('style', 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483646;' +
      'background:#2d5016;color:#fff;border-radius:12px;padding:10px 12px;display:flex;gap:8px;' +
      'align-items:center;font:14px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3)');
    bar.innerHTML = '<span style="flex:1">Who uses this device?</span>';
    ['Ian', 'Kerri'].forEach(function (name) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = name;
      b.setAttribute('style', 'border:0;border-radius:8px;padding:8px 14px;background:#f5f0e8;' +
        'color:#2d5016;font-weight:700;font-size:14px');
      b.addEventListener('click', function () {
        try { localStorage.setItem(ACTOR_KEY, name.toLowerCase()); } catch (e) {}
        bar.remove();
      });
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
  }

  if (USAGE_APP) {
    usageHit('open');
    var hiddenAt = 0;
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt >= 30 * 60 * 1000) usageHit('open');
      hiddenAt = 0;
    });
    if (document.body) askActor();
    else document.addEventListener('DOMContentLoaded', askActor);
  }

  // gate immediately on load when there's no token yet
  if (!getTok()) {
    if (document.body) showOverlay();
    else document.addEventListener('DOMContentLoaded', function () { showOverlay(); });
  }
})();
