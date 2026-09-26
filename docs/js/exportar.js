/*
 * Exporta as cifras para PDF, Word, TXT e Excel, e desenha a prévia das páginas.
 * Mesmas medidas de scripts/exportar.py.
 * Cada música é um objeto {Posição, Música, Artista, Cifra, URL, Status, Erro, Tom, Colunas}.
 */
(function () {
  "use strict";

  const PAGINA_L = 210, PAGINA_A = 297;           // A4 (mm)
  const MARGEM_LADO = 15, MARGEM_TOPO = 12;
  const ESPACO_COLUNAS = 8;
  const CABECALHO = 20;                            // altura do título da música
  const COR_ACORDE = [150, 30, 30];
  const LARGURA_TXT = 48;                          // caracteres por coluna no .txt com 2 colunas

  function nome(item) {
    if (item.Status !== "OK") return "(cifra não extraída)";
    const base = item.Artista ? `${item.Música} (${item.Artista})` : item.Música;
    return item.Tom ? `${base}  -  Tom: ${item.Tom}` : base;
  }

  const cifraDe = (item) =>
    item.Status === "OK" ? item.Cifra : `Não foi possível extrair: ${item.Erro}\n${item.URL}`;

  const colunasDe = (item, padrao) => item.Colunas || padrao;

  /** Largura de cada coluna e altura disponível para a cifra (mm) */
  function areaColunas(colunas, folga = 0) {
    return {
      largura: (PAGINA_L - 2 * MARGEM_LADO - ESPACO_COLUNAS * (colunas - 1)) / colunas,
      altura: PAGINA_A - 2 * MARGEM_TOPO - CABECALHO - folga,
    };
  }

  /** Páginas de uma música no PDF/prévia: {tamanho, paginas, nColunas, largura} */
  function montarMusica(item, colunas, tamanho, folga = 0) {
    const nColunas = colunasDe(item, colunas);
    const { largura, altura } = areaColunas(nColunas, folga);
    const r = Layout.montar(cifraDe(item), nColunas, largura, altura, tamanho);
    return { ...r, nColunas, largura };
  }

  function baixar(blob, nomeArquivo) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
  }

  // ------------------------------------------------------------------- TXT
  function exportarTxt(dados, colunas = 1) {
    const blocos = ["CIFRAS DA MISSA", ""];
    for (const item of dados) {
      blocos.push("=".repeat(60), item.Posição.toUpperCase(), nome(item), "=".repeat(60), "");
      if (colunasDe(item, colunas) === 1) {
        blocos.push(cifraDe(item));
      } else {
        const { unidades } = Layout.preparar(cifraDe(item), LARGURA_TXT);
        const [esquerda = [], direita = []] = Layout.paginar(unidades, 1e6, 2)[0];
        for (let i = 0; i < Math.max(esquerda.length, direita.length); i++) {
          const a = (esquerda[i] || ["vazia", ""])[1];
          const b = (direita[i] || ["vazia", ""])[1];
          blocos.push(`${a.padEnd(LARGURA_TXT)}  |  ${b}`.trimEnd());
        }
      }
      blocos.push("", "");
    }
    // BOM para o Bloco de Notas reconhecer os acentos
    return new Blob(["﻿" + blocos.join("\n")], { type: "text/plain;charset=utf-8" });
  }

  // ------------------------------------------------------------------- PDF
  /** As fontes padrão do PDF só aceitam latin-1 (que cobre os acentos do português) */
  function latin1(texto) {
    const trocas = { "—": "-", "–": "-", "“": '"', "”": '"', "‘": "'", "’": "'", "…": "..." };
    return texto.replace(/[—–“”‘’…]/g, (c) => trocas[c]).replace(/[^\x00-\xff]/g, "?");
  }

  function exportarPdf(dados, colunas = 1, tamanho = null) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const topo = MARGEM_TOPO + CABECALHO;
    let primeira = true;

    for (const item of dados) {
      const { tamanho: t, paginas, largura } = montarMusica(item, colunas, tamanho);
      const alturaLinha = t * Layout.ENTRELINHA * Layout.PT_MM;

      paginas.forEach((pagina, n) => {
        if (!primeira) pdf.addPage();
        primeira = false;
        // Cabeçalho
        pdf.setTextColor(0, 0, 0);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(16);
        const continuacao = n ? `  (continuação ${n + 1}/${paginas.length})` : "";
        pdf.text(latin1(item.Posição + continuacao), MARGEM_LADO, MARGEM_TOPO + 6);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(12);
        pdf.text(latin1(nome(item)), MARGEM_LADO, MARGEM_TOPO + 13);
        pdf.setDrawColor(180, 180, 180);
        pdf.line(MARGEM_LADO, topo - 3, PAGINA_L - MARGEM_LADO, topo - 3);

        // Colunas
        pagina.forEach((coluna, c) => {
          const x = MARGEM_LADO + c * (largura + ESPACO_COLUNAS);
          if (c) {
            const divisa = x - ESPACO_COLUNAS / 2;
            pdf.line(divisa, topo, divisa, topo + coluna.length * alturaLinha);
          }
          coluna.forEach(([tipo, texto], k) => {
            if (tipo === "vazia") return;
            pdf.setFont("courier", tipo === "acorde" || tipo === "marcador" ? "bold" : "normal");
            pdf.setFontSize(t);
            pdf.setTextColor(...(tipo === "acorde" ? COR_ACORDE : [0, 0, 0]));
            pdf.text(latin1(texto), x, topo + (k + 0.8) * alturaLinha);
          });
        });
      });
    }
    return pdf.output("blob");
  }

  /** Prévia: as mesmas páginas do PDF desenhadas em SVG (coordenadas em mm) */
  function previaSvg(dados, colunas = 1, tamanho = null) {
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const topo = MARGEM_TOPO + CABECALHO;
    const svgs = [];
    for (const item of dados) {
      const { tamanho: t, paginas, largura } = montarMusica(item, colunas, tamanho);
      const alturaLinha = t * Layout.ENTRELINHA * Layout.PT_MM;
      const fonte = t * Layout.PT_MM;
      paginas.forEach((pagina, n) => {
        const partes = [];
        const continuacao = n ? `  (continuação ${n + 1}/${paginas.length})` : "";
        partes.push(`<text x="${MARGEM_LADO}" y="${MARGEM_TOPO + 6}" class="p-titulo">${esc(item.Posição + continuacao)}</text>`);
        partes.push(`<text x="${MARGEM_LADO}" y="${MARGEM_TOPO + 13}" class="p-nome">${esc(nome(item))}</text>`);
        partes.push(`<line x1="${MARGEM_LADO}" y1="${topo - 3}" x2="${PAGINA_L - MARGEM_LADO}" y2="${topo - 3}" class="p-linha"/>`);
        pagina.forEach((coluna, c) => {
          const x = MARGEM_LADO + c * (largura + ESPACO_COLUNAS);
          if (c) {
            const d = x - ESPACO_COLUNAS / 2;
            partes.push(`<line x1="${d}" y1="${topo}" x2="${d}" y2="${topo + coluna.length * alturaLinha}" class="p-linha"/>`);
          }
          coluna.forEach(([tipo, texto], k) => {
            if (tipo === "vazia") return;
            const classe = tipo === "acorde" ? "p-acorde" : tipo === "marcador" ? "p-marcador" : "p-letra";
            partes.push(`<text x="${x}" y="${(topo + (k + 0.8) * alturaLinha).toFixed(2)}" font-size="${fonte.toFixed(3)}" class="${classe}">${esc(texto)}</text>`);
          });
        });
        svgs.push(`<svg viewBox="0 0 ${PAGINA_L} ${PAGINA_A}" xmlns="http://www.w3.org/2000/svg" class="pagina">${partes.join("")}</svg>`);
      });
    }
    return svgs;
  }

  // ------------------------------------------------------------------- Word
  async function exportarDocx(dados, colunas = 1, tamanho = null) {
    const D = window.docx;
    const twip = (mm) => Math.round(mm * 56.7);
    const pagina = {
      size: { width: twip(PAGINA_L), height: twip(PAGINA_A) },
      margin: { top: twip(MARGEM_TOPO), bottom: twip(MARGEM_TOPO), left: twip(MARGEM_LADO), right: twip(MARGEM_LADO) },
    };
    const paragrafo = (texto, t, { negrito = false, cor = null, fonte = "Courier New", depois = 0, quebra = null } = {}) => {
      const filhos = [new D.TextRun({ text: texto, font: fonte, size: Math.round(t * 2), bold: negrito, color: cor || undefined })];
      if (quebra) filhos.push(quebra);
      return new D.Paragraph({
        spacing: { before: 0, after: depois, line: Math.round(t * Layout.ENTRELINHA * 20), lineRule: D.LineRuleType.EXACT },
        children: filhos,
      });
    };
    const corAcorde = COR_ACORDE.map((c) => c.toString(16).padStart(2, "0")).join("");

    const secoes = [];
    dados.forEach((item, i) => {
      // Folga de 10 mm: o Word calcula alturas um pouco diferente do PDF
      const { tamanho: t, paginas, nColunas } = montarMusica(item, colunas, tamanho, 10);
      secoes.push({
        properties: { type: i ? D.SectionType.NEXT_PAGE : undefined, page: pagina, column: { count: 1 } },
        children: [
          paragrafo(item.Posição, 16, { negrito: true, fonte: "Arial", depois: 40 }),
          paragrafo(nome(item), 12, { fonte: "Arial", depois: 200 }),
        ],
      });
      // Conteúdo numa seção contínua com as colunas; quebras de coluna calculadas pelo layout
      const todas = paginas.flat();
      const filhos = [];
      todas.forEach((coluna, n) => {
        const ultimaColuna = n === todas.length - 1;
        const linhas = coluna.length ? coluna : [["vazia", ""]];
        linhas.forEach(([tipo, texto], k) => {
          const quebra = !ultimaColuna && k === linhas.length - 1
            ? (nColunas > 1 ? new D.ColumnBreak() : new D.PageBreak())
            : null;
          filhos.push(paragrafo(texto, t, {
            negrito: tipo === "acorde" || tipo === "marcador",
            cor: tipo === "acorde" ? corAcorde : null,
            quebra,
          }));
        });
      });
      secoes.push({
        properties: {
          type: D.SectionType.CONTINUOUS,
          page: pagina,
          column: { count: nColunas, space: twip(ESPACO_COLUNAS), separate: nColunas > 1 },
        },
        children: filhos,
      });
    });

    const documento = new D.Document({ sections: secoes });
    return D.Packer.toBlob(documento);
  }

  // ------------------------------------------------------------------- Excel
  async function exportarXlsx(dados) {
    const livro = new ExcelJS.Workbook();
    const folha = livro.addWorksheet("Cifras", { views: [{ state: "frozen", ySplit: 1 }] });
    folha.columns = [
      { header: "Posição", width: 20 },
      { header: "Música", width: 30 },
      { header: "Artista", width: 25 },
      { header: "Cifra", width: 80 },
      { header: "URL", width: 40 },
    ];
    const borda = { style: "thin" };
    const bordas = { top: borda, left: borda, bottom: borda, right: borda };
    for (const item of dados) folha.addRow([item.Posição, item.Música, item.Artista, cifraDe(item), item.URL]);

    folha.getRow(1).eachCell((cel) => {
      cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF366092" } };
      cel.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
      cel.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cel.border = bordas;
    });
    folha.eachRow((linha, n) => {
      if (n === 1) return;
      linha.eachCell({ includeEmpty: true }, (cel) => {
        cel.border = bordas;
        cel.alignment = { horizontal: "left", vertical: "top", wrapText: true };
      });
      linha.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      linha.getCell(4).font = { name: "Courier New", size: 10 };
      // Excel não ajusta a altura sozinho; 13 pontos por linha da cifra (máx. 409)
      linha.height = Math.min(409, 13 * (String(linha.getCell(4).value).split("\n").length));
    });
    const buffer = await livro.xlsx.writeBuffer();
    return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  window.Exportar = { exportarTxt, exportarPdf, exportarDocx, exportarXlsx, previaSvg, baixar };
})();
