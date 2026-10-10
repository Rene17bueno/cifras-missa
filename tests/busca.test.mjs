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

let falhar = new Set();
let autorizado = true, cota = true;
globalThis.fetch = async (url) => {
  url = String(url);
  const R = (corpo, tipo = "text/html") => new Response(corpo, { status: 200, headers: { "content-type": tipo } });
  if (url.includes("banco.test/rest/v1/rpc/cifras_autorizado")) return R(JSON.stringify(autorizado), "application/json");
  if (url.includes("banco.test/rest/v1/rpc/cifras_consumir_cota")) return R(JSON.stringify(cota), "application/json");
  for (const f of falhar) if (url.includes(f)) return new Response("x", { status: 500 });
  if (url.includes("sitemap.xml")) return R(SITEMAP, "application/xml");
  if (url.includes("cifras.com.br/api/search")) return R(JSON.stringify(API), "application/json");
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

test.beforeEach(() => { falhar = new Set(); autorizado = true; cota = true; });

test("acesso: exige login, e-mail autorizado, origem do site e cota", async () => {
  assert.equal((await chamar({ titulo: "Kyrie" }, { auth: "" }))[0], 401);
  assert.equal((await chamar({ titulo: "Kyrie" }, { auth: "Bearer " + jwt("anon") }))[0], 401);
  assert.equal((await chamar({ titulo: "Kyrie" }, { origem: "https://outro.site" }))[0], 403);
  autorizado = false;
  assert.equal((await chamar({ titulo: "Kyrie" }))[0], 403);
  autorizado = true; cota = false;
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
  falhar = new Set(["sitemap.xml", "cifras.com.br/api", "duckduckgo"]);
  assert.equal((await chamar({ titulo: "Kyrie" }))[0], 502);
  falhar = new Set();
  assert.equal((await chamar({ titulo: "  " }))[0], 400);
});
