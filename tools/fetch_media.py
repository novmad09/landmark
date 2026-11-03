#!/usr/bin/env python3
"""랜드마크 사진·설명을 한국어 위키백과/위키미디어 공용에서 받아 js/media.js 로 만든다.

사용법 (인터넷 되는 곳에서):
    python3 tools/fetch_media.py            # 전부
    python3 tools/fetch_media.py --only L0  # id 가 L0 으로 시작하는 것만
    python3 tools/fetch_media.py --retry    # 아직 못 받은 것만 다시

결과: js/media.js  →  window.MEDIA = { id: { img, w, h, desc, title, credit, lic, page } }
- 사진은 위키미디어 공용의 자유 저작물(CC BY / CC BY-SA / 퍼블릭 도메인)만 받는다. 그 외 라이선스는 건너뛴다.
- 설명은 문서 첫 문단 (최대 420자).
- 앱 상세 화면에 '사진: 작가 · 라이선스 · 위키미디어' 출처가 자동으로 붙는다.
- 검색이 엉뚱한 문서를 잡을 수 있으니 media_review.txt 를 열어 한 번 훑어본다.
"""
import json, re, sys, time, urllib.parse, urllib.request, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = 'https://ko.wikipedia.org/w/api.php'
UA = 'landmark-stamp/0.1 (prototype; contact: app developer)'
OK_LIC = re.compile(r'^(CC BY(-SA)?( \d\.\d)?|CC0|Public domain|PD)', re.I)

def get(params):
    params = dict(params, format='json', formatversion='2')
    url = API + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode('utf-8'))

def load_landmarks():
    src = open(os.path.join(ROOT, 'js', 'data.js'), encoding='utf-8').read()
    out = []
    for m in re.finditer(r"\{id:'([^']+)',name:'([^']+)',lat:([\d.]+),lng:([\d.]+),sido:'([^']+)',gu:'([^']+)'", src):
        out.append(dict(id=m.group(1), name=m.group(2), sido=m.group(5), gu=m.group(6)))
    return out

def candidates(p):
    n = p['name']
    base = re.sub(r'\s*\(.*?\)', '', n)               # 괄호 제거
    first = re.split(r'[·,]', base)[0].strip()        # '대릉원·황리단길' → '대릉원'
    noregion = re.sub(r'^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\s*', '', first)
    noregion2 = re.sub(r'^\S+(시|군|구)\s+', '', noregion)  # '순창시 강천산' → '강천산'
    toks = noregion2.split()
    nofirst = ' '.join(toks[1:]) if len(toks) >= 2 else ''        # '경주 대릉원' → '대릉원'
    nosuffix = re.sub(r'(군립공원|도립공원|관광지|관광단지|관광특구|자연휴양림|역사관|기념관)$', '', nofirst or noregion2).strip()
    c = [first, noregion, noregion2, nofirst, nosuffix, base, n]
    seen, out = set(), []
    for x in c:
        x = x.strip()
        if x and x not in seen: seen.add(x); out.append(x)
    return out

def search_title(q, sido):
    r = get({'action': 'query', 'list': 'search', 'srsearch': q, 'srlimit': 5, 'srnamespace': 0})
    hits = r.get('query', {}).get('search', [])
    if not hits: return None
    # 같은 이름이 여럿이면 시·도 이름이 들어간 문서를 우선
    for h in hits:
        if sido in h.get('snippet', '') or sido in h['title']: return h['title']
    return hits[0]['title']

def page(title):
    r = get({'action': 'query', 'titles': title, 'redirects': 1,
             'prop': 'extracts|pageimages|info', 'exintro': 1, 'explaintext': 1, 'exsentences': 4,
             'piprop': 'thumbnail|name', 'pithumbsize': 900, 'inprop': 'url'})
    pages = r.get('query', {}).get('pages', [])
    if not pages or pages[0].get('missing'): return None
    return pages[0]

def image_meta(filename):
    r = get({'action': 'query', 'titles': 'File:' + filename, 'prop': 'imageinfo',
             'iiprop': 'extmetadata|url', 'iiurlwidth': 900})
    pages = r.get('query', {}).get('pages', [])
    if not pages or 'imageinfo' not in pages[0]: return None
    ii = pages[0]['imageinfo'][0]; md = ii.get('extmetadata', {})
    v = lambda k: re.sub(r'<[^>]+>', '', md.get(k, {}).get('value', '')).strip()
    return dict(url=ii.get('thumburl') or ii.get('url'), w=ii.get('thumbwidth'), h=ii.get('thumbheight'),
                lic=v('LicenseShortName'), artist=v('Artist'), credit=v('Credit'))

def main():
    only = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--only=')), None)
    retry = '--retry' in sys.argv
    out_path = os.path.join(ROOT, 'js', 'media.js')
    media = {}
    if os.path.exists(out_path):
        m = re.search(r'window\.MEDIA\s*=\s*(\{.*\});?\s*$', open(out_path, encoding='utf-8').read(), re.S)
        if m:
            try: media = json.loads(m.group(1))
            except Exception: media = {}
    review = []
    L = load_landmarks()
    for i, p in enumerate(L):
        if only and not p['id'].startswith(only): continue
        if retry and p['id'] in media and media[p['id']].get('desc'): continue
        if not retry and p['id'] in media and media[p['id']].get('desc'): continue
        rec = {}
        try:
            title = None
            for q in candidates(p):
                title = search_title(q, p['sido'])
                if title: break
                time.sleep(0.3)
            if title:
                pg = page(title)
                if pg:
                    rec['title'] = pg['title']; rec['page'] = pg.get('fullurl', '')
                    desc = (pg.get('extract') or '').strip()
                    desc = re.sub(r'\s+', ' ', desc)[:420]
                    rec['desc'] = desc
                    img = pg.get('pageimage')
                    if img:
                        meta = image_meta(img)
                        if meta and meta['url'] and OK_LIC.match(meta['lic'] or ''):
                            rec.update(img=meta['url'], w=meta['w'], h=meta['h'], lic=meta['lic'], credit=meta['artist'] or meta['credit'] or '')
                        elif meta:
                            review.append(f"{p['id']} {p['name']}: 사진 라이선스 제외 ({meta['lic']})")
            else:
                review.append(f"{p['id']} {p['name']}: 문서 못 찾음")
        except Exception as e:
            review.append(f"{p['id']} {p['name']}: 오류 {e}")
        if rec: media[p['id']] = rec
        if rec.get('title') and rec['title'].replace(' ', '') not in p['name'].replace(' ', '') and p['name'].split()[0] not in rec['title']:
            review.append(f"{p['id']} {p['name']} → '{rec['title']}' (맞는지 확인)")
        print(f"[{i+1}/{len(L)}] {p['name']} → {rec.get('title','-')} {'📷' if rec.get('img') else ''}")
        time.sleep(0.4)
        if (i + 1) % 20 == 0: save(out_path, media)
    save(out_path, media)
    open(os.path.join(ROOT, 'media_review.txt'), 'w', encoding='utf-8').write('\n'.join(review))
    print(f"\n완료: {sum(1 for v in media.values() if v.get('desc'))}곳 설명, {sum(1 for v in media.values() if v.get('img'))}곳 사진 → js/media.js")
    print(f"확인할 것 {len(review)}건 → media_review.txt")

def save(path, media):
    with open(path, 'w', encoding='utf-8') as f:
        f.write('/* 자동 생성: tools/fetch_media.py — 한국어 위키백과 요약 + 위키미디어 공용 자유 저작권 사진 */\n')
        f.write('window.MEDIA = ' + json.dumps(media, ensure_ascii=False, separators=(',', ':')) + ';\n')

if __name__ == '__main__':
    main()
