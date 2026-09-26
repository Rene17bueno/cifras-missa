# Cifras da Missa

Extrai cifras do CifraClub e do Músicas para Missa, permite editar e gera arquivos em Word, PDF, texto ou Excel, em 1 ou 2 colunas.

**Site:** <https://rene17bueno.github.io/cifras-missa/>

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

Abre em <http://localhost:8501>. Na página:

1. **Adicionar músicas**: escolha a parte da missa e cole o link. Na aba "Vários links de uma vez", cole um por linha no formato `Parte da missa | link`. Deixe o link vazio para digitar a cifra à mão.
2. **Organizar**: use ⬆️ ⬇️ ❌ em cada música ou **Organizar na ordem da missa**.
3. **Extrair**: **Extrair todas** ou **Extrair só as que faltam** (para tentar de novo as que deram erro).
4. **Revisar e editar**: abra a música, altere título, artista ou cifra e clique em **Salvar alterações**. **Voltar ao original** desfaz as edições. Em **Colunas desta música**, escolha 1 ou 2 colunas só para ela (ou "Padrão"), e ligue **Prévia desta música** para ver como fica. Em **Tom**, escolha o tom (C, C#, D, D#, E, F, F#, G, G#, A, A#, B) ou use **➖ ½ tom** / **➕ ½ tom**; a cifra guardada continua no tom original e **Tom original** desfaz.
5. **Baixar**: escolha o layout padrão (1 ou 2 colunas) e o tamanho da fonte, veja a prévia do PDF e baixe em Word (.docx), PDF, Texto (.txt) ou Excel (.xlsx).

### Repertórios

Na barra lateral: dê um nome ao repertório (ex.: "Missa 28-09"), salve, abra um salvo ou comece um novo.
Tudo é salvo automaticamente em `repertorios/<nome>.json`, e o app reabre o último repertório usado.

### 2 colunas

O layout nunca separa a linha de acordes da letra de baixo e só divide uma estrofe entre colunas se ela não couber inteira.
A última página tem as colunas equilibradas. No modo automático, a fonte é a maior que faz a música caber no menor número de páginas.
Linhas longas demais para a coluna são quebradas num ponto em que acorde e letra têm espaço, mantendo cada acorde sobre a mesma sílaba.

### Linha de comando

```bash
python scripts/cifras_missa.py                              # gera cifras_missa.xlsx
python scripts/cifras_missa.py --formatos docx pdf txt xlsx # escolhe os formatos
python scripts/cifras_missa.py --formatos pdf --colunas 2    # PDF em 2 colunas
```

A lista de músicas da linha de comando fica em `MUSICAS`, no começo de `scripts/cifras_missa.py`.

### Página HTML (GitHub Pages, sem servidor)

A pasta `docs/` tem a mesma ferramenta como página HTML, que roda direto no navegador e pode ser publicada
de graça no GitHub Pages (Settings → Pages → branch `master`, pasta `/docs`). Também abre com dois cliques
em `docs/index.html`.

- Tem as mesmas funções do app: lista com partes da missa, editor, troca de tom, 1 ou 2 colunas por música,
  prévia e downloads em PDF, Word, TXT e Excel (com o mesmo layout do app).
- **Músicas para Missa:** automático. Ao adicionar o link, a cifra é buscada pelo Worker da Cloudflare
  (`worker/`, publicado em `cifras-missa.renebueno17.workers.dev`), que só atende esse site e o CifraClub
  e só responde ao site publicado.
- **CifraClub:** bloqueia qualquer servidor (erro 403), então as cifras chegam pelo favorito **🎵 Enviar cifra**:
  abra uma cifra do CifraClub e clique no favorito; ele busca de uma vez todas as que faltam. Também dá para colar a cifra.
- Os repertórios ficam salvos no navegador. **Salvar cópia (.json)** faz backup e leva para outro aparelho;
  o arquivo é o mesmo formato do app do computador (abre nos dois).

### Site online (Streamlit Community Cloud)

O app pode ser publicado de graça em <https://share.streamlit.io>, a partir deste repositório
(arquivo principal: `app/app_cifras.py`). O `packages.txt` instala as bibliotecas de sistema do navegador
e o app baixa o Chromium na primeira extração.

Diferenças em relação ao computador:

- O CifraClub costuma bloquear a extração vinda de servidores; copie a cifra do site e cole no editor.
  O Músicas para Missa funciona normalmente.
- Os repertórios ficam no servidor: quem acessar o site pode vê-los, e eles podem sumir quando o site reinicia.
  Baixe os arquivos para guardar.

## Estrutura

```text
app/app_cifras.py        interface Streamlit
scripts/cifras_missa.py  extração das cifras (Playwright)
scripts/layout.py        organização em colunas/páginas sem separar acorde e letra
scripts/transpor.py      troca de tom dos acordes mantendo o alinhamento com a letra
scripts/exportar.py      geração de Word, PDF, TXT e Excel
repertorios/             repertórios salvos pelo app (criado automaticamente)
packages.txt             bibliotecas de sistema para o navegador no Streamlit Cloud
docs/                    versão página HTML (index.html, js/, css/, vendor/ com jsPDF, docx e ExcelJS)
worker/                  Cloudflare Worker que busca as cifras para a página (publicar: npx wrangler deploy)
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
