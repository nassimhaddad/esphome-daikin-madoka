/*
 * Madoka — minimalist control page for ESPHome.
 *
 * Served by the device itself via web_server `js_include`, so it runs on the
 * ESP's own origin: the live event stream (/events) and the REST control API
 * (/climate/<name>/set) both work with no CORS headaches.
 *
 * Drop this file next to your YAML and reference it from web_server (see the
 * snippet that came with this file). Then open http://madoka-bridge.local/
 * on your phone and "Add to Home Screen".
 */
(function () {
  "use strict";

  /* ----------------------------- config ------------------------------ */
  // Must match the `name:` of your climate entity exactly.
  var CLIMATE_NAME = "Madoka Climate";
  // Mode used when you tap "on" and the page hasn't seen an active mode yet.
  // One of: COOL | HEAT | HEAT_COOL | DRY | FAN_ONLY | AUTO
  var DEFAULT_ON_MODE = "COOL";

  var EP = "/climate/" + encodeURIComponent(CLIMATE_NAME);

  /* ----------------------------- state ------------------------------- */
  var S = {
    mode: "OFF",       // normalised, uppercase
    action: "",        // cooling | heating | idle | drying | fan | off
    cur: null,         // current temperature
    target: null,      // number, or [low, high]
    online: false,
    lastActive: null,  // last non-OFF mode seen
    pending: false
  };

  var ACCENT = {
    COOL: "#38bdf8", HEAT: "#fb923c", HEAT_COOL: "#a78bfa", AUTO: "#a78bfa",
    DRY: "#2dd4bf", FAN_ONLY: "#4ade80", OFF: "#5b6472"
  };
  var LABEL = {
    OFF: "Off", COOL: "Cool", HEAT: "Heat", HEAT_COOL: "Auto",
    AUTO: "Auto", DRY: "Dry", FAN_ONLY: "Fan"
  };

  /* ------------------------------ view ------------------------------- */
  document.title = "Madoka";

  var vp = document.querySelector('meta[name="viewport"]');
  if (!vp) { vp = document.createElement("meta"); vp.name = "viewport"; document.head.appendChild(vp); }
  vp.content = "width=device-width, initial-scale=1, viewport-fit=cover";

  var css = document.createElement("style");
  css.textContent = [
    "*{box-sizing:border-box;margin:0;-webkit-tap-highlight-color:transparent}",
    "html,body{height:100%}",
    "body{font-family:ui-rounded,-apple-system,'SF Pro Rounded',system-ui,sans-serif;",
      "color:#e7ecf2;min-height:100dvh;display:flex;align-items:center;justify-content:center;",
      "padding:max(28px,env(safe-area-inset-top)) 24px max(28px,env(safe-area-inset-bottom));",
      "background:radial-gradient(125% 80% at 50% -12%,color-mix(in srgb,var(--ac,#5b6472) 22%,transparent),transparent 60%),#0b0e13;",
      "transition:background .8s ease;overflow:hidden}",
    ".wrap{width:100%;max-width:340px;display:flex;flex-direction:column;align-items:center;gap:42px}",
    ".bar{width:100%;display:flex;align-items:center;gap:10px}",
    ".dot{width:8px;height:8px;border-radius:50%;background:#475569;transition:.4s}",
    ".dot.on{background:#4ade80;box-shadow:0 0 10px 1px #4ade8088}",
    ".name{font-size:11px;font-weight:600;letter-spacing:.16em;opacity:.8}",
    ".badge{margin-left:auto;font-size:12px;font-weight:600;padding:4px 12px;border-radius:999px;",
      "color:var(--ac,#5b6472);background:color-mix(in srgb,var(--ac,#5b6472) 16%,transparent);",
      "border:1px solid color-mix(in srgb,var(--ac,#5b6472) 32%,transparent);transition:.4s}",
    ".power{position:relative;width:208px;height:208px;border-radius:50%;border:1px solid #ffffff14;",
      "background:radial-gradient(circle at 50% 36%,#1a212b,#11161d);color:var(--ac,#5b6472);",
      "display:grid;place-items:center;cursor:pointer;",
      "box-shadow:0 30px 60px -22px #000,inset 0 1px 0 #ffffff10;",
      "transition:transform .15s ease,box-shadow .5s,color .5s}",
    ".power:active{transform:scale(.97)}",
    ".power.on{box-shadow:0 0 0 1px color-mix(in srgb,var(--ac) 50%,transparent),",
      "0 0 60px -6px var(--ac),0 30px 60px -22px #000,inset 0 1px 0 #ffffff10}",
    ".power svg{width:76px;height:76px}",
    ".ring{position:absolute;inset:-1px;border-radius:50%;border:2px solid transparent}",
    ".power.pending .ring{border-top-color:var(--ac);animation:spin .9s linear infinite}",
    "@keyframes spin{to{transform:rotate(360deg)}}",
    ".read{text-align:center}",
    ".temp{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:60px;font-weight:500;",
      "line-height:1;letter-spacing:-.02em;transition:opacity .4s}",
    ".temp .u{font-size:24px;opacity:.5;vertical-align:super;margin-left:1px}",
    ".off .temp{opacity:.38}",
    ".sub{margin-top:11px;font-size:14px;opacity:.6;min-height:18px}"
  ].join("");
  document.head.appendChild(css);

  document.body.className = "off";
  document.body.innerHTML =
    '<div class="wrap">' +
      '<div class="bar"><span class="dot" id="dot"></span>' +
      '<span class="name">MADOKA</span><span class="badge" id="badge">—</span></div>' +
      '<button class="power" id="pwr" aria-label="Toggle power"><span class="ring"></span>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v9"/>' +
        '<path d="M6.4 7.2a8 8 0 1 0 11.2 0"/></svg></button>' +
      '<div class="read"><div class="temp" id="temp">--<span class="u">°C</span></div>' +
      '<div class="sub" id="sub">Connecting…</div></div>' +
    '</div>';

  var $dot = document.getElementById("dot"),
      $badge = document.getElementById("badge"),
      $pwr = document.getElementById("pwr"),
      $temp = document.getElementById("temp"),
      $sub = document.getElementById("sub");

  /* ---------------------------- helpers ------------------------------ */
  function num(v) { return (v === null || v === undefined || v === "") ? null : Number(v); }
  function fmt(t) { return (t === null || isNaN(t)) ? "--" : Number(t).toFixed(1); }
  function norm(s) { return String(s || "").toUpperCase().replace(/[\s-]+/g, "_"); }

  function targetStr() {
    if (S.target === null) return null;
    if (Array.isArray(S.target)) return fmt(S.target[0]) + "–" + fmt(S.target[1]) + "°";
    return fmt(S.target) + "°";
  }

  function actionStr() {
    var a = norm(S.action);
    var map = { COOLING: "Cooling", HEATING: "Heating", IDLE: "Idle",
                DRYING: "Drying", FAN: "Fan", OFF: "Standby" };
    if (map[a]) return map[a];
    return S.mode === "OFF" ? "Standby" : (LABEL[S.mode] || "On");
  }

  function render() {
    var on = S.mode !== "OFF";
    var ac = ACCENT[S.mode] || ACCENT.OFF;
    document.body.style.setProperty("--ac", ac);
    document.body.className = on ? "" : "off";

    $dot.className = "dot" + (S.online ? " on" : "");
    $badge.textContent = LABEL[S.mode] || (S.mode.charAt(0) + S.mode.slice(1).toLowerCase());
    $pwr.className = "power" + (on ? " on" : "") + (S.pending ? " pending" : "");

    var big = S.cur !== null ? fmt(S.cur)
            : (S.target !== null && !Array.isArray(S.target)) ? fmt(S.target) : "--";
    $temp.innerHTML = big + '<span class="u">°C</span>';

    if (!S.online && S.mode === "OFF" && S.cur === null) { $sub.textContent = "Connecting…"; return; }
    var ts = targetStr();
    $sub.textContent = on
      ? ((ts ? "Set " + ts + " · " : "") + actionStr())
      : "Standby";
  }

  /* ---------------------------- control ------------------------------ */
  function setMode(mode) {
    if (S.pending) return;
    S.pending = true;
    // optimistic: reflect intent immediately, the stream will confirm
    S.mode = mode;
    if (mode !== "OFF") S.lastActive = mode;
    render();
    fetch(EP + "/set?mode=" + mode, { method: "POST" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); })
      .catch(function () { $sub.textContent = "Couldn't reach device"; });
    // clear the spinner after the device's update_interval has had time to report back
    setTimeout(function () { S.pending = false; render(); }, 4500);
  }

  function toggle() {
    if (S.mode === "OFF") setMode(S.lastActive || DEFAULT_ON_MODE);
    else setMode("OFF");
  }
  $pwr.addEventListener("click", toggle);

  /* -------------------------- live updates --------------------------- */
  function onState(ev) {
    var d;
    try { d = JSON.parse(ev.data); } catch (e) { return; }
    if (String(d.id || "").indexOf("climate") === -1) return;

    var m = norm(d.mode != null ? d.mode : d.state);
    if (m) S.mode = m;
    if (S.mode !== "OFF") S.lastActive = S.mode;

    if ("current_temperature" in d) S.cur = num(d.current_temperature);
    if (d.target_temperature != null) S.target = num(d.target_temperature);
    else if (d.target_temperature_low != null || d.target_temperature_high != null)
      S.target = [num(d.target_temperature_low), num(d.target_temperature_high)];
    if ("action" in d) S.action = d.action;

    render();
  }

  function connect() {
    var es = new EventSource("/events");
    es.addEventListener("state", onState);
    es.onopen = function () { S.online = true; render(); };
    es.onerror = function () { S.online = false; render(); }; // EventSource auto-reconnects
  }

  render();
  connect();
})();
