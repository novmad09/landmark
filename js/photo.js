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
  const f = window.sealFit(name, R); const nz = noise(seed); ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.beginPath(); for (let k = 0; k <= 96; k++) { const a = k / 96 * Math.PI * 2, w = 1 + (nz(a) - .5) * 0.07; const px = Math.cos(a) * R * w * f.ax, py = Math.sin(a) * R * w; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath();
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
    <div class="pstage"><canvas id="peC"></canvas><p class="phint">도장을 끌어서 옮길 수 있어요</p></div>
    <div class="ptools"><div class="row filters" id="peF" ${('filter' in CanvasRenderingContext2D.prototype) ? '' : 'hidden'}>${FILTERS.map(f => `<button type="button" class="chip" data-f="${f.id}" aria-pressed="${f.id === 'none'}">${f.name}</button>`).join('')}</div>
    <div class="row sizes"><span>도장 크기</span><button type="button" class="chip" id="peSm">작게</button><button type="button" class="chip" id="peLg">크게</button><button type="button" class="chip" id="peOff" aria-pressed="false">도장 빼기</button></div></div>`;
  document.getElementById('app').appendChild(el);
  const cv = el.querySelector('#peC'), ctx = cv.getContext('2d'); const W = image.width, H = image.height; cv.width = W; cv.height = H;
  const seed = Math.random() * 1000, angle = (Math.random() * 16 - 8) * Math.PI / 180;
  const st = { filter: 'none', seal: true, R: Math.min(W, H) * 0.14, x: 0, y: 0 }; st.x = W - st.R * 1.35 * (window.sealWide(place.name) ? 1.55 : 1); st.y = H - st.R * 1.35;
  function render(final) {
    ctx.save(); ctx.clearRect(0, 0, W, H); const f = FILTERS.find(x => x.id === st.filter); ctx.filter = f.css; ctx.drawImage(image, 0, 0); ctx.filter = 'none'; ctx.restore();
    if (st.seal) drawSeal(ctx, { x: st.x, y: st.y, R: st.R, name: place.name, date, angle, seed });
    // 랜드마크 이름·날짜 워터마크
    ctx.save(); ctx.font = `600 ${Math.round(Math.min(W, H) * 0.032)}px "IBM Plex Sans KR",sans-serif`; ctx.textBaseline = 'bottom'; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 6; ctx.fillText(`${place.name} · ${date}`, Math.round(W * 0.03), H - Math.round(H * 0.025)); ctx.restore();
  }
  render();
  // 드래그로 도장 옮기기
  let drag = null; const toC = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  cv.addEventListener('pointerdown', e => { if (!st.seal) return; const [x, y] = toC(e); if (Math.hypot(x - st.x, y - st.y) < st.R * 1.4) { drag = { dx: st.x - x, dy: st.y - y }; cv.setPointerCapture(e.pointerId); e.preventDefault(); } });
  cv.addEventListener('pointermove', e => { if (!drag) return; const [x, y] = toC(e); st.x = Math.max(st.R, Math.min(W - st.R, x + drag.dx)); st.y = Math.max(st.R, Math.min(H - st.R, y + drag.dy)); render(); });
  const end = () => { drag = null; }; cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { st.filter = b.dataset.f; el.querySelectorAll('[data-f]').forEach(x => x.setAttribute('aria-pressed', x === b)); render(); });
  el.querySelector('#peSm').onclick = () => { st.R = Math.max(Math.min(W, H) * 0.08, st.R * 0.85); render(); };
  el.querySelector('#peLg').onclick = () => { st.R = Math.min(Math.min(W, H) * 0.3, st.R * 1.18); render(); };
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
