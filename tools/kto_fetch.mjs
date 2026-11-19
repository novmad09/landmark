// 한국관광공사 관광정보(TourAPI)에서 명소별 대표 사진·좌표를 받아 tools/out/kto.json 에 적는다.
// 인증키는 환경 변수 KTO_KEY 로만 받는다. 저장소·로그·결과 파일 어디에도 남기지 않는다.
import fs from 'node:fs';
const KEY = process.env.KTO_KEY;
if (!KEY) { console.error('KTO_KEY 가 없어요. 저장소 Settings → Secrets 에 넣어 주세요.'); process.exit(1); }
const load = f => { const window = {}; new Function('window', fs.readFileSync(f, 'utf8'))(window); return window; };
const L = load('js/data.js').LANDMARKS, MEDIA = load('js/media.js').MEDIA || {};
const BASES = ['https://apis.data.go.kr/B551011/KorService2', 'https://apis.data.go.kr/B551011/KorService1'];
const OPS = { loc: ['locationBasedList2', 'locationBasedList1'], kw: ['searchKeyword2', 'searchKeyword1'] };
let ver = 0, calls = 0; const MAX = Number(process.env.KTO_MAX || 940);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const safe = s => String(s).split(KEY).join('***').split(encodeURIComponent(KEY)).join('***');
async function call(kind, params) {
  if (calls >= MAX) return null; calls++;
  const q = new URLSearchParams({ MobileOS: 'ETC', MobileApp: 'landmark', _type: 'json', numOfRows: '40', pageNo: '1', ...params });
  const url = `${BASES[ver]}/${OPS[kind][ver]}?serviceKey=${encodeURIComponent(KEY)}&${q}`;
  for (let i = 0; i < 2; i++) {
    try { const r = await fetch(url); const t = await r.text();
      if (t.trim().startsWith('{')) { const j = JSON.parse(t); const it = j?.response?.body?.items?.item; const code = j?.response?.header?.resultCode;
        if (code && code !== '0000') { console.log('응답 코드', code, safe(j.response.header.resultMsg || '')); return []; }
        return Array.isArray(it) ? it : it ? [it] : []; }
      console.log('JSON 아님:', safe(t.slice(0, 160)).replace(/\s+/g, ' '));
      if (/SERVICE_KEY|NOT_REGISTERED|등록되지/.test(t)) return 'KEY';
      if (r.status === 404 || /NO_OPENAPI_SERVICE|HTTP ROUTING/.test(t)) return 'VER';
    } catch (e) { console.log('요청 실패', safe(e.message)); }
    await sleep(1500);
  }
  return null;
}
const norm = t => String(t || '').replace(/\(.*?\)|\[.*?\]/g, '').replace(/[\s·\-,.'’]/g, '').toLowerCase();
const CITY = /^(서울|부산|대구|인천|광주|대전|울산|세종|제주|강릉|경주|전주|여수|속초|춘천|수원|목포|통영|안동|담양|고창|신안|진도|영광|철원|영덕|의성|함평|밀양|김해|남해|거제|태안|충주|단양|보령|공주|부여|순천|강화|가평|양평|파주|포천|평창|정선|삼척|동해|양양|고성|인제|화천|횡성|영월|태백|원주|완주|순창|광양|보성|양산|산청|창원|보은|무주|지리산)\s+/;
const hv = (a, b, c, d) => { const R = 6371000, x = (c - a) * Math.PI / 180, y = (d - b) * Math.PI / 180; const h = Math.sin(x / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const out = {}; let fatal = '';
// 사진이 없는 곳부터. 하루 호출 한도(개발 키 1000회) 안에서 되는 데까지 한다
const ONLY = process.env.KTO_MISSING === '1'; /* 사진 없는 곳만, 이름을 여러 가지로 바꿔 검색 */
const order = ONLY ? L.filter(p => !MEDIA[p.id]) : [...L].sort((a, b) => (MEDIA[a.id] ? 1 : 0) - (MEDIA[b.id] ? 1 : 0));
for (const p of order) {
  const base = p.name.replace(/\(.*?\)/g, '').trim(), par = (p.name.match(/\((.*?)\)/) || [])[1];
  const parts = base.split('·').map(x => x.trim()).filter(Boolean);
  const names = [...new Set([base, ...parts, ...parts.map(x => x.replace(CITY, '')), par].filter(x => x && x.length >= 2))];
  const nn = names.map(norm);
  const score = it => { const t = norm(it.title); let s = 0; for (const n of nn) { if (t === n) s = Math.max(s, 3); else if (t.startsWith(n) || t.endsWith(n)) s = Math.max(s, 2.5); else if (t.includes(n) || (n.includes(t) && t.length >= 3)) s = Math.max(s, 2); }
    if (!s) return 0; const ct = String(it.contenttypeid); if (ct === '15' || ct === '32' || ct === '25') s -= 2; if (ct === '39' && !/^F/.test(p.id)) s -= 1.5; return s; };
  let items = await call('loc', { mapX: String(p.lng), mapY: String(p.lat), radius: String(/^m\d/.test(p.id) ? 6000 : Math.max(p.r * 4, 2000)), arrange: 'E', numOfRows: '60' });
  if (items === 'VER' && ver === 0) { ver = 1; console.log('KorService1 로 다시 시도'); items = await call('loc', { mapX: String(p.lng), mapY: String(p.lat), radius: '2000', arrange: 'E', numOfRows: '60' }); }
  if (items === 'KEY' || items === 'VER') { fatal = items === 'KEY' ? '인증키가 아직 등록되지 않았어요 (신청 직후엔 1~2시간 걸릴 수 있어요)' : '서비스 주소가 달라요'; break; }
  if (items === null && calls >= MAX) break;
  let c = (items || []).map(it => ({ it, s: score(it) })).filter(x => x.s > 0);
  if (!c.some(x => x.s >= 2.5 && x.it.firstimage) && !MEDIA[p.id]) {
    const kws = ONLY ? [...new Set([parts[0].replace(CITY, ''), parts[1] && parts[1].replace(CITY, ''), par, parts[0].replace(CITY, '').replace(/\s/g, ''), parts[0].replace(CITY, '').split(' ')[0]].filter(x => x && x.length >= 2))].slice(0, 4) : [parts[0].replace(CITY, '')];
    for (const k of kws) { const kw = await call('kw', { keyword: k, arrange: 'O' });
      if (Array.isArray(kw)) c = c.concat(kw.map(it => ({ it, s: score(it) || (ONLY && norm(it.title).includes(norm(k)) ? 2 : 0) })).filter(x => x.s > 0 && hv(p.lat, p.lng, +x.it.mapy, +x.it.mapx) < (ONLY ? 3000 : 8000)));
      if (c.some(x => x.s >= 2.5 && x.it.firstimage)) break; }
  }
  c.forEach(x => { x.d = Math.round(hv(p.lat, p.lng, +x.it.mapy, +x.it.mapx)); });
  c.sort((a, b) => (b.s + (b.it.firstimage ? 0.4 : 0)) - (a.s + (a.it.firstimage ? 0.4 : 0)) || a.d - b.d);
  const top = c[0], img = c.find(x => x.it.firstimage && x.s >= 2);
  if (top) out[p.id] = { t: top.it.title, s: top.s, d: top.d, lat: +(+top.it.mapy).toFixed(6), lng: +(+top.it.mapx).toFixed(6), cid: top.it.contentid,
    ...(img ? { img: img.it.firstimage.replace(/^http:/, 'https:'), it: img.it.title, is: img.s, cc: img.it.cpyrhtDivCd || '' } : {}) };
  await sleep(120);
}
fs.mkdirSync('tools/out', { recursive: true });
fs.writeFileSync('tools/out/kto.json', JSON.stringify({ at: new Date().toISOString(), calls, ver: ver ? 1 : 2, fatal, n: Object.keys(out).length, withImg: Object.values(out).filter(x => x.img).length, out }));
console.log(`호출 ${calls}회 · 찾은 곳 ${Object.keys(out).length} · 사진 ${Object.values(out).filter(x => x.img).length}${fatal ? ' · 중단: ' + fatal : ''}`);
