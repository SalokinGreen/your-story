// The feedback admin page: a static shell, its script and its stylesheet, each
// served from its own URL so the CSP can be `script-src 'self'` with no inline
// code. The script keeps the token in a variable only and puts every submitted
// field on the page with textContent, never innerHTML, and builds no links or
// images (docs/feedback-design.md section 3). Keep this source free of
// backticks and dollar-brace sequences: it is a template literal.

export const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>Feedback</title>
<link rel="stylesheet" href="/feedback/admin.css">
</head>
<body>
<main>
<h1>Feedback</h1>
<section id="login">
<label for="token">Admin token</label>
<input id="token" type="password" autocomplete="off" spellcheck="false">
<button id="enter" type="button">Open</button>
<p id="login-error" class="error" role="alert"></p>
</section>
<section id="app" hidden>
<div id="filters">
<select id="f-kind" aria-label="Kind">
<option value="">Any kind</option>
<option value="turn">turn</option>
<option value="system">system</option>
<option value="starter">starter</option>
<option value="session">session</option>
<option value="app">app</option>
</select>
<select id="f-rating" aria-label="Rating">
<option value="">Any rating</option>
<option value="1">1</option>
<option value="2">2</option>
<option value="3">3</option>
<option value="4">4</option>
<option value="5">5</option>
</select>
<select id="f-handled" aria-label="Handled">
<option value="">Handled or not</option>
<option value="0">Not handled</option>
<option value="1">Handled</option>
</select>
<input id="f-system" type="text" placeholder="system id" aria-label="System id">
<input id="f-starter" type="text" placeholder="starter id" aria-label="Starter id">
<button id="apply" type="button">Apply</button>
</div>
<p id="status" role="status"></p>
<ul id="list"></ul>
<button id="more" type="button" hidden>Load more</button>
<article id="detail" hidden></article>
</section>
</main>
<script src="/feedback/admin.js"></script>
</body>
</html>
`;

export const ADMIN_CSS = `
:root { color-scheme: light dark; }
body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 0 12px 48px; }
main { max-width: 760px; margin: 0 auto; }
h1 { font-size: 1.4rem; }
input, select, button { font: inherit; padding: 8px 10px; margin: 0 6px 8px 0; min-height: 40px; }
input[type=text], input[type=password] { min-width: 0; max-width: 100%; }
#filters { display: flex; flex-wrap: wrap; }
.error { color: #b00020; min-height: 1.5em; }
#list { list-style: none; padding: 0; margin: 0; }
#list li { border: 1px solid #8888; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; cursor: pointer; }
#list li.handled { opacity: 0.55; }
#list li:focus { outline: 2px solid; }
.meta { font-size: 0.85rem; opacity: 0.8; word-break: break-word; }
.snippet { white-space: pre-wrap; word-break: break-word; }
#detail { border: 1px solid #8888; border-radius: 6px; padding: 10px; margin-top: 16px; }
#detail h2 { font-size: 1.1rem; margin-top: 0; }
#detail h3 { font-size: 0.95rem; margin: 12px 0 4px; }
#detail pre { white-space: pre-wrap; word-break: break-word; margin: 0; font: inherit; }
`;

export const ADMIN_JS = `(function () {
"use strict";
var token = "";
var next = null;
var shown = [];

function $(id) { return document.getElementById(id); }
function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = String(text);
  return e;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function when(ms) { return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC"; }

function api(path, init) {
  init = init || {};
  init.headers = Object.assign({ Authorization: "Bearer " + token }, init.headers || {});
  init.cache = "no-store";
  init.referrerPolicy = "no-referrer";
  return fetch(path, init).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      if (!res.ok) { var err = new Error(data.error || ("HTTP " + res.status)); err.status = res.status; throw err; }
      return data;
    });
  });
}

function query(before) {
  var p = new URLSearchParams();
  var pairs = [["kind", "f-kind"], ["rating", "f-rating"], ["handled", "f-handled"], ["system", "f-system"], ["starter", "f-starter"]];
  pairs.forEach(function (pair) {
    var v = $(pair[1]).value.trim();
    if (v) p.set(pair[0], v);
  });
  if (before !== null && before !== undefined) p.set("before", String(before));
  p.set("limit", "50");
  return p.toString();
}

function summaryRow(item) {
  var li = el("li", item.handled ? "handled" : "");
  li.tabIndex = 0;
  var bits = [when(item.received_at), item.ref, item.kind];
  if (item.system_id) bits.push(item.system_id);
  if (item.starter_id) bits.push(item.starter_id);
  if (item.session) bits.push("night " + item.session);
  if (item.rating) bits.push(item.rating + "/5");
  if (item.has_turn) bits.push("turn attached");
  bits.push(item.platform + " " + item.app_version);
  if (item.handled) bits.push("handled");
  li.appendChild(el("div", "meta", bits.join(" | ")));
  li.appendChild(el("div", "snippet", item.text));
  function open() { openItem(item.id); }
  li.addEventListener("click", open);
  li.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  return li;
}

function load(reset) {
  var list = $("list");
  if (reset) { clear(list); next = null; shown = []; $("detail").hidden = true; }
  $("status").textContent = "Loading...";
  return api("/feedback/api/list?" + query(reset ? null : next)).then(function (data) {
    data.items.forEach(function (item) { shown.push(item); list.appendChild(summaryRow(item)); });
    next = data.next;
    $("more").hidden = next === null;
    $("status").textContent = shown.length ? "" : "Nothing here.";
  }).catch(function (e) {
    if (e.status === 401 || e.status === 503) { lock(e.status === 503 ? "The admin token is not set on the Worker." : "Wrong token."); return; }
    $("status").textContent = "Could not load: " + e.message;
  });
}

function field(parent, label, value) {
  if (value === null || value === undefined || value === "") return;
  parent.appendChild(el("h3", "", label));
  parent.appendChild(el("pre", "", value));
}

function openItem(id) {
  api("/feedback/api/item?id=" + encodeURIComponent(id)).then(function (row) {
    var d = $("detail");
    clear(d);
    d.hidden = false;
    d.appendChild(el("h2", "", "Feedback " + row.ref));
    field(d, "Received", when(row.received_at));
    field(d, "Kind", row.kind);
    field(d, "System", row.system_id);
    field(d, "Starter", row.starter_id);
    field(d, "Night", row.session);
    field(d, "Rating", row.rating ? row.rating + " / 5" : "");
    field(d, "App", row.platform + " " + row.app_version);
    field(d, "Text", row.text);
    if (row.turn) {
      field(d, "Player line", row.turn.playerLine);
      field(d, "Prose", row.turn.prose);
      if (row.turn.rolls && row.turn.rolls.length) {
        d.appendChild(el("h3", "", "Rolls"));
        var ul = el("ul");
        row.turn.rolls.forEach(function (r) { ul.appendChild(el("li", "", r)); });
        d.appendChild(ul);
      }
      field(d, "Models", (row.turn.models || []).join(", "));
    }
    var btn = el("button", "", row.handled ? "Mark not handled" : "Mark handled");
    btn.type = "button";
    btn.addEventListener("click", function () {
      api("/feedback/api/handled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, handled: !row.handled })
      }).then(function () { load(true).then(function () { openItem(row.id); }); })
        .catch(function (e) { $("status").textContent = "Could not save: " + e.message; });
    });
    d.appendChild(btn);
    d.scrollIntoView();
  }).catch(function (e) { $("status").textContent = "Could not open: " + e.message; });
}

function lock(message) {
  token = "";
  $("token").value = "";
  $("app").hidden = true;
  $("login").hidden = false;
  $("login-error").textContent = message || "";
}

function enter() {
  token = $("token").value.trim();
  $("token").value = "";
  if (!token) return;
  $("login-error").textContent = "";
  api("/feedback/api/list?limit=1").then(function () {
    $("login").hidden = true;
    $("app").hidden = false;
    load(true);
  }).catch(function (e) {
    lock(e.status === 503 ? "The admin token is not set on the Worker." : e.status === 401 ? "Wrong token." : "Could not reach the Worker.");
  });
}

$("enter").addEventListener("click", enter);
$("token").addEventListener("keydown", function (e) { if (e.key === "Enter") enter(); });
$("apply").addEventListener("click", function () { load(true); });
$("more").addEventListener("click", function () { load(false); });
})();
`;
