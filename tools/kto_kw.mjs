// 한국관광공사 관광정보(KorService2)·사진갤러리에서, 이름이 달라 못 찾은 명소를 적어 둔 검색어로 다시 찾아 tools/out/kw.json 에 후보를 적는다.
// 인증키는 환경 변수 KTO_KEY 로만 받는다. 저장소·로그·결과 파일 어디에도 남기지 않는다.
import fs from 'node:fs';
const KEY = process.env.KTO_KEY; if (!KEY) { console.error('KTO_KEY 가 없어요.'); process.exit(1); }
const load = f => { const window = {}; new Function('window', fs.readFileSync(f, 'utf8'))(window); return window; };
const L = load('js/data.js').LANDMARKS; const KW = JSON.parse(fs.readFileSync('tools/kto_kw.json', 'utf8'));
const safe = s => String(s).split(KEY).join('***').split(encodeURIComponent(KEY)).join('***'); const sleep = ms => new Promise(r => setTimeout(r, ms));
let calls = 0, fatal = '';
async function call(base, op, params) { if (fatal) return []; calls++;
  const q = new URLSearchParams({ MobileOS: 'ETC', MobileApp: 'landmark', _type: 'json', ...params });
  for (let i = 0; i < 2; i++) { try { const r = await fetch(`https://apis.data.go.kr/B551011/${base}/${op}?serviceKey=${encodeURIComponent(KEY)}&${q}`); const t = await r.text();
      if (t.trim().startsWith('{')) { const j = JSON.parse(t); const code = j?.response?.header?.resultCode; if (code && code !== '0000') { console.log(op, '응답 코드', code); if (code === '22') fatal = '한도'; return []; } const it = j?.response?.body?.items?.item; return Array.isArray(it) ? it : it ? [it] : []; }
      console.log(op, 'JSON 아님:', r.status, safe(t.slice(0, 120)).replace(/\s+/g, ' ')); if (/LIMITED|EXCEEDS/.test(t)) { fatal = '한도'; return []; } } catch (e) { console.log('요청 실패', safe(e.message)); } await sleep(1500); }
  return []; }
const hv = (a, b, c, d) => { const R = 6371000, x = (c - a) * Math.PI / 180, y = (d - b) * Math.PI / 180; const h = Math.sin(x / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const out = { at: new Date().toISOString(), places: {} };
for (const p of L) { const kws = KW[p.id]; if (!kws) continue; const info = [], gal = []; const s1 = new Set(), s2 = new Set();
  for (const kw of kws) {
    for (const it of await call('KorService2', 'searchKeyword2', { keyword: kw, numOfRows: '15', pageNo: '1', arrange: 'A' })) { if (!it.firstimage || s1.has(it.contentid)) continue; s1.add(it.contentid);
      info.push({ kw, title: it.title, addr: it.addr1, img: String(it.firstimage).replace(/^http:/, 'https:'), cc: it.cpyrhtDivCd, cid: it.contentid, type: it.contenttypeid, d: it.mapy && it.mapx ? Math.round(hv(p.lat, p.lng, +it.mapy, +it.mapx)) : null }); }
    await sleep(120);
    for (const it of await call('PhotoGalleryService1', 'gallerySearchList1', { keyword: kw, numOfRows: '20', pageNo: '1', arrange: 'A' })) { if (!it.galWebImageUrl || s2.has(it.galWebImageUrl)) continue; s2.add(it.galWebImageUrl);
      gal.push({ kw, title: it.galTitle, loc: it.galPhotographyLocation, by: it.galPhotographer, tags: it.galSearchKeyword, img: String(it.galWebImageUrl).replace(/^http:/, 'https:') }); }
    await sleep(120); }
  out.places[p.id] = { name: p.name, sido: p.sido, gu: p.gu, info, gal }; }
out.calls = calls; out.fatal = fatal; fs.mkdirSync('tools/out', { recursive: true }); fs.writeFileSync('tools/out/kw.json', JSON.stringify(out));
console.log('호출', calls, '회 ·', Object.values(out.places).filter(v => v.info.length || v.gal.length).length, '/', Object.keys(out.places).length, fatal);
