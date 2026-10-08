# Next Ask

**Live:** https://mn-next-ask.vercel.app

**Free tool for Minnesota nonprofits: type your group's name, see every foundation that already funds you, and the ones to ask next — with how to apply.**

Live: https://mn-next-ask.vercel.app

A Minnesota nonprofit with a $500K–2M budget gets most of its money from many small gifts and grants (the median foundation grant to one is a few thousand dollars). Finding the next funder eats staff hours. This puts the answer on one phone screen:

1. **Your funders** — every Minnesota foundation that listed a gift to you on its latest tax return, with amount, year and purpose. These are your renewals.
2. **Ask these next** — foundations that take applications and fund groups like yours (same cause, same town, or that share your funders) but have not funded you. Ranked by fit, with the typical gift size and the contact, deadline and limits copied from the foundation's own return.
3. **Draft a letter** — one short profile (saved on your phone only) fills a starter letter per funder.

No login, no tracking of what you type; everything runs in the browser over static JSON.

## Data

Public IRS data only:

- `data/mn_foundation_grants.csv` — every grant on the latest e-filed Form 990-PF or Form 990 Schedule I of 1,875 Minnesota grantmakers (mostly tax year 2024), pulled from the IRS bulk XML at `apps.irs.gov/pub/epostcard/990/xml/`.
- `data/eo_mn.csv` — IRS Exempt Organizations Business Master File, Minnesota (names, cities, NTEE cause codes).
- `data/apply.json` — the 990-PF "application submission information" block (Part XV) per foundation, made by `scripts/extract_apply.py` from the same XML.

"Takes applications" means the foundation did **not** check the 990-PF box saying it gives only to pre-selected organizations.

Limits: recipient names on tax returns are free text, so one group can appear under several spellings — the tool shows look-alike names and lets you add them. Gifts from individuals, companies and government are not in these returns.

## Build

```
python3 scripts/extract_apply.py <dir of EIN.xml returns>   # -> data/apply.json
python3 scripts/build.py                                     # -> site/data/*.json
node --test test/*.test.js
VERCEL_TOKEN=... python3 scripts/deploy.py                   # deploys site/
```

Ranking lives in `site/engine.js` (shared by the page and the tests).

MIT licence.
