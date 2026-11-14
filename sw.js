/* 오프라인 셸 캐시. 지도 타일은 캐시하지 않음 (OpenFreeMap 약관)
   - 화면(index)과 js 는 네트워크 먼저, 끊기면 캐시 → 새 버전이 나오면 바로 반영
   - 그 밖(css·아이콘·vendor)은 캐시 먼저 */
const C = 'lm-shell-v47', FILES = ['./', './index.html', './css/app.css', './js/config.js', './js/data.js', './js/media.js', './js/regions.js', './js/store.js', './js/stamp.js', './js/photo.js', './js/guide.js', './js/badges.js', './js/share.js', './js/trip.js', './js/memory.js', './vendor/exifr.lite.js', './js/map.js', './js/app.js', './manifest.webmanifest', './legal/privacy.html', './legal/terms.html', './legal/delete.html', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512-maskable.png', './vendor/maplibre-gl.js', './vendor/maplibre-gl.css', './vendor/supabase.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (u.origin !== location.origin || e.request.method !== 'GET') return;
  const put = res => { if (res && res.ok) { const cp = res.clone(); caches.open(C).then(c => c.put(e.request, cp)); } return res; };
  const netFirst = e.request.mode === 'navigate' || u.pathname.includes('/js/') || u.pathname.includes('/css/') || /* 화면 모양(css)도 항상 새것 먼저: 안 그러면 업데이트 직후 새 코드에 옛 모양이 붙는다 */ u.pathname.endsWith('/index.html');
  if (netFirst) e.respondWith(fetch(e.request).then(put).catch(() => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined))));
  else e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(put)));
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { const c = cs[0]; if (c) return c.focus(); return self.clients.openWindow('./'); })); });
