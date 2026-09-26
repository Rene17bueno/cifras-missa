#!/usr/bin/env python3
"""
Extrator de Cifras - extrai músicas de missa do CifraClub e do MusicasParaMissa

Uso:
    python cifras_missa.py                       # gera cifras_missa.xlsx
    python cifras_missa.py --formatos docx pdf   # escolhe os formatos
    python cifras_missa.py --formatos pdf --colunas 2
"""

import argparse
import asyncio
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import TimeoutError as PlaywrightTimeout
from playwright.async_api import async_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from exportar import EXPORTADORES  # noqa: E402

# Partes da missa, na ordem em que acontecem
PARTES_MISSA = [
    "Entrada",
    "Ato penitencial",
    "Glória",
    "Salmo",
    "Aclamação",
    "Ofertório",
    "Santo",
    "Cordeiro",
    "Comunhão",
    "Comunhão crianças",
    "Ação de graças",
    "Final",
]

# Lista padrão de músicas (o site é detectado pelo link)
MUSICAS = [
    {"posicao": "Entrada", "url": "https://www.cifraclub.com.br/ministerio-amor-e-adoracao/vamos-celebrar/"},
    {"posicao": "Ato penitencial", "url": "https://www.cifraclub.com.br/capella/kyrie/"},
    {"posicao": "Glória", "url": "https://www.cifraclub.com.br/banda-capella/gloria/"},
    {"posicao": "Aclamação", "url": "https://musicasparamissa.com.br/musica/aclamacao-4o-domingo-da-pascoa/"},
    {"posicao": "Cordeiro", "url": "https://musicasparamissa.com.br/musica/cordeiro-com-shalom/"},
    {"posicao": "Comunhão", "url": "https://www.cifraclub.com.br/catolicas/vejam-eu-andei-pelas-vilas/"},
    {"posicao": "Comunhão crianças", "url": "https://www.cifraclub.com.br/padre-zezinho/amar-como-jesus-amou/#key=5"},
]

TENTATIVAS = 3  # o CifraClub às vezes responde 502; tentar de novo costuma resolver


def detectar_site(url):
    """Descobre o site pelo endereço do link"""
    host = urlparse(url).netloc.lower()
    if "cifraclub" in host:
        return "cifraclub"
    if "musicasparamissa" in host:
        return "musicasparamissa"
    return "outro"


def ordenar_por_missa(musicas):
    """Ordena as músicas na sequência da missa (posições desconhecidas vão para o fim)"""
    def chave(musica):
        if musica["posicao"] in PARTES_MISSA:
            return PARTES_MISSA.index(musica["posicao"])
        return len(PARTES_MISSA)
    return sorted(musicas, key=chave)


def limpar_cifra(texto):
    """Remove linhas vazias do começo/fim sem mexer no alinhamento dos acordes"""
    linhas = [linha.rstrip() for linha in texto.splitlines()]
    while linhas and not linhas[0].strip():
        linhas.pop(0)
    while linhas and not linhas[-1].strip():
        linhas.pop()
    return "\n".join(linhas)


async def abrir_pagina(page, url):
    """Abre a URL, tentando de novo quando o site responde com erro temporário"""
    status = 0
    for tentativa in range(1, TENTATIVAS + 1):
        resposta = await page.goto(url, wait_until="domcontentloaded", timeout=45000)
        status = resposta.status if resposta else 0
        if status == 200:
            return
        if status == 404:
            raise RuntimeError("Página não encontrada (404) - confira o link")
        if status == 403:
            raise RuntimeError("O site bloqueou o acesso (403)")
        if tentativa < TENTATIVAS:
            await page.wait_for_timeout(3000 * tentativa)
    raise RuntimeError(
        f"O site respondeu com erro {status} após {TENTATIVAS} tentativas - "
        "o link pode estar errado ou a música foi removida; abra o link no navegador para conferir"
    )


async def esperar_cifra(page, seletor="pre"):
    """Espera o bloco da cifra ser preenchido e devolve o texto"""
    await page.wait_for_function(
        "s => { const e = document.querySelector(s); return e && e.textContent.trim().length > 20 }",
        arg=seletor,
        timeout=20000,
    )
    return limpar_cifra(await page.text_content(seletor))


async def extrair_cifraclub(page, url):
    """Extrai título, artista e cifra do CifraClub"""
    await abrir_pagina(page, url)
    cifra = await esperar_cifra(page)
    titulo = (await page.text_content("h1") or "").strip()
    # Título da aba: "Música - Artista - Cifra Club"
    partes = (await page.title()).split(" - ")
    artista = partes[1].strip() if len(partes) >= 3 else ""
    return titulo, artista, cifra


async def extrair_musicasparamissa(page, url):
    """Extrai título e cifra do MusicasParaMissa"""
    await abrir_pagina(page, url)
    cifra = await esperar_cifra(page)
    titulo = (await page.text_content("h1") or "").strip()
    return titulo, "", cifra


async def extrair_outro(page, url):
    """Tentativa genérica para outros sites: primeiro bloco <pre> da página"""
    await abrir_pagina(page, url)
    cifra = await esperar_cifra(page)
    titulo = (await page.text_content("h1") or await page.title() or "").strip()
    return titulo, "", cifra


EXTRATORES = {
    "cifraclub": extrair_cifraclub,
    "musicasparamissa": extrair_musicasparamissa,
    "outro": extrair_outro,
}


def resumir_erro(erro):
    """Transforma a exceção numa mensagem curta e compreensível"""
    if isinstance(erro, PlaywrightTimeout):
        return "O site demorou demais ou a cifra não apareceu na página"
    return str(erro).splitlines()[0][:200]


async def abrir_navegador(p):
    """
    O CifraClub bloqueia navegador invisível (headless), então abrimos o Edge
    ou o Chrome com a janela posicionada fora da tela. Se nenhum estiver
    instalado, usa o Chromium do Playwright (o CifraClub pode bloquear).
    """
    args = ["--disable-blink-features=AutomationControlled", "--window-position=-32000,-32000"]
    for canal in ("msedge", "chrome"):
        try:
            return await p.chromium.launch(channel=canal, headless=False, args=args)
        except Exception:
            continue
    return await p.chromium.launch(headless=True, args=args[:1])


async def coletar_todas_cifras(musicas=None, ao_progresso=None):
    """
    Coleta as cifras com Playwright.
    ao_progresso(i, total, musica) é chamado antes de cada música, se informado.
    """
    musicas = MUSICAS if musicas is None else musicas
    dados = []

    async with async_playwright() as p:
        browser = await abrir_navegador(p)
        contexto = await browser.new_context(locale="pt-BR")

        for i, musica in enumerate(musicas, 1):
            if ao_progresso:
                ao_progresso(i, len(musicas), musica)
            print(f"[{i}/{len(musicas)}] Extraindo: {musica['posicao']}...", end=" ", flush=True)

            page = await contexto.new_page()
            item = {"Posição": musica["posicao"], "URL": musica["url"]}
            try:
                extrator = EXTRATORES[detectar_site(musica["url"])]
                titulo, artista, cifra = await extrator(page, musica["url"])
                item.update({"Música": titulo, "Artista": artista, "Cifra": cifra, "Status": "OK", "Erro": ""})
                print("OK")
            except Exception as e:
                item.update({"Música": "", "Artista": "", "Cifra": "", "Status": "Erro", "Erro": resumir_erro(e)})
                print(f"ERRO ({item['Erro']})")
            finally:
                await page.close()
            dados.append(item)

        await browser.close()

    return dados


async def main():
    """Fluxo principal"""
    parser = argparse.ArgumentParser(description="Extrai cifras de missa e gera arquivos")
    parser.add_argument("--formatos", nargs="+", choices=list(EXPORTADORES), default=["xlsx"])
    parser.add_argument("--colunas", type=int, choices=[1, 2], default=1, help="colunas no Word, PDF e TXT")
    args = parser.parse_args()

    print("=" * 80)
    print("Extrator de Cifras - Missa")
    print("=" * 80)

    print("\n[1/2] Coletando cifras...")
    dados = await coletar_todas_cifras(ordenar_por_missa(MUSICAS))

    print("\n[2/2] Gerando arquivos...")
    for formato in args.formatos:
        arquivo = Path(f"cifras_missa.{formato}")
        arquivo.write_bytes(EXPORTADORES[formato](dados, colunas=args.colunas))
        print(f"Arquivo gerado: {arquivo}")

    ok = sum(item["Status"] == "OK" for item in dados)
    print("\n" + "=" * 80)
    print(f"Músicas extraídas: {ok} de {len(dados)}")
    print("=" * 80)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\nInterrompido pelo usuário.")
        sys.exit(1)
