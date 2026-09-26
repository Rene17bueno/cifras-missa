"""
Troca o tom da cifra: sobe/desce os acordes em semitons sem desalinhar da letra.
Só as linhas de acordes são alteradas; os nomes saem com sustenido (C, C#, D, ... B).
"""

import re

from layout import ACORDE, tipo_linha

NOTAS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
LETRAS = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# (abre parêntese) raiz (resto) /baixo (fecha parêntese/pontuação)
PARTES_ACORDE = re.compile(r"^(\(?)([A-G][#b]?)(.*?)(?:/([A-G][#b]?)([0-9]*))?(\)?[,.]?)$")


def indice_nota(nota):
    """'C' -> 0, 'C#' -> 1, 'Db' -> 1, ..., 'B' -> 11"""
    ajuste = {"#": 1, "b": -1}.get(nota[1:2], 0)
    return (LETRAS[nota[0]] + ajuste) % 12


def nome_tom(indice, menor=False):
    return NOTAS[indice % 12] + ("m" if menor else "")


def transpor_acorde(acorde, semitons):
    partes = PARTES_ACORDE.match(acorde)
    if not partes:
        return acorde
    abre, raiz, resto, baixo, numero, fecha = partes.groups()
    novo = abre + nome_tom(indice_nota(raiz) + semitons) + resto
    if baixo:
        novo += "/" + nome_tom(indice_nota(baixo) + semitons) + numero
    return novo + fecha


def transpor_linha(linha, semitons):
    """Cada acorde fica na coluna original; se o anterior cresceu, empurra só o necessário"""
    saida = ""
    for token in re.finditer(r"\S+", linha):
        texto = token.group()
        novo = transpor_acorde(texto, semitons) if ACORDE.match(texto) else texto
        inicio = max(token.start(), len(saida) + 1 if saida.strip() else token.start())
        saida = saida.ljust(inicio) + novo
    return saida


def transpor(cifra, semitons):
    if semitons % 12 == 0:
        return cifra
    return "\n".join(
        transpor_linha(linha, semitons) if tipo_linha(linha) == "acorde" else linha
        for linha in cifra.splitlines()
    )


def tom_da_cifra(cifra):
    """
    Tom estimado pelo primeiro acorde da cifra: (índice da nota, é menor?).
    Devolve None se não houver acordes.
    """
    for linha in cifra.splitlines():
        if tipo_linha(linha) != "acorde":
            continue
        for token in linha.split():
            partes = PARTES_ACORDE.match(token)
            if ACORDE.match(token) and partes:
                resto = partes.group(3)
                menor = resto.startswith("m") and not resto.startswith("maj")
                return indice_nota(partes.group(2)), menor
    return None
