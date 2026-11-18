/* 뱃지: 도장 기록에서 매번 계산한다. 저장하는 건 "언제 받았는지"뿐 (lm-badges).
   그림은 SVG 템플릿 — 둥근 인장 두 겹 + 가운데 아이콘 + 아래 띠. 등급은 잉크색(동·은·금·먹)으로만 구분 */
window.Badges = (function () {
const L = () => window.LANDMARKS;
const LS = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const INK = { 동: '#B87333', 은: '#8A94A6', 금: '#D4A017', 먹: '#1C1A17' };
const GLYPH = {
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z"/><path d="M9.3 10l1.9 1.9 3.6-3.7"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  palace: '<path d="M2 10c4-1 6-4 10-6 4 2 6 5 10 6"/><path d="M5 10v9M19 10v9M9 12v7M15 12v7M3 19h18"/>',
  mountain: '<path d="M2 19l7-12 4 6 3-4 6 10z"/><path d="M7.5 9.5l1.5 1.5 1.5-1.5"/>',
  sea: '<path d="M2 9c2.5-2 4.5-2 7 0s4.5 2 7 0 4-2 6 0"/><path d="M2 14c2.5-2 4.5-2 7 0s4.5 2 7 0 4-2 6 0"/><path d="M2 19c2.5-2 4.5-2 7 0s4.5 2 7 0 4-2 6 0"/>',
  cam: '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8 7l1.5-3h5L16 7"/>',
  map: '<path d="M4 19V5l6 2 4-2 6 2v14l-6-2-4 2z"/><path d="M10 7v12M14 5v12"/>',
  sun: '<circle cx="12" cy="13" r="4"/><path d="M12 3v3M4 13H1M23 13h-3M5.6 6.6l2 2M18.4 6.6l-2 2M3 20h18"/>',
  foot: '<path d="M9 4c2 0 3 2 3 4.5S11 13 9.5 13 7 11 7 8.5 7.5 4 9 4z"/><path d="M8 15h4l-.5 4h-3z"/><path d="M16 9c1.5 0 2.3 1.5 2.3 3.3S17.5 15.5 16.5 15.5 14.8 14 14.8 12.3 15 9 16 9z"/>',
  tree: '<circle cx="12" cy="9" r="5.5"/><path d="M12 14.5V21M8 21h8M12 17l-2.5-2"/>',
  repeat: '<path d="M4 12a8 8 0 0114-5.3"/><path d="M18 3v4h-4"/><path d="M20 12a8 8 0 01-14 5.3"/><path d="M6 21v-4h4"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><circle cx="17" cy="9" r="2.8"/><path d="M16 14.5c2.8 0 4.8 1.8 5.5 5"/>',
};
const SIDO_INK = { 서울: '#E8573F', 인천: '#2A86D6', 경기: '#F29A1F', 강원: '#2FA36B', 충북: '#7A5AF0', 충남: '#F29A1F', 세종: '#7A5AF0', 대전: '#E8573F', 전북: '#2FA36B', 전남: '#2A86D6', 광주: '#E8573F', 경북: '#7A5AF0', 경남: '#2A86D6', 대구: '#E8573F', 부산: '#2A86D6', 울산: '#2FA36B', 제주: '#F29A1F' };
const tierOf = (cur, steps) => { let t = null; steps.forEach(([n, name]) => { if (cur >= n) t = name; }); return t; };
const nextStep = (cur, steps) => steps.find(([n]) => cur < n) || steps[steps.length - 1];

/* ctx: { stamps, photos(내가 올린 수), myGuides([{completions}]), sharedGuides(수), regionStats({code:{total,done,name}}) } */
function evaluate(ctx) {
  const st = ctx.stamps || {}, out = [];
  const visited = id => !!st[id]; const all = L();
  const add = b => out.push({ ...b, done: b.done !== undefined ? b.done : b.cur >= b.max });
  // 1) 시·군·구 다 모음 (2곳 이상인 곳만), 시·도 완성, 전국
  Object.entries(ctx.regionStats || {}).forEach(([code, r]) => { if (r.total < 2 || !r.name) return; const sido = (all.find(p => p.rg === code) || {}).sido; add({ id: 'rg:' + code, group: '지역', name: `${r.name} 다 모음`, band: `${r.name.replace(/(시|군|구)$/, '')} 다 모음`, sub: `${sido} · ${r.done}/${r.total}`, glyph: 'pin', ink: SIDO_INK[sido] || '#2A86D6', cur: r.done, max: r.total, hide: r.done === 0 }); });
  Object.keys(window.SIDO_CENTER).forEach(sd => { const ps = all.filter(p => p.sido === sd), d = ps.filter(p => visited(p.id)).length; add({ id: 'sido:' + sd, group: '지역', name: `${sd} 완성`, band: `${sd} 완성`, sub: `${d}/${ps.length}곳`, glyph: 'star', ink: INK.금, cur: d, max: ps.length, hide: d === 0 }); });
  { const d = Object.keys(window.SIDO_CENTER).filter(sd => { const ps = all.filter(p => p.sido === sd); return ps.length && ps.every(p => visited(p.id)); }).length; add({ id: 'nation', group: '지역', name: '전국 제패', band: '전국 제패', sub: `${d}/17 시·도`, glyph: 'star', ink: INK.먹, cur: d, max: 17 }); }
  // 2) 세트 단계: 한 뱃지가 동→은→금→먹으로 올라간다
  const SETSTEP = { ktop100: [[10, '동'], [30, '은'], [60, '금'], [110, '먹']], mt100: [[10, '동'], [30, '은'], [60, '금'], [100, '먹']], natpark: [[5, '동'], [12, '은'], [23, '먹']] };
  window.SETS.forEach(s => { const ps = all.filter(p => p.sets.includes(s.id)), d = ps.filter(p => visited(p.id)).length, steps = SETSTEP[s.id] || [[ps.length, '먹']], t = tierOf(d, steps), nx = nextStep(d, steps); const short = s.name.replace('한국관광 ', '').replace('100대 ', '');
    add({ id: 'set:' + s.id, group: '세트', name: `${s.name} ${d >= ps.length ? '전부' : d + '곳'}`, band: `${short} ${Math.min(d, ps.length)}곳`, sub: t ? `다음 ${nx[0]}곳` : `${nx[0]}곳부터`, glyph: s.id === 'ktop100' ? 'palace' : s.id === 'mt100' ? 'mountain' : 'tree', ink: INK[t || '동'], cur: d, max: nx[0], tier: t, locked: !t, done: !!t }); });
  // 3) 주제 묶음 (횟수·이름 그대로)
  const THEME = [
    { id: 'th:palace4', name: '4대 궁 방문', band: '4대 궁', ids: ['gbg', 'cdg', 'cgg', 'dsg'], glyph: 'palace', ink: '#E8573F' },
    { id: 'th:seoulmt', name: '서울 명산 완등', band: '서울 명산', ids: ['m047', 'm027', 'm010'], glyph: 'mountain', ink: '#2FA36B', sub: '북한산·도봉산·관악산' },
    { id: 'th:silla', name: '경주 신라 3곳', band: '경주 3곳', ids: ['bgs', 'sga', 'drw'], glyph: 'palace', ink: '#7A5AF0' },
    { id: 'th:jeju', name: '제주 한 바퀴', band: '제주 한 바퀴', ids: all.filter(p => p.sido === '제주' && p.sets.includes('ktop100')).map(p => p.id), glyph: 'sea', ink: '#F29A1F' },
    { id: 'th:busan', name: '부산 바다 3곳', band: '부산 바다', ids: ['hud', 'gaj', 'tjd'], glyph: 'sea', ink: '#2A86D6' },
    { id: 'th:top5mt', name: '최고봉 5곳', band: '최고봉 5', ids: ['m093', 'm077', 'm052', 'm024', 'm008'], glyph: 'mountain', ink: INK.먹, sub: '한라·지리·설악·덕유·계방' },
  ];
  THEME.forEach(t => { const d = t.ids.filter(visited).length; add({ ...t, group: '주제', sub: t.sub || `${d}/${t.ids.length}곳`, cur: d, max: t.ids.length }); });
  // 4) 행동·순간
  const vals = Object.values(st); const today = window.Store.kstToday();
  add({ id: 'first', group: '순간', name: '첫 발', band: '첫 발', sub: '첫 도장', glyph: 'foot', ink: '#C8372D', cur: vals.length ? 1 : 0, max: 1 });
  add({ id: 'dawn', group: '순간', name: '해돋이 도장', band: '해돋이', sub: '05~07시에 도장', glyph: 'sun', ink: '#F29A1F', cur: vals.some(s => s.dawn) ? 1 : 0, max: 1 });
  { const byDay = {}; vals.forEach(s => (s.days || [s.last]).forEach(d => byDay[d] = (byDay[d] || 0) + 1)); const best = Math.max(0, ...Object.values(byDay)); add({ id: 'march', group: '순간', name: '하루 5곳', band: '하루 5곳', sub: `최고 ${best}곳`, glyph: 'map', ink: '#2FA36B', cur: Math.min(best, 5), max: 5 }); }
  { const best = Math.max(0, ...vals.map(s => s.count)); add({ id: 'regular', group: '순간', name: '한 곳 5번', band: '한 곳 5번', sub: `최고 ${best}회`, glyph: 'repeat', ink: '#7A5AF0', cur: Math.min(best, 5), max: 5 }); }
  { const best = Math.max(0, ...vals.map(s => new Set((s.months || []).map(m => Math.floor(((typeof m === 'string' ? +m.slice(-2) : m) % 12) / 3))).size)); add({ id: 'seasons', group: '순간', name: '한 곳 사계절', band: '사계절', sub: '같은 곳을 네 계절에', glyph: 'tree', ink: '#2FA36B', cur: best, max: 4 }); }
  add({ id: 'photos', group: '행동', name: '사진 20장', band: '사진 20장', sub: `${ctx.photos || 0}장`, glyph: 'cam', ink: '#7A5AF0', cur: Math.min(ctx.photos || 0, 20), max: 20 });
  add({ id: 'guides', group: '행동', name: '동선 3개 공유', band: '동선 3개', sub: `${ctx.sharedGuides || 0}개 올림`, glyph: 'map', ink: '#F29A1F', cur: Math.min(ctx.sharedGuides || 0, 3), max: 3 });
  { const n = ctx.suggests || 0; const steps = [[1, '동'], [5, '은'], [10, '금']]; const t = tierOf(n, steps), nx = nextStep(n, steps); add({ id: 'suggest', group: '행동', name: `명소 발견 ${n >= 10 ? '10' : nx[0]}`, band: '발견자', sub: `제안한 곳 ${n}곳이 명소가 됨`, glyph: 'pin', ink: INK[t || '동'], cur: n, max: nx[0], tier: t, locked: !t, done: !!t }); }
  { const n = (ctx.myGuides || []).reduce((a, g) => a + (g.completions || 0), 0); add({ id: 'followers', group: '행동', name: '길동무 3명', band: '길동무', sub: `내 동선을 ${n}명이 완주`, glyph: 'people', ink: '#2A86D6', cur: Math.min(n, 3), max: 3 }); }
  return out.filter(b => !b.hide);
}
/* 받은 날짜 기록 + 새로 받은 것 골라내기 */
function award(list) { const got = LS.get('lm-badges', {}); const fresh = []; list.forEach(b => { const key = b.id + (b.tier ? ':' + b.tier : ''); if (b.done && !got[key]) { got[key] = new Date().toISOString(); fresh.push(b); } }); LS.set('lm-badges', got); return fresh; }
const earnedAt = b => LS.get('lm-badges', {})[b.id + (b.tier ? ':' + b.tier : '')];
/* SVG 템플릿 */
function svg(b, size) { size = size || 96; const locked = !b.done, col = locked ? '#B9BEC7' : b.ink, pct = b.max ? Math.min(1, b.cur / b.max) : 0;
  const arc = locked && pct > 0 ? `<circle cx="60" cy="60" r="55" fill="none" stroke="${b.ink}" stroke-width="5" stroke-dasharray="${2 * Math.PI * 55 * pct} ${2 * Math.PI * 55}" transform="rotate(-90 60 60)" stroke-linecap="round"/>` : '';
  return `<svg class="badge ${locked ? 'locked' : ''}" width="${size}" height="${size}" viewBox="0 0 120 120" role="img" aria-label="${b.name}${locked ? ' (미획득)' : ''}">
    <circle cx="60" cy="60" r="55" fill="${locked ? 'var(--line)' : 'var(--card)'}" stroke="${col}" stroke-width="${locked ? 2 : 4}" ${locked ? 'stroke-dasharray="4 4"' : ''}/>${arc}
    <circle cx="60" cy="60" r="46" fill="none" stroke="${col}" stroke-width="1.5" ${locked ? 'stroke-dasharray="3 3"' : ''}/>
    <g transform="translate(60,48) scale(1.8) translate(-12,-12)" fill="none" stroke="${col}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${GLYPH[b.glyph] || GLYPH.pin}</g>
    <path d="M18 74h84l-6 13H24z" fill="${col}"/><text x="60" y="84.5" text-anchor="middle" font-size="12.5" font-weight="700" fill="#fff" font-family="IBM Plex Sans KR,sans-serif">${b.band}</text>
    ${b.sub ? `<text x="60" y="102" text-anchor="middle" font-size="10" fill="${col}" font-family="IBM Plex Sans KR,sans-serif">${b.sub}</text>` : ''}</svg>`; }
return { evaluate, award, earnedAt, svg, INK };
})();
