/* 저장소: 로컬(기기) 모드와 Supabase 모드를 같은 인터페이스로 제공 */
(() => {
const cfg = window.APP_CONFIG || {};
const kstDate = iso => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10); /* UTC 시각 → 한국 날짜 */
const kstToday = () => kstDate(Date.now());
const dist = (a, b) => { const R = 6371000, t = Math.PI / 180, dLat = (b.lat - a.lat) * t, dLng = (b.lng - a.lng) * t; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const byId = id => window.LANDMARKS.find(p => p.id === id);
const serverErr = e => { try { console.warn('[store]', e && (e.message || e)); } catch (x) {} return '저장 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요'; };
/* 찍을 수 있는 상태인지만 본다. 아무것도 기록하지 않는다 */
function checkStamp(stamps, placeId, pos) {
  const p = byId(placeId); if (!p) return { ok: false, reason: '없는 랜드마크예요' };
  if (!pos) return { ok: false, reason: '내 위치를 켜 주세요' };
  const s = stamps[placeId];
  if (s && s.last === kstToday()) return { ok: false, reason: '오늘 이미 찍었어요', already: true };
  if (cfg.testMode) return { ok: true };
  if (!pos.at || Date.now() - pos.at > 120000) return { ok: false, reason: '내 위치를 다시 확인하고 있어요. 잠시 후 다시 눌러 주세요' }; /* 예전에 저장된 위치로는 못 찍는다 */
  const d = dist(pos, p), acc = Math.min(pos.accuracy || 0, cfg.maxAccuracy);
  if (d - acc > p.r) return { ok: false, reason: `인증 반경 밖이에요 (${Math.round(d)}m)` };
  if (pos.accuracy && pos.accuracy > cfg.maxAccuracy) return { ok: false, reason: 'GPS 신호가 약해요. 하늘이 보이는 곳에서 다시 시도해 주세요' };
  return { ok: true };
}

/* ---------- IndexedDB (로컬 사진) ---------- */
const idb = {
  db: null,
  open() { return new Promise((res, rej) => { if (this.db) return res(this.db); const r = indexedDB.open('landmark-stamp', 2); r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'id' }); if (!d.objectStoreNames.contains('tripphotos')) d.createObjectStore('tripphotos', { keyPath: 'id' }); }; r.onsuccess = () => { this.db = r.result; this.db.onversionchange = () => { try { this.db.close(); } catch (e) {} this.db = null; }; res(this.db); }; r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked')); /* 다른 탭이 옛 버전을 잡고 있으면 사진 없이 계속 간다 */ }); },
  async all() { try { const d = await this.open(); return await new Promise((res, rej) => { const q = d.transaction('photos').objectStore('photos').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch (e) { return []; } },
  async put(p) { const d = await this.open(); return new Promise((res, rej) => { const q = d.transaction('photos', 'readwrite').objectStore('photos').put(p); q.onsuccess = () => res(); q.onerror = () => rej(q.error); }); },
  async allTrip() { try { const d = await this.open(); return await new Promise((res, rej) => { const q = d.transaction('tripphotos').objectStore('tripphotos').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch (e) { return []; } },
  async putTrip(p) { const d = await this.open(); return new Promise((res, rej) => { const q = d.transaction('tripphotos', 'readwrite').objectStore('tripphotos').put(p); q.onsuccess = () => res(); q.onerror = () => rej(q.error); }); },
  async delTrip(id) { const d = await this.open(); return new Promise((res, rej) => { const q = d.transaction('tripphotos', 'readwrite').objectStore('tripphotos').delete(id); q.onsuccess = () => res(); q.onerror = () => rej(q.error); }); },
};
/* 여행 기록용 사진: 랜드마크 사진첩과 별개. 기기에만 저장 */
const TripPhotos = { list: [], async init() { this.list = await idb.allTrip(); },
  /* 어느 여행(휴지통 포함)에도 안 붙은 사진은 지운다 (편집기에서 넣고 저장 안 한 것 등) */
  async gc() { const used = new Set(); [...Trips.all(), ...Trips.trash()].forEach(t => Object.values(t.photos || {}).forEach(refs => (refs || []).forEach(r => { if (r.src === 'tp') used.add(r.id); }))); const dead = this.list.filter(p => !used.has(p.id)); for (const p of dead) { try { await this.remove(p.id); } catch (e) {} } return dead.length; },
  async add(tripId, placeId, url) { const p = { id: 'tp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), tripId, placeId, url, createdAt: new Date().toISOString() }; await idb.putTrip(p); this.list.push(p); return p; },
  async remove(id) { await idb.delTrip(id); this.list = this.list.filter(p => p.id !== id); },
  byId(id) { return this.list.find(p => p.id === id); } };

/* 신고·차단 (앱스토어 1.2 / 플레이 UGC): 차단한 사람의 사진·가이드·댓글은 내 화면에서 사라진다 */
const Safety = {
  blocked() { return new Set(LS.get('lm-blocked', [])); },
  block(userId) { const b = this.blocked(); b.add(userId); LS.set('lm-blocked', [...b]); },
  unblock(userId) { const b = this.blocked(); b.delete(userId); LS.set('lm-blocked', [...b]); },
  isBlocked(userId) { return !!userId && this.blocked().has(userId); },
  async report(kind, id, reason, extra) { const r = { kind, id, reason, ...(extra || {}), at: new Date().toISOString() }; const l = LS.get('lm-reports', []); l.push(r); LS.set('lm-reports', l);
    if (remote.sb) { const { error } = await remote.sb.from('reports').insert({ kind, target_id: id, reason, reporter: remote.session?.user?.id || null, extra: extra || null }); if (error) throw new Error('신고를 보내지 못했어요. 잠시 뒤 다시 시도해 주세요'); } return l.length; },
  reported(kind, id) { return LS.get('lm-reports', []).some(r => r.kind === kind && r.id === id); },
  /* 욕설·비하 표현 거르기 (올릴 때). 목록은 짧게 시작하고 서버에서 늘린다 */
  BAD: ['시발', '씨발', '병신', '좆', '개새끼', '새끼', '니미', '엿먹', '지랄', '꺼져', 'fuck', 'shit'],
  clean(text) { const t = String(text || ''); return this.BAD.some(w => t.toLowerCase().includes(w)) ? null : t; },
};
/* 계정·기록 전부 삭제 (앱스토어 5.1.1 / 플레이 계정 삭제 정책) */
async function wipeAll() {
  if (remote.sb && remote.session) { const { error } = await remote.sb.rpc('delete_my_account'); if (error) throw new Error('서버 기록을 지우지 못했어요. 인터넷을 확인하고 다시 시도해 주세요'); await remote.sb.auth.signOut().catch(() => {}); } /* 서버부터, 실패하면 아무것도 안 지운다 */
  try { Object.keys(localStorage).filter(k => k.startsWith('lm-')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
  try { if (window.Memory) await window.Memory.wipe(); } catch (e) {}
  try { if (idb.db) { idb.db.close(); idb.db = null; } await new Promise(res => { const r = indexedDB.deleteDatabase('landmark-stamp'); r.onsuccess = r.onerror = r.onblocked = () => res(); }); } catch (e) {}
}
/* ---------- 로컬 모드 ---------- */
const LS = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const local = {
  mode: 'local',
  async init() { this.user = LS.get('lm-user', null); this.stamps = LS.get('lm-stamps', {}); this.likes = new Set(LS.get('lm-likes', [])); this.photos = await idb.all(); return this; },
  getUser() { return this.user; },
  async signIn(nickname) { this.user = { id: 'local-' + Math.random().toString(36).slice(2, 8), nickname: nickname || '여행자' }; LS.set('lm-user', this.user); return this.user; },
  async signOut() { this.user = null; LS.set('lm-user', null); },
  stampsOf(placeId) { return this.stamps[placeId] || null; },
  allStamps() { return this.stamps; },
  check(placeId, pos) { return checkStamp(this.stamps, placeId, pos); },
  async stamp(placeId, pos) {
    const p = byId(placeId); if (!p) return { ok: false, reason: '없는 랜드마크예요' };
    const d = dist(pos, p), acc = Math.min(pos.accuracy || 0, cfg.maxAccuracy); // GPS 오차만큼 봐준다 (거리 − 오차 ≤ 반경)
    if (!cfg.testMode && d - acc > p.r) return { ok: false, reason: `인증 반경 밖이에요 (${Math.round(d)}m)` };
    if (!cfg.testMode && pos.accuracy && pos.accuracy > cfg.maxAccuracy * 2) return { ok: false, reason: 'GPS 신호가 약해요. 하늘이 보이는 곳에서 다시 시도해 주세요' };
    const t = kstToday(), s = this.stamps[placeId] || { count: 0, first: t, last: null };
    if (s.last === t) return { ok: false, reason: '오늘 이미 찍었어요', already: true };
    s.count++; s.last = t; const kh = new Date(Date.now() + 9 * 3600e3).getUTCHours(); if (kh >= 5 && kh < 7) s.dawn = true; s.days = [...new Set([...(s.days || []), t])]; s.months = [...new Set([...(s.months || []), +t.slice(5, 7)])]; // 뱃지용 기록
    this.stamps[placeId] = s; LS.set('lm-stamps', this.stamps);
    return { ok: true, visitNo: s.count, stamp: s };
  },
  /* 오늘 찍은 도장 취소 (실수로 찍었을 때) */
  async unstamp(placeId) { const s = this.stamps[placeId]; if (!s) return { ok: false, reason: '취소할 도장이 없어요' }; const t = s.last; /* 가장 최근 방문 하나를 지운다 */
    s.count = Math.max(0, s.count - 1); s.days = (s.days || [s.first, s.last]).filter(d => d && d !== t); if (!s.count || !s.days.length) delete this.stamps[placeId]; else { s.last = s.days.slice().sort().at(-1); s.months = [...new Set(s.days.map(d => +d.slice(5, 7)))]; }
    LS.set('lm-stamps', this.stamps); return { ok: true }; },
  photosOf(placeId) { const bl = Safety.blocked(); return this.photos.filter(x => x.placeId === placeId && !bl.has(x.userId)).sort((a, b) => b.likes - a.likes || b.createdAt.localeCompare(a.createdAt)); },
  coverOf(placeId) { const ph = this.photosOf(placeId)[0]; return ph && ph.likes >= 0 ? ph : null; },
  async addPhoto(placeId, dataUrl, pos) {
    if (!this.user) return { ok: false, reason: '로그인이 필요해요' };
    if (!this.stamps[placeId]) return { ok: false, reason: '도장을 찍은 곳에만 사진을 올릴 수 있어요' };
    const t = kstToday(), todayCount = this.photos.filter(x => x.placeId === placeId && x.userId === this.user.id && kstDate(x.createdAt) === t).length;
    if (todayCount >= cfg.photosPerDay) return { ok: false, reason: `하루에 ${cfg.photosPerDay}장까지 올릴 수 있어요` };
    const ph = { id: 'ph-' + Date.now(), placeId, userId: this.user.id, nickname: this.user.nickname, url: dataUrl, likes: 0, createdAt: new Date().toISOString() };
    await idb.put(ph); this.photos.push(ph); return { ok: true, photo: ph };
  },
  liked(photoId) { return this.likes.has(photoId); },
  async toggleLike(photoId) {
    const ph = this.photos.find(x => x.id === photoId); if (!ph) return;
    if (this.likes.has(photoId)) { this.likes.delete(photoId); ph.likes = Math.max(0, ph.likes - 1); } else { this.likes.add(photoId); ph.likes++; }
    LS.set('lm-likes', [...this.likes]); await idb.put(ph); return ph.likes;
  },
};

/* ---------- Supabase 모드 ---------- */
const remote = {
  mode: 'supabase',
  async init() {
    this.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const { data } = await this.sb.auth.getSession(); this.session = data.session || null;
    this.sb.auth.onAuthStateChange((_e, s) => { this.session = s; document.dispatchEvent(new CustomEvent('auth')); });
    this.stamps = {}; this.photos = []; this.likes = new Set();
    await this.refresh(); return this;
  },
  async refresh() {
    if (this.session) {
      const { data: st } = await this.sb.from('stamps').select('place_id,visit_no,stamped_at').eq('user_id', this.session.user.id);
      this.stamps = {}; (st || []).forEach(r => { const d = kstDate(r.stamped_at); const s = this.stamps[r.place_id] || { count: 0, first: d, last: null, days: [], months: [] }; s.count = Math.max(s.count, r.visit_no); if (d < s.first) s.first = d; if (!s.last || d > s.last) s.last = d; if (!s.days.includes(d)) s.days.push(d); const m = +d.slice(5, 7); if (!s.months.includes(m)) s.months.push(m); const kh = new Date(new Date(r.stamped_at).getTime() + 9 * 3600e3).getUTCHours(); if (kh >= 5 && kh < 7) s.dawn = true; this.stamps[r.place_id] = s; });
      const { data: lk } = await this.sb.from('likes').select('photo_id').eq('user_id', this.session.user.id); this.likes = new Set((lk || []).map(r => r.photo_id));
    }
    const { data: ph } = await this.sb.from('photos').select('id,place_id,user_id,nickname,url,lat,lng,like_count,created_at').order('like_count', { ascending: false }).limit(2000);
    this.photos = (ph || []).map(r => ({ id: r.id, placeId: r.place_id, userId: r.user_id, nickname: r.nickname, url: r.url, lat: r.lat, lng: r.lng, likes: r.like_count, createdAt: r.created_at }));
  },
  getUser() { const u = this.session?.user; return u ? { id: u.id, nickname: u.user_metadata?.name || u.user_metadata?.full_name || u.email?.split('@')[0] || '여행자' } : null; },
  async signIn(provider) { const { error } = await this.sb.auth.signInWithOAuth({ provider: provider || 'kakao', options: { redirectTo: location.origin + location.pathname } }); if (error) throw error; },
  async signOut() { await this.sb.auth.signOut(); this.stamps = {}; this.likes = new Set(); },
  stampsOf(id) { return this.stamps[id] || null; },
  allStamps() { return this.stamps; },
  check(placeId, pos) { if (!this.session) return { ok: false, reason: '로그인이 필요해요', needLogin: true }; return checkStamp(this.stamps, placeId, pos); },
  async stamp(placeId, pos) {
    if (!this.session) return { ok: false, reason: '로그인이 필요해요', needLogin: true };
    const { data, error } = await this.sb.rpc('stamp', { p_place_id: placeId, p_lat: pos.lat, p_lng: pos.lng, p_accuracy: pos.accuracy || null });
    if (error) return { ok: false, reason: serverErr(error) };
    if (!data.ok) return { ok: false, reason: data.reason || '도장을 찍지 못했어요', already: data.code === 'already' };
    const t = kstToday(), s = this.stamps[placeId] || { count: 0, first: t, last: null }; s.count = data.visit_no; s.last = t;
    const kh = new Date(Date.now() + 9 * 3600e3).getUTCHours(); if (kh >= 5 && kh < 7) s.dawn = true; s.days = [...new Set([...(s.days || []), t])]; s.months = [...new Set([...(s.months || []), +t.slice(5, 7)])];
    this.stamps[placeId] = s;
    return { ok: true, visitNo: data.visit_no, stamp: s };
  },
  async unstamp(placeId) { if (!this.session) return { ok: false, reason: '로그인이 필요해요' }; const s = this.stamps[placeId]; if (!s) return { ok: false, reason: '취소할 도장이 없어요' }; const t = s.last; const from = new Date(new Date(t + 'T00:00:00Z').getTime() - 9 * 3600e3).toISOString(); const { error } = await this.sb.from('stamps').delete().eq('user_id', this.session.user.id).eq('place_id', placeId).gte('stamped_at', from); if (error) return { ok: false, reason: serverErr(error) }; await this.refresh(); return { ok: true }; },
  photosOf(placeId) { const bl = Safety.blocked(); return this.photos.filter(x => x.placeId === placeId && !bl.has(x.userId)).sort((a, b) => b.likes - a.likes || b.createdAt.localeCompare(a.createdAt)); },
  coverOf(placeId) { const ph = this.photosOf(placeId)[0]; return ph && ph.likes >= 5 ? ph : null; },
  async addPhoto(placeId, dataUrl, pos) {
    if (!this.session) return { ok: false, reason: '로그인이 필요해요', needLogin: true };
    if (!this.stamps[placeId]) return { ok: false, reason: '도장을 찍은 곳에만 사진을 올릴 수 있어요' };
    const blob = await (await fetch(dataUrl)).blob(), path = `${this.session.user.id}/${placeId}/${Date.now()}.jpg`;
    const up = await this.sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' }); if (up.error) return { ok: false, reason: serverErr(up.error) };
    const url = this.sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
    const { data, error } = await this.sb.from('photos').insert({ place_id: placeId, user_id: this.session.user.id, nickname: this.getUser().nickname, url }).select().single();
    if (error) return { ok: false, reason: serverErr(error) };
    const ph = { id: data.id, placeId, userId: data.user_id, nickname: data.nickname, url, lat: data.lat, lng: data.lng, likes: 0, createdAt: data.created_at }; this.photos.push(ph); return { ok: true, photo: ph };
  },
  liked(id) { return this.likes.has(id); },
  async toggleLike(photoId) {
    if (!this.session) return null;
    const { data, error } = await this.sb.rpc('toggle_like', { p_photo_id: photoId }); if (error) return null;
    const ph = this.photos.find(x => x.id === photoId); if (ph) ph.likes = data.like_count; if (data.liked) this.likes.add(photoId); else this.likes.delete(photoId); return data.like_count;
  },
};

/* 여행·계획: 내가 만든 묶음. 개인 설정이라 기기에 저장 (서버 모드에서도 우선 로컬) */
const Trips = { all() { const l = LS.get('lm-trips', null); if (l) return l; const old = LS.get('lm-albums', []); return old.map(a => ({ ...a, kind: 'trip' })); }, save(l) { LS.set('lm-trips', l); },
  add(name, ids, kind, extra) { const l = this.all(); let id; do { id = 't-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); } while (l.some(x => x.id === id)); /* 같은 밀리초에 여러 개 만들어도 겹치지 않게 */
    const t = { id, name, ids, kind: kind || 'trip', createdAt: new Date().toISOString(), ...(extra || {}) }; l.push(t); this.save(l); return t; },
  update(id, patch) { const l = this.all(); const t = l.find(x => x.id === id); if (t) Object.assign(t, patch); this.save(l); return t; },
  /* 예전 판에서 만들어진 중복 id 를 한 번 정리한다 */
  fixIds() { const l = this.all(); const seen = new Set(); let changed = false; l.forEach(t => { if (!t.id || seen.has(t.id)) { t.id = 't-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); changed = true; } seen.add(t.id); }); if (changed) this.save(l); },
  /* 삭제는 휴지통으로 (30일 보관, 되돌리기 가능) */
  trash() { const cut = Date.now() - 30 * 86400e3; const all = LS.get('lm-trips-trash', []); const l = all.filter(t => new Date(t.deletedAt).getTime() > cut); if (l.length !== all.length) LS.set('lm-trips-trash', l); return l; },
  remove(id) { const l = this.all(); const i = l.findIndex(a => a.id === id); if (i < 0) return null; const t = l[i]; l.splice(i, 1); this.save(l); /* 하나만 지운다 */ const tr = this.trash(); tr.unshift({ ...t, deletedAt: new Date().toISOString() }); LS.set('lm-trips-trash', tr); return t; },
  restore(id) { const tr = this.trash(); const t = tr.find(a => a.id === id); if (!t) return null; LS.set('lm-trips-trash', tr.filter(a => a.id !== id)); const { deletedAt, ...rest } = t; const l = this.all(); l.push(rest); this.save(l); return rest; } };
window.Store = { kstToday, kstDate, dist, byId, Trips, TripPhotos, Safety, wipeAll, async create() { const useRemote = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase; await TripPhotos.init(); return (useRemote ? remote : local).init(); } };
})();
