var CACHE_NAME = 'setai-viewer-v1';
var PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/topojson-client@3'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
            .map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  // Network-first for API calls, cache-first for static assets
  var url = e.request.url;

  if (url.includes('e-stat.go.jp') || url.includes('raw.githubusercontent.com')) {
    // Network first, fallback to cache
    e.respondWith(
      fetch(e.request).then(function(res) {
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
        return res;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
  } else {
    // Cache first, fallback to network
    e.respondWith(
      caches.match(e.request).then(function(res) {
        return res || fetch(e.request).then(function(netRes) {
          var clone = netRes.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
          return netRes;
        });
      })
    );
  }
});
