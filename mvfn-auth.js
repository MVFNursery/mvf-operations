/* mvfn-auth.js — shared one-time unlock + auth header for MVFN field PWAs.
 *
 * Include in <head> BEFORE the app's own script:
 *   <script src="mvfn-auth.js"></script>                      (field apps)
 *   <script src="mvfn-auth.js" data-token-key="mvfn_ops_token"></script>  (ops admin)
 *
 * What it does:
 *  - Stores an access token in localStorage (one-time unlock per device).
 *  - Monkeypatches fetch() to add the "X-MVFN-Token" header to every request
 *    aimed at the n8n host. n8n's webhook Header Auth checks it server-side.
 *  - Shows a blocking unlock overlay when no token is set, and re-shows it if
 *    the server rejects the token (HTTP 403).
 *
 * The token is NEVER hard-coded here — it lives only in the user's localStorage.
 */
(function () {
  var script = document.currentScript;
  var TOKEN_KEY = (script && script.dataset && script.dataset.tokenKey) || 'mvfn_field_token';
  var HEADER = 'X-MVFN-Token';
  var N8N_HOST = 'megamachine.taile865b6.ts.net';

  function getTok() { return (localStorage.getItem(TOKEN_KEY) || '').trim(); }
  function setTok(t) {
    if (t) localStorage.setItem(TOKEN_KEY, t.trim());
    else localStorage.removeItem(TOKEN_KEY);
  }
  function isN8n(url) { return typeof url === 'string' && url.indexOf(N8N_HOST) !== -1; }

  // expose a lock control for apps that want a "Lock" button
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
      if (hitN8n && res && (res.status === 401 || res.status === 403)) { setTok(''); showOverlay(); }
      return res;
    });
  };

  // ---- blocking unlock overlay ----
  function showOverlay() {
    if (document.getElementById('mvfn-auth-ov')) return;
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
      '<div id="mvfn-auth-msg" style="font-size:.72rem;color:#9b2c1f;min-height:1em;margin:6px 0 0"></div>' +
      '<button id="mvfn-auth-go" type="button" ' +
      'style="margin-top:10px;width:100%;padding:12px;border:0;border-radius:8px;background:#2d5016;' +
      'color:#fff;font-size:1rem;font-weight:700;cursor:pointer">Unlock</button>' +
      '</div>';
    document.body.appendChild(ov);
    var inp = ov.querySelector('#mvfn-auth-in');
    var go = ov.querySelector('#mvfn-auth-go');
    function submit() {
      var v = inp.value.trim();
      if (!v) { ov.querySelector('#mvfn-auth-msg').textContent = 'Token required'; return; }
      setTok(v);
      ov.remove();
      location.reload();   // re-run the app's normal load path, now with the header
    }
    go.addEventListener('click', submit);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 50);
  }

  // gate immediately on load when there's no token yet
  if (!getTok()) {
    if (document.body) showOverlay();
    else document.addEventListener('DOMContentLoaded', showOverlay);
  }
})();
