#!/usr/bin/env python3
"""
Extrator de Cifras - Script para extrair músicas de missa do CifraClub e MusicasParaMissa
Gera arquivo Excel formatado
"""

import asyncio
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup
import pandas as pd
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from pathlib import Path
import sys

# Lista de músicas com URLs
MUSICAS = [
    {
        "posicao": "Entrada",
        "url": "https://www.cifraclub.com.br/ministerio-amor-e-adoracao/vamos-celebrar/",
        "site": "cifraclub"
    },
    {
        "posicao": "Ato penitencial",
        "url": "https://www.cifraclub.com.br/capella/kyrie/",
        "site": "cifraclub"
    },
    {
        "posicao": "Glória",
        "url": "https://www.cifraclub.com.br/banda-capella/gloria/",
        "site": "cifraclub"
    },
    {
        "posicao": "Aclamação",
        "url": "https://musicasparamissa.com.br/musica/aclamacao-4o-domingo-da-pascoa/",
        "site": "musicasparamissa"
    },
    {
        "posicao": "Cordeiro",
        "url": "https://musicasparamissa.com.br/musica/cordeiro-com-shalom/",
        "site": "musicasparamissa"
    },
    {
        "posicao": "Comunhão",
        "url": "https://www.cifraclub.com.br/catolicas/vejam-eu-andei-pelas-vilas/",
        "site": "cifraclub"
    },
    {
        "posicao": "Comunhão crianças",
        "url": "https://www.cifraclub.com.br/padre-zezinho/amar-como-jesus-amou/#key=5",
        "site": "cifraclub"
    },
]

async def extrair_cifra_cifraclub(page, url):
    """Extrai cifra do CifraClub"""
    try:
        await page.goto(url, wait_until="networkidle", timeout=30000)
        await page.wait_for_selector("pre.cifra", timeout=10000)
        
        # Título
        titulo = await page.query_selector_all("h1")
        titulo_texto = ""
        if titulo:
            titulo_texto = await titulo[0].text_content()
        
        # Cifra
        cifra_elem = await page.query_selector("pre.cifra")
        cifra_texto = ""
        if cifra_elem:
            cifra_texto = await cifra_elem.text_content()
        
        return titulo_texto.strip(), cifra_texto.strip()
    except Exception as e:
        return f"Erro", f"Não foi possível extrair: {str(e)}"

async def extrair_cifra_musicasparamissa(page, url):
    """Extrai cifra do MusicasParaMissa"""
    try:
        await page.goto(url, wait_until="networkidle", timeout=30000)
        
        # Título
        titulo = await page.query_selector("h1.post-title")
        titulo_texto = ""
        if titulo:
            titulo_texto = await titulo.text_content()
        
        # Cifra (procura por pre ou div.cifra)
        cifra_elem = await page.query_selector("pre")
        if not cifra_elem:
            cifra_elem = await page.query_selector(".cifra")
        
        cifra_texto = ""
        if cifra_elem:
            cifra_texto = await cifra_elem.text_content()
        
        return titulo_texto.strip(), cifra_texto.strip()
    except Exception as e:
        return f"Erro", f"Não foi possível extrair: {str(e)}"

async def coletar_todas_cifras(musicas=None):
    """Coleta todas as cifras com Playwright"""
    musicas = MUSICAS if musicas is None else musicas
    dados = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        
        for i, musica in enumerate(musicas, 1):
            print(f"[{i}/{len(musicas)}] Extraindo: {musica['posicao']}...", end=" ", flush=True)
            
            page = await browser.new_page()
            page.set_default_timeout(30000)
            
            try:
                if musica["site"] == "cifraclub":
                    titulo, cifra = await extrair_cifra_cifraclub(page, musica["url"])
                else:
                    titulo, cifra = await extrair_cifra_musicasparamissa(page, musica["url"])
                
                dados.append({
                    "Posição": musica["posicao"],
                    "Música": titulo,
                    "Cifra": cifra,
                    "URL": musica["url"]
                })
                print("✓")
            except Exception as e:
                dados.append({
                    "Posição": musica["posicao"],
                    "Música": f"Erro: {str(e)[:50]}",
                    "Cifra": "",
                    "URL": musica["url"]
                })
                print(f"✗ ({str(e)[:30]})")
            finally:
                await page.close()
        
        await browser.close()
    
    return dados

def formatar_excel(df, arquivo_saida="cifras_missa.xlsx"):
    """Formata e salva Excel com estilos"""
    
    # Salvar DataFrame
    df[["Posição", "Música", "Cifra"]].to_excel(arquivo_saida, index=False, sheet_name="Cifras")
    
    # Carregar workbook para formatação
    wb = load_workbook(arquivo_saida)
    ws = wb.active
    
    # Estilos
    header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=12)
    border = Border(
        left=Side(style="thin"),
        right=Side(style="thin"),
        top=Side(style="thin"),
        bottom=Side(style="thin")
    )
    
    # Aplicar header
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = border
    
    # Larguras e formatação de conteúdo
    ws.column_dimensions["A"].width = 20
    ws.column_dimensions["B"].width = 35
    ws.column_dimensions["C"].width = 80
    
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
        for cell in row:
            cell.border = border
            cell.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
        
        # Altura da linha (cifras podem ser grandes)
        row[0].alignment = Alignment(horizontal="center", vertical="center")
    
    ws.freeze_panes = "A2"
    wb.save(arquivo_saida)
    return arquivo_saida

async def main():
    """Fluxo principal"""
    print("="*80)
    print("Extrator de Cifras - Missa")
    print("="*80)
    
    print("\n[1/2] Coletando cifras...")
    dados = await coletar_todas_cifras()
    
    print("\n[2/2] Gerando Excel...")
    df = pd.DataFrame(dados)
    arquivo = formatar_excel(df)
    
    print("\n" + "="*80)
    print(f"✓ Arquivo gerado: {arquivo}")
    print(f"✓ Total de músicas: {len(df)}")
    print("="*80)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\nInterrompido pelo usuário.")
        sys.exit(1)
