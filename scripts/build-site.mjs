// Builds the static HR OS handbook site into dist/ (zero dependencies).
// Pages: runbook (README.md), design spec (DESIGN.md), and every Apps Script
// file with a copy button so the owner can paste them into Apps Script.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "fs";
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
.muted{color:var(--muted)}`;

const page = (title, active, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<meta name="robots" content="noindex,nofollow"><style>${css}</style></head><body>
<header><div class="wrap"><b>VFL HR OS</b><nav>
<a href="/deploy/" class="${active === "deploy" ? "on" : ""}">Deploy steps</a>
<a href="/" class="${active === "runbook" ? "on" : ""}">Runbook</a>
<a href="/code/" class="${active === "code" ? "on" : ""}">Apps Script files</a>
<a href="/design/" class="${active === "design" ? "on" : ""}">Design spec</a></nav></div></header>
<main><div class="wrap">${body}</div></main></body></html>`;

writeFileSync(join(out, "index.html"), page("HR OS Runbook", "runbook", md(readFileSync(join(root, "README.md"), "utf8"))));
mkdirSync(join(out, "deploy"));
writeFileSync(join(out, "deploy", "index.html"), page("HR OS Deploy steps", "deploy", md(readFileSync(join(root, "DEPLOY_STEPS.md"), "utf8").replace("](README.md)", "](/)"))));
mkdirSync(join(out, "design"));
writeFileSync(join(out, "design", "index.html"), page("HR OS Design", "design", md(readFileSync(join(root, "DESIGN.md"), "utf8"))));

const dir = join(root, "apps-script");
const files = readdirSync(dir).filter((f) => /\.(gs|json)$/.test(f)).sort((a, b) => (a === "appsscript.json" ? -1 : b === "appsscript.json" ? 1 : a.localeCompare(b)));
mkdirSync(join(out, "code"));
mkdirSync(join(out, "raw"));
let body = `<h1>Apps Script files</h1><p class="muted">In the HR OS sheet open <strong>Extensions ▸ Apps Script</strong>. For each file below, create a script file with the same name (without <code>.gs</code>), press <strong>Copy</strong>, and paste. For <code>appsscript.json</code>, enable <em>Show "appsscript.json"</em> in Project Settings first. ${files.length} files.</p>`;
files.forEach((f, n) => {
  const src = readFileSync(join(dir, f), "utf8");
  writeFileSync(join(out, "raw", f + ".txt"), src);
  body += `<section class="file"><div class="bar"><strong>${n + 1}. ${esc(f)}</strong><span><a href="/raw/${f}.txt">raw</a> &nbsp;<button data-f="c${n}">Copy</button></span></div><pre id="c${n}"><code>${esc(src)}</code></pre></section>`;
});
body += `<script>document.querySelectorAll("button[data-f]").forEach(b=>b.onclick=async()=>{const t=document.getElementById(b.dataset.f).innerText;try{await navigator.clipboard.writeText(t);b.textContent="Copied";setTimeout(()=>b.textContent="Copy",1500)}catch(e){b.textContent="Select & copy manually"}})</script>`;
writeFileSync(join(out, "code", "index.html"), page("HR OS Apps Script files", "code", body));
console.log(`Built dist/ with ${files.length} script files.`);
