var CACHE_NAME = 'setai-viewer-v6';

var PRECACHE = [
  './manifest.json',
  './data/index.json'
];

// ---- Install: 静的リソースをプリキャッシュ ----
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE);
    })
  );
  self.skipWaiting();
});

// ---- Activate: 旧キャッシュを削除 ----
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names
          .filter(function(n) { return n !== CACHE_NAME; })
          .map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

// ---- Fetch ----
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // index.html: ネットワーク優先（オフライン時のみキャッシュ）
  if (url.indexOf('index.html') !== -1 || url.endsWith('/') || url.endsWith('/setai-viewer-/')) {
    e.respondWith(
      fetch(e.request).then(function(res) {
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(e.request, clone);
        });
        return res;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }

  // data/XX.json: キャッシュ優先（初回はネットワーク取得してキャッシュ）
  if (url.indexOf('/data/') !== -1 && url.indexOf('.json') !== -1) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        if (cached) return cached;
        return fetch(e.request).then(function(res) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone);
          });
          return res;
        });
      })
    );
    return;
  }

  // 静的アセット: キャッシュ優先、なければネットワーク
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(res) {
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(e.request, clone);
        });
        return res;
      });
    })
  );
});
