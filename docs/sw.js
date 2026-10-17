// Deixa a página funcionar sem internet (repertórios já salvos no aparelho). Online: sempre a versão mais nova.
const CACHE = "musico-catolico-v4";
const ARQUIVOS = ["./", "index.html", "css/estilo.css", "css/nav.css", "js/layout.js", "js/classificar.js", "js/transpor.js", "js/exportar.js", "js/nuvem.js",
  "js/palco.js", "js/app.js", "js/nav.js", "vendor/jspdf.umd.min.js", "vendor/docx.umd.js", "vendor/exceljs.min.js", "icone.svg", "manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(ARQUIVOS.map((a) => c.add(a)))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return; // Supabase e outros sites passam direto
  e.respondWith(
    fetch(req).then((r) => {
      if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
      return r;
    }).catch(() => caches.match(req).then((r) => r || caches.match("index.html"))),
  );
});
