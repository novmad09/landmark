/* 도장 안에 명소 이름을 통째로 넣는다: 길면 2~3줄로 나누고 글자를 줄여 원 안에 맞춘다.
   글자는 하나도 빼지 않고 폰트 크기만 줄인다. R: 도장 반지름, noDate: 아래에 날짜가 없는 도장 */
window.sealFit = (name, R, noDate, round) => {
  const base = String(name).trim(); /* 글자는 빼지 않는다. 길면 폰트만 줄인다 */
  const words = base.replace(/\(/g, ' (').replace(/·/g, '· ').split(/\s+/).filter(Boolean), flat = words.join(''), n = flat.length;
  const bounds = new Set(), soft = new Set(); let acc = 0; words.forEach(w => { acc += w.length; bounds.add(acc); });
  /* 띄어쓰기가 없어도 뜻이 끊기는 자리(국립/중앙/박물관)를 찾는다 */
  const TOK = ['스페이스', '워크', '엑스더', '숲길', '옛길', '의언덕', '의다리', '호국', '평화', '천년', '주목', '메타세쿼이아', '카멜리아', '사려니', '머체왓', '산막이', '콰이강', '탑공원', '국가정원', '관광특구', '아쿠아리움', '어린이', '대공원', '드라마', '촬영장', '디자인', '플라자', '동대문', '남대문', '박람회', '엑스포', '올림픽', '월드컵', '도서관', '전통', '자연', '해양', '생태', '역사', '스카이', '밸리', '타운', '빌리지', '스테이션', '국립공원', '도립공원', '군립공원', '생태공원', '한옥마을', '벽화마을', '출렁다리', '스카이워크', '해수욕장', '케이블카', '모노레일', '테마파크', '관광단지', '관광지', '박물관', '미술관', '과학관', '기념관', '전시관', '문학관', '전망대', '수목원', '식물원', '동물원', '휴양림', '저수지', '유적지', '고분군', '민속촌', '리조트', '터미널', '스퀘어', '국립', '서울', '한강', '중앙', '공원', '타워', '해변', '마을', '시장', '폭포', '계곡', '동굴', '온천', '호수', '대교', '유적', '산성', '읍성', '향교', '서원', '랜드', '월드', '파크', '해상', '해안', '광장', '거리', '골목', '정원', '센터', '문화', '예술', '역사'];
  TOK.forEach(t => { let i = flat.indexOf(t); while (i >= 0) { soft.add(i); soft.add(i + t.length); i = flat.indexOf(t, i + 1); } });
  const ax = !round && n > 10 ? 1.55 : 1; /* 이름이 길면 가로로 긴 도장 */
  const want = n <= 4 ? 1 : ax > 1 ? (n <= 16 ? 2 : 3) : n <= 10 ? 2 : 3; let best = [flat], bc = Infinity;
  const tryCuts = cuts => { const ls = []; let p = 0; [...cuts, n].forEach(c => { ls.push(flat.slice(p, c)); p = c; }); const lens = ls.map(l => l.length);
    const cost = Math.max(...lens) * 10 + cuts.reduce((v, c) => v + (bounds.has(c) ? 0 : soft.has(c) ? 8 : 25), 0) + [...bounds].filter(c => c < n && !cuts.includes(c)).length * 6 + lens.filter(l => l < 2).length * 30 + (Math.max(...lens) - Math.min(...lens)) + ls.length * 4 + Math.max(0, ls.length - want) * 40;
    if (cost < bc) { bc = cost; best = ls; } };
  if (n <= 6) tryCuts([]); /* 끊을 자리가 마땅찮은 짧은 이름은 한 줄로 */
  if (want >= 2 || n > 4) for (let a = 1; a < n; a++) tryCuts([a]);
  if (n >= 6) for (let a = 1; a < n - 1; a++) for (let b = a + 1; b < n; b++) tryCuts([a, b]);
  if (n >= 13) for (let a = 1; a < n - 2; a++) for (let b = a + 1; b < n - 1; b++) for (let c = b + 1; c < n; c++) tryCuts([a, b, c]);
  if (want === 1) best = [flat];
  const L = best.length, maxLen = Math.max(...best.map(l => l.length));
  const wf = L === 1 ? 1.6 : L === 2 ? 1.42 : L === 3 ? 1.26 : 1.14, hf = noDate ? 1.25 : 0.95;
  const size = Math.min(R * 0.64, wf * ax * R / Math.max(maxLen, 2) / 0.96, hf * R / (L * 1.1));
  return { lines: best, size, lh: size * 1.1, y0: noDate ? 0 : -R * 0.16, k: size / R, ax };
};
/* 버튼(HTML)용: 글자 크기는 도장 크기(--sr)에 비례 */
window.sealWide = name => window.sealFit(name, 100).ax > 1;
window.sealHtml = (name, date) => { const f = window.sealFit(name, 100, !date); const e = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<span class="sname" style="font-size:calc(var(--sr,59px) * ${f.k.toFixed(3)})">${f.lines.map(e).join('<br>')}</span>${date ? `<br><small>${date}</small>` : ''}`; };
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
  const SR = place.name.replace(/\s/g, '').length > 6 ? 96 : 86; /* 긴 이름은 찍히는 도장을 키운다 */
  const fit = window.sealFit(place.name, SR), gfit = window.sealFit(place.name, 75, true, true);
  el.innerHTML = `<canvas id="inkC"></canvas><button class="cancel" type="button" aria-label="닫기">×</button>
    <div class="guide"><div class="ring" style="font-size:${Math.min(26, Math.round(gfit.size))}px;line-height:1.12;text-align:center">${gfit.lines.map(l => l.replace(/[&<>]/g, '')).join('<br>')}</div><p>화면을 꾹 눌러 주세요</p><small>먹이 다 번지면 도장이 찍혀요</small></div>
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
  function drawSeal(scale, alpha) { const cx = W / 2, cy = H / 2 - 20, R = Math.min(SR, (W - 40) / 2 / fit.ax); ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle); ctx.scale(scale, scale); ctx.globalAlpha = alpha;
    ctx.beginPath(); for (let k = 0; k <= 96; k++) { const a = k / 96 * Math.PI * 2, w = 1 + (edgeNz(a) - .5) * 0.07; const x = Math.cos(a) * R * w * fit.ax, y = Math.sin(a) * R * w; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); ctx.lineWidth = 9; ctx.strokeStyle = '#C8372D'; ctx.stroke();
    ctx.fillStyle = '#C8372D'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${Math.round(fit.size)}px "Do Hyeon","Nanum Myeongjo",serif`; fit.lines.forEach((l, i) => ctx.fillText(l, 0, fit.y0 + (i - (fit.lines.length - 1) / 2) * fit.lh));
    ctx.font = '600 15px "IBM Plex Sans KR",sans-serif'; ctx.fillText(window.Store.kstToday().replaceAll('-', '.'), 0, R * 0.56);
    if (!reduce()) { ctx.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 70; i++) { const a = Math.random() * Math.PI * 2, rr = R * (0.2 + Math.random() * 0.8); ctx.globalAlpha = Math.random() * 0.5; ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, Math.random() * 2.2, 0, Math.PI * 2); ctx.fill(); } ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore(); }
  function frame(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const live = state === 'filling' || state === 'releasing' || state === 'fail'; // 아직 지도 위
    if (live) ctx.clearRect(0, 0, W, H); else paperBg();
    el.classList.toggle('onmap', live);
    if (state === 'filling') { fill = Math.min(1, (now - t0) / T.fill); drawInk(fill); el.classList.toggle('inking', fill > 0.3);
      if (fill >= 1 && !holdDone) { holdDone = true; vib(0); vib(120); el.querySelector('.guide p').textContent = '손을 떼세요!';
        autoT = setTimeout(() => { if (state === 'filling') up({ preventDefault() {} }); }, 700); } // 계속 누르고 있어도 저절로 찍힌다
    } else if (state === 'releasing') { const k = Math.min(1, (now - t0) / T.clear); drawInk(1 - k); if (k >= 1) { state = 'idle'; fill = 0; holdDone = false; }
    } else if (state === 'slam') { drawInk(1, true); const k = Math.min(1, (now - t0) / T.slam), e = Math.pow(k, 3); drawSeal(2.5 - 1.5 * e, Math.min(1, k * 1.6)); if (k >= 1) { state = 'clearing'; t0 = now; el.classList.add('shake'); vib(90); setTimeout(() => el.classList.remove('shake'), 260); }
    } else if (state === 'clearing') { const k = Math.min(1, (now - t0) / T.clear); const r = maxR * (1 - k * k); if (r > 0) { ctx.save(); ctx.beginPath(); for (let j = 0; j <= 72; j++) { const a = j / 72 * Math.PI * 2, w = 1 + (nz(a) - .5) * 0.5; const x = press.x + Math.cos(a) * r * w, y = press.y + Math.sin(a) * r * w; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); ctx.clip(); ctx.globalAlpha = 0.92 * (1 - k * 0.3); ctx.fillStyle = ink; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      drawSeal(1, 1); if (k >= 1 && committed) { state = 'done'; finish(); } // 저장이 끝나야 결과를 보여 준다
    } else if (state === 'done') { drawSeal(1, 1); }
    else if (state === 'fail') { const k = Math.min(1, (now - t0) / 500); drawInk(1 - k); if (k >= 1) { state = 'idle'; fill = 0; holdDone = false; } }
    if (state !== 'done') raf = requestAnimationFrame(frame); else raf = null;
  }
  function finish() { Snd.chime(); el.classList.add('done'); const v = result?.visitNo || 1; el.querySelector('#rTitle').textContent = `${place.name}`; el.querySelector('#rSub').textContent = `${window.Store.kstToday().replaceAll('-', '.')} · 방문 ${v}회${v > 1 ? ' · 다시 와 주셨네요' : (() => { const m = window.Memory && window.Memory.of(place.id); if (!m) return ' · 첫 도장이에요'; const y = Math.floor((Date.parse(window.Store.kstToday()) - Date.parse(m.last)) / 31557600000); return y >= 1 ? ` · ${y}년 만에 다시 왔어요` : ' · 추억의 그곳에 다시 왔어요'; })()}`; onDone && onDone(result); }

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
  function close() { closed = true; vib(0); clearTimeout(autoT); cancelAnimationFrame(raf); removeEventListener('resize', resize); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); el.remove(); }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); el.classList.add('onmap');
  if (start) { begin(start.x, start.y, start.pointerId); el.querySelector('.guide p').textContent = '꾸우욱 누르고 계세요'; }
  return { close };
}
return { open, T };
})();
