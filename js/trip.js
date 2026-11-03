/* 여행 편집기: 순서·추가·빼기, 정류장마다 메모·머문 시간·사진(사진첩에서 고르거나 새로 올리기),
   정류장 사이 이동(수단·방법·시간), 한 줄 팁. 저장하거나 그대로 가이드로 올린다. */
window.TripEditor = (function () {
const MODES = ['도보', '자차', '대중교통', '기타'], SUBS = ['버스', '지하철', '기차', '택시'];
const STAYS = ['', '30분', '1시간', '2시간', '3시간', '반나절'], MINS = ['', '5', '10', '20', '30', '45', '60', '90', '120'], HOURS = [2, 3, 4, 5, 6, 8, 10, 12, 24, 48, 72];
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/* ctx: { store, Trips, TripPhotos, byId, L, toast, ask, matchQ, shrink, hoursLabel, dist, openPhotos(items, i), onSaved(t), onPublish(t, draft) } */
function open(t, ctx, opts) {
  opts = opts || {}; const { store, Trips, TripPhotos, byId, L, toast, ask, matchQ, shrink, hoursLabel, dist } = ctx;
  const stamps = store.allStamps(); const user = store.getUser() || { id: 'local', nickname: '여행자' };
  const guess = (a, b) => dist(a, b) < 1500 ? '도보' : '대중교통';
  // 작업 사본
  const d = { name: t.name, order: t.ids.filter(byId), notes: { ...(t.notes || {}) }, stay: { ...(t.stay || {}) }, photos: JSON.parse(JSON.stringify(t.photos || {})), legs: JSON.parse(JSON.stringify(t.legs || {})), tip: t.tip || '', hours: t.hours || 6 };
  const legKey = i => d.order[i] + '>' + d.order[i + 1];
  const legAt = i => d.legs[legKey(i)] || (d.legs[legKey(i)] = { mode: guess(byId(d.order[i]), byId(d.order[i + 1])), sub: '', text: '', mins: '' });
  const el = document.createElement('section'); el.className = 'detail open tripedit'; el.setAttribute('aria-hidden', 'false');
  let dirty = false;

  /* 사진 참조 → 실제 그림 */
  const photoOf = ref => ref.src === 'lm' ? store.photos.find(x => x.id === ref.id) : TripPhotos.byId(ref.id);
  const photoItems = id => (d.photos[id] || []).map(photoOf).filter(Boolean).map(ph => ({ url: ph.url, cap: ph.nickname ? `${esc(ph.nickname)} · ${ph.createdAt.slice(0, 10)}` : '내 기록 사진' }));

  const read = () => { el.querySelectorAll('[data-note]').forEach(i => d.notes[i.dataset.note] = i.value); el.querySelectorAll('[data-stay]').forEach(i => d.stay[i.dataset.stay] = i.value);
    el.querySelectorAll('[data-legtext]').forEach(i => legAt(+i.dataset.legtext).text = i.value); el.querySelectorAll('[data-legmin]').forEach(i => legAt(+i.dataset.legmin).mins = i.value);
    const tp = el.querySelector('#teTip'); if (tp) d.tip = tp.value; const hr = el.querySelector('#teHours'); if (hr) d.hours = +hr.value; };

  const stopHtml = (id, i) => { const p = byId(id), s = stamps[id], phs = d.photos[id] || [];
    return `<li class="stop" style="--c:var(--c-${p.cat})"><div class="stophead"><span class="num">${i + 1}</span><b>${p.name}</b><span class="ud"><button type="button" data-up="${i}" aria-label="위로" ${i === 0 ? 'disabled' : ''}>▲</button><button type="button" data-dn="${i}" aria-label="아래로" ${i === d.order.length - 1 ? 'disabled' : ''}>▼</button><button type="button" data-rm="${i}" aria-label="빼기" class="rm">×</button></span></div>
      <small>${p.sido} ${p.gu}${s ? ` · <span class="ok">다녀옴 ${s.last.replaceAll('-', '.')}</span>` : ' · 아직 안 감'}</small>
      <div class="phrow">${phs.map((ref, k) => { const ph = photoOf(ref); return ph ? `<button type="button" class="ph" data-ph="${id}:${k}"><img src="${ph.url}" alt=""><i data-phx="${id}:${k}" aria-label="사진 빼기">×</i></button>` : ''; }).join('')}<button type="button" class="ph add" data-phadd="${id}">+<small>사진</small></button></div>
      <textarea data-note="${id}" rows="2" maxlength="300" placeholder="여기서 뭘 했나요? 뭘 먹었고, 뭐가 좋았는지">${esc(d.notes[id])}</textarea>
      <div class="stay"><span>머문 시간</span><select data-stay="${id}">${STAYS.map(v => `<option value="${v}" ${(d.stay[id] || '') === v ? 'selected' : ''}>${v || '선택 안 함'}</option>`).join('')}</select></div></li>`; };
  const legHtml = (i) => { const lg = legAt(i); const ph = lg.mode === '도보' ? '예: 담장 따라 10분 걸으면 정문' : lg.mode === '자차' ? '예: 주차는 제2주차장이 가까워요' : lg.sub === '버스' ? '예: 12번 버스, 불국사 정류장 → 석굴암 입구' : lg.sub === '지하철' ? '예: 3호선 안국역 → 경복궁역' : lg.mode === '대중교통' ? '예: 어디서 무엇을 탔는지' : '예: 자전거·배·케이블카 등';
    return `<li class="leg"><div class="legline"></div><div class="legbox"><div class="modes">${MODES.map(m => `<button type="button" class="chip sm" data-mode="${i}" data-m="${m}" aria-pressed="${lg.mode === m}">${m}</button>`).join('')}</div>${lg.mode === '대중교통' ? `<div class="modes sub">${SUBS.map(m => `<button type="button" class="chip sm" data-sub="${i}" data-m="${m}" aria-pressed="${lg.sub === m}">${m}</button>`).join('')}</div>` : ''}<input type="text" data-legtext="${i}" maxlength="80" placeholder="${ph}" value="${esc(lg.text)}"><div class="stay"><span>걸린 시간</span><select data-legmin="${i}">${MINS.map(v => `<option value="${v}" ${String(lg.mins || '') === v ? 'selected' : ''}>${v ? v + '분' : '선택 안 함'}</option>`).join('')}</select></div></div></li>`; };

  const render = () => {
    const went = d.order.filter(id => stamps[id]).length;
    el.innerHTML = `<div class="hero gdhero grphero"><button class="back" type="button" aria-label="뒤로"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button><div class="gdhero-in"><button type="button" class="tename" id="teName"><h2>${esc(d.name)} <i>✎</i></h2></button><p>${d.order.length}곳 · ${went}곳 다녀옴 · ${t.kind === 'plan' ? '계획' : '여행'}</p><p class="gr">순서를 바꾸고, 사진과 메모를 남기면 그대로 가이드가 돼요.</p></div></div>
    <div class="body">
      <ol class="route">${d.order.map((id, i) => stopHtml(id, i) + (i < d.order.length - 1 ? legHtml(i) : '')).join('')}</ol>
      <button type="button" class="btn ghost addstop" id="teAdd">+ 랜드마크 추가</button>
      <div class="row2"><label>총 걸린 시간 <select id="teHours">${HOURS.map(h => `<option value="${h}" ${h === d.hours ? 'selected' : ''}>${hoursLabel(h)}</option>`).join('')}</select></label></div>
      <input type="text" id="teTip" class="bigin" maxlength="80" placeholder="전체 한 줄 팁 (예: 평일 오전이 한산해요)" value="${esc(d.tip)}">
      <p class="note">가이드로 올리면 순서·메모·사진·이동 방법이 공개돼요. 도장 시간과 내 위치는 올라가지 않아요.</p></div>
    <div class="fixed"><button class="btn ghost" type="button" id="teSave">저장</button><button class="btn primary" type="button" id="tePub" ${went ? '' : 'disabled'}>가이드로 올리기</button></div>`;
    el.querySelector('.back').onclick = async () => { if (dirty && !(await ask({ title: '저장하지 않고 나갈까요?', text: '고친 내용이 사라져요.', yes: '나가기', no: '계속 쓰기' }))) return; el.remove(); };
    el.querySelector('#teName').onclick = async () => { read(); const n = await ask({ title: '여행 이름', input: '이름', value: d.name, yes: '바꾸기', no: '취소' }); if (n) { d.name = n; dirty = true; render(); } };
    el.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { read(); const i = +b.dataset.up; [d.order[i - 1], d.order[i]] = [d.order[i], d.order[i - 1]]; dirty = true; render(); });
    el.querySelectorAll('[data-dn]').forEach(b => b.onclick = () => { read(); const i = +b.dataset.dn; [d.order[i + 1], d.order[i]] = [d.order[i], d.order[i + 1]]; dirty = true; render(); });
    el.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { read(); const i = +b.dataset.rm; const p = byId(d.order[i]); if (!(await ask({ title: `'${p.name}'을(를) 뺄까요?`, text: '도장 기록은 그대로 남아요.', yes: '빼기', no: '취소' }))) return; d.order.splice(i, 1); dirty = true; render(); });
    el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { read(); const lg = legAt(+b.dataset.mode); lg.mode = b.dataset.m; if (lg.mode !== '대중교통') lg.sub = ''; dirty = true; render(); });
    el.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { read(); const lg = legAt(+b.dataset.sub); lg.sub = lg.sub === b.dataset.m ? '' : b.dataset.m; dirty = true; render(); });
    el.querySelectorAll('textarea, input, select').forEach(i => i.oninput = () => { dirty = true; });
    el.querySelectorAll('[data-ph]').forEach(b => b.onclick = e => { if (e.target.dataset.phx) return; const [id, k] = b.dataset.ph.split(':'); ctx.openPhotos(photoItems(id), +k); });
    el.querySelectorAll('[data-phx]').forEach(b => b.onclick = e => { e.stopPropagation(); read(); const [id, k] = b.dataset.phx.split(':'); d.photos[id].splice(+k, 1); dirty = true; render(); });
    el.querySelectorAll('[data-phadd]').forEach(b => b.onclick = () => { read(); addPhoto(b.dataset.phadd); });
    el.querySelector('#teAdd').onclick = () => { read(); addStop(); };
    el.querySelector('#teSave').onclick = () => { read(); save(); toast('저장했어요'); dirty = false; el.remove(); };
    el.querySelector('#tePub').onclick = async () => { read(); save(); dirty = false; if (!(await ask({ title: '가이드로 올릴까요?', text: '다른 여행자들이 내 계획으로 가져가고, 다 돌면 별점을 남길 수 있어요.', yes: '올리기', no: '아직' }))) return; el.remove(); ctx.onPublish(Trips.all().find(x => x.id === t.id) || t, d); };
  };
  const save = () => { Trips.update(t.id, { name: d.name, ids: d.order.slice(), notes: d.notes, stay: d.stay, photos: d.photos, legs: d.legs, tip: d.tip, hours: d.hours, missed: (t.missed || []).filter(id => d.order.includes(id)) }); ctx.onSaved && ctx.onSaved(t.id); };

  /* 랜드마크 추가: 검색해서 고른다 */
  const addStop = () => { const pk = document.createElement('div'); pk.className = 'login pick';
    const list = (q) => L.filter(p => !d.order.includes(p.id) && (!q || matchQ(p.name + ' ' + p.sido + ' ' + p.gu, q))).sort((a, b) => (stamps[b.id] ? 1 : 0) - (stamps[a.id] ? 1 : 0) || (b.pop || 0) - (a.pop || 0)).slice(0, 30);
    const rr = (q) => { pk.innerHTML = `<div class="box"><h2>어디를 넣을까요?</h2><input type="search" id="pkQ" placeholder="이름·지역으로 찾기" value="${esc(q)}" autocomplete="off"><div class="picklist">${list(q).map(p => `<button type="button" class="pk" data-p="${p.id}"><b>${p.name}</b><small>${p.sido} ${p.gu}${stamps[p.id] ? ' · 다녀옴' : ''}</small></button>`).join('') || '<p class="note">없어요</p>'}</div><button class="btn ghost" type="button" id="pkNo">닫기</button></div>`;
      const inp = pk.querySelector('#pkQ'); inp.oninput = () => { const v = inp.value; const pos = inp.selectionStart; rr(v); const i2 = pk.querySelector('#pkQ'); i2.focus(); i2.setSelectionRange(pos, pos); };
      pk.querySelector('#pkNo').onclick = () => pk.remove();
      pk.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { d.order.push(b.dataset.p); dirty = true; pk.remove(); render(); el.querySelector('.route').lastElementChild.scrollIntoView({ block: 'center' }); }); };
    rr(''); pk.onclick = e => { if (e.target === pk) pk.remove(); }; document.getElementById('app').appendChild(pk); setTimeout(() => pk.querySelector('#pkQ').focus(), 60); };

  /* 사진 넣기: 내 사진첩(그 랜드마크에 올린 사진)에서 고르거나, 새로 올린다 */
  const addPhoto = (id) => { const mine = store.photosOf(id).filter(x => x.userId === user.id);
    const pk = document.createElement('div'); pk.className = 'login pick';
    pk.innerHTML = `<div class="box"><h2>사진 넣기</h2><p>${byId(id).name}</p>${mine.length ? `<h4>내 사진첩에서</h4><div class="pgrid small">${mine.map(ph => `<button type="button" data-lm="${ph.id}" ${(d.photos[id] || []).some(r => r.id === ph.id) ? 'disabled' : ''}><img src="${ph.url}" alt=""></button>`).join('')}</div>` : ''}<label class="btn primary filebtn">새 사진 올리기<input type="file" accept="image/*" id="pkFile" hidden></label><button class="btn ghost" type="button" id="pkNo">닫기</button></div>`;
    document.getElementById('app').appendChild(pk); pk.onclick = e => { if (e.target === pk) pk.remove(); }; pk.querySelector('#pkNo').onclick = () => pk.remove();
    pk.querySelectorAll('[data-lm]').forEach(b => b.onclick = () => { (d.photos[id] = d.photos[id] || []).push({ src: 'lm', id: b.dataset.lm }); dirty = true; pk.remove(); render(); });
    pk.querySelector('#pkFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; toast('사진 줄이는 중…'); try { const url = await shrink(f, 1400); const ph = await TripPhotos.add(t.id, id, url); (d.photos[id] = d.photos[id] || []).push({ src: 'tp', id: ph.id }); dirty = true; pk.remove(); render(); } catch (err) { toast('사진을 불러오지 못했어요'); } }; };

  render(); document.getElementById('app').appendChild(el);
  if (opts.focusPublish) setTimeout(() => el.querySelector('#tePub').scrollIntoView(), 50);
  return el;
}
/* 저장된 여행 → 가이드 내용 */
function toGuide(t, d, stamps) { const order = (d ? d.order : t.ids).filter(id => !stamps || stamps[id]); /* 가이드에는 실제 다녀온 곳만 */ const legs = []; for (let i = 0; i < order.length - 1; i++) { const lg = (d ? d.legs : t.legs || {})[order[i] + '>' + order[i + 1]] || { mode: '도보' }; legs.push({ mode: lg.mode, sub: lg.sub || '', text: (lg.text || '').trim(), mins: lg.mins ? +lg.mins : null }); }
  const src = d || t; const modes = [...new Set(legs.map(l => l.mode))].filter(m => m !== '도보');
  return { title: src.name || t.name, stops: order.map(id => ({ id, note: ((src.notes || {})[id] || '').trim(), stay: (src.stay || {})[id] || '', photos: ((src.photos || {})[id] || []).slice() })), legs, tip: (src.tip || '').trim(), hours: src.hours || 6, transport: modes.join('·') || '도보' }; }
return { open, toGuide, MODES, SUBS };
})();
