/*
 * Busca de cifras para a página HTML (Cloudflare Worker).
 * GET /?url=<link da cifra>  ->  {url, titulo, artista, cifra}  ou  {erro}
 *
 * A página no GitHub Pages não pode ler outros sites (o navegador bloqueia),
 * então este Worker busca a página da cifra como um navegador e devolve só o necessário.
 * Atende qualquer site público (https) e só responde às páginas do Cifras da Missa,
 * para não virar um proxy aberto.
 *
 * GET /?titulo=<nome>&artista=<nome>  ->  {candidatos: [{url, fonte, pontos}], avisos}
 * Procura a música em vários sites ao mesmo tempo (Músicas para Missa, Cifras.com.br e busca na web).
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
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
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

function resposta(dados, status, origem) {
  const cabecalhos = {
    "Content-Type": "application/json; charset=utf-8",
    // Resultado completo fica 1 hora em cache; erros e buscas com alguma fonte fora do ar não ficam
    "Cache-Control": status === 200 && !(dados.avisos || []).length ? "public, max-age=3600" : "no-store",
    "Vary": "Origin",
  };
  if (ORIGENS_PERMITIDAS.includes(origem)) cabecalhos["Access-Control-Allow-Origin"] = origem;
  return new Response(JSON.stringify(dados), { status, headers: cabecalhos });
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
  cf: { cacheTtl: 3600, cacheEverything: true },
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

export default {
  async fetch(request) {
    const origem = request.headers.get("Origin") || "";
    if (request.method !== "GET") return resposta({ erro: "Use GET." }, 405, origem);
    if (!ORIGENS_PERMITIDAS.includes(origem)) return resposta({ erro: "Origem não permitida." }, 403, origem);
    const parametros = new URL(request.url).searchParams;
    const [dados, status] = parametros.has("titulo")
      ? await procurar(parametros.get("titulo") || "", parametros.get("artista") || "")
      : await buscar(parametros.get("url") || "");
    return resposta(dados, status, origem);
  },
};
