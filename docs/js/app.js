/*
 * Cifras da Missa - versão página HTML (sem servidor).
 * Mesmas funções do app Streamlit; os repertórios ficam salvos no navegador (localStorage)
 * e as cifras chegam dos sites pelo favorito "Enviar cifra".
 * O formato do repertório (.json) é o mesmo do app do computador.
 */
(function () {
  "use strict";

  const PARTES_PADRAO = [
    "Entrada", "Ato penitencial", "Glória", "Salmo", "Aclamação", "Ofertório",
    "Santo", "Cordeiro", "Comunhão", "Comunhão crianças", "Ação de graças", "Final",
  ];
  const EXEMPLO = [
    ["Entrada", "https://www.cifraclub.com.br/ministerio-amor-e-adoracao/vamos-celebrar/"],
    ["Ato penitencial", "https://www.cifraclub.com.br/capella/kyrie/"],
    ["Glória", "https://www.cifraclub.com.br/banda-capella/gloria/"],
    ["Aclamação", "https://musicasparamissa.com.br/musica/aclamacao-4o-domingo-da-pascoa/"],
    ["Cordeiro", "https://musicasparamissa.com.br/musica/cordeiro-com-shalom/"],
    ["Comunhão", "https://www.cifraclub.com.br/catolicas/vejam-eu-andei-pelas-vilas/"],
    ["Comunhão crianças", "https://www.cifraclub.com.br/padre-zezinho/amar-como-jesus-amou/#key=5"],
  ];
  const NOMES_SITE = { cifraclub: "CifraClub", musicasparamissa: "Músicas para Missa", outro: "Outro site" };
  const NOVA_PARTE = "__nova__";
  const CHAVE = {
    partes: "cifras.partes",
    atual: "cifras.atual",
    opcoes: "cifras.opcoes",
    prefixo: "cifras.rep.",
  };

  const $ = (seletor) => document.querySelector(seletor);
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // ---------------------------------------------------------------- Armazenamento no navegador
  function ler(chave, padrao) {
    try {
      const valor = localStorage.getItem(chave);
      return valor ? JSON.parse(valor) : padrao;
    } catch { return padrao; }
  }
  function gravar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); return true; } catch { return false; }
  }
  function apagar(chave) { try { localStorage.removeItem(chave); } catch { /* sem armazenamento */ } }

  function nomesRepertorios() {
    const nomes = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const chave = localStorage.key(i);
        if (chave.startsWith(CHAVE.prefixo)) nomes.push(chave.slice(CHAVE.prefixo.length));
      }
    } catch { /* sem armazenamento */ }
    return nomes.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  // ---------------------------------------------------------------- Estado
  let partes = ler(CHAVE.partes, PARTES_PADRAO.slice());
  let opcoes = ler(CHAVE.opcoes, { colunas: 2, fonte: "" });
  let rep = null;                 // {nome, musicas: [{id, posicao, url, resultado, colunas, transpor}]}
  let rascunhos = {};             // textos do editor ainda não salvos, por música
  const abertos = new Set();      // editores abertos
  const previas = new Set();      // prévias ligadas nos editores

  const novoId = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
  const novaMusica = (posicao, url) => ({ id: novoId(), posicao, url: (url || "").trim(), resultado: null });

  function hoje() {
    const d = new Date();
    return [d.getDate(), d.getMonth() + 1].map((n) => String(n).padStart(2, "0")).join("-") + "-" + d.getFullYear();
  }

  function nomeLivre(base) {
    const existentes = new Set(nomesRepertorios());
    let nome = base, n = 1;
    while (existentes.has(nome)) nome = `${base} (${++n})`;
    return nome;
  }

  function salvar() {
    rep.atualizado = Date.now();
    const ok = gravar(CHAVE.prefixo + rep.nome, rep) && gravar(CHAVE.atual, rep.nome);
    const hora = new Date().toLocaleTimeString("pt-BR");
    $("#status-salvo").textContent = ok
      ? `✅ Salvo às ${hora} neste navegador`
      : "⚠️ Este navegador não deixou salvar (modo anônimo?). Use Salvar cópia (.json).";
  }

  function carregarRepertorio(nome) {
    const dados = ler(CHAVE.prefixo + nome, null);
    if (!dados) return false;
    rep = dados;
    rep.nome = nome;
    rascunhos = {};
    gravar(CHAVE.atual, nome);
    return true;
  }

  function novoRepertorio(exemplo) {
    rep = {
      nome: nomeLivre(`Missa ${hoje()}`),
      musicas: exemplo ? EXEMPLO.map(([p, u]) => novaMusica(p, u)) : [],
    };
    rascunhos = {};
    salvar();
  }

  // ---------------------------------------------------------------- Partes da missa
  const comparavel = (texto) =>
    texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/\s+/).filter(Boolean).join(" ");

  /** Nome como está na lista (ignorando acentos/maiúsculas); se não existe, cria depois de 'depoisDe' ou no fim */
  function parteDaLista(nome, depoisDe) {
    nome = nome.trim().split(/\s+/).join(" ");
    const existente = partes.find((p) => comparavel(p) === comparavel(nome));
    if (existente) return existente;
    const posicao = partes.includes(depoisDe) ? partes.indexOf(depoisDe) + 1 : partes.length;
    partes.splice(posicao, 0, nome);
    gravar(CHAVE.partes, partes);
    return nome;
  }

  function ordenarPorMissa(musicas) {
    const chave = (m) => (partes.includes(m.posicao) ? partes.indexOf(m.posicao) : partes.length);
    return musicas.slice().sort((a, b) => chave(a) - chave(b));
  }

  /** Opções de um <select> de partes; a parte atual aparece mesmo se não estiver na lista */
  function opcoesPartes(atual) {
    const lista = partes.includes(atual) || !atual ? partes : partes.concat([atual]);
    return lista.map((p) => `<option ${p === atual ? "selected" : ""}>${esc(p)}</option>`).join("")
      + `<option value="${NOVA_PARTE}">➕ Nova parte…</option>`;
  }

  /** Trata a escolha "➕ Nova parte…": pergunta o nome e devolve a parte (ou null se cancelou) */
  function escolherParte(select, anterior) {
    if (select.value !== NOVA_PARTE) return select.value;
    const nome = window.prompt("Nome da nova parte da missa:");
    if (!nome || !nome.trim()) { select.value = anterior; return null; }
    return parteDaLista(nome);
  }

  // ---------------------------------------------------------------- Músicas
  function detectarSite(url) {
    let host = "";
    try { host = new URL(url).hostname.toLowerCase(); } catch { /* link inválido */ }
    if (host.includes("cifraclub")) return "cifraclub";
    if (host.includes("musicasparamissa")) return "musicasparamissa";
    return "outro";
  }

  function normalizarUrl(url) {
    try {
      const u = new URL(url);
      return (u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/+$/, "")).toLowerCase();
    } catch { return (url || "").trim().toLowerCase(); }
  }

  const linkValido = (url) => /^https?:\/\//i.test(url.trim());
  const comCifra = (m) => m.resultado && m.resultado.Status === "OK";
  const icone = (m) => (!m.resultado ? "⚪" : comCifra(m) ? "🟢" : "🔴");

  function nomeMusica(resultado) {
    if (!resultado || resultado.Status !== "OK") return "";
    return resultado.Artista ? `${resultado.Música} (${resultado.Artista})` : resultado.Música;
  }

  function aplicarTom(item, semitons) {
    const tom = Transpor.tomDaCifra(item.Cifra);
    return {
      ...item,
      Cifra: Transpor.transpor(item.Cifra, semitons),
      Tom: tom ? Transpor.nomeTom(tom.indice + semitons, tom.menor) : "",
    };
  }

  function descricaoTom(m) {
    const tom = comCifra(m) ? Transpor.tomDaCifra(m.resultado.Cifra) : null;
    if (!tom) return "";
    const s = m.transpor || 0;
    const atual = Transpor.rotuloTom(tom.indice + s, tom.menor);
    return `Tom: ${atual}` + (s ? ` (original ${Transpor.rotuloTom(tom.indice, tom.menor)})` : "");
  }

  /** Músicas prontas para baixar: ordem da lista, parte atual, tom e colunas escolhidos */
  function prontas() {
    return rep.musicas.filter(comCifra).map((m) =>
      aplicarTom({ ...m.resultado, Posição: m.posicao, Colunas: m.colunas || null }, m.transpor || 0));
  }

  const colunasPadrao = () => Number(opcoes.colunas) || 2;
  const tamanhoFonte = () => (opcoes.fonte ? Number(opcoes.fonte) : null);

  // ---------------------------------------------------------------- Avisos
  let temporizadorAviso = null;
  function aviso(texto) {
    const el = $("#aviso-flutuante");
    el.textContent = texto;
    el.hidden = false;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => { el.hidden = true; }, 3500);
  }

  // ---------------------------------------------------------------- Desenho da página
  function render() {
    renderRepertorio();
    renderPartes();
    renderLista();
    renderResumo();
    renderBusca();
    renderEditores();
    renderBaixar();
  }

  function renderRepertorio() {
    $("#nome-repertorio").value = rep.nome;
    const nomes = nomesRepertorios();
    $("#lista-repertorios").innerHTML = nomes
      .map((n) => `<option ${n === rep.nome ? "selected" : ""}>${esc(n)}</option>`).join("");
  }

  function renderPartes() {
    for (const id of ["#um-parte", "#colar-parte"]) {
      const sel = $(id);
      const atual = sel.value && sel.value !== NOVA_PARTE ? sel.value : partes[0];
      sel.innerHTML = opcoesPartes(atual);
      sel.dataset.anterior = sel.value;
    }
    $("#ordem-partes").textContent = partes.join(" → ");
    $("#nova-parte-depois").innerHTML = ['<option value="">(no início)</option>']
      .concat(partes.map((p, i) => `<option ${i === partes.length - 1 ? "selected" : ""}>${esc(p)}</option>`)).join("");
    $("#remover-parte").innerHTML = partes.map((p) => `<option>${esc(p)}</option>`).join("");
  }

  function renderLista() {
    const musicas = rep.musicas;
    $("#qtd-musicas").textContent = musicas.length;
    $("#btn-organizar").disabled = $("#btn-limpar").disabled = !musicas.length;
    if (!musicas.length) {
      $("#lista-musicas").innerHTML = '<p class="aviso">A lista está vazia. Adicione músicas acima.</p>';
      return;
    }
    $("#lista-musicas").innerHTML = musicas.map((m, i) => {
      const origem = m.url ? NOMES_SITE[detectarSite(m.url)] : "Digitada à mão";
      const tom = descricaoTom(m);
      return `<div class="musica" data-id="${m.id}">
        <div class="status">${icone(m)}</div>
        <select class="sel-parte-musica" data-anterior="${esc(m.posicao)}" aria-label="Parte da missa">${opcoesPartes(m.posicao)}</select>
        <div class="info"><b>${esc(nomeMusica(m.resultado) || "Ainda sem cifra")}</b> · ${esc(origem)}${m.resultado && m.resultado.Fonte ? " · ⚠️ cifra do Músicas para Missa" : ""}${tom ? ` · 🎼 ${esc(tom)}` : ""}
          ${m.url ? `<br><small>${esc(m.url)}</small>` : ""}</div>
        <div class="acoes">
          ${m.url ? `<a class="botao" href="${esc(m.url)}" target="_blank" rel="opener" title="Abrir a cifra no site">Abrir ↗</a>` : ""}
          <button class="icone" data-acao="subir" title="Subir" ${i === 0 ? "disabled" : ""}>⬆️</button>
          <button class="icone" data-acao="descer" title="Descer" ${i === musicas.length - 1 ? "disabled" : ""}>⬇️</button>
          <button class="icone" data-acao="remover" title="Remover">❌</button>
        </div>
      </div>`;
    }).join("");
  }

  function renderResumo() {
    const total = rep.musicas.length;
    const ok = rep.musicas.filter(comCifra).length;
    $("#resumo-cifras").textContent = total ? `${ok} de ${total} músicas com cifra.` : "";
  }

  function textosEditor(m) {
    const r = m.resultado || {};
    return rascunhos[m.id] || { titulo: r.Música || "", artista: r.Artista || "", cifra: r.Cifra || "" };
  }

  function mudouEditor(m) {
    const r = m.resultado || {};
    const t = textosEditor(m);
    return t.titulo !== (r.Música || "") || t.artista !== (r.Artista || "") || t.cifra !== (r.Cifra || "");
  }

  function renderEditores() {
    const container = $("#editores");
    if (!rep.musicas.length) { container.innerHTML = ""; return; }
    container.innerHTML = rep.musicas.map(htmlEditor).join("");
    for (const m of rep.musicas) if (previas.has(m.id)) atualizarPreviaMusica(m);
  }

  function htmlEditor(m) {
    const r = m.resultado || {};
    const t = textosEditor(m);
    const titulo = nomeMusica(m.resultado) || "sem cifra - cole ou digite aqui";
    const editada = r.Editado ? " ✏️ editada" : "";
    const linhas = Math.max(8, (t.cifra.match(/\n/g) || []).length + 2);
    const s = m.transpor || 0;
    const tom = r.Cifra ? Transpor.tomDaCifra(r.Cifra) : null;
    const padrao = colunasPadrao();

    let htmlTom = "";
    if (tom) {
      const opcoesTom = Transpor.NOTAS.map((_, i) =>
        `<option value="${i}" ${Transpor.mod12(tom.indice + s) === i ? "selected" : ""}>${esc(Transpor.rotuloTom(i, tom.menor))}</option>`).join("");
      htmlTom = `<div class="linha">
          <label class="campo">Tom (original: ${esc(Transpor.rotuloTom(tom.indice, tom.menor))})
            <select data-acao="tom" data-raiz="${tom.indice}" title="Tom estimado pelo primeiro acorde">${opcoesTom}</select></label>
          <button data-acao="desce-tom" title="Descer meio tom">➖ ½ tom</button>
          <button data-acao="sobe-tom" title="Subir meio tom">➕ ½ tom</button>
          ${s ? '<button data-acao="tom-original">↩️ Tom original</button>' : ""}
        </div>
        ${s ? `<p class="tocando">🎼 Tocando em <b>${esc(Transpor.rotuloTom(tom.indice + s, tom.menor))}</b>. O editor continua mostrando o tom original; a prévia e os arquivos saem no tom novo.</p>` : ""}`;
    }

    const radio = (valor, rotulo) => `<label><input type="radio" name="col-${m.id}" value="${valor}" data-acao="colunas"
        ${String(m.colunas || "") === valor ? "checked" : ""}> ${rotulo}</label>`;

    return `<details class="editor" data-id="${m.id}" ${abertos.has(m.id) ? "open" : ""}>
      <summary>${icone(m)} ${esc(m.posicao)} — ${esc(titulo)}${editada}</summary>
      <div class="corpo">
        ${m.url ? `<p><a href="${esc(m.url)}" target="_blank" rel="noopener">Abrir no site ↗</a></p>` : ""}
        ${htmlFonte(r)}
        <div class="linha">
          <label class="campo cresce">Música <input type="text" data-campo="titulo" value="${esc(t.titulo)}"></label>
          <label class="campo cresce">Artista <input type="text" data-campo="artista" value="${esc(t.artista)}"></label>
        </div>
        <label class="campo">Cifra
          <textarea class="mono" data-campo="cifra" rows="${Math.min(30, linhas)}">${esc(t.cifra)}</textarea>
        </label>
        <div class="linha">
          <button class="primario" data-acao="salvar" ${mudouEditor(m) ? "" : "disabled"}>💾 Salvar alterações</button>
          ${r.Original && r.Editado ? '<button data-acao="original">↩️ Voltar ao original</button>' : ""}
          <span class="nao-salvo" ${mudouEditor(m) ? "" : "hidden"}>⚠️ Alterações não salvas</span>
        </div>
        ${htmlTom}
        <div class="linha">
          <fieldset class="campo">
            <legend>Colunas desta música (Word, PDF e TXT)</legend>
            ${radio("", `Padrão (${padrao})`)}${radio("1", "1 coluna")}${radio("2", "2 colunas")}
          </fieldset>
          <label class="botao"><input type="checkbox" data-acao="previa" ${previas.has(m.id) ? "checked" : ""}> 👁️ Prévia desta música</label>
        </div>
        <div class="previa-musica"></div>
      </div>
    </details>`;
  }

  /** Aviso quando a cifra veio de outro site, com as outras opções encontradas */
  function htmlFonte(r) {
    if (!r.Fonte) return "";
    const nome = (u) => decodeURIComponent(new URL(u).pathname.split("/").filter(Boolean).pop() || u).replace(/-/g, " ");
    const opcoes = (r.Alternativas || []).map((u) => `<option value="${esc(u)}" ${u === r.Fonte ? "selected" : ""}>${esc(nome(u))}</option>`).join("");
    return `<div class="aviso-alerta">⚠️ O CifraClub não deixa buscar automaticamente, então esta cifra veio do
      <a href="${esc(r.Fonte)}" target="_blank" rel="noopener">Músicas para Missa ↗</a>. Confira se é a mesma versão.
      Para a versão exata do CifraClub, use o favorito (seção 3).
      ${(r.Alternativas || []).length > 1 ? `<label class="campo">Outras opções encontradas
        <select data-acao="alternativa">${opcoes}</select></label>` : ""}
    </div>`;
  }

  function atualizarPreviaMusica(m) {
    const el = document.querySelector(`details.editor[data-id="${m.id}"] .previa-musica`);
    if (!el) return;
    if (!previas.has(m.id)) { el.innerHTML = ""; return; }
    const t = textosEditor(m);
    if (!t.cifra.trim()) { el.innerHTML = '<p class="dica">A cifra está vazia.</p>'; return; }
    // Mostra o texto que está na caixa, mesmo antes de salvar
    const item = aplicarTom({
      Posição: m.posicao, URL: m.url, Música: t.titulo.trim(), Artista: t.artista.trim(),
      Cifra: t.cifra.trimEnd(), Status: "OK", Erro: "", Colunas: m.colunas || null,
    }, m.transpor || 0);
    const paginas = Exportar.previaSvg([item], colunasPadrao(), tamanhoFonte());
    el.innerHTML = `<p class="dica">${paginas.length} página(s)${mudouEditor(m) ? " · inclui alterações ainda não salvas" : ""}</p>
      <div class="previa">${paginas.join("")}</div>`;
  }

  function renderBaixar() {
    const itens = prontas();
    $("#sem-cifras").hidden = itens.length > 0;
    $("#baixar").hidden = itens.length === 0;
    if (!itens.length) return;
    document.querySelector(`input[name="layout-padrao"][value="${colunasPadrao()}"]`).checked = true;
    $("#fonte").value = opcoes.fonte || "";
    const info = [];
    if (itens.length < rep.musicas.length) info.push(`Serão incluídas ${itens.length} de ${rep.musicas.length} músicas (as que têm cifra).`);
    const proprias = rep.musicas.filter((m) => m.colunas && comCifra(m)).map((m) => m.posicao);
    if (proprias.length) info.push("Com colunas próprias (definidas na edição): " + proprias.join(", "));
    $("#info-baixar").textContent = info.join(" ");
    const paginas = Exportar.previaSvg(itens, colunasPadrao(), tamanhoFonte());
    $("#qtd-paginas").textContent = `${paginas.length} página(s)`;
    $("#previa-geral").innerHTML = paginas.join("");
  }

  // ---------------------------------------------------------------- Ações: repertório
  $("#nome-repertorio").addEventListener("change", (e) => {
    const novo = e.target.value.trim();
    if (!novo || novo === rep.nome) { e.target.value = rep.nome; return; }
    if (nomesRepertorios().includes(novo)) {
      aviso(`Já existe um repertório chamado "${novo}". Escolha outro nome.`);
      e.target.value = rep.nome;
      return;
    }
    apagar(CHAVE.prefixo + rep.nome);
    rep.nome = novo;
    salvar();
    renderRepertorio();
  });

  $("#btn-abrir").addEventListener("click", () => {
    const nome = $("#lista-repertorios").value;
    if (nome && carregarRepertorio(nome)) { render(); aviso(`Repertório aberto: ${nome}`); }
  });

  $("#btn-novo").addEventListener("click", () => { novoRepertorio(false); render(); });

  $("#btn-excluir").addEventListener("click", () => {
    if (!window.confirm(`Excluir o repertório "${rep.nome}" deste navegador? Isso não pode ser desfeito.`)) return;
    apagar(CHAVE.prefixo + rep.nome);
    const restantes = nomesRepertorios();
    if (!(restantes.length && carregarRepertorio(restantes[0]))) novoRepertorio(false);
    render();
  });

  $("#btn-exportar-json").addEventListener("click", () => {
    const { atualizado, ...dados } = rep;
    const blob = new Blob([JSON.stringify(dados, null, 1)], { type: "application/json" });
    Exportar.baixar(blob, `${nomeArquivo()}.json`);
  });

  $("#arquivo-json").addEventListener("change", async (e) => {
    const arquivo = e.target.files[0];
    e.target.value = "";
    if (!arquivo) return;
    try {
      const dados = JSON.parse(await arquivo.text());
      if (!Array.isArray(dados.musicas)) throw new Error("formato");
      rep = {
        nome: nomeLivre(dados.nome || arquivo.name.replace(/\.json$/i, "")),
        musicas: dados.musicas.map((m) => ({ ...m, id: m.id || novoId() })),
      };
      rascunhos = {};
      salvar();
      render();
      aviso(`Repertório aberto: ${rep.nome}`);
    } catch {
      aviso("Esse arquivo não é um repertório válido (.json).");
    }
  });

  const nomeArquivo = () => rep.nome.replace(/[\\/:*?"<>|]/g, "").trim() || "cifras_missa";

  // ---------------------------------------------------------------- Ações: adicionar
  document.querySelectorAll(".aba").forEach((aba) => aba.addEventListener("click", () => {
    document.querySelectorAll(".aba").forEach((a) => a.classList.toggle("ativa", a === aba));
    document.querySelectorAll(".painel-aba").forEach((p) => { p.hidden = p.id !== aba.dataset.aba; });
  }));

  document.querySelectorAll("select.sel-parte").forEach((sel) => sel.addEventListener("change", () => {
    const parte = escolherParte(sel, sel.dataset.anterior);
    if (parte) { renderPartes(); sel.value = parte; sel.dataset.anterior = parte; renderLista(); }
  }));

  $("#aba-um").addEventListener("submit", (e) => {
    e.preventDefault();
    const url = $("#um-url").value.trim();
    if (!linkValido(url)) { aviso("Cole um link completo, começando com https://"); return; }
    rep.musicas.push(novaMusica($("#um-parte").value, url));
    $("#um-url").value = "";
    salvar();
    render();
    avisoDepoisDeAdicionar([url]);
  });

  $("#aba-varios").addEventListener("submit", (e) => {
    e.preventDefault();
    const invalidas = [];
    for (const linha of $("#varios-texto").value.split(/\r?\n/).filter((l) => l.trim())) {
      const corte = linha.lastIndexOf("|");
      const posicao = corte >= 0 ? linha.slice(0, corte).trim() : "";
      const url = (corte >= 0 ? linha.slice(corte + 1) : linha).trim();
      if (linkValido(url)) rep.musicas.push(novaMusica(posicao ? parteDaLista(posicao) : "Outra", url));
      else invalidas.push(linha);
    }
    $("#varios-erro").hidden = !invalidas.length;
    $("#varios-erro").textContent = invalidas.length ? "Linhas ignoradas (link inválido):\n" + invalidas.join("\n") : "";
    const links = $("#varios-texto").value.split(/\r?\n/).map((l) => l.slice(l.lastIndexOf("|") + 1).trim()).filter(linkValido);
    if (!invalidas.length) $("#varios-texto").value = "";
    salvar();
    render();
    avisoDepoisDeAdicionar(links);
  });

  /** Músicas para Missa: busca a cifra na hora. CifraClub: lembra do favorito */
  function avisoDepoisDeAdicionar(links) {
    if (links.some(buscavel)) buscarAutomatico();
    if (links.some((u) => !buscavel(u))) aviso("Música adicionada. Desse site, traga a cifra pelo favorito (seção 3) ou cole no editor.");
  }

  $("#aba-colar").addEventListener("submit", (e) => {
    e.preventDefault();
    const cifra = Layout.limparCifra($("#colar-cifra").value);
    const url = $("#colar-url").value.trim();
    if (!cifra.trim()) { aviso("A cifra está vazia."); return; }
    if (url && !linkValido(url)) { aviso("O link precisa começar com https://"); return; }
    const m = novaMusica($("#colar-parte").value, url);
    const textos = { Música: $("#colar-titulo").value.trim(), Artista: $("#colar-artista").value.trim(), Cifra: cifra };
    m.resultado = { ...textos, Posição: m.posicao, URL: url, Status: "OK", Erro: "", Original: textos, Editado: false };
    rep.musicas.push(m);
    for (const id of ["#colar-titulo", "#colar-artista", "#colar-url", "#colar-cifra"]) $(id).value = "";
    salvar();
    render();
    aviso("Música adicionada.");
  });

  // ---------------------------------------------------------------- Ações: partes e lista
  $("#form-nova-parte").addEventListener("submit", (e) => {
    e.preventDefault();
    const nome = $("#nova-parte").value.trim();
    if (!nome) { aviso("Digite o nome da parte."); return; }
    if (partes.some((p) => comparavel(p) === comparavel(nome))) { aviso(`A parte "${nome}" já existe.`); return; }
    const depois = $("#nova-parte-depois").value;
    if (depois) parteDaLista(nome, depois);
    else { partes.unshift(nome.split(/\s+/).join(" ")); gravar(CHAVE.partes, partes); }
    $("#nova-parte").value = "";
    render();
  });

  $("#btn-remover-parte").addEventListener("click", () => {
    const parte = $("#remover-parte").value;
    partes = partes.filter((p) => p !== parte);
    gravar(CHAVE.partes, partes);
    render();
  });

  $("#btn-restaurar-partes").addEventListener("click", () => {
    partes = PARTES_PADRAO.slice();
    gravar(CHAVE.partes, partes);
    render();
  });

  $("#btn-organizar").addEventListener("click", () => {
    rep.musicas = ordenarPorMissa(rep.musicas);
    salvar();
    render();
  });

  $("#btn-limpar").addEventListener("click", () => {
    if (!window.confirm("Remover todas as músicas deste repertório?")) return;
    rep.musicas = [];
    salvar();
    render();
  });

  const musicaPorId = (id) => rep.musicas.find((m) => m.id === id);

  $("#lista-musicas").addEventListener("click", (e) => {
    const botao = e.target.closest("button[data-acao]");
    if (!botao) return;
    const id = botao.closest(".musica").dataset.id;
    const i = rep.musicas.findIndex((m) => m.id === id);
    const lista = rep.musicas;
    if (botao.dataset.acao === "subir" && i > 0) [lista[i - 1], lista[i]] = [lista[i], lista[i - 1]];
    if (botao.dataset.acao === "descer" && i < lista.length - 1) [lista[i + 1], lista[i]] = [lista[i], lista[i + 1]];
    if (botao.dataset.acao === "remover") { lista.splice(i, 1); delete rascunhos[id]; }
    salvar();
    render();
  });

  $("#lista-musicas").addEventListener("change", (e) => {
    const sel = e.target.closest("select.sel-parte-musica");
    if (!sel) return;
    const m = musicaPorId(sel.closest(".musica").dataset.id);
    const parte = escolherParte(sel, sel.dataset.anterior);
    if (!parte) return;
    m.posicao = parte;
    salvar();
    render();
  });

  // ---------------------------------------------------------------- Ações: editores
  const editorDe = (el) => el.closest("details.editor");

  $("#editores").addEventListener("toggle", (e) => {
    const det = e.target;
    if (!det.matches || !det.matches("details.editor")) return;
    if (det.open) abertos.add(det.dataset.id); else abertos.delete(det.dataset.id);
  }, true);

  const temporizadoresPrevia = {};
  $("#editores").addEventListener("input", (e) => {
    const campo = e.target.dataset.campo;
    if (!campo) return;
    const det = editorDe(e.target);
    const m = musicaPorId(det.dataset.id);
    rascunhos[m.id] = {
      titulo: det.querySelector('[data-campo="titulo"]').value,
      artista: det.querySelector('[data-campo="artista"]').value,
      cifra: det.querySelector('[data-campo="cifra"]').value,
    };
    const mudou = mudouEditor(m);
    det.querySelector('[data-acao="salvar"]').disabled = !mudou;
    det.querySelector(".nao-salvo").hidden = !mudou;
    if (previas.has(m.id)) {
      clearTimeout(temporizadoresPrevia[m.id]);
      temporizadoresPrevia[m.id] = setTimeout(() => atualizarPreviaMusica(m), 400);
    }
  });

  function mudarTom(m, semitons) {
    m.transpor = Transpor.mod12(semitons);
    salvar();
    render();
  }

  $("#editores").addEventListener("click", (e) => {
    const botao = e.target.closest("button[data-acao]");
    if (!botao) return;
    const m = musicaPorId(editorDe(botao).dataset.id);
    const s = m.transpor || 0;
    switch (botao.dataset.acao) {
      case "salvar": {
        const t = textosEditor(m);
        if (!t.cifra.trim()) { aviso("A cifra está vazia."); return; }
        m.resultado = {
          ...(m.resultado || {}),
          Posição: m.posicao, URL: m.url,
          Música: t.titulo.trim(), Artista: t.artista.trim(), Cifra: t.cifra.trimEnd(),
          Status: "OK", Erro: "", Editado: true,
        };
        delete rascunhos[m.id];
        salvar();
        render();
        aviso("Alterações salvas");
        break;
      }
      case "original":
        m.resultado = { ...m.resultado, ...m.resultado.Original, Editado: false };
        delete rascunhos[m.id];
        salvar();
        render();
        break;
      case "desce-tom": mudarTom(m, s - 1); break;
      case "sobe-tom": mudarTom(m, s + 1); break;
      case "tom-original": mudarTom(m, 0); break;
    }
  });

  $("#editores").addEventListener("change", (e) => {
    const alvo = e.target;
    const acao = alvo.dataset.acao;
    if (!acao) return;
    const m = musicaPorId(editorDe(alvo).dataset.id);
    if (acao === "tom") {
      mudarTom(m, Number(alvo.value) - Number(alvo.dataset.raiz));
    } else if (acao === "colunas") {
      m.colunas = alvo.value ? Number(alvo.value) : null;
      salvar();
      atualizarPreviaMusica(m);
      renderBaixar();
    } else if (acao === "alternativa") {
      if (m.resultado.Editado && !window.confirm("Esta música tem edições. Trocar pela outra opção?")) {
        alvo.value = m.resultado.Fonte;
        return;
      }
      trocarAlternativa(m, alvo.value);
    } else if (acao === "previa") {
      if (alvo.checked) previas.add(m.id); else previas.delete(m.id);
      atualizarPreviaMusica(m);
    }
  });

  // ---------------------------------------------------------------- Ações: baixar
  document.querySelectorAll('input[name="layout-padrao"]').forEach((r) => r.addEventListener("change", () => {
    opcoes.colunas = Number(r.value);
    gravar(CHAVE.opcoes, opcoes);
    render();
  }));

  $("#fonte").addEventListener("change", (e) => {
    opcoes.fonte = e.target.value;
    gravar(CHAVE.opcoes, opcoes);
    render();
  });

  document.querySelectorAll(".botoes-baixar button").forEach((botao) => botao.addEventListener("click", async () => {
    const formato = botao.dataset.formato;
    const itens = prontas();
    botao.disabled = true;
    try {
      const geradores = {
        pdf: () => Exportar.exportarPdf(itens, colunasPadrao(), tamanhoFonte()),
        docx: () => Exportar.exportarDocx(itens, colunasPadrao(), tamanhoFonte()),
        txt: () => Exportar.exportarTxt(itens, colunasPadrao()),
        xlsx: () => Exportar.exportarXlsx(itens),
      };
      Exportar.baixar(await geradores[formato](), `${nomeArquivo()}.${formato}`);
    } catch (erro) {
      console.error(erro);
      aviso("Não foi possível gerar o arquivo: " + erro.message);
    } finally {
      botao.disabled = false;
    }
  }));

  // ---------------------------------------------------------------- Favorito "Enviar cifra"
  /*
   * Código do favorito. Roda na página do site de cifras (CifraClub, Músicas para Missa...):
   * 1. abre/usa a aba do Cifras da Missa e pede a lista de links que ainda estão sem cifra;
   * 2. manda a cifra da página aberta e busca as outras do MESMO site (o site não bloqueia,
   *    porque o pedido sai da própria página dele), mandando uma por uma para cá.
   * Regras para caber num favorito: sem comentários de linha e com ";" em tudo,
   * porque o navegador junta as linhas do endereço do favorito.
   */
  function favorito(SITE, ORIGEM) {
    var HASH = String.fromCharCode(35);
    var w = window.open(SITE + HASH + "conectar-" + Date.now(), "cifras-missa");
    if (!w) { alert("O navegador bloqueou a janela do Cifras da Missa. Permita pop-ups para este site e tente de novo."); return; }
    var norm = function (u) {
      try { var x = new URL(u); return (x.hostname.replace(/^www[.]/, "") + x.pathname.replace(/[/]+$/, "")).toLowerCase(); } catch (e) { return u; }
    };
    var extrair = function (doc, url) {
      var p = doc.querySelector("pre");
      if (!p || p.textContent.trim().length < 20) { return null; }
      var t = doc.title.split(" - "), h = doc.querySelector("h1");
      return { url: url, titulo: (h ? h.textContent : doc.title).trim(), artista: /cifraclub/.test(location.hostname) && t.length >= 3 ? t[1].trim() : "", cifra: p.textContent };
    };
    var enviar = function (m) { w.postMessage(m, ORIGEM); };
    var conectado = false;
    var ouvir = async function (e) {
      if (e.origin !== ORIGEM || !e.data || e.data.tipo !== "lista" || conectado) { return; }
      conectado = true;
      window.removeEventListener("message", ouvir);
      var atual = extrair(document, location.href);
      var faltam = e.data.urls.filter(function (u) {
        try { return new URL(u).hostname === location.hostname && norm(u) !== norm(location.href); } catch (x) { return false; }
      });
      enviar({ tipo: "inicio", total: faltam.length + (atual ? 1 : 0), site: location.hostname });
      if (atual) { enviar({ tipo: "cifra", dados: atual, atual: true }); }
      for (var i = 0; i < faltam.length; i++) {
        var u = faltam[i];
        try {
          var r = await fetch(u, { credentials: "include" });
          var d = extrair(new DOMParser().parseFromString(await r.text(), "text/html"), u);
          enviar(d ? { tipo: "cifra", dados: d } : { tipo: "erro", url: u, erro: r.ok ? "a cifra não foi encontrada na página" : "o site respondeu com erro " + r.status });
        } catch (x) { enviar({ tipo: "erro", url: u, erro: "não foi possível abrir a página (" + x + ")" }); }
      }
      enviar({ tipo: "fim", total: faltam.length, atual: !!atual });
    };
    window.addEventListener("message", ouvir);
    var tentativas = 0;
    var intervalo = setInterval(function () {
      if (conectado || ++tentativas > 80) {
        clearInterval(intervalo);
        if (!conectado) { alert("Não consegui falar com o Cifras da Missa. Tente de novo."); }
        return;
      }
      try { enviar({ tipo: "ola" }); } catch (x) { return; }
    }, 250);
  }

  function codigoFavorito() {
    const site = location.href.split("#")[0];
    const fonte = favorito.toString().replace(/\s*\n\s*/g, " ");
    return `javascript:(${fonte})(${JSON.stringify(site)},${JSON.stringify(location.origin)});`;
  }

  $("#marcador").href = codigoFavorito();
  $("#marcador").addEventListener("click", (e) => {
    e.preventDefault();
    aviso("Arraste este botão para a barra de favoritos e use-o na página da cifra.");
  });

  $("#btn-copiar-marcador").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(codigoFavorito());
      aviso("Código copiado. Cole no endereço de um favorito.");
    } catch {
      window.prompt("Copie o código abaixo:", codigoFavorito());
    }
  });

  /** Links das músicas que ainda estão sem cifra */
  // (inclui as que receberam a cifra de outro site, para o favorito trazer a versão exata)
  const linksPendentes = () => rep.musicas
    .filter((m) => m.url && (!comCifra(m) || m.resultado.Fonte)).map((m) => m.url);

  function hostDe(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
  }

  /** Um botão por site com cifras faltando: abre uma delas para o favorito buscar todas */
  // Busca automática pelo servidor (Cloudflare Worker, pasta worker/).
  // - Músicas para Missa: busca a cifra direto pelo link.
  // - CifraClub: bloqueia qualquer servidor (erro 403), então procura a mesma música pelo nome
  //   no Músicas para Missa. A versão exata do CifraClub continua disponível pelo favorito.
  const API_BUSCA = "https://cifras-missa.renebueno17.workers.dev/";
  const SITES_AUTOMATICOS = ["musicasparamissa.com.br"];
  const SITES_BLOQUEADOS = ["cifraclub.com.br"];
  const automatico = (url) => SITES_AUTOMATICOS.includes(hostDe(url));
  const bloqueado = (url) => SITES_BLOQUEADOS.includes(hostDe(url));
  const buscavel = (url) => automatico(url) || bloqueado(url);
  let buscandoAutomatico = false;

  async function chamarBusca(parametros) {
    let r;
    try {
      r = await fetch(API_BUSCA + "?" + new URLSearchParams(parametros));
    } catch {
      throw new Error("sem conexão com o serviço de busca");
    }
    const dados = await r.json();
    if (!r.ok) throw new Error(dados.erro || `erro ${r.status}`);
    return dados;
  }

  /** Nome e artista a partir do link (ex.: cifraclub.com.br/banda-capella/gloria/) */
  function nomeDoLink(url) {
    const partes = new URL(url).pathname.split("/").filter(Boolean);
    const texto = (s) => decodeURIComponent(s || "").replace(/[-_]+/g, " ");
    return { titulo: texto(partes[partes.length - 1]), artista: texto(partes[partes.length - 2]) };
  }

  /** Coloca na música a cifra achada em outro site, guardando de onde veio e as outras opções */
  function aplicarAlternativa(m, d, alternativas) {
    const textos = { Música: d.titulo.trim(), Artista: d.artista.trim(), Cifra: Layout.limparCifra(d.cifra) };
    m.resultado = {
      ...textos, Posição: m.posicao, URL: m.url, Status: "OK", Erro: "",
      Original: textos, Editado: false, Fonte: d.url, Alternativas: alternativas,
    };
    delete rascunhos[m.id];
  }

  async function buscarUma(m) {
    if (automatico(m.url)) {
      receberCifra(await chamarBusca({ url: m.url }), { lote: true });
      return;
    }
    const { titulo, artista } = nomeDoLink(m.url);
    const { candidatos } = await chamarBusca({ titulo, artista });
    if (!candidatos.length) {
      throw new Error("o CifraClub não deixa buscar automaticamente e a música não foi encontrada no Músicas para Missa; use o favorito ou cole a cifra");
    }
    aplicarAlternativa(m, await chamarBusca({ url: candidatos[0].url }), candidatos.map((c) => c.url));
  }

  async function buscarAutomatico() {
    const alvo = rep.musicas.filter((m) => m.url && !comCifra(m) && buscavel(m.url));
    if (!alvo.length || buscandoAutomatico) return;
    buscandoAutomatico = true;
    let ok = 0;
    const erros = [];
    for (const [i, m] of alvo.entries()) {
      mostrarProgresso(`⏳ Buscando cifras: ${i + 1} de ${alvo.length}…`);
      try {
        await buscarUma(m);
        ok += 1;
      } catch (erro) {
        if (!comCifra(m)) m.resultado = { Posição: m.posicao, URL: m.url, Música: "", Artista: "", Cifra: "", Status: "Erro", Erro: erro.message };
        erros.push(m.posicao);
      }
      salvar();
      render();
    }
    buscandoAutomatico = false;
    const outroSite = alvo.filter((m) => m.resultado && m.resultado.Fonte).length;
    mostrarProgresso(`✅ ${ok} de ${alvo.length} cifra(s) encontrada(s)`
      + (outroSite ? ` · ${outroSite} do CifraClub vieram do Músicas para Missa (confira na seção 4)` : "")
      + (erros.length ? ` · não encontradas: ${erros.join(", ")} (use o favorito ou cole a cifra)` : ""));
    render();
  }

  /** Troca a cifra achada em outro site por outra opção da lista */
  async function trocarAlternativa(m, url) {
    try {
      mostrarProgresso("⏳ Buscando a outra opção…");
      aplicarAlternativa(m, await chamarBusca({ url }), m.resultado.Alternativas);
      mostrarProgresso("");
      abertos.add(m.id);
      salvar();
      render();
    } catch (erro) {
      mostrarProgresso("");
      aviso("Não consegui buscar essa opção: " + erro.message);
    }
  }

  function renderBusca() {
    const faltando = rep.musicas.filter((m) => m.url && !comCifra(m));
    const el = $("#botoes-sites");
    if (!rep.musicas.some((m) => m.url)) { el.innerHTML = ""; }
    else if (!faltando.length) { el.innerHTML = '<p class="aviso">✅ Todas as músicas com link já têm cifra.</p>'; }
    else {
      const autom = faltando.filter((m) => buscavel(m.url)).length;
      el.innerHTML = autom
        ? `<button class="primario" data-auto="1" ${buscandoAutomatico ? "disabled" : ""}>⚡ Buscar cifras automaticamente — ${autom} faltando</button>`
        : '<p class="dica">As músicas que faltam são de outros sites: use o favorito abaixo ou cole a cifra.</p>';
    }

    // Favorito: versão exata do CifraClub (ou de outros sites), inclusive das que vieram de outro site
    const grupos = new Map();
    for (const m of rep.musicas) {
      if (!m.url || automatico(m.url) || (comCifra(m) && !m.resultado.Fonte)) continue;
      const host = hostDe(m.url);
      if (!grupos.has(host)) grupos.set(host, []);
      grupos.get(host).push(m);
    }
    $("#botoes-favorito").innerHTML = [...grupos].map(([host, musicas]) => {
      const nome = NOMES_SITE[detectarSite(musicas[0].url)];
      const rotulo = nome === NOMES_SITE.outro ? host : nome;
      return `<button data-abrir="${esc(musicas[0].url)}">🔎 Abrir ${esc(rotulo)} — ${musicas.length} música(s)</button>`;
    }).join("");
  }

  $("#botoes-sites").addEventListener("click", (e) => {
    if (e.target.closest("button[data-auto]")) buscarAutomatico();
  });

  $("#botoes-favorito").addEventListener("click", (e) => {
    const botao = e.target.closest("button[data-abrir]");
    // Sem "noopener": assim o favorito consegue voltar para esta mesma aba
    if (botao) window.open(botao.dataset.abrir, "_blank");
  });

  /** Aplica uma cifra recebida na música com o mesmo link (ou cria uma música nova) */
  function receberCifra(d, { atual = false, lote = false } = {}) {
    const textos = { Música: (d.titulo || "").trim(), Artista: (d.artista || "").trim(), Cifra: Layout.limparCifra(d.cifra || "") };
    const resultado = { ...textos, URL: d.url, Status: "OK", Erro: "", Original: textos, Editado: false };
    const alvo = rep.musicas.find((m) => m.url && normalizarUrl(m.url) === normalizarUrl(d.url));
    if (alvo) {
      if (alvo.resultado && alvo.resultado.Editado && (!atual
          || !window.confirm(`"${alvo.posicao}" tem edições. Substituir pela cifra do site?`))) return null;
      alvo.resultado = { ...resultado, Posição: alvo.posicao };
      delete rascunhos[alvo.id];
      if (!lote) abertos.add(alvo.id);
      return `${alvo.posicao} — ${textos.Música}`;
    }
    const m = novaMusica("Outra", d.url);
    m.resultado = { ...resultado, Posição: m.posicao };
    rep.musicas.push(m);
    if (!lote) abertos.add(m.id);
    return `${textos.Música} (nova música: escolha a parte da missa na lista)`;
  }

  /** Favorito antigo: a cifra vem no endereço, depois de #importar= */
  function receberDoFavorito() {
    if (/^#conectar-/.test(location.hash)) { history.replaceState(null, "", location.pathname + location.search); return; }
    const achado = location.hash.match(/^#importar=([\s\S]*)$/);
    if (!achado) return;
    history.replaceState(null, "", location.pathname + location.search);
    let d;
    try { d = JSON.parse(decodeURIComponent(achado[1])); } catch { aviso("Não consegui ler a cifra enviada."); return; }
    const recebida = receberCifra(d, { atual: true });
    if (recebida) { aviso(`Cifra recebida: ${recebida}`); salvar(); render(); }
  }

  // Favorito novo: conversa por mensagens com a página do site de cifras
  let busca = null;              // {site, total, recebidas, erros}
  let temporizadorBusca = null;
  function atualizarDepoisDaBusca() {
    clearTimeout(temporizadorBusca);
    temporizadorBusca = setTimeout(() => { salvar(); render(); }, 150);
  }
  function mostrarProgresso(texto) {
    const el = $("#progresso-busca");
    el.hidden = !texto;
    el.textContent = texto || "";
  }

  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (!msg || typeof msg !== "object" || typeof msg.tipo !== "string") return;
    if (msg.tipo === "ola") {
      if (e.source) e.source.postMessage({ tipo: "lista", urls: linksPendentes() }, e.origin);
      return;
    }
    if (!/^https?:\/\//.test(e.origin)) return;
    if (msg.tipo === "cifra" && msg.dados && typeof msg.dados.cifra === "string") {
      const recebida = receberCifra(msg.dados, { atual: !!msg.atual, lote: !msg.atual });
      if (recebida && msg.atual) aviso(`Cifra recebida: ${recebida}`);
      if (recebida && busca) busca.recebidas += 1;
      atualizarDepoisDaBusca();
    } else if (msg.tipo === "inicio") {
      busca = { site: hostDe("https://" + msg.site), total: msg.total, recebidas: 0, erros: [] };
      mostrarProgresso("");
    } else if (msg.tipo === "erro" && busca) {
      const m = rep.musicas.find((x) => x.url && normalizarUrl(x.url) === normalizarUrl(msg.url));
      if (m && !comCifra(m)) {
        m.resultado = { Posição: m.posicao, URL: m.url, Música: "", Artista: "", Cifra: "", Status: "Erro", Erro: String(msg.erro) };
      }
      busca.erros.push(m ? m.posicao : msg.url);
      atualizarDepoisDaBusca();
    } else if (msg.tipo === "fim" && busca) {
      const partesTexto = [`${busca.recebidas} de ${busca.total} cifra(s) recebida(s) de ${busca.site}`];
      if (busca.erros.length) partesTexto.push(`com erro: ${busca.erros.join(", ")} (tente de novo ou cole a cifra)`);
      mostrarProgresso("✅ " + partesTexto.join(" · "));
      aviso(partesTexto[0]);
      busca = null;
      atualizarDepoisDaBusca();
      return;
    }
    if (busca) mostrarProgresso(`⏳ Buscando em ${busca.site}: ${busca.recebidas + busca.erros.length} de ${busca.total}…`);
  });

  // Outra aba desta página mudou o repertório: recarrega
  window.addEventListener("storage", (e) => {
    if (e.key === CHAVE.prefixo + rep.nome && e.newValue) {
      rep = JSON.parse(e.newValue);
      render();
    } else if (e.key === CHAVE.partes && e.newValue) {
      partes = JSON.parse(e.newValue);
      render();
    }
  });
  window.addEventListener("hashchange", receberDoFavorito);

  // ---------------------------------------------------------------- Início
  window.name = "cifras-missa"; // o favorito reaproveita esta aba quando possível
  const atual = ler(CHAVE.atual, null);
  if (!(atual && carregarRepertorio(atual))) {
    const nomes = nomesRepertorios();
    if (!(nomes.length && carregarRepertorio(nomes[0]))) novoRepertorio(true);
  }
  receberDoFavorito();
  render();
})();
