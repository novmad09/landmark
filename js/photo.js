/* 사진 남기기: 카메라/사진첩 → 도장 스티커 + 필터 → 합성해서 올리기 (1단계 꾸미기) */
window.PhotoEditor = (function () {
const FILTERS = [
  { id: 'none', name: '원본', css: 'none' },
  { id: 'warm', name: '따뜻하게', css: 'saturate(1.15) contrast(1.05) sepia(0.18) brightness(1.03)' },
  { id: 'film', name: '필름', css: 'contrast(1.12) saturate(0.85) sepia(0.12) brightness(0.98)' },
  { id: 'mono', name: '흑백', css: 'grayscale(1) contrast(1.1)' },
];
const noise = seed => { const g = Array.from({ length: 64 }, (_, i) => { const v = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453; return v - Math.floor(v); }); return a => { const t = (a / (Math.PI * 2)) * 64, i = Math.floor(t) % 64, f = t - Math.floor(t), s = f * f * (3 - 2 * f); return g[i] * (1 - s) + g[(i + 1) % 64] * s; }; };

/* 도장 스티커 그리기 (먹 도장 화면과 같은 모양) */
function drawSeal(ctx, { x, y, R, name, date, angle, seed }) {
  const f = window.sealFit(name, R, false, true); /* 사진 위 도장은 반듯한 정원 */ ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.closePath();
  /* 사진 위에서도 또렷하게: 쨍한 빨강 + 흰 테두리, 얼룩 점 없음 */
  const RED = '#E6332A'; ctx.lineJoin = 'round';
  ctx.lineWidth = R * 0.16; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke(); ctx.lineWidth = R * 0.1; ctx.strokeStyle = RED; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const txt = (t, font, y) => { ctx.font = font; ctx.lineWidth = R * 0.05; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeText(t, 0, y); ctx.fillStyle = RED; ctx.fillText(t, 0, y); };
  f.lines.forEach((l, i) => txt(l, `700 ${Math.round(f.size)}px "Do Hyeon","Nanum Myeongjo",serif`, f.y0 + (i - (f.lines.length - 1) / 2) * f.lh));
  txt(date, `700 ${Math.round(R * 0.18)}px "IBM Plex Sans KR",sans-serif`, R * 0.56);
  ctx.restore();
}

/* 1. 출처 고르기: 카메라 / 사진첩 */
function pickSource() {
  return new Promise(res => {
    const el = document.createElement('div'); el.className = 'login';
    el.innerHTML = `<div class="box"><h2>사진 남기기</h2><p>사진에 도장과 날짜가 찍혀요.</p><button class="btn primary" id="cam" type="button">📷 지금 찍기</button><button class="btn ghost" id="lib" type="button">🖼 사진첩에서 고르기</button><button class="btn ghost" id="no" type="button">취소</button></div>`;
    document.getElementById('app').appendChild(el);
    const done = v => { el.remove(); res(v); };
    el.querySelector('#cam').onclick = () => done('camera'); el.querySelector('#lib').onclick = () => done('library'); el.querySelector('#no').onclick = () => done(null);
    el.addEventListener('click', e => { if (e.target === el) done(null); });
  });
}
let keepInp = null; /* 카메라가 열린 동안 input 이 거둬지지 않게 붙잡아 둔다 */
function pickFile(source) {
  return new Promise(res => { const inp = document.createElement('input'); keepInp = inp; inp.hidden = true; document.body.appendChild(inp); inp.type = 'file'; inp.accept = 'image/*'; if (source === 'camera') inp.capture = 'environment';
    const fin = v => { res(v); inp.remove(); keepInp = null; }; inp.onchange = () => fin(inp.files[0] || null); inp.oncancel = () => fin(null); inp.click(); });
}
function loadImage(file, maxEdge) { return new Promise((res, rej) => { const img = new Image(); const url = URL.createObjectURL(file); img.onload = () => { const s = Math.min(1, maxEdge / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c); }; img.onerror = rej; img.src = url; }); }

/* 2. 편집 화면 */
function edit({ place, image, date, onDone, onCancel }) {
  const el = document.createElement('section'); el.className = 'pedit'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '사진 꾸미기');
  el.innerHTML = `<header><button class="x2" type="button" id="peX" aria-label="취소">×</button><b>사진 꾸미기</b><button class="ok" type="button" id="peOk">올리기</button></header>
    <div class="pstage"><canvas id="peC"></canvas><p class="phint">도장을 끌어서 옮기고, 두 손가락으로 벌려 크기를 바꿀 수 있어요</p></div>
    <div class="ptools"><div class="row filters" id="peF" ${('filter' in CanvasRenderingContext2D.prototype) ? '' : 'hidden'}>${FILTERS.map(f => `<button type="button" class="chip" data-f="${f.id}" aria-pressed="${f.id === 'none'}">${f.name}</button>`).join('')}</div>
    <div class="row sizes"><span>도장 크기</span><input type="range" id="peSize" min="0" max="100" value="30" aria-label="도장 크기"><button type="button" class="chip" id="peOff" aria-pressed="false">도장 빼기</button></div></div>`;
  document.getElementById('app').appendChild(el);
  const cv = el.querySelector('#peC'), ctx = cv.getContext('2d'); const W = image.width, H = image.height; cv.width = W; cv.height = H;
  const seed = 0, angle = 0; const Rmin = Math.min(W, H) * 0.07, Rmax = Math.min(W, H) * 0.36;
  const st = { filter: 'none', seal: true, R: Math.min(W, H) * 0.14, x: 0, y: 0 }; st.x = W - st.R * 1.35; st.y = H - st.R * 1.35;
  function render(final) {
    ctx.save(); ctx.clearRect(0, 0, W, H); const f = FILTERS.find(x => x.id === st.filter); ctx.filter = f.css; ctx.drawImage(image, 0, 0); ctx.filter = 'none'; ctx.restore();
    if (st.seal) drawSeal(ctx, { x: st.x, y: st.y, R: st.R, name: place.name, date, angle, seed });
    // 랜드마크 이름·날짜 워터마크
    ctx.save(); ctx.font = `600 ${Math.round(Math.min(W, H) * 0.032)}px "IBM Plex Sans KR",sans-serif`; ctx.textBaseline = 'bottom'; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 6; ctx.fillText(`${place.name} · ${date}`, Math.round(W * 0.03), H - Math.round(H * 0.025)); ctx.restore();
  }
  render();
  // 드래그로 도장 옮기기
  // 한 손가락: 도장 옮기기 / 두 손가락: 벌리고 오므려 크기 바꾸기 / 마우스 휠·아래 막대로도 크기를 바꾼다
  let drag = null, pinch = null; const pts = new Map(); const toC = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  const sizeEl = el.querySelector('#peSize'); const clampPos = () => { const m = st.R * 1.1; /* 테두리 두께까지 사진 안에 */ st.x = Math.max(m, Math.min(W - m, st.x)); st.y = Math.max(m, Math.min(H - m, st.y)); };
  const setR = (r, fromSlider) => { st.R = Math.max(Rmin, Math.min(Rmax, r)); clampPos(); if (!fromSlider) sizeEl.value = Math.round((st.R - Rmin) / (Rmax - Rmin) * 100); render(); }; setR(st.R);
  const gap = () => { const [a, b] = [...pts.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); };
  cv.addEventListener('pointerdown', e => { if (!st.seal) return; const [x, y] = toC(e); pts.set(e.pointerId, [x, y]); try { cv.setPointerCapture(e.pointerId); } catch (er) {} e.preventDefault();
    if (pts.size === 2) { drag = null; pinch = { d: gap() || 1, R: st.R }; } else if (pts.size === 1 && Math.hypot(x - st.x, y - st.y) < st.R * 1.4) drag = { dx: st.x - x, dy: st.y - y }; });
  cv.addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) return; const [x, y] = toC(e); pts.set(e.pointerId, [x, y]);
    if (pinch && pts.size === 2) { setR(pinch.R * gap() / pinch.d); return; } if (!drag) return; st.x = x + drag.dx; st.y = y + drag.dy; clampPos(); render(); });
  const end = e => { pts.delete(e.pointerId); drag = null; if (pts.size < 2) pinch = null; }; cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', e => { if (!st.seal) return; e.preventDefault(); setR(st.R * (e.deltaY < 0 ? 1.08 : 0.92)); }, { passive: false });
  sizeEl.oninput = () => setR(Rmin + (Rmax - Rmin) * sizeEl.value / 100, true);
  el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { st.filter = b.dataset.f; el.querySelectorAll('[data-f]').forEach(x => x.setAttribute('aria-pressed', x === b)); render(); });
  el.querySelector('#peOff').onclick = e => { st.seal = !st.seal; e.currentTarget.setAttribute('aria-pressed', String(!st.seal)); e.currentTarget.textContent = st.seal ? '도장 빼기' : '도장 넣기'; render(); };
  el.querySelector('#peX').onclick = () => { el.remove(); onCancel && onCancel(); };
  el.querySelector('#peOk').onclick = () => { render(true); const out = cv.toDataURL('image/jpeg', 0.86); el.remove(); onDone(out); };
}

async function run({ place, maxEdge, date, toast }) {
  const src = await pickSource(); if (!src) return null;
  const file = await pickFile(src); if (!file) return null;
  toast && toast('사진 준비 중…');
  let image; try { image = await loadImage(file, maxEdge); } catch (e) { toast && toast('사진을 읽지 못했어요'); return null; }
  return new Promise(res => edit({ place, image, date, onDone: res, onCancel: () => res(null) }));
}
return { run, drawSeal, FILTERS };
})();
