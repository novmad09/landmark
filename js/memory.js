/* 추억 사진: 폰 사진의 위치·날짜를 읽어 다녀온 명소에 '추억 도장'을 찍는다.
   - 사진은 기기 밖으로 나가지 않는다 (작은 미리보기만 이 기기 IndexedDB 에 저장)
   - 더하기만 한다. 다시 불러와도 이전 기록은 지우지 않는다 (같은 사진은 건너뜀) */
(() => {
  const DB = 'landmark-memory';
  const db = {
    h: null,
    open() { return new Promise((res, rej) => { if (this.h) return res(this.h); const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('mem')) d.createObjectStore('mem', { keyPath: 'id' }); };
      r.onsuccess = () => { this.h = r.result; this.h.onversionchange = () => { try { this.h.close(); } catch (e) {} this.h = null; }; res(this.h); };
      r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked')); }); },
    async all() { try { const d = await this.open(); return await new Promise((res, rej) => { const q = d.transaction('mem').objectStore('mem').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch (e) { return []; } },
    async putMany(list) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction('mem', 'readwrite'); const s = t.objectStore('mem'); list.forEach(x => s.put(x)); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); },
    async del(id) { const d = await this.open(); return new Promise((res, rej) => { const q = d.transaction('mem', 'readwrite').objectStore('mem').delete(id); q.onsuccess = () => res(); q.onerror = () => rej(q.error); }); },
    async wipe() { try { if (this.h) { this.h.close(); this.h = null; } } catch (e) {} await new Promise(res => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => res(); }); },
  };

  const L = window.LANDMARKS || [];
  const dist = (a, b) => { const R = 6371000, t = Math.PI / 180, dLa = (b.lat - a.lat) * t, dLo = (b.lng - a.lng) * t; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  /* 추억은 현장 도장보다 넉넉하게: 사진은 입구·주차장·근처 식당에서도 찍으니까 */
  const memR = p => Math.max(400, (p.r || 50) * 3);
  const match = (lat, lng) => { let best = null, bd = Infinity; for (const p of L) { const d = dist({ lat, lng }, p); if (d <= memR(p) && d < bd) { best = p; bd = d; } } return best; };
  const kst = ms => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);

  let list = [], urls = new Map();
  const url = m => { if (!m.thumb) return ''; let u = urls.get(m.id); if (!u) { u = URL.createObjectURL(m.thumb); urls.set(m.id, u); } return u; };

  async function thumb(file) {
    try {
      const bmp = await createImageBitmap(file); const k = Math.min(1, 480 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close();
      return await new Promise(r => c.toBlob(b => r(b), 'image/jpeg', 0.72));
    } catch (e) { return null; } /* HEIC 등 브라우저가 못 여는 사진은 미리보기 없이 기록만 */
  }
  async function read(file) {
    let gps = null, at = null;
    try { const x = window.exifr && await window.exifr.parse(file); /* 한 번에 위치·날짜 */
      if (x) { if (isFinite(x.latitude) && isFinite(x.longitude) && (x.latitude || x.longitude)) gps = { lat: x.latitude, lng: x.longitude };
        const d = x.DateTimeOriginal || x.CreateDate || x.ModifyDate; if (d instanceof Date && !isNaN(d)) at = d.getTime(); } } catch (e) {}
    return { gps, at: at || file.lastModified || Date.now(), exifDate: !!at };
  }

  const M = {
    async init() { list = await db.all(); return list; },
    all: () => list,
    count: () => list.length,
    /* 명소별 추억 */
    places() { const g = {}; list.forEach(m => { if (!m.placeId) return; const s = g[m.placeId] || (g[m.placeId] = { count: 0, first: null, last: null, days: [] }); s.count++; const d = kst(m.at); if (!s.first || d < s.first) s.first = d; if (!s.last || d > s.last) s.last = d; if (!s.days.includes(d)) s.days.push(d); }); return g; },
    of(placeId) { return M.places()[placeId] || null; },
    photosOf(placeId) { return list.filter(m => m.placeId === placeId).sort((a, b) => a.at - b.at); },
    loose() { return list.filter(m => !m.placeId && m.lat != null); }, /* 명소 밖에서 찍은 위치 있는 사진 */
    noLoc() { return list.filter(m => m.lat == null && !m.placeId).length; },
    url, dist, memR, kst,
    item(m, extra) { const p = m.placeId && L.find(x => x.id === m.placeId); return { url: url(m), cap: `${p ? p.name + ' · ' : ''}${kst(m.at).replaceAll('-', '.')}${m.src === 'manual' ? ' · 직접 추가' : ''}`, mem: m, ...(extra || {}) }; },
    /* 여러 장 불러오기. onProg(i, n). 같은 사진(이름·크기·수정시각)은 건너뛴다 */
    async import(files, onProg, opts) {
      const have = new Set(list.map(m => m.key)); const add = []; const res = { added: 0, skipped: 0, matched: 0, loose: 0, noLoc: 0, places: new Set(), rejected: 0 };
      const arr = [...files]; for (let i = 0; i < arr.length; i++) {
        const f = arr[i]; onProg && onProg(i, arr.length); if (!/^image\//.test(f.type) && !/\.(jpe?g|heic|heif|png|webp)$/i.test(f.name)) continue;
        const key = `${f.name}|${f.size}|${f.lastModified}`;
        if (have.has(key)) { /* 이미 있는 사진: 명소 인증이면, 아직 어디에도 안 붙은 사진만 그 명소에 붙여 준다 */
          const old = list.find(m => m.key === key), tp = opts && opts.placeId && L.find(x => x.id === opts.placeId);
          if (old && tp && !old.placeId) { if (old.lat != null && dist(old, tp) > memR(tp) * 3) { res.rejected++; continue; } old.placeId = tp.id; old.src = 'manual'; add.push(old); res.added++; res.matched++; res.places.add(tp.id); continue; }
          res.skipped++; continue; }
        have.add(key);
        const r = await read(f); let p = r.gps ? match(r.gps.lat, r.gps.lng) : null;
        if (opts && opts.placeId) { const tp = L.find(x => x.id === opts.placeId);
          if (r.gps && tp && dist(r.gps, tp) > memR(tp) * 3) { res.rejected++; continue; } /* 위치가 전혀 다른 사진은 인증으로 안 받는다 */
          p = tp; }
        const m = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), key, at: r.at, exifDate: r.exifDate, lat: r.gps ? r.gps.lat : null, lng: r.gps ? r.gps.lng : null, placeId: p ? p.id : null, src: opts && opts.placeId ? 'manual' : 'auto', verified: !!(r.gps && p), thumb: await thumb(f), addedAt: Date.now() };
        add.push(m); res.added++; if (p) { res.matched++; res.places.add(p.id); } else if (r.gps) res.loose++; else res.noLoc++;
        if (add.length >= 25) { await db.putMany(add.splice(0)); }
      }
      if (add.length) await db.putMany(add);
      onProg && onProg(arr.length, arr.length); list = await db.all(); res.places = res.places.size; return res;
    },
    async remove(id) { await db.del(id); const u = urls.get(id); if (u) { URL.revokeObjectURL(u); urls.delete(id); } list = list.filter(m => m.id !== id); },
    wipe: () => db.wipe(),
  };
  window.Memory = M;
})();
