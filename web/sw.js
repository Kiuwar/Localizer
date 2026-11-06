const C="achei-v1",F=["/","/app.js","/styles.css","/privacidade.html"];
self.addEventListener("install",e=>e.waitUntil(caches.open(C).then(c=>c.addAll(F))));
self.addEventListener("fetch",e=>{if(e.request.method!=="GET"||new URL(e.request.url).origin!==location.origin)return;
e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));});
