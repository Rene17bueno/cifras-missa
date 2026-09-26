/*
 * Troca o tom da cifra: sobe/desce os acordes em semitons sem desalinhar da letra.
 * Tradução de scripts/transpor.py. Os nomes saem com sustenido (C, C#, D, ... B).
 */
(function () {
  "use strict";

  const NOTAS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const LETRAS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const BEMOL = { "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb" };

  // (abre parêntese) raiz (resto) /baixo (fecha parêntese/pontuação)
  const PARTES_ACORDE = /^(\(?)([A-G][#b]?)(.*?)(?:\/([A-G][#b]?)([0-9]*))?(\)?[,.]?)$/;

  const mod12 = (n) => ((n % 12) + 12) % 12;

  /** 'C' -> 0, 'C#' -> 1, 'Db' -> 1, ..., 'B' -> 11 */
  function indiceNota(nota) {
    const ajuste = { "#": 1, b: -1 }[nota.slice(1, 2)] || 0;
    return mod12(LETRAS[nota[0]] + ajuste);
  }

  const nomeTom = (indice, menor) => NOTAS[mod12(indice)] + (menor ? "m" : "");

  /** 'D#' vira 'D# (Eb)' para facilitar a leitura */
  function rotuloTom(indice, menor) {
    const nome = NOTAS[mod12(indice)];
    const extra = BEMOL[nome] ? ` (${BEMOL[nome]}${menor ? "m" : ""})` : "";
    return nome + (menor ? "m" : "") + extra;
  }

  function transporAcorde(acorde, semitons) {
    const partes = PARTES_ACORDE.exec(acorde);
    if (!partes) return acorde;
    const [, abre, raiz, resto, baixo, numero, fecha] = partes;
    let novo = abre + nomeTom(indiceNota(raiz) + semitons) + resto;
    if (baixo) novo += "/" + nomeTom(indiceNota(baixo) + semitons) + (numero || "");
    return novo + fecha;
  }

  /** Cada acorde fica na coluna original; se o anterior cresceu, empurra só o necessário */
  function transporLinha(linha, semitons) {
    let saida = "";
    for (const token of linha.matchAll(/\S+/g)) {
      const texto = token[0];
      const novo = Layout.ACORDE.test(texto) ? transporAcorde(texto, semitons) : texto;
      const inicio = saida.trim() ? Math.max(token.index, saida.length + 1) : token.index;
      saida = saida.padEnd(inicio) + novo;
    }
    return saida;
  }

  function transpor(cifra, semitons) {
    if (mod12(semitons) === 0) return cifra;
    return cifra
      .split(/\r?\n/)
      .map((linha) => (Layout.tipoLinha(linha) === "acorde" ? transporLinha(linha, semitons) : linha))
      .join("\n");
  }

  /** Tom estimado pelo primeiro acorde da cifra: {indice, menor} ou null */
  function tomDaCifra(cifra) {
    for (const linha of cifra.split(/\r?\n/)) {
      if (Layout.tipoLinha(linha) !== "acorde") continue;
      for (const token of linha.trim().split(/\s+/)) {
        const partes = PARTES_ACORDE.exec(token);
        if (Layout.ACORDE.test(token) && partes) {
          const resto = partes[3];
          return { indice: indiceNota(partes[2]), menor: resto.startsWith("m") && !resto.startsWith("maj") };
        }
      }
    }
    return null;
  }

  window.Transpor = { NOTAS, mod12, nomeTom, rotuloTom, transpor, transporAcorde, tomDaCifra };
})();
