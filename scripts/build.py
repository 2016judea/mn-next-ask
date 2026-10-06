"""Build site/data/*.json from the IRS-derived inputs in data/.

Inputs (all public IRS data):
  data/mn_foundation_grants.csv  every grant on the latest 990-PF / 990 Schedule I of 1,875 MN grantmakers
  data/eo_mn.csv                 IRS Exempt Organizations Business Master File, Minnesota
  data/apply.json                how-to-apply block per foundation (scripts/extract_apply.py)
Outputs:
  site/data/funders.json         one row per grantmaker
  site/data/orgs.json            one row per MN nonprofit (searchable), with the grants it received
"""
import csv, json, re, statistics, collections as C, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda *p: os.path.join(ROOT, *p)

MAJ = {'A': 'Arts & culture', 'B': 'Education', 'C': 'Environment', 'D': 'Animals', 'E': 'Health',
       'F': 'Mental health', 'G': 'Disease/medical', 'H': 'Medical research', 'I': 'Crime & legal',
       'J': 'Jobs & workforce', 'K': 'Food & agriculture', 'L': 'Housing', 'M': 'Public safety',
       'N': 'Recreation & sports', 'O': 'Youth development', 'P': 'Human services', 'Q': 'International',
       'R': 'Civil rights', 'S': 'Community & economic dev', 'T': 'Philanthropy/grantmakers', 'U': 'Science',
       'V': 'Social science', 'W': 'Public policy', 'X': 'Religion', 'Y': 'Mutual benefit', 'Z': 'Unknown'}
WEAK = {'Unclassified', 'Unknown', 'Philanthropy/grantmakers', ''}

CUT = re.compile(r'\s(ATTN|ATTENTION|C/O|C O|CO:|%|FBO|DBA|D/B/A|FOR THE BENEFIT)\b.*$')
TAIL = re.compile(r'\s(INC|INCORPORATED|CORP|CORPORATION|CO|LLC|NFP|LTD)$')


def norm(s):
    s = ' ' + s.upper().replace('&', ' AND ').replace('%', ' % ') + ' '
    s = CUT.sub('', s.rstrip()) if CUT.search(s) else s
    s = re.sub(r'[^A-Z0-9 ]', ' ', s)
    w = s.split()
    if w and w[0] == 'THE': w = w[1:]
    w = ['SAINT' if x == 'ST' and i < len(w) - 1 else x for i, x in enumerate(w)]
    w = ['MINNESOTA' if x == 'MN' else x for x in w]
    s = ' '.join(w)
    while TAIL.search(s): s = TAIL.sub('', s)
    return s.strip()


def ncity(c):
    w = re.sub(r'[^A-Z ]', ' ', c.upper()).split()
    w = ['SAINT' if x in ('ST', 'STE') else x for x in w]
    return ' '.join(w)


def title(s):
    small = {'and', 'of', 'the', 'for', 'in', 'on', 'at', 'to', 'a'}
    out = []
    for i, x in enumerate(s.lower().split()):
        if x in ('ymca', 'ywca', 'pbs', 'mpr', 'usa', 'ii', 'iii', 'pta', 'pto', 'vfw', 'aclu', 'ucare', 'cdc', 'lgbtq'):
            out.append(x.upper())
        elif i and x in small: out.append(x)
        elif x.startswith('mc') and len(x) > 3: out.append('Mc' + x[2:3].upper() + x[3:])
        else: out.append(x[:1].upper() + x[1:])
    return ' '.join(out)


# ---------------------------------------------------------------- BMF: the list of MN charities
bmf = {}
by_name = C.defaultdict(list)
for r in csv.DictReader(open(D('data', 'eo_mn.csv'))):
    if r['SUBSECTION'] != '03' or r['FOUNDATION'] in ('02', '03', '04'): continue
    n = norm(r['NAME'])
    bmf[r['EIN']] = dict(name=r['NAME'], city=ncity(r['CITY']), ntee=r['NTEE_CD'], n=n)
    by_name[n].append(r['EIN'])
by_name_city = {(v['n'], v['city']): e for e, v in bmf.items()}

# ---------------------------------------------------------------- grants
apply = json.load(open(D('data', 'apply.json')))
rows = list(csv.DictReader(open(D('data', 'mn_foundation_grants.csv'))))
funder_ix, funders = {}, []
purposes, purpose_ix = [], {}
orgs = {}   # key -> dict(name, city, ein, grants=[...], causes=Counter)


def org_key(rname, rcity):
    n, c = norm(rname), ncity(rcity)
    if not n: return None, n, c
    e = by_name_city.get((n, c))
    if not e and len(by_name.get(n, [])) == 1: e = by_name[n][0]
    return (e or n + '|' + c), n, c


fgr = C.defaultdict(list)
for r in rows:
    fgr[r['funder_ein']].append(r)

for ein, gs in fgr.items():
    g0 = gs[0]
    mn = [g for g in gs if g['recipient_state'] == 'MN' and float(g['amount']) > 0]
    amts = [float(g['amount']) for g in mn]
    ap = apply.get(ein, {})
    web = ap.get('web', '')
    if web and not re.search(r'[A-Za-z0-9-]+\.[A-Za-z]{2,}', web): web = ''
    scholar = sum(1 for g in gs if g['grant_type'] == 'Scholarship / individual')
    funder_ix[ein] = len(funders)
    funders.append(dict(
        e=ein, n=re.sub(r' (Inc|Corp|Co|Nfp|Llc)$', '', title(g0['funder'])), c=title(g0['funder_city']),
        o={'yes': 1, 'no': 0}.get(g0['accepts_applications'], 2),
        y=g0['tax_year'], t=len(gs), m=len(mn),
        med=round(statistics.median(amts)) if amts else 0,
        tot=round(sum(amts)),
        sch=round(scholar / len(gs), 2),
        em=round(sum(1 for g in gs if g['grant_type'] == 'Employee match / volunteer') / len(gs), 2),
        a=ap.get('apply', [])[:2], w=web,
    ))

for r in rows:
    if r['recipient_state'] != 'MN': continue
    a = float(r['amount'])
    if a <= 0: continue
    k, n, c = org_key(r['recipient'], r['recipient_city'])
    if not k: continue
    o = orgs.get(k)
    if not o:
        e = k if k in bmf else ''
        o = orgs[k] = dict(name=bmf[e]['name'] if e else r['recipient'], city=bmf[e]['city'] if e else c,
                           ein=e, g=[], causes=C.Counter(), raw=C.Counter())
    o['raw'][r['recipient'].strip()] += 1
    p = ' '.join(r['purpose'].split())[:140]
    if p not in purpose_ix:
        purpose_ix[p] = len(purposes); purposes.append(p.capitalize() if p.isupper() else p)
    o['g'].append([funder_ix[r['funder_ein']], round(a), int(r['tax_year'] or 0), purpose_ix[p]])
    o['causes'][r['cause']] += 1

# BMF charities with no grant on file are still searchable: their cause and city drive the "ask next" list
for e, v in bmf.items():
    if e not in orgs:
        orgs[e] = dict(name=v['name'], city=v['city'], ein=e, g=[], causes=C.Counter(), raw=C.Counter())

out = []
for k, o in orgs.items():
    cause = ''
    if o['ein'] and bmf[o['ein']]['ntee']:
        cause = MAJ.get(bmf[o['ein']]['ntee'][0], '')
    if cause in WEAK:
        best = [c for c, _ in o['causes'].most_common() if c not in WEAK]
        cause = best[0] if best else cause
    if cause in ('Unknown',): cause = ''
    # display name: the BMF legal name, else the most common spelling foundations used
    nm = o['name'] if o['ein'] else o['raw'].most_common(1)[0][0]
    o['g'].sort(key=lambda g: (-g[2], -g[1]))
    nm = re.sub(r'[ ,]+(Inc|INC|Inc\.|Incorporated|INCORPORATED|Corp|CORP|Nfp|NFP|Co|CO|Llc|LLC)\.?$', '', nm.strip())
    out.append([title(nm), title(o['city']), cause, o['ein'], o['g']])

out.sort(key=lambda x: (-len(x[4]), x[0]))
causes = sorted({x[2] for x in out if x[2]})
cix = {c: i for i, c in enumerate(causes)}
cities = sorted({x[1] for x in out})
tix = {c: i for i, c in enumerate(cities)}
orgs_json = dict(causes=causes, cities=cities, purposes=purposes,
                 orgs=[[n, tix[c], cix.get(cs, -1), e, g] for n, c, cs, e, g in out])
os.makedirs(D('site', 'data'), exist_ok=True)
json.dump(dict(funders=funders), open(D('site', 'data', 'funders.json'), 'w'), separators=(',', ':'))
json.dump(orgs_json, open(D('site', 'data', 'orgs.json'), 'w'), separators=(',', ':'))

meta = dict(
    n_funders=len(funders), n_grants_mn=sum(len(x[4]) for x in out), n_grants=len(rows),
    n_orgs=len(out), n_orgs_with_grants=sum(1 for x in out if x[4]),
    n_open=sum(1 for f in funders if f['o'] == 1),
    n_open_with_apply=sum(1 for f in funders if f['o'] == 1 and f['a']),
    years=sorted(C.Counter(r['tax_year'] for r in rows).items(), key=lambda x: -x[1])[:3],
)
json.dump(meta, open(D('site', 'data', 'meta.json'), 'w'), indent=1)
print(json.dumps(meta))
for f in ('funders.json', 'orgs.json'):
    print(f, os.path.getsize(D('site', 'data', f)) // 1024, 'KB')
