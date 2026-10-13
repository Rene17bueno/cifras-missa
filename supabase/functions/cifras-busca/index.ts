// @ts-nocheck
/*
 * Busca de cifras para a página HTML (Supabase Edge Function "cifras-busca", Deno).
 * GET /?url=<link da cifra>  ->  {url, titulo, artista, cifra}  ou  {erro}
 * GET /?titulo=<nome>&artista=<nome>  ->  {candidatos: [{url, fonte, pontos}], avisos}
 * GET /?missas=1  ->  {missas: [{slug, titulo, data}]}   (próximas missas do Músicas para Missa)
 * GET /?catalogo=1  ->  {musicas: [[slug, parte]], pastas: [[slug, parte]]}   (varredura, passo 1)
 * GET /?pastas=<slug,slug,...>  ->  {pastas: [[slug, [[musica, titulo]]]]}     (varredura, passo 2)
 * GET /?sugestoes=<slug>  ->  {partes: [{parte, itens: [{titulo, url}]}]}
 * Acesso aberto (sem login), mas só do Origin do site publicado e com cota diária compartilhada
 * (tabela cifras_uso_geral). Assim não vira um proxy aberto.
 */

// O CifraClub responde 403 para qualquer servidor; é preciso procurar a música em outro site
const SITES_BLOQUEADOS = ["cifraclub.com.br", "cifraclub.com"];
const ESPERA_MS = 8000;

// Endereços que podem usar a busca (o site publicado e o servidor local de testes)
const ORIGENS_PERMITIDAS = ["https://rene17bueno.github.io", "http://127.0.0.1:8600", "http://localhost:8600"];

const CABECALHOS_NAVEGADOR = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9",
};

const TENTATIVAS = 3;

// Cifra de verdade tem linhas só de acordes (ou [acordes] no meio da letra); letra pura não serve
const ACORDE = "[A-G][#b]?(?:m|M|maj|min|dim|aug|sus|add)?\\d*(?:[+-]|\\([^)]*\\))*(?:\\/[A-G][#b]?)?";
const LINHA_ACORDES = new RegExp(`^[ \\t]*(?:${ACORDE}[ \\t]+)*${ACORDE}[ \\t]*$`, "gm");
const temAcordes = (cifra) => (cifra.match(LINHA_ACORDES) || []).length >= 2 || /\[[A-G][^\]\n]{0,8}\]/.test(cifra);

/** Lê título, artista e cifra do HTML da página (mesmo resultado do navegador) */
function extrairCifra(html, url) {
  const entidades = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  const texto = (trecho) => trecho
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tudo, nome) => {
      if (nome[0] === "#") {
        const codigo = nome[1].toLowerCase() === "x" ? parseInt(nome.slice(2), 16) : parseInt(nome.slice(1), 10);
        return String.fromCodePoint(codigo);
      }
      return entidades[nome.toLowerCase()] ?? tudo;
    })
    .replace(/\r\n?/g, "\n"); // alguns sites separam as linhas só com \r
  // A cifra é o maior <pre> da página (o primeiro pode ser aviso ou propaganda)
  const cifra = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)]
    .map((m) => texto(m[1]))
    .sort((a, b) => b.length - a.length)[0] || "";
  if (cifra.trim().length < 20 || !temAcordes(cifra)) return null;
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const titulo = texto((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "").trim();
  const partes = titulo.split(" - ");
  const host = new URL(url).hostname;
  let artista = "";
  if (/cifraclub/.test(host) && partes.length >= 3) artista = partes[1];
  else if (/cifras\.com\.br/.test(host) && partes.length >= 2) artista = partes[1].split(" | ")[0]; // "Música - Artista | CIFRAS"
  return {
    url,
    titulo: (h1 ? texto(h1[1]) : titulo).trim(),
    artista: artista.trim(),
    cifra,
  };
}

const LIMITE_DIARIO = 2000; // buscas por dia, somando todo mundo

function cabecalhosCors(origem) {
  return ORIGENS_PERMITIDAS.includes(origem) ? {
    "Access-Control-Allow-Origin": origem,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
  } : {};
}

function resposta(dados, status, origem) {
  const cabecalhos = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store",
    "Vary": "Origin",
    ...cabecalhosCors(origem),
  };
  return new Response(JSON.stringify(dados), { status, headers: cabecalhos });
}

/** Chama uma função do banco com a chave pública (anon) */
async function chamarBanco(nome, corpo) {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: Deno.env.get("SUPABASE_ANON_KEY"), Authorization: "Bearer " + Deno.env.get("SUPABASE_ANON_KEY") },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  if (!r.ok) throw new Error("banco " + r.status);
  return (await r.json()) === true;
}

const hostDe = (url) => url.hostname.replace(/^www\./, "");
const bloqueado = (host) => SITES_BLOQUEADOS.some((s) => host === s || host.endsWith("." + s));
// Só nomes de site na internet pública (nada de IP, localhost ou rede interna)
const hostPublico = (host) => host.includes(".") && !host.includes(":") && !/^[\d.]+$/.test(host) && !/\.(local|internal|localhost)$/.test(host);

async function buscar(link) {
  let alvo;
  try {
    alvo = new URL(link);
  } catch {
    return [{ erro: "Link inválido." }, 400];
  }
  const host = hostDe(alvo);
  if (alvo.protocol !== "https:" || !hostPublico(host)) return [{ erro: "Link inválido (use um endereço https de site)." }, 400];
  if (bloqueado(host)) return [{ erro: "O CifraClub bloqueia buscas automáticas." }, 403];
  alvo.hash = "";

  let status = 0;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      const r = await fetch(alvo.toString(), { headers: CABECALHOS_NAVEGADOR, redirect: "follow", signal: AbortSignal.timeout(ESPERA_MS) });
      status = r.status;
      if (r.ok) {
        if (!/text|html/i.test(r.headers.get("content-type") || "")) return [{ erro: "A cifra não foi encontrada nessa página (não é uma página de site)." }, 404];
        const dados = extrairCifra(await r.text(), alvo.toString());
        return dados ? [dados, 200] : [{ erro: "A cifra não foi encontrada nessa página (sem acordes)." }, 404];
      }
      if (status === 404) return [{ erro: "Página não encontrada (404). Confira o link." }, 404];
      if (status === 403) return [{ erro: "O site bloqueou a busca automática (403)." }, 403]; // tentar de novo não adianta
    } catch {
      status = 0;
    }
    if (tentativa < TENTATIVAS) await new Promise((ok) => setTimeout(ok, 1000 * tentativa));
  }
  return [{ erro: `O site respondeu com erro ${status || "de conexão"}. Tente de novo mais tarde.` }, 502];
}

// ---------------------------------------------------------------- Busca pelo nome em vários sites
// O CifraClub bloqueia servidores; então procuramos a música pelo nome, ao mesmo tempo, em:
//   1. Músicas para Missa (lista de todas as músicas do site, o sitemap)
//   2. Cifras.com.br (busca do próprio site)
//   3. Busca na web (DuckDuckGo): qualquer outro site que tenha a cifra
// Cada fonte pode falhar sozinha sem derrubar as outras.
const SITEMAP_MPM = "https://musicasparamissa.com.br/sitemap.xml";

function palavras(texto) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Pontua um endereço; null se não tiver todas as palavras do título */
function pontuar(titulo, artista, slug) {
  const t = palavras(titulo), a = palavras(artista), s = palavras(slug);
  if (!t.length || !t.every((p) => s.includes(p))) return null;
  const extras = s.filter((p) => !t.includes(p) && !a.includes(p)).length;
  const comecaIgual = t.every((p, i) => s[i] === p);
  const temArtista = a.some((p) => p.length > 2 && s.includes(p));
  return 100 - 3 * extras + (comecaIgual ? 15 : 0) + (temArtista ? 20 : 0);
}

const pegar = (url, cabecalhos = {}) => fetch(url, {
  headers: { ...CABECALHOS_NAVEGADOR, ...cabecalhos },
  signal: AbortSignal.timeout(ESPERA_MS),
});

async function deMusicasParaMissa(titulo, artista) {
  const r = await pegar(SITEMAP_MPM);
  if (!r.ok) throw new Error(`Músicas para Missa (erro ${r.status})`);
  return [...(await r.text()).matchAll(/<loc>([^<]*\/musica\/([^<]*?)\/?)<\/loc>/g)]
    .map(([, url, slug]) => ({ url: url.endsWith("/") ? url : url + "/", pontos: pontuar(titulo, artista, slug) }));
}

async function deCifrasComBr(titulo, artista) {
  const r = await pegar("https://www.cifras.com.br/api/search?" + new URLSearchParams({ q: `${titulo} ${artista}`.trim(), songs_take: 15 }), { Accept: "application/json" });
  if (!r.ok) throw new Error(`Cifras.com.br (erro ${r.status})`);
  return ((await r.json()).songs?.hits || []).map((h) => ({
    url: `https://www.cifras.com.br/cifra/${h.COD_ARTISTA}/${h.COD_TITULO}`,
    pontos: pontuar(titulo, artista, `${h.COD_TITULO} ${h.COD_ARTISTA}`),
  }));
}

// Páginas que nunca têm cifra em texto
const SITES_IGNORADOS = /(^|\.)(youtube\.com|youtu\.be|spotify\.com|facebook\.com|instagram\.com|deezer\.com|wikipedia\.org|letras\.mus\.br|vagalume\.com\.br)$/;

async function daWeb(titulo, artista) {
  const r = await pegar("https://html.duckduckgo.com/html/?" + new URLSearchParams({ q: `cifra ${titulo} ${artista}`.trim() }));
  if (!r.ok) throw new Error(`busca na web (erro ${r.status})`);
  return [...(await r.text()).matchAll(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*>/g)].flatMap(([tag]) => {
    try {
      const href = new URL(tag.match(/href="([^"]+)"/)[1].replace(/&amp;/g, "&"), "https://duckduckgo.com");
      const alvo = new URL(href.searchParams.get("uddg") || href.toString());
      const host = hostDe(alvo);
      if (alvo.protocol !== "https:" || !hostPublico(host) || bloqueado(host) || SITES_IGNORADOS.test(host)) return [];
      const pontos = pontuar(titulo, artista, alvo.pathname);
      // -30: sites desconhecidos ficam atrás dos dois sites especializados
      return [{ url: alvo.origin + alvo.pathname, pontos: pontos === null ? null : pontos - 30 }];
    } catch {
      return [];
    }
  });
}

const FONTES = [deMusicasParaMissa, deCifrasComBr, daWeb];

async function procurar(titulo, artista) {
  if (!palavras(titulo).length) return [{ erro: "Informe o nome da música." }, 400];
  const resultados = await Promise.allSettled(FONTES.map((f) => f(titulo, artista)));
  const avisos = resultados.filter((r) => r.status === "rejected").map((r) => r.reason?.message || "fonte fora do ar");
  if (avisos.length === FONTES.length) return [{ erro: "Nenhum site de busca respondeu: " + avisos.join("; ") }, 502];
  const vistos = new Set();
  const candidatos = resultados
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((c) => c.pontos !== null && !vistos.has(c.url) && vistos.add(c.url))
    .map((c) => ({ ...c, fonte: hostDe(new URL(c.url)) }))
    .sort((x, y) => y.pontos - x.pontos)
    .slice(0, 8);
  return [{ candidatos, avisos }, 200];
}

// ---------------------------------------------------------------- Sugestões do Músicas para Missa por domingo/festa
const SITE_MPM = "https://musicasparamissa.com.br";
// Título da seção no site -> parte da missa usada na página
const PARTES_MPM = [
  ["canto de abertura", "Entrada"], ["ato penitencial", "Ato penitencial"], ["hino de louvor", "Glória"],
  ["salmo responsorial", "Salmo"], ["aclamacao", "Aclamação"], ["apresentacao das oferendas", "Ofertório"],
  ["santo", "Santo"], ["cordeiro", "Cordeiro"], ["pos comunhao", "Ação de graças"], ["comunhao", "Comunhão"], ["final", "Final"],
];
const semTags = (h) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

/** Próximas missas com sugestões (a página inicial do site lista as próximas) */
async function listarMissas() {
  const r = await pegar(SITE_MPM + "/");
  if (!r.ok) return [{ erro: `Músicas para Missa (erro ${r.status})` }, 502];
  const html = await r.text();
  const missas = [];
  for (const m of html.matchAll(/href="\/sugestoes-para\/([a-z0-9-]+)\/"[^>]*>\s*([^<]{3,120}?)\s*</g)) {
    if (!missas.some((x) => x.slug === m[1])) missas.push({ slug: m[1], titulo: semTags(m[2]) });
  }
  const datas = html.match(/\d\d\/\d\d\/\d{4}/g) || [];
  if (datas.length === missas.length) missas.forEach((x, i) => { x.data = datas[i]; });
  return [{ missas }, 200];
}

/** Sugestões de uma missa, já separadas pelas partes da página */
async function sugestoesDaMissa(slug) {
  if (!/^[a-z0-9-]{3,100}$/.test(slug)) return [{ erro: "Missa inválida." }, 400];
  const r = await pegar(`${SITE_MPM}/sugestoes-para/${slug}/`);
  if (!r.ok) return [{ erro: r.status === 404 ? "Missa não encontrada." : `Músicas para Missa (erro ${r.status})` }, r.status === 404 ? 404 : 502];
  const html = await r.text();
  const titulos = new Map([...html.matchAll(/<a[^>]*href="#(accorside-[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], semTags(m[2])]));
  const lugares = [...titulos.keys()].map((id) => [id, html.indexOf(`id="${id}"`)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]);
  const partes = [];
  lugares.forEach(([id, ini], k) => {
    const nome = palavras(titulos.get(id)).join(" ");
    const par = PARTES_MPM.find(([chave]) => nome.startsWith(chave));
    if (!par) return;
    const trecho = html.slice(ini, lugares[k + 1]?.[1] ?? html.length);
    const itens = [...trecho.matchAll(/<a[^>]*href="(\/musica\/[a-z0-9-]+\/)"[^>]*>([\s\S]*?)<\/a>/g)]
      .map((m) => ({ titulo: semTags(m[2]), url: SITE_MPM + m[1] })).filter((i) => i.titulo).slice(0, 10);
    if (itens.length) partes.push({ parte: par[1], itens });
  });
  return [{ partes }, 200];
}

// ---------------------------------------------------------------- Catálogo: varredura do Músicas para Missa por parte da missa
// Regras pelo nome da música (vale para o que o site não separa em pastas)
const PARTE_PELO_NOME = [
  ["Salmo", (w) => w.includes("salmo")],
  ["Cordeiro", (w) => w.includes("cordeiro")],
  ["Santo", (w) => (w[0] === "santo" || w.join(" ").includes("santo santo")) && !w.includes("espirito")],
  ["Ato penitencial", (w) => w.some((x) => ["kyrie", "penitencial", "confesso", "confessemos", "piedade", "compaixao"].includes(x)) || w.join(" ").startsWith("senhor que vieste")],
  ["Glória", (w) => w[0] === "gloria" || w.join(" ").includes("hino de louvor")],
  ["Aclamação", (w) => w.includes("aleluia") || w.includes("aclamacao")],
  ["Ofertório", (w) => w.some((x) => ["ofertorio", "oferendas", "oferenda", "apresentacao", "ofertas"].includes(x))],
  ["Pai Nosso", (w) => w.join(" ").includes("pai nosso")],
  ["Amém", (w) => w.includes("amem") || w.includes("doxologia")],
  ["Entrada", (w) => w.some((x) => ["entrada", "abertura"].includes(x))],
  ["Final", (w) => w.some((x) => ["final", "despedida", "encerramento"].includes(x))],
  ["Comunhão", (w) => w.some((x) => ["comunhao", "eucaristia", "comungar"].includes(x))],
  ["Nossa Senhora", (w) => w.includes("maria") || w.join(" ").includes("nossa senhora")],
];
const parteDoNome = (slug) => { const w = palavras(slug); return PARTE_PELO_NOME.find(([, f]) => f(w))?.[0] || "Outras"; };

// Pastas do site que dizem com certeza a parte da missa (as de salmo e aclamação já saem pelo nome)
const PASTAS_MPM = [["pos-comunhao", "Ação de graças"], ["comunhao", "Comunhão"], ["entrada", "Entrada"], ["ofertorio", "Ofertório"], ["final", "Final"],
  ["ato", "Ato penitencial"], ["cordeiro", "Cordeiro"], ["santo", "Santo"], ["amem", "Amém"], ["pai-nosso", "Pai Nosso"], ["hino-de-louvor", "Glória"]];
const parteDaPasta = (pasta) => {
  const p = palavras(pasta).join("-");
  return PASTAS_MPM.find(([prefixo]) => p === prefixo || p.startsWith(prefixo + "-"))?.[1] || null;
};

/** Passo 1: lista todas as músicas do site (com a parte pelo nome) e as pastas a visitar */
async function catalogoInicial() {
  const r = await pegar(SITEMAP_MPM);
  if (!r.ok) return [{ erro: `Músicas para Missa (erro ${r.status})` }, 502];
  const xml = await r.text();
  const musicas = [...xml.matchAll(/<loc>[^<]*\/musica\/([^<\/]+)\/?<\/loc>/g)].map((m) => [m[1], parteDoNome(m[1])]);
  const pastas = [...xml.matchAll(/<loc>[^<]*\/musicas-de\/([^<\/]+)\/?<\/loc>/g)].map((m) => decodeURIComponent(m[1]))
    .map((slug) => [slug, parteDaPasta(slug)]).filter(([, parte]) => parte);
  return [{ musicas, pastas }, 200];
}

/** Passo 2: títulos e músicas de até 12 pastas por vez */
async function catalogoPastas(lista) {
  const slugs = lista.split(",").filter((s) => /^[\p{L}\p{N}-]{2,100}$/u.test(s)).slice(0, 12);
  const resultados = await Promise.allSettled(slugs.map(async (slug) => {
    const r = await pegar(`${SITE_MPM}/musicas-de/${encodeURIComponent(slug)}/`);
    if (!r.ok) throw new Error(String(r.status));
    return [slug, [...(await r.text()).matchAll(/<a href="\/musica\/([^"\/]+)\/?"[^>]*>\s*<h4>([\s\S]*?)<\/h4>/g)].map((m) => [m[1], semTags(m[2])])];
  }));
  return [{ pastas: resultados.flatMap((x) => (x.status === "fulfilled" ? [x.value] : [])), falhas: resultados.filter((x) => x.status === "rejected").length }, 200];
}

Deno.serve(async (request) => {
  const origem = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cabecalhosCors(origem) });
  if (request.method !== "GET") return resposta({ erro: "Use GET." }, 405, origem);
  if (!ORIGENS_PERMITIDAS.includes(origem)) return resposta({ erro: "Origem não permitida." }, 403, origem);

  try {
    if (!(await chamarBanco("cifras_cota_aberta", { limite: LIMITE_DIARIO }))) return resposta({ erro: "Cota diária de buscas atingida." }, 429, origem);
  } catch {
    return resposta({ erro: "Não consegui conferir a cota agora. Tente de novo." }, 503, origem);
  }

  const parametros = new URL(request.url).searchParams;
  const [dados, status] = parametros.has("catalogo") ? await catalogoInicial()
    : parametros.has("pastas") ? await catalogoPastas(parametros.get("pastas") || "")
    : parametros.has("missas") ? await listarMissas()
    : parametros.has("sugestoes") ? await sugestoesDaMissa(parametros.get("sugestoes") || "")
    : parametros.has("titulo") ? await procurar(parametros.get("titulo") || "", parametros.get("artista") || "")
    : await buscar(parametros.get("url") || "");
  return resposta(dados, status, origem);
});
