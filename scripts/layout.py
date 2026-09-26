"""
Organiza a cifra em colunas e páginas sem separar o acorde da letra.

Conceitos:
- linha:   (tipo, texto), tipo = "acorde", "letra", "marcador" ([Refrão]) ou "vazia"
- unidade: linhas que nunca são separadas (linha de acordes + a letra logo abaixo)
- estrofe: unidades entre linhas em branco; só é dividida entre colunas se não couber inteira
"""

import math
import re

PT_MM = 0.3528       # 1 ponto tipográfico em milímetros
LARGURA_CHAR = 0.6   # largura de um caractere de fonte monoespaçada (em "em")
ENTRELINHA = 1.2     # altura da linha em relação ao tamanho da fonte
TAMANHOS_AUTO = [11, 10.5, 10, 9.5, 9, 8.5, 8]
RECUO_CONTINUACAO = "  "

ACORDE = re.compile(r"^\(?[A-G][#b]?(?:maj|min|dim|aug|sus|add|[mM°º+\-#b0-9()/])*(?:/[A-G][#b]?[0-9]*)?\)?[,.]?$")
EXTRA = re.compile(r"^(\[[^\]]*\]|\|+|:?\|\|?:?|[xX]\d+|\d+[xX]|%|-+|~|\.\.\.|[A-Za-zÀ-ú]+:)$")
MARCADOR = re.compile(r"^\[[^\]]*\]$")


def tipo_linha(linha):
    texto = linha.strip()
    if not texto:
        return "vazia"
    if MARCADOR.match(texto):
        return "marcador"
    tokens = texto.split()
    if any(ACORDE.match(t) for t in tokens) and all(ACORDE.match(t) or EXTRA.match(t) for t in tokens):
        return "acorde"
    return "letra"


def _estrofes(cifra):
    """Divide a cifra em estrofes; cada estrofe é uma lista de unidades"""
    linhas = [linha.rstrip().replace("\t", "    ") for linha in cifra.splitlines()]
    estrofes, atual, i = [], [], 0
    while i < len(linhas):
        tipo = tipo_linha(linhas[i])
        if tipo == "vazia":
            if atual:
                estrofes.append(atual)
                atual = []
            i += 1
        elif tipo == "acorde" and i + 1 < len(linhas) and tipo_linha(linhas[i + 1]) == "letra":
            atual.append([("acorde", linhas[i]), ("letra", linhas[i + 1])])
            i += 2
        else:
            atual.append([(tipo, linhas[i])])
            i += 1
    if atual:
        estrofes.append(atual)

    # Estrofe só com marcadores ("[Refrão]") vai junto com a estrofe seguinte
    juntas = []
    pendente = []
    for estrofe in estrofes:
        if all(unidade[0][0] == "marcador" for unidade in estrofe):
            pendente += estrofe
        else:
            juntas.append(pendente + estrofe)
            pendente = []
    if pendente:
        juntas.append(pendente)
    return juntas


def _livre(texto, posicao):
    return posicao >= len(texto) or texto[posicao] == " "


def _ponto_de_corte(acorde, letra, largura):
    """Posição onde acorde e letra podem ser cortados juntos (espaço nos dois)"""
    for p in range(largura, len(RECUO_CONTINUACAO), -1):
        if _livre(letra, p) and _livre(acorde, p):
            return p
    # Sem espaço comum (palavra enorme): corta num espaço da letra e recua até não partir um acorde
    p = letra.rfind(" ", 0, largura + 1)
    if p <= 0:
        p = largura
    while p > 0 and not _livre(acorde, p) and acorde[p - 1] != " ":
        p -= 1
    return p if p > len(RECUO_CONTINUACAO) else largura


def _quebrar_par(acorde, letra, largura):
    """Quebra um par acorde+letra longo em pedaços que cabem na largura, mantendo o alinhamento"""
    pedacos = []
    while max(len(acorde), len(letra)) > largura:
        corte = _ponto_de_corte(acorde, letra, largura)
        pedacos.append((acorde[:corte].rstrip(), letra[:corte].rstrip()))
        acorde, letra = acorde[corte:], letra[corte:]
        # Remove o recuo comum aos dois e marca a continuação com um recuo fixo
        recuos = [len(s) - len(s.lstrip()) for s in (acorde, letra) if s.strip()]
        recuo = min(recuos) if recuos else len(max(acorde, letra, key=len))
        acorde = RECUO_CONTINUACAO + acorde[recuo:] if acorde.strip() else ""
        letra = RECUO_CONTINUACAO + letra[recuo:] if letra.strip() else ""
    pedacos.append((acorde, letra))
    return pedacos


def preparar(cifra, largura):
    """
    Analisa a cifra e quebra as linhas maiores que 'largura' caracteres.
    Devolve (unidades, quebras): unidades = [(id_estrofe, [linhas])], quebras = linhas quebradas.
    """
    unidades, quebras = [], 0
    for id_estrofe, estrofe in enumerate(_estrofes(cifra)):
        for unidade in estrofe:
            if all(len(texto) <= largura for _, texto in unidade):
                unidades.append((id_estrofe, unidade))
                continue
            quebras += 1
            if len(unidade) == 2:  # acorde + letra
                for acorde, letra in _quebrar_par(unidade[0][1], unidade[1][1], largura):
                    par = ([("acorde", acorde)] if acorde else []) + ([("letra", letra)] if letra else [])
                    unidades.append((id_estrofe, par))
            else:
                tipo, texto = unidade[0]
                for _, pedaco in _quebrar_par("", texto, largura):
                    unidades.append((id_estrofe, [(tipo, pedaco)]))
    return unidades, quebras


def _altura(unidades, indices):
    """Linhas ocupadas, contando a linha em branco entre estrofes"""
    total = 0
    for n, k in enumerate(indices):
        total += len(unidades[k][1])
        if n and unidades[indices[n - 1]][0] != unidades[k][0]:
            total += 1
    return total


def _distribuir(unidades, capacidade):
    """Preenche colunas de 'capacidade' linhas; devolve colunas como listas de índices de unidades"""
    colunas, atual, usado, i = [], [], 0, 0
    while i < len(unidades):
        estrofe = unidades[i][0]
        j = i
        while j < len(unidades) and unidades[j][0] == estrofe:
            j += 1
        bloco = list(range(i, j))
        altura = _altura(unidades, bloco)
        separador = 1 if atual else 0

        if usado + separador + altura <= capacidade:      # cabe inteira aqui
            atual += bloco
            usado += separador + altura
        elif altura <= capacidade:                        # cabe inteira na próxima coluna
            colunas.append(atual)
            atual, usado = bloco, altura
        else:                                             # maior que uma coluna: divide entre unidades
            for k in bloco:
                h = len(unidades[k][1])
                sep = 1 if atual and unidades[atual[-1]][0] != estrofe else 0
                if atual and usado + sep + h > capacidade:
                    colunas.append(atual)
                    atual, usado, sep = [], 0, 0
                atual.append(k)
                usado += sep + h
        i = j
    if atual:
        colunas.append(atual)
    return colunas


def _linhas(unidades, indices):
    linhas = []
    for n, k in enumerate(indices):
        if n and unidades[indices[n - 1]][0] != unidades[k][0]:
            linhas.append(("vazia", ""))
        linhas += unidades[k][1]
    return linhas


def paginar(unidades, capacidade, n_colunas):
    """Distribui em páginas de n_colunas; a última página tem as colunas equilibradas"""
    colunas = _distribuir(unidades, capacidade)
    if n_colunas > 1 and colunas:
        inicio = (len(colunas) - 1) // n_colunas * n_colunas
        primeira = colunas[inicio][0]
        resto = unidades[primeira:]
        total = _altura(resto, list(range(len(resto))))
        # Menor capacidade que ainda cabe nas colunas da última página
        for cap in range(math.ceil(total / n_colunas), capacidade + 1):
            tentativa = _distribuir(resto, cap)
            if len(tentativa) <= n_colunas:
                colunas = colunas[:inicio] + [[primeira + k for k in c] for c in tentativa]
                break
    colunas = [_linhas(unidades, c) for c in colunas]
    return [colunas[i:i + n_colunas] for i in range(0, len(colunas), n_colunas)] or [[[]]]


def caracteres_por_linha(largura_mm, tamanho):
    return int(largura_mm / (LARGURA_CHAR * tamanho * PT_MM))


def linhas_por_coluna(altura_mm, tamanho):
    return int(altura_mm / (tamanho * ENTRELINHA * PT_MM))


def montar(cifra, n_colunas, largura_mm, altura_mm, tamanho=None):
    """
    Escolhe o tamanho da fonte (se não informado) e organiza a cifra.
    Prioridade: menos páginas; depois fonte maior com poucas linhas quebradas.
    Devolve (tamanho, páginas), páginas = [[coluna, ...], ...], coluna = [(tipo, texto), ...]
    """
    melhor = None
    for t in [tamanho] if tamanho else TAMANHOS_AUTO:
        unidades, quebras = preparar(cifra, caracteres_por_linha(largura_mm, t))
        paginas = paginar(unidades, linhas_por_coluna(altura_mm, t), n_colunas)
        # meio ponto a menos na fonte "vale" 3 linhas quebradas
        nota = (len(paginas), quebras + (TAMANHOS_AUTO[0] - t) * 6)
        if melhor is None or nota < melhor[0]:
            melhor = (nota, t, paginas)
    return melhor[1], melhor[2]
