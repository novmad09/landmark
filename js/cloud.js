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
  window.Cloud = { on, device, send, flush, pending: () => get('lm-outbox', []).length };
  if (on) { setTimeout(flush, 3000); addEventListener('online', flush); }
})();
