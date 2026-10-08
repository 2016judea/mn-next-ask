// Builds one page per recipient under site/for/<key>/, each made from that recipient's own records.
//   node scripts/build_gifts.js
// Grantee pages read data/gifts/<key>.json (the giver's own Schedule I); city pages read the site data.
const fs = require('fs'), path = require('path');
const Engine = require('../site/engine.js');
// Vercel Web Analytics + the persistent per-reader id and touch events (copy of
// bricks/scripts/outreach/reader_events.js — refresh it from there, don't fork it).
const TRACK = '<script>window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};</script>'
  + '<script defer src="/_vercel/insights/script.js"></script>'
  + '<script>' + fs.readFileSync(path.join(__dirname, 'reader_events.js'), 'utf8').trim() + '</script>';
const root = path.join(__dirname, '..');
const D = Object.assign(JSON.parse(fs.readFileSync(root + '/site/data/orgs.json')), JSON.parse(fs.readFileSync(root + '/site/data/funders.json')));
Engine.index(D);

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = v => v >= 1e6 ? '$' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : '$' + Math.round(v).toLocaleString('en-US');
const title = s => String(s || '').toLowerCase().replace(/(^|[\s\-/(&])([a-z])/g, (_, a, b) => a + b.toUpperCase())
  .replace(/\b(Of|And|The|For|In|At|To|On)\b/g, w => w.toLowerCase()).replace(/^./, c => c.toUpperCase())
  .replace(/\b(Mn|Usa|Ymca|Ywca|Llc|Pc)\b/gi, w => w.toUpperCase());
const sentence = s => {
  s = String(s || '').trim();
  if (!s || s.length < 4 || /^(N\/?A|NONE|NO|SEE .*|-)\.?$/i.test(s)) return '';
  if (s === s.toUpperCase()) s = s.toLowerCase().replace(/(^|[.!?]\s+)([a-z])/g, (_, a, b) => a + b.toUpperCase());
  return s.replace(/\b(mn|usa|pdf|llc)\b/g, x => x.toUpperCase()).replace(/\bminnesota\b/g, 'Minnesota')
    .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/g, m => m[0].toUpperCase() + m.slice(1));
};
const site = u => { if (!u) return ''; let h = u.trim().toLowerCase(); if (!/^https?:/.test(h)) h = 'https://' + h.replace(/^\/+/, ''); return h; };
const slug = i => { const o = D.orgs[i]; return (o[0] + ' ' + D.cities[o[1]]).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
const NA = 'https://mn-next-ask.vercel.app/';

// One line on how to reach a funder: website first, then email, then phone; plus a deadline if it says one.
function howTo(f) {
  const a = f.a[0] || {}, bits = [];
  if (f.w) bits.push(`<a href="${esc(site(f.w))}">${esc(f.w.toLowerCase().replace(/^https?:\/\//, ''))}</a>`);
  else if (a.email) bits.push(esc(a.email.toLowerCase()));
  else if (a.phone) bits.push(esc(String(a.phone).replace(/^(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')));
  const dl = sentence(a.deadline);
  if (dl && dl.length < 90) bits.push('Deadline: ' + esc(dl));
  return bits.join(' · ');
}

function page(key, h1, lede, body, src) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(h1)}</title><meta name="robots" content="noindex">
<style>
:root{--bg:#f7f5f0;--card:#fff;--ink:#1d2320;--mute:#5d6862;--line:#e3e0d8;--acc:#205c4a;--acc2:#e8f1ed}
@media (prefers-color-scheme:dark){:root{--bg:#141816;--card:#1d2320;--ink:#ecefed;--mute:#9aa59f;--line:#2e3632;--acc:#7cc4a8;--acc2:#1f2e28}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
main{max-width:760px;margin:0 auto;padding:20px 16px 48px}
h1{font-size:27px;line-height:1.15;margin:4px 0 8px;text-wrap:balance}
.lede{color:var(--mute);margin:0 0 14px}
.brand{font-weight:700;color:var(--acc);font-size:14px;letter-spacing:.05em;text-transform:uppercase}
#f{width:100%;font-size:16px;padding:12px;border:2px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);margin:6px 0 4px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:10px 0;break-inside:avoid}
.card h3{margin:0;font-size:18px;line-height:1.25}
.meta{font-size:14px;color:var(--mute);margin-top:2px}
.got{font-size:15px;margin-top:6px}
ol{margin:8px 0 0;padding-left:22px}
ol li{font-size:15px;margin:6px 0}
ol li b{font-weight:600}
.how{font-size:14px;color:var(--mute);overflow-wrap:anywhere}
a{color:var(--acc)}
.all{font-size:14px;display:inline-block;margin-top:8px}
.n{color:var(--acc);font-weight:700}
footer{margin-top:36px;font-size:13px;color:var(--mute);border-top:1px solid var(--line);padding-top:12px}
@media print{#f{display:none}body{background:#fff}.card{border-color:#ccc}}
</style>${TRACK}</head><body><main>
<div class="brand">Made for you · free</div>
<h1>${esc(h1)}</h1>
<p class="lede">${lede}</p>
<input id="f" type="search" placeholder="Filter by name or town" aria-label="Filter">
<div id="list">${body}</div>
<footer>${src} Free to use, share, print or post. Built by Aidan Jude. Every group has its own page at <a href="${NA}">mn-next-ask.vercel.app</a>.</footer>
</main>
<script>
document.getElementById('f').addEventListener('input',e=>{const q=e.target.value.toLowerCase();for(const c of document.querySelectorAll('.card'))c.hidden=q&&!c.textContent.toLowerCase().includes(q)});
</script></body></html>`;
  fs.mkdirSync(`${root}/site/for/${key}`, { recursive: true });
  fs.writeFileSync(`${root}/site/for/${key}/index.html`, html);
}

// A giver's grantees, each with its other Minnesota funders and three to ask next.
function grantees(key, giver, fyLabel) {
  const G = JSON.parse(fs.readFileSync(`${root}/data/gifts/${key}.json`));
  const byEin = new Map(); D.orgs.forEach((o, i) => { if (o[3] && !byEin.has(o[3])) byEin.set(o[3], i); });
  const groups = new Map();
  for (const g of G.grants) {
    const i = g.ein && byEin.get(g.ein); if (i === undefined) continue;   // individuals and unmatched names have no page
    if (!groups.has(i)) groups.set(i, []); groups.get(i).push(g);
  }
  const cards = []; let withAsks = 0, renewTotal = 0;
  for (const [i, gs] of groups) {
    const picked = [i, ...Engine.lookalikes(D, i, [i]).filter(j => D.orgs[j][1] === D.orgs[i][1])];
    const r = Engine.lookup(D, picked), asks = r.asks.slice(0, 3);
    if (asks.length) withAsks++; renewTotal += r.renew.length;
    const amt = gs.reduce((s, g) => s + (g.amt || 0), 0);
    cards.push([amt, `<div class="card"><h3>${esc(title(D.orgs[i][0]))}</h3>
<div class="meta">${esc(D.cities[D.orgs[i][1]])}${r.cause ? ' · ' + esc(r.cause) : ''}</div>
<div class="got">Your grant: <b>${money(amt)}</b>${gs[0].why ? ', ' + esc(sentence(gs[0].why)) : ''}</div>
<div class="got">Other Minnesota foundations funding them now: <span class="n">${r.renew.length}</span></div>
${asks.length ? `<div class="got" style="margin-top:8px">Three to ask next</div><ol>${asks.map(a => `<li><b>${esc(a.f.n)}</b>, typical gift ${money(a.f.med)}${a.peerN ? `, funds ${a.peerN} of their peers` : ''}<div class="how">${howTo(a.f)}</div></li>`).join('')}</ol>` : '<div class="how" style="margin-top:6px">No open foundation in the data fits them yet.</div>'}
<a class="all" href="${NA}#n=${slug(i)}">All ${r.asks.length} for ${esc(title(D.orgs[i][0]))} →</a></div>`]);
  }
  cards.sort((a, b) => b[0] - a[0]);
  page(key, `Your grantees' next funders`,
    `These are the ${groups.size} Minnesota nonprofits on ${giver}'s grant list for ${fyLabel}. For each one: the other Minnesota foundations already funding them, and three that take applications, fund groups like them, and have not funded them yet.`,
    cards.map(c => c[1]).join(''),
    `Your grants come from ${giver}'s own Form 990 Schedule I for ${fyLabel}. Everyone else's grants come from 1,875 Minnesota foundations' latest IRS returns (mostly 2024). "Takes applications" means the foundation did not check the box saying it gives only to preselected organizations. How to apply is copied from each foundation's return.`);
  return { key, n: groups.size, withAsks, renewTotal };
}

// Open foundations that funded nonprofits in one city, ranked by how many of that city's groups they funded.
function cityList(key, city, h1, ledeExtra) {
  const rows = [];
  D.funders.forEach((f, fi) => {
    if (f.o !== 1) return;
    const orgs = D.byFunder[fi].filter(oi => D.cities[D.orgs[oi][1]] === city);
    if (!orgs.length) return;
    const amts = []; for (const oi of orgs) for (const g of D.orgs[oi][4]) if (g[0] === fi) amts.push(g[1]);
    rows.push({ f, n: orgs.length, med: Engine.median(amts), ex: orgs.slice(0, 3).map(oi => title(D.orgs[oi][0])) });
  });
  rows.sort((a, b) => b.n - a.n || b.med - a.med);
  page(key, h1,
    `${rows.length} Minnesota foundations that take applications funded ${city} nonprofits on their latest tax returns. Most-active first, with how to apply. ${ledeExtra}`,
    rows.map((r, k) => `<div class="card"><h3>${k + 1}. ${esc(r.f.n)}</h3>
<div class="got">Funded <span class="n">${r.n}</span> ${city} group${r.n === 1 ? '' : 's'} · typical gift there ${money(r.med)}</div>
<div class="meta">Including ${esc(r.ex.join(', '))}</div>
<div class="how" style="margin-top:6px">${howTo(r.f) || 'No contact on its return. Look it up by name.'}</div></div>`).join(''),
    `From 1,875 Minnesota foundations' latest IRS Form 990-PF returns (mostly 2024). "Takes applications" means the foundation did not check the box saying it gives only to preselected organizations.`);
  return { key, n: rows.length };
}

// Every open foundation in the state: the "invite-only" answer, one line each.
function openList(key) {
  const rows = D.funders.filter(f => f.o === 1 && f.m > 0).sort((a, b) => b.tot - a.tot);
  const total = rows.reduce((s, f) => s + f.tot, 0);
  page(key, 'The Minnesota foundations that are not invite-only',
    `${rows.length} Minnesota foundations left the "preselected organizations only" box unchecked on their latest 990-PF and gave to Minnesota groups: ${money(total)} in all. Largest first, with typical gift and how to apply. Made for the Nov 4 Grant Writer Incubator.`,
    rows.map((f, k) => `<div class="card"><h3>${k + 1}. ${esc(f.n)}</h3>
<div class="got">${money(f.tot)} to ${f.m} Minnesota groups · typical gift ${money(f.med)}</div>
<div class="meta">${esc(f.c)}</div>
<div class="how" style="margin-top:6px">${howTo(f) || 'No contact on its return. Look it up by name.'}</div></div>`).join(''),
    `From 1,875 Minnesota foundations' latest IRS Form 990-PF returns (mostly 2024). Typical gift is the median grant to a Minnesota group.`);
  return { key, n: rows.length, total };
}

const out = [
  grantees('initiative-foundation', 'The Initiative Foundation', '2024'),
  grantees('southwest-initiative-foundation', 'The Southwest Initiative Foundation', 'the year ending June 2024'),
  cityList('saint-paul-public-library', 'Saint Paul', 'Who funds Saint Paul nonprofits', 'Made for the Workforce and Innovation Center desk.'),
  cityList('hennepin-county-library', 'Minneapolis', 'Who funds Minneapolis nonprofits', 'Made for Hennepin County Library.'),
  openList('grant-writer-incubator'),
];
console.log(JSON.stringify(out));
