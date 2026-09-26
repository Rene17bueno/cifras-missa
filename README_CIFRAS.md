# Extrator de Cifras - Missa

Script Python para extrair cifras musicais do CifraClub e MusicasParaMissa e gerar arquivo Excel formatado.

## Instalação

### 1. Instalar dependências
```bash
pip install playwright pandas openpyxl beautifulsoup4
```

### 2. Instalar navegador Playwright
```bash
playwright install chromium
```

## Uso

```bash
python cifras_missa.py
```

Vai gerar arquivo `cifras_missa.xlsx` na mesma pasta.

## O que o script faz

1. **Acessa cada URL** usando Playwright (simula browser real, evita bloqueios)
2. **Extrai título e cifra** com BeautifulSoup
3. **Monta DataFrame** com os dados
4. **Salva Excel formatado** com:
   - Cabeçalho azul com fonte branca
   - Colunas redimensionadas
   - Wrap text nas cifras
   - Linhas com borda

## Customização

Editar a seção `MUSICAS` no script para adicionar/remover urls:

```python
MUSICAS = [
    {
        "posicao": "Entrada",
        "url": "https://...",
        "site": "cifraclub"  # ou "musicasparamissa"
    },
    ...
]
```

## Troubleshooting

**"ModuleNotFoundError: No module named 'playwright'"**
→ Rodar: `pip install playwright`

**"Chromium not found"**
→ Rodar: `playwright install chromium`

**Timeouts**
→ Aumentar valores de timeout no código (ms)

**Cifra em branco**
→ Site mudou estrutura HTML; editar seletores CSS no código
