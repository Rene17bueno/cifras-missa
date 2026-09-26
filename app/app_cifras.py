"""
App Streamlit - Extrator de Cifras da Missa
Interface para editar a lista de músicas, extrair as cifras e baixar o Excel.
"""

import asyncio
import sys
import tempfile
from pathlib import Path

import pandas as pd
import streamlit as st

# Permite importar o script de extração da pasta scripts/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from cifras_missa import MUSICAS, coletar_todas_cifras, formatar_excel  # noqa: E402

# No Windows, o Playwright precisa do ProactorEventLoop para abrir o navegador
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    # O script imprime ✓/✗; o console cp1252 do Windows não codifica esses caracteres
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

st.set_page_config(page_title="Cifras da Missa", page_icon="🎵", layout="wide")
st.title("🎵 Extrator de Cifras - Missa")
st.caption("Edite a lista de músicas, extraia as cifras e baixe o Excel formatado.")

# Lista de músicas editável
st.subheader("Músicas")
musicas_df = st.data_editor(
    pd.DataFrame(MUSICAS),
    num_rows="dynamic",
    width="stretch",
    column_config={
        "posicao": st.column_config.TextColumn("Posição", required=True),
        "url": st.column_config.LinkColumn("URL", required=True),
        "site": st.column_config.SelectboxColumn(
            "Site", options=["cifraclub", "musicasparamissa"], required=True
        ),
    },
    key="musicas",
)

if st.button("Extrair cifras", type="primary"):
    musicas = musicas_df.dropna(subset=["posicao", "url", "site"]).to_dict("records")
    if not musicas:
        st.warning("Adicione pelo menos uma música.")
    else:
        with st.spinner(f"Extraindo {len(musicas)} música(s)..."):
            st.session_state["dados"] = asyncio.run(coletar_todas_cifras(musicas))

dados = st.session_state.get("dados")
if dados:
    df = pd.DataFrame(dados)

    # Gera o Excel num arquivo temporário e oferece para download
    with tempfile.TemporaryDirectory() as tmp:
        caminho = formatar_excel(df, str(Path(tmp) / "cifras_missa.xlsx"))
        excel_bytes = Path(caminho).read_bytes()
    st.download_button(
        "Baixar Excel",
        data=excel_bytes,
        file_name="cifras_missa.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

    st.subheader("Cifras")
    for item in dados:
        with st.expander(f"{item['Posição']} — {item['Música']}"):
            st.markdown(f"[Abrir fonte]({item['URL']})")
            st.code(item["Cifra"] or "(vazio)", language=None)
