// 한국관광공사 관광사진갤러리(PhotoGalleryService1)에서, 아직 관광공사 사진이 없는 명소의 사진 후보를 찾아 tools/out/photo.json 에 적는다.
// 인증키는 환경 변수 KTO_KEY 로만 받는다. 저장소·로그·결과 파일 어디에도 남기지 않는다.
import fs from 'node:fs';
const KEY = process.env.KTO_KEY;
if (!KEY) { console.error('KTO_KEY 가 없어요.'); process.exit(1); }
const load = f => { const window = {}; new Function('window', fs.readFileSync(f, 'utf8'))(window); return window; };
const L = load('js/data.js').LANDMARKS, MEDIA = load('js/media.js').MEDIA || {};
const BASE = 'https://apis.data.go.kr/B551011/PhotoGalleryService1';
const safe = s => String(s).split(KEY).join('***').split(encodeURIComponent(KEY)).join('***');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let calls = 0, fatal = '', shown = 0;
async function search(keyword) {
  if (fatal) return null; calls++;
  const q = new URLSearchParams({ MobileOS: 'ETC', MobileApp: 'landmark', _type: 'json', numOfRows: '20', pageNo: '1', arrange: 'A', keyword });
  for (let i = 0; i < 2; i++) {
    try { const r = await fetch(`${BASE}/gallerySearchList1?serviceKey=${encodeURIComponent(KEY)}&${q}`); const t = await r.text();
      if (t.trim().startsWith('{')) { const j = JSON.parse(t); const code = j?.response?.header?.resultCode;
        if (code && code !== '0000') { console.log('응답 코드', code, safe(j.response.header.resultMsg || '')); if (code === '22') fatal = '오늘 호출 한도를 다 썼어요'; return []; }
        const it = j?.response?.body?.items?.item; const a = Array.isArray(it) ? it : it ? [it] : [];
        if (a.length && shown < 2) { shown++; console.log('항목 예:', safe(JSON.stringify(a[0]).slice(0, 600))); }
        return a; }
      console.log('JSON 아님:', r.status, safe(t.slice(0, 160)).replace(/\s+/g, ' '));
      if (/LIMITED_NUMBER|EXCEEDS/.test(t)) { fatal = '오늘 호출 한도를 다 썼어요'; return null; }
      if (/SERVICE_KEY|NOT_REGISTERED|등록되지|Forbidden|Unauthorized/.test(t) || r.status === 401 || r.status === 403) { fatal = '인증키가 이 서비스에 아직 등록되지 않았어요'; return null; }
    } catch (e) { console.log('요청 실패', safe(e.message)); }
    await sleep(1500);
  }
  return null;
}
const norm = t => String(t || '').replace(/\(.*?\)|\[.*?\]/g, '').replace(/[\s·\-,.'’]/g, '').toLowerCase();
const words = name => { const base = name.replace(/\(.*?\)/g, '').trim(); const parts = base.split(/[·]/).map(s => s.trim()).filter(Boolean); const inPar = (name.match(/\((.*?)\)/) || [])[1];
  const w = [base.replace(/·/g, ' ')]; parts.forEach(p => w.push(p)); if (inPar) w.push(inPar); const sp = base.split(/\s+/); if (sp.length > 1) { w.push(sp[sp.length - 1]); w.push(sp.slice(1).join(' ')); }
  return [...new Set(w.filter(x => norm(x).length >= 2))].slice(0, 4); };
const out = { at: new Date().toISOString(), places: {} };
const targets = L.filter(p => !MEDIA[p.id] || MEDIA[p.id].by !== 'kto');
console.log('대상', targets.length, '곳');
for (const p of targets) {
  if (fatal) break; const found = []; const seen = new Set();
  for (const kw of words(p.name)) {
    const items = await search(kw); if (!items) break; await sleep(120);
    for (const it of items) { const img = it.galWebImageUrl; if (!img || seen.has(img)) continue; seen.add(img);
      found.push({ kw, title: it.galTitle, loc: it.galPhotographyLocation, by: it.galPhotographer, tags: it.galSearchKeyword, img: String(img).replace(/^http:/, 'https:'), id: it.galContentId, ym: it.galPhotographyMonth }); }
    if (found.length >= 12) break;
  }
  out.places[p.id] = { name: p.name, sido: p.sido, gu: p.gu, cat: p.cat, found };
}
out.calls = calls; out.fatal = fatal;
fs.mkdirSync('tools/out', { recursive: true }); fs.writeFileSync('tools/out/photo.json', JSON.stringify(out));
const n = Object.values(out.places).filter(v => v.found.length).length;
console.log('호출', calls, '회 · 후보 있는 곳', n, '/', Object.keys(out.places).length, fatal ? '· 중단: ' + fatal : '');
if (fatal && !n) process.exit(2);
