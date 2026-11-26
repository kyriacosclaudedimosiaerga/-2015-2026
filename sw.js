const C='pe-v41';const SHELL=['./','index.html','letters.js','extras.js','pe_logos.js','manifest.webmanifest','icon2-192.png','icon2-512.png','icon2-180.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})))));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
 e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request.url.split('?')[0],cp));return r;}).catch(()=>caches.match(e.request.url.split('?')[0])));});
