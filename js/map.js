/* 지도 화면: MapLibre + OpenStreetMap 위에 스티커 마커, 지역 묶음, 바텀시트, GPS */
window.MapScreen = (function () {
const cfg = window.APP_CONFIG, L = window.LANDMARKS, CATS = window.CATS;
const { dist, byId } = window.Store;
const setName = id => (window.SETS.find(s => s.id === id) || {}).name || id;
const fmt = m => m < 1000 ? `${Math.round(m)}m` : m < 10000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m / 1000)}km`;
const ICON = {
  palace: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10c4-1 6-4 10-6 4 2 6 5 10 6"/><path d="M5 10v9M19 10v9M9 12v7M15 12v7M3 19h18"/></svg>',
  mountain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 19l7-12 4 6 3-4 6 10z"/><path d="M7.5 9.5l1.5 1.5 1.5-1.5"/></svg>',
  sea: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 9c2.5-2 4.5-2 7 0s4.5 2 7 0 4-2 6 0"/><path d="M2 14c2.5-2 4.5-2 7 0s4.5 2 7 0 4-2 6 0"/><path d="M2 19c2.5-2 4.5-2 7 0s4.5 2 7 0 4-2 6 0"/></svg>',
  street: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11c3-.5 5-3 9-6 4 3 6 5.5 9 6"/><path d="M5 11v8h14v-8"/><path d="M10 19v-5h4v5"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="M9 6h6l-1 8h-4z"/><path d="M10.5 14L9 21h6l-1.5-7"/><path d="M5 21h14"/></svg>',
  park: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="5.5"/><path d="M12 14.5V21M8 21h8M12 17l-2.5-2"/></svg>',
};
/* 색 토큰은 테마가 바뀔 때만 다시 읽는다 (움직일 때마다 getComputedStyle 을 부르면 느리다) */
let tokCache = {};
const tok = n => { if (n in tokCache) return tokCache[n]; return (tokCache[n] = getComputedStyle(document.documentElement).getPropertyValue(n).trim()); };
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { tokCache = {}; }); } catch (e) {}
const ZI = ['interpolate', ['exponential', 1.6], ['zoom']];
function mapStyle() {
  const p = k => tok(k);
  const road = (id, classes, stops, color, edge, min) => [
    { id: id + '-case', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: min, filter: ['match', ['get', 'class'], classes, true, false], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': edge, 'line-width': [...ZI, ...stops.flatMap(([z, w]) => [z, w + (w > 1 ? 2 : 0.6)])] } },
    { id, type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: min, filter: ['match', ['get', 'class'], classes, true, false], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': [...ZI, ...stops.flatMap(([z, w]) => [z, w])] } }];
  return { version: 8, sources: { omt: { type: 'vector', url: cfg.tiles } }, layers: [
    { id: 'land', type: 'background', paint: { 'background-color': p('--land') } },
    { id: 'landcover', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['match', ['get', 'class'], ['wood', 'grass', 'farmland'], true, false], paint: { 'fill-color': ['match', ['get', 'class'], 'wood', p('--green-deep'), p('--green')], 'fill-opacity': ['match', ['get', 'class'], 'farmland', 0.45, 0.9] } },
    { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': p('--green') } },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': p('--sea') } },
    { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', paint: { 'line-color': p('--river'), 'line-width': [...ZI, 8, 0.6, 13, 2, 16, 6] } },
    { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': p('--block') } },
    ...road('minor', ['minor', 'service', 'track'], [[12, 0.4], [14, 2], [16, 6], [18, 14]], p('--road'), p('--road-edge'), 12),
    ...road('mid', ['secondary', 'tertiary'], [[8, 0.5], [11, 1.2], [14, 4], [16, 9], [18, 18]], p('--road'), p('--road-edge'), 8),
    ...road('major', ['motorway', 'trunk', 'primary'], [[5, 0.5], [9, 1.4], [12, 3], [14, 6], [16, 12], [18, 24]], p('--road-major'), p('--road-major-edge'), 5),
    { id: 'region-part', type: 'fill', source: 'regions', filter: ['in', ['get', 'code'], ['literal', []]], paint: { 'fill-color': p('--brand'), 'fill-opacity': 0.10 } },
    { id: 'region-done', type: 'fill', source: 'regions', filter: ['in', ['get', 'code'], ['literal', []]], paint: { 'fill-color': p('--brand'), 'fill-opacity': 0.28 } },
    { id: 'region-done-line', type: 'line', source: 'regions', filter: ['in', ['get', 'code'], ['literal', []]], paint: { 'line-color': p('--brand'), 'line-width': 2 } },
    { id: 'guide-line', type: 'line', source: 'guide', layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': 3, 'line-dasharray': [2, 2] } },
    { id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': ['get', 'c'], 'fill-opacity': 0.14 } },
    { id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': ['get', 'c'], 'line-width': 2, 'line-dasharray': [3, 2.5] } },
    { id: 'mem-dot', type: 'circle', source: 'mem', paint: { 'circle-color': '#F06292', 'circle-opacity': 0.85, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2, 'circle-radius': ['case', ['has', 'point_count'], ['interpolate', ['linear'], ['get', 'point_count'], 2, 9, 20, 15, 200, 22], 6] } },
  ] };
}
const emptyFC = () => ({ type: 'FeatureCollection', features: [] });
const styleWithSources = () => { const s = mapStyle(); s.sources.guide = { type: 'geojson', data: emptyFC() }; s.sources.radius = { type: 'geojson', data: emptyFC() }; s.sources.regions = { type: 'geojson', data: window.REGIONS || emptyFC() }; s.sources.mem = { type: 'geojson', data: memFC(), cluster: true, clusterRadius: 44, clusterMaxZoom: 15 }; return s; };
/* 명소 밖에서 찍은 추억 사진: 분홍 점, 많을수록 크게 */
const memFC = () => ({ type: 'FeatureCollection', features: (window.Memory ? window.Memory.loose() : []).map(m => ({ type: 'Feature', properties: { id: m.id }, geometry: { type: 'Point', coordinates: [m.lng, m.lat] } })) });

/* 랜드마크 → 시군구 코드 (점-다각형 포함 판정) */
function pip(pt, ring) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside; } return inside; }
function regionOf(p) { const R = window.REGIONS; if (!R) return null; const pt = [p.lng, p.lat]; let best = null, bd = Infinity;
  for (const f of R.features) { const g = f.geometry; const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys) { if (pip(pt, poly[0]) && !poly.slice(1).some(h => pip(pt, h))) return f;
      for (const v of poly[0]) { const d = ((v[0] - pt[0]) * 0.8) ** 2 + (v[1] - pt[1]) ** 2; if (d < bd) { bd = d; best = f; } } } }
  return bd < 0.05 ** 2 ? best : null; } // 해안선 밖(케이블카·해수욕장)은 가장 가까운 시군구로
const REGION_OF = {}; L.forEach(p => { const f = regionOf(p); if (f) { p.rg = f.properties.code; p.rgName = f.properties.name; } });
window.REGION_NAME = code => { const f = (window.REGIONS?.features || []).find(f => f.properties.code === code); return f ? f.properties.name : ''; };
function regionStats(gpsOnly) { const g = {}; L.forEach(p => { if (!p.rg) return; const s = g[p.rg] || (g[p.rg] = { total: 0, done: 0, name: p.rgName }); s.total++; if (gpsOnly ? visited(p.id) : been(p.id)) s.done++; }); return g; } /* gpsOnly: 뱃지·칭호는 현장 도장만 센다 */
function paintRegions() { if (!map.getSource('regions')) return; const g = regionStats(); const done = [], part = [];
  Object.entries(g).forEach(([c, s]) => { if (s.done === s.total) done.push(c); else if (s.done > 0) part.push(c); });
  map.setFilter('region-done', ['in', ['get', 'code'], ['literal', done]]); map.setFilter('region-done-line', ['in', ['get', 'code'], ['literal', done]]); map.setFilter('region-part', ['in', ['get', 'code'], ['literal', part]]); }

let map, store, S, mapEl, ov, pool = new Map(), meEl, raf = null, movedFlag = false, onStamp, onDetail, onNear, onAddTrip, onPhoto, onGallery, onLoginNeeded, onUndo, onStampInfo, onMemPhotos, toastFn;
/* 반경 진입 알림 (앱이 열려 있을 때). 같은 곳은 30분에 한 번만 */
const nearSeen = {};
function nearCheck() { if (!S.me || !onNear) return; const now = Date.now(); const today = window.Store.kstToday();
  const hit = L.filter(p => dist(S.me, p) <= p.r && !(store.stampsOf(p.id)?.last === today) && !(nearSeen[p.id] && now - nearSeen[p.id] < 30 * 60e3)).sort((a, b) => dist(S.me, a) - dist(S.me, b))[0];
  if (hit) { nearSeen[hit.id] = now; onNear(hit); } }
const mode = () => { if (S.trip) return 'near'; const z = map.getZoom(); return z < 7.6 ? 'nat' : z < 11.2 ? 'city' : 'near'; };
const P = (lng, lat) => { const p = map.project([lng, lat]); return [p.x, p.y]; };
const visited = id => !!store.stampsOf(id);
const remembered = id => !!(window.Memory && window.Memory.of(id)); /* 사진으로 찾은 추억 도장 */
const been = id => visited(id) || remembered(id);
const inRange = p => S.me && dist(S.me, p) - Math.min(S.me.accuracy || 0, cfg.maxAccuracy) <= p.r;
/* 지도 필터: 모음·종류·지역·방문 여부 */
const FKEYS = ['set', 'cat', 'sido', 'gu', 'seen'];
function passes(p) { const f = S.filter;
  if (f.set && !(p.sets || []).includes(f.set)) return false;
  if (f.cat && p.cat !== f.cat) return false;
  if (f.sido && p.sido !== f.sido) return false;
  if (f.gu && p.gu !== f.gu) return false;
  if (f.seen === 'yes' && !been(p.id)) return false;
  if (f.seen === 'no' && been(p.id)) return false;
  if (f.seen === 'stamp' && !visited(p.id)) return false; /* 직접 가서 찍은 곳만 */
  if (f.seen === 'mem' && (visited(p.id) || !remembered(p.id))) return false; /* 사진만 있고 아직 현장 도장은 없는 곳 */
  return true; }
const filterCount = () => FKEYS.filter(k => S.filter[k]).length;
/* 지금 지도에 보일 랜드마크 */
const pool0 = () => { const base = S.trip ? L.filter(p => S.trip.ids.includes(p.id)) : L; return filterCount() ? base.filter(passes) : base; };

function items() {
  const m = mode(), r = mapEl.getBoundingClientRect(); let list = [];
  if (m === 'nat') { const g = {}; pool0().forEach(p => (g[p.sido] = g[p.sido] || []).push(p));
    list = Object.entries(g).map(([s, ms]) => { const c = window.SIDO_CENTER[s] || [ms[0].lng, ms[0].lat]; const [x, y] = P(c[0], c[1]); return { key: 's:' + s, type: 'cl', x, y, ms, label: s, sido: s }; }); return merge(list, 58, r); }
  if (m === 'city') { const g = {}; pool0().forEach(p => { const k = p.sido + ' ' + p.gu; (g[k] = g[k] || []).push(p); });
    list = Object.entries(g).map(([k, ms]) => { const lat = ms.reduce((a, p) => a + p.lat, 0) / ms.length, lng = ms.reduce((a, p) => a + p.lng, 0) / ms.length; const [x, y] = P(lng, lat); return { key: 'g:' + k, type: 'cl', x, y, ms, label: k.split(' ')[1] }; }); return merge(list, 96, r); }
  const src = pool0(); const pad = 140; // 화면 밖은 계산하지 않는다
  list = []; for (const p of src) { const [x, y] = P(p.lng, p.lat); if (x < -pad || y < -pad || x > r.width + pad || y > r.height + pad) continue; list.push({ key: 'p:' + p.id, type: 'pin', x, y, ms: [p] }); }
  const hot = list.filter(i => inRange(i.ms[0]) && !visited(i.ms[0].id)), rest = list.filter(i => !hot.includes(i)); // 지금 찍을 수 있는 곳은 묶지 않고 항상 노출
  return merge(rest, 66, r).concat(hot.map(i => ({ ...i, parts: [i] })));
}
function merge(list, thr, r) { const out = [];
  list.filter(i => i.x > -80 && i.x < r.width + 80 && i.y > -80 && i.y < r.height + 80).forEach(i => { const hit = out.find(o => Math.hypot(o.x - i.x, o.y - i.y) < thr);
    if (!hit) { out.push({ ...i, parts: [i] }); return; } hit.parts.push(i); hit.ms = hit.ms.concat(i.ms);
    hit.x = hit.parts.reduce((a, p) => a + p.x, 0) / hit.parts.length; hit.y = hit.parts.reduce((a, p) => a + p.y, 0) / hit.parts.length; hit.type = 'cl'; hit.key = 'm:' + hit.parts.map(p => p.key).sort().join('|');
    hit.label = hit.parts[0].type === 'pin' ? null : `${hit.parts[0].label} 외 ${hit.parts.length - 1}`; }); return out; }

function renderOverlay() {
  if (!map.loaded() && !map._loaded) {}
  const its = items(), seen = new Set(), m = mode();
  its.forEach(it => { seen.add(it.key); let el = pool.get(it.key); const v = it.ms.filter(p => been(p.id)).length, n = it.ms.length;
    if (it.type === 'pin') { const p = it.ms[0], st = visited(p.id) ? 'visited' : inRange(p) ? 'avail' : remembered(p.id) ? 'memory' : '', sig = `pin|${st}|${S.sel === p.id}`;
      if (!el) { el = document.createElement('button'); el.type = 'button'; el.className = 'lm'; el.addEventListener('click', onTap); ov.appendChild(el); pool.set(it.key, el); }
      if (el._sig !== sig) { el.className = `lm ${st} ${S.sel === p.id ? 'sel' : ''}`; el.style.setProperty('--c', `var(--c-${p.cat})`); el.innerHTML = `<span class="card">${ICON[p.cat]}</span><span class="nm">${p.name}</span>`; el.setAttribute('aria-label', `${p.name}${visited(p.id) ? ', 도장 찍음' : remembered(p.id) ? ', 추억 사진 있음' : ''}`); el._sig = sig; }
      el.style.transform = `translate(${it.x - 23}px,${it.y - 23}px)`;
    } else { const label = it.label || `${n}곳`, cls = `cl ${v === n ? 'done' : v ? 'has' : ''} ${it.label ? '' : 'small'}`, sig = `cl|${label}|${v}/${n}|${cls}`;
      if (!el) { el = document.createElement('button'); el.type = 'button'; el.addEventListener('click', onTap); ov.appendChild(el); pool.set(it.key, el); }
      if (el._sig !== sig) { el.className = cls; el.style.setProperty('--p', Math.round(v / n * 100)); el.innerHTML = it.label ? `<span class="in"><b>${label}</b><span>${v}/${n}</span></span>` : `<span class="in"><b>${n}</b></span>`; el.setAttribute('aria-label', `${label}, ${n}곳 중 ${v}곳 방문`); el._sig = sig; }
      if (el._w === undefined || el._sig !== el._msig) { el._w = el.offsetWidth || 54; el._h = el.offsetHeight || 54; el._msig = el._sig; }
      el.style.transform = `translate(${it.x - el._w / 2}px,${it.y - el._h / 2}px)`; }
    el._item = it; });
  for (const [k, el] of pool) if (!seen.has(k)) { el.remove(); pool.delete(k); }
  if (!meEl) { meEl = document.createElement('div'); meEl.className = 'me'; ov.appendChild(meEl); }
  if (S.me) { const [mx, my] = P(S.me.lng, S.me.lat); meEl.style.transform = `translate(${mx - 11}px,${my - 11}px)`; meEl.hidden = false; meEl.classList.toggle('stale', !S.live); } else meEl.hidden = true;
  ['jNear', 'jCity', 'jNat'].forEach((id, i) => document.getElementById(id).setAttribute('aria-pressed', String(['near', 'city', 'nat'][i] === m)));
  drawGeo();
}
let geoSig = '';
function openMem(f) { const src = map.getSource('mem'); const done = ids => onMemPhotos && onMemPhotos(ids);
  if (f.properties.cluster) src.getClusterLeaves(f.properties.cluster_id, 500, 0).then(fs => done(fs.map(x => x.properties.id))).catch(() => {}); else done([f.properties.id]); }
function refreshMem() { const s = map && map.getSource('mem'); if (s) s.setData(memFC()); renderUI(); dirty(); paintRegions(); }
function memLayerVis() { if (map && map.getLayer('mem-dot')) map.setLayoutProperty('mem-dot', 'visibility', ['stamp', 'no'].includes(S.filter.seen) ? 'none' : 'visible'); } /* 현장 도장만·안 간 곳만 볼 땐 분홍 점도 숨긴다 */
function drawGeo() {
  const g = map.getSource('guide'), rs = map.getSource('radius'); if (!g || !rs) return;
  // 내용이 그대로면 다시 올리지 않는다
  const sig = `${S.trip ? S.trip.ids.join(',') : ''}|${S.me ? S.me.lat.toFixed(4) + ',' + S.me.lng.toFixed(4) : ''}|${mode()}|${S.sel || ''}|${Object.keys(store.allStamps()).length}`;
  if (sig === geoSig) return; geoSig = sig;
  const gf = emptyFC();
  if (S.trip) { const pts = S.trip.ids.map(id => byId(id)).filter(Boolean).map(p => [p.lng, p.lat]); if (pts.length > 1) gf.features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts }, properties: { c: tok('--brand') } }); }
  else if (S.me && mode() !== 'nat') { const cand = L.filter(p => !visited(p.id)).map(p => ({ p, d: dist(S.me, p) })).sort((a, b) => a.d - b.d)[0];
    if (cand) gf.features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[S.me.lng, S.me.lat], [cand.p.lng, cand.p.lat]] }, properties: { c: tok('--c-' + cand.p.cat) } }); }
  g.setData(gf);
  const rf = emptyFC(); const p = S.sel && byId(S.sel);
  if (p) { const pts = []; for (let k = 0; k <= 48; k++) { const a = k / 48 * Math.PI * 2; pts.push([p.lng + Math.cos(a) * p.r / (111320 * Math.cos(p.lat * Math.PI / 180)), p.lat + Math.sin(a) * p.r / 111320]); } rf.features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] }, properties: { c: tok('--c-' + p.cat) } }); }
  rs.setData(rf);
}
const dirty = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = null; renderOverlay(); }); };

function onTap(e) { if (movedFlag) return; const it = e.currentTarget._item; if (!it) return;
  if (it.type === 'pin') { select(it.ms[0].id); return; }
  const b = new maplibregl.LngLatBounds(); it.ms.forEach(p => b.extend([p.lng, p.lat]));
  if (it.ms.length === 1) { map.flyTo({ center: [it.ms[0].lng, it.ms[0].lat], zoom: 14 }); return; }
  map.fitBounds(b, { padding: 90, maxZoom: Math.max(map.getZoom() + 2, mode() === 'near' ? 16 : 12.5), duration: 700 });
}

/* ---------- 바텀시트 ---------- */
const sheet = () => document.getElementById('sheet');
function select(id) {
  S.sel = id; const p = byId(id), s = store.stampsOf(id), d = S.me ? dist(S.me, p) : null, ok = cfg.testMode || (d !== null && inRange(p) && S.accuracyOk), today = s && s.last === window.Store.kstToday();
  const sh = sheet(); sh.style.setProperty('--c', `var(--c-${p.cat})`);
  const cover = document.getElementById('cover'), ph = store.coverOf(id), md = (window.MEDIA || {})[id];
  const nPh = store.photosOf(id).length;
  cover.innerHTML = (ph ? `<img src="${ph.url}" alt="">` : md && md.img ? `<img src="${md.img}" alt="" loading="lazy">` : ICON[p.cat].replace('<svg ', '<svg class="big" ').replace('stroke-width="1.8"', 'stroke-width="1.3"')) + `<span class="tag">${CATS[p.cat].emoji} ${CATS[p.cat].name}</span>` + (nPh || (md && md.img) ? `<span class="tag r">${ph ? `👍 ${ph.likes} · ${nPh}장` : '위키미디어'}</span>` : '') + (s ? `<div class="pop">${p.name.replace(/\s.*/, '').slice(0, 3)}<br>방문</div>` : '');
  document.getElementById('sName').textContent = p.name; document.getElementById('sRegion').textContent = `${p.sido} ${p.gu}`; document.getElementById('sSets').innerHTML = (p.sets || []).map(id => `<span class="set">${setName(id)}</span>`).join('');
  document.getElementById('sDist').textContent = d === null ? '내 위치 꺼짐' : `내 위치에서 ${fmt(d)}`; { const sp = splitDesc(p.desc); const body = (md && md.desc) ? md.desc.slice(0, 120) + (md.desc.length > 120 ? '…' : '') : sp.body; document.getElementById('sDesc').innerHTML = (sp.spot ? `<span class="spot">📍 인증 지점 · ${sp.spot}</span>` : '') + body.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  const vEl = document.getElementById('sVisit'); const canUndo = today && (cfg.testMode || (d !== null && inRange(p)));
  vEl.hidden = true; vEl.innerHTML = !s ? '' : today ? `<b>오늘 찍었어요</b>${s.count > 1 ? ` · 방문 ${s.count}회` : ''}${canUndo ? ' <button type="button" class="linkbtn" id="sUndo">잘못 찍었어요 · 취소</button>' : ''}` : `<b>방문 ${s.count}회</b> · ${s.first === s.last ? `${s.last.replaceAll('-', '.')} 다녀옴` : `최근 ${s.last.replaceAll('-', '.')}`}`;
  const su = document.getElementById('sUndo'); if (su) su.onclick = async () => { if (!confirm(`${p.name} 오늘 도장을 취소할까요?`)) return; const r = await store.unstamp(p.id); if (!r.ok) { toastFn(r.reason); return; } toastFn('도장을 취소했어요'); renderUI(); select(p.id); paintRegions(); dirty(); onUndo && onUndo(p); };
  const b = document.getElementById('stampBtn'), why = document.getElementById('sWhy'), go = document.getElementById('sGo');
  const near = cfg.testMode || today || d === null || d <= Math.max(p.r, 2000); // 2km 안이면 '찍으러 온 사람'
  sheet().classList.toggle('faraway', !near);
  b.disabled = !ok && !s; b.classList.toggle('stamped', !!s); /* 찍은 곳은 도장을 누르면 기록·취소 창 */ b.querySelector('b').innerHTML = s ? window.sealHtml(p.name, s.last.slice(5).replace('-', '.')) : '도장<br>꾹!';
      why.textContent = s ? (today ? '' : ok ? '오늘 또 찍을 수 있어요' : '') : cfg.testMode ? ''
    : d === null ? '내 위치를 켜면 반경 안에서 도장을 찍을 수 있어요.'
    : !S.accuracyOk && d <= p.r ? 'GPS 신호가 약해요. 하늘이 보이는 곳에서 잠시 기다려 주세요.'
    : ok ? '지금 찍을 수 있어요'
    : near ? `${p.r}m 안까지 가면 도장을 찍을 수 있어요.`
    : '도착해서 찍으면 돼요. 먼저 길을 확인해 보세요.';
  const far = !today && !cfg.testMode && d !== null && !inRange(p);
  go.hidden = !far;
  if (far) go.innerHTML = near ? `<b>${fmt(Math.max(1, d - p.r))}</b> 더 가세요` : `여기서 <b>${fmt(d)}</b>${travelTime(d)}`;
  document.getElementById('routeBtn').href = routeUrl(p);
  document.getElementById('addTripBtn').onclick = () => onAddTrip && onAddTrip(p);
  const pb = document.getElementById('photoBtn'); pb.onclick = () => onPhoto && onPhoto(p, !!s); pb.classList.toggle('dim', !s);
  cover.onclick = () => onGallery && onGallery(p);
  sh.classList.add('open'); sh.setAttribute('aria-hidden', 'false'); dirty();
}
function closeSheet() { S.sel = null; const sh = sheet(); sh.classList.remove('open'); sh.setAttribute('aria-hidden', 'true'); dirty(); }

/* 거리로 어림잡은 이동 시간 (차 기준, 시속 60km + 10분) */
function travelTime(d) { if (d < 3000) return ''; const h = d / 1000 / 60 + 1 / 6; return h < 1 ? ` · 차로 약 ${Math.round(h * 60 / 10) * 10}분` : ` · 차로 약 ${h.toFixed(1).replace('.0', '')}시간`; }
function routeUrl(p) { const me = S.me; const dn = encodeURIComponent(p.name.replace(/[·&/]/g, ' '));
  return me ? `https://map.naver.com/p/directions/${me.lng},${me.lat},${encodeURIComponent('내 위치')}/${p.lng},${p.lat},${dn}/-/transit` : `https://map.naver.com/p/search/${dn}`; }
/* ---------- 상단 UI ---------- */
function renderUI() {
  const v = L.filter(p => been(p.id)).length, pct = Math.round(v / L.length * 100); /* 현장 도장 + 추억 도장 */
  document.getElementById('progress').innerHTML = `<span>랜드마크${cfg.testMode ? '<span class="testbadge">테스트</span>' : ''}<b>${v} / ${L.length}곳</b></span><span class="ring" style="background:conic-gradient(var(--brand) ${pct}%,var(--line) 0)"><i>${pct}%</i></span>`;
  const box = document.getElementById('near');
  if (!S.me) { box.innerHTML = `<button type="button" class="nb"><small>내 위치를 켜면</small>가까운 곳을 알려드려요</button>`; box.querySelector('.nb').onclick = startGPS; return; }
  // 가까운 3곳: 아직 안 간 곳 우선. 찍을 수 있는 곳은 빨갛게
  const src = pool0();
  const near = src.map(p => ({ p, d: dist(S.me, p) })).sort((a, b) => a.d - b.d); const un = near.filter(x => !visited(x.p.id)); const pick = (un.length ? un : near).slice(0, 3);
  box.innerHTML = pick.map(({ p, d }) => `<button type="button" class="nb ${inRange(p) && !visited(p.id) ? 'hot' : ''}" data-id="${p.id}"><small>${inRange(p) && !visited(p.id) ? '지금 찍을 수 있어요' : visited(p.id) ? '다녀온 곳' : fmt(d)}</small>${p.name}</button>`).join('');
  box.querySelectorAll('.nb').forEach(b => b.onclick = () => { const p = byId(b.dataset.id); if (S.sel) closeSheet(); map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 15) }); }); // 이동만. 핀을 누르면 열린다
}

/* ---------- 필터 ---------- */
function renderFilterBtn() { memLayerVis(); const b = document.getElementById('filterBtn'); if (!b) return; const n = filterCount();
  b.textContent = n ? `필터 ${n}` : '필터'; b.setAttribute('aria-pressed', String(n > 0));
  const bar = document.getElementById('filterBar'); const f = S.filter;
  const names = [f.set && setName(f.set), f.cat && (CATS[f.cat].emoji + ' ' + CATS[f.cat].name), f.gu ? `${f.sido} ${f.gu}` : f.sido, { yes: '다녀온 곳', no: '아직 안 간 곳', stamp: '현장 도장', mem: '추억만' }[f.seen] || ''].filter(Boolean);
  bar.hidden = !names.length; if (names.length) { document.getElementById('filterBarName').textContent = `${names.join(' · ')} · ${pool0().length}곳`; } }
function openFilter() {
  const f = S.filter; const el = document.createElement('div'); el.className = 'login mapfilter';
  const chip = (k, v, label) => `<button type="button" class="chip" data-k="${k}" data-v="${v}" aria-pressed="${f[k] === v}">${label}</button>`;
  const render = () => {
    const sidos = [...new Set(L.map(p => p.sido))];
    const gus = f.sido ? [...new Set(L.filter(p => p.sido === f.sido).map(p => p.gu))].sort((a, b) => a.localeCompare(b, 'ko')) : [];
    el.innerHTML = `<div class="box filt"><h2>골라 보기</h2>
      <div class="frow"><span>모음</span>${chip('set', '', '전체')}${window.SETS.map(s => chip('set', s.id, s.name)).join('')}</div>
      <div class="frow"><span>종류</span>${chip('cat', '', '전체')}${Object.entries(CATS).map(([k, c]) => chip('cat', k, c.emoji + ' ' + c.name)).join('')}</div>
      <div class="frow"><span>지역</span><div class="sel2"><select id="fSido"><option value="">전국</option>${sidos.map(s => `<option value="${s}" ${f.sido === s ? 'selected' : ''}>${s}</option>`).join('')}</select><select id="fGu" ${gus.length ? '' : 'disabled'}><option value="">${f.sido ? f.sido + ' 전체' : '시·군·구'}</option>${gus.map(g => `<option value="${g}" ${f.gu === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div></div>
      <div class="frow"><span>방문</span>${chip('seen', '', '전체')}${chip('seen', 'yes', '다녀온 곳')}${chip('seen', 'stamp', '🔴 현장 도장')}${chip('seen', 'mem', '🌸 추억만')}${chip('seen', 'no', '아직 안 간 곳')}</div>
      <p class="cnt">${pool0().length}곳이 지도에 보여요</p>
      <div class="askrow"><button class="btn ghost" type="button" id="fRst">전체 보기</button><button class="btn primary" type="button" id="fOk">닫기</button></div></div>`;
    el.querySelectorAll('.chip').forEach(b => b.onclick = () => { const k = b.dataset.k; f[k] = f[k] === b.dataset.v ? '' : b.dataset.v; if (k === 'sido') f.gu = ''; apply(); render(); });
    el.querySelector('#fSido').onchange = e => { f.sido = e.target.value; f.gu = ''; apply(); render(); };
    el.querySelector('#fGu').onchange = e => { f.gu = e.target.value; apply(); render(); };
    el.querySelector('#fRst').onclick = () => { FKEYS.forEach(k => f[k] = ''); apply(); render(); };
    el.querySelector('#fOk').onclick = () => el.remove();
  };
  const apply = () => { renderFilterBtn(); renderUI(); for (const [k, e] of pool) { e.remove(); pool.delete(k); } dirty(); };
  el.onclick = e => { if (e.target === el) el.remove(); };
  document.getElementById('app').appendChild(el); render();
}

/* ---------- GPS ---------- */
let watchId = null;
function gpsMsg(t) { const el = document.getElementById('gpsMsg'); el.hidden = !t; el.textContent = t || ''; }
let staleT = null;
/* 설명 앞의 '[인증: 광화문 앞]'을 떼어낸다 */
function splitDesc(d) { const m = /^\[인증:\s*([^\]]+)\]\s*/.exec(d || ''); return m ? { spot: m[1], body: (d || '').slice(m[0].length) } : { spot: '', body: d || '' }; }
function startGPS(first) {
  const btn = document.getElementById('gpsBtn');
  if (!navigator.geolocation) { gpsMsg('이 기기는 위치를 지원하지 않아요'); return; }
  if (watchId !== null) { if (S.me) map.flyTo({ center: [S.me.lng, S.me.lat], zoom: Math.max(map.getZoom(), 14) }); return; }
  btn.classList.add('on'); btn.classList.remove('err'); gpsMsg('내 위치를 찾는 중…');
  let lastFix = 0, hadFix = false;
  watchId = navigator.geolocation.watchPosition(pos => {
    const firstFix = !hadFix; hadFix = true; const moved = S.me ? dist(S.me, { lat: pos.coords.latitude, lng: pos.coords.longitude }) : 1e9;
    const stale = () => { if (staleT) clearTimeout(staleT); staleT = setTimeout(() => { S.accuracyOk = false; if (S.sel) select(S.sel); }, 90000); }; /* 90초 넘게 새 위치가 없으면 옛 위치로는 못 찍게 */
    btn.classList.add('on'); btn.classList.remove('err');
    if (!firstFix && Date.now() - lastFix < 3000 && moved < 5) { if (S.me) S.me.at = Date.now(); stale(); return; } /* 1초마다 오는 똑같은 위치로 화면을 다시 그리지 않는다 */
    lastFix = Date.now(); S.me = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: Date.now() }; S.live = true; S.accuracyOk = pos.coords.accuracy <= cfg.maxAccuracy;
    stale();
    gpsMsg(S.accuracyOk ? '' : `GPS 오차 ${Math.round(pos.coords.accuracy)}m · 하늘이 보이는 곳이 좋아요`);
    if (firstFix) map.flyTo({ center: [S.me.lng, S.me.lat], zoom: 13 }); try { localStorage.setItem('lm-lastpos', JSON.stringify({ lat: S.me.lat, lng: S.me.lng })); } catch (e) {} /* 다음에 열 때 지도 위치용. 시각이 없어서 도장에는 못 쓴다 */
    renderUI(); if (S.sel) select(S.sel); dirty(); nearCheck();
  }, err => { btn.classList.remove('on'); btn.classList.add('err'); S.live = false; S.accuracyOk = false; if (S.sel) select(S.sel);
    if (err.code === 1) { if (watchId !== null) { try { navigator.geolocation.clearWatch(watchId); } catch (e) {} } watchId = null; } /* 권한 거부만 끊는다. 신호 끊김·시간 초과는 계속 기다린다 */
    gpsMsg(err.code === 1 ? (window.isSecureContext ? '위치 권한이 꺼져 있어요. 설정에서 허용해 주세요' : '지금은 위치를 쓸 수 없어요. 앱으로 열면 쓸 수 있어요') : '위치를 받지 못했어요. 잠시 후 다시 시도해 주세요');
    if (!cfg.testMode) return; // 아래 테스트용 칩은 개발 중에만
    const el = document.getElementById('gpsMsg'); const tb = document.createElement('button'); tb.type = 'button'; tb.className = 'chip'; tb.style.marginTop = '6px'; tb.style.pointerEvents = 'auto'; tb.textContent = '테스트 위치(경복궁)로 보기';
    tb.onclick = () => { S.me = { lat: 37.5797, lng: 126.9772, accuracy: 10, at: Date.now() }; S.live = false; S.accuracyOk = true; if (staleT) clearTimeout(staleT); gpsMsg('테스트 위치 · 경복궁 정문'); map.flyTo({ center: [S.me.lng, S.me.lat], zoom: 14 }); renderUI(); if (S.sel) select(S.sel); dirty(); };
    el.appendChild(tb); el.style.pointerEvents = 'auto'; dirty();
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
}

/* ---------- 초기화 ---------- */
function init(opts) {
  store = opts.store; onStamp = opts.onStamp; onDetail = opts.onDetail; onNear = opts.onNear; onAddTrip = opts.onAddTrip; onPhoto = opts.onPhoto; onGallery = opts.onGallery; onUndo = opts.onUndo; onStampInfo = opts.onStampInfo; onMemPhotos = opts.onMemPhotos; toastFn = opts.toast || (() => {});
  mapEl = document.getElementById('map'); ov = document.getElementById('ov');
  let last = null; try { last = JSON.parse(localStorage.getItem('lm-lastpos')); } catch (e) {}
  S = { me: last, live: false, accuracyOk: false, sel: null, filter: { set: '', cat: '', sido: '', gu: '', seen: '' } };
  map = new maplibregl.Map({ container: 'gl', style: styleWithSources(), center: last ? [last.lng, last.lat] : [127.0, 37.55], zoom: last ? 12.5 : 11, minZoom: 5.5, maxZoom: 18, dragRotate: false, pitchWithRotate: false,
    attributionControl: { compact: true } }); /* 출처 문구는 타일 스타일에 들어 있다 (중복 방지) */
  map.touchZoomRotate.disableRotation(); map.keyboard.disableRotation(); 
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 90 }), 'bottom-left');
  let errShown = false; map.on('error', e => { if (!errShown && /tile|source|fetch|network/i.test(String(e?.error?.message || ''))) { errShown = true; opts.toast('지도 데이터를 불러오지 못했어요. 인터넷 연결을 확인해 주세요'); } });
  map.on('move', dirty); map.on('resize', dirty); map.on('load', () => { paintRegions(); dirty(); }); map.on('style.load', () => { tokCache = {}; geoSig = ''; setTimeout(() => { paintRegions(); drawGeo(); memLayerVis(); }, 0); }); /* 테마가 바뀌면 선·반경도 다시 */
  let regionsPainted = false; map.on('sourcedata', e => { if (e.sourceId === 'regions' && !regionsPainted && map.getLayer('region-done')) { regionsPainted = true; paintRegions(); } });
  map.on('dragstart', () => movedFlag = true); map.on('zoomstart', () => movedFlag = true); map.on('moveend', () => setTimeout(() => movedFlag = false, 0));
  map.on('click', e => { const f = map.queryRenderedFeatures(e.point, { layers: ['mem-dot'] })[0]; if (f) { openMem(f); return; } if (S.sel) closeSheet(); });
  map.on('mouseenter', 'mem-dot', () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', 'mem-dot', () => { map.getCanvas().style.cursor = ''; });
  const mq = matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', () => map.setStyle(styleWithSources()));
  new MutationObserver(() => map.setStyle(styleWithSources())).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  document.getElementById('closeSheet').onclick = closeSheet;
  // 도장 자체를 꾹 누르면 그 자리에서 바로 먹이 번지기 시작한다 (손을 뗄 필요 없음)
  document.getElementById('stampBtn').oncontextmenu = e => e.preventDefault();
  document.getElementById('stampBtn').onpointerdown = e => { const p = byId(S.sel); if (!p || e.currentTarget.disabled) return; if (e.currentTarget.classList.contains('stamped') && !(cfg.testMode || (S.me && inRange(p) && S.accuracyOk && store.stampsOf(p.id)?.last !== window.Store.kstToday()))) { e.preventDefault(); onStampInfo && onStampInfo(p); return; } const pos = S.me || (cfg.testMode ? { lat: p.lat, lng: p.lng, accuracy: 5 } : null); if (!pos) return; e.preventDefault(); onStamp(p, pos, { x: e.clientX, y: e.clientY, pointerId: e.pointerId }); };
  document.getElementById('jNear').onclick = () => S.me ? map.flyTo({ center: [S.me.lng, S.me.lat], zoom: 14 }) : startGPS();
  document.getElementById('jCity').onclick = () => { const base = S.me || { lat: map.getCenter().lat, lng: map.getCenter().lng }; const p = L.map(p => ({ p, d: dist(base, p) })).sort((a, b) => a.d - b.d)[0].p; const ms = L.filter(q => q.sido === p.sido); const b = new maplibregl.LngLatBounds(); ms.forEach(q => b.extend([q.lng, q.lat])); const c = window.SIDO_CENTER[p.sido]; if (c) b.extend(c); map.fitBounds(b, { padding: 70, maxZoom: 10.5, duration: 800 }); };
  document.getElementById('jNat').onclick = () => map.fitBounds([[125.0, 33.1], [130.95, 38.65]], { padding: 30, duration: 900 });
  document.getElementById('gpsBtn').onclick = () => startGPS();
  if (last) startGPS(); else if (localStorage.getItem('lm-onboarded')) setTimeout(startGPS, 600);
  renderFilterBtn();
  document.getElementById('filterBtn').onclick = openFilter;
  document.getElementById('filterOff').onclick = () => { FKEYS.forEach(k => S.filter[k] = ''); renderFilterBtn(); renderUI(); for (const [k, e] of pool) { e.remove(); pool.delete(k); } dirty(); };
  renderUI();
  function showTrip(t) { S.trip = t ? { name: t.name, ids: t.ids } : null; const bar = document.getElementById('tripBar'); bar.hidden = !S.trip; if (S.trip) { document.getElementById('tripBarName').textContent = `${t.name} · ${t.ids.length}곳`; const b = new maplibregl.LngLatBounds(); t.ids.map(byId).filter(Boolean).forEach(p => b.extend([p.lng, p.lat])); if (t.ids.length) map.fitBounds(b, { padding: 80, maxZoom: 14, duration: 800 }); }
    for (const [k, el] of pool) { el.remove(); pool.delete(k); } dirty(); }
  document.getElementById('tripBarOff').onclick = () => showTrip(null);
  return { /* 지도 가운데를 골라서 좌표를 돌려준다 (명소 제안용) */
  pickLocation(start) { return new Promise(res => { const ov = document.getElementById('pickOv'); closeSheet(); if (start) map.flyTo({ center: [start.lng, start.lat], zoom: 16 }); else if (S.me) map.flyTo({ center: [S.me.lng, S.me.lat], zoom: 16 }); ov.hidden = false;
    const done = v => { ov.hidden = true; res(v); }; document.getElementById('pickNo').onclick = () => done(null); document.getElementById('pickOk').onclick = () => { const c = map.getCenter(); done({ lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6) }); }; }); },
  /* 지금 보고 있는 지역: 전국 보기면 전국, 시·도 보기면 시·도, 더 들어가 있으면 시·군·구 */
  region() { const md = mode(); if (md === 'nat' && !S.trip) return {}; const c = map.getCenter(); const near = L.map(p => ({ p, d: dist({ lat: c.lat, lng: c.lng }, p) })).sort((a, b) => a.d - b.d)[0]; if (!near || near.d > 80000) return {}; if (md === 'city') return { sido: near.p.sido }; const n = L.filter(p => p.sido === near.p.sido && p.gu === near.p.gu).length; return n >= 5 ? { sido: near.p.sido, gu: near.p.gu } : { sido: near.p.sido }; }, // 시·군·구에 5곳 미만이면 시·도로
  splitDesc, refreshMem, setFilter(f) { Object.assign(S.filter, { set: '', cat: '', sido: '', gu: '', seen: '' }, f); renderFilterBtn(); renderUI(); for (const [k, e] of pool) { e.remove(); pool.delete(k); } dirty(); }, showTrip, refresh() { renderUI(); if (S.sel) select(S.sel); paintRegions(); dirty(); }, regionStats, select, closeSheet, focus(id) { const p = byId(id); map.flyTo({ center: [p.lng, p.lat], zoom: 14 }); select(id); }, resize() { map.resize(); dirty(); }, pos: () => S.me, ICON, fmt, routeUrl };
}
return { init };
})();
