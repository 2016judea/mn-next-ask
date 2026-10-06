const test = require('node:test'), assert = require('node:assert');
const E = require('../site/engine.js');
const D = E.index(Object.assign(require('../site/data/orgs.json'), require('../site/data/funders.json')));

test('search finds a named group first', () => {
  const s = E.search(D, 'jeremiah program');
  assert.match(D.orgs[s[0]][0], /^Jeremiah Program$/);
});

test('asks never include a current funder, and every ask takes applications', () => {
  for (const q of ['loaves and fishes', 'washburn center', 'duluth art institute']) {
    const oi = E.search(D, q)[0], r = E.lookup(D, [oi]);
    assert.ok(r.renew.length > 0, q);
    const mine = new Set(r.renew.map(x => x.fi));
    assert.ok(r.asks.length > 0, q);
    for (const a of r.asks) { assert.ok(!mine.has(a.fi)); assert.strictEqual(a.f.o, 1); }
  }
});

test('renewal totals add up to the grants on file', () => {
  const oi = E.search(D, 'loaves and fishes')[0], r = E.lookup(D, [oi]);
  const sum = D.orgs[oi][4].reduce((s, g) => s + g[1], 0);
  assert.strictEqual(r.renew.reduce((s, x) => s + x.total, 0), sum);
});

test('a group with no gifts on file still gets asks from cause and town', () => {
  const oi = D.orgs.findIndex(o => !o[4].length && o[2] >= 0 && D.cities[o[1]] === 'Duluth');
  assert.ok(E.lookup(D, [oi]).asks.length > 0);
});
