#!/usr/bin/env python3
"""관광공사에서 받은 결과(kto.json)를 앱 데이터(js/kto.js)로 바꾼다. 이름이 정확히 맞는 곳만 쓴다."""
import json,sys,re
j=json.load(open(sys.argv[1])); P=j['places']; out={}
def short(t,n):
    t=re.sub(r'\s*\n\s*',' ',t or '').strip()
    if len(t)<=n: return t
    cut=t[:n]; k=max(cut.rfind('다. '),cut.rfind('요. '),cut.rfind('. '))
    return (cut[:k+2].strip() if k>n*0.5 else cut.rstrip()+'…')
def line(t,n=90):
    t=re.sub(r'\s*\n\s*',' / ',(t or '').strip()); t=re.sub(r'(?<=[^\s/])\s*(\[|※)',r' / \1',t); t=re.sub(r'^ / ','',t); return t if len(t)<=n else t[:n].rstrip()+'…'
for k,v in P.items():
    c=v.get('common') or {}; i=v.get('intro') or {}
    if not v.get('cid') or v.get('s',0)<3 or v.get('d',9e9)>3000 or not c: continue
    e={}
    if c.get('addr'): e['a']=c['addr']
    if i.get('time'): e['t']=line(i['time'],170)
    if i.get('rest'): e['r']=line(i['rest'],110)
    tel=i.get('info') or c.get('tel')
    if tel: e['i']=line(tel,40)
    if i.get('fee'): e['f']=line(i['fee'],80)
    if i.get('park'): e['p']=line(i['park'],40)
    if c.get('home'): e['h']=c['home']
    if c.get('overview'): e['o']=short(c['overview'],260)
    if e: e['n']=c.get('title') or v.get('t'); out[k]=e
s="/* 명소 공식 정보: 한국관광공사 관광정보(TourAPI, 공공누리)에서 받은 주소·이용시간·쉬는 날·문의·소개.\n   tools/kto_fetch.mjs 로 받고 tools/kto_apply.py 로 만든다. 손으로 고치지 않는다 */\nwindow.KTO = "+json.dumps(out,ensure_ascii=False,separators=(',',':')).replace('},"','},\n"')+";\n"
open('js/kto.js','w').write(s); print(len(out),'곳',len(s),'bytes')
