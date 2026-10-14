// Testes da função de busca (rodam com: node --test tests/*.test.mjs). Sem internet: fetch é simulado.
import test from "node:test";
import assert from "node:assert/strict";

let servidor;
globalThis.Deno = { serve: (f) => { servidor = f; }, env: { get: (k) => ({ SUPABASE_URL: "https://banco.test", SUPABASE_ANON_KEY: "anon" })[k] } };
await import("../supabase/functions/cifras-busca/index.ts");

const ORIGEM = "https://rene17bueno.github.io";
const jwt = (papel) => `x.${Buffer.from(JSON.stringify({ role: papel })).toString("base64url")}.y`;
const USUARIO = "Bearer " + jwt("authenticated");

const CIFRA = `<html><title>Kyrie - Capella | CIFRAS</title><h1>Kyrie</h1><pre><i>Intro</i>\r\r<span>A7+</span>          <span>Bm7</span>         <span>C#m7</span> \rSenhor, que vieste salvar\r<span>D7+</span>    <span>A9</span> \rTem piedade de nós\r</pre></html>`;
const SO_LETRA = `<h1>Letra</h1><pre>Senhor, tende piedade de nós\nCristo, tende piedade de nós\nSenhor, tende piedade de nós</pre>`;
const COM_AVISO = `<pre>aviso curto</pre><h1>Cordeiro</h1><pre>INTRO: G Bm C D4\n\n   G                   Bm7\nCORDEIRO DE DEUS, QUE TIRAIS\n   C        D\nO PECADO DO MUNDO</pre>`;
const SITEMAP = `<urlset><url><loc>https://musicasparamissa.com.br/musica/kyrie-capella/</loc></url><url><loc>https://musicasparamissa.com.br/musica/outra-coisa/</loc></url></urlset>`;
const API = { songs: { hits: [{ COD_TITULO: "kyrie", COD_ARTISTA: "capella" }, { COD_TITULO: "kyrie-eleison", COD_ARTISTA: "jmj" }] } };
const DDG = `<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.exemplo.com.br%2Fcifras%2Fcapella%2Fkyrie%2F&amp;rut=a">K</a>
<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D1">yt</a>
<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.cifraclub.com.br%2Fcapella%2Fkyrie%2F">cc</a>`;

const HOME = `<a href="/sugestoes-para/29o-domingo/">29º Domingo do Tempo Comum – Ano A</a><h3>18/10/2026</h3><a href="/sugestoes-para/finados/"> FINADOS </a><h3>02/11/2026</h3><a href="/sugestoes-para/29o-domingo/"></a>`;
const PAGINA = `<a href="#accorside-1">Canto de Abertura - Sugestões</a><a href="#accorside-2">Primeira Leitura (Is 1)</a><a href="#accorside-3">Hino de Louvor - Sugestões</a>
<div id="accorside-1"><ul><li><a href="/musica/vamos-celebrar/"> VAMOS CELEBRAR (Shalom) </a></li></ul></div>
<div id="accorside-2"><ul><li><a href="/musica/nao-entra/">leitura</a></li></ul></div>
<div id="accorside-3"><ul><li><a href="/musica/gloria-capella/">GLÓRIA (Capella)</a></li></ul></div>`;

const MAPA = `<urlset><url><loc>https://musicasparamissa.com.br/musica/cordeiro-de-deus-i/</loc></url><url><loc>https://musicasparamissa.com.br/musica/salmo-95-gloria-ao-senhor/</loc></url><url><loc>https://musicasparamissa.com.br/musica/a-barca/</loc></url><url><loc>https://musicasparamissa.com.br/musicas-de/entrada-tempo-comum/</loc></url><url><loc>https://musicasparamissa.com.br/musicas-de/aclamacao-10dtc-ano-a/</loc></url><url><loc>https://musicasparamissa.com.br/musicas-de/comunh%C3%A3o-sao-pedro/</loc></url></urlset>`;
const PASTA = `<a href="/musica/a-barca"> <h4>A BARCA</h4><p>letra</p></a><a href="/musica/vamos-celebrar"> <h4>VAMOS CELEBRAR (Shalom)</h4></a>`;

const BANANA_PAGINA = `<title>Fogo abrasador CIFRA</title><script>songdata={"track_id":1,"track_name":"Fogo abrasador","artist_name":"Comunidade Católica Shalom","tab_id":170584}</script><pre id="song-pre"></pre>`;
const BANANA_TAB = { tone: "E", content: "Intro: E9   B   C#m\n\nE9       B               C#m\nSe Tu inflamas o meu coração,\n        G#m                 A\nSe Tu somente és a minha razão," };

let usarMapa = false;
let falhar = new Set();
let cota = true;
globalThis.fetch = async (url) => {
  url = String(url);
  const R = (corpo, tipo = "text/html") => new Response(corpo, { status: 200, headers: { "content-type": tipo } });
  if (url.includes("banco.test/rest/v1/rpc/cifras_cota_aberta")) return R(JSON.stringify(cota), "application/json");
  for (const f of falhar) if (url.includes(f)) return new Response("x", { status: 500 });
  if (url.endsWith("musicasparamissa.com.br/")) return R(HOME);
  if (url.includes("/sugestoes-para/")) return R(PAGINA);
  if (url.includes("/musicas-de/")) return R(PASTA);
  if (url.includes("sitemap.xml")) return R(usarMapa ? MAPA : SITEMAP, "application/xml");
  if (url.includes("cifras.com.br/api/search")) return R(JSON.stringify(API), "application/json");
  if (url.includes("bananacifras.com/search")) return R('{"version":"fd755dcdbd90c073505e1f713b8b92c6"}');
  if (url.includes("searchapi/song")) return R(JSON.stringify([[1, "fogo-abrasador", "Fogo abrasador", "comunidade-catolica-shalom", "Comunidade Católica Shalom", 1]]), "application/json");
  if (url.includes("bananacifra.com/json/tab.js")) return R(JSON.stringify(BANANA_TAB), "application/json");
  if (url.includes("bananacifras.com/cifra/")) return R(BANANA_PAGINA);
  if (url.includes("duckduckgo")) return R(DDG);
  if (url.includes("cifras.com.br/cifra/")) return R(CIFRA);
  if (url.includes("so-letra")) return R(SO_LETRA);
  if (url.includes("com-aviso")) return R(COM_AVISO);
  if (url.includes("bloqueado")) return new Response("no", { status: 403 });
  return new Response("nao", { status: 404 });
};

const chamar = async (qs, { origem = ORIGEM, auth = USUARIO, metodo = "GET" } = {}) => {
  const cabecalhos = {};
  if (origem) cabecalhos.Origin = origem;
  if (auth) cabecalhos.Authorization = auth;
  const r = await servidor(new Request("https://f.test/?" + new URLSearchParams(qs), { method: metodo, headers: cabecalhos }));
  return [r.status, r.status === 204 ? null : await r.json(), r.headers];
};

test.beforeEach(() => { usarMapa = false; falhar = new Set(); cota = true; });

test("acesso: aberto sem login, mas só pela origem do site e com cota global", async () => {
  assert.equal((await chamar({ titulo: "Kyrie" }, { auth: "" }))[0], 200);
  assert.equal((await chamar({ titulo: "Kyrie" }, { origem: "https://outro.site" }))[0], 403);
  assert.equal((await chamar({ titulo: "Kyrie" }, { origem: "" }))[0], 403);
  cota = false;
  assert.equal((await chamar({ titulo: "Kyrie" }))[0], 429);
  const [st, , cab] = await chamar({}, { metodo: "OPTIONS", auth: "" });
  assert.equal(st, 204);
  assert.match(cab.get("access-control-allow-headers"), /authorization/);
});

test("extração: \\r vira \\n, spans somem, artista vem do título, maior <pre> vence", async () => {
  let [st, d] = await chamar({ url: "https://www.cifras.com.br/cifra/capella/kyrie" });
  assert.equal(st, 200);
  assert.ok(!d.cifra.includes("\r"));
  assert.ok(d.cifra.includes("A7+          Bm7"));
  assert.equal(d.artista, "Capella");
  [st, d] = await chamar({ url: "https://site.com.br/com-aviso" });
  assert.equal(st, 200);
  assert.ok(d.cifra.startsWith("INTRO"));
});

test("só letra é recusada; links perigosos e bloqueios", async () => {
  let [st, d] = await chamar({ url: "https://site.com.br/so-letra" });
  assert.equal(st, 404);
  assert.match(d.erro, /não foi encontrada/);
  assert.equal((await chamar({ url: "https://127.0.0.1/x" }))[0], 400);
  assert.equal((await chamar({ url: "https://localhost/x" }))[0], 400);
  assert.equal((await chamar({ url: "https://www.cifraclub.com.br/a/b/" }))[0], 403);
  [st, d] = await chamar({ url: "https://site.com.br/bloqueado" });
  assert.equal(st, 403);
});

test("busca pelo nome junta Músicas para Missa, Cifras.com.br e web", async () => {
  const [st, d] = await chamar({ titulo: "Kyrie", artista: "Capella" });
  assert.equal(st, 200);
  assert.deepEqual([...new Set(d.candidatos.map((c) => c.fonte))].sort(), ["cifras.com.br", "exemplo.com.br", "musicasparamissa.com.br"]);
  assert.ok(!d.candidatos.some((c) => /youtube|cifraclub/.test(c.url)));
  assert.equal(d.candidatos[0].pontos, 135);
  assert.equal(d.candidatos.at(-1).fonte, "exemplo.com.br");
  assert.deepEqual(d.avisos, []);
});

test("uma fonte fora do ar não derruba as outras; todas fora = 502; nome vazio = 400", async () => {
  falhar = new Set(["sitemap.xml"]);
  let [st, d] = await chamar({ titulo: "Kyrie", artista: "Capella" });
  assert.equal(st, 200);
  assert.equal(d.avisos.length, 1);
  assert.ok(d.candidatos.length >= 2);
  falhar = new Set(["sitemap.xml", "cifras.com.br/api", "search.bananacifra.com", "duckduckgo"]);
  assert.equal((await chamar({ titulo: "Kyrie" }))[0], 502);
  falhar = new Set();
  assert.equal((await chamar({ titulo: "  " }))[0], 400);
});

test("sugestões: lista as próximas missas e separa as músicas por parte da missa", async () => {
  let [st, d] = await chamar({ missas: "1" });
  assert.equal(st, 200);
  assert.deepEqual(d.missas, [{ slug: "29o-domingo", titulo: "29º Domingo do Tempo Comum – Ano A", data: "18/10/2026" }, { slug: "finados", titulo: "FINADOS", data: "02/11/2026" }]);
  [st, d] = await chamar({ sugestoes: "29o-domingo" });
  assert.equal(st, 200);
  assert.deepEqual(d.partes, [
    { parte: "Entrada", itens: [{ titulo: "VAMOS CELEBRAR (Shalom)", url: "https://musicasparamissa.com.br/musica/vamos-celebrar/" }] },
    { parte: "Glória", itens: [{ titulo: "GLÓRIA (Capella)", url: "https://musicasparamissa.com.br/musica/gloria-capella/" }] },
  ]);
  assert.equal((await chamar({ sugestoes: "../../etc" }))[0], 400);
});

test("catálogo: classifica pelo nome, escolhe as pastas certas e lê os títulos delas", async () => {
  usarMapa = true;
  let [st, d] = await chamar({ catalogo: "1" });
  assert.equal(st, 200);
  assert.deepEqual(d.musicas, [["cordeiro-de-deus-i", "Cordeiro"], ["salmo-95-gloria-ao-senhor", "Salmo"], ["a-barca", "Outras"]]);
  assert.deepEqual(d.pastas, [["entrada-tempo-comum", "Entrada"], ["comunhão-sao-pedro", "Comunhão"]]);
  [st, d] = await chamar({ pastas: "entrada-tempo-comum,../x,comunhão-sao-pedro" });
  assert.equal(st, 200);
  assert.deepEqual(d.pastas[0], ["entrada-tempo-comum", [["a-barca", "A BARCA"], ["vamos-celebrar", "VAMOS CELEBRAR (Shalom)"]]]);
  assert.equal(d.pastas.length, 2);
});

test("Banana Cifras: busca pelo nome e lê a cifra do JSON", async () => {
  const [, b] = await chamar({ titulo: "Fogo abrasador", artista: "Shalom" });
  assert.ok(b.candidatos.some((c) => c.url === "https://www.bananacifras.com/cifra/c/comunidade-catolica-shalom/fogo-abrasador" && c.fonte === "bananacifras.com"));
  const [st, d] = await chamar({ url: "https://www.bananacifras.com/cifra/c/comunidade-catolica-shalom/fogo-abrasador" });
  assert.equal(st, 200);
  assert.equal(d.artista, "Comunidade Católica Shalom");
  assert.match(d.cifra, /^Intro: E9/);
});

test("sem resultado com o artista digitado, tenta só pelo título", async () => {
  const [, d] = await chamar({ titulo: "Fogo abrasador", artista: "Artista Que Não Existe" });
  assert.ok(d.candidatos.some((c) => c.fonte === "bananacifras.com"));
});
