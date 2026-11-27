/* =========================================================================
   별너울 서비스 워커 (2026-11-27)
   · 같은 출처(이 사이트 자신)의 정적 파일만 다룹니다.
   · open-meteo.com · images-api.nasa.gov · skyview.gsfc.nasa.gov 등
     외부 API·CDN 요청은 여기서 가로채지 않고 브라우저에 그대로 넘깁니다.
   · HTML · JS · CSS · manifest 는 Network-first → 새 배포가 새로고침 한 번에 반영됩니다.
     (네트워크가 없을 때만 캐시로 대신합니다.)
   · 이미지(assets/)는 Cache-first → 한 번 본 사진은 오프라인에서도 열립니다.
   배포할 때마다 아래 VERSION 을 올리세요. 올리면 install 에서 코어 캐시를 새로 받습니다.
   ========================================================================= */

var VERSION = '2026-11-27.13';
var CORE_CACHE = 'byeolneoul-core-' + VERSION;
var ASSET_CACHE = 'byeolneoul-assets-v1';
var DATA_CACHE = 'byeolneoul-data-' + VERSION;   // 도감·쿠키 JSON 청크(지연 로딩)
var ASSET_LIMIT = 160;                     // 사진 캐시 최대 개수(무한정 커지지 않게)
var KEEP = [CORE_CACHE, ASSET_CACHE, DATA_CACHE];

/* 첫 설치 때 미리 받아 둘 파일 — 네트워크가 없어도 앱 화면과 계산 기능이 뜨도록 */
var CORE = [
  './',
  './index.html',
  './mobile.html',
  './desktop.html',
  './styles.css',
  './layout-mobile.css',
  './layout-desktop.css',
  './data.js',
  './data-extra.js',
  './regions-kr.js',
  './data-catalog.js',
  './space-data.js',
  './catalog-photos.js',
  './photo-sets.js',
  './photo-ui.js',
  './gallery.js',
  './sky-weather.js',
  './astro.js',
  './splash.js',
  './dial.js',
  './app.js',
  './space-ui.js',
  './learn.js',
  './news.js',
  './feedback.js',
  './views.js',
  './layout.js',
  './pwa.js',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    var cache = await caches.open(CORE_CACHE);
    // 한 파일이 404여도 설치 자체는 실패하지 않게 하나씩 담습니다.
    await Promise.all(CORE.map(function (url) {
      return fetch(new Request(url, { cache: 'reload' }))
        .then(function (res) { if (res && res.ok) return cache.put(url, res); })
        .catch(function () { /* 오프라인 설치 등 — 다음 방문에 다시 채웁니다 */ });
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    var names = await caches.keys();
    await Promise.all(names.map(function (name) {
      if (KEEP.indexOf(name) === -1) return caches.delete(name);   // 지난 버전 코어 캐시 정리
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'VERSION' && event.source) {
    event.source.postMessage({ type: 'VERSION', version: VERSION });
  }
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  // 1) 다른 출처(외부 API·CDN·외부 사진)는 절대 가로채지 않습니다.
  if (url.origin !== self.location.origin) return;

  // 2) 서비스 워커 스크립트 자체는 캐시하지 않습니다(업데이트 판단이 꼬이지 않게).
  if (url.pathname.slice(-6) === '/sw.js') return;

  // 3) 이 사이트의 범위 밖 경로는 건드리지 않습니다.
  var scopePath = '/';
  try {
    scopePath = new URL(self.registration ? self.registration.scope : self.location.href).pathname;
  } catch (e) { scopePath = '/'; }
  scopePath = scopePath.replace(/\/+$/, '');
  if (scopePath && url.pathname.indexOf(scopePath) !== 0) return;

  var dest = req.destination;
  var isCode = req.mode === 'navigate' || dest === 'document' || dest === 'script' ||
               dest === 'style' || dest === 'worker' || /\.webmanifest$/.test(url.pathname);

  // 지연 로딩 JSON(도감·쿠키 청크)은 전용 캐시에 담아 사진 캐시를 밀어내지 않게 합니다.
  if (/\/assets\/data\//.test(url.pathname)) { event.respondWith(dataFirst(req)); return; }

  event.respondWith(isCode ? networkFirst(req) : cacheFirst(req));
});

/* ---------------------------------------------------------------- 전략 */

async function networkFirst(req) {
  try {
    var fresh = await fetchFresh(req);
    if (fresh && fresh.ok && fresh.type === 'basic') await put(CORE_CACHE, req, fresh.clone());
    return fresh;
  } catch (err) {
    var cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    if (req.mode === 'navigate') {
      // index.html 라우터나 처음 보는 주소로 들어와도 앱 화면이 뜨도록
      var shell = (await caches.match('./mobile.html')) || (await caches.match('./index.html'));
      if (shell) return shell;
    }
    return offlinePage();
  }
}

async function dataFirst(req) {
  var cache = await caches.open(DATA_CACHE);
  var hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    var res = await fetch(req);
    if (res && res.ok && res.type === 'basic') await put(DATA_CACHE, req, res.clone());
    return res;
  } catch (err) {
    return new Response('', { status: 504, statusText: 'offline' });
  }
}

async function cacheFirst(req) {
  var cache = await caches.open(ASSET_CACHE);
  var hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    var res = await fetch(req);
    if (res && res.ok && res.type === 'basic') {
      await put(ASSET_CACHE, req, res.clone());
      await trim(ASSET_CACHE, ASSET_LIMIT);
    }
    return res;
  } catch (err) {
    return new Response('', { status: 504, statusText: 'offline' });
  }
}

/* 브라우저 HTTP 캐시에 남은 옛 파일 대신 서버에 다시 물어봅니다(ETag 재검증). */
async function fetchFresh(req) {
  try {
    return await fetch(req, { cache: 'no-cache' });
  } catch (err) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw err;
    return fetch(req);
  }
}

function put(cacheName, req, res) {
  return caches.open(cacheName)
    .then(function (cache) { return cache.put(req, res); })
    .catch(function () { /* 용량 초과·불투명 응답 등은 조용히 넘깁니다 */ });
}

async function trim(cacheName, limit) {
  try {
    var cache = await caches.open(cacheName);
    var keys = await cache.keys();
    if (keys.length <= limit) return;
    for (var i = 0; i < keys.length - limit; i++) await cache.delete(keys[i]);
  } catch (e) { /* 정리 실패는 무시 */ }
}

function offlinePage() {
  return new Response(
    '<!DOCTYPE html><html lang="ko"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>별너울 — 오프라인</title>' +
    '<body style="margin:0;background:#070b14;color:#eef2fb;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px">' +
    '<div><p style="font-size:1.4rem;margin:0 0 8px">연결이 끊겼습니다</p>' +
    '<p style="color:#9aa6c0;margin:0 0 18px;line-height:1.6">이 화면은 아직 저장되지 않았습니다.<br>인터넷에 연결한 뒤 다시 열어 주세요.</p>' +
    '<button onclick="location.reload()" style="background:#ffd479;border:0;border-radius:12px;padding:11px 22px;font-weight:700;color:#1a1206">다시 시도</button></div>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
