// Pure ranking + search logic. Runs in the browser and in node (test/engine.test.js).
(function (root) {
  const STOP = new Set(['THE', 'OF', 'AND', 'INC', 'FOR', 'A', 'IN', 'MN', 'MINNESOTA']);
  function toks(s) {
    return s.toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\bST\b/g, 'SAINT').split(/\s+/).filter(Boolean);
  }
  function keyToks(s) { return toks(s).filter(t => !STOP.has(t)); }

  function index(D) {
    D.tok = D.orgs.map(o => keyToks(o[0]));
    D.byFunder = D.funders.map(() => []);
    D.orgs.forEach((o, i) => { for (const g of o[4]) D.byFunder[g[0]].push(i); });
    D.byFunder = D.byFunder.map(a => Array.from(new Set(a)));
    D.fCause = D.funders.map((f, fi) => {
      const c = {}; let n = 0;
      for (const oi of D.byFunder[fi]) { const k = D.orgs[oi][2]; if (k >= 0) { c[k] = (c[k] || 0) + 1; } n++; }
      return { c, n };
    });
    D.fCity = D.funders.map((f, fi) => {
      const c = {}; for (const oi of D.byFunder[fi]) { const k = D.orgs[oi][1]; c[k] = (c[k] || 0) + 1; }
      return c;
    });
    D.fHome = D.fCity.map((c, fi) => {
      let city = -1, n = 0; for (const k in c) if (c[k] > n) { n = c[k]; city = +k; }
      return { city, share: D.byFunder[fi].length ? n / D.byFunder[fi].length : 0 };
    });
    return D;
  }
  const CORE = new Set(['Minneapolis', 'Saint Paul']);

  // Name search: every query word must prefix-match a word in the name.
  function search(D, q, limit) {
    const qt = keyToks(q); if (!qt.length) return [];
    const out = [];
    for (let i = 0; i < D.orgs.length; i++) {
      const t = D.tok[i]; let hit = 0, exact = 0;
      for (const w of qt) {
        let m = 0;
        for (const x of t) { if (x === w) { m = 2; break; } if (x.startsWith(w)) m = 1; }
        if (!m) { hit = -1; break; } hit++; if (m === 2) exact++;
      }
      if (hit < 0) continue;
      const extra = t.length - qt.length;
      out.push([i, exact * 3 - extra * 0.5 + Math.log2(1 + D.orgs[i][4].length) * 1.2]);
    }
    out.sort((a, b) => b[1] - a[1]);
    return out.slice(0, limit || 8).map(x => x[0]);
  }

  // Other spellings of the same group: names that share most of their key words.
  function lookalikes(D, oi, picked) {
    const a = new Set(D.tok[oi]); if (!a.size) return [];
    const out = [];
    for (let i = 0; i < D.orgs.length; i++) {
      if (picked.includes(i) || !D.orgs[i][4].length) continue;
      const b = D.tok[i]; let s = 0;
      for (const x of b) if (a.has(x)) s++;
      const j = s / (a.size + b.length - s);
      const sameCity = D.orgs[i][1] === D.orgs[oi][1];
      if (j >= 0.75 || (j >= 0.5 && sameCity && s >= 2)) out.push([i, j + (sameCity ? 0.2 : 0)]);
    }
    out.sort((x, y) => y[1] - x[1]);
    return out.slice(0, 6).map(x => x[0]);
  }

  function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

  // Who funds these orgs (renewals), and who to ask next (ranked by fit).
  function lookup(D, picked) {
    const me = new Set(picked);
    const o0 = D.orgs[picked[0]];
    const cause = o0[2], city = o0[1];
    const mine = new Map();
    for (const oi of picked) for (const g of D.orgs[oi][4]) {
      if (!mine.has(g[0])) mine.set(g[0], []);
      mine.get(g[0]).push({ amt: g[1], yr: g[2], why: D.purposes[g[3]] });
    }
    const renew = Array.from(mine.entries()).map(([fi, gs]) => ({ fi, f: D.funders[fi], gs, total: gs.reduce((s, g) => s + g.amt, 0) }))
      .sort((a, b) => b.total - a.total);

    // peers: groups your funders also fund, weighted so a funder giving to hundreds counts less than one giving to ten
    const w = new Map();
    for (const fi of mine.keys()) {
      const R = D.byFunder[fi], k = 1 / Math.log2(2 + R.length);
      for (const r of R) if (!me.has(r)) w.set(r, (w.get(r) || 0) + k);
    }
    const cands = [];
    D.funders.forEach((f, fi) => {
      if (f.o !== 1 || mine.has(fi) || f.m < 2 || f.sch >= 0.5 || f.em >= 0.5 || f.m / f.t < 0.3) return;
      const R = D.byFunder[fi];
      let ps = 0; const peers = [];
      for (const r of R) { const x = w.get(r); if (x) { ps += x; peers.push([r, x]); } }
      const peer = ps / Math.sqrt(R.length);
      const fc = D.fCause[fi];
      const causeN = cause >= 0 ? (fc.c[cause] || 0) : 0;
      const causeShare = fc.n ? causeN / fc.n : 0;
      const cityN = D.fCity[fi][city] || 0;
      if (peer <= 0 && causeN < 2 && cityN < 1) return;
      // a funder that gives mostly to one other town (not the metro core) is not a fit elsewhere
      const h = D.fHome[fi];
      if (h.share > 0.6 && cityN === 0 && !CORE.has(D.cities[h.city])) return;
      peers.sort((a, b) => b[1] - a[1]);
      cands.push({ fi, f, peer, peerN: peers.length, peers: peers.slice(0, 3).map(p => p[0]), causeN, causeShare, cityN });
    });
    const pmax = Math.max(1e-9, ...cands.map(c => c.peer));
    for (const c of cands) c.score = 2 * c.peer / pmax + 1.5 * c.causeShare * Math.min(1, c.causeN / 5) + 0.6 * Math.min(1, c.cityN / 4);
    cands.sort((a, b) => b.score - a.score);
    return { renew, asks: cands, cause: cause >= 0 ? D.causes[cause] : '', city: D.cities[city] };
  }

  // A real example gift from this funder to a peer (evidence under each ask).
  function peerGift(D, fi, oi) {
    let best = null;
    for (const g of D.orgs[oi][4]) if (g[0] === fi && (!best || g[1] > best[1])) best = g;
    return best && { org: D.orgs[oi][0], city: D.cities[D.orgs[oi][1]], amt: best[1], yr: best[2] };
  }

  const api = { index, search, lookalikes, lookup, peerGift, median, keyToks };
  if (typeof module !== 'undefined') module.exports = api; else root.Engine = api;
})(this);
