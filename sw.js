/* ============================================================
 * OK,M饭！家庭菜单系统 — Service Worker
 * 作用：让应用可安装（PWA）并提供离线可用能力
 * 策略：
 *   - 页面导航（index.html）：network-first，保证改版后刷新即拿最新版，
 *     断网时回退到缓存副本
 *   - 同源静态资源（图标/manifest 等）：cache-first
 *   - 跨源资源（Tailwind CDN）：stale-while-revalidate，首次联网后缓存
 * 说明：修改 index.html 后如需强制刷新全站缓存，把 CACHE 版本号 +1 即可
 * ============================================================ */
const CACHE = 'okmfan-cache-v1';

const APP_SHELL = [
  './',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

/* 安装：预缓存应用外壳，并立即接管 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

/* 激活：清理旧版本缓存，接管所有页面 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* 请求拦截 */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) 页面导航：network-first
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./')))
    );
    return;
  }

  // 2) 同源静态资源：cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        });
      })
    );
    return;
  }

  // 3) 跨源资源（如 cdn.tailwindcss.com）：stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
