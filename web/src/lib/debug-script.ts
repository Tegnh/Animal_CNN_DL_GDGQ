// Inline <head> script. Plain ES5, no dependencies, runs before React: it still works when
// the JavaScript bundles fail to load or hydration never happens (the iPhone case).
//
// It also carries four tiny fallbacks (Array/String .at, Object.hasOwn, Array.findLast) that
// Next.js's client router uses and that iOS 15.0-15.3 lacks.
//
// Shows a fixed banner with message, file and line when
//   - the URL contains ?debug=1, or
//   - nothing has set window.__omqHydrated within 4 s after the load event.
// The flag is set by <HydrationFlag /> (src/components/HydrationFlag.tsx).
export const DEBUG_SCRIPT = `(function () {
  function fill(proto, name, fn) {
    if (!proto[name]) Object.defineProperty(proto, name, { value: fn, writable: true, configurable: true });
  }
  function at(n) {
    var len = this.length >>> 0;
    n = Math.trunc(n) || 0;
    if (n < 0) n += len;
    return n < 0 || n >= len ? undefined : this[n];
  }
  fill(Array.prototype, 'at', at);
  fill(String.prototype, 'at', at);
  fill(Object, 'hasOwn', function (o, k) { return Object.prototype.hasOwnProperty.call(Object(o), k); });
  function findLastIndex(fn, thisArg) {
    for (var i = (this.length >>> 0) - 1; i >= 0; i--) if (fn.call(thisArg, this[i], i, this)) return i;
    return -1;
  }
  fill(Array.prototype, 'findLastIndex', findLastIndex);
  fill(Array.prototype, 'findLast', function (fn, thisArg) {
    var i = findLastIndex.call(this, fn, thisArg);
    return i < 0 ? undefined : this[i];
  });

  var errors = [];
  var banner = null;
  var gaveUp = false;
  var debug = /[?&]debug=1(&|$)/.test(location.search);
  var ua = navigator.userAgent;

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
  }

  function render() {
    if (!document.body) { document.addEventListener('DOMContentLoaded', render); return; }
    if (!banner) {
      banner = document.createElement('div');
      banner.setAttribute('role', 'alert');
      banner.setAttribute('dir', 'rtl');
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;max-height:60vh;overflow:auto;' +
        'padding:12px 14px;background:#f4e1d5;color:#8e3b16;border-bottom:3px solid #8e3b16;' +
        'font:15px/1.7 system-ui,sans-serif;-webkit-text-size-adjust:100%';
      document.body.appendChild(banner);
    }
    var head = window.__omqHydrated
      ? 'وضع التشخيص: الصفحة تفاعلية (تمّت عملية hydration).'
      : gaveUp || !debug
        ? 'تعذّر تشغيل جافاسكربت التفاعلي في هذه الصفحة، لذلك لا تعمل المنزلقات ولا التجربة.'
        : 'وضع التشخيص: بانتظار أن تصبح الصفحة تفاعلية…';
    var html = '<div style="display:flex;justify-content:space-between;gap:12px"><strong>' + head + '</strong>' +
      '<button type="button" id="omq-debug-close" style="min-width:44px;min-height:44px;border:1px solid #8e3b16;' +
      'background:transparent;color:inherit;font:inherit">إغلاق</button></div>' +
      '<div dir="ltr" style="font:12px/1.6 ui-monospace,Menlo,monospace;text-align:left;word-break:break-all">' +
      esc(ua) + '<br>hydrated=' + (window.__omqHydrated ? 'yes' : 'no') +
      (errors.length ? '<br>' + errors.map(esc).join('<br>') : '<br>(no JavaScript error was caught)') + '</div>';
    banner.innerHTML = html;
    var close = document.getElementById('omq-debug-close');
    if (close) close.onclick = function () { banner.style.display = 'none'; };
    banner.style.display = 'block';
  }

  function record(text) {
    errors.push(text);
    if (debug || banner) render();
  }

  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && (t.src || t.href)) {
      record('Failed to load ' + (t.tagName || 'resource').toLowerCase() + ': ' + (t.src || t.href));
    } else {
      record((e.message || 'Script error') + ' @ ' + (e.filename || '?') + ':' + (e.lineno || 0) + ':' + (e.colno || 0));
    }
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    record('Unhandled rejection: ' + (r && r.stack ? r.stack.split('\\n').slice(0, 3).join(' | ') : r && r.message ? r.message : r));
  });

  function afterLoad() {
    if (debug) render();
    setTimeout(function () {
      if (window.__omqHydrated) return;
      gaveUp = true;
      render();
    }, 4000);
  }
  // <HydrationFlag /> fires this when React has hydrated: refresh a banner that is already up.
  window.addEventListener('omq-hydrated', function () { if (banner) render(); });
  if (document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad);
})();`;
