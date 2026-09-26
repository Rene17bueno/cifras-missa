/*
 * Busca de cifras para a página HTML (Cloudflare Worker).
 * GET /?url=<link da cifra>  ->  {url, titulo, artista, cifra}  ou  {erro}
 *
 * A página no GitHub Pages não pode ler outros sites (o navegador bloqueia),
 * então este Worker busca a página da cifra como um navegador e devolve só o necessário.
 * Só atende os sites de cifra conhecidos e só responde às páginas do Cifras da Missa,
 * para não virar um proxy aberto.
 */

const SITES_PERMITIDOS = ["cifraclub.com.br", "musicasparamissa.com.br"];

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
    });
  const pre = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  const cifra = pre ? texto(pre[1]) : "";
  if (cifra.trim().length < 20) return null;
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const titulo = texto((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "").trim();
  const partes = titulo.split(" - ");
  const cifraclub = /cifraclub/.test(new URL(url).hostname);
  return {
    url,
    titulo: (h1 ? texto(h1[1]) : titulo).trim(),
    artista: cifraclub && partes.length >= 3 ? partes[1].trim() : "",
    cifra,
  };
}

function resposta(dados, status, origem) {
  const cabecalhos = {
    "Content-Type": "application/json; charset=utf-8",
    // Cifra encontrada fica 1 hora em cache; erros não ficam
    "Cache-Control": status === 200 ? "public, max-age=3600" : "no-store",
    "Vary": "Origin",
  };
  if (ORIGENS_PERMITIDAS.includes(origem)) cabecalhos["Access-Control-Allow-Origin"] = origem;
  return new Response(JSON.stringify(dados), { status, headers: cabecalhos });
}

async function buscar(link) {
  let alvo;
  try {
    alvo = new URL(link);
  } catch {
    return [{ erro: "Link inválido." }, 400];
  }
  const host = alvo.hostname.replace(/^www\./, "");
  if (alvo.protocol !== "https:" || !SITES_PERMITIDOS.some((s) => host === s || host.endsWith("." + s))) {
    return [{ erro: "Busca automática só para CifraClub e Músicas para Missa. Cole a cifra no editor." }, 400];
  }
  alvo.hash = "";

  let status = 0;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      const r = await fetch(alvo.toString(), { headers: CABECALHOS_NAVEGADOR, redirect: "follow" });
      status = r.status;
      if (r.ok) {
        const dados = extrairCifra(await r.text(), alvo.toString());
        return dados ? [dados, 200] : [{ erro: "A cifra não foi encontrada nessa página." }, 404];
      }
      if (status === 404) return [{ erro: "Página não encontrada (404). Confira o link." }, 404];
    } catch {
      status = 0;
    }
    if (tentativa < TENTATIVAS) await new Promise((ok) => setTimeout(ok, 1000 * tentativa));
  }
  return [{ erro: `O site respondeu com erro ${status || "de conexão"}. Tente de novo mais tarde.` }, 502];
}

// ---------------------------------------------------------------- Busca pelo nome em outro site
// O CifraClub bloqueia servidores; então procuramos a mesma música no Músicas para Missa,
// pela lista de todas as músicas do site (sitemap), comparando o nome e o artista.
const SITEMAP_MPM = "https://musicasparamissa.com.br/sitemap.xml";

function palavras(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Pontua um endereço do Músicas para Missa; null se não tiver todas as palavras do título */
function pontuar(titulo, artista, slug) {
  const t = palavras(titulo), a = palavras(artista), s = palavras(slug);
  if (!t.length || !t.every((p) => s.includes(p))) return null;
  const extras = s.filter((p) => !t.includes(p) && !a.includes(p)).length;
  const comecaIgual = t.every((p, i) => s[i] === p);
  const temArtista = a.some((p) => p.length > 2 && s.includes(p));
  return 100 - 3 * extras + (comecaIgual ? 15 : 0) + (temArtista ? 20 : 0);
}

async function procurar(titulo, artista) {
  const r = await fetch(SITEMAP_MPM, { headers: CABECALHOS_NAVEGADOR, cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!r.ok) return [{ erro: `Não consegui abrir a lista do Músicas para Missa (erro ${r.status}).` }, 502];
  const enderecos = [...(await r.text()).matchAll(/<loc>([^<]*\/musica\/([^<]*?)\/?)<\/loc>/g)];
  const candidatos = enderecos
    .map(([, url, slug]) => ({ url: url.endsWith("/") ? url : url + "/", slug, pontos: pontuar(titulo, artista, slug) }))
    .filter((c) => c.pontos !== null)
    .sort((x, y) => y.pontos - x.pontos)
    .slice(0, 5);
  return [{ candidatos }, 200];
}

export default {
  async fetch(request) {
    const origem = request.headers.get("Origin") || "";
    if (request.method !== "GET") return resposta({ erro: "Use GET." }, 405, origem);
    const parametros = new URL(request.url).searchParams;
    const [dados, status] = parametros.has("titulo")
      ? await procurar(parametros.get("titulo") || "", parametros.get("artista") || "")
      : await buscar(parametros.get("url") || "");
    return resposta(dados, status, origem);
  },
};
