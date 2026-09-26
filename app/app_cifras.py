"""
App Streamlit - Cifras da Missa
Monte a lista de músicas, extraia as cifras, edite, salve o repertório e baixe em Word, PDF, TXT ou Excel.
"""

import asyncio
import json
import re
import sys
import unicodedata
import uuid
import zlib
from datetime import datetime
from pathlib import Path

import fitz  # PyMuPDF, para a prévia do PDF
import streamlit as st

RAIZ = Path(__file__).resolve().parent.parent
PASTA_REPERTORIOS = RAIZ / "repertorios"
ARQUIVO_PARTES = RAIZ / "partes_missa.json"

# Permite importar os módulos da pasta scripts/
sys.path.insert(0, str(RAIZ / "scripts"))
from cifras_missa import (  # noqa: E402
    MUSICAS,
    PARTES_MISSA,
    coletar_todas_cifras,
    detectar_site,
    ordenar_por_missa,
)
from exportar import EXPORTADORES  # noqa: E402
from transpor import nome_tom, tom_da_cifra, transpor  # noqa: E402

st.set_page_config(page_title="Cifras da Missa", page_icon="🎵", layout="wide")

# No Windows, o Playwright precisa do ProactorEventLoop para abrir o navegador
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

# Caixas de texto com fonte monoespaçada, para os acordes ficarem alinhados na edição
st.markdown(
    "<style>textarea{font-family:'Courier New',Consolas,monospace !important;font-size:14px !important}</style>",
    unsafe_allow_html=True,
)

NOMES_SITE = {"cifraclub": "CifraClub", "musicasparamissa": "Músicas para Missa", "outro": "Outro site"}
DOWNLOADS = [
    ("docx", "📄 Word (.docx)", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ("pdf", "📕 PDF (.pdf)", "application/pdf"),
    ("txt", "📝 Texto (.txt)", "text/plain"),
    ("xlsx", "📊 Excel (.xlsx)", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
]
PREFIXOS_WIDGETS = ("pos_", "mus_", "art_", "cif_", "col_", "prev_", "tom_")
BEMOL = {"C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb"}
OPCOES_COLUNAS = {None: "Padrão", 1: "1 coluna", 2: "2 colunas"}


# ---------------------------------------------------------------- Repertórios (arquivos .json)
def arquivo_repertorio(nome):
    seguro = re.sub(r"[^\w\- ()]", "", nome, flags=re.UNICODE).strip() or "sem nome"
    return PASTA_REPERTORIOS / f"{seguro}.json"


def repertorios_salvos():
    """Nomes em ordem alfabética (ordem estável para o menu)"""
    return sorted((a.stem for a in PASTA_REPERTORIOS.glob("*.json")), key=str.lower)


def repertorio_mais_recente():
    arquivos = sorted(PASTA_REPERTORIOS.glob("*.json"), key=lambda a: a.stat().st_mtime, reverse=True)
    return arquivos[0].stem if arquivos else None


def estado_json():
    return json.dumps(
        {"nome": st.session_state.nome, "musicas": st.session_state.musicas}, ensure_ascii=False, indent=1
    )


def salvar_repertorio():
    """Grava o repertório; não sobrescreve outro repertório que já tenha esse nome"""
    destino = arquivo_repertorio(st.session_state.nome)
    anterior = st.session_state.get("arquivo_atual")
    if destino.exists() and destino != anterior:
        st.sidebar.error(f"Já existe um repertório chamado \"{destino.stem}\". Escolha outro nome para salvar.")
        return
    PASTA_REPERTORIOS.mkdir(exist_ok=True)
    conteudo = estado_json()
    destino.write_text(conteudo, encoding="utf-8")
    if anterior and anterior != destino and anterior.exists():
        anterior.unlink()  # o repertório foi renomeado
    st.session_state.arquivo_atual = destino
    st.session_state.ultimo_salvo = conteudo
    st.session_state.salvo_em = datetime.now().strftime("%H:%M:%S")


def nome_livre(base):
    """'base', ou 'base (2)', 'base (3)'... se já existir"""
    nome, n = base, 1
    while arquivo_repertorio(nome).exists():
        n += 1
        nome = f"{base} ({n})"
    return nome


def carregar_repertorio(nome=None, exemplo=False):
    """Carrega um repertório salvo; sem nome, começa um novo (vazio ou com a lista de exemplo)"""
    for chave in [k for k in st.session_state if k.startswith(PREFIXOS_WIDGETS)]:
        del st.session_state[chave]
    if nome:
        dados = json.loads(arquivo_repertorio(nome).read_text(encoding="utf-8"))
        st.session_state.nome = dados["nome"]
        st.session_state.musicas = dados["musicas"]
        st.session_state.arquivo_atual = arquivo_repertorio(nome)
        st.session_state.ultimo_salvo = estado_json()
    else:
        st.session_state.nome = nome_livre(f"Missa {datetime.now():%d-%m-%Y}")
        st.session_state.musicas = [nova_musica(m["posicao"], m["url"]) for m in MUSICAS] if exemplo else []
        st.session_state.arquivo_atual = None
        st.session_state.ultimo_salvo = None
    st.session_state.salvo_em = None


# ---------------------------------------------------------------- Partes da missa (lista suspensa)
def carregar_partes():
    """Lista de partes na ordem da missa; começa com a lista padrão"""
    try:
        return json.loads(ARQUIVO_PARTES.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return list(PARTES_MISSA)


def salvar_partes(partes):
    ARQUIVO_PARTES.write_text(json.dumps(partes, ensure_ascii=False, indent=1), encoding="utf-8")


def _comparavel(texto):
    """Sem acentos, minúsculas e sem espaços sobrando ("comunhao" == "Comunhão")"""
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return " ".join(sem_acento.lower().split())


def parte_da_lista(nome, partes, depois_de=None):
    """
    Devolve o nome como está na lista (ignorando acentos/maiúsculas).
    Se a parte não existe, cria: depois de 'depois_de' ou no fim da lista.
    """
    nome = " ".join(nome.split())
    for parte in partes:
        if _comparavel(parte) == _comparavel(nome):
            return parte
    posicao = partes.index(depois_de) + 1 if depois_de in partes else len(partes)
    partes.insert(posicao, nome)
    salvar_partes(partes)
    return nome


# ---------------------------------------------------------------- Tom
def rotulo_tom(indice, menor):
    """'D#' vira 'D# (Eb)' para facilitar a leitura"""
    nome = nome_tom(indice)
    extra = f" ({BEMOL[nome]}{'m' if menor else ''})" if nome in BEMOL else ""
    return nome + ("m" if menor else "") + extra


def aplicar_tom(item, semitons):
    """Item com a cifra no tom escolhido e o rótulo 'Tom' para o cabeçalho dos arquivos"""
    tom = tom_da_cifra(item["Cifra"])
    rotulo = nome_tom(tom[0] + semitons, tom[1]) if tom else ""
    return {**item, "Cifra": transpor(item["Cifra"], semitons), "Tom": rotulo}


def mudar_tom(musica, semitons):
    """Callback: roda antes de a página ser redesenhada, sem interromper o resto da tela"""
    musica["transpor"] = semitons % 12


def escolher_tom(musica, raiz, chave):
    mudar_tom(musica, st.session_state[chave] - raiz)


def descricao_tom(musica):
    """'Tom: D' ou 'Tom: D (original C)' para mostrar na lista"""
    resultado = musica["resultado"]
    tom = tom_da_cifra(resultado["Cifra"]) if resultado and resultado["Status"] == "OK" else None
    if not tom:
        return ""
    semitons = musica.get("transpor", 0)
    atual = rotulo_tom(tom[0] + semitons, tom[1])
    return f"Tom: {atual}" + (f" (original {rotulo_tom(*tom)})" if semitons else "")


def nova_musica(posicao, url):
    return {"id": uuid.uuid4().hex, "posicao": posicao, "url": url.strip(), "resultado": None}


def link_valido(url):
    return url.startswith(("http://", "https://"))


# Ao abrir o app, retoma o último repertório salvo
if "musicas" not in st.session_state:
    recente = repertorio_mais_recente()
    carregar_repertorio(recente, exemplo=recente is None)
# Botões "Abrir"/"Novo" pedem o carregamento, que acontece aqui, antes de os campos serem desenhados
if "abrir" in st.session_state:
    carregar_repertorio(st.session_state.pop("abrir"))
# Salva já (repertório novo ou renomeado) para o menu de repertórios mostrar a lista atualizada
if estado_json() != st.session_state.ultimo_salvo:
    salvar_repertorio()

musicas = st.session_state.musicas
partes = carregar_partes()

# ---------------------------------------------------------------- Barra lateral
with st.sidebar:
    st.header("📁 Repertório")
    st.text_input("Nome do repertório", key="nome")
    if st.button("💾 Salvar repertório", type="primary", width="stretch"):
        salvar_repertorio()
        st.toast(f"Repertório salvo: {arquivo_repertorio(st.session_state.nome).name}")
    # Preenchido no fim da página, depois do salvamento automático
    aviso_salvo = st.empty()
    st.caption("As alterações também são salvas automaticamente.")

    st.divider()
    salvos = repertorios_salvos()
    if salvos:
        atual = st.session_state.get("arquivo_atual")
        escolhido = st.selectbox(
            "Abrir repertório salvo", salvos, key="escolha_repertorio",
            index=salvos.index(atual.stem) if atual and atual.stem in salvos else 0,
        )
        if st.button("📂 Abrir", width="stretch"):
            st.session_state.abrir = escolhido
            st.rerun()
    if st.button("🆕 Novo repertório", width="stretch"):
        st.session_state.abrir = None
        st.rerun()

st.title("🎵 Cifras da Missa")
st.caption("1. Adicione os links → 2. Organize → 3. Extraia → 4. Revise e edite → 5. Baixe")

# ---------------------------------------------------------------- 1. Adicionar
st.header("1. Adicionar músicas")
aba_um, aba_varios = st.tabs(["Um link", "Vários links de uma vez"])

with aba_um:
    with st.form("adicionar", clear_on_submit=True):
        col_pos, col_url = st.columns([1, 3])
        posicao = col_pos.selectbox(
            "Parte da missa", partes, accept_new_options=True,
            help="Escolha na lista ou digite um nome novo para criar a parte.",
        )
        url = col_url.text_input(
            "Link da cifra (deixe vazio para digitar a cifra à mão)",
            placeholder="https://www.cifraclub.com.br/...",
        )
        if st.form_submit_button("➕ Adicionar", type="primary"):
            if url.strip() and not link_valido(url.strip()):
                st.error("Cole um link completo, começando com https://")
            else:
                musicas.append(nova_musica(parte_da_lista(posicao, partes), url))
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
                posicao, _, url = linha.rpartition("|")
                if link_valido(url.strip()):
                    musicas.append(nova_musica(parte_da_lista(posicao, partes) if posicao.strip() else "Outra", url))
                else:
                    invalidas.append(linha)
            if invalidas:
                st.error("Linhas ignoradas (link inválido):\n\n" + "\n\n".join(invalidas))
            else:
                st.rerun()

# ---------------------------------------------------------------- 2. Organizar
st.header(f"2. Lista de músicas ({len(musicas)})")

with st.expander("⚙️ Partes da missa (opções da lista suspensa)"):
    st.caption("Ordem usada em **Organizar na ordem da missa**: " + " → ".join(partes))
    with st.form("nova_parte", clear_on_submit=True):
        c1, c2, c3 = st.columns([2, 2, 1], vertical_alignment="bottom")
        nova = c1.text_input("Nova parte", placeholder="Ex.: Salmo responsorial, Canto a Maria")
        depois = c2.selectbox("Colocar depois de", ["(no início)"] + partes, index=len(partes))
        if c3.form_submit_button("➕ Criar parte", type="primary"):
            if not nova.strip():
                st.error("Digite o nome da parte.")
            elif any(_comparavel(p) == _comparavel(nova) for p in partes):
                st.warning(f"A parte \"{nova.strip()}\" já existe.")
            else:
                if depois == "(no início)":
                    partes.insert(0, " ".join(nova.split()))
                    salvar_partes(partes)
                else:
                    parte_da_lista(nova, partes, depois_de=depois)
                st.rerun()

    c1, c2, c3 = st.columns([2, 1, 1.3], vertical_alignment="bottom")
    remover = c1.selectbox("Remover parte", partes, key="parte_remover")
    if c2.button("🗑️ Remover", disabled=not partes):
        partes.remove(remover)
        salvar_partes(partes)
        st.rerun()
    if c3.button("↩️ Restaurar lista padrão"):
        salvar_partes(list(PARTES_MISSA))
        st.rerun()
    st.caption("Remover uma parte não altera as músicas que já usam ela.")

col_a, col_b, _ = st.columns([1.3, 1, 3])
if col_a.button("🔀 Organizar na ordem da missa", disabled=not musicas):
    st.session_state.musicas = ordenar_por_missa(musicas, partes)
    st.rerun()
if col_b.button("🗑️ Limpar lista", disabled=not musicas):
    st.session_state.musicas = []
    st.rerun()

if not musicas:
    st.info("A lista está vazia. Adicione músicas acima.")


def icone(musica):
    resultado = musica["resultado"]
    if resultado is None:
        return "⚪"
    return "🟢" if resultado["Status"] == "OK" else "🔴"


def nome_musica(resultado):
    if not resultado or resultado["Status"] != "OK":
        return ""
    return f"{resultado['Música']} ({resultado['Artista']})" if resultado["Artista"] else resultado["Música"]


for i, musica in enumerate(musicas):
    col_st, col_pos, col_info, col_cima, col_baixo, col_del = st.columns([0.3, 1.2, 5, 0.4, 0.4, 0.4])
    col_st.markdown(f"### {icone(musica)}")
    # Parte que não está na lista (ex.: "Outra" ou removida) continua aparecendo como opção
    opcoes = partes if musica["posicao"] in partes else partes + [musica["posicao"]]
    escolhida = col_pos.selectbox(
        "Parte", opcoes, index=opcoes.index(musica["posicao"]), key=f"pos_{musica['id']}_{musica['posicao']}",
        label_visibility="collapsed", accept_new_options=True,
    )
    if escolhida != musica["posicao"]:
        musica["posicao"] = parte_da_lista(escolhida, partes)
        st.rerun()
    origem = NOMES_SITE[detectar_site(musica["url"])] if musica["url"] else "Digitada à mão"
    tom_info = descricao_tom(musica)
    col_info.markdown(
        f"**{nome_musica(musica['resultado']) or 'Ainda sem cifra'}** · {origem}"
        + (f" · 🎼 {tom_info}" if tom_info else "") + "  \n"
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

com_link = [m for m in musicas if m["url"]]
pendentes = [m for m in com_link if not m["resultado"] or m["resultado"]["Status"] != "OK"]
col_todas, col_pend = st.columns(2)
extrair_todas = col_todas.button("▶️ Extrair todas", type="primary", disabled=not com_link)
extrair_pend = col_pend.button(f"🔁 Extrair só as que faltam ({len(pendentes)})", disabled=not pendentes)
if extrair_todas and any(m["resultado"] and m["resultado"].get("Editado") for m in com_link):
    st.warning("Atenção: extrair todas de novo substitui as cifras que você editou.")

alvo = com_link if extrair_todas else pendentes if extrair_pend else []
if alvo:
    barra = st.progress(0.0, text="Abrindo o navegador...")

    def ao_progresso(i, total, musica):
        barra.progress((i - 1) / total, text=f"[{i}/{total}] {musica['posicao']}...")

    dados = asyncio.run(coletar_todas_cifras(alvo, ao_progresso))
    for musica, item in zip(alvo, dados):
        item["Original"] = {"Música": item["Música"], "Artista": item["Artista"], "Cifra": item["Cifra"]}
        musica["resultado"] = item
    barra.empty()
    st.rerun()

@st.cache_data(show_spinner=False, max_entries=40)
def gerar(formato, dados_json, colunas, tamanho):
    return EXPORTADORES[formato](json.loads(dados_json), colunas=colunas, tamanho=tamanho)


@st.cache_data(show_spinner=False, max_entries=40)
def imagens_pdf(pdf):
    documento = fitz.open(stream=pdf, filetype="pdf")
    return [pagina.get_pixmap(dpi=90).tobytes("png") for pagina in documento]


# Opções gerais da seção 5 (lidas aqui para a prévia de cada música usar as mesmas)
colunas_padrao = st.session_state.get("layout_padrao", 2)
fonte_escolhida = st.session_state.get("fonte", "Automático")
tamanho = None if fonte_escolhida == "Automático" else fonte_escolhida

# ---------------------------------------------------------------- 4. Revisar e editar
com_resultado = [m for m in musicas if m["resultado"]]
erros = [m for m in com_resultado if m["resultado"]["Status"] != "OK"]
if com_resultado:
    ok = len(com_resultado) - len(erros)
    if erros:
        st.warning(f"{ok} de {len(com_resultado)} cifras extraídas. As com 🔴 deram erro:")
        for m in erros:
            st.markdown(
                f"- **{m['posicao']}**: {m['resultado']['Erro']}  \n  <small>{m['url']}</small>",
                unsafe_allow_html=True,
            )
        st.caption("Tente **Extrair só as que faltam**, troque o link, ou cole a cifra à mão no editor abaixo.")
    else:
        st.success(f"Todas as {ok} cifras foram extraídas.")

st.header("4. Revisar e editar")
st.caption(
    "Abra uma música, altere o que precisar e clique em **Salvar alterações**. "
    "Mantenha os acordes na linha de cima da letra, com espaços para alinhar."
)

for musica in musicas:
    mid = musica["id"]
    resultado = musica["resultado"] or {}
    editada = " ✏️ editada" if resultado.get("Editado") else ""
    titulo = nome_musica(resultado) or "sem cifra - cole ou digite aqui"
    cifra_atual = resultado.get("Cifra", "")
    # A chave dos campos muda quando a cifra guardada muda (extração, salvar, voltar ao original),
    # para os campos mostrarem o conteúdo novo em vez do texto antigo que ficou no navegador
    versao = zlib.crc32(json.dumps([resultado.get("Música"), resultado.get("Artista"), cifra_atual]).encode())
    # O título da seção muda ao salvar (ex.: "✏️ editada"), e o Streamlit a recria fechada;
    # por isso a última música salva reabre aberta
    with st.expander(
        f"{icone(musica)} {musica['posicao']} — {titulo}{editada}",
        expanded=st.session_state.get("manter_aberta") == mid,
    ):
        if musica["url"]:
            st.markdown(f"[Abrir no site]({musica['url']})")
        c1, c2 = st.columns(2)
        novo_titulo = c1.text_input("Música", resultado.get("Música", ""), key=f"mus_{mid}_{versao}")
        novo_artista = c2.text_input("Artista", resultado.get("Artista", ""), key=f"art_{mid}_{versao}")
        nova_cifra = st.text_area(
            "Cifra",
            cifra_atual,
            key=f"cif_{mid}_{versao}",
            height=min(700, 40 + 22 * max(8, cifra_atual.count("\n") + 1)),
        )

        mudou = (novo_titulo, novo_artista, nova_cifra) != (
            resultado.get("Música", ""),
            resultado.get("Artista", ""),
            cifra_atual,
        )
        b1, b2, b3 = st.columns([1, 1, 3])
        if b1.button("💾 Salvar alterações", key=f"salvar_{mid}", type="primary", disabled=not mudou):
            if not nova_cifra.strip():
                st.error("A cifra está vazia.")
            else:
                musica["resultado"] = {
                    **resultado,
                    "Posição": musica["posicao"],
                    "URL": musica["url"],
                    "Música": novo_titulo.strip(),
                    "Artista": novo_artista.strip(),
                    "Cifra": nova_cifra.rstrip(),
                    "Status": "OK",
                    "Erro": "",
                    "Editado": True,
                }
                st.session_state.manter_aberta = mid
                st.toast("Alterações salvas")
                st.rerun()
        original = resultado.get("Original")
        if original and resultado.get("Editado"):
            if b2.button("↩️ Voltar ao original", key=f"orig_{mid}"):
                musica["resultado"] = {**resultado, **original, "Editado": False}
                st.session_state.manter_aberta = mid
                st.rerun()
        if mudou:
            b3.caption("⚠️ Alterações não salvas")

        # Tom desta música (vale na hora; a cifra guardada continua no tom original)
        semitons = musica.get("transpor", 0)
        tom = tom_da_cifra(cifra_atual)
        if tom:
            raiz, menor = tom
            t1, t2, t3, t4 = st.columns([1.4, 0.6, 0.6, 1.4], vertical_alignment="bottom")
            chave_tom = f"tom_{mid}_{semitons}"
            t1.selectbox(
                f"Tom (original: {rotulo_tom(raiz, menor)})",
                range(12),
                index=(raiz + semitons) % 12,
                format_func=lambda i: rotulo_tom(i, menor),
                key=chave_tom,
                on_change=escolher_tom,
                args=(musica, raiz, chave_tom),
                help="Tom estimado pelo primeiro acorde. Os acordes mudam na prévia e nos arquivos baixados.",
            )
            t2.button("➖ ½ tom", key=f"desce_{mid}", help="Descer meio tom",
                      on_click=mudar_tom, args=(musica, semitons - 1))
            t3.button("➕ ½ tom", key=f"sobe_{mid}", help="Subir meio tom",
                      on_click=mudar_tom, args=(musica, semitons + 1))
            if semitons:
                t4.button("↩️ Tom original", key=f"tomorig_{mid}", on_click=mudar_tom, args=(musica, 0))
            if semitons:
                st.caption(f"🎼 Tocando em **{rotulo_tom(raiz + semitons, menor)}**. "
                           "O editor continua mostrando o tom original; a prévia e os arquivos saem no tom novo.")

        # Layout desta música (vale na hora, não precisa de "Salvar alterações")
        l1, l2 = st.columns([2, 1], vertical_alignment="bottom")
        escolha = l1.radio(
            "Colunas desta música (Word, PDF e TXT)",
            list(OPCOES_COLUNAS),
            index=list(OPCOES_COLUNAS).index(musica.get("colunas")),
            format_func=lambda n: OPCOES_COLUNAS[n] + (f" ({colunas_padrao})" if n is None else ""),
            horizontal=True,
            key=f"col_{mid}",
            help="Padrão segue a opção geral da seção 5. Baixar.",
        )
        musica["colunas"] = escolha
        # Guarda quais prévias estão ligadas fora do widget: o Streamlit esquece o estado
        # de um widget quando a página é recarregada antes de ele ser desenhado (ex.: ao salvar)
        previas = st.session_state.setdefault("previas", set())
        previa_ligada = l2.toggle("👁️ Prévia desta música", value=mid in previas, key=f"prev_{mid}")
        (previas.add if previa_ligada else previas.discard)(mid)
        if previa_ligada and nova_cifra.strip():
            # Mostra o texto que está na caixa, mesmo antes de salvar
            item = aplicar_tom({
                "Posição": musica["posicao"], "URL": musica["url"], "Música": novo_titulo.strip(),
                "Artista": novo_artista.strip(), "Cifra": nova_cifra.rstrip(), "Status": "OK", "Erro": "",
                "Colunas": escolha,
            }, semitons)
            pdf = gerar("pdf", json.dumps([item], ensure_ascii=False), colunas_padrao, tamanho)
            paginas_musica = imagens_pdf(pdf)
            st.caption(f"{len(paginas_musica)} página(s)" + (" · inclui alterações ainda não salvas" if mudou else ""))
            for inicio in range(0, len(paginas_musica), 2):
                for coluna, imagem in zip(st.columns(2), paginas_musica[inicio:inicio + 2]):
                    coluna.image(imagem, width="stretch")

# ---------------------------------------------------------------- 5. Baixar
prontas = [
    aplicar_tom({**m["resultado"], "Posição": m["posicao"], "Colunas": m.get("colunas")}, m.get("transpor", 0))
    for m in musicas
    if m["resultado"] and m["resultado"]["Status"] == "OK"
]


st.header("5. Baixar")
if not prontas:
    st.info("Nenhuma cifra pronta ainda. Extraia ou digite as cifras acima.")
else:
    o1, o2, _ = st.columns([1.2, 1, 2])
    colunas = o1.radio(
        "Layout padrão (Word, PDF e TXT)", [1, 2], index=1, horizontal=True, key="layout_padrao",
        format_func=lambda n: "1 coluna" if n == 1 else "2 colunas",
        help="Vale para as músicas com colunas em \"Padrão\". Cada música pode ter a sua na seção 4.",
    )
    fonte = o2.selectbox(
        "Tamanho da fonte", ["Automático", 8, 9, 10, 11, 12], key="fonte",
        help="Automático escolhe a maior fonte que faz a música caber no menor número de páginas.",
    )
    tamanho = None if fonte == "Automático" else fonte
    proprias = [m["posicao"] for m in musicas if m.get("colunas") and m["resultado"]]
    if proprias:
        st.caption("Com colunas próprias (definidas na edição): " + ", ".join(proprias))
    dados_json = json.dumps(prontas, ensure_ascii=False, sort_keys=True)
    if len(prontas) < len(musicas):
        st.caption(f"Serão incluídas {len(prontas)} de {len(musicas)} músicas (as que têm cifra).")

    with st.spinner("Gerando arquivos..."):
        arquivos = {formato: gerar(formato, dados_json, colunas, tamanho) for formato, _, _ in DOWNLOADS}
    nome_base = arquivo_repertorio(st.session_state.nome).stem
    for coluna, (formato, rotulo, mime) in zip(st.columns(len(DOWNLOADS)), DOWNLOADS):
        coluna.download_button(
            rotulo, data=arquivos[formato], file_name=f"{nome_base}.{formato}", mime=mime, width="stretch"
        )

    st.subheader("Prévia do PDF")
    paginas = imagens_pdf(arquivos["pdf"])
    st.caption(f"{len(paginas)} página(s)")
    for inicio in range(0, len(paginas), 2):
        for coluna, imagem in zip(st.columns(2), paginas[inicio:inicio + 2]):
            coluna.image(imagem, width="stretch")

# ---------------------------------------------------------------- Salvamento automático
if estado_json() != st.session_state.ultimo_salvo:
    salvar_repertorio()
if st.session_state.salvo_em and estado_json() == st.session_state.ultimo_salvo:
    aviso_salvo.caption(
        f"✅ Salvo às {st.session_state.salvo_em} em `repertorios/{st.session_state.arquivo_atual.name}`"
    )
