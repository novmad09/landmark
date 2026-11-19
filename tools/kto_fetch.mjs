// 한국관광공사 관광정보(TourAPI)에서 명소별 공식 정보(주소·소개·운영시간·좌표·사진)를 받아 tools/out/kto.json 에 적는다.
// 하루 호출 한도(개발 키 1000회) 때문에 여러 날에 나눠 이어서 받는다: 지난 결과(tools/out/prev.json)가 있으면 거기서부터 계속한다.
// 인증키는 환경 변수 KTO_KEY 로만 받는다. 저장소·로그·결과 파일 어디에도 남기지 않는다.
import fs from 'node:fs';
const KEY = process.env.KTO_KEY;
if (!KEY) { console.error('KTO_KEY 가 없어요. 저장소 Settings → Secrets 에 넣어 주세요.'); process.exit(1); }
const load = f => { const window = {}; new Function('window', fs.readFileSync(f, 'utf8'))(window); return window; };
const L = load('js/data.js').LANDMARKS, MEDIA = load('js/media.js').MEDIA || {};
const BASE = 'https://apis.data.go.kr/B551011/KorService2';
const MAX = Number(process.env.KTO_MAX || 900); let calls = 0, fatal = '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const safe = s => String(s).split(KEY).join('***').split(encodeURIComponent(KEY)).join('***');
async function call(op, params) {
  if (calls >= MAX || fatal) return null; calls++;
  const q = new URLSearchParams({ MobileOS: 'ETC', MobileApp: 'landmark', _type: 'json', ...params });
  for (let i = 0; i < 2; i++) {
    try { const r = await fetch(`${BASE}/${op}?serviceKey=${encodeURIComponent(KEY)}&${q}`); const t = await r.text();
      if (t.trim().startsWith('{')) { const j = JSON.parse(t); const code = j?.response?.header?.resultCode;
        if (code && code !== '0000') { console.log(op, '응답 코드', code, safe(j.response.header.resultMsg || '')); if (code === '22') fatal = '오늘 호출 한도를 다 썼어요'; return []; }
        const it = j?.response?.body?.items?.item; return Array.isArray(it) ? it : it ? [it] : []; }
      console.log(op, 'JSON 아님:', safe(t.slice(0, 140)).replace(/\s+/g, ' '));
      if (/LIMITED_NUMBER|EXCEEDS/.test(t)) { fatal = '오늘 호출 한도를 다 썼어요'; return null; }
      if (/SERVICE_KEY|NOT_REGISTERED|등록되지/.test(t)) { fatal = '인증키가 아직 등록되지 않았어요'; return null; }
    } catch (e) { console.log(op, '요청 실패', safe(e.message)); }
    await sleep(1500);
  }
  return null;
}
const norm = t => String(t || '').replace(/\(.*?\)|\[.*?\]/g, '').replace(/[\s·\-,.'’]/g, '').toLowerCase();
const CITY = /^(서울|부산|대구|인천|광주|대전|울산|세종|제주|강릉|경주|전주|여수|속초|춘천|수원|목포|통영|안동|담양|고창|신안|진도|영광|철원|영덕|의성|함평|밀양|김해|남해|거제|태안|충주|단양|보령|공주|부여|순천|강화|가평|양평|파주|포천|평창|정선|삼척|동해|양양|고성|인제|화천|횡성|영월|태백|원주|완주|순창|광양|보성|양산|산청|창원|보은|무주|지리산)\s+/;
const hv = (a, b, c, d) => { const R = 6371000, x = (c - a) * Math.PI / 180, y = (d - b) * Math.PI / 180; const h = Math.sin(x / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
// 이름이 관광공사 자료와 다른 곳: 이렇게도 찾아본다
const ALIAS = { dyh: ['퍼플섬', '반월도', '박지도'], mch: ['만천하스카이워크', '만천하'], msn: ['뮤지엄산'], dgr: ['대관령양떼목장', '대관령'], L043: ['물의정원'], L220: ['합천영상테마파크'], L131: ['순천드라마촬영장', '드라마촬영장'], L168: ['보현산천문대', '보현산'], F029: ['통영중앙시장', '통영중앙전통시장'], L034: ['시화나래', '시화호'], L084: ['산천어'], L097: ['좌구산'], L117: ['군산근대역사박물관', '근대문화'], L155: ['함평엑스포공원', '나비'], L086: ['횡성호수길'], gcs2: ['강천산군립공원', '강천산'], kjb: ['꽃지해수욕장', '꽃지'], L175: ['산수유마을'], L016: ['이태원', '경리단길'], L183: ['동성로'], L099: ['온양온천'], L038: ['헤이리'], L037: ['오이도'], L103: ['삽교호'], F017: ['닭갈비골목'], L070: ['논골담길'], L169: ['죽변해안스카이레일', '스카이레일'], m006: ['강천산'], m011: ['구병산'], m016: ['깃대봉'], m041: ['백덕산'], m043: ['백운산'], m058: ['연화산'], m061: ['용문산'], m064: ['운악산'], m069: ['응봉산'], m087: ['칠갑산'], m100: ['희양산'] };
const read = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const prev = read('tools/out/prev.json'), seed = read('tools/kto_seed.json') || {};
const S = (prev && prev.places) || {};
for (const [id, v] of Object.entries(seed)) if (!S[id]) S[id] = v;
const clean = t => String(t || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();

// 1단계: 명소마다 관광공사 항목 찾기
for (const p of L) {
  if (fatal || calls >= MAX) break; const st = S[p.id] || (S[p.id] = {});
  const needImg = !MEDIA[p.id] && !(st.imgs && st.imgs.length);
  if ((st.cid && !needImg) || (st.tried || 0) >= (needImg ? 3 : 2)) continue;
  st.tried = (st.tried || 0) + 1;
  const base = p.name.replace(/\(.*?\)/g, '').trim(), par = (p.name.match(/\((.*?)\)/) || [])[1];
  const parts = base.split('·').map(x => x.trim()).filter(Boolean);
  const names = [...new Set([base, ...parts, ...parts.map(x => x.replace(CITY, '')), par, ...(ALIAS[p.id] || [])].filter(x => x && x.length >= 2))], nn = names.map(norm);
  const score = it => { const t = norm(it.title); let s = 0; for (const n of nn) { if (t === n) s = Math.max(s, 3); else if (t.startsWith(n) || t.endsWith(n)) s = Math.max(s, 2.5); else if (t.includes(n) || (n.includes(t) && t.length >= 3)) s = Math.max(s, 2); }
    if (!s) return 0; const ct = String(it.contenttypeid); if (ct === '15' || ct === '32' || ct === '25') s -= 2; if (ct === '39' && !/^F/.test(p.id)) s -= 1.5; if (ct === '38' && !/^F|시장/.test(p.id + p.name)) s -= 1; return s; };
  let c = [];
  if (st.tried === 1) { const items = await call('locationBasedList2', { mapX: String(p.lng), mapY: String(p.lat), radius: String(/^m\d/.test(p.id) ? 6000 : Math.max(p.r * 4, 2000)), arrange: 'E', numOfRows: '60', pageNo: '1' });
    c = (items || []).map(it => ({ it, s: score(it) })).filter(x => x.s > 0); }
  if (!c.some(x => x.s >= 2.5) || (needImg && !c.some(x => x.it.firstimage))) {
    const kws = [...new Set([...(ALIAS[p.id] || []), parts[0].replace(CITY, ''), parts[1] && parts[1].replace(CITY, ''), par].filter(x => x && x.length >= 2))].slice(st.tried === 1 ? 0 : 1, st.tried === 1 ? 1 : 4);
    for (const k of kws) { const kw = await call('searchKeyword2', { keyword: k, arrange: 'O', numOfRows: '40', pageNo: '1' });
      if (Array.isArray(kw)) c = c.concat(kw.map(it => ({ it, s: score(it) || (norm(it.title).includes(norm(k)) ? 2 : 0) })).filter(x => x.s > 0 && hv(p.lat, p.lng, +x.it.mapy, +x.it.mapx) < 6000)); }
  }
  if (fatal) { st.tried--; break; } /* 한도에 걸린 시도는 세지 않는다 */
  c.forEach(x => { x.d = Math.round(hv(p.lat, p.lng, +x.it.mapy, +x.it.mapx)); });
  c.sort((a, b) => b.s - a.s || a.d - b.d);
  const top = c[0];
  if (top && top.s >= 2.5 && !st.cid) Object.assign(st, { cid: top.it.contentid, ct: String(top.it.contenttypeid), t: top.it.title, s: top.s, d: top.d, lat: +(+top.it.mapy).toFixed(6), lng: +(+top.it.mapx).toFixed(6) });
  if (needImg) { const seen = new Set(); st.imgs = c.filter(x => x.it.firstimage && x.s >= 2 && !seen.has(x.it.firstimage) && seen.add(x.it.firstimage)).slice(0, 3).map(x => ({ t: x.it.title, s: x.s, d: x.d, img: x.it.firstimage.replace(/^http:/, 'https:'), cc: x.it.cpyrhtDivCd || '' })); }
  await sleep(100);
}
// 2단계: 공통 정보(주소·소개·누리집·좌표)
for (const p of L) { if (fatal || calls >= MAX) break; const st = S[p.id]; if (!st || !st.cid || st.common) continue;
  const r = await call('detailCommon2', { contentId: String(st.cid) }); if (!r) continue; const it = r[0]; if (!it) { st.common = {}; continue; }
  st.ct = String(it.contenttypeid || st.ct || '');
  st.common = { title: it.title, addr: [it.addr1, it.addr2].filter(Boolean).join(' ').trim(), tel: clean(it.tel), home: (String(it.homepage || '').match(/https?:\/\/[^\s"'<>]+/) || [''])[0], overview: clean(it.overview), img: String(it.firstimage || '').replace(/^http:/, 'https:'), cc: it.cpyrhtDivCd || '', lat: +(+it.mapy).toFixed(6), lng: +(+it.mapx).toFixed(6) };
  await sleep(100); }
// 3단계: 운영 정보(이용시간·쉬는 날·문의·주차·요금)
const pick = (it, keys) => { for (const k of keys) if (it[k]) return clean(it[k]); return ''; };
for (const p of L) { if (fatal || calls >= MAX) break; const st = S[p.id]; if (!st || !st.cid || !st.common || st.intro || !st.ct) continue;
  const r = await call('detailIntro2', { contentId: String(st.cid), contentTypeId: st.ct }); if (!r) continue; const it = r[0] || {};
  st.intro = { time: pick(it, ['usetime', 'usetimeculture', 'usetimeleports', 'opentime', 'opentimefood', 'playtime']), rest: pick(it, ['restdate', 'restdateculture', 'restdateleports', 'restdateshopping', 'restdatefood']), info: pick(it, ['infocenter', 'infocenterculture', 'infocenterleports', 'infocentershopping', 'infocenterfood']), park: pick(it, ['parking', 'parkingculture', 'parkingleports', 'parkingshopping', 'parkingfood']), fee: pick(it, ['usefee', 'usefeeleports', 'parkingfee']) };
  await sleep(100); }
const v = Object.values(S), sum = { places: L.length, matched: v.filter(x => x.cid).length, common: v.filter(x => x.common).length, intro: v.filter(x => x.intro).length, imgs: v.filter(x => x.imgs && x.imgs.length).length };
sum.done = !fatal && L.every(p => { const st = S[p.id] || {}; return st.cid ? st.common && st.intro : (st.tried || 0) >= 2; });
fs.mkdirSync('tools/out', { recursive: true });
fs.writeFileSync('tools/out/kto.json', JSON.stringify({ at: new Date().toISOString(), calls, fatal, sum, places: S }));
console.log(`호출 ${calls}회 ·`, JSON.stringify(sum), fatal ? '· 중단: ' + fatal : '');
