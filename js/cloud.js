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
    const r = await fetch(`${url}/rest/v1/${table}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    if (!r.ok) { const e = new Error('cloud ' + r.status); e.status = r.status; throw e; }
  }
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
  const sb = on && window.supabase ? window.supabase.createClient(url, key) : null; let session = null, storeRef = null, syncing = false;
  const uid = () => session && session.user ? session.user.id : null;
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
  async function sync() { if (!sb || !uid() || syncing) return false; syncing = true; let changed = false; try {
    /* 1) 밀린 취소부터 보낸다 2) 폰 → 서버 3) 서버 → 폰 */
    let ops = q(); while (ops.length) { const op = ops[0]; if (op.op === 'del') { const { error } = await sb.from('stamps').delete().eq('user_id', uid()).eq('place_id', op.place_id).eq('day', op.day).eq('kind', 'gps'); if (error) throw error; } ops = q().slice(1); set('lm-syncq', ops); }
    const rows = localRows(); for (let i = 0; i < rows.length; i += 400) { const { error } = await sb.from('stamps').upsert(rows.slice(i, i + 400), { onConflict: 'user_id,place_id,day,kind', ignoreDuplicates: true }); if (error) throw error; }
    const { data, error } = await sb.from('stamps').select('place_id,day,kind').eq('user_id', uid()).limit(20000); if (error) throw error;
    changed = mergeDown(data || []); set('lm-synced-at', new Date().toISOString());
    { const u = get('lm-user', null); if (u && u.nickname) await sb.from('profiles').update({ nickname: String(u.nickname).slice(0, 20) }).eq('id', uid()); }
  } catch (e) { console.warn('[cloud] sync', e && e.message); } finally { syncing = false; }
    if (changed) document.dispatchEvent(new CustomEvent('cloud-sync')); return changed; }
  async function init(store) { storeRef = store; if (!sb) return; try { const { data } = await sb.auth.getSession(); session = data.session || null; } catch (e) {}
    sb.auth.onAuthStateChange((ev, s) => { const was = uid(); session = s; if (uid() !== was) { document.dispatchEvent(new CustomEvent('cloud-auth')); if (uid()) sync(); } });
    if (uid()) sync(); addEventListener('online', () => sync()); }
  const acct = {
    ready: !!sb, signedIn: () => !!uid(), email: () => (session && session.user && session.user.email) || '',
    name: () => { const m = session && session.user && session.user.user_metadata; return (m && (m.name || m.full_name)) || ''; },
    signIn: () => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } }),
    async signOut() { try { await sb.auth.signOut(); } catch (e) {} session = null; document.dispatchEvent(new CustomEvent('cloud-auth')); },
    /* 도장을 찍거나 취소했을 때 앱이 알려 준다 */
    stamped() { sync(); }, unstamped(place_id, day) { if (!sb) return; qPush({ op: 'del', place_id, day }); sync(); },
    /* 계정·서버 기록 전부 삭제 */
    async deleteAccount() { if (!uid()) return; const { error } = await sb.rpc('delete_my_account'); if (error) throw new Error('서버 기록을 지우지 못했어요. 인터넷을 확인하고 다시 시도해 주세요'); try { await sb.auth.signOut(); } catch (e) {} session = null; },
  };
  window.Cloud = { on, device, send, flush, pending: () => get('lm-outbox', []).length, init, sync, ...acct };
  if (on) { setTimeout(flush, 3000); addEventListener('online', flush); }
})();
