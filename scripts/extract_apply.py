"""Pull 'how to apply' from each foundation's 990-PF (Part XV, ApplicationSubmissionInfoGrp).
Usage: python3 scripts/extract_apply.py <dir of 990 XML named EIN.xml>  -> data/apply.json"""
import os, sys, json
import xml.etree.ElementTree as ET
def L(e): return e.tag.split('}')[-1]
def kid(e, *names):
    for x in e.iter():
        if L(x) in names and x.text and x.text.strip(): return ' '.join(x.text.split())
    return ''
src = sys.argv[1]; out = {}
for f in sorted(os.listdir(src)):
    if not f.endswith('.xml'): continue
    try: root = ET.parse(os.path.join(src, f)).getroot()
    except Exception: continue
    grps = [g for g in root.iter() if L(g) == 'ApplicationSubmissionInfoGrp']
    pre = kid(root, 'OnlyContriToPreselectedInd')
    web = kid(root, 'WebsiteAddressTxt')
    items = []
    for g in grps:
        addr = ' '.join(x for x in [kid(g, 'AddressLine1Txt'), kid(g, 'AddressLine2Txt')] if x)
        city = kid(g, 'CityNm'); st = kid(g, 'StateAbbreviationCd'); z = kid(g, 'ZIPCd')
        it = dict(person=kid(g, 'RecipientPersonNm', 'BusinessNameLine1Txt'),
                  address=', '.join(x for x in [addr, ' '.join(y for y in [city, st, z] if y)] if x),
                  phone=kid(g, 'RecipientPhoneNum'), email=kid(g, 'RecipientEmailAddressTxt'),
                  form=kid(g, 'FormAndInfoAndMaterialsTxt'), deadline=kid(g, 'SubmissionDeadlinesTxt'),
                  limits=kid(g, 'RestrictionsOnAwardsTxt'))
        if any(it.values()): items.append(it)
    if items or web or pre:
        out[f[:-4]] = dict(apply=items, web=web, preselected=pre)
json.dump(out, open('data/apply.json', 'w'), indent=0)
print(len(out), 'funders;', sum(1 for v in out.values() if v['apply']), 'with apply info')
