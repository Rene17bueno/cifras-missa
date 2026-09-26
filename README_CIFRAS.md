# Cifras da Missa

Extrai cifras do CifraClub e do Músicas para Missa e gera arquivos em Word, PDF, texto ou Excel.

## Instalação

```bash
pip install -r requirements.txt
playwright install chromium
```

Precisa do Microsoft Edge ou do Google Chrome instalado (o CifraClub bloqueia o navegador do Playwright).

## Uso

### App (recomendado)

```bash
python -m streamlit run app/app_cifras.py
```

Abre em http://localhost:8501. Na página:

1. **Adicionar músicas**: escolha a parte da missa e cole o link. Na aba "Vários links de uma vez", cole um por linha no formato `Parte da missa | link`.
2. **Organizar**: use ⬆️ ⬇️ ❌ em cada música ou **Organizar na ordem da missa**.
3. **Extrair**: **Extrair todas** ou **Extrair só as que faltam** (para tentar de novo as que deram erro).
4. **Baixar**: Word (.docx), PDF, Texto (.txt) ou Excel (.xlsx).

### Linha de comando

```bash
python scripts/cifras_missa.py                              # gera cifras_missa.xlsx
python scripts/cifras_missa.py --formatos docx pdf txt xlsx # escolhe os formatos
```

A lista de músicas da linha de comando fica em `MUSICAS`, no começo de `scripts/cifras_missa.py`.

## Estrutura

```
app/app_cifras.py        interface Streamlit
scripts/cifras_missa.py  extração das cifras (Playwright)
scripts/exportar.py      geração de Word, PDF, TXT e Excel
```

## Sites suportados

- **CifraClub** (cifraclub.com.br)
- **Músicas para Missa** (musicasparamissa.com.br)
- Outros sites: tenta pegar o primeiro bloco `<pre>` da página

## Problemas comuns

**Erro 502**: o CifraClub às vezes falha; o programa tenta 3 vezes. Se continuar, abra o link no navegador. Se também não abrir, o link está errado ou a música foi removida.

**Erro 403 / "bloqueou o acesso"**: confira se o Edge ou o Chrome está instalado.

**"O site demorou demais"**: a página não carregou ou mudou de estrutura. Tente de novo; se persistir, os seletores em `scripts/cifras_missa.py` precisam ser atualizados.

**Aparece um ícone do Edge na barra de tarefas durante a extração**: é normal. A janela fica fora da tela e fecha no final.
