/*
 * Organiza a cifra em colunas e páginas sem separar o acorde da letra.
 * Tradução de scripts/layout.py (mesmas regras e mesmos resultados).
 *
 * Conceitos:
 * - linha:   [tipo, texto], tipo = "acorde", "letra", "marcador" ([Refrão]) ou "vazia"
 * - unidade: linhas que nunca são separadas (linha de acordes + a letra logo abaixo)
 * - estrofe: unidades entre linhas em branco; só é dividida entre colunas se não couber inteira
 */
(function () {
  "use strict";

  const PT_MM = 0.3528;       // 1 ponto tipográfico em milímetros
  const LARGURA_CHAR = 0.6;   // largura de um caractere de fonte monoespaçada (em "em")
  const ENTRELINHA = 1.2;     // altura da linha em relação ao tamanho da fonte
  const TAMANHOS_AUTO = [11, 10.5, 10, 9.5, 9, 8.5, 8];
  const RECUO_CONTINUACAO = "  ";

  const ACORDE = /^\(?[A-G][#b]?(?:maj|min|dim|aug|sus|add|[mM°º+\-#b0-9()/])*(?:\/[A-G][#b]?[0-9]*)?\)?[,.]?$/;
  const EXTRA = /^(\[[^\]]*\]|\|+|:?\|\|?:?|[xX]\d+|\d+[xX]|%|-+|~|\.\.\.|[A-Za-zÀ-ú]+:)$/;
  const MARCADOR = /^\[[^\]]*\]$/;

  const palavras = (texto) => texto.trim().split(/\s+/).filter(Boolean);

  function tipoLinha(linha) {
    const texto = linha.trim();
    if (!texto) return "vazia";
    if (MARCADOR.test(texto)) return "marcador";
    const tokens = palavras(texto);
    if (tokens.some((t) => ACORDE.test(t)) && tokens.every((t) => ACORDE.test(t) || EXTRA.test(t))) {
      return "acorde";
    }
    return "letra";
  }

  /** Divide a cifra em estrofes; cada estrofe é uma lista de unidades */
  function estrofesDe(cifra) {
    const linhas = cifra.split(/\r?\n/).map((l) => l.replace(/\t/g, "    ").trimEnd());
    const estrofes = [];
    let atual = [];
    let i = 0;
    while (i < linhas.length) {
      const tipo = tipoLinha(linhas[i]);
      if (tipo === "vazia") {
        if (atual.length) { estrofes.push(atual); atual = []; }
        i += 1;
      } else if (tipo === "acorde" && i + 1 < linhas.length && tipoLinha(linhas[i + 1]) === "letra") {
        atual.push([["acorde", linhas[i]], ["letra", linhas[i + 1]]]);
        i += 2;
      } else {
        atual.push([[tipo, linhas[i]]]);
        i += 1;
      }
    }
    if (atual.length) estrofes.push(atual);

    // Estrofe só com marcadores ("[Refrão]") vai junto com a estrofe seguinte
    const juntas = [];
    let pendente = [];
    for (const estrofe of estrofes) {
      if (estrofe.every((unidade) => unidade[0][0] === "marcador")) {
        pendente = pendente.concat(estrofe);
      } else {
        juntas.push(pendente.concat(estrofe));
        pendente = [];
      }
    }
    if (pendente.length) juntas.push(pendente);
    return juntas;
  }

  const livre = (texto, p) => p >= texto.length || texto[p] === " ";

  /** Posição onde acorde e letra podem ser cortados juntos (espaço nos dois) */
  function pontoDeCorte(acorde, letra, largura) {
    for (let p = largura; p > RECUO_CONTINUACAO.length; p--) {
      if (livre(letra, p) && livre(acorde, p)) return p;
    }
    // Sem espaço comum (palavra enorme): corta num espaço da letra e recua até não partir um acorde
    let p = letra.lastIndexOf(" ", largura);
    if (p <= 0) p = largura;
    while (p > 0 && !livre(acorde, p) && acorde[p - 1] !== " ") p -= 1;
    return p > RECUO_CONTINUACAO.length ? p : largura;
  }

  const recuoDe = (s) => s.length - s.trimStart().length;

  /** Quebra um par acorde+letra longo em pedaços que cabem na largura, mantendo o alinhamento */
  function quebrarPar(acorde, letra, largura) {
    const pedacos = [];
    while (Math.max(acorde.length, letra.length) > largura) {
      const corte = pontoDeCorte(acorde, letra, largura);
      pedacos.push([acorde.slice(0, corte).trimEnd(), letra.slice(0, corte).trimEnd()]);
      acorde = acorde.slice(corte);
      letra = letra.slice(corte);
      // Remove o recuo comum aos dois e marca a continuação com um recuo fixo
      const recuos = [acorde, letra].filter((s) => s.trim()).map(recuoDe);
      const recuo = recuos.length ? Math.min(...recuos) : Math.max(acorde.length, letra.length);
      acorde = acorde.trim() ? RECUO_CONTINUACAO + acorde.slice(recuo) : "";
      letra = letra.trim() ? RECUO_CONTINUACAO + letra.slice(recuo) : "";
    }
    pedacos.push([acorde, letra]);
    return pedacos;
  }

  /**
   * Analisa a cifra e quebra as linhas maiores que 'largura' caracteres.
   * Devolve {unidades, quebras}: unidades = [[idEstrofe, linhas]], quebras = linhas quebradas.
   */
  function preparar(cifra, largura) {
    const unidades = [];
    let quebras = 0;
    estrofesDe(cifra).forEach((estrofe, idEstrofe) => {
      for (const unidade of estrofe) {
        if (unidade.every(([, texto]) => texto.length <= largura)) {
          unidades.push([idEstrofe, unidade]);
          continue;
        }
        quebras += 1;
        if (unidade.length === 2) { // acorde + letra
          for (const [acorde, letra] of quebrarPar(unidade[0][1], unidade[1][1], largura)) {
            const par = [];
            if (acorde) par.push(["acorde", acorde]);
            if (letra) par.push(["letra", letra]);
            unidades.push([idEstrofe, par]);
          }
        } else {
          const [tipo, texto] = unidade[0];
          for (const [, pedaco] of quebrarPar("", texto, largura)) {
            unidades.push([idEstrofe, [[tipo, pedaco]]]);
          }
        }
      }
    });
    return { unidades, quebras };
  }

  /** Linhas ocupadas, contando a linha em branco entre estrofes */
  function altura(unidades, indices) {
    let total = 0;
    indices.forEach((k, n) => {
      total += unidades[k][1].length;
      if (n && unidades[indices[n - 1]][0] !== unidades[k][0]) total += 1;
    });
    return total;
  }

  /** Preenche colunas de 'capacidade' linhas; devolve colunas como listas de índices de unidades */
  function distribuir(unidades, capacidade) {
    const colunas = [];
    let atual = [];
    let usado = 0;
    let i = 0;
    while (i < unidades.length) {
      const estrofe = unidades[i][0];
      let j = i;
      while (j < unidades.length && unidades[j][0] === estrofe) j += 1;
      const bloco = [];
      for (let k = i; k < j; k++) bloco.push(k);
      const alt = altura(unidades, bloco);
      const separador = atual.length ? 1 : 0;

      if (usado + separador + alt <= capacidade) {        // cabe inteira aqui
        atual = atual.concat(bloco);
        usado += separador + alt;
      } else if (alt <= capacidade) {                     // cabe inteira na próxima coluna
        colunas.push(atual);
        atual = bloco;
        usado = alt;
      } else {                                            // maior que uma coluna: divide entre unidades
        for (const k of bloco) {
          const h = unidades[k][1].length;
          let sep = atual.length && unidades[atual[atual.length - 1]][0] !== estrofe ? 1 : 0;
          if (atual.length && usado + sep + h > capacidade) {
            colunas.push(atual);
            atual = [];
            usado = 0;
            sep = 0;
          }
          atual.push(k);
          usado += sep + h;
        }
      }
      i = j;
    }
    if (atual.length) colunas.push(atual);
    return colunas;
  }

  function linhasDaColuna(unidades, indices) {
    const linhas = [];
    indices.forEach((k, n) => {
      if (n && unidades[indices[n - 1]][0] !== unidades[k][0]) linhas.push(["vazia", ""]);
      linhas.push(...unidades[k][1]);
    });
    return linhas;
  }

  /** Distribui em páginas de nColunas; a última página tem as colunas equilibradas */
  function paginar(unidades, capacidade, nColunas) {
    let colunas = distribuir(unidades, capacidade);
    if (nColunas > 1 && colunas.length) {
      const inicio = Math.floor((colunas.length - 1) / nColunas) * nColunas;
      const primeira = colunas[inicio][0];
      const resto = unidades.slice(primeira);
      const total = altura(resto, resto.map((_, k) => k));
      // Menor capacidade que ainda cabe nas colunas da última página
      for (let cap = Math.ceil(total / nColunas); cap <= capacidade; cap++) {
        const tentativa = distribuir(resto, cap);
        if (tentativa.length <= nColunas) {
          colunas = colunas.slice(0, inicio).concat(tentativa.map((c) => c.map((k) => primeira + k)));
          break;
        }
      }
    }
    const linhas = colunas.map((c) => linhasDaColuna(unidades, c));
    const paginas = [];
    for (let i = 0; i < linhas.length; i += nColunas) paginas.push(linhas.slice(i, i + nColunas));
    return paginas.length ? paginas : [[[]]];
  }

  const caracteresPorLinha = (larguraMm, tamanho) => Math.floor(larguraMm / (LARGURA_CHAR * tamanho * PT_MM));
  const linhasPorColuna = (alturaMm, tamanho) => Math.floor(alturaMm / (tamanho * ENTRELINHA * PT_MM));

  /**
   * Escolhe o tamanho da fonte (se não informado) e organiza a cifra.
   * Prioridade: menos páginas; depois fonte maior com poucas linhas quebradas.
   * Devolve {tamanho, paginas}, paginas = [[coluna, ...], ...], coluna = [[tipo, texto], ...]
   */
  function montar(cifra, nColunas, larguraMm, alturaMm, tamanho) {
    let melhor = null;
    for (const t of tamanho ? [tamanho] : TAMANHOS_AUTO) {
      const { unidades, quebras } = preparar(cifra, caracteresPorLinha(larguraMm, t));
      const paginas = paginar(unidades, linhasPorColuna(alturaMm, t), nColunas);
      // meio ponto a menos na fonte "vale" 3 linhas quebradas
      const nota = [paginas.length, quebras + (TAMANHOS_AUTO[0] - t) * 6];
      if (!melhor || nota[0] < melhor.nota[0] || (nota[0] === melhor.nota[0] && nota[1] < melhor.nota[1])) {
        melhor = { nota, tamanho: t, paginas };
      }
    }
    return { tamanho: melhor.tamanho, paginas: melhor.paginas };
  }

  /** Remove linhas vazias do começo/fim sem mexer no alinhamento dos acordes */
  function limparCifra(texto) {
    const linhas = texto.split(/\r?\n/).map((l) => l.trimEnd());
    while (linhas.length && !linhas[0].trim()) linhas.shift();
    while (linhas.length && !linhas[linhas.length - 1].trim()) linhas.pop();
    return linhas.join("\n");
  }

  window.Layout = {
    PT_MM, ENTRELINHA, ACORDE, tipoLinha, preparar, paginar, montar, limparCifra,
    caracteresPorLinha, linhasPorColuna, quebrarPar,
  };
})();
