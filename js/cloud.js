/* 서버(Supabase) 연결 1단계: 받은 편지함.
   명소 제안·수정 제안·문의·신고를 서버로 보낸다. 로그인 없이도 보낼 수 있고(기기마다 임의 번호),
   인터넷이 안 되면 폰에 모아 뒀다가 다음에 열 때 다시 보낸다. 읽는 것은 운영자만 할 수 있다. */
(() => {
  const cfg = window.APP_CONFIG || {}; const url = cfg.cloudUrl, key = cfg.cloudKey; const on = !!(url && key);
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const device = () => { let d = get('lm-device', null); if (!d) { d = 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12); set('lm-device', d); } return d; };
  const TABLES = ['suggestions', 'fixes', 'feedback', 'reports'];
  async function post(table, row) {
    if (typeof sbRef === 'function' && sbRef() && uidRef()) { const { error } = await sbRef().from(table).insert({ ...row, user_id: uidRef() }); if (error) { const e = new Error('cloud ' + error.code); e.status = /^(PGRST|2|4)/.test(String(error.code || '')) ? 400 : 500; throw e; } return; } /* 로그인돼 있으면 내 계정 이름으로 */
    const r = await fetch(`${url}/rest/v1/${table}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    if (!r.ok) { const e = new Error('cloud ' + r.status); e.status = r.status; throw e; }
  }
  let sbRef = null, uidRef = () => null;
  let flushing = false;
  async function flush() { if (!on || flushing) return; flushing = true; try {
    let box = get('lm-outbox', []);
    while (box.length) { const it = box[0]; try { await post(it.table, it.row); } catch (e) { if (!e.status || e.status >= 500 || e.status === 429) break; /* 인터넷·서버 문제: 다음에 다시 */ } /* 4xx: 고쳐질 수 없는 내용이라 버린다 */
      box = get('lm-outbox', []).slice(1); set('lm-outbox', box); }
  } finally { flushing = false; } }
  /* 보내기: 일단 폰에 적어 두고 바로 전송을 시도한다. 실패해도 기록은 남아 다음에 간다 */
  function send(table, row) { if (!on || !TABLES.includes(table)) return false; const box = get('lm-outbox', []); if (box.length > 200) box.shift(); box.push({ table, row: { device: device(), ...row } }); set('lm-outbox', box); flush(); return true; }

  /* ───── 2단계: 구글 로그인 + 도장 백업 ─────
     앱은 지금처럼 폰에 먼저 저장한다(로그인 없이도 다 된다). 로그인하면 도장을 서버에도 올리고,
     다른 폰에서 로그인하면 내려받아 합친다. 지우는 것은 '취소'를 누른 것만 지운다. */
  const CapN = window.Capacitor, NATIVE = !!(CapN && CapN.isNativePlatform && CapN.isNativePlatform()), NP = NATIVE ? CapN.Plugins : {}, APP_URL = 'com.weekend.landmark://auth';
  const sb = on && window.supabase ? window.supabase.createClient(url, key, NATIVE ? { auth: { detectSessionInUrl: false } } : undefined) : null;
  /* 앱: 로그인하고 돌아온 주소에서 로그인 정보를 받는다 */
  const onAppUrl = async ev => { const u = String(ev && ev.url || ''); if (!u.startsWith(APP_URL) || onAppUrl.last === u) return; onAppUrl.last = u; try { NP.Browser && await NP.Browser.close(); } catch (e) {}
    try { const q = new URL(u.replace('com.weekend.landmark://', 'https://app.local/')), h = new URLSearchParams(q.hash.slice(1)), code = q.searchParams.get('code');
      if (code) await sb.auth.exchangeCodeForSession(code); else if (h.get('access_token')) await sb.auth.setSession({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token') });
      else document.dispatchEvent(new CustomEvent('cloud-login-failed', { detail: q.searchParams.get('error_description') || h.get('error_description') || '' })); } catch (e) { document.dispatchEvent(new CustomEvent('cloud-login-failed', { detail: String(e && e.message || e) })); } };
  /* 로그인하는 사이 앱이 꺼졌다가 그 주소로 다시 켜진 경우도 받는다 */
  if (sb && NATIVE && NP.App) { NP.App.addListener('appUrlOpen', onAppUrl); try { NP.App.getLaunchUrl().then(r => { if (r && r.url) onAppUrl(r); }).catch(() => {}); } catch (e) {} } let session = null, storeRef = null, syncing = false;
  const uid = () => session && session.user ? session.user.id : null;
  sbRef = () => sb; uidRef = uid;
  const q = () => get('lm-syncq', []); const qPush = op => { const l = q(); l.push(op); set('lm-syncq', l.slice(-500)); };
  /* 폰의 도장을 서버 줄 모양으로 */
  function localRows() { const rows = [], u = uid(), st = get('lm-stamps', {});
    Object.entries(st).forEach(([pid, s]) => (s.days && s.days.length ? s.days : [s.first, s.last]).filter(Boolean).forEach(d => rows.push({ user_id: u, place_id: pid, day: d, kind: 'gps' })));
    const mem = window.Memory ? window.Memory.places() : {}; Object.entries(mem).forEach(([pid, m]) => (m.days || []).forEach(d => rows.push({ user_id: u, place_id: pid, day: d, kind: 'photo' })));
    Object.entries(get('lm-pstamps', {})).forEach(([pid, m]) => (m.days || []).forEach(d => rows.push({ user_id: u, place_id: pid, day: d, kind: 'photo' })));
    const seen = new Set(); return rows.filter(r => { const k = `${r.place_id}|${r.day}|${r.kind}`; if (seen.has(k)) return false; seen.add(k); return true; }); }
  /* 서버 도장을 폰 기록에 합친다 (없는 날만 더한다) */
  function mergeDown(rows) { const st = storeRef && storeRef.stamps ? storeRef.stamps : get('lm-stamps', {}); const ps = get('lm-pstamps', {}); let changed = false;
    const mem = window.Memory ? window.Memory.places() : {};
    rows.forEach(r => { const d = r.day;
      if (r.kind === 'gps') { const s = st[r.place_id] || (st[r.place_id] = { count: 0, first: d, last: null, days: [], months: [] }); s.days = s.days || [s.first, s.last].filter(Boolean); if (s.days.includes(d)) return;
        s.days.push(d); s.days.sort(); s.count = Math.max((s.count || 0) + 1, s.days.length); s.first = s.days[0]; s.last = s.days[s.days.length - 1]; s.months = [...new Set(s.days.map(x => +x.slice(5, 7)))]; changed = true; }
      else { if (mem[r.place_id] && (mem[r.place_id].days || []).includes(d)) return; const m = ps[r.place_id] || (ps[r.place_id] = { days: [] }); if (m.days.includes(d)) return; m.days.push(d); m.days.sort(); m.first = m.days[0]; m.last = m.days[m.days.length - 1]; m.count = m.days.length; changed = true; } });
    if (changed) { set('lm-stamps', st); set('lm-pstamps', ps); } return changed; }
  /* 계정 상태: 이용 정지됐는지, 탈퇴 처리 중인지. 둘 중 하나면 서버와 맞추지 않는다 */
  let status = null, statusAt = 0;
  async function checkStatus() { if (!sb || !uid()) { status = null; return null; } try { const { data, error } = await sb.rpc('my_status'); if (!error) { status = data || {}; statusAt = Date.now(); document.dispatchEvent(new CustomEvent('cloud-status', { detail: status })); } } catch (e) {} return status; }
  const held = () => !!(status && (status.blocked || status.deleting));
  async function go() { if (!uid()) return; await checkStatus(); if (held()) return; await sync(); if (!status || !status.banned) await pushMine(); /* 올리기 정지 중에는 올리지 않는다(폰에는 남아 있다가 풀리면 올라간다) */ }
  async function sync() { if (!sb || !uid() || syncing || held()) return false; syncing = true; let changed = false; try {
    /* 1) 밀린 취소부터 보낸다 2) 폰 → 서버 3) 서버 → 폰 */
    let ops = q(); while (ops.length) { const op = ops[0]; if (op.op === 'del') { const { error } = await sb.from('stamps').delete().eq('user_id', uid()).eq('place_id', op.place_id).eq('day', op.day).eq('kind', 'gps'); if (error) throw error; } ops = q().slice(1); set('lm-syncq', ops); }
    const rows = localRows(); for (let i = 0; i < rows.length; i += 400) { const { error } = await sb.from('stamps').upsert(rows.slice(i, i + 400), { onConflict: 'user_id,place_id,day,kind', ignoreDuplicates: true }); if (error) throw error; }
    const { data, error } = await sb.from('stamps').select('place_id,day,kind').eq('user_id', uid()).limit(20000); if (error) throw error;
    changed = mergeDown(data || []); set('lm-synced-at', new Date().toISOString());
    { const u = get('lm-user', null); if (u && u.nickname) await sb.from('profiles').update({ nickname: String(u.nickname).slice(0, 20) }).eq('id', uid());
      else if (storeRef && storeRef.signIn && !storeRef.user) { /* 새 폰·다시 설치: 서버에 있던 이름을 그대로 쓴다 (기본 이름이면 첫 도장 때 새로 짓는다) */
        const { data } = await sb.from('profiles').select('nickname').eq('id', uid()).maybeSingle(); if (data && data.nickname && data.nickname !== '여행자') { await storeRef.signIn(data.nickname); changed = true; } } }
  } catch (e) { console.warn('[cloud] sync', e && e.message); } finally { syncing = false; }
    if (changed) document.dispatchEvent(new CustomEvent('cloud-sync')); return changed; }
  /* ───── 3단계: 명소 사진·가이드 함께 보기 ─────
     사진·가이드는 폰에 먼저 저장하고, 로그인돼 있으면 서버에도 올린다(로그인 전 것은 로그인할 때 올라간다).
     다른 사람이 올린 것은 로그인 없이도 볼 수 있다. 추천은 로그인해야 서버에 반영된다. */
  let rphotos = [], rguides = [], pLikes = new Set(), gLikes = new Set();
  const mapPhoto = r => ({ id: 'r' + r.id, rid: r.id, remote: true, placeId: r.place_id, userId: r.user_id, nickname: r.nickname || '여행자', url: r.url, likes: r.like_count, createdAt: r.created_at, rpath: r.path });
  const mapGuide = r => ({ ...(r.data || {}), id: r.id, remote: true, userId: r.user_id, author: r.nickname || '여행자', title: r.title, likes: r.like_count, completions: (r.data && r.data.completions) || r.completions || 0, ratings: (r.data && r.data.ratings) || [], createdAt: r.created_at, mine: r.user_id === uid() });
  async function pull() { if (!sb) return; try {
    const [ph, gd] = await Promise.all([
      sb.from('photos').select('id,place_id,user_id,nickname,url,path,like_count,created_at').order('like_count', { ascending: false }).order('created_at', { ascending: false }).limit(3000),
      sb.from('guides').select('id,user_id,nickname,title,data,like_count,completions,created_at').order('like_count', { ascending: false }).limit(1000)]);
    if (!ph.error) rphotos = (ph.data || []).map(mapPhoto); if (!gd.error) rguides = (gd.data || []).map(mapGuide);
    if (!ph.error && uid() && storeRef && storeRef.dropRemoved && (ph.data || []).length < 3000) { try { await storeRef.dropRemoved(new Set(rphotos.map(x => x.rid))); } catch (e) {} }
    if (uid()) { const [a, b] = await Promise.all([sb.from('photo_likes').select('photo_id').eq('user_id', uid()), sb.from('guide_likes').select('guide_id').eq('user_id', uid())]);
      if (!a.error) pLikes = new Set((a.data || []).map(x => x.photo_id)); if (!b.error) gLikes = new Set((b.data || []).map(x => x.guide_id)); } else { pLikes = new Set(); gLikes = new Set(); }
    document.dispatchEvent(new CustomEvent('cloud-data'));
  } catch (e) { console.warn('[cloud] pull', e && e.message); } }
  /* 올리기 전에 한 번 더 줄인다 (긴 변 1280, 300KB 안팎) */
  async function shrink(dataUrl) { const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; }); const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    let q = 0.8, b = await new Promise(r => c.toBlob(r, 'image/jpeg', q)); while (b && b.size > 900000 && q > 0.4) { q -= 0.15; b = await new Promise(r => c.toBlob(r, 'image/jpeg', q)); } return b; }
  async function uploadPhoto(ph) { if (status && (status.banned || status.blocked || status.deleting)) return false; if (!sb || !uid() || ph.rid || !ph.url || !/^data:/.test(ph.url)) return false;
    const blob = await shrink(ph.url); if (!blob) return false; const path = `${uid()}/${ph.placeId}/${Date.now()}.jpg`;
    const up = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' }); if (up.error) throw up.error;
    const pub = sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
    const { data, error } = await sb.from('photos').insert({ place_id: ph.placeId, user_id: uid(), nickname: String(ph.nickname || '여행자').slice(0, 20), path, url: pub, created_at: ph.createdAt }).select('id,place_id,user_id,nickname,url,path,like_count,created_at').single();
    if (error) { try { await sb.storage.from('photos').remove([path]); } catch (e) {} if (error.code === '23505') { ph.rid = -1; if (storeRef && storeRef.savePhoto) await storeRef.savePhoto(ph); return false; } /* 그날 그 명소에는 이미 올렸다 */ throw error; }
    ph.rid = data.id; ph.rpath = path; if (storeRef && storeRef.savePhoto) await storeRef.savePhoto(ph); rphotos.unshift(mapPhoto(data)); return true; }
  const guideId = g => g.rid || `${uid().slice(0, 8)}-${g.id}`;
  async function saveGuide(g) { if (!sb || !uid()) return false; const rid = guideId(g); const { id, mine, rid: _r, needSync, likes, userId, author, ...data } = g;
    const { error } = await sb.rpc('save_guide', { p_id: rid, p_title: String(g.title || '가이드').slice(0, 60), p_data: data, p_nickname: String(g.author || '여행자').slice(0, 20) }); if (error) throw error; return rid; }
  /* 로그인 전에 만든 사진·가이드를 올린다 */
  async function pushMine() { if (!sb || !uid()) return; let did = false;
    try { const mine = (storeRef && storeRef.photos) || []; for (const ph of mine) { if (!ph.rid && /^data:/.test(ph.url || '')) { try { if (await uploadPhoto(ph)) did = true; } catch (e) { console.warn('[cloud] photo', e && e.message); break; } } } } catch (e) {}
    try { const gl = get('lm-guides', []); let ch = false; for (const g of gl) { if (!g.rid || g.needSync) { try { g.rid = await saveGuide(g) || g.rid; delete g.needSync; ch = true; } catch (e) { console.warn('[cloud] guide', e && e.message); break; } } } if (ch) { set('lm-guides', gl); did = true; } } catch (e) {}
    if (did) await pull(); }
  const content = {
    photosOf: placeId => rphotos.filter(x => x.placeId === placeId),
    photoLiked: id => pLikes.has(+String(id).replace(/^r/, '')),
    async likePhoto(id) { const rid = +String(id).replace(/^r/, ''); if (!uid()) return null; const { data, error } = await sb.rpc('toggle_photo_like', { p_photo_id: rid }); if (error) return null; const ph = rphotos.find(x => x.rid === rid); if (ph) ph.likes = data.like_count; data.liked ? pLikes.add(rid) : pLikes.delete(rid); return data.like_count; },
    uploadPhoto: ph => uploadPhoto(ph).catch(e => { console.warn('[cloud] photo', e && e.message); return false; }),
    /* 내가 올린 사진 지우기: 서버 기록과 파일을 함께 지운다 */
    async removePhoto(rid) { if (!sb || !uid()) return false; const ph = rphotos.find(x => x.rid === rid); const { error } = await sb.from('photos').delete().eq('id', rid).eq('user_id', uid()); if (error) return false; if (ph && ph.rpath) { try { await sb.storage.from('photos').remove([ph.rpath]); } catch (e) {} } rphotos = rphotos.filter(x => x.rid !== rid); return true; },
    guides: () => rguides, guideLiked: id => gLikes.has(id),
    async likeGuide(id) { if (!uid()) return null; const { data, error } = await sb.rpc('toggle_guide_like', { p_guide_id: id }); if (error) return null; const g = rguides.find(x => x.id === id); if (g) g.likes = data.like_count; data.liked ? gLikes.add(id) : gLikes.delete(id); return data; },
    /* 가이드를 올리거나 고쳤을 때: 로그인돼 있으면 바로, 아니면 표시해 뒀다가 로그인할 때 */
    guideSaved(localId) { const gl = get('lm-guides', []); const g = gl.find(x => x.id === localId); if (!g) return; g.needSync = true; set('lm-guides', gl); if (uid()) pushMine(); },
    async guideRemoved(g) { if (!sb || !uid() || !g || !g.rid) return; try { await sb.from('guides').delete().eq('id', g.rid).eq('user_id', uid()); rguides = rguides.filter(x => x.id !== g.rid); document.dispatchEvent(new CustomEvent('cloud-data')); } catch (e) {} },
    pull,
    /* 내가 보낸 명소 제안이 어떻게 됐는지 */
    async mySuggestions() { if (!sb) return []; try { const { data, error } = await sb.rpc('my_suggestions', { p_device: device() }); return error ? [] : (data || []); } catch (e) { return []; } },
  };
  /* 하루에 한 번, '오늘 앱을 연 기기'로만 기록한다 (무엇을 했는지는 보내지 않는다) */
  async function ping() { if (!sb || !navigator.onLine) return; const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), key = day + (uid() ? '+' : '');
    if (get('lm-ping', '') === key) return; try { const { error } = await sb.rpc('ping', { p_device: device(), p_version: String(cfg.version || '') }); if (!error) set('lm-ping', key); } catch (e) {} }
  async function init(store) { storeRef = store; if (!sb) return; try { const { data } = await sb.auth.getSession(); session = data.session || null; } catch (e) {}
    sb.auth.onAuthStateChange((ev, s) => { const was = uid(); session = s; if (uid() !== was) { document.dispatchEvent(new CustomEvent('cloud-auth')); ping(); if (uid()) go(); else { status = null; pull(); } } });
    ping(); addEventListener('visibilitychange', () => { if (document.hidden) return; ping(); if (uid() && Date.now() - statusAt > 10 * 60000) checkStatus(); });
    pull().then(go); addEventListener('online', go); }
  const acct = {
    ready: !!sb, signedIn: () => !!uid(), email: () => (session && session.user && session.user.email) || '',
    /* 같은 이메일이면 여러 로그인 수단이 한 계정에 묶인다. 가장 최근에 쓴 수단을 돌려준다 */
    provider: () => { const u = session && session.user; if (!u) return ''; /* 방금 누른 로그인 수단이 가장 정확하다. 같은 메일로 묶인 계정은 서버가 알려 주는 '최근 수단'이 틀릴 때가 있다 */ const via = get('lm-via', ''); if (via && (via === 'email' || (u.identities || []).some(i => i.provider === via))) return via; const ids = (u.identities || []).slice().sort((a, b) => String(b.last_sign_in_at || '').localeCompare(String(a.last_sign_in_at || ''))); return (ids[0] && ids[0].provider) || (u.app_metadata && u.app_metadata.provider) || ''; },
    name: () => { const m = session && session.user && session.user.user_metadata; return (m && (m.name || m.full_name)) || ''; },
    /* 웹: 페이지째 다녀온다. 앱: 구글이 앱 안 화면(웹뷰) 로그인을 막으므로 바깥 브라우저 창으로 다녀오고 com.weekend.landmark://auth 로 돌아온다 */
    /* 이메일·비밀번호 로그인. 가입 화면은 없다: 운영자가 서버에서 만든 계정(스토어 심사용)만 쓴다 */
    signInEmail: (email, password) => { set('lm-via', 'email'); return sb.auth.signInWithPassword({ email, password }); },
    async signIn(provider) { provider = provider || 'google'; set('lm-via', provider); if (!NATIVE) return sb.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + location.pathname } });
      const { data, error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: APP_URL, skipBrowserRedirect: true } }); if (error) throw error; await NP.Browser.open({ url: data.url }); },
    async signOut() { try { await sb.auth.signOut({ scope: 'local' }); /* 이 기기만 로그아웃. 다른 폰의 로그인은 그대로 둔다 */ } catch (e) {} session = null; document.dispatchEvent(new CustomEvent('cloud-auth')); },
    /* 도장을 찍거나 취소했을 때 앱이 알려 준다 */
    stamped() { sync(); }, unstamped(place_id, day) { if (!sb) return; qPush({ op: 'del', place_id, day }); sync(); },
    status: () => status, checkStatus,
    async cancelDelete() { const { error } = await sb.rpc('cancel_delete'); if (error) return false; await go(); return true; },
    /* 탈퇴: 올린 사진·가이드는 바로 지우고, 계정과 도장 기록은 서버가 7일 보관한 뒤 지운다 */
    async deleteAccount() { if (!uid()) return; try { const { data } = await sb.from('photos').select('path').eq('user_id', uid()).limit(5000); const paths = (data || []).map(x => x.path).filter(Boolean); for (let i = 0; i < paths.length; i += 100) await sb.storage.from('photos').remove(paths.slice(i, i + 100)); } catch (e) {} /* 사진 파일부터 지운다 */
      const { error } = await sb.rpc('request_delete'); if (error) throw new Error('서버 기록을 지우지 못했어요. 인터넷을 확인하고 다시 시도해 주세요'); try { await sb.auth.signOut(); } catch (e) {} session = null; },
  };
  window.Cloud = { on, device, send, flush, pending: () => get('lm-outbox', []).length, init, sync, uid, ...acct, ...content };
  if (on) { setTimeout(flush, 3000); addEventListener('online', flush); }
})();
