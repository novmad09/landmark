/* 먹 도장 화면: 꾹 누르면 먹이 번지며 화면을 채우고, 손을 떼면 도장이 쾅 박힌다 */
window.StampScreen = (function () {
const T = { fill: 2000, hold: 100, slam: 220, clear: 900 }; // ms. 타이밍은 여기서 조절
const COVER = 0.85; // 번짐이 화면의 몇 %를 덮으면 "꽉 참"인지

/* 값 노이즈 (번짐 가장자리를 거칠게) */
function noise2(seed) { const r = i => { const v = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453; return v - Math.floor(v); }; const grid = Array.from({ length: 64 }, (_, i) => r(i)); return a => { const t = (a / (Math.PI * 2)) * 64, i = Math.floor(t) % 64, f = t - Math.floor(t), s = f * f * (3 - 2 * f); return grid[i] * (1 - s) + grid[(i + 1) % 64] * s; }; }

/* 소리: 외부 파일 없이 합성 */
const Snd = { ctx: null, get() { try { this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state !== 'running') this.ctx.resume(); return this.ctx; } catch (e) { return null; } },
  brush() { const c = this.get(); if (!c) return; const b = c.createBuffer(1, c.sampleRate * 0.25, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) * 0.4; const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g = c.createGain(); g.gain.value = 0.25; s.connect(f).connect(g).connect(c.destination); s.start(); },
  thud() { const c = this.get(); if (!c) return; const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(140, c.currentTime); o.frequency.exponentialRampToValueAtTime(38, c.currentTime + 0.18); g.gain.setValueAtTime(0.9, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.32);
    const b = c.createBuffer(1, c.sampleRate * 0.08, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) * 0.6; const s = c.createBufferSource(); s.buffer = b; const g2 = c.createGain(); g2.gain.value = 0.3; s.connect(g2).connect(c.destination); s.start(); },
  chime() { const c = this.get(); if (!c) return; [660, 880].forEach((hz, i) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = hz; g.gain.setValueAtTime(0.0001, c.currentTime + i * 0.12); g.gain.exponentialRampToValueAtTime(0.18, c.currentTime + i * 0.12 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + i * 0.12 + 0.5); o.connect(g).connect(c.destination); o.start(c.currentTime + i * 0.12); o.stop(c.currentTime + i * 0.12 + 0.55); }); } };
const vib = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
/* 지지지징… 점점 세지는 패턴: 짧고 드문 떨림에서 길고 촘촘한 떨림으로 (안드로이드는 세기 조절이 없어서 길이로 낸다) */
const holdPattern = () => { const p = []; let t = 0; for (let i = 0; t < 1950; i++) { const f = Math.min(1, t / 1950); const on = Math.round(8 + f * f * 160), off = Math.round(170 - f * 158); p.push(on, Math.max(8, off)); t += on + Math.max(8, off); } return p; }; /* 처음엔 짧게 띡·띡, 끝엔 거의 끊김 없이 웅— */
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 종이 질감 */
const grain = (() => { const c = document.createElement('canvas'); c.width = c.height = 200; const g = c.getContext('2d'); for (let i = 0; i < 2400; i++) { g.fillStyle = `rgba(90,70,40,${Math.random() * 0.07})`; g.fillRect(Math.random() * 200, Math.random() * 200, Math.random() * 2 + 0.5, Math.random() * 1.4 + 0.4); } return c; })();

function open({ place, check, commit, onPhoto, onDone, onDogam, onCancel, toast, start }) {
  const el = document.createElement('section'); el.className = 'stampscr'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', `${place.name} 도장 찍기`);
  const short = place.name.replace(/\s.*/, '').slice(0, 3);
  el.innerHTML = `<canvas id="inkC"></canvas><button class="cancel" type="button" aria-label="닫기">×</button>
    <div class="guide"><div class="ring">${short}</div><p>화면을 꾹 눌러 주세요</p><small>먹이 다 번지면 도장이 찍혀요</small></div>
    <div class="result"><h2 id="rTitle"></h2><p id="rSub"></p><div class="btns"><button class="btn pale" type="button" id="rDogam">다녀온 곳 보기</button><button class="btn ink" type="button" id="rPhoto">사진 남기기</button></div><p class="hint">사진은 나중에 올려도 돼요</p></div>`;
  document.getElementById('app').appendChild(el);
  const cv = el.querySelector('canvas'), ctx = cv.getContext('2d');
  let W, H, DPR; const resize = () => { const r = el.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2.5); W = r.width; H = r.height; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); }; resize(); addEventListener('resize', resize);
  const paper = getComputedStyle(el).getPropertyValue('--paper').trim() || '#F5EFE3', ink = getComputedStyle(el).getPropertyValue('--ink-stamp').trim() || '#1C1A17';
  const seed = Math.random() * 1000, nz = noise2(seed), angle = (Math.random() * 16 - 8) * Math.PI / 180, edgeNz = noise2(seed + 7);
  const maxR = Math.hypot(W, H) * 0.62;
  let state = 'idle', t0 = 0, press = null, raf = null, fill = 0, checked = null, result = null, holdDone = false, lastVib = 0, autoT = null, committed = false;

  function paperBg() { ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 0.9; ctx.fillStyle = ctx.createPattern(grain, 'repeat'); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  function blob(cx, cy, r, alpha, wobble) { ctx.beginPath(); for (let k = 0; k <= 72; k++) { const a = k / 72 * Math.PI * 2, w = 1 + (nz(a) - .5) * wobble; const x = cx + Math.cos(a) * r * w, y = cy + Math.sin(a) * r * w; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); ctx.globalAlpha = alpha; ctx.fillStyle = ink; ctx.fill(); ctx.globalAlpha = 1; }
  function inkR(f) { return maxR * (0.1 + 0.9 * Math.pow(f, 1.75)); } // 끝으로 갈수록 빨라진다
  function drawInk(f, onPaper) { if (f <= 0) return; const r = inkR(f);
    if (onPaper) { ctx.globalCompositeOperation = 'multiply'; blob(press.x, press.y, r * 1.06, 0.35, 0.5); blob(press.x, press.y, r * 0.98, 0.55, 0.32); blob(press.x, press.y, r * 0.86, 0.92, 0.18); ctx.globalCompositeOperation = 'source-over'; return; }
    // 지도 위에 바로 얹는 경우: 한 겹만 꽉 차게 칠하고 가장자리를 번지게 한다 (여러 겹이면 등고선처럼 띠가 생긴다)
    ctx.save(); ctx.shadowColor = ink; ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
    ctx.shadowBlur = Math.max(14, r * 0.09); blob(press.x, press.y, r * 0.94, 1, 0.09);
    ctx.shadowBlur = Math.max(26, r * 0.2); ctx.globalAlpha = 1; blob(press.x, press.y, r * 0.9, 0.85, 0.09);
    ctx.restore(); }
  function drawSeal(scale, alpha) { const cx = W / 2, cy = H / 2 - 20, R = 86; ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle); ctx.scale(scale, scale); ctx.globalAlpha = alpha;
    ctx.beginPath(); for (let k = 0; k <= 96; k++) { const a = k / 96 * Math.PI * 2, w = 1 + (edgeNz(a) - .5) * 0.07; const x = Math.cos(a) * R * w, y = Math.sin(a) * R * w; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); ctx.lineWidth = 9; ctx.strokeStyle = '#C8372D'; ctx.stroke();
    ctx.fillStyle = '#C8372D'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${short.length >= 3 ? 44 : 56}px "Do Hyeon","Nanum Myeongjo",serif`; ctx.fillText(short, 0, -6);
    ctx.font = '600 15px "IBM Plex Sans KR",sans-serif'; ctx.fillText(window.Store.kstToday().replaceAll('-', '.'), 0, 42);
    if (!reduce()) { ctx.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 70; i++) { const a = Math.random() * Math.PI * 2, rr = R * (0.2 + Math.random() * 0.8); ctx.globalAlpha = Math.random() * 0.5; ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, Math.random() * 2.2, 0, Math.PI * 2); ctx.fill(); } ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore(); }
  function frame(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const live = state === 'filling' || state === 'releasing' || state === 'fail'; // 아직 지도 위
    if (live) ctx.clearRect(0, 0, W, H); else paperBg();
    el.classList.toggle('onmap', live);
    if (state === 'filling') { fill = Math.min(1, (now - t0) / T.fill); drawInk(fill); el.classList.toggle('inking', fill > 0.3);
      if (fill >= 1 && !holdDone) { holdDone = true; vib([0, 120]); el.querySelector('.guide p').textContent = '손을 떼세요!';
        autoT = setTimeout(() => { if (state === 'filling') up({ preventDefault() {} }); }, 700); } // 계속 누르고 있어도 저절로 찍힌다
    } else if (state === 'releasing') { const k = Math.min(1, (now - t0) / T.clear); drawInk(1 - k); if (k >= 1) { state = 'idle'; fill = 0; holdDone = false; }
    } else if (state === 'slam') { drawInk(1, true); const k = Math.min(1, (now - t0) / T.slam), e = Math.pow(k, 3); drawSeal(2.5 - 1.5 * e, Math.min(1, k * 1.6)); if (k >= 1) { state = 'clearing'; t0 = now; el.classList.add('shake'); vib([0, 90]); setTimeout(() => el.classList.remove('shake'), 260); }
    } else if (state === 'clearing') { const k = Math.min(1, (now - t0) / T.clear); const r = maxR * (1 - k * k); if (r > 0) { ctx.save(); ctx.beginPath(); for (let j = 0; j <= 72; j++) { const a = j / 72 * Math.PI * 2, w = 1 + (nz(a) - .5) * 0.5; const x = press.x + Math.cos(a) * r * w, y = press.y + Math.sin(a) * r * w; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); ctx.clip(); ctx.globalAlpha = 0.92 * (1 - k * 0.3); ctx.fillStyle = ink; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      drawSeal(1, 1); if (k >= 1 && committed) { state = 'done'; finish(); } // 저장이 끝나야 결과를 보여 준다
    } else if (state === 'done') { drawSeal(1, 1); }
    else if (state === 'fail') { const k = Math.min(1, (now - t0) / 500); drawInk(1 - k); if (k >= 1) { state = 'idle'; fill = 0; holdDone = false; } }
    if (state !== 'done') raf = requestAnimationFrame(frame); else raf = null;
  }
  function finish() { Snd.chime(); el.classList.add('done'); const v = result?.visitNo || 1; el.querySelector('#rTitle').textContent = `${place.name}`; el.querySelector('#rSub').textContent = `${window.Store.kstToday().replaceAll('-', '.')} · 방문 ${v}회${v > 1 ? ' · 다시 와 주셨네요' : (() => { const m = window.Memory && window.Memory.of(place.id); if (!m) return ' · 첫 도장이에요'; const y = +window.Store.kstToday().slice(0, 4) - +m.last.slice(0, 4); return y >= 1 ? ` · ${y}년 만에 다시 왔어요` : ' · 추억의 그곳에 다시 왔어요'; })()}`; onDone && onDone(result); }

  let pid = null, closed = false; /* 누르기 시작한 손가락만 본다. 다른 손가락이 닿았다 떼도 무시 */
  function begin(cx, cy, id) { pid = id ?? null; clearTimeout(autoT); committed = false; result = null; el.classList.remove('again'); el.querySelector('.guide p').textContent = '꾸우욱 누르고 계세요'; press = { x: W / 2, y: H / 2 - 20 }; /* 어디를 눌러도 먹은 화면 가운데서 번진다 */ state = 'filling'; t0 = performance.now(); lastVib = 0; Snd.brush(); if (!reduce()) vib(holdPattern());
    checked = check ? check() : { ok: true }; // 찍을 수 있는지만 본다. 기록은 손을 뗄 때
    if (!raf) raf = requestAnimationFrame(frame); }
  function down(e) { if (!['idle', 'releasing', 'fail'].includes(state) || el.classList.contains('done')) return; if (e.target.closest('.cancel')) return; e.preventDefault(); fill = 0; holdDone = false; begin(e.clientX, e.clientY, e.pointerId); } /* 중간에 뗐다가 바로 다시 눌러도 받는다 */
  async function up(e) { if (state !== 'filling') return; if (pid !== null && e.pointerId !== undefined && e.pointerId !== pid) return; clearTimeout(autoT); e.preventDefault();
    if (fill < 1) { state = 'releasing'; t0 = performance.now(); vib(0); vib(15); el.classList.remove('inking'); // 중간에 떼면 아무것도 기록하지 않는다
      el.querySelector('.guide p').textContent = '조금만 더 꾹 눌러 주세요'; el.classList.add('again'); return; }
    if (checked && !checked.ok) { state = 'fail'; t0 = performance.now(); vib([30, 40, 30]); el.classList.remove('inking'); toast && toast(checked.reason); return; }
    state = 'slam'; t0 = performance.now(); Snd.thud(); /* 여기서 처음으로 기록한다 */
    let r; try { r = await commit(); } catch (e2) { r = { ok: false, reason: '저장 중 문제가 생겼어요' }; }
    if (closed) return; /* 저장 기다리는 중에 닫았으면 아무것도 안 한다 */
    if (!r || !r.ok) { state = 'fail'; t0 = performance.now(); committed = false; vib([30, 40, 30]); el.classList.remove('inking'); toast && toast(r?.reason || '인증에 실패했어요'); if (!raf) raf = requestAnimationFrame(frame); return; }
    result = r; committed = true; }
    // 떼는 건 어디서 떼도 받는다 (바텀시트의 도장에서 시작한 경우 포함)
  el.addEventListener('pointerdown', down); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.querySelector('.cancel').onclick = () => { close(); onCancel && onCancel(); };
  el.querySelector('#rDogam').onclick = () => { close(); onDogam && onDogam(result); };
  el.querySelector('#rPhoto').onclick = () => { close(); onPhoto && onPhoto(result); };
  function close() { closed = true; clearTimeout(autoT); cancelAnimationFrame(raf); removeEventListener('resize', resize); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); el.remove(); }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); el.classList.add('onmap');
  if (start) { begin(start.x, start.y, start.pointerId); el.querySelector('.guide p').textContent = '꾸우욱 누르고 계세요'; }
  return { close };
}
return { open, T };
})();
