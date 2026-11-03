/* 공유 카드: 여행·뱃지·사진을 한 장의 그림으로 만들어 바로 공유하거나 저장한다.
   네트워크를 쓰지 않고 캔버스에서 다 그린다. */
window.ShareCard = (function () {
const W = 1080, H = 1350, PAD = 84;
const F = (w, px, fam) => `${w} ${px}px "${fam || 'IBM Plex Sans KR'}", "Apple SD Gothic Neo", sans-serif`;
const DISP = (px) => `400 ${px}px "Do Hyeon", "IBM Plex Sans KR", sans-serif`;
const PAPER = '#F5EFE3', INK = '#1C1A17', RED = '#C8372D';

const ready = () => (document.fonts && document.fonts.ready) ? document.fonts.ready.catch(() => {}) : Promise.resolve();
function card() { const c = document.createElement('canvas'); c.width = W; c.height = H; return { c, g: c.getContext('2d') }; }

/* 종이 바탕 + 자잘한 결 */
function paper(g) {
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(90,70,40,${Math.random() * 0.05})`; g.fillRect(Math.random() * W, Math.random() * H, Math.random() * 3 + 1, Math.random() * 2 + 0.6); }
}
function wrap(g, text, x, y, maxW, lh, max) {
  const words = String(text).split(''); let line = '', n = 0;
  for (const ch of words) { const test = line + ch; if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y + n * lh); line = ch; n++; if (max && n >= max) { g.fillText(line.slice(0, -1) + '…', x, y + n * lh); return n + 1; } } else line = test; }
  g.fillText(line, x, y + n * lh); return n + 1;
}
/* 둥근 먹 도장 (이름 앞 세 글자) */
function seal(g, cx, cy, r, text, color) {
  g.save(); g.translate(cx, cy); g.rotate((Math.random() * 10 - 5) * Math.PI / 180);
  const ph1 = Math.random() * 6.28, ph2 = Math.random() * 6.28;
  g.beginPath(); for (let k = 0; k <= 160; k++) { const a = k / 160 * Math.PI * 2, w = 1 + Math.sin(a * 3 + ph1) * 0.018 + Math.sin(a * 5 + ph2) * 0.012; const x = Math.cos(a) * r * w, y = Math.sin(a) * r * w; k ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.closePath(); g.lineWidth = r * 0.12; g.strokeStyle = color || RED; g.stroke();
  g.fillStyle = color || RED; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = DISP(text.length >= 3 ? r * 0.52 : r * 0.64); g.fillText(text, 0, 0);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 90; i++) { const a = Math.random() * Math.PI * 2, rr = r * Math.random(); g.globalAlpha = Math.random() * 0.45; g.beginPath(); g.arc(Math.cos(a) * rr, Math.sin(a) * rr, Math.random() * r * 0.035, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.restore();
}
function brand(g, y) {
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = 'rgba(28,26,23,.45)';
  g.font = F(600, 30); g.fillText('랜드마크', W / 2, y);
}
const short = n => n.replace(/[\s(].*/, '').slice(0, 3);

/* ---------- 여행 한 장 ---------- */
async function trip(t, ctx) {
  await ready(); const { c, g } = card(); paper(g);
  const byId = window.Store.byId; const places = t.ids.map(byId).filter(Boolean);
  const stamps = ctx.stamps || {}; const went = places.filter(p => stamps[p.id]);
  const dates = went.map(p => stamps[p.id].last).sort();
  const when = dates.length ? (dates[0] === dates.at(-1) ? dates[0] : `${dates[0]} ~ ${dates.at(-1)}`).replaceAll('-', '.') : '';
  // 자동 여행 이름 앞에 붙은 날짜는 위에 따로 적으니 뺀다
  const title = t.name.replace(/^\d{4}[.\-]\d{2}[.\-]\d{2}\s*/, '') || t.name;
  g.textAlign = 'center';
  g.fillStyle = 'rgba(28,26,23,.5)'; g.font = F(600, 34); g.fillText(when, W / 2, 158);
  g.fillStyle = INK; g.font = DISP(78); g.textBaseline = 'alphabetic';
  const lines = wrap(g, title, W / 2, 262, W - PAD * 2, 92, 2);
  let y = 262 + lines * 92 + 34;
  g.font = F(500, 36); g.fillStyle = 'rgba(28,26,23,.55)';
  g.fillText(`${went.length}곳에 도장을 찍었어요`, W / 2, y);
  // 도장 격자 — 남은 공간 한가운데
  const show = went.slice(0, 9), cols = show.length <= 2 ? show.length || 1 : 3;
  const rows = Math.ceil(show.length / cols);
  const gap = 52, R = Math.min(150, Math.floor(((W - PAD * 2) - (cols - 1) * gap) / (cols * 2)), Math.floor(((H - 300 - y) - (rows - 1) * gap) / (rows * 2)));
  const gridW = cols * R * 2 + (cols - 1) * gap, x0 = (W - gridW) / 2 + R;
  const gridH = rows * R * 2 + (rows - 1) * gap, top = y + 46 + Math.max(0, ((H - 230) - (y + 46) - gridH) / 2);
  show.forEach((p, i) => seal(g, x0 + (i % cols) * (R * 2 + gap), top + R + Math.floor(i / cols) * (R * 2 + gap), R, short(p.name), RED));
  let by = top + gridH + 64;
  if (went.length > 9) { g.fillStyle = 'rgba(28,26,23,.5)'; g.font = F(500, 32); g.fillText(`그리고 ${went.length - 9}곳 더`, W / 2, by); by += 52; }
  // 도장에 다 담지 못한 이름만 아래에 적는다
  if (went.length > show.length) { g.font = F(500, 32); g.fillStyle = 'rgba(28,26,23,.65)'; wrap(g, went.map(p => p.name).join(' · '), W / 2, Math.min(by, H - 200), W - PAD * 2, 46, 2); }
  brand(g, H - 76);
  return c;
}

/* ---------- 뱃지 한 장 ---------- */
async function badge(b) {
  await ready(); const { c, g } = card(); paper(g);
  const svg = window.Badges.svg({ ...b, done: true }, 560).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  // 뱃지 SVG 는 CSS 변수를 쓰므로 실제 색으로 바꿔 둔다
  const solid = svg.replace(/var\(--card\)/g, '#FFFFFF').replace(/var\(--line\)/g, '#E6E2DA');
  const img = await load('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(solid));
  g.textAlign = 'center';
  g.fillStyle = RED; g.font = F(700, 32); g.fillText('뱃지 획득', W / 2, 160);
  g.drawImage(img, (W - 560) / 2, 230, 560, 560);
  g.fillStyle = INK; g.font = DISP(70); g.fillText(b.name, W / 2, 900);
  if (b.sub) { g.fillStyle = 'rgba(28,26,23,.55)'; g.font = F(500, 34); g.fillText(b.sub, W / 2, 960); }
  const at = window.Badges.earnedAt(b); if (at) { g.fillStyle = 'rgba(28,26,23,.4)'; g.font = F(500, 30); g.fillText(at.slice(0, 10).replaceAll('-', '.'), W / 2, 1020); }
  brand(g, H - 76);
  return c;
}

/* ---------- 사진 한 장 (이미 도장이 찍힌 사진) ---------- */
async function photo(url, place, date) {
  await ready(); const img = await load(url);
  const c = document.createElement('canvas'), g = c.getContext('2d');
  const s = Math.min(1440 / img.width, 1800 / img.height, 1); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s) + 150;
  g.fillStyle = PAPER; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height - 150);
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillStyle = INK; g.font = DISP(52); g.fillText(place.name, 40, c.height - 76);
  g.fillStyle = 'rgba(28,26,23,.55)'; g.font = F(500, 30); g.fillText(`${place.sido} ${place.gu}${date ? ' · ' + date : ''}`, 40, c.height - 32);
  g.textAlign = 'right'; g.fillStyle = 'rgba(28,26,23,.45)'; g.font = F(600, 28); g.fillText('랜드마크', c.width - 40, c.height - 44);
  return c;
}

function load(src) { return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; }); }

/* 공유하거나(모바일) 내려받는다(PC) */
function send(canvas, name, title) {
  const Cap = window.Capacitor, P = Cap && Cap.Plugins || {};
  /* 네이티브(Capacitor): 웹뷰엔 공유·다운로드가 없으니 파일로 써서 시스템 공유창을 연다 */
  if (Cap && Cap.isNativePlatform && Cap.isNativePlatform() && P.Filesystem && P.Share) {
    return (async () => { try { const data = canvas.toDataURL('image/png').split(',')[1]; const w = await P.Filesystem.writeFile({ path: name, data, directory: 'CACHE' }); await P.Share.share({ title, files: [w.uri] }); return { ok: true, shared: true }; }
      catch (e) { if (e && /cancel/i.test(String(e.message || e))) return { ok: true, cancelled: true }; return { ok: false, reason: '공유하지 못했어요' }; } })();
  }
  return new Promise(res => canvas.toBlob(async blob => {
    if (!blob) return res({ ok: false, reason: '그림을 만들지 못했어요' });
    const file = new File([blob], name, { type: 'image/png' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return res({ ok: true, shared: true }); } }
    catch (e) { if (e && e.name === 'AbortError') return res({ ok: true, cancelled: true }); }
    try { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); return res({ ok: true, saved: true }); }
    catch (e) { return res({ ok: false, reason: '저장하지 못했어요' }); }
  }, 'image/png'));
}
return { trip, badge, photo, send };
})();
