#!/usr/bin/env python3
"""한국관광공사 TourAPI 로 랜드마크 데이터를 모아 js/data.js 와 supabase/seed.sql 을 만든다.

사용법:
  export TOURAPI_KEY='공공데이터포털에서 발급한 인증키(디코딩 상태)'
  python3 tools/import_tourapi.py tools/landmarks.csv

tools/landmarks.csv 형식 (UTF-8):
  id,name,keyword,cat,radius
  gbg,경복궁,경복궁,palace,200
  ...
keyword 는 TourAPI 검색어(빈칸이면 name 사용). cat 은 palace/mountain/sea/street/building/park.
결과 CSV(tools/landmarks_resolved.csv)의 좌표를 지도에서 하나씩 확인하고 인증 지점을 보정한 뒤 다시 돌리면 data.js 가 갱신된다.
"""
import csv, json, os, sys, urllib.parse, urllib.request

KEY = os.environ.get('TOURAPI_KEY')
BASE = 'https://apis.data.go.kr/B551011/KorService1'
SIDO = {1:'서울',2:'인천',3:'대전',4:'대구',5:'광주',6:'부산',7:'울산',8:'세종',31:'경기',32:'강원',33:'충북',34:'충남',35:'경북',36:'경남',37:'전북',38:'전남',39:'제주'}

def call(op, **params):
    q = dict(serviceKey=KEY, MobileOS='ETC', MobileApp='LandmarkStamp', _type='json', **params)
    url = f"{BASE}/{op}?" + urllib.parse.urlencode(q, safe='')
    with urllib.request.urlopen(url, timeout=20) as r:
        body = json.load(r)
    items = body.get('response', {}).get('body', {}).get('items', {})
    return items.get('item', []) if isinstance(items, dict) else []

def resolve(row):
    kw = row.get('keyword') or row['name']
    hits = call('searchKeyword1', keyword=kw, numOfRows=5, contentTypeId=12) or call('searchKeyword1', keyword=kw, numOfRows=5)
    if not hits: return None
    h = hits[0]
    imgs = call('detailImage1', contentId=h['contentid'], imageYN='Y', subImageYN='Y', numOfRows=3)
    common = call('detailCommon1', contentId=h['contentid'], overviewYN='Y', defaultYN='Y', addrinfoYN='Y')
    ov = (common[0].get('overview') if common else '') or ''
    return dict(id=row['id'], name=row['name'], lat=float(h['mapy']), lng=float(h['mapx']), sido=SIDO.get(int(h.get('areacode') or 0), ''), gu=(h.get('addr1') or '').split(' ')[1:2] and (h.get('addr1') or '').split(' ')[1] or '',
                cat=row['cat'], r=int(row.get('radius') or 100), desc=ov[:120].replace('\n',' '), contentId=h['contentid'], photo=(imgs[0]['originimgurl'] if imgs else h.get('firstimage','')), license='KOGL-1 (확인 필요)')

def main(path):
    if not KEY: sys.exit('TOURAPI_KEY 환경변수를 설정하세요')
    rows = list(csv.DictReader(open(path, encoding='utf-8')))
    out = []
    for r in rows:
        try: d = resolve(r); print('OK ' if d else 'MISS', r['name']); d and out.append(d)
        except Exception as e: print('ERR', r['name'], e)
    with open('tools/landmarks_resolved.csv', 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys())); w.writeheader(); w.writerows(out)
    js = "window.LANDMARKS = [\n" + ",\n".join(" " + json.dumps({k: d[k] for k in ('id','name','lat','lng','sido','gu','cat','r','desc')}, ensure_ascii=False) for d in out) + "\n];\n"
    print('\n--- js/data.js 의 window.LANDMARKS 를 아래로 교체 ---\n'); print(js[:500], '...')
    open('tools/landmarks.generated.js', 'w', encoding='utf-8').write(js)
    esc = lambda s: str(s).replace("'", "''")
    sql = "insert into places (id,name,lat,lng,radius_m,sido,sigungu,category,description,official_photo_url,official_photo_license,source_content_id) values\n" + ",\n".join(f"('{d['id']}','{esc(d['name'])}',{d['lat']},{d['lng']},{d['r']},'{d['sido']}','{esc(d['gu'])}','{d['cat']}','{esc(d['desc'])}','{d['photo']}','{d['license']}','{d['contentId']}')" for d in out) + "\non conflict (id) do update set lat=excluded.lat,lng=excluded.lng,description=excluded.description,official_photo_url=excluded.official_photo_url;\n"
    open('tools/seed.generated.sql', 'w', encoding='utf-8').write(sql)
    print('tools/landmarks.generated.js, tools/seed.generated.sql 생성 완료 — 좌표를 지도에서 검수하세요')

if __name__ == '__main__': main(sys.argv[1] if len(sys.argv) > 1 else 'tools/landmarks.csv')
