// Builds the static HR OS handbook site into dist/ (zero dependencies).
// Pages: deploy steps (/), script (/code/, single HR_OS.gs + appsscript.json), runbook (/runbook/), design spec (/design/).
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const root = process.cwd();
const out = join(root, "dist");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Minimal markdown → HTML (headings, lists, tables, code, bold, inline code, links).
function md(src) {
  const lines = src.replace(/\r/g, "").split("\n");
  let html = "", i = 0;
  const inline = (t) =>
    esc(t)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      html += `<pre><code>${esc(buf.join("\n"))}</code></pre>`;
      continue;
    }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; i++; continue; }
    if (/^\s*\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const body = rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r));
      html += "<div class=tbl><table>" + body.map((r, k) =>
        "<tr>" + cells(r).map((c) => k === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</table></div>";
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      const tag = ordered ? "ol" : "ul";
      html += `<${tag}>` + items.map((t) => `<li>${inline(t)}</li>`).join("") + `</${tag}>`;
      continue;
    }
    if (!l.trim()) { i++; continue; }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#|```|\s*\||\s*([-*]|\d+\.)\s)/.test(lines[i])) para.push(lines[i++]);
    html += `<p>${inline(para.join(" "))}</p>`;
  }
  return html;
}

const css = `
:root{--bg:#f7f7f5;--fg:#1d1d1b;--muted:#5f5f5a;--card:#fff;--line:#e3e2dd;--accent:#1f5f8b;--code:#f0efea}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#ecebe6;--muted:#a3a29c;--card:#1f1f1d;--line:#34332f;--accent:#7fb6dd;--code:#262623}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{border-bottom:1px solid var(--line);background:var(--card)}
.wrap{max-width:960px;margin:0 auto;padding:0 16px}
header .wrap{display:flex;gap:20px;align-items:center;flex-wrap:wrap;padding:14px 16px}
header b{font-size:18px}nav a{color:var(--muted);text-decoration:none;margin-right:16px}nav a.on,nav a:hover{color:var(--accent)}
main{padding:24px 0 64px}h1,h2,h3{line-height:1.25}h2{margin-top:2em;border-bottom:1px solid var(--line);padding-bottom:.3em}
a{color:var(--accent)}code{background:var(--code);padding:.1em .35em;border-radius:4px;font-size:.9em}
pre{background:var(--code);padding:14px;border-radius:8px;overflow:auto;font-size:13px;line-height:1.45}pre code{background:none;padding:0}
.tbl{overflow-x:auto}table{border-collapse:collapse;width:100%;margin:1em 0;font-size:14px}th,td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}th{background:var(--code)}
.file{background:var(--card);border:1px solid var(--line);border-radius:10px;margin:18px 0}
.file .bar{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line);gap:8px;flex-wrap:wrap}
.file pre{margin:0;border-radius:0 0 10px 10px;max-height:420px}
button{font:inherit;font-size:14px;padding:6px 12px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:var(--card);cursor:pointer}
.muted{color:var(--muted)}.warn{border:2px solid #b3261e;border-radius:8px;padding:12px 14px;background:var(--card)}details.file summary{padding:10px 14px;cursor:pointer}`;

const page = (title, active, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<meta name="robots" content="noindex,nofollow"><style>${css}</style></head><body>
<header><div class="wrap"><b>VFL HR OS</b><nav>
<a href="/" class="${active === "deploy" ? "on" : ""}">Deploy steps</a>
<a href="/code/" class="${active === "code" ? "on" : ""}">Script</a>
<a href="/runbook/" class="${active === "runbook" ? "on" : ""}">Runbook</a>
<a href="/design/" class="${active === "design" ? "on" : ""}">Design spec</a></nav></div></header>
<main><div class="wrap">${body}</div></main></body></html>`;

const read = (f) => readFileSync(join(root, f), "utf8");
const sub = (dir, title, active, body) => { mkdirSync(join(out, dir), { recursive: true }); writeFileSync(join(out, dir, "index.html"), page(title, active, body)); };

writeFileSync(join(out, "index.html"), page("HR OS Deploy steps", "deploy", md(read("DEPLOY_STEPS.md").replace("](README.md)", "](/runbook/)"))));
sub("runbook", "HR OS Runbook", "runbook", md(read("README.md").replace("](DEPLOY_STEPS.md)", "](/)")));
sub("design", "HR OS Design", "design", md(read("DESIGN.md")));

// Script page: one box per deployable file. The version is the first line of deploy/HR_OS.gs (written by scripts/combine.sh).
const hros = read("deploy/HR_OS.gs");
const ver = (/^var HROS_VERSION = '([^']*)';/.exec(hros) || [])[1];
if (!ver) throw new Error("deploy/HR_OS.gs has no HROS_VERSION first line - run npm run combine first");
mkdirSync(join(out, "raw"));
const box = (id, name, src, note, collapsed) => {
  writeFileSync(join(out, "raw", name + ".txt"), src);
  const head = `<div class="bar"><strong>${esc(name)}</strong><span><a href="/raw/${name}.txt">raw .txt</a> &nbsp;<button data-f="${id}">Copy</button></span></div>`;
  const pre = `<pre id="${id}"><code>${esc(src)}</code></pre>`;
  return collapsed
    ? `<details class="file"><summary><strong>${esc(note)}</strong></summary>${head}${pre}</details>`
    : `<section class="file"><div class="bar"><strong>${esc(note)}</strong></div>${head}${pre}</section>`;
};
let body = `<h1>Script</h1>
<p class="warn"><strong>Delete every other file in the Apps Script project. It must contain only <code>HR_OS.gs</code> and <code>appsscript.json</code>. After pasting, run HR OS &#9656; About HR OS and check that the version shown equals the version on this page.</strong></p>
<p>Version on this page: <code id="ver">${esc(ver)}</code></p>
<p class="muted">Open the HR OS sheet, then <strong>Extensions &#9656; Apps Script</strong>. Press Copy, click into the file, select all, paste, save. For <code>appsscript.json</code> tick <em>Show "appsscript.json"</em> in Project Settings first. Then reload the sheet and run <strong>HR OS &#9656; Setup &#9656; Run setup</strong>.</p>`;
body += box("c0", "HR_OS.gs", hros, "1. HR_OS.gs (the whole program)", false);
body += box("c1", "appsscript.json", read("deploy/appsscript.json"), "2. appsscript.json (project settings)", false);
body += box("c2", "CLEANUP_OLD_SHEET.gs", read("deploy/CLEANUP_OLD_SHEET.gs"), "One-time old-sheet cleanup (already done - only for a fresh rebuild)", true);
body += box("c3", "ORGANISE_TABS.gs", read("deploy/ORGANISE_TABS.gs"), "One-time: reorder and colour the tabs", true);
body += `<script>document.querySelectorAll("button[data-f]").forEach(b=>b.onclick=async()=>{const t=document.getElementById(b.dataset.f).innerText;try{await navigator.clipboard.writeText(t);b.textContent="Copied";setTimeout(()=>b.textContent="Copy",1500)}catch(e){b.textContent="Select & copy manually"}})</script>`;
sub("code", "HR OS Script", "code", body);
console.log(`Built dist/ (script version ${ver}).`);
