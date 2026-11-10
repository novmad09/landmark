/* 앱 진입점: 탭, 도감, 상세, 사진·좋아요, 로그인, 도장 흐름 연결 */
(async () => {
const cfg = window.APP_CONFIG, L = window.LANDMARKS, CATS = window.CATS, SETS = window.SETS;
const { byId, kstToday } = window.Store;
const $ = s => document.querySelector(s);
/* 네이티브(Capacitor)로 묶였을 때만 쓰는 것들. 웹에선 전부 null */
const Cap = window.Capacitor || null, isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform()), LocalNoti = isNative && Cap.Plugins ? Cap.Plugins.LocalNotifications || null : null;
/* 받침에 따라 조사 고르기: josa('경복궁','을/를') → '을' */
const josa = (w, pair) => { const [a, b] = pair.split('/'); const c = String(w || '').trim().slice(-1).charCodeAt(0); if (c >= 0x30 && c <= 0x39) return '013678'.includes(String.fromCharCode(c)) ? a : b; if (c < 0xAC00 || c > 0xD7A3) return b; const jong = (c - 0xAC00) % 28; return pair === '으로/로' ? (jong && jong !== 8 ? a : b) : (jong ? a : b); };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const LS = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
/* 토스트: 두 번째 인자로 { action, onAction } 을 주면 버튼(되돌리기 등)이 붙고 6초 머문다 */
let tt; const toast = (m, o) => { const t = $('#toast'); t.textContent = ''; t.append(m); if (o && o.action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = o.action; b.onclick = () => { t.classList.remove('show'); o.onAction(); }; t.append(b); } t.classList.toggle('act', !!(o && o.action)); t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), o && o.action ? 6000 : 4000); };
/* 예/아니오 대화상자 (브라우저 confirm 대신). 바깥을 누르면 null */
function ask({ title, text, yes, no, input, value }) { return new Promise(res => { const el = document.createElement('div'); el.className = 'login ask';
  el.innerHTML = `<div class="box"><h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}${input ? `<input type="text" id="askIn" maxlength="24" placeholder="${esc(input)}" value="${esc(value)}">` : ''}<div class="askrow"><button class="btn ghost" id="askNo" type="button">${no || '아니오'}</button><button class="btn primary" id="askYes" type="button">${yes || '예'}</button></div></div>`;
  document.getElementById('app').appendChild(el); const done = v => { el.remove(); res(v); };
  el.onclick = e => { if (e.target === el) done(null); }; el.querySelector('#askNo').onclick = () => done(false);
  const inp = el.querySelector('#askIn'); const ok = () => done(inp ? inp.value.trim() || false : true); el.querySelector('#askYes').onclick = ok; if (inp) { setTimeout(() => inp.focus(), 50); inp.onkeydown = e => { if (e.key === 'Enter') ok(); }; } }); }

if (localStorage.getItem('lm-test') !== null) cfg.testMode = LS.get('lm-test', cfg.testMode); // 내 정보에서 켜고 끈 값
const store = await window.Store.create(); window.Store.TripPhotos.gc().catch(() => {}); try { await window.Memory.init(); } catch (e) {}
const mapS = window.MapScreen.init({ store, toast, onStamp: startStamp, onDetail: openDetail, onAddTrip: p => addToTrip(p), onPhoto: (p, stamped) => stamped ? pickPhoto(p.id) : toast('도장을 찍은 곳에만 사진을 올릴 수 있어요'), onUndo: () => { if (!screens.dogam.hidden) renderDogam(); }, onStampInfo: p => stampInfo(p), onMemPhotos: ids => { const all = window.Memory.all(); const ms = ids.map(i => all.find(m => m.id === i)).filter(Boolean).sort((a, b) => a.at - b.at); openPhotos(ms.map(m => window.Memory.item(m)), 0, '추억 사진'); }, onGallery: p => openGallery(p.id, 0),
  onNear: p => { try { navigator.vibrate && navigator.vibrate([60, 40, 60]); } catch (e) {} toast(`${p.name} 도장을 찍을 수 있어요`, { action: '찍기', onAction: () => { showTab('map'); mapS.focus(p.id); } });
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('랜드마크', { body: `${p.name} 근처예요. 도장을 찍어 보세요`, tag: 'near' }); } catch (e) {} } } });
const ICON = mapS.ICON, fmt = mapS.fmt;

/* ---------- 탭 ---------- */
const screens = { map: $('#scrMap'), dogam: $('#scrDogam'), guide: $('#scrGuide'), me: $('#scrMe') };
function showTab(name) { Object.entries(screens).forEach(([k, el]) => el.hidden = k !== name); if (name !== 'map' && mapS) mapS.closeSheet(); /* 다른 탭으로 가면 명소 시트는 닫는다 */
  document.querySelectorAll('nav.tabs button').forEach(b => { if (b.dataset.tab === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  if (name === 'dogam') renderDogam(); if (name === 'guide') renderGuide(); if (name === 'me') renderMe(); if (name === 'map') mapS.resize(); if (location.hash !== '#' + name) { if (name === 'map') history.replaceState({ tab: name }, '', '#map'); else history.pushState({ tab: name }, '', '#' + name); } }
document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
/* ---------- 추억 사진 ---------- */
/* 명소 상세의 '추억' 칸: 그곳에서 찍은 내 사진 줄 + 사진으로 더하기 */
function memHtml(p) { const ms = window.Memory.photosOf(p.id), s = window.Memory.of(p.id);
  return `<div class="memsec"><h3>📷 내 추억 ${ms.length ? `<small>${ms.length}장 · ${s.first === s.last ? dotDate(s.first) : `${dotDate(s.first)} ~ ${dotDate(s.last)}`}</small>` : ''}</h3>
    ${ms.length ? `<div class="memstrip">${ms.map((m, i) => `<button type="button" data-mi="${i}">${window.Memory.url(m) ? `<img src="${window.Memory.url(m)}" alt="">` : '<span>사진</span>'}<i>${window.Memory.kst(m.at).slice(2).replaceAll('-', '.')}</i></button>`).join('')}</div>` : '<p class="note">와 본 적 있나요? 그때 사진을 넣으면 추억 도장이 찍혀요.</p>'}
    <button type="button" class="btn ghost small" id="memAdd">${ms.length ? '+ 사진 더하기' : '그때 사진 넣기'}</button></div>`; }
function bindMem(el, p, after) { const ms = window.Memory.photosOf(p.id);
  el.querySelectorAll('.memstrip button').forEach(b => b.onclick = () => openPhotos(ms.map(m => window.Memory.item(m)), +b.dataset.mi, p.name));
  const a = el.querySelector('#memAdd'); if (a) a.onclick = () => memImport({ placeId: p.id, after }); }
/* 사진 고르기 → 읽기(진행 표시) → 결과. placeId 가 있으면 그 명소 인증용 */
function pickFiles(any) { return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; if (!any) i.accept = 'image/*'; i.hidden = true; document.body.appendChild(i);
  const fin = v => { res(v); i.remove(); }; i.onchange = () => fin([...(i.files || [])]); i.oncancel = () => fin([]); i.click(); }); }
async function memImport(opts) { opts = opts || {};
  const files = await pickFiles(opts.any); if (!files.length) return null;
  const el = document.createElement('div'); el.className = 'login memprog'; el.innerHTML = `<div class="box"><h2>다녀온 곳을 찾는 중…</h2><div class="bar"><i></i></div><p class="note" id="mpN">0 / ${files.length}</p><p class="note">사진은 보지 않고 위치와 날짜만 확인해요</p></div>`; document.getElementById('app').appendChild(el);
  let r; try { r = await window.Memory.import(files, (i, n) => { el.querySelector('.bar i').style.width = `${Math.round(i / n * 100)}%`; el.querySelector('#mpN').textContent = `${i} / ${n}`; }, { placeId: opts.placeId }); }
  catch (e) { el.remove(); toast('사진을 읽지 못했어요. 저장 공간을 확인해 주세요'); return null; }
  el.remove(); mapS.refreshMem(); if (!screens.dogam.hidden) renderDogam(); if (!screens.me.hidden) renderMe();
  if (opts.placeId) { const p = byId(opts.placeId);
    toast(r.added ? `${p.name}에 추억 사진 ${r.added}장을 더했어요` : r.rejected ? '다른 곳에서 찍은 사진이라 넣지 않았어요' : r.skipped ? '이미 들어 있는 사진이에요' : '사진을 넣지 못했어요');
    opts.after && opts.after(); return r; }
  memResult(r, opts); return r; }
function memResult(r, opts) {
  const total = Object.keys(window.Memory.places()).length; const none = !r.matched && !r.loose;
  const el = document.createElement('div'); el.className = 'login memres';
  el.innerHTML = `<div class="box"><h2>${none ? (r.skipped && !r.added ? '이미 다 불러온 사진이에요' : '위치가 담긴 사진을 못 찾았어요') : `추억 명소 ${total}곳을 찾았어요!`}</h2>
    ${none ? `<p>${r.skipped && !r.added ? '새 사진만 더해져요. 이전 기록은 그대로예요.' : '사진에 위치가 없거나, 고르는 화면이 위치를 빼고 줬을 수 있어요. \'파일에서 고르기\'로 다시 해 보세요.'}</p>` : `<ul class="memsum"><li>명소 <b>${r.places}</b>곳 · 사진 <b>${r.matched}</b>장</li>${r.loose ? `<li>다른 곳 사진 <b>${r.loose}</b>장 · 지도에 분홍 점</li>` : ''}${r.noLoc ? `<li>위치 없는 사진 ${r.noLoc}장 · 명소에서 직접 추가</li>` : ''}${r.skipped ? `<li>이미 있는 사진 ${r.skipped}장은 그대로</li>` : ''}</ul>`}
    <p class="note">사진은 언제든 더할 수 있어요. 이전 기록은 그대로 남아요.</p>
    <button class="btn primary" type="button" id="mrOk">${none ? '닫기' : '지도에서 보기'}</button>${none ? '<button class="btn ghost" type="button" id="mrAny">파일에서 고르기</button>' : '<button class="btn ghost" type="button" id="mrMore">사진 더 고르기</button>'}</div>`;
  document.getElementById('app').appendChild(el); const close = () => el.remove();
  el.querySelector('#mrOk').onclick = () => { close(); if (!none) { showTab('map'); document.getElementById('jNat').click(); } };
  const m = el.querySelector('#mrMore'); if (m) m.onclick = () => { close(); memImport({}); };
  const a = el.querySelector('#mrAny'); if (a) a.onclick = () => { close(); memImport({ any: true }); };
}
/* 온보딩 끝: 지난 여행부터 찾아볼까요? */
function memIntro() {
  const el = document.createElement('div'); el.className = 'login memintro';
  el.innerHTML = `<div class="box"><div class="mi-ic">📷</div><h2>지난 여행부터 찾아볼까요?</h2><p>사진을 고르면 다녀온 명소에 <b>추억 도장</b>을 찍어 드려요.</p><p class="note">사진은 보지 않고 위치와 날짜만 확인해요</p>
    <button class="btn primary" type="button" id="miGo">사진 고르기</button><button class="btn ghost" type="button" id="miNo">나중에</button></div>`;
  document.getElementById('app').appendChild(el);
  el.querySelector('#miGo').onclick = () => { el.remove(); memImport({}); };
  el.querySelector('#miNo').onclick = () => { el.remove(); toast('내 정보에서 언제든 할 수 있어요'); };
}
/* 찍은 도장을 누르면: 기록 보기 + 취소 (되돌릴 수 없음) */
async function stampInfo(p, after) {
  const s = store.stampsOf(p.id); if (!s) return;
  const el = document.createElement('div'); el.className = 'login stampinfo';
  const days = (s.days && s.days.length ? s.days : [s.first, s.last]).filter(Boolean).sort().reverse();
  el.innerHTML = `<div class="box"><div class="si-seal"><span class="sealbtn stamped" aria-hidden="true"><span class="ring"><b>${esc(p.name.replace(/\s.*/, '').slice(0, 3))}<br><small>${s.last.slice(5).replace('-', '.')}</small></b></span></span></div><h2>${esc(p.name)}</h2><p>방문 ${s.count}회</p><ul class="si-days">${days.slice(0, 8).map(d => `<li>${dotDate(d)}</li>`).join('')}${days.length > 8 ? `<li>… 외 ${days.length - 8}일</li>` : ''}</ul><button class="btn ghost danger" type="button" id="siUndo">최근 도장 취소</button><button class="btn ghost" type="button" id="siNo">닫기</button></div>`;
  document.getElementById('app').appendChild(el); const close = () => el.remove(); el.onclick = e => { if (e.target === el) close(); }; el.querySelector('#siNo').onclick = close;
  el.querySelector('#siUndo').onclick = async () => { close(); if (!(await ask({ title: `${p.name} 도장을 취소할까요?`, text: `${dotDate(s.last)} 도장이 지워져요. 되돌릴 수 없어요.`, yes: '취소할게요', no: '그대로 두기' }))) return;
    const r = await store.unstamp(p.id); if (!r.ok) { toast(r.reason); return; } toast('도장을 취소했어요'); mapS.refresh(); if (!screens.dogam.hidden) renderDogam(); if (!screens.me.hidden) renderMe(); after && after(); };
}
/* 안드로이드 '뒤로' 버튼: 열린 화면(상세·사진·편집기·대화상자)을 하나씩 닫고, 다 닫히면 지도 탭으로, 지도에서 한 번 더 누르면 앱이 내려간다 */
const Back = (() => {
  const OV = '.login, .stampscr, .viewer, .pedit, .onb, .detail';
  let depth = 0, skip = 0;
  const isOv = n => n.nodeType === 1 && n.id !== 'detail' && n.matches(OV); /* #detail 은 class 로 따로 본다 */
  const opened = () => { depth++; history.pushState({ ov: depth }, ''); };
  const closed = () => { if (depth <= 0) return; depth--; if (history.state && history.state.ov > depth) { skip++; history.back(); } };
  const closeTop = () => { const list = [...document.querySelectorAll(OV)].filter(e => e.id !== 'detail' || e.classList.contains('open')); const top = list[list.length - 1]; if (!top) { const sh = document.getElementById('sheet'); if (sh.classList.contains('open')) { mapS.closeSheet(); return true; } return false; }
    if (top.id === 'detail') { closeDetail(); return true; }
    const btn = top.querySelector('#askNo, #pkNo, #rpNo, #peX, #onbSkip, .cancel, .x, .x2, .back'); if (btn) btn.click(); else top.remove(); return true; };
  new MutationObserver(ms => ms.forEach(m => { m.addedNodes.forEach(n => { if (isOv(n)) opened(); }); m.removedNodes.forEach(n => { if (isOv(n)) closed(); });
  })).observe(document.getElementById('app'), { childList: true });
  const watchOpen = id => new MutationObserver(ms => ms.forEach(m => { const t = m.target; if (t.classList.contains('open')) { if (!t._ov) { t._ov = true; opened(); } } else if (t._ov) { t._ov = false; closed(); } })).observe(document.getElementById(id), { attributes: true, attributeFilter: ['class'] });
  watchOpen('detail'); watchOpen('sheet');
  window.addEventListener('popstate', () => { if (skip > 0) { skip--; return; } if (depth > 0) { if (!closeTop()) depth = 0; return; } /* 닫히면 observer 가 depth 를 줄인다 */
    const cur = document.querySelector('nav.tabs button[aria-current]'); if (cur && cur.dataset.tab !== 'map') showTab('map'); });
  return { reset() { depth = 0; } };
})();
addEventListener('hashchange', () => { const h = location.hash.slice(1); if (screens[h]) showTab(h); });

/* ---------- 로그인 ---------- */
/* 이름은 일단 아무거나 지어 주고 시작한다. 내 정보에서 언제든 바꾼다 */
const NICK_A = ['느긋한', '부지런한', '씩씩한', '호기심 많은', '길 잘 찾는', '새벽형', '사진 찍는', '걷기 좋아하는', '바다 좋아하는', '산 좋아하는'];
const NICK_B = ['여행자', '나그네', '탐험가', '도장꾼', '길동무', '산책러', '등산객', '여행가'];
function randomNick() { const pick = a => a[Math.floor(Math.random() * a.length)]; return `${pick(NICK_A)} ${pick(NICK_B)} ${Math.floor(100 + Math.random() * 900)}`; }
function requireLogin() {
  return new Promise(async res => {
    if (store.getUser()) return res(true);
    if (store.mode === 'local' && LS.get('lm-agreed', null)) { const n = randomNick(); await store.signIn(n); toast(`${n}님, 반가워요!`); return res(true); } /* 약관은 온보딩에서 동의했으니 바로 */
    const el = document.createElement('div'); el.className = 'login';
    el.innerHTML = store.mode === 'local'
      ? `<div class="box"><h2>이름을 정해 주세요</h2><p>도장과 사진에 이 이름이 보여요.</p><input id="nick" type="text" maxlength="14" placeholder="예: 여행하는 김씨" autocomplete="nickname" value="${randomNick()}"><label class="chk"><input type="checkbox" id="agree"> <span><a href="legal/terms.html" target="_blank" rel="noopener">이용약관</a>과 <a href="legal/privacy.html" target="_blank" rel="noopener">개인정보처리방침</a>에 동의해요</span></label><button class="btn primary" id="go" type="button">시작하기</button><button class="btn ghost" id="no" type="button">나중에</button></div>`
      : `<div class="box"><h2>로그인</h2><p>도장을 찍고 사진을 올리려면 로그인이 필요해요.</p><button class="btn kakao" id="kakao" type="button">카카오로 계속하기</button><button class="btn apple" id="apple" type="button">Apple로 계속하기</button><button class="btn ghost" id="no" type="button">나중에</button></div>`;
    document.getElementById('app').appendChild(el);
    const done = v => { el.remove(); res(v); };
    el.querySelector('#no').onclick = () => done(false);
    if (store.mode === 'local') { const inp = el.querySelector('#nick'); setTimeout(() => inp.focus(), 50); const go = async () => { const n = inp.value.trim(); if (!n) { inp.focus(); return; } if (!el.querySelector('#agree').checked) { toast('약관에 동의해 주세요'); return; } const bad = window.Store.Safety.clean(n) === null; if (bad) { toast('그 이름은 쓸 수 없어요'); return; } LS.set('lm-agreed', new Date().toISOString()); await store.signIn(n); toast(`${n}님, 환영해요`); done(true); }; el.querySelector('#go').onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); }; }
    else { el.querySelector('#kakao').onclick = () => store.signIn('kakao').catch(e => toast(e.message)); el.querySelector('#apple').onclick = () => store.signIn('apple').catch(e => toast(e.message)); }
  });
}

/* ---------- 도장 흐름 ---------- */
async function startStamp(place, pos, start) {
  const noDialog = !!store.getUser() || (store.mode === 'local' && !!LS.get('lm-agreed', null)); /* 이름이 자동으로 정해지면 누르던 손가락 그대로 이어서 찍는다 */
  if (!(await requireLogin())) return;
  mapS.closeSheet();
  window.StampScreen.open({ place, toast, start: noDialog ? start : null,
    check: () => store.check(place.id, pos),
    commit: () => store.stamp(place.id, pos),
    onDone: () => { mapS.refresh(); Nudge.promote(); scheduleEvening(); const st = mapS.regionStats()[place.rg]; if (st && st.total > 1 && st.done === st.total) setTimeout(() => toast(`${place.rgName} 전부 모았어요! 지도에 색이 칠해졌어요`), 600); },
    onDogam: async () => { showTab('dogam'); openDetail(place.id); await awardBadges(); await askNotify(); },
    onPhoto: () => { openDetail(place.id); setTimeout(pickPhoto, 150, place.id); },
    onCancel: async () => { mapS.refresh(); await awardBadges(); await askNotify(); },
  });
}

/* ---------- 랜드마크 탭 (다녀온 곳 / 모든 곳) ---------- */
const Trips = window.Store.Trips; Trips.fixIds();
const DGSAVE = ['view', 'sort', 'group', 'tripKind'];
const DG = Object.assign({ view: 'mine', q: '', set: '', sido: '', cat: '', month: '', trip: '', sort: 'recent', group: 'trip', selecting: false, sel: new Set() }, LS.get('lm-dg', {}));
const monthOf = s => s ? s.last.slice(0, 7) : '';
const monthLabel = m => m ? `${m.slice(0, 4)}.${m.slice(5, 7)}` : '';
const dotDate = d => d.replaceAll('-', '.');
const myPos = () => mapS.pos() || (() => { try { return JSON.parse(localStorage.getItem('lm-lastpos')); } catch (e) { return null; } })() || { lat: 37.5797, lng: 126.9772 };
const setName = id => (SETS.find(s => s.id === id) || {}).name || id;
/* 초성 검색: ㅂㄱㅅ → 불국사 */
const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const chosung = s => [...s].map(ch => { const c = ch.charCodeAt(0) - 0xAC00; return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch; }).join('');
const isCho = q => /^[ㄱ-ㅎ]+$/.test(q);
function matchQ(text, q) { q = q.trim(); if (!q) return true; const t = text.toLowerCase();
  if (isCho(q)) return chosung(text).includes(q); return t.includes(q.toLowerCase()); }

/* 같은 날 찍은 도장 → 자동 여행. 내가 만든 여행에 이미 들어간 곳은 뺀다 */
function autoTrips(stamps) {
  /* 이미 여행에 들어간 (명소, 날짜)는 뺀다. 날짜 없는 손수 만든 여행은 그 명소를 통째로 뺀다 */
  const covered = new Set(); Trips.all().filter(t => t.kind === 'trip').forEach(t => t.ids.forEach(id => covered.add(t.doneAt ? `${id}|${t.doneAt}` : id))); const byDate = {};
  L.forEach(p => { const s = stamps[p.id]; if (!s || covered.has(p.id)) return; const ds = s.days && s.days.length ? s.days : [s.first, s.last]; [...new Set(ds)].filter(Boolean).forEach(d => { if (!covered.has(`${p.id}|${d}`)) (byDate[d] = byDate[d] || []).push(p); }); });
  return Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0])).map(([d, ps]) => { const cnt = {}; ps.forEach(p => cnt[p.gu.replace(/(시|군|구)$/, '')] = (cnt[p.gu.replace(/(시|군|구)$/, '')] || 0) + 1);
    const tops = Object.entries(cnt).sort((x, y) => y[1] - x[1]).slice(0, 2).map(x => x[0]); return { id: 'auto:' + d, auto: true, kind: 'trip', name: `${dotDate(d)} ${tops.join('·')} 여행`, date: d, ids: ps.map(p => p.id) }; });
}
function tripsOf(kind) { return Trips.all().filter(t => t.kind === kind); }

function dgList() {
  const stamps = allSeen();
  let list = L.map(p => ({ p, s: stamps[p.id] || null }));
  if (DG.view === 'mine') list = list.filter(x => x.s);
  if (DG.q) list = list.filter(x => matchQ(x.p.name + ' ' + x.p.sido + ' ' + x.p.gu + ' ' + (x.p.rgName || ''), DG.q));
  if (DG.set) list = list.filter(x => x.p.sets.includes(DG.set));
  if (DG.sido) list = list.filter(x => x.p.sido === DG.sido);
  if (DG.cat) list = list.filter(x => x.p.cat === DG.cat);
  if (DG.month) list = list.filter(x => monthOf(x.s) === DG.month);
  if (DG.trip) { const t = Trips.all().find(t => t.id === DG.trip) || autoTrips(stamps).find(t => t.id === DG.trip); if (t) list = list.filter(x => t.ids.includes(x.p.id)); }
  const col = (a, b) => a.localeCompare(b, 'ko');
  if (DG.sort === 'near') { const me = myPos(); list.sort((a, b) => window.Store.dist(me, a.p) - window.Store.dist(me, b.p)); }
  else if (DG.sort === 'recent') list.sort((a, b) => (b.s?.last || '').localeCompare(a.s?.last || '') || col(a.p.name, b.p.name));
  else if (DG.sort === 'region') list.sort((a, b) => col(a.p.sido, b.p.sido) || col(a.p.gu, b.p.gu) || col(a.p.name, b.p.name));
  else if (DG.sort === 'name') list.sort((a, b) => col(a.p.name, b.p.name));
  else if (DG.sort === 'count') list.sort((a, b) => (b.s?.count || 0) - (a.s?.count || 0) || col(a.p.name, b.p.name));
  return list;
}
function scopeSummary(stamps) {
  // 필터 범위 안에서 "방문 X / 범위 Y곳"
  const inScope = L.filter(p => (!DG.set || p.sets.includes(DG.set)) && (!DG.sido || p.sido === DG.sido) && (!DG.cat || p.cat === DG.cat));
  const v = inScope.filter(p => stamps[p.id]).length, label = DG.set ? setName(DG.set) : DG.sido ? DG.sido : '전국';
  return `방문 <b>${v}</b> / ${label} ${inScope.length}곳`;
}
/* 현장 도장 + 추억 도장(사진)을 합친 보기. 현장 도장이 있으면 그쪽이 우선 */
function allSeen() { const out = {}; Object.entries(window.Memory.places()).forEach(([id, m]) => { out[id] = { ...m, mem: true }; }); return { ...out, ...store.allStamps() }; }
function renderDogam() {
  const stamps = allSeen();
  const visited = L.filter(p => stamps[p.id]).length, view = DG.view, mine = view === 'mine', tripsV = view === 'trips';
  const trips = tripsOf('trip'), plans = tripsOf('plan'), auto = autoTrips(stamps);
  ['dgMine', 'dgTrips', 'dgAll'].forEach((id, k) => $('#' + id).setAttribute('aria-selected', ['mine', 'trips', 'all'][k] === view));
  $('#dgSum').innerHTML = tripsV ? `여행 <b>${trips.length + auto.length}</b> · 계획 ${plans.length}` : scopeSummary(stamps);
  // 내 여행 보기에선 검색·필터·정렬 줄을 접는다
  $('#dgQ').parentElement.hidden = tripsV; $('#dgFilters').hidden = tripsV || $('#dgFilters').hidden; $('#dgSort').parentElement.hidden = tripsV;
  const chip = (k, val, label, cur) => `<button type="button" class="chip" data-k="${k}" data-v="${val}" aria-pressed="${cur === val}">${label}</button>`;
  if (!tripsV) {
    const sidos = [...new Set(L.map(p => p.sido))], months = [...new Set(L.map(p => monthOf(stamps[p.id])).filter(Boolean))].sort().reverse();
    $('#dgFilters').innerHTML = `<div class="frow"><span>세트</span>${chip('set', '', '전체', DG.set)}${SETS.map(s => chip('set', s.id, s.name, DG.set)).join('')}</div>
      <div class="frow"><span>지역</span>${chip('sido', '', '전체', DG.sido)}${sidos.map(s => chip('sido', s, s, DG.sido)).join('')}</div>
      <div class="frow"><span>종류</span>${chip('cat', '', '전체', DG.cat)}${Object.entries(CATS).map(([k, c]) => chip('cat', k, c.emoji + ' ' + c.name, DG.cat)).join('')}</div>
      ${mine && months.length ? `<div class="frow"><span>방문 달</span>${chip('month', '', '전체', DG.month)}${months.map(m => chip('month', m, monthLabel(m), DG.month)).join('')}</div>` : ''}`;
    $('#dgFilters').querySelectorAll('.chip').forEach(b => b.onclick = () => { DG[b.dataset.k] = b.dataset.v; renderDogam(); });
    const active = [DG.set, DG.sido, DG.cat, DG.month].filter(Boolean).length; $('#dgFilterBtn').textContent = active ? `필터 ${active}` : '필터'; $('#dgFilterBtn').setAttribute('aria-pressed', String(active > 0 || !$('#dgFilters').hidden));
    const sorts = mine ? [['recent', '최근 방문순'], ['near', '가까운 순'], ['region', '지역순'], ['count', '많이 간 순'], ['name', '이름순']] : [['near', '가까운 순'], ['region', '지역순'], ['name', '이름순'], ['recent', '최근 방문순']];
    if (!sorts.some(([k]) => k === DG.sort)) DG.sort = sorts[0][0];
    $('#dgSort').innerHTML = `<select id="dgSortSel" aria-label="정렬">${sorts.map(([k, l]) => `<option value="${k}" ${DG.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    $('#dgSortSel').onchange = e => { DG.sort = e.target.value; renderDogam(); };
    const groups = mine ? [['none', '묶지 않기'], ['sido', '지역별'], ['month', '달별']] : [['none', '묶지 않기'], ['set', '세트별'], ['sido', '지역별'], ['cat', '종류별']];
    if (!groups.some(([k]) => k === DG.group)) DG.group = groups[0][0];
    $('#dgGroup').innerHTML = `<select id="dgGroupSel" aria-label="묶어 보기">${groups.map(([k, l]) => `<option value="${k}" ${DG.group === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    $('#dgGroupSel').onchange = e => { DG.group = e.target.value; renderDogam(); };
  }
  const cell = ({ p, s }) => `<button class="cell ${s ? (s.mem ? 'visited memory' : 'visited') : ''} ${DG.selecting && DG.sel.has(p.id) ? 'picked' : ''}" type="button" data-id="${p.id}" style="--c:var(--c-${p.cat})"><span class="st">${ICON[p.cat]}</span><span class="n">${p.name}</span><span class="r">${p.sido} ${p.gu}</span>${DG.sort === 'near' ? `<span class="d">${fmt(window.Store.dist(myPos(), p))}${s ? ' · 다녀옴' : ''}</span>` : s ? `<span class="d">${dotDate(s.last)}${s.count > 1 ? ` · ${s.count}회` : ''}</span>` : ''}</button>`;
  const gcard = (g) => { const done = g.items.filter(x => x.s).length, total = g.total ?? g.items.length; const pct = total ? Math.round(done / total * 100) : 0; const bar = g.kind === 'plan' || (!mine && g.kind !== 'trip' && g.kind !== 'rest');
    return `<button type="button" class="grp ${g.kind || ''}" data-grp="${g.key}"><div class="grp-h"><div class="grp-t"><b>${esc(g.title)}</b>${g.badge ? `<em>${g.badge}</em>` : ''}</div><span class="grp-n">${bar ? `${done}/${total}` : `${done}곳`}</span></div>${g.sub ? `<div class="grp-s">${esc(g.sub)}</div>` : ''}${bar ? `<div class="grp-bar"><i style="width:${pct}%"></i></div>` : ''}<div class="grp-th">${g.items.slice(0, 5).map(x => `<span class="${x.s ? 'on' : ''}" style="--c:var(--c-${x.p.cat})">${ICON[x.p.cat]}</span>`).join('')}${g.items.length > 5 ? `<span class="more">+${g.items.length - 5}</span>` : ''}<span class="grp-names">${g.items.slice(0, 3).map(x => x.p.name).join(' · ')}${g.items.length > 3 ? ' …' : ''}</span></div></button>`; };
  let groupsOut = [], html = '';
  if (tripsV) {
    // 내 여행: 여행(완료·오늘) 과 계획을 카드로
    const kind = DG.tripKind || 'all';
    const ts = [...trips.map(t => ({ ...t })), ...auto, ...plans].filter(t => kind === 'all' || (kind === 'trip' ? t.kind === 'trip' : t.kind === 'plan')).sort((a, b) => (b.doneAt || b.date || b.createdAt || '').localeCompare(a.doneAt || a.date || a.createdAt || ''));
    ts.forEach(t => { const items = t.ids.map(id => byId(id)).filter(Boolean).map(p => ({ p, s: stamps[p.id] || null })); if (!items.length) return; const went = items.filter(x => x.s).length, missed = items.length - went;
      const dates = items.filter(x => x.s).map(x => x.s.last).sort(); const when = t.doneAt ? dotDate(t.doneAt) : t.date ? dotDate(t.date) : dates.length ? (dates[0] === dates.at(-1) ? dotDate(dates[0]) : `${dotDate(dates[0])}~${dotDate(dates.at(-1)).slice(5)}`) : '';
      groupsOut.push({ key: t.id, title: t.name, badge: t.auto ? (t.date === kstToday() ? '오늘' : '추억') : t.kind === 'plan' ? '계획' : '', sub: t.kind === 'plan' ? `${items.length}곳 계획${went ? ` · ${went}곳 다녀옴` : ''}` : [t.name.includes(when) ? '' : when, missed ? `못 간 곳 ${missed}` : ''].filter(Boolean).join(' · '), items, kind: t.kind, trip: t }); });
    html = `<div class="tripbar2"><div class="seg sm"><button type="button" data-tk="all" aria-selected="${kind === 'all'}">전체</button><button type="button" data-tk="trip" aria-selected="${kind === 'trip'}">여행</button><button type="button" data-tk="plan" aria-selected="${kind === 'plan'}">계획</button></div><button type="button" class="chip up" id="dgNewTrip">+ 내 여행 만들기</button></div>`
      + (groupsOut.length ? `<div class="grps">${groupsOut.map(gcard).join('')}</div>` : `<div class="empty cta"><p>아직 여행이 없어요.<br>도장을 찍으면 그날 여행이 저절로 생겨요.</p><div class="cta2"><button type="button" class="btn primary" id="dgNewTrip2">내 여행 만들기</button><button type="button" class="btn ghost" id="dgGoGuide">가이드 보기</button></div></div>`);
  } else {
    const list = dgList();
    if (DG.group === 'set') SETS.forEach(st => { const items = list.filter(x => x.p.sets.includes(st.id)); const all = L.filter(p => p.sets.includes(st.id)); if (items.length) groupsOut.push({ key: 'set:' + st.id, title: st.name, sub: st.desc, items, total: mine ? undefined : all.length, kind: 'set' }); });
    else if (DG.group !== 'none') { const key = x => DG.group === 'sido' ? x.p.sido : DG.group === 'month' ? monthLabel(monthOf(x.s)) : CATS[x.p.cat].name;
      const g = {}; list.forEach(x => (g[key(x)] = g[key(x)] || []).push(x)); const keys = Object.keys(g); if (DG.group === 'month') keys.sort().reverse(); else keys.sort((a, b) => a.localeCompare(b, 'ko'));
      keys.forEach(k => { const scope = DG.group === 'sido' && !mine ? L.filter(p => p.sido === k && (!DG.set || p.sets.includes(DG.set)) && (!DG.cat || p.cat === DG.cat)).length : undefined; groupsOut.push({ key: DG.group + ':' + k, title: k, items: g[k], total: scope, kind: DG.group }); }); }
    if (!list.length) {
      if (mine && !visited) { const me = mapS.pos(); const nd = me ? Math.min(...L.map(p => window.Store.dist(me, p))) : null;
        html = `<div class="empty cta"><p>${nd === null ? '아직 도장이 없어요.<br>가까운 명소부터 찾아볼까요?' : nd > 10000 ? `가까운 랜드마크가 <b>${fmt(nd)}</b> 떨어져 있어요.<br>주말에 갈 만한 곳부터 찾아볼까요?` : `아직 모은 도장이 없어요.<br>가장 가까운 곳이 <b>${fmt(nd)}</b> 거리에 있어요.`}</p><div class="cta2"><button type="button" class="btn primary" id="dgGoMap">지도 보기</button><button type="button" class="btn ghost" id="dgGoGuide">가이드 보기</button></div></div>`; }
      else html = `<div class="empty">조건에 맞는 곳이 없어요.</div>`;
    }
    else if (DG.group === 'none' || DG.selecting) { const PAGE = 60; html = `<div class="grid" id="dgGrid">${list.slice(0, PAGE).map(cell).join('')}</div>${list.length > PAGE ? `<button type="button" class="btn ghost more" id="dgMore">더 보기 (${list.length - PAGE}곳 남음)</button>` : ''}`; DG._rest = list.slice(PAGE); DG._cell = cell; }
    else html = `<div class="grps">${groupsOut.map(gcard).join('')}</div>`;
  }
  $('#dgBody').innerHTML = html; DG._groups = groupsOut; renderProg();
  const bindCells = root => root.querySelectorAll('.cell').forEach(b => b.onclick = () => { if (DG.selecting) { const id = b.dataset.id; DG.sel.has(id) ? DG.sel.delete(id) : DG.sel.add(id); b.classList.toggle('picked'); $('#dgSelCount').textContent = `${DG.sel.size}곳 선택`; } else openDetail(b.dataset.id); });
  const more = $('#dgMore'); if (more) { const loadMore = () => { const chunk = DG._rest.splice(0, 60); const grid = $('#dgGrid'); const frag = document.createElement('div'); frag.innerHTML = chunk.map(DG._cell).join(''); const nodes = [...frag.children]; nodes.forEach(n => grid.appendChild(n)); nodes.forEach(n => bindCells({ querySelectorAll: s => n.matches(s) ? [n] : [] })); if (!DG._rest.length) more.remove(); else more.textContent = `더 보기 (${DG._rest.length}곳 남음)`; };
    more.onclick = loadMore; try { new IntersectionObserver((es, ob) => { if (es[0].isIntersecting) { if (!$('#dgMore')) { ob.disconnect(); return; } loadMore(); } }, { rootMargin: '400px' }).observe(more); } catch (e) {} }
  const gm = $('#dgGoMap'); if (gm) gm.onclick = () => showTab('map');
  const gg = $('#dgGoGuide'); if (gg) gg.onclick = () => { G.tab = 'all'; G.sort = 'near'; $('#gdSort').value = 'near'; showTab('guide'); };
  ['dgNewTrip', 'dgNewTrip2'].forEach(id => { const b = $('#' + id); if (b) b.onclick = newTripFlow; });
  $('#dgBody').querySelectorAll('[data-tk]').forEach(b => b.onclick = () => { DG.tripKind = b.dataset.tk; renderDogam(); });
  bindCells($('#dgBody'));
  $('#dgBody').querySelectorAll('.grp').forEach(b => b.onclick = () => openGroup(groupsOut.find(g => g.key === b.dataset.grp)));
  DG._groups = groupsOut; /* 다른 곳에서 key 로 다시 열 때 */
  LS.set('lm-dg', Object.fromEntries(DGSAVE.map(k => [k, DG[k]])));
  $('#dgSelBar').hidden = !DG.selecting; const tb = $('#dgTripBtn'); tb.hidden = tripsV || DG.selecting || mine; /* 다녀온 곳에서는 '내 여행' 탭이 있으니 숨긴다 */ tb.textContent = '내 여행 만들기'; $('#dgTripName').placeholder = mine ? '여행 이름 (예: 2026 가을 경주)' : '계획 이름 (예: 다음 달 강릉)';
  $('#dgProg').hidden = tripsV;
}
/* 내 여행 만들기: 다녀온 곳으로 여행을 만들지, 가고 싶은 곳으로 계획을 만들지 */
async function newTripFlow() {
  const stamps = allSeen(); const hasV = Object.keys(stamps).length > 0;
  const el = document.createElement('div'); el.className = 'login pick';
  el.innerHTML = `<div class="box"><h2>어떤 여행을 만들까요?</h2><div class="picklist"><button type="button" class="pk" data-k="trip" ${hasV ? '' : 'disabled'}><b>다녀온 곳으로 여행</b><small>도장 찍은 곳을 골라 묶어요${hasV ? '' : ' · 아직 도장이 없어요'}</small></button><button type="button" class="pk" data-k="plan"><b>가고 싶은 곳으로 계획</b><small>아직 안 간 곳을 골라 계획을 세워요</small></button></div><button class="btn ghost" type="button" id="pkNo">취소</button></div>`;
  document.getElementById('app').appendChild(el); el.onclick = e => { if (e.target === el) el.remove(); }; el.querySelector('#pkNo').onclick = () => el.remove();
  el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { el.remove(); DG.view = b.dataset.k === 'trip' ? 'mine' : 'all'; DG.group = 'none'; DG.selecting = true; DG.sel = new Set(); $('#dgSelCount').textContent = '0곳 선택'; renderDogam(); toast(b.dataset.k === 'trip' ? '여행에 넣을 곳을 눌러 고르세요' : '가고 싶은 곳을 눌러 고르세요'); });
}
function openGroup(g) {
  if (!g) return; const t = g.trip; const user = t && !t.auto; const stamps = allSeen();
  const el = document.createElement('section'); el.className = 'detail open grpdetail'; el.setAttribute('aria-hidden', 'false');
  const render = () => {
    const items = t ? t.ids.map(id => byId(id)).filter(Boolean).map(p => ({ p, s: stamps[p.id] || null })) : g.items; const done = items.filter(x => x.s).length, missed = items.length - done;
    const dates = items.filter(x => x.s).map(x => x.s.last).sort(); const range = dates.length ? (dates[0] === dates.at(-1) ? dotDate(dates[0]) : `${dotDate(dates[0])} ~ ${dotDate(dates.at(-1))}`) : '';
    const stat = t ? `${done}곳 다녀옴${missed ? ` · ${t.kind === 'plan' ? '남은 곳' : '못 간 곳'} ${missed}` : ''}` : `방문 ${done} / ${g.total ?? items.length}곳`;
    // 작은 버튼 한 줄
    const acts = [`<button type="button" class="act" data-a="map">🗺 지도</button>`];
    if (t && t.kind === 'trip' && done > 0) acts.push(`<button type="button" class="act" data-a="share">📤 가이드 올리기</button>`, `<button type="button" class="act" data-a="pic">🖼 자랑하기</button>`);
    if (user) acts.push(`<button type="button" class="act" data-a="edit">✏️ 기록</button>`, `<button type="button" class="act" data-a="add">＋ 장소 추가</button>`, `<button type="button" class="act" data-a="rename">이름</button>`, `<button type="button" class="act danger" data-a="del">삭제</button>`);
    if (t && t.auto) acts.push(`<button type="button" class="act" data-a="save">💾 여행으로 저장</button>`);
    if (g.kind === 'sido') acts.push(`<button type="button" class="act" data-a="rank">🏆 TOP 10</button>`);
    const rowHtml = (x, i) => `<li class="trow ${x.s ? 'went' : 'not'}" data-row="${x.p.id}" style="--c:var(--c-${x.p.cat})">${user ? '<span class="grip" aria-label="끌어서 순서 바꾸기">≡</span>' : ''}<span class="num">${i + 1}</span><button type="button" class="t" data-id="${x.p.id}"><b>${x.p.name}</b><small>${x.p.sido} ${x.p.gu}${x.s ? ` · ${dotDate(x.s.last)}` : t && t.kind === 'trip' ? ' · 안 감' : ''}</small></button>${user ? `<span class="ud"><button type="button" class="rm" data-rm="${x.p.id}" aria-label="빼기">×</button></span>` : ''}</li>`;
    el.innerHTML = `<div class="hero gdhero grphero compact"><button class="back" type="button" aria-label="뒤로"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button><div class="gdhero-in"><h2>${esc(t ? t.name : g.title)}${g.badge ? ` <em>${g.badge}</em>` : ''}</h2><p>${[t && t.kind === 'plan' ? `${items.length}곳 계획` : g.sub, t && t.kind === 'trip' ? '' : range, stat].filter(Boolean).join(' · ')}</p></div></div>
      <div class="body"><div class="acts">${acts.join('')}</div>${user && items.length > 1 ? '<p class="note">≡ 를 꾹 눌러 끌면 순서가 바뀌어요. ×로 빼요. 바로 저장돼요.</p>' : ''}
      ${t ? `<ol class="tlist">${items.map(rowHtml).join('')}</ol>` : `<div class="grid">${items.map(x => `<button class="cell ${x.s ? 'visited' : ''}" type="button" data-id="${x.p.id}" style="--c:var(--c-${x.p.cat})"><span class="st">${ICON[x.p.cat]}</span><span class="n">${x.p.name}</span><span class="r">${x.p.sido} ${x.p.gu}</span>${x.s ? `<span class="d">${dotDate(x.s.last)}</span>` : '<span class="d empty">미방문</span>'}</button>`).join('')}</div>`}</div>`;
    el.querySelector('.back').onclick = () => { el.remove(); if (!screens.dogam.hidden) renderDogam(); };
    el.querySelectorAll('[data-id]').forEach(b => b.onclick = () => openDetail(b.dataset.id));
    if (user) dragList(el.querySelector('.tlist'), ids => { Trips.update(t.id, { ids }); t.ids = ids; render(); });
    el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { const id = b.dataset.rm; const before = t.ids.slice(), bm = (t.missed || []).slice(); Trips.update(t.id, { ids: t.ids.filter(x => x !== id), missed: bm.filter(x => x !== id) }); t.ids = t.ids.filter(x => x !== id); render();
      toast(`'${byId(id).name}'${josa(byId(id).name, '을/를')} 뺐어요`, { action: '되돌리기', onAction: () => { Trips.update(t.id, { ids: before, missed: bm }); t.ids = before; render(); } }); });
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { const a = b.dataset.a;
      if (a === 'map') { el.remove(); showTab('map'); if (g.kind === 'set') mapS.setFilter({ set: g.key.slice(4) }); else if (g.kind === 'sido') mapS.setFilter({ sido: g.title }); else if (g.kind === 'cat') { const ck = Object.keys(CATS).find(k => CATS[k].name === g.title); mapS.setFilter(ck ? { cat: ck } : {}); } else mapS.showTrip({ name: t ? t.name : g.title, ids: items.map(x => x.p.id) }); }
      else if (a === 'rank') { el.remove(); openRank({ sido: g.title }); }
      else if (a === 'add') addStopTo(t, () => render());
      else if (a === 'share' || a === 'edit') { el.remove(); tripAction(a, t?.id, t); }
      else if (a === 'del' || a === 'rename' || a === 'save' || a === 'pic') tripAction(a, t?.id, t, { close: () => el.remove(), render }); }); /* 지우기·이름 바꾸기는 화면에 머문 채로 */
  };
  render(); document.getElementById('app').appendChild(el);
}
/* 목록 끌어서 순서 바꾸기: 손잡이(.grip)를 누른 채 위아래로 끈다. 놓으면 onDone(새 id 순서) */
function dragList(list, onDone) {
  if (!list) return;
  list.querySelectorAll('.grip').forEach(h => h.onpointerdown = e => { const row = h.closest('.trow'); if (!row) return; e.preventDefault();
    // 행을 DOM 에서 옮기면 포인터 캡처가 풀리므로 창 전체에서 받는다
    const before = [...list.children].map(r => r.dataset.row).join(','); const drag = { row, y0: e.clientY, h: row.offsetHeight + (parseFloat(getComputedStyle(list).rowGap) || 8) }; row.classList.add('dragging'); list.classList.add('dragging'); try { navigator.vibrate && navigator.vibrate(10); } catch (x) {}
    const move = ev => { const dy = ev.clientY - drag.y0; drag.row.style.transform = `translateY(${dy}px)`;
      const cur = [...list.children]; const idx = cur.indexOf(drag.row); const target = Math.max(0, Math.min(cur.length - 1, idx + Math.round(dy / drag.h)));
      if (target !== idx) { const ref = cur[target]; if (target > idx) ref.after(drag.row); else ref.before(drag.row); drag.y0 = ev.clientY; drag.row.style.transform = ''; } };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('blur', up);
      drag.row.style.transform = ''; drag.row.classList.remove('dragging'); list.classList.remove('dragging'); const order = [...list.children].map(r => r.dataset.row); if (order.join(',') !== before) onDone(order); }; /* 순서가 안 바뀌면(그냥 탭) 저장·다시 그리기 생략 */
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); window.addEventListener('blur', up); });
}
/* 여행에 랜드마크 하나 더 넣기 (검색) */
function addStopTo(t, after) { const stamps = store.allStamps(); const pk = document.createElement('div'); pk.className = 'login pick';
  const list = q => L.filter(p => !t.ids.includes(p.id) && (!q || matchQ(p.name + ' ' + p.sido + ' ' + p.gu, q))).sort((a, b) => (stamps[b.id] ? 1 : 0) - (stamps[a.id] ? 1 : 0) || (b.pop || 0) - (a.pop || 0)).slice(0, 30);
  const rr = q => { pk.innerHTML = `<div class="box"><h2>어디를 넣을까요?</h2><input type="search" id="pkQ" placeholder="이름·지역으로 찾기" value="${q.replace(/"/g, '&quot;')}" autocomplete="off"><div class="picklist">${list(q).map(p => `<button type="button" class="pk" data-p="${p.id}"><b>${p.name}</b><small>${p.sido} ${p.gu}${stamps[p.id] ? ' · 다녀옴' : ''}</small></button>`).join('') || '<p class="note">없어요</p>'}</div><button class="btn ghost" type="button" id="pkNo">닫기</button></div>`;
    const inp = pk.querySelector('#pkQ'); inp.oninput = () => { const v = inp.value, pos = inp.selectionStart; rr(v); const i2 = pk.querySelector('#pkQ'); i2.focus(); i2.setSelectionRange(pos, pos); };
    pk.querySelector('#pkNo').onclick = () => pk.remove();
    pk.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { Trips.update(t.id, { ids: [...t.ids, b.dataset.p] }); t.ids = [...t.ids, b.dataset.p]; pk.remove(); toast(`'${byId(b.dataset.p).name}' 넣었어요`); after && after(); }); };
  rr(''); pk.onclick = e => { if (e.target === pk) pk.remove(); }; document.getElementById('app').appendChild(pk); setTimeout(() => pk.querySelector('#pkQ').focus(), 60); }
function openGroupByKey(key) { const g = (DG._groups || []).find(x => x.key === key); if (g) openGroup(g); }
async function tripAction(act, id, t, ui) { if (!t) return;
  if (act === 'map') { showTab('map'); mapS.showTrip(t); }
  else if (act === 'share') shareTrip(t);
  else if (act === 'pic') shareTripImage(t);
  else if (act === 'save') { const nt = Trips.add(t.name, t.ids, 'trip', { doneAt: t.date }); renderDogam(); ui && ui.close(); openGroupByKey(nt.id); toast('여행으로 저장했어요', { action: '기록하기', onAction: () => openTripEdit(nt) }); }
  else if (act === 'edit') openTripEdit(t);
  else if (act === 'rename') { const n = await ask({ title: '이름 바꾸기', input: '새 이름', value: t.name, yes: '바꾸기', no: '취소' }); if (n) { Trips.update(id, { name: n }); renderDogam(); if (ui) { ui.close(); openGroupByKey(id); } } }
  else if (act === 'del') { if (!(await ask({ title: `'${t.name}'${josa(t.name, '을/를')} 지울까요?`, text: '도장은 그대로 남아요. 30일 안에는 내 정보에서 되살릴 수 있어요.', yes: '지우기', no: '그대로 두기' }))) return;
    Trips.remove(id); if (DG.trip === id) DG.trip = ''; renderDogam(); ui && ui.close(); toast(`'${t.name}'${josa(t.name, '을/를')} 지웠어요`, { action: '되돌리기', onAction: () => { Trips.restore(id); renderDogam(); toast('되돌렸어요'); } }); }
}
/* 계획·이어 다니는 여행의 경로 고치기: 모든 곳 보기에서 골라 담는다 */
function editTrip(t) { showTab('dogam'); DG.view = 'all'; DG.trip = ''; DG.selecting = true; DG.editTrip = t.id; DG.sel = new Set(t.ids); $('#dgSelCount').textContent = `${DG.sel.size}곳 선택`; $('#dgTripName').value = t.name; renderDogam(); toast('넣거나 뺄 곳을 누르세요'); }
$('#dgMine').onclick = () => { DG.view = 'mine'; DG.trip = ''; DG.selecting = false; renderDogam(); }; $('#dgTrips').onclick = () => { DG.view = 'trips'; DG.selecting = false; renderDogam(); }; $('#dgAll').onclick = () => { DG.view = 'all'; DG.trip = ''; DG.selecting = false; renderDogam(); };
$('#dgQ').oninput = e => { DG.q = e.target.value; renderDogam(); };
$('#dgFilterBtn').onclick = () => { $('#dgFilters').hidden = !$('#dgFilters').hidden; renderDogam(); };
$('#dgTripBtn').onclick = () => { DG.selecting = true; DG.group = 'none'; DG.sel = new Set(); $('#dgSelCount').textContent = '0곳 선택'; renderDogam(); toast(DG.view === 'mine' ? '여행에 넣을 곳을 눌러 고르세요' : '가고 싶은 곳을 눌러 고르세요'); };
$('#dgTripCancel').onclick = () => { DG.selecting = false; DG.editTrip = null; $('#dgTripName').value = ''; renderDogam(); };
$('#dgTripSave').onclick = () => { if (!DG.sel.size) { toast('한 곳 이상 골라 주세요'); return; }
  const auto = (() => { const ps = [...DG.sel].map(byId).filter(Boolean); const cnt = {}; ps.forEach(p => { const g = p.gu.replace(/(시|군|구)$/, ''); cnt[g] = (cnt[g] || 0) + 1; });
    const tops = Object.entries(cnt).sort((x, y) => y[1] - x[1]).slice(0, 2).map(x => x[0]).join('·'); return `${dotDate(kstToday())} ${tops} ${DG.view === 'mine' ? '여행' : '계획'}`; })();
  const n = $('#dgTripName').value.trim() || auto;
  if (DG.editTrip) { const t = Trips.all().find(x => x.id === DG.editTrip); DG.selecting = false; DG.editTrip = null; $('#dgTripName').value = ''; if (t) { const stamps = store.allStamps(); Trips.update(t.id, { name: n, ids: [...DG.sel], missed: (t.missed || []).filter(id => DG.sel.has(id) && !stamps[id]) }); DG.view = t.kind === 'trip' ? 'mine' : 'all'; DG.group = t.kind; toast(`'${n}' 경로를 고쳤어요`); } renderDogam(); return; }
  const kind = DG.view === 'mine' ? 'trip' : 'plan'; const nt = Trips.add(n, [...DG.sel], kind); DG.selecting = false; $('#dgTripName').value = ''; DG.view = 'trips'; DG.tripKind = kind; renderDogam(); toast(kind === 'trip' ? `'${n}' 여행을 만들었어요` : `'${n}' 계획을 만들었어요`, { action: '기록하기', onAction: () => openTripEdit(nt) }); };

/* ---------- 내 여행에 담기 ----------
   랜드마크를 내가 만든 여행·계획에 넣는다. 묶음이 없으면 그 자리에서 새로 만든다 */
async function addToTrip(p) {
  const mine = Trips.all().filter(t => !t.auto);
  const el = document.createElement('div'); el.className = 'login pick';
  el.innerHTML = `<div class="box"><h2>어디에 담을까요?</h2><p>${p.name}</p><div class="picklist">${mine.map(t => `<button type="button" class="pk" data-t="${t.id}" ${t.ids.includes(p.id) ? 'disabled' : ''}><b>${esc(t.name)}</b><small>${t.kind === 'plan' ? '계획' : '여행'} · ${t.ids.length}곳${t.ids.includes(p.id) ? ' · 이미 있어요' : ''}</small></button>`).join('')}<button type="button" class="pk new" data-t="new"><b>+ 새 여행 만들기</b><small>이름만 정하면 돼요</small></button></div><button class="btn ghost" type="button" id="pkNo">취소</button></div>`;
  document.getElementById('app').appendChild(el);
  el.onclick = e => { if (e.target === el) el.remove(); }; el.querySelector('#pkNo').onclick = () => el.remove();
  el.querySelectorAll('[data-t]').forEach(b => b.onclick = async () => { const tid = b.dataset.t; el.remove();
    if (tid === 'new') { const n = await ask({ title: '여행 이름', input: '예: 다음 달 강릉', value: `${p.gu.replace(/(시|군|구)$/, '')} 가볼 곳`, yes: '만들기', no: '취소' }); if (!n) return; const t = Trips.add(n, [p.id], 'plan'); toast(`'${t.name}'에 담았어요`, { action: '보기', onAction: () => { DG.view = 'trips'; DG.tripKind = 'plan'; showTab('dogam'); } }); return; }
    const t = Trips.all().find(x => x.id === tid); if (!t) return; Trips.update(t.id, { ids: [...t.ids, p.id] }); toast(`'${t.name}'에 담았어요`, { action: '보기', onAction: () => { DG.view = 'trips'; DG.tripKind = t.kind; showTab('dogam'); } }); if (!screens.dogam.hidden) renderDogam(); });
}

/* ---------- 신고·차단 ---------- */
function reportSheet(kind, id, userId, nick, after) {
  const S = window.Store.Safety; const el = document.createElement('div'); el.className = 'login';
  const REASONS = ['음란·선정적', '욕설·혐오', '광고·사기', '남의 사진·저작권', '위치가 틀림', '기타'];
  el.innerHTML = `<div class="box"><h2>${kind === 'photo' ? '사진' : '가이드'} 신고</h2><p>${nick ? `작성자 ${esc(nick)}` : ''}</p><div class="picklist">${REASONS.map(r => `<button type="button" class="pk" data-r="${r}"><b>${r}</b></button>`).join('')}</div>${userId ? `<button type="button" class="btn ghost danger" id="rpBlock">${esc(nick) || '이 사용자'} 차단하기</button>` : ''}<button class="btn ghost" type="button" id="rpNo">취소</button></div>`;
  document.getElementById('app').appendChild(el); el.onclick = e => { if (e.target === el) el.remove(); }; el.querySelector('#rpNo').onclick = () => el.remove();
  el.querySelectorAll('[data-r]').forEach(b => b.onclick = async () => { el.remove(); try { await S.report(kind, id, b.dataset.r, { userId }); toast(cfg.supabaseUrl ? '신고를 보냈어요. 살펴보고 조치할게요' : '신고를 기록했어요'); } catch (e) { toast(e.message || '신고를 보내지 못했어요'); } });
  const bk = el.querySelector('#rpBlock'); if (bk) bk.onclick = async () => { el.remove(); if (!(await ask({ title: `${nick || '이 사용자'}를 차단할까요?`, text: '이 사람이 올린 사진·가이드·댓글이 더 이상 보이지 않아요. 내 정보에서 풀 수 있어요.', yes: '차단', no: '취소' }))) return; S.block(userId); toast('차단했어요'); mapS.refresh(); after && after(); };
}

/* ---------- 지역 순위 ----------
   아직 사용자 데이터가 없으니 운영자가 정한 대표성(pop)으로 줄 세운다. 도장이 쌓이면 그쪽으로 바꾼다 */
const famKey = n => n.replace(/[\s(·].*/, '').slice(0, 3);
function rankList(sido, gu) {
  const pri = p => (p.sets || []).includes('ktop100') ? 0 : (p.sets || []).includes('natpark') ? 1 : (p.sets || []).includes('local') ? 2 : 3; // 같은 점수면 관광지 쪽을 앞에
  let ps = L.filter(p => (!sido || p.sido === sido) && (!gu || p.gu === gu)).sort((a, b) => (b.pop || 0) - (a.pop || 0) || pri(a) - pri(b) || a.name.localeCompare(b.name, 'ko'));
  const seen = new Set(); ps = ps.filter(p => { const k = famKey(p.name); if (seen.has(k)) return false; seen.add(k); return true; }); // 설악산국립공원·설악산 대청봉 같은 짝은 하나만
  return ps.slice(0, 10);
}
function openRank(init) {
  const R = { sido: init?.sido || '', gu: init?.gu || '' }; const stamps = store.allStamps();
  const el = document.createElement('section'); el.className = 'detail open rankscr'; el.setAttribute('aria-hidden', 'false');
  const render = () => {
    const list = rankList(R.sido, R.gu); const gus = R.sido ? [...new Set(L.filter(p => p.sido === R.sido).map(p => p.gu))].sort((a, b) => a.localeCompare(b, 'ko')) : [];
    const title = R.gu ? `${R.sido} ${R.gu}` : R.sido || '전국'; const went = list.filter(p => stamps[p.id]).length;
    el.innerHTML = `<div class="hero gdhero grphero"><button class="back" type="button" aria-label="뒤로"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button><div class="gdhero-in"><h2>${title} TOP ${list.length}</h2><p class="gr">이 중 <b>${went}</b>곳 다녀옴</p></div></div>
      <div class="body">
        <div class="sel2"><select id="rkSido"><option value="">전국</option>${Object.keys(window.SIDO_CENTER).map(s => `<option value="${s}" ${R.sido === s ? 'selected' : ''}>${s}</option>`).join('')}</select><select id="rkGu" ${gus.length > 1 ? '' : 'disabled'}><option value="">${R.sido ? R.sido + ' 전체' : '시·군·구'}</option>${gus.map(g => `<option value="${g}" ${R.gu === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
        <ol class="ranklist">${list.map((p, i) => `<li><button type="button" data-id="${p.id}" class="${stamps[p.id] ? 'went' : ''}" style="--c:var(--c-${p.cat})"><span class="rk">${i + 1}</span><span class="ic">${ICON[p.cat]}</span><span class="t"><b>${p.name}</b><small>${p.sido} ${p.gu}${(p.sets || []).includes('ktop100') ? ' · 100선' : (p.sets || []).includes('mt100') ? ' · 100대 명산' : ''}</small></span><span class="st">${stamps[p.id] ? '✓ 다녀옴' : ''}</span></button></li>`).join('')}</ol>
      </div>
      <div class="fixed"><button class="btn primary" type="button" id="rkMap">지도에서 보기</button></div>`;
    el.querySelector('.back').onclick = () => el.remove();
    el.querySelector('#rkSido').onchange = e => { R.sido = e.target.value; R.gu = ''; render(); };
    el.querySelector('#rkGu').onchange = e => { R.gu = e.target.value; render(); };
    el.querySelectorAll('[data-id]').forEach(b => b.onclick = () => openDetail(b.dataset.id));
    el.querySelector('#rkMap').onclick = () => { el.remove(); showTab('map'); mapS.setFilter(R.gu ? { sido: R.sido, gu: R.gu } : R.sido ? { sido: R.sido } : {}); };
  };
  render(); document.getElementById('app').appendChild(el);
}
$('#rankBtn').onclick = () => openRank(mapS.region());

/* ---------- 알림 권한 ---------- */
/* 도장을 한 번이라도 찍은 사람에게만, 딱 한 번 물어본다 */
async function askNotify() {
  if (LS.get('lm-notify-asked', false)) return;
  if (LocalNoti) { try { const p = await LocalNoti.checkPermissions(); if (p.display !== 'prompt' && p.display !== 'prompt-with-rationale') return; } catch (e) { return; } }
  else if (!('Notification' in window) || Notification.permission !== 'default') return;
  if (!Object.keys(store.allStamps()).length) return;
  LS.set('lm-notify-asked', true);
  const ok = await ask({ title: '밤에 하루를 정리해 드릴까요?', text: '밤 10시에 그날 다녀온 곳을 정리해 알려드려요. 다른 알림은 없어요.', yes: '네, 알려 주세요', no: '괜찮아요' });
  if (ok) { try { if (LocalNoti) { await LocalNoti.requestPermissions(); await scheduleEvening(); } else await Notification.requestPermission(); } catch (e) {} }
}

/* ---------- 공유 카드 ---------- */
async function shareImage(make, name, title) {
  toast('그림을 만드는 중…');
  try { const c = await make(); const r = await window.ShareCard.send(c, name, title);
    if (!r.ok) toast(r.reason); else if (r.saved) toast('사진으로 저장했어요'); }
  catch (e) { toast('그림을 만들지 못했어요'); }
}
const shareTripImage = t => shareImage(() => window.ShareCard.trip(t, { stamps: store.allStamps() }), `여행-${t.name}.png`, t.name);
const shareBadgeImage = b => shareImage(() => window.ShareCard.badge(b), `뱃지-${b.name}.png`, b.name);

/* ---------- 뱃지 ---------- */
function badgeCtx() { const u = store.getUser(); const mine = window.Guides.all().filter(g => g.mine); return { stamps: store.allStamps(), suggests: LS.get('lm-suggest', []).length, photos: u ? store.photos.filter(x => x.userId === u.id).length : 0, myGuides: mine, sharedGuides: mine.length, regionStats: mapS.regionStats() }; }
const badgeList = () => window.Badges.evaluate(badgeCtx());
/* 새로 받은 뱃지를 쾅 하고 보여준다 (여러 개면 차례로) */
function awardBadges() { return new Promise(res => { const fresh = window.Badges.award(badgeList()); if (!fresh.length) return res(false);
  let i = 0; const el = document.createElement('div'); el.className = 'login award'; document.getElementById('app').appendChild(el);
  const show = () => { const b = fresh[i]; el.innerHTML = `<div class="box"><p class="aw-k">뱃지 획득${fresh.length > 1 ? ` ${i + 1}/${fresh.length}` : ''}</p><div class="aw-b">${window.Badges.svg(b, 180)}</div><h2>${b.name}</h2><p>${b.sub || ''}</p><button class="btn primary" type="button" id="awOk">${i < fresh.length - 1 ? '다음' : '확인'}</button><button class="btn ghost" type="button" id="awShare">자랑하기</button></div>`;
    try { navigator.vibrate && navigator.vibrate([0, 60, 40, 90]); } catch (e) {} el.querySelector('#awOk').onclick = () => { i++; if (i < fresh.length) show(); else { el.remove(); res(true); } }; el.querySelector('#awShare').onclick = () => shareBadgeImage(b); };
  show(); }); }
/* 랜드마크 탭 하단 "내 진행" (접이식): 가까운 뱃지 3개 + 세트·지역 진행바 */
function renderProg() {
  const stamps = store.allStamps(); const list = badgeList(); const got = list.filter(b => b.done).length;
  const near = list.filter(b => !b.done && b.cur > 0).sort((a, b) => (b.max - b.cur) - (a.max - a.cur) || b.cur / b.max - a.cur / a.max).reverse().slice(0, 3);
  const bar = (label, d, n) => `<div class="prow"><span>${label}</span><div class="pbar"><i style="width:${n ? d / n * 100 : 0}%"></i></div><b>${d}/${n}</b></div>`;
  const sets = SETS.map(s => { const ps = L.filter(p => p.sets.includes(s.id)); return bar(s.name, ps.filter(p => stamps[p.id]).length, ps.length); }).join('');
  const sidos = Object.keys(window.SIDO_CENTER).map(sd => { const ps = L.filter(p => p.sido === sd); return { sd, d: ps.filter(p => stamps[p.id]).length, n: ps.length }; }).filter(x => x.d).sort((a, b) => b.d / b.n - a.d / a.n).map(x => bar(x.sd, x.d, x.n)).join('');
  $('#dgProgSum').textContent = `뱃지 ${got}/${list.length}`;
  $('#dgProgBody').innerHTML = `${near.length ? `<h4>곧 받을 뱃지</h4><div class="nearb">${near.map(b => `<div class="nb2">${window.Badges.svg(b, 64)}<span>${b.name}</span><small>${b.max - b.cur}${b.id.startsWith('rg:') || b.id.startsWith('sido:') || b.id.startsWith('th:') || b.id.startsWith('set:') ? '곳' : ''} 남음</small></div>`).join('')}</div>` : ''}
    <h4>세트</h4>${sets}${sidos ? `<h4>지역</h4>${sidos}` : ''}<button type="button" class="btn ghost sm" id="dgAllBadges">뱃지 전부 보기</button>`;
  $('#dgAllBadges').onclick = () => showTab('me');
  const det = $('#dgProg'); det.open = LS.get('lm-prog-open', false); det.ontoggle = () => LS.set('lm-prog-open', det.open);
}

/* ---------- 하루 마감 ----------
   도장을 찍을 때는 아무것도 묻지 않는다. 그날 찍은 도장은 자동으로 여행이 되고,
   밤 10시(앱이 열려 있을 때)에 한 번만 알려 준다. 그때 앱이 닫혀 있었으면 다음에 열 때 한 번. */
const kstHour = () => new Date(Date.now() + 9 * 3600e3).getUTCHours();
const Nudge = {
  busy: false,
  log() { return LS.get('lm-sealed', {}); }, mark(date, v) { const l = this.log(); l[date] = v; LS.set('lm-sealed', l); },
  /* 계획을 다 돌았으면 조용히 여행으로 바꾼다 */
  promote() { const stamps = store.allStamps(); const done = [];
    Trips.all().filter(t => t.kind === 'plan' && t.ids.length && t.ids.every(id => stamps[id])).forEach(t => { Trips.update(t.id, { kind: 'trip', doneAt: kstToday() }); done.push(t); });
    return done; },
  /* 그날 찍은 도장을 여행으로 굳힌다 */
  seal(date) { const a = autoTrips(store.allStamps()).find(t => t.date === date); if (!a || !a.ids.length) return null;
    const ex = Trips.all().find(t => t.kind === 'trip' && t.doneAt === date && !t.guideId); /* 그날 여행이 이미 있으면(22시 뒤에 더 찍은 경우) 거기에 붙인다 */
    if (ex) { Trips.update(ex.id, { ids: [...ex.ids, ...a.ids.filter(id => !ex.ids.includes(id))] }); return ex; }
    return Trips.add(a.name, a.ids, 'trip', { doneAt: date }); },
  async run() {
    if (this.busy) return; this.busy = true;
    let rateId = null, told = null;
    try {
      const promoted = this.promote(); const today = kstToday(), log = this.log();
      const days = new Set(); Object.values(store.allStamps()).forEach(s => (s.days && s.days.length ? s.days : [s.first, s.last]).forEach(d => d && days.add(d)));
      // 지난 날은 한꺼번에 굳히고 한꺼번에 '알림 끝' 표시한다. 그래야 1분마다 다시 뜨지 않는다
      const past = [...days].filter(d => d < today).sort(); const fresh = past.filter(d => log[d] !== 'told');
      past.forEach(d => { this.seal(d); this.mark(d, 'told'); }); /* 이미 알린 날도 남은 도장이 있으면 조용히 붙인다 */
      told = fresh.length ? fresh[fresh.length - 1] : null;
      if (!told && kstHour() >= 22 && days.has(today)) { this.seal(today); if (log[today] !== 'told') { this.mark(today, 'told'); told = today; } }
      if (!screens.dogam.hidden) renderDogam();
      if (!told) return;
      const rateable = promoted.find(t => t.guideId && !t.rated) || Trips.all().find(t => t.kind === 'trip' && t.guideId && !t.rated && t.doneAt === told);
      if (rateable) { Trips.update(rateable.id, { rated: true }); rateId = rateable.guideId; return; }
      const t = Trips.all().filter(x => x.doneAt === told && x.kind === 'trip').sort((x, y) => y.ids.length - x.ids.length)[0];
      if (!t) return;
      const when = told === today ? '오늘' : dotDate(told);
      notify(`${when} 다녀온 ${t.ids.length}곳을 여행으로 저장했어요`, `${t.name} · 가이드로 올리면 다른 여행자에게 도움이 돼요`);
      toast(`${when} ${t.ids.length}곳을 여행으로 저장했어요`, { action: '가이드로', onAction: () => shareTrip(t) });
    } finally { this.busy = false; }
    if (rateId) await rateGuide(rateId); // busy 를 푼 뒤에 띄운다
  },
};
function notify(title, body) {
  if (LocalNoti) { LocalNoti.schedule({ notifications: [{ id: 1, title, body }] }).catch(() => {}); return; }
  if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
  /* 안드로이드 크롬은 new Notification 이 안 되고 서비스워커로만 띄울 수 있다 */
  const sw = navigator.serviceWorker && navigator.serviceWorker.ready; if (sw) sw.then(r => r.showNotification(title, { body, tag: 'lm-day', icon: 'icons/icon-192.png' })).catch(() => { try { new Notification(title, { body, tag: 'lm-day' }); } catch (e) {} }); else { try { new Notification(title, { body, tag: 'lm-day' }); } catch (e) {} }
}
/* 네이티브에서는 밤 10시에 로컬 알림을 미리 걸어 둔다 (앱이 꺼져 있어도 울린다). 웹에서는 앱을 열 때 정리한다 */
async function scheduleEvening() {
  if (!LocalNoti) return; try { const p = await LocalNoti.checkPermissions(); if (p.display !== 'granted') return;
    const at = new Date(); at.setHours(22, 0, 0, 0); if (at.getTime() < Date.now()) return; await LocalNoti.cancel({ notifications: [{ id: 2200 }] });
    await LocalNoti.schedule({ notifications: [{ id: 2200, title: '오늘 찍은 도장을 여행으로 정리했어요', body: '열어서 확인하고, 가이드로도 올려 보세요', schedule: { at } }] }); } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(() => Nudge.run(), 800); });
setInterval(() => Nudge.run(), 60e3);

/* ---------- 가이드 ---------- */
const G = { tab: 'all', q: '', sort: 'likes', region: '', hours: '', move: '', mineKind: '', src: '' };
if (!Object.keys(store.allStamps()).length && mapS.pos()) G.sort = 'near'; // 아직 아무 데도 안 가 본 사람은 '내 주변'이 먼저
const sidoOf = g => (byId(g.stops[0]?.id) || {}).sido || g.region.split(' ')[0];
const hoursLabel = h => !h ? '' : h >= 24 ? `${Math.round(h / 24)}박 ${Math.round(h / 24) + 1}일` : `약 ${h}시간`;
const hoursBand = h => h >= 24 ? 'stay' : h > 5 ? 'day' : 'half';
const moveKind = g => { const ms = new Set((g.legs || []).map(l => l.mode).filter(m => m !== '도보')); if (!ms.size) return 'walk'; if (ms.size === 1 && ms.has('자차')) return 'car'; if (!ms.has('자차')) return 'transit'; return 'mix'; };
function guideList() {
  const stamps = store.allStamps(); let list = window.Guides.all();
  if (G.q) list = list.filter(g => matchQ(g.title + ' ' + g.region + ' ' + g.author, G.q));
  if (G.tab === 'region' && G.region) list = list.filter(g => sidoOf(g) === G.region);
  if (G.tab === 'mine') { const planned = new Set(Trips.all().map(t => t.guideId).filter(Boolean)); list = list.filter(g => (G.mineKind === 'like' || !G.mineKind) && window.Guides.liked(g.id) || (G.mineKind === 'plan' || !G.mineKind) && planned.has(g.id) || (G.mineKind === 'mine' || !G.mineKind) && g.mine); }
  if (G.src) list = list.filter(g => G.src === 'op' ? g.op : !g.op);
  if (G.hours) list = list.filter(g => hoursBand(g.hours || 0) === G.hours);
  if (G.move) list = list.filter(g => { const k = moveKind(g); return G.move === 'car' ? k === 'car' || k === 'walk' : G.move === 'transit' ? k === 'transit' || k === 'walk' : k === 'walk'; });
  const me = myPos(); const d0 = g => { const p = byId(g.stops[0]?.id); return p ? window.Store.dist(me, p) : 1e9; };
  if (G.sort === 'likes') list.sort((a, b) => b.likes - a.likes); else if (G.sort === 'done') list.sort((a, b) => b.completions - a.completions); else if (G.sort === 'near') list.sort((a, b) => d0(a) - d0(b)); else list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { list, stamps, d0 };
}
function renderGuide() {
  document.querySelectorAll('[data-gt]').forEach(b => b.setAttribute('aria-selected', b.dataset.gt === G.tab));
  const chip = (k, val, label, cur) => `<button type="button" class="chip" data-k="${k}" data-v="${val}" aria-pressed="${cur === val}">${label}</button>`;
  $('#gdFilters').innerHTML = `<div class="frow"><span>걸리는 시간</span>${chip('hours', '', '전체', G.hours)}${chip('hours', 'half', '반나절', G.hours)}${chip('hours', 'day', '하루', G.hours)}${chip('hours', 'stay', '1박 이상', G.hours)}</div>
    <div class="frow"><span>출처</span>${chip('src', '', '전체', G.src)}${chip('src', 'op', '운영자 추천', G.src)}${chip('src', 'user', '여행자', G.src)}</div>
    <div class="frow"><span>이동수단</span>${chip('move', '', '전체', G.move)}${chip('move', 'car', '자차', G.move)}${chip('move', 'transit', '대중교통', G.move)}${chip('move', 'walk', '도보만', G.move)}</div>
    ${G.tab === 'mine' ? `<div class="frow"><span>구분</span>${chip('mineKind', '', '전체', G.mineKind)}${chip('mineKind', 'like', '👍 추천한', G.mineKind)}${chip('mineKind', 'plan', '내 계획으로 가져온', G.mineKind)}${chip('mineKind', 'mine', '내가 올린', G.mineKind)}</div>` : ''}`;
  $('#gdFilters').querySelectorAll('.chip').forEach(b => b.onclick = () => { G[b.dataset.k] = b.dataset.v; renderGuide(); });
  const active = [G.hours, G.move, G.mineKind, G.src].filter(Boolean).length; $('#gdFilterBtn').textContent = active ? `필터 ${active}` : '필터'; $('#gdFilterBtn').setAttribute('aria-pressed', String(active > 0 || !$('#gdFilters').hidden));
  const { list, stamps, d0 } = guideList();
  $('#gdCrumb').innerHTML = G.tab === 'region' && G.region ? `<button type="button" class="chip" id="gdBack">← 모든 지역</button><b class="crumb">${G.region}</b>` : '';
  const bk = $('#gdBack'); if (bk) bk.onclick = () => { G.region = ''; renderGuide(); };
  $('#gdSort').hidden = G.tab === 'region' && !G.region;
  // 지역 탭 첫 화면: 시·도 카드
  if (G.tab === 'region' && !G.region) { const by = {}; list.forEach(g => (by[sidoOf(g)] = by[sidoOf(g)] || []).push(g)); const keys = Object.keys(by).sort((a, b) => by[b].length - by[a].length || a.localeCompare(b, 'ko'));
    $('#gdSum').innerHTML = `지역 <b>${keys.length}</b>곳 · 동선 ${list.length}개`;
    $('#gdBody').innerHTML = keys.length ? `<div class="grps">${keys.map(k => `<button type="button" class="grp region" data-rg="${k}"><div class="grp-h"><div class="grp-t"><b>${k}</b></div><span class="grp-n">${by[k].length}개</span></div><div class="grp-s">${by[k].slice(0, 2).map(g => esc(g.title)).join(' · ')}${by[k].length > 2 ? ' …' : ''}</div></button>`).join('')}</div>` : '<div class="empty">조건에 맞는 가이드가 없어요.</div>';
    $('#gdBody').querySelectorAll('[data-rg]').forEach(b => b.onclick = () => { G.region = b.dataset.rg; renderGuide(); }); return; }
  $('#gdSum').innerHTML = `가이드 <b>${list.length}</b>개`;
  $('#gdBody').innerHTML = list.length ? list.map(g => { const names = g.stops.map(s => byId(s.id)?.name).filter(Boolean); const done = g.stops.filter(s => stamps[s.id]).length; const av = window.Guides.avg(g);
    const region = sidoOf(g), gu = (byId(g.stops[0]?.id) || {}).gu || ''; const titleClean = g.title.replace(/\s*\(.*\)\s*$/, '');
    return `<button type="button" class="gcard ${g.mine ? 'mine' : ''}" data-g="${g.id}"><div class="greg"><b>${window.SIDO_FULL[region] || region} ${gu}</b>${g.op ? '<em class="op">운영자</em>' : g.mine ? '<em>내 가이드</em>' : ''}</div><div class="gh"><b>${esc(titleClean)}</b></div><div class="gm">${g.stops.length}곳${g.hours ? ' · ' + hoursLabel(g.hours) : ''}${g.transport ? ' · ' + esc(g.transport) : ''}${G.sort === 'near' ? ` · ${fmt(d0(g))}` : ''}</div><div class="gs">${names.map((n, i) => `<span>${i + 1}. ${n}</span>`).join('')}</div><div class="gr"><span class="st ${av ? '' : 'dim'}">${av ? window.Guides.stars(av) : '☆☆☆☆☆'}</span> ${[av ? av.toFixed(1) : '', g.completions ? `${g.completions}명 다녀옴` : '', `👍 ${g.likes}`].filter(Boolean).join(' · ')}${done ? ` · <b class="gd-done">내가 간 곳 ${done}/${g.stops.length}</b>` : ''}</div></button>`; }).join('')
    : `<div class="empty cta"><p>${G.tab === 'mine' ? '👍 누른 가이드, 담아 온 가이드, 내가 올린 가이드가 여기 모여요.' : '조건에 맞는 동선이 없어요.'}</p><button type="button" class="btn primary" id="gdGoAll">전체 가이드 보기</button></div>`;
  const gga = $('#gdGoAll'); if (gga) gga.onclick = () => { G.tab = 'all'; G.hours = ''; G.move = ''; G.src = ''; G.q = ''; $('#gdQ').value = ''; renderGuide(); };
  $('#gdBody').querySelectorAll('.gcard').forEach(b => b.onclick = () => openGuide(b.dataset.g));
}
$('#gdSort').value = G.sort;
$('#gdQ').oninput = e => { G.q = e.target.value; renderGuide(); }; $('#gdSort').onchange = e => { G.sort = e.target.value; renderGuide(); };
$('#gdFilterBtn').onclick = () => { $('#gdFilters').hidden = !$('#gdFilters').hidden; renderGuide(); };
/* 내 여행 중에서 골라 가이드로 올린다 */
$('#gdUpBtn').onclick = async () => { if (!(await requireLogin())) return; const stamps = store.allStamps(); const mine = Trips.all().filter(t => t.kind === 'trip' && t.ids.some(id => stamps[id]));
  if (!mine.length) { toast('먼저 다녀온 곳으로 여행을 만들어 주세요', { action: '만들기', onAction: () => { DG.view = 'mine'; showTab('dogam'); } }); return; }
  const el = document.createElement('div'); el.className = 'login pick';
  el.innerHTML = `<div class="box"><h2>어떤 여행을 올릴까요?</h2><div class="picklist">${mine.map(t => `<button type="button" class="pk" data-t="${t.id}"><b>${esc(t.name)}</b><small>${t.ids.length}곳 · ${t.doneAt ? dotDate(t.doneAt) : ''}</small></button>`).join('')}</div><button class="btn ghost" type="button" id="pkNo">취소</button></div>`;
  document.getElementById('app').appendChild(el); el.onclick = e => { if (e.target === el) el.remove(); }; el.querySelector('#pkNo').onclick = () => el.remove();
  el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { const t = mine.find(x => x.id === b.dataset.t); el.remove(); if (t) shareTrip(t); }); };
document.querySelectorAll('[data-gt]').forEach(b => b.onclick = () => { G.tab = b.dataset.gt; G.region = ''; G.mineKind = ''; renderGuide(); });
function openGuide(id) {
  const g = window.Guides.byId(id); if (!g) return; const stamps = store.allStamps(), av = window.Guides.avg(g);
  const el = document.createElement('section'); el.className = 'detail open gdetail'; el.setAttribute('aria-hidden', 'false');
  el.innerHTML = `<div class="hero gdhero"><button class="back" type="button" aria-label="뒤로"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button><div class="gdhero-in"><h2>${esc(g.title)}</h2><p>${esc(g.author)} · ${g.region} · ${g.stops.length}곳${g.hours ? ` · ${hoursLabel(g.hours)}` : ''}${g.transport ? ` · ${esc(g.transport)}` : ''}</p><p class="gr">${av ? `<span class="st">${window.Guides.stars(av)}</span> ${av.toFixed(1)} (${g.ratings.length})` : '아직 평가 없음'}${g.completions ? ` · ${g.completions}명 다녀옴` : ''} · 👍 ${g.likes}</p></div></div>
  <div class="body">
    ${g.tip ? `<div class="gtip">💡 ${esc(g.tip)}</div>` : ''}
    <ol class="route view">${g.stops.map((s, i) => { const p = byId(s.id); if (!p) return ''; const lg = g.legs && g.legs[i]; return `<li class="stop" style="--c:var(--c-${p.cat})"><div class="stophead"><span class="num">${i + 1}</span><b>${p.name}</b></div><small>${p.sido} ${p.gu}${stamps[s.id] ? ' · <span class="ok">다녀옴</span>' : ''}${s.stay ? ` · 머문 시간 ${s.stay}` : ''}</small>${s.note ? `<p>${esc(s.note)}</p>` : ''}${(s.photos || []).length ? `<div class="phrow view">${s.photos.map(photoRef).filter(Boolean).map((ph, k) => `<button type="button" class="ph" data-gph="${i}:${k}"><img src="${ph.url}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}</li>` + (i < g.stops.length - 1 ? `<li class="leg"><div class="legline"></div><div class="legbox view"><b class="mode">${lg ? lg.mode + (lg.sub ? ' · ' + lg.sub : '') : '이동'}</b>${lg && lg.mins ? `<span class="mins">약 ${lg.mins}분</span>` : ''}${lg && lg.text ? `<p>${esc(lg.text)}</p>` : ''}</div></li>` : ''); }).join('')}</ol>
    ${!g.mine ? `<button type="button" class="linkbtn rep2" id="gRep">신고 · 차단</button>` : `<div class="ownrow"><button type="button" class="btn small" id="gEdit">✏️ 고쳐 올리기</button><button type="button" class="btn small danger" id="gDown">가이드 내리기</button></div>`}
    <div class="gal"><h3>다녀온 사람들의 평가 <small>${g.ratings.length}개</small></h3>${g.ratings.length ? `<ul class="reviews">${g.ratings.slice().reverse().map(r => `<li><span class="st">${window.Guides.stars(r.stars)}</span>${r.text ? `<span>${esc(r.text)}</span>` : ''}</li>`).join('')}</ul>` : '<div class="empty">이 코스를 다 돌면 별점을 남길 수 있어요.</div>'}</div>
  </div>
  <div class="fixed ${g.mine ? 'one' : 'three'}"><button class="btn ${g.mine ? 'primary' : 'ghost'}" type="button" id="gMap">지도</button>${g.mine ? '' : `<button class="btn ghost" type="button" id="gLike" aria-pressed="${window.Guides.liked(g.id)}">👍 ${g.likes}</button><button class="btn primary" type="button" id="gImport">내 계획에 담기</button>`}</div>`;
  document.getElementById('app').appendChild(el);
  const close = () => el.remove();
  const ge = el.querySelector('#gEdit'); if (ge) ge.onclick = () => { const t = Trips.all().find(x => x.pubId === g.id); if (!t) { toast('원본 여행이 없어요. 내 여행에서 새로 올려 주세요'); return; } close(); shareTrip(t); };
  const gd = el.querySelector('#gDown'); if (gd) gd.onclick = async () => { if (!(await ask({ title: '가이드를 내릴까요?', text: '다른 사람에게 더 이상 보이지 않아요. 내 여행 기록은 그대로 남아요.', yes: '내리기', no: '취소' }))) return; window.Guides.unpublish(g.id); const t = Trips.all().find(x => x.pubId === g.id); if (t) Trips.update(t.id, { pubId: null }); close(); toast('가이드를 내렸어요'); renderGuide(); };
  el.querySelector('.back').onclick = close;
  el.querySelector('#gMap').onclick = () => { close(); showTab('map'); mapS.showTrip({ name: g.title, ids: g.stops.map(s => s.id) }); };
  const gr = el.querySelector('#gRep'); if (gr) gr.onclick = () => reportSheet('guide', g.id, g.op ? null : (g.userId || null), g.author, () => { close(); renderGuide(); });
  el.querySelectorAll('[data-gph]').forEach(b => b.onclick = () => { const [i, k] = b.dataset.gph.split(':'); const items = (g.stops[+i].photos || []).map(photoRef).filter(Boolean).map(ph => ({ url: ph.url, cap: ph.nickname ? `${esc(ph.nickname)} · ${window.Store.kstDate(ph.createdAt)}` : g.author })); openPhotos(items, +k, byId(g.stops[+i].id).name); });
  const gl = el.querySelector('#gLike'); if (gl) gl.onclick = async e => { const btn = e.currentTarget; if (!(await requireLogin())) return; const on = window.Guides.toggleLike(g.id); const ng = window.Guides.byId(g.id); btn.textContent = `👍 ${ng.likes}`; btn.setAttribute('aria-pressed', on); renderGuide(); };
  const gi = el.querySelector('#gImport'); if (gi) gi.onclick = async () => { if (!(await requireLogin())) return; const ids = g.stops.map(s => s.id); const already = Trips.all().find(t => t.guideId === g.id && t.kind === 'plan'); if (already) { toast('이미 내 계획에 있어요'); return; }
    Trips.add(g.title, ids, ids.every(i => stamps[i]) ? 'trip' : 'plan', { guideId: g.id }); toast('내 계획으로 가져왔어요'); close(); showTab('dogam'); DG.view = 'trips'; DG.tripKind = 'plan'; renderDogam(); };
}
/* ---------- 여행 편집기 ---------- */
const TripPhotos = window.Store.TripPhotos;
/* 사진 참조({src:'lm'|'tp', id}) → 그림 */
const photoRef = ref => ref.src === 'lm' ? store.photos.find(x => x.id === ref.id) : TripPhotos.byId(ref.id);
function openTripEdit(t, opts) {
  if (t.auto) t = Trips.add(t.name, t.ids, 'trip', { doneAt: t.date }); // 자동 묶음은 먼저 진짜 여행으로
  window.TripEditor.open(t, { store, Trips, TripPhotos, byId, L, toast, ask, matchQ, shrink, hoursLabel, dist: window.Store.dist,
    openPhotos: (items, i) => openPhotos(items, i, t.name),
    onSaved: () => { if (!screens.dogam.hidden) renderDogam(); },
    onPublish: (tt, d) => { const g = window.TripEditor.toGuide(tt, d, store.allStamps()); if (!g.stops.length) { toast('다녀온 곳이 있어야 가이드로 올릴 수 있어요'); return; } const u = store.getUser() || { nickname: '여행자' }; const sidos = [...new Set(g.stops.map(s => byId(s.id).sido))];
      const dirty = [g.title, g.tip, ...g.stops.map(s => s.note), ...g.legs.map(l => l.text)].some(x => window.Store.Safety.clean(x) === null); if (dirty) { toast('쓸 수 없는 말이 들어 있어요. 고쳐 주세요'); openTripEdit(tt, { focusPublish: true }); return; }
      const pub = window.Guides.publish({ ...g, id: tt.pubId, author: u.nickname, region: sidos.join('·'), userId: (store.getUser() || {}).id }); Trips.update(tt.id, { pubId: pub.id }); toast(tt.pubId ? '가이드를 고쳐 올렸어요' : '가이드로 올렸어요'); showTab('guide'); G.tab = 'mine'; G.mineKind = 'mine'; renderGuide(); } }, opts);
}
const shareTrip = t => openTripEdit(t, { focusPublish: true });
/* 완주 후 별점 */
function rateGuide(gid) { return new Promise(res => {
  const g = window.Guides.byId(gid); if (!g) return res(); let stars = 0;
  const el = document.createElement('div'); el.className = 'login';
  el.innerHTML = `<div class="box"><h2>동선을 다 돌았어요!</h2><p>"${esc(g.title)}" 어땠나요?</p><div class="starpick" id="sp">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-s="${n}" aria-label="${n}점">☆</button>`).join('')}</div><input type="text" id="rtText" maxlength="60" placeholder="한 줄 남기기 (선택)"><button class="btn primary" id="rtGo" type="button" disabled>평가 남기기</button><button class="btn ghost" id="rtNo" type="button">다음에</button></div>`;
  document.getElementById('app').appendChild(el);
  el.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { stars = +b.dataset.s; el.querySelectorAll('[data-s]').forEach(x => x.textContent = +x.dataset.s <= stars ? '★' : '☆'); el.querySelector('#rtGo').disabled = false; });
  el.querySelector('#rtNo').onclick = () => { el.remove(); res(); };
  el.querySelector('#rtGo').onclick = () => { const txt = window.Store.Safety.clean(el.querySelector('#rtText').value.trim()); if (txt === null) { toast('댓글에 쓸 수 없는 말이 있어요'); return; } window.Guides.addRating(gid, stars, txt, (store.getUser() || {}).id); el.remove(); toast('평가를 남겼어요. 고마워요!'); res(); };
}); }

/* ---------- 상세 ---------- */
let detailId = null, photoSort = 'likes';
function openDetail(id) {
  detailId = id; const p = byId(id), s = store.stampsOf(id), photos = store.photosOf(id), cover = store.coverOf(id), pos = mapS.pos(), d = pos ? window.Store.dist(pos, p) : null;
  const uid = (store.getUser() || {}).id; const isMine = ph => ph.userId === uid;
  const sorted = (photoSort === 'new' ? [...photos].sort((x, y) => y.createdAt.localeCompare(x.createdAt)) : [...photos]).sort((x, y) => isMine(y) - isMine(x)); /* 내 사진이 먼저 */
  const myLatest = sorted.find(isMine); const memTop = window.Memory.photosOf(id).filter(m => m.thumb).pop(); const hero = cover || myLatest || (memTop ? { url: window.Memory.url(memTop), mem: true } : null);
  const el = $('#detail'); el.style.setProperty('--c', `var(--c-${p.cat})`);
  const md = (window.MEDIA || {})[id]; const nPh = photos.length + (md && md.img ? 1 : 0);
  const okStamp = cfg.testMode || (d !== null && d - Math.min(pos.accuracy || 0, cfg.maxAccuracy) <= p.r); const today = s && s.last === kstToday();
  el.innerHTML = `<div class="hero" id="dHero" role="button" tabindex="0" aria-label="사진 크게 보기">${hero ? `<img src="${hero.url}" alt="${p.name}">` : md && md.img ? `<img src="${md.img}" alt="${p.name}">` : ICON[p.cat].replace('<svg ', '<svg class="big" ').replace('stroke-width="1.8"', 'stroke-width="1.2"')}<button class="back" type="button" aria-label="뒤로"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button><span class="credit">${hero ? (hero.mem ? '내 추억 사진' : isMine(hero) ? '내 사진' : `사진 · ${esc(hero.nickname)} · 👍 ${hero.likes}`) : md && md.img ? `사진 · ${md.credit ? md.credit.slice(0, 24) + ' · ' : ''}${md.lic || ''} · 위키미디어` : '대표사진 없음 · 첫 사진을 올려 보세요'}</span>${nPh > 1 ? `<span class="cnt">${nPh}장</span>` : ''}</div>
  <div class="body">
    <h2>${p.name}</h2>
    <div class="meta"><span>${p.sido} ${p.gu}</span>${(p.sets || []).map(id => `<span class="set">${setName(id)}</span>`).join('')}<span>${CATS[p.cat].emoji} ${CATS[p.cat].name}</span>${p.alt ? `<span>해발 ${p.alt.toLocaleString()}m</span>` : ''}${d !== null ? `<span>${fmt(d)}</span>` : ''}<button type="button" class="chip sm" id="dMap">지도에서 보기</button></div>
    ${(() => { const sp = mapS.splitDesc(p.desc); return (sp.spot ? `<p class="spot">📍 인증 지점 · ${sp.spot}</p>` : '') + `<p class="desc">${md && md.desc ? md.desc : sp.body}</p>`; })()}${md && md.desc ? `<p class="srcnote">${p.desc.replace(/^\[[^\]]*\]\s*/, '')} · 설명 출처 <a href="${md.page}" target="_blank" rel="noopener">위키백과</a> (CC BY-SA)</p>` : ''}
    <div class="sealrow ${okStamp || today ? '' : 'faraway'}"><button class="sealbtn ${s ? 'stamped' : ''}" id="dStamp" type="button" ${!okStamp && !s ? 'disabled' : ''}><span class="ring"><b>${s ? `${p.name.replace(/\s.*/, '').slice(0, 3)}<br><small>${s.last.slice(5).replace('-', '.')}</small>` : '도장<br>꾹!'}</b></span></button><div class="visit">${s ? `<b>방문 ${s.count}회</b><br>${s.first === s.last ? `${dotDate(s.first)} 다녀옴` : `첫 방문 ${dotDate(s.first)} · 최근 ${dotDate(s.last)}`}` : `${window.Memory.of(id) ? '<b>추억이 있는 곳</b>이에요.<br>가서 도장을 찍어 보세요.' : '아직 도장이 없어요.'}${d !== null && !okStamp ? `<br>여기서 <b>${fmt(d)}</b>` : ''}`}</div></div>
    ${memHtml(p)}
    <div class="gal"><h3>사진 <small>${photos.length}장</small><span class="sortbtns" ${photos.length < 2 ? 'hidden' : ''}><button type="button" class="chip sm" data-sort="new" aria-pressed="${photoSort === 'new'}">최신순</button><button type="button" class="chip sm" data-sort="likes" aria-pressed="${photoSort === 'likes'}">추천순</button></span></h3>${photos.length ? `<div class="pgrid">${sorted.map((ph) => `<button type="button" data-ph="${ph.id}"><img src="${ph.url}" alt="" loading="lazy">${isMine(ph) ? '<span class="top mine">내 사진</span>' : cover && ph.id === cover.id ? '<span class="top">대표</span>' : ''}<span class="lk">👍 ${ph.likes}</span></button>`).join('')}</div>` : `<div class="empty">${s ? '도장을 찍으셨네요. 첫 사진을 남겨 보세요.' : '먼저 도장을 찍고 사진을 올려 주세요.'}</div>`}</div>
  </div>
  <div class="fixed act3"><a class="btn" href="${mapS.routeUrl(p)}" target="_blank" rel="noopener">길찾기</a><button class="btn ${s ? '' : 'dim'}" type="button" id="dPhoto">사진 남기기</button><button class="btn" type="button" id="dAdd">내 여행에 담기</button></div>`;
  el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); el.scrollTop = 0; document.getElementById('app').appendChild(el); // 묶음 상세 위에 뜨도록 맨 뒤로
  el.querySelector('.back').onclick = closeDetail;
  el.querySelector('#dMap').onclick = () => { closeDetail(); showTab('map'); mapS.focus(id); };
  el.querySelector('#dHero').onclick = e => { if (e.target.closest('.back')) return; openGallery(id, 0); }; /* 뒤로 버튼은 사진 보기를 열지 않는다 */
  el.querySelector('#dPhoto').onclick = () => s ? pickPhoto(id) : toast('도장을 찍은 곳에만 사진을 올릴 수 있어요');
  el.querySelector('#dAdd').onclick = () => addToTrip(p);
  bindMem(el, p, () => openDetail(id));
  const ds = el.querySelector('#dStamp'); ds.oncontextmenu = e => e.preventDefault(); ds.onpointerdown = e => { if (ds.disabled) return; if (s) { e.preventDefault(); stampInfo(p, () => openDetail(id)); return; } const ps = mapS.pos() || (cfg.testMode ? { lat: p.lat, lng: p.lng, accuracy: 5 } : null); if (!ps) return; e.preventDefault(); startStamp(p, ps, { x: e.clientX, y: e.clientY, pointerId: e.pointerId }); };
  el.querySelectorAll('[data-ph]').forEach(b => b.onclick = () => { const idx = sorted.findIndex(x => x.id === b.dataset.ph); openGallery(id, idx + (md && md.img && !cover ? 1 : 0), sorted); });
  el.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { photoSort = b.dataset.sort; openDetail(id); });
}
function closeDetail() { const el = $('#detail'); el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); detailId = null; }

/* ---------- 사진 ---------- */
function pickPhoto(id) {
  (async () => { if (!(await requireLogin())) return; const p = byId(id);
    const dataUrl = await window.PhotoEditor.run({ place: p, maxEdge: cfg.photoMaxEdge, date: kstToday().replaceAll('-', '.'), toast }); if (!dataUrl) { await awardBadges(); await askNotify(); return; }
    toast('올리는 중…'); let r; try { r = await store.addPhoto(id, dataUrl, mapS.pos()); } catch (e) { toast('저장 공간이 부족하거나 사진을 저장할 수 없어요'); return; } if (!r.ok) { toast(r.reason); return; } toast('사진을 올렸어요'); openDetail(id); mapS.refresh(); await awardBadges(); })();
}
function shrink(file, maxEdge) { return new Promise((res, rej) => { const img = new Image(); const url = URL.createObjectURL(file); img.onload = () => { const s = Math.min(1, maxEdge / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.84)); }; img.onerror = rej; img.src = url; }); }

/* 사진 넘겨보기: 사용자 사진(추천순) + 위키 사진. 좌우 버튼과 밀어서 넘기기 */
function openGallery(placeId, start, order) {
  const p = byId(placeId); const md = (window.MEDIA || {})[placeId]; const cover = store.coverOf(placeId);
  const items = (order || store.photosOf(placeId)).map(ph => ({ ph, url: ph.url, cap: `${esc(ph.nickname)} · ${window.Store.kstDate(ph.createdAt).replaceAll('-', '.')}` }));
  if (md && md.img && !cover) items.unshift({ url: md.img, cap: `${md.credit ? md.credit.slice(0, 30) + ' · ' : ''}${md.lic || ''} · 위키미디어` });
  if (!order) window.Memory.photosOf(placeId).filter(m => m.thumb).forEach(m => items.push(window.Memory.item(m))); /* 내 추억 사진도 같이 넘겨 본다 */
  if (!items.length) { toast('아직 사진이 없어요'); return; }
  openPhotos(items, start, p.name, p);
}
/* 사진 넘겨보기: items = [{url, cap, ph?}] */
function openPhotos(items, start, title, p) {
  if (!items || !items.length) { toast('사진이 없어요'); return; }
  let i = Math.max(0, Math.min(items.length - 1, start || 0));
  const el = document.createElement('div'); el.className = 'viewer'; document.getElementById('app').appendChild(el);
  const render = () => { const it = items[i], ph = it.ph;
    el.innerHTML = `<button class="x" type="button" aria-label="닫기">×</button><span class="pos">${i + 1} / ${items.length}</span><div class="stage"><img src="${it.url}" alt="${title || ''}">${items.length > 1 ? `<button class="nav prev" type="button" aria-label="이전" ${i === 0 ? 'disabled' : ''}>‹</button><button class="nav next" type="button" aria-label="다음" ${i === items.length - 1 ? 'disabled' : ''}>›</button>` : ''}</div><div class="bar2"><span>${it.cap || ''}</span>${p ? '<button class="shr" type="button">공유</button>' : ''}${ph ? `<button class="like" type="button" aria-pressed="${store.liked(ph.id)}">👍 추천 <span>${ph.likes}</span></button>` : ''}${ph && ph.userId !== (store.getUser() || {}).id ? '<button class="rep" type="button" aria-label="신고 또는 차단">⋯</button>' : ''}</div>`;
    el.querySelector('.x').onclick = () => { el.remove(); if (p && detailId) openDetail(detailId); };
    const pv = el.querySelector('.prev'), nx = el.querySelector('.next'); if (pv) pv.onclick = () => { i--; render(); }; if (nx) nx.onclick = () => { i++; render(); };
    const sh = el.querySelector('.shr'); if (sh) sh.onclick = () => shareImage(() => window.ShareCard.photo(it.url, p, ph ? ph.createdAt.slice(0, 10).replaceAll('-', '.') : ''), `${p.name}.png`, p.name);
    const rp = el.querySelector('.rep'); if (rp) rp.onclick = () => reportSheet('photo', ph.id, ph.userId, ph.nickname, () => { items.splice(i, 1); if (!items.length) { el.remove(); if (p && detailId) openDetail(detailId); } else { i = Math.min(i, items.length - 1); render(); } });
    const lk = el.querySelector('.like'); if (lk) lk.onclick = async e => { const btn = e.currentTarget; if (!(await requireLogin())) return; const n = await store.toggleLike(ph.id); if (n === null || n === undefined) return; btn.setAttribute('aria-pressed', store.liked(ph.id)); btn.querySelector('span').textContent = n; mapS.refresh(); };
    let sx = null; const st = el.querySelector('.stage'); st.onpointerdown = e => { sx = e.clientX; }; st.onpointerup = e => { if (sx === null) return; const dx = e.clientX - sx; sx = null; if (dx < -40 && i < items.length - 1) { i++; render(); } else if (dx > 40 && i > 0) { i--; render(); } }; };
  render();
}

/* ---------- 내 정보 ---------- */
function trashHtml() { const tr = Trips.trash(); if (!tr.length) return ''; return `<div class="trash"><h3>삭제한 여행 <small>30일 보관</small></h3>${tr.map(t => `<div class="row"><span>${esc(t.name)} <small>${t.ids.length}곳</small></span><button type="button" class="chip" data-restore="${t.id}">복원</button></div>`).join('')}</div>`; }
function renderMe() {
  const u = store.getUser(), stamps = store.allStamps(), v = Object.keys(allSeen()).length, total = Object.values(stamps).reduce((a, s) => a + s.count, 0), photos = u ? store.photos.filter(x => x.userId === u.id).length : 0;
  const credit = '<p class="note">지도 © OpenStreetMap 기여자 · 타일 OpenFreeMap · 서체 도현체, IBM Plex Sans KR (SIL OFL)</p>';
  const rs = mapS.regionStats ? mapS.regionStats() : {}; const titles = Object.values(rs).filter(r => r.total > 1 && r.done === r.total).map(r => r.name).filter(Boolean);
  const tripN = Trips.all().filter(t => t.kind === 'trip').length, planN = Trips.all().filter(t => t.kind === 'plan').length, guideN = window.Guides.all().filter(g => g.mine).length;
  const badges = badgeList(), got = badges.filter(b => b.done).length; const recent = badges.filter(b => b.done).sort((x, y) => (window.Badges.earnedAt(y) || '').localeCompare(window.Badges.earnedAt(x) || '')).slice(0, 4);
  const bio = LS.get('lm-bio', '');
  const sidos = Object.keys(window.SIDO_CENTER).map(sd => { const ps = L.filter(p => p.sido === sd); return { sd, d: ps.filter(p => stamps[p.id]).length, n: ps.length }; }).filter(x => x.d).sort((a, b) => b.d / b.n - a.d / a.n);
  const bar = (label, d, n) => `<div class="prow"><span>${label}</span><div class="pbar"><i style="width:${n ? d / n * 100 : 0}%"></i></div><b>${d}/${n}</b></div>`;
  $('#meCard').innerHTML = u
    ? `<div class="me-head"><button type="button" class="avatar" id="meAvatar" aria-label="캐릭터 (준비 중)">${ICON.palace}</button><div class="me-id"><h2>${esc(u.nickname)}</h2><button type="button" class="bio" id="meBio">🎯 ${esc(bio) || '내 목표를 적어 보세요'}</button></div></div>
      ${titles.length ? `<div class="titles">${titles.map(t => `<span>🏅 ${t} 완성</span>`).join('')}</div>` : ''}
      <div class="stat3"><div><b>${Object.keys(stamps).length}</b><span>현장 도장</span></div><div><b>${Object.keys(window.Memory.places()).filter(k => !stamps[k]).length}</b><span>추억만 있는 곳</span></div><div><b>${photos}</b><span>올린 사진</span></div></div>
      <div class="jump2 four"><button type="button" id="meTrips"><b>${tripN}</b><span>내 여행</span></button><button type="button" id="mePlans"><b>${planN}</b><span>계획</span></button><button type="button" id="meGuides"><b>${guideN}</b><span>내 가이드</span></button><button type="button" id="meBadges"><b>${got}</b><span>뱃지</span></button></div>
      ${recent.length ? `<button type="button" class="recentb" id="meBadges2"><span class="rb-list">${recent.map(b => window.Badges.svg(b, 44)).join('')}</span><span class="rb-t">뱃지 ${got}/${badges.length} 보기 ›</span></button>` : `<button type="button" class="recentb" id="meBadges2"><span class="rb-t">아직 받은 뱃지가 없어요 · 뱃지 ${badges.length}개 보기 ›</span></button>`}
      <details class="prog progme"><summary>지역별 진행 <span>${sidos.length ? sidos.length + '개 시·도' : ''}</span></summary><div class="progbody">${sidos.length ? sidos.map(x => bar(x.sd, x.d, x.n)).join('') : '<p class="note">아직 도장이 없어요.</p>'}</div></details>
      <div class="melist">
        <button type="button" id="meMem"><span>📷 추억 사진 더하기</span><small>${window.Memory.count() ? `사진 ${window.Memory.count()}장 · 명소 ${Object.keys(window.Memory.places()).length}곳` : '지난 여행 사진으로 다녀온 곳을 찾아요'}</small></button>
        <button type="button" id="meSuggest"><span>📍 명소 제안하기</span><small>빠진 명소를 알려 주세요</small></button>
        <button type="button" id="meNotify"><span>🔔 알림</span><small id="meNotifyS"></small></button>
        <button type="button" id="meTest"><span>🧪 테스트 모드</span><small>${cfg.testMode ? '켜짐 · 어디서나 도장' : '꺼짐 · 반경 안에서만'}</small></button>
        ${Trips.trash().length ? `<button type="button" id="meTrash"><span>🗑 삭제한 여행 ${Trips.trash().length}</span><small>30일 안에 되살릴 수 있어요</small></button>` : ''}
        ${window.Store.Safety.blocked().size ? `<button type="button" id="meBlocked"><span>🚫 차단한 사용자 ${window.Store.Safety.blocked().size}</span><small>눌러서 풀 수 있어요</small></button>` : ''}
      </div>
      <div class="legal"><a href="legal/terms.html" target="_blank" rel="noopener">이용약관</a> · <a href="legal/privacy.html" target="_blank" rel="noopener">개인정보처리방침</a> · <a href="legal/delete.html" target="_blank" rel="noopener">삭제 안내</a><span class="ver">v${cfg.version || '0'}${cfg.testMode ? ' · 테스트' : ''}</span></div>
      <div class="row2"><button class="btn ghost" id="out" type="button">${store.mode === 'local' ? '이름 바꾸기' : '로그아웃'}</button><button class="btn ghost danger" id="wipe" type="button">계정·기록 삭제</button></div>${credit}`
    : `<h2>${store.mode === 'local' ? '반가워요!' : '로그인해 주세요'}</h2><p class="note">${store.mode === 'local' ? '이름은 첫 도장을 찍을 때 자동으로 생겨요. 지금 정해도 돼요.' : '도장을 찍으려면 로그인이 필요해요.'}</p><button class="btn primary" id="in" type="button">${store.mode === 'local' ? '이름 정하기' : '로그인'}</button><button type="button" class="recentb" id="meBadges2"><span class="rb-t">뱃지 ${badges.length}개 보기 ›</span></button><div class="melist"><button type="button" id="meMem"><span>📷 추억 사진 더하기</span><small>${window.Memory.count() ? `사진 ${window.Memory.count()}장 · 명소 ${Object.keys(window.Memory.places()).length}곳` : '지난 여행 사진으로 다녀온 곳을 찾아요'}</small></button></div><div class="legal"><a href="legal/terms.html" target="_blank" rel="noopener">이용약관</a> · <a href="legal/privacy.html" target="_blank" rel="noopener">개인정보처리방침</a></div>${credit}`;
  const out = $('#out'); if (out) out.onclick = async () => { if (store.mode === 'local') { const u = store.getUser(); const n = await ask({ title: '이름 바꾸기', input: '새 이름', value: u ? u.nickname : '', yes: '바꾸기', no: '취소' }); if (!n) return; const c = window.Store.Safety.clean(n.trim().slice(0, 14)); if (!c) { toast('쓸 수 없는 이름이에요'); return; } LS.set('lm-user', { ...u, nickname: c }); store.user = { ...u, nickname: c }; renderMe(); toast('이름을 바꿨어요'); return; } await store.signOut(); renderMe(); mapS.refresh(); toast('로그아웃했어요'); };
  const inb = $('#in'); if (inb) inb.onclick = async () => { await requireLogin(); renderMe(); };
  document.querySelectorAll('[data-restore]').forEach(b => b.onclick = () => { const t = Trips.restore(b.dataset.restore); renderMe(); if (t) toast(`'${t.name}'${josa(t.name, '을/를')} 되살렸어요`); });
  const mt = $('#meTrips'); if (mt) mt.onclick = () => { DG.view = 'trips'; DG.tripKind = 'trip'; showTab('dogam'); };
  const mp = $('#mePlans'); if (mp) mp.onclick = () => { DG.view = 'trips'; DG.tripKind = 'plan'; showTab('dogam'); };
  const mg = $('#meGuides'); if (mg) mg.onclick = () => { G.tab = 'mine'; G.mineKind = 'mine'; showTab('guide'); };
  ['meBadges', 'meBadges2'].forEach(id => { const b = $('#' + id); if (b) b.onclick = openBadges; });
  const mb = $('#meBio'); if (mb) mb.onclick = async () => { const n = await ask({ title: '내 목표', input: '예: 올해 100대 명산 10곳', value: bio, yes: '저장', no: '취소' }); if (n !== null && n !== false) { LS.set('lm-bio', n); renderMe(); } };
  const av = $('#meAvatar'); if (av) av.onclick = () => toast('캐릭터는 곧 꾸밀 수 있어요');
  const mm = $('#meMem'); if (mm) mm.onclick = () => memImport({});
  const sg = $('#meSuggest'); if (sg) sg.onclick = () => suggestPlace();
  const tr = $('#meTrash'); if (tr) tr.onclick = openTrash;
  const bl = $('#meBlocked'); if (bl) bl.onclick = async () => { const ids = [...window.Store.Safety.blocked()]; const el = document.createElement('div'); el.className = 'login pick'; el.innerHTML = `<div class="box"><h2>차단한 사용자</h2><div class="picklist">${ids.map(id => `<button type="button" class="pk" data-u="${id}"><b>${id}</b><small>눌러서 차단 풀기</small></button>`).join('')}</div><button class="btn ghost" type="button" id="pkNo">닫기</button></div>`; document.getElementById('app').appendChild(el); el.onclick = e => { if (e.target === el) el.remove(); }; el.querySelector('#pkNo').onclick = () => el.remove(); el.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { window.Store.Safety.unblock(b.dataset.u); el.remove(); renderMe(); mapS.refresh(); toast('차단을 풀었어요'); }); };
  const wp = $('#wipe'); if (wp) wp.onclick = async () => { if (!(await ask({ title: '계정과 기록을 모두 지울까요?', text: '도장·여행·사진·가이드·뱃지가 모두 지워져요. 되돌릴 수 없어요.', yes: '모두 삭제', no: '취소' }))) return; if (!(await ask({ title: '정말 지울까요?', text: '마지막 확인이에요.', yes: '네, 지워요', no: '아니오' }))) return; try { await window.Store.wipeAll(); } catch (e) { toast(e.message || '삭제하지 못했어요'); return; } location.hash = ''; location.reload(); };
  const nt = $('#meNotify'); if (nt) { const st = !('Notification' in window) ? '이 기기는 알림을 지원하지 않아요' : Notification.permission === 'granted' ? '켜짐 · 밤 10시에 하루 정리' : Notification.permission === 'denied' ? '꺼짐 · 폰 설정에서 켤 수 있어요' : '아직 안 물어봤어요 · 눌러서 켜기'; $('#meNotifyS').textContent = st;
    nt.onclick = async () => { if (!('Notification' in window) || Notification.permission !== 'default') { toast(st); return; } try { await Notification.requestPermission(); } catch (e) {} renderMe(); }; }
  const tm = $('#meTest'); if (tm) tm.onclick = async () => { const on = !cfg.testMode; if (!(await ask({ title: on ? '테스트 모드를 켤까요?' : '테스트 모드를 끌까요?', text: on ? '어디서나 도장이 찍혀요. 개발 중에만 쓰세요.' : '인증 반경 안에서만 도장이 찍혀요.', yes: on ? '켜기' : '끄기', no: '취소' }))) return; cfg.testMode = on; LS.set('lm-test', on); renderMe(); mapS.refresh(); toast(on ? '테스트 모드 켜짐' : '테스트 모드 꺼짐'); };
}
/* 뱃지 전체 화면 */
function openBadges() {
  const badges = badgeList(); const groups = ['지역', '세트', '주제', '순간', '행동']; const got = badges.filter(b => b.done).length;
  const el = document.createElement('section'); el.className = 'detail open badgescr'; el.setAttribute('aria-hidden', 'false');
  const by = {}; groups.forEach(g => by[g] = badges.filter(b => b.group === g).sort((x, y) => (y.done - x.done) || (y.cur / y.max - x.cur / x.max)));
  el.innerHTML = `<div class="hero gdhero grphero"><button class="back" type="button" aria-label="뒤로"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button><div class="gdhero-in"><h2>뱃지 ${got}/${badges.length}</h2><p>받은 뱃지를 누르면 그림으로 자랑할 수 있어요.</p></div></div>
    <div class="body">${groups.map(g => by[g].length ? `<h4>${g}</h4><div class="bgrid">${by[g].map((b, i) => `<button type="button" class="bcell ${b.done ? 'on' : ''}" data-bg="${g}:${i}" ${b.done ? '' : 'disabled'}>${window.Badges.svg(b, 84)}<span>${b.name}</span>${b.done ? `<small>${(window.Badges.earnedAt(b) || '').slice(0, 10).replaceAll('-', '.')}</small>` : `<small>${b.cur}/${b.max}</small>`}</button>`).join('')}</div>` : '').join('')}</div>`;
  document.getElementById('app').appendChild(el);
  el.querySelector('.back').onclick = () => el.remove();
  el.querySelectorAll('[data-bg]').forEach(b => b.onclick = () => { const [g, i] = b.dataset.bg.split(':'); const bd = by[g][+i]; if (bd) shareBadgeImage(bd); });
}
/* 명소 제안: 이름·설명 필수, 위치는 내 위치 또는 지도에서 찍기, 사진은 선택. 기기에 모아 두고 서버가 붙으면 보낸다 */
const SG = { draft: null };
async function suggestPlace(draft) {
  const d = SG.draft = draft || SG.draft || { name: '', desc: '', pos: null, photo: null };
  const me = mapS.pos(); if (!d.pos && me) d.pos = { lat: me.lat, lng: me.lng, from: 'me' };
  const el = document.createElement('div'); el.className = 'login';
  el.innerHTML = `<div class="box"><h2>명소 제안하기</h2><p>빠진 명소를 알려 주세요. 확인하고 넣을게요.</p>
    <input type="text" id="sgName" maxlength="40" placeholder="명소 이름 *" value="${d.name.replace(/"/g, '&quot;')}">
    <textarea id="sgDesc" rows="3" maxlength="300" placeholder="어떤 곳인가요? *">${esc(d.desc)}</textarea>
    <div class="sgpos"><span>${d.pos ? `📍 ${d.pos.from === 'map' ? '지도에서 정한 위치' : '지금 내 위치'}` : '📍 위치를 정해 주세요 *'}</span><button type="button" class="chip" id="sgMap">지도에서 찍기</button></div>
    <div class="sgphoto">${d.photo ? `<img src="${d.photo}" alt=""><button type="button" class="chip" id="sgPhX">사진 빼기</button>` : `<label class="chip filebtn">📷 사진 넣기 (선택)<input type="file" accept="image/*" id="sgFile" hidden></label>`}</div>
    <div class="askrow"><button class="btn ghost" type="button" id="sgNo">취소</button><button class="btn primary" type="button" id="sgGo">보내기</button></div></div>`;
  document.getElementById('app').appendChild(el);
  const readD = () => { d.name = el.querySelector('#sgName').value.trim(); d.desc = el.querySelector('#sgDesc').value.trim(); };
  el.onclick = e => { if (e.target === el) { readD(); el.remove(); } }; el.querySelector('#sgNo').onclick = () => { SG.draft = null; el.remove(); };
  el.querySelector('#sgMap').onclick = async () => { readD(); el.remove(); showTab('map'); const pos = await mapS.pickLocation(d.pos); if (pos) d.pos = { ...pos, from: 'map' }; suggestPlace(d); };
  const f = el.querySelector('#sgFile'); if (f) f.onchange = async e => { const file = e.target.files[0]; if (!file) return; readD(); try { d.photo = await shrink(file, 1200); } catch (err) { toast('사진을 불러오지 못했어요'); } el.remove(); suggestPlace(d); };
  const px = el.querySelector('#sgPhX'); if (px) px.onclick = () => { readD(); d.photo = null; el.remove(); suggestPlace(d); };
  el.querySelector('#sgGo').onclick = () => { readD();
    if (!d.name) { el.querySelector('#sgName').focus(); toast('이름을 적어 주세요'); return; } if (!d.desc) { el.querySelector('#sgDesc').focus(); toast('설명을 적어 주세요'); return; } if (!d.pos) { toast('위치를 찍어 주세요'); return; }
    const list = LS.get('lm-suggest', []); list.push({ name: d.name, desc: d.desc, pos: { lat: d.pos.lat, lng: d.pos.lng }, hasPhoto: !!d.photo, at: new Date().toISOString() }); LS.set('lm-suggest', list);
    if (d.photo) { try { localStorage.setItem('lm-suggest-photo-' + (list.length - 1), d.photo); } catch (e) {} }
    SG.draft = null; el.remove(); toast(`'${d.name}' 제안을 받았어요. 고마워요!`); awardBadges(); };
}
/* 삭제한 여행 화면 */
function openTrash() {
  const el = document.createElement('section'); el.className = 'detail open'; el.setAttribute('aria-hidden', 'false');
  const render = () => { const tr = Trips.trash();
    el.innerHTML = `<div class="hero gdhero grphero"><button class="back" type="button" aria-label="뒤로"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button><div class="gdhero-in"><h2>삭제한 여행</h2><p>30일 동안 보관돼요. 도장 기록은 그대로예요.</p></div></div>
      <div class="body">${tr.length ? `<div class="grps">${tr.map(t => `<div class="grp static"><div class="grp-h"><div class="grp-t"><b>${esc(t.name)}</b><em>${t.kind === 'plan' ? '계획' : '여행'}</em></div><button type="button" class="chip" data-restore="${t.id}">복원</button></div><div class="grp-s">${t.ids.length}곳 · ${dotDate(t.deletedAt.slice(0, 10))} 삭제</div></div>`).join('')}</div>` : '<div class="empty">삭제한 여행이 없어요.</div>'}</div>`;
    el.querySelector('.back').onclick = () => { el.remove(); renderMe(); };
    el.querySelectorAll('[data-restore]').forEach(b => b.onclick = () => { const t = Trips.restore(b.dataset.restore); if (t) toast(`'${t.name}'${josa(t.name, '을/를')} 되살렸어요`); render(); }); };
  render(); document.getElementById('app').appendChild(el);
}
document.addEventListener('auth', async () => { if (store.refresh) await store.refresh(); mapS.refresh(); if (!screens.me.hidden) renderMe(); if (!screens.dogam.hidden) renderDogam(); });

const h = location.hash.slice(1); showTab(screens[h] ? h : 'map'); setTimeout(() => Nudge.run(), 1500);
/* ---------- 첫 실행 안내 ---------- */
function onboarding() {
  if (LS.get('lm-onboarded', false)) return;
  const slides = [
    { ic: ICON.palace, t: '가까운 명소를 찾아봐요' },
    { ic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>', t: '도착하면 꾹 눌러 도장!' },
    { ic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/></svg>', t: '전국 명소를 방문해<br>뱃지를 받아보세요!' },
  ]; let i = 0;
  const el = document.createElement('div'); el.className = 'onb'; document.getElementById('app').appendChild(el);
  const done = gps => { LS.set('lm-onboarded', true); LS.set('lm-agreed', new Date().toISOString()); el.remove(); if (gps) $('#gpsBtn').click(); setTimeout(memIntro, gps ? 900 : 300); };
  const go = k => { i = Math.max(0, Math.min(slides.length - 1, k)); render(); };
  const render = () => { const s = slides[i], last = i === slides.length - 1; el.innerHTML = `<div class="onb-in"><div class="onb-ic">${s.ic}</div><h2>${s.t}</h2><div class="dots">${slides.map((_, k) => `<i data-k="${k}" class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
    ${last ? `<button class="btn primary" type="button" id="onbGo">시작하기</button>` : `<button class="btn primary" type="button" id="onbNext">다음</button>`}<button class="btn ghost" type="button" id="onbSkip">${last ? '위치 없이 둘러보기' : '건너뛰기'}</button>${last ? '<p class="note">시작하면 <a href="legal/terms.html" target="_blank" rel="noopener">이용약관</a>·<a href="legal/privacy.html" target="_blank" rel="noopener">개인정보처리방침</a>에 동의해요</p>' : ''}</div>
    ${i > 0 ? '<button class="onb-back" type="button" id="onbBack" aria-label="이전"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>' : ''}`;
    const n = el.querySelector('#onbNext'); if (n) n.onclick = () => go(i + 1); const bk = el.querySelector('#onbBack'); if (bk) bk.onclick = () => go(i - 1);
    const g = el.querySelector('#onbGo'); if (g) g.onclick = () => done(true); el.querySelector('#onbSkip').onclick = () => done(false);
    el.querySelectorAll('.dots i').forEach(d => d.onclick = () => go(+d.dataset.k)); };
  /* 좌우로 밀어서도 넘기고 돌아온다 */
  let sx = null; el.addEventListener('pointerdown', e => { sx = e.clientX; }); el.addEventListener('pointerup', e => { if (sx === null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) < 50) return; go(dx < 0 ? i + 1 : i - 1); });
  render();
}
onboarding();
if ('serviceWorker' in navigator && location.protocol === 'https:' && !isNative) navigator.serviceWorker.register('sw.js').catch(() => {}); /* 네이티브는 파일이 앱 안에 있어서 캐시가 필요 없다 */
})();
