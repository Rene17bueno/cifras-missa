"""
App Streamlit - Extrator de Cifras da Missa
Monte a lista de músicas colando os links, extraia as cifras e baixe em Word, PDF, TXT ou Excel.
"""

import asyncio
import sys
import uuid
from pathlib import Path

import streamlit as st

# Permite importar os módulos da pasta scripts/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from cifras_missa import (  # noqa: E402
    MUSICAS,
    PARTES_MISSA,
    coletar_todas_cifras,
    detectar_site,
    ordenar_por_missa,
)
from exportar import EXPORTADORES  # noqa: E402

st.set_page_config(page_title="Cifras da Missa", page_icon="🎵", layout="wide")

# No Windows, o Playwright precisa do ProactorEventLoop para abrir o navegador
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

NOMES_SITE = {"cifraclub": "CifraClub", "musicasparamissa": "Músicas para Missa", "outro": "Outro site"}
DOWNLOADS = [
    ("docx", "📄 Word (.docx)", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ("pdf", "📕 PDF (.pdf)", "application/pdf"),
    ("txt", "📝 Texto (.txt)", "text/plain"),
    ("xlsx", "📊 Excel (.xlsx)", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
]


def nova_musica(posicao, url):
    return {"id": uuid.uuid4().hex, "posicao": posicao, "url": url.strip()}


def link_valido(url):
    return url.startswith(("http://", "https://"))


# Estado: lista de músicas e resultados das extrações (por link)
if "musicas" not in st.session_state:
    st.session_state.musicas = [nova_musica(m["posicao"], m["url"]) for m in MUSICAS]
if "resultados" not in st.session_state:
    st.session_state.resultados = {}

musicas = st.session_state.musicas
resultados = st.session_state.resultados

st.title("🎵 Cifras da Missa")
st.caption("1. Adicione os links  →  2. Organize a lista  →  3. Extraia as cifras  →  4. Baixe o arquivo")

# ---------------------------------------------------------------- 1. Adicionar
st.header("1. Adicionar músicas")
aba_um, aba_varios = st.tabs(["Um link", "Vários links de uma vez"])

with aba_um:
    with st.form("adicionar", clear_on_submit=True):
        col_pos, col_url = st.columns([1, 3])
        posicao = col_pos.selectbox("Parte da missa", PARTES_MISSA, accept_new_options=True)
        url = col_url.text_input("Link da cifra", placeholder="https://www.cifraclub.com.br/...")
        if st.form_submit_button("➕ Adicionar", type="primary"):
            if not link_valido(url.strip()):
                st.error("Cole um link completo, começando com https://")
            else:
                musicas.append(nova_musica(posicao, url))
                st.rerun()

with aba_varios:
    with st.form("adicionar_varios", clear_on_submit=True):
        texto = st.text_area(
            "Um por linha, no formato `Parte da missa | link` (ou só o link)",
            placeholder="Entrada | https://www.cifraclub.com.br/...\nGlória | https://musicasparamissa.com.br/...",
            height=150,
        )
        if st.form_submit_button("➕ Adicionar todos", type="primary"):
            invalidas = []
            for linha in filter(str.strip, texto.splitlines()):
                posicao, _, url = linha.rpartition("|") if "|" in linha else ("Outra", "", linha)
                if link_valido(url.strip()):
                    musicas.append(nova_musica(posicao.strip() or "Outra", url))
                else:
                    invalidas.append(linha)
            if invalidas:
                st.error("Linhas ignoradas (link inválido):\n\n" + "\n\n".join(invalidas))
            else:
                st.rerun()

# ---------------------------------------------------------------- 2. Organizar
st.header(f"2. Lista de músicas ({len(musicas)})")

col_a, col_b, col_c, _ = st.columns([1.3, 1, 1, 2])
if col_a.button("🔀 Organizar na ordem da missa", disabled=not musicas):
    st.session_state.musicas = ordenar_por_missa(musicas)
    st.rerun()
if col_b.button("🗑️ Limpar lista", disabled=not musicas):
    st.session_state.musicas = []
    st.rerun()
if col_c.button("↩️ Lista de exemplo"):
    st.session_state.musicas = [nova_musica(m["posicao"], m["url"]) for m in MUSICAS]
    st.rerun()

if not musicas:
    st.info("A lista está vazia. Adicione músicas acima.")

for i, musica in enumerate(musicas):
    resultado = resultados.get(musica["url"])
    if resultado is None:
        situacao = "⚪"
    elif resultado["Status"] == "OK":
        situacao = "🟢"
    else:
        situacao = "🔴"

    col_st, col_pos, col_info, col_cima, col_baixo, col_del = st.columns([0.3, 1.2, 5, 0.4, 0.4, 0.4])
    col_st.markdown(f"### {situacao}")
    musica["posicao"] = col_pos.text_input(
        "Parte", musica["posicao"], key=f"pos_{musica['id']}", label_visibility="collapsed"
    )
    titulo = resultado["Música"] if resultado and resultado["Status"] == "OK" else ""
    col_info.markdown(
        f"**{titulo or 'Ainda não extraída'}** · {NOMES_SITE[detectar_site(musica['url'])]}  \n"
        f"<small>{musica['url']}</small>",
        unsafe_allow_html=True,
    )
    if col_cima.button("⬆️", key=f"cima_{musica['id']}", disabled=i == 0, help="Subir"):
        musicas[i - 1], musicas[i] = musicas[i], musicas[i - 1]
        st.rerun()
    if col_baixo.button("⬇️", key=f"baixo_{musica['id']}", disabled=i == len(musicas) - 1, help="Descer"):
        musicas[i + 1], musicas[i] = musicas[i], musicas[i + 1]
        st.rerun()
    if col_del.button("❌", key=f"del_{musica['id']}", help="Remover"):
        musicas.pop(i)
        st.rerun()

# ---------------------------------------------------------------- 3. Extrair
st.header("3. Extrair cifras")
st.caption(
    "O programa abre o Edge (ou Chrome) com a janela fora da tela, porque o CifraClub "
    "bloqueia navegadores invisíveis. Pode aparecer um ícone na barra de tarefas enquanto ele trabalha."
)

pendentes = [m for m in musicas if resultados.get(m["url"], {}).get("Status") != "OK"]
col_todas, col_pend = st.columns(2)
extrair_todas = col_todas.button("▶️ Extrair todas", type="primary", disabled=not musicas)
extrair_pend = col_pend.button(
    f"🔁 Extrair só as que faltam ({len(pendentes)})", disabled=not pendentes
)

alvo = musicas if extrair_todas else pendentes if extrair_pend else []
if alvo:
    barra = st.progress(0.0, text="Abrindo o navegador...")

    def ao_progresso(i, total, musica):
        barra.progress((i - 1) / total, text=f"[{i}/{total}] {musica['posicao']}...")

    dados = asyncio.run(coletar_todas_cifras(alvo, ao_progresso))
    for item in dados:
        resultados[item["URL"]] = item
    barra.empty()
    st.rerun()

# ---------------------------------------------------------------- 4. Resultado
# Os resultados seguem a ordem atual da lista, com a parte da missa atual
extraidas = [
    {**resultados[m["url"]], "Posição": m["posicao"]} for m in musicas if m["url"] in resultados
]

if extraidas:
    st.header("4. Resultado")
    ok = sum(item["Status"] == "OK" for item in extraidas)
    erros = [item for item in extraidas if item["Status"] != "OK"]

    if erros:
        st.warning(f"{ok} de {len(extraidas)} cifras extraídas. As com 🔴 deram erro:")
        for item in erros:
            st.markdown(f"- **{item['Posição']}**: {item['Erro']}  \n  <small>{item['URL']}</small>", unsafe_allow_html=True)
        st.caption("Dica: use **Extrair só as que faltam** para tentar de novo, ou troque o link.")
    else:
        st.success(f"Todas as {ok} cifras foram extraídas.")

    so_ok = st.checkbox("Baixar só as cifras extraídas com sucesso", value=True, disabled=not erros)
    para_baixar = [item for item in extraidas if item["Status"] == "OK"] if so_ok else extraidas

    for coluna, (formato, rotulo, mime) in zip(st.columns(len(DOWNLOADS)), DOWNLOADS):
        coluna.download_button(
            rotulo,
            data=EXPORTADORES[formato](para_baixar) if para_baixar else b"",
            file_name=f"cifras_missa.{formato}",
            mime=mime,
            disabled=not para_baixar,
            width="stretch",
        )

    st.subheader("Prévia")
    for item in extraidas:
        if item["Status"] == "OK":
            nome = f"{item['Música']} ({item['Artista']})" if item["Artista"] else item["Música"]
            with st.expander(f"🟢 {item['Posição']} — {nome}"):
                st.markdown(f"[Abrir no site]({item['URL']})")
                st.code(item["Cifra"], language=None)
