/*
 * Músico Católico - versão página HTML (sem servidor).
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
  const NOMES_SITE = { cifraclub: "CifraClub", musicasparamissa: "Músicas para Missa", bananacifras: "Banana Cifras", cifrascombr: "Cifras.com.br", outro: "Outro site" };
  const NOVA_PARTE = "__nova__";
  const PARTES_TIPO = {
    "Missa": PARTES_PADRAO,
    "Grupo de Oração": ["Animação", "Condução", "Espírito Santo", "Adoração", "Final"],
    "Encontro": ["Acolhida", "Animação", "Louvor", "Partilha", "Adoração", "Envio", "Final"],
  };
  const TIPOS = Object.keys(PARTES_TIPO);
  const tipoAtual = () => (rep && PARTES_TIPO[rep.tipo] ? rep.tipo : "Missa");
  const chavePartes = () => (tipoAtual() === "Missa" ? CHAVE.partes : CHAVE.partes + "." + tipoAtual());
  const lerPartes = () => ler(chavePartes(), PARTES_TIPO[tipoAtual()].slice());
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
  let aVer = null;                // música recém-adicionada pelo ➕: abre editor + prévia quando a cifra chega
  let acervo = new Set();         // cifras do Músicas para Missa já guardadas no Supabase (endereços)
  let baixando = false, parar = false;
  const verDepois = (m) => { aVer = m.id; abertos.add(m.id); previas.add(m.id); };

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
    Nuvem.agendarEnvio(rep);
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

  function novoRepertorio(exemplo, tipo = "Missa", nomeBase = "") {
    rep = {
      nome: nomeLivre(nomeBase || `${tipo} ${hoje()}`),
      tipo,
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
    gravar(chavePartes(), partes);
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
    if (host.includes("bananacifras")) return "bananacifras";
    if (host.endsWith("cifras.com.br")) return "cifrascombr";
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
  const cabecalhoFolheto = () => [opcoes.paroquia, opcoes.missa].filter(Boolean).join(" - ");
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
  partes = lerPartes();
  document.dispatchEvent(new Event("cm:render"));
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
    renderLateralReps();
  }

  function renderPartes() {
    for (const id of ["#um-parte", "#nome-parte", "#art-parte", "#colar-parte"]) {
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

  /** Nome amigável do site de onde veio a cifra (ou o domínio, se for outro) */
  const nomeFonte = (url) => {
    const nome = NOMES_SITE[detectarSite(url)];
    return nome === NOMES_SITE.outro ? hostDe(url) : nome;
  };

  function renderLista() {
    const musicas = rep.musicas;
    $("#qtd-musicas").textContent = musicas.length;
    $("#btn-organizar").disabled = $("#btn-limpar").disabled = !musicas.length;
    if (!musicas.length) {
      $("#lista-musicas").innerHTML = '<p class="aviso">A lista está vazia. Adicione músicas acima.</p>';
      return;
    }
    $("#lista-musicas").innerHTML = musicas.map((m, i) => {
      const origem = m.url ? NOMES_SITE[detectarSite(m.url)] : m.busca ? "Busca pelo nome" : "Digitada à mão";
      const tom = descricaoTom(m);
      return `<div class="musica" data-id="${m.id}">
        <div class="status">${icone(m)}</div>
        <select class="sel-parte-musica" data-anterior="${esc(m.posicao)}" aria-label="Parte da missa">${opcoesPartes(m.posicao)}</select>
        <div class="info"><b>${esc(nomeMusica(m.resultado) || "Ainda sem cifra")}</b> · ${esc(origem)}${m.resultado && m.resultado.Fonte ? ` · ⚠️ cifra de ${esc(nomeFonte(m.resultado.Fonte))}` : ""}${tom ? ` · 🎼 ${esc(tom)}` : ""}
          ${m.url ? `<br><small>${esc(m.url)}</small>` : m.busca ? `<br><small>${esc(m.busca.titulo)}${m.busca.artista ? " — " + esc(m.busca.artista) : ""}</small>` : ""}</div>
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
          <button class="primario" data-acao="salvar" hidden style="display:none" ${mudouEditor(m) ? "" : "disabled"}>💾 Salvar alterações</button>
          ${r.Original && r.Editado ? '<button data-acao="original">↩️ Voltar ao original</button>' : ""}
          <span class="nao-salvo" ${mudouEditor(m) ? "" : "hidden"}>Salvando…</span><span class="salvo-auto" hidden>✓ Salvo automaticamente</span>
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

  /** Aviso quando a cifra veio de outro site (achada pelo nome), com as outras opções encontradas */
  function htmlFonte(r) {
    if (!r.Fonte) return "";
    const nome = (u) => `${hostDe(u)} — ${decodeURIComponent(new URL(u).pathname.split("/").filter(Boolean).slice(-2).join(" / ")).replace(/-/g, " ")}`;
    const opcoes = (r.Alternativas || []).map((u) => `<option value="${esc(u)}" ${u === r.Fonte ? "selected" : ""}>${esc(nome(u))}</option>`).join("");
    return `<div class="aviso-alerta">⚠️ Esta cifra foi achada pelo nome em
      <a href="${esc(r.Fonte)}" target="_blank" rel="noopener">${esc(hostDe(r.Fonte))} ↗</a>. Confira se é a versão que você quer.
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
    $("#folheto-paroquia").value = opcoes.paroquia || "";
    $("#folheto-missa").value = opcoes.missa || "";
    Exportar.cabecalho = cabecalhoFolheto();
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
    Nuvem.apagar(rep.nome);
    apagar(CHAVE.prefixo + rep.nome);
    rep.nome = novo;
    salvar();
    renderRepertorio();
  });

  $("#btn-abrir").addEventListener("click", () => {
    const nome = $("#lista-repertorios").value;
    if (nome && carregarRepertorio(nome)) { render(); aviso(`Repertório aberto: ${nome}`); }
  });

  $("#btn-novo").addEventListener("click", () => window.CM.pedirTipo());

  $("#btn-excluir").addEventListener("click", () => {
    if (!window.confirm(`Excluir o repertório "${rep.nome}" deste navegador? Isso não pode ser desfeito.`)) return;
    Nuvem.apagar(rep.nome);
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
        tipo: PARTES_TIPO[dados.tipo] ? dados.tipo : "Missa",
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
    if (aba.dataset.aba === "aba-sugestoes") carregarMissas();
    if (aba.dataset.aba === "aba-artista") renderRobo();
    if (aba.dataset.aba === "aba-catalogo") carregarCatalogo();
    if (aba.dataset.aba === "aba-goc") carregarGoc();
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
    buscarAutomatico();
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
    if (!invalidas.length) $("#varios-texto").value = "";
    salvar();
    render();
    buscarAutomatico();
  });

  $("#aba-nome").addEventListener("submit", (e) => {
    e.preventDefault();
    const titulo = $("#nome-titulo").value.trim();
    if (!titulo) { aviso("Digite o nome da música."); return; }
    const m = novaMusica($("#nome-parte").value, "");
    m.busca = { titulo, artista: $("#nome-artista").value.trim() };
    rep.musicas.push(m);
    $("#nome-titulo").value = $("#nome-artista").value = "";
    salvar();
    render();
    buscarAutomatico();
  });

  // Catálogo: todas as músicas do Músicas para Missa por parte da missa (varredura guardada no Supabase)
  let catalogo = null; // { parte: [{ url, titulo }] }
  const statusCat = (texto) => { $("#cat-status").hidden = !texto; $("#cat-status").textContent = texto || ""; };
  const humanizar = (slug) => { const t = decodeURIComponent(slug).replace(/-/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };

  async function carregarCatalogo(forcar = false) {
    if (catalogo && !forcar) return renderCatalogo();
    statusCat("Carregando catálogo…");
    try {
      const linhas = [];
      for (let i = 0; ; i += 1000) {
        const lote = await Nuvem.rest(`cifras_catalogo?select=url,titulo,parte&order=titulo&limit=1000&offset=${i}`);
        linhas.push(...lote);
        if (lote.length < 1000) break;
      }
      catalogo = {};
      for (const l of linhas) (catalogo[l.parte] ||= []).push(l);
      statusCat(linhas.length ? "" : "Catálogo vazio: clique em Atualizar catálogo para a primeira varredura.");
    } catch (erro) {
      statusCat("Não consegui carregar o catálogo: " + erro.message);
      catalogo = null;
    }
    renderCatalogo();
  }

  function renderCatalogo() {
    const sel = $("#cat-parte");
    const atual = sel.value;
    const nomes = Object.keys(catalogo || {}).sort((a, b) => {
      const ia = PARTES_PADRAO.indexOf(a), ib = PARTES_PADRAO.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, "pt-BR");
    });
    sel.innerHTML = nomes.map((n) => `<option value="${esc(n)}">${esc(n)} (${catalogo[n].length})</option>`).join("");
    if (nomes.includes(atual)) sel.value = atual;
    listarCatalogo();
    renderLateral();
  }

  function listarCatalogo() {
    const parte = $("#cat-parte").value;
    const filtro = comparavel($("#cat-filtro").value);
    const todas = ((catalogo || {})[parte] || []).filter((m) => !filtro || comparavel(m.titulo).includes(filtro));
    $("#cat-lista").innerHTML = todas.length
      ? `<ul class="catalogo">` + todas.slice(0, 100).map((m) => `<li><button type="button" data-parte="${esc(parte)}" data-url="${esc(m.url)}" title="Adicionar à lista">➕</button> ${esc(m.titulo)}</li>`).join("") + "</ul>"
        + (todas.length > 100 ? `<p class="dica">Mostrando 100 de ${todas.length}; use o filtro para achar as outras.</p>` : "")
      : "";
  }

  async function varrerCatalogo() {
    const botao = $("#cat-varrer");
    botao.disabled = true;
    try {
      statusCat("Lendo a lista de músicas do site…");
      const { musicas, pastas } = await chamarBusca({ catalogo: "1" });
      const chave = (s) => s.replace(/%20/g, " "); // alguns endereços do site têm espaço
      const votos = {}, titulos = {}; // votos[musica][parte]: a pasta do site manda sobre o palpite pelo nome
      for (let i = 0; i < pastas.length; i += 12) {
        statusCat(`Varrendo as pastas do site: ${Math.min(i + 12, pastas.length)} de ${pastas.length}…`);
        const lote = pastas.slice(i, i + 12);
        const { pastas: lidas } = await chamarBusca({ pastas: lote.map(([slug]) => slug).join(",") });
        for (const [slug, itens] of lidas) {
          const parte = lote.find(([s]) => s === slug)[1];
          for (const [musica, titulo] of itens) {
            titulos[chave(musica)] = titulo;
            const v = (votos[chave(musica)] ||= {});
            v[parte] = (v[parte] || 0) + 1;
          }
        }
      }
      const melhor = (v) => Object.entries(v).sort((a, b) => b[1] - a[1])[0][0];
      const linhas = musicas.map(([slug, parteNome]) => ({
        url: `https://musicasparamissa.com.br/musica/${slug.replace(/ /g, "%20")}/`,
        titulo: (titulos[chave(slug)] || humanizar(slug)).slice(0, 200),
        parte: votos[chave(slug)] ? melhor(votos[chave(slug)]) : parteNome,
      }));
      for (let i = 0; i < linhas.length; i += 500) {
        statusCat(`Guardando no catálogo: ${Math.min(i + 500, linhas.length)} de ${linhas.length}…`);
        await Nuvem.rest("cifras_catalogo?on_conflict=url", { metodo: "POST", corpo: linhas.slice(i, i + 500), prefer: "resolution=merge-duplicates,return=minimal" });
      }
      await carregarCatalogo(true);
      aviso(`Catálogo atualizado: ${linhas.length} músicas.`);
    } catch (erro) {
      statusCat("A varredura parou: " + erro.message);
    }
    botao.disabled = false;
  }

  $("#cat-varrer").addEventListener("click", varrerCatalogo);
  $("#cat-parte").addEventListener("change", listarCatalogo);
  $("#cat-filtro").addEventListener("input", listarCatalogo);
  function adicionarDoCatalogo(botao) {
    rep.musicas.push(novaMusica(parteDaLista(botao.dataset.parte === "Outras" ? "Outra" : botao.dataset.parte), botao.dataset.url));
    verDepois(rep.musicas[rep.musicas.length - 1]);
    botao.disabled = true;
    salvar();
    render();
    buscarAutomatico();
  }
  $("#cat-lista").addEventListener("click", (e) => {
    const botao = e.target.closest("button[data-url]");
    if (botao) adicionarDoCatalogo(botao);
  });

  // Grupo de Oração: etapas do grupo (tabela cifras_goc, coluna etapa) e artista
  const ETAPAS = ["Animação", "Condução", "Espírito Santo", "Adoração", "Final", "Outras"];
  let goc = null;
  let gocSalvas = new Set(); // cifras do cifras.com.br já guardadas no Supabase (tabela cifras_goc_cifras)
  const URL_GOC = /^https:\/\/www\.cifras\.com\.br\/cifra\/[a-z0-9-]+\/[a-z0-9-]+$/;
  function guardarGoc(url, titulo, artista, cifra) {
    if (!URL_GOC.test(url) || cifra.length < 20 || cifra.length > 30000) return;
    gocSalvas.add(url);
    Nuvem.rest("cifras_goc_cifras?on_conflict=url", { metodo: "POST", prefer: "resolution=merge-duplicates,return=minimal",
      corpo: [{ url, titulo: titulo.slice(0, 200), artista: artista.slice(0, 200), cifra, atualizado: new Date().toISOString() }] }).catch(() => {});
  }
  const statusGoc = (t) => { $("#goc-status").hidden = !t; $("#goc-status").textContent = t || ""; };

  async function carregarGoc() {
    if (goc) return;
    statusGoc("Carregando…");
    try {
      goc = [];
      for (let i = 0; ; i += 1000) {
        const lote = await Nuvem.rest(`cifras_goc?select=url,pasta,titulo,etapa,url_mpm&order=titulo&limit=1000&offset=${i}`);
        goc.push(...lote);
        if (lote.length < 1000) break;
      }
      const conta = (campo, nome) => goc.filter((m) => m[campo] === nome).length;
      $("#goc-etapa").innerHTML = `<option value="">Todas (${goc.length})</option>` + ETAPAS.map((n) => `<option value="${esc(n)}">${esc(n)} (${conta("etapa", n)})</option>`).join("");
      $("#goc-pasta").innerHTML = `<option value="">Todos</option>` + [...new Set(goc.map((m) => m.pasta))].sort((a, b) => a.localeCompare(b, "pt-BR")).map((n) => `<option value="${esc(n)}">${esc(n)} (${conta("pasta", n)})</option>`).join("");
      try { gocSalvas = new Set((await Nuvem.rest("cifras_goc_cifras?select=url&limit=1000")).map((l) => l.url)); } catch { /* sem cifras guardadas */ }
      statusGoc("");
    } catch (erro) { statusGoc("Não consegui carregar: " + erro.message); goc = null; return; }
    listarGoc();
    renderLateralGoc();
  }

  const linhaGoc = (m) => `<li><button type="button" data-goc="${esc(m.url)}" data-titulo="${esc(m.titulo)}" data-artista="${esc(m.pasta)}" data-etapa="${esc(m.etapa || "")}" data-mpm="${esc(m.url_mpm || "")}" title="${m.url_mpm || gocSalvas.has(m.url) ? "Adicionar ao repertório com a cifra" : "Levar para Colar cifra"}">➕</button> <a href="${esc(m.url)}" target="_blank" rel="noopener noreferrer" title="Abrir a cifra no site">↗</a> ${esc(m.titulo)} <small>${esc(m.pasta)}</small>${m.url_mpm || gocSalvas.has(m.url) ? ' <small title="Cifra disponível">✓</small>' : ""}</li>`;

  function listarGoc() {
    const etapa = $("#goc-etapa").value, pasta = $("#goc-pasta").value, filtro = comparavel($("#goc-filtro").value);
    const todas = (goc || []).filter((m) => (!etapa || m.etapa === etapa) && (!pasta || m.pasta === pasta) && (!filtro || comparavel(m.titulo).includes(filtro)));
    $("#goc-lista").innerHTML = todas.length
      ? `<ul class="catalogo">` + todas.slice(0, 100).map(linhaGoc).join("") + "</ul>"
        + (todas.length > 100 ? `<p class="dica">Mostrando 100 de ${todas.length}; use o filtro.</p>` : "")
      : "";
  }

  const baixadas = (etapa) => goc.filter((m) => m.etapa === etapa && gocSalvas.has(m.url)).length;
  function renderLateralGoc() {
    const el = $("#lat-goc-lista");
    if (!goc) { el.innerHTML = '<p class="dica">Abra a aba "Grupo de Oração" em Adicionar músicas para carregar.</p>'; return; }
    const filtro = comparavel($("#lat-goc-filtro").value);
    const abertas = new Set([...el.querySelectorAll("details[open]")].map((d) => d.dataset.etapa));
    el.innerHTML = ETAPAS.map((etapa) => {
      const itens = goc.filter((m) => m.etapa === etapa && (!filtro || comparavel(m.titulo).includes(filtro)));
      if (!itens.length) return "";
      const aberta = filtro || abertas.has(etapa);
      return `<details data-etapa="${esc(etapa)}" ${aberta ? "open" : ""}><summary>🙏 ${esc(etapa)} (${itens.length})${baixadas(etapa) ? ` <small>✓${baixadas(etapa)}</small>` : ""}<button type="button" class="lat-baixar" data-baixar-goc="${esc(etapa)}" title="Baixar as cifras que faltam desta etapa">⬇️</button></summary>${aberta ? `<ul class="catalogo">${itens.slice(0, 100).map(linhaGoc).join("")}</ul>` : ""}</details>`;
    }).join("") || '<p class="dica">Nenhuma música encontrada.</p>';
  }

  for (const id of ["#goc-etapa", "#goc-pasta"]) $(id).addEventListener("change", listarGoc);
  $("#goc-filtro").addEventListener("input", listarGoc);
  $("#lat-goc-filtro").addEventListener("input", renderLateralGoc);
  $("#lat-goc-lista").addEventListener("toggle", (e) => {
    const det = e.target;
    if (det.open && !det.querySelector("ul")) { renderLateralGoc(); }
  }, true);
  // Sugestão: uma sequência típica do grupo, sorteada entre as músicas de cada pasta
  const SEQUENCIA = ["Animação", "Animação", "Condução", "Espírito Santo", "Adoração", "Adoração", "Final"];
  let sugestao = [];
  const sortear = (etapa, fora) => {
    const opcoes = (goc || []).filter((m) => m.etapa === etapa && !fora.includes(m.url));
    return opcoes[Math.floor(Math.random() * opcoes.length)];
  };
  function renderSugestao() {
    $("#goc-sug").innerHTML = sugestao.length
      ? `<ol class="catalogo">${sugestao.map((m, i) => m ? `<li><b>${esc(SEQUENCIA[i])}</b>: ${linhaGoc(m).replace(/^<li>|<\/li>$/g, "")} <button type="button" data-sorteio="${i}" title="Trocar esta música">🔄</button></li>` : `<li><b>${esc(SEQUENCIA[i])}</b>: sem músicas</li>`).join("")}</ol>`
      : "";
  }
  $("#goc-sugerir").addEventListener("click", async () => {
    await carregarGoc();
    if (!goc) return;
    sugestao = [];
    SEQUENCIA.forEach((etapa) => sugestao.push(sortear(etapa, sugestao.filter(Boolean).map((m) => m.url))));
    renderSugestao();
  });
  $("#goc-sug").addEventListener("click", (e) => {
    const r = e.target.closest("button[data-sorteio]");
    if (r) { const i = +r.dataset.sorteio; sugestao[i] = sortear(SEQUENCIA[i], sugestao.filter(Boolean).map((m) => m.url)) || sugestao[i]; renderSugestao(); return; }
    levarGoc(e);
  });
  async function levarGoc(e) {
    const b = e.target.closest("button[data-goc]");
    if (!b) return;
    const parte = parteDaLista(b.dataset.etapa || "Outra");
    const adicionar = (m) => { rep.musicas.push(m); verDepois(m); b.disabled = true; salvar(); render(); };
    if (gocSalvas.has(b.dataset.goc)) {
      try {
        const [l] = await Nuvem.rest(`cifras_goc_cifras?select=titulo,artista,cifra&url=eq.${encodeURIComponent(b.dataset.goc)}`);
        if (l) {
          const m = novaMusica(parte, b.dataset.goc), textos = { Música: l.titulo, Artista: l.artista, Cifra: l.cifra };
          m.resultado = { ...textos, Posição: m.posicao, URL: m.url, Status: "OK", Erro: "", Original: textos, Editado: false };
          adicionar(m);
          aviso("Música adicionada.");
          return;
        }
      } catch { /* cai no Colar cifra */ }
    }
    if (b.dataset.mpm) { adicionar(novaMusica(parte, b.dataset.mpm)); buscarAutomatico(); return; } // mesma música no Músicas para Missa
    $("#colar-titulo").value = b.dataset.titulo;
    $("#colar-artista").value = b.dataset.artista;
    $("#colar-url").value = b.dataset.goc;
    document.querySelector('.aba[data-aba="aba-colar"]').click();
    renderPartes();
    $("#colar-parte").value = parte;
    $("#colar-cifra").focus();
  }
  // Baixa as cifras que faltam de uma etapa do Grupo de Oração (mesmo processo das pastas da Missa)
  async function baixarGoc(etapa) {
    if (baixando) { aviso("Já há um download em andamento."); return; }
    const faltam = (goc || []).filter((m) => m.etapa === etapa && !gocSalvas.has(m.url));
    if (!faltam.length) { aviso(`Todas as cifras de "${etapa}" já estão guardadas.`); return; }
    if (!window.confirm(`Baixar ${faltam.length} cifra(s) de "${etapa}" e guardar no Supabase?\nLeva uns ${Math.ceil(faltam.length * 1.2 / 60)} min e usa ${faltam.length} da cota diária de buscas (2000 por dia, somando todos).`)) return;
    baixando = true; parar = false;
    const st = $("#lat-goc-status"); st.hidden = false;
    let feitas = 0, falhas = 0, salvas = 0, pendentes = [], i = 0;
    const gravarLote = async () => {
      const lote = pendentes; pendentes = [];
      if (!lote.length) return;
      try {
        await Nuvem.rest("cifras_goc_cifras?on_conflict=url", { metodo: "POST", corpo: lote, prefer: "resolution=merge-duplicates,return=minimal" });
        lote.forEach((l) => gocSalvas.add(l.url)); salvas += lote.length;
      } catch { falhas += lote.length; }
    };
    const trabalhador = async () => {
      while (i < faltam.length && !parar) {
        const m = faltam[i++];
        try {
          const d = await chamarFuncao({ url: m.url_mpm || m.url });
          if (URL_GOC.test(m.url) && d.cifra.length >= 20) pendentes.push({ url: m.url, titulo: (d.titulo || m.titulo).slice(0, 200), artista: (d.artista || m.pasta).slice(0, 200), cifra: d.cifra.slice(0, 30000), atualizado: new Date().toISOString() });
        } catch (erro) {
          falhas += 1;
          if (/cota/.test(erro.message)) { parar = true; aviso("Download interrompido: " + erro.message); }
        }
        feitas += 1;
        st.firstElementChild.textContent = `⬇️ ${etapa}: ${feitas} de ${faltam.length}${falhas ? ` · ${falhas} sem cifra` : ""}`;
        if (pendentes.length >= 10) await gravarLote();
        await new Promise((ok) => setTimeout(ok, 600)); // ponytail: pausa fixa para não sobrecarregar o site de origem
      }
    };
    await Promise.all([trabalhador(), trabalhador()]);
    await gravarLote();
    baixando = false; st.hidden = true;
    renderLateralGoc(); listarGoc();
    aviso(`${etapa}: ${salvas} cifra(s) guardada(s)${falhas ? `; ${falhas} sem cifra (só letra, fora do ar ou cota)` : ""}.`);
  }
  $("#lat-goc-lista").addEventListener("click", (e) => {
    const bx = e.target.closest("button[data-baixar-goc]");
    if (bx) { e.preventDefault(); baixarGoc(bx.dataset.baixarGoc); }
  });
  $("#lat-goc-parar").addEventListener("click", () => { parar = true; });
  $("#goc-lista").addEventListener("click", levarGoc);
  $("#lat-goc-lista").addEventListener("click", levarGoc);

  // Sugestões do domingo (Músicas para Missa, pela função de busca)
  let missasCarregadas = false;
  const erroSug = (texto) => { $("#sug-erro").hidden = !texto; $("#sug-erro").textContent = texto || ""; };

  async function carregarMissas() {
    if (missasCarregadas) return;
    erroSug("");
    try {
      const { missas } = await chamarBusca({ missas: "1" });
      $("#sug-missa").innerHTML = missas.map((m) => `<option value="${esc(m.slug)}" data-rotulo="${esc([m.titulo, m.data].filter(Boolean).join(" - "))}">${esc(m.titulo)}${m.data ? " (" + esc(m.data) + ")" : ""}</option>`).join("")
        || '<option value="">Nenhuma missa listada</option>';
      missasCarregadas = missas.length > 0;
    } catch (erro) {
      $("#sug-missa").innerHTML = '<option value="">—</option>';
      erroSug("Não consegui carregar as missas: " + erro.message);
    }
  }

  $("#aba-sugestoes").addEventListener("submit", async (e) => {
    e.preventDefault();
    const sel = $("#sug-missa");
    if (!sel.value) return;
    erroSug("");
    $("#sug-lista").textContent = "Buscando…";
    try {
      const { partes: grupos } = await chamarBusca({ sugestoes: sel.value });
      $("#sug-lista").innerHTML = grupos.map((g) => `<h4>${esc(g.parte)}</h4><ul class="sugestoes">` + g.itens.map((i) =>
        `<li><button type="button" data-parte="${esc(g.parte)}" data-url="${esc(i.url)}" title="Adicionar à lista">➕</button> ${esc(i.titulo)}</li>`).join("") + "</ul>").join("")
        || "Nenhuma sugestão encontrada para essa missa.";
      if (!opcoes.missa) { opcoes.missa = sel.selectedOptions[0].dataset.rotulo; gravar(CHAVE.opcoes, opcoes); renderBaixar(); }
    } catch (erro) {
      $("#sug-lista").textContent = "";
      erroSug("Não consegui buscar as sugestões: " + erro.message);
    }
  });

  $("#sug-lista").addEventListener("click", (e) => {
    const botao = e.target.closest("button[data-url]");
    if (!botao) return;
    rep.musicas.push(novaMusica(parteDaLista(botao.dataset.parte), botao.dataset.url));
    verDepois(rep.musicas[rep.musicas.length - 1]);
    botao.disabled = true;
    salvar();
    render();
    buscarAutomatico();
  });

  // ---------------------------------------------------------------- Artistas e robô de cifras
  // robo = {ligado, seguidos:[artista], novas:[{titulo,artista,url}], vistas:[url], ultima:ms}
  const $r = (s) => $(s) || document.createElement("div"); // tolera index.html antigo em cache
  const CHAVE_ROBO = "cifras.robo";
  const robo = { ligado: false, seguidos: [], novas: [], vistas: [], ultima: 0, ...ler(CHAVE_ROBO, {}) };
  const vistas = new Set(robo.vistas);
  const gravarRobo = () => gravar(CHAVE_ROBO, { ...robo, vistas: [...vistas].slice(-3000) });
  const maiuscula = (s) => s.replace(/(^|\s)(\p{L})/gu, (_, e, c) => e + c.toUpperCase());
  const linhaArtista = (i) => `<li><button type="button" data-url="${esc(i.url)}" title="Adicionar à lista">+</button> ${esc(maiuscula(i.titulo))} <small>${esc(maiuscula(i.artista))}</small>${robo.novas.some((n) => n.url === i.url) ? ` <button type="button" data-ignorar="${esc(i.url)}" title="Não mostrar mais">✕</button>` : ""}</li>`;

  function renderRobo() {
    $r("#robo-liga").checked = robo.ligado;
    $r("#robo-seguidos").innerHTML = robo.seguidos.map((a) => `<span class="badge">${esc(a)} <button type="button" class="icone" data-tirar="${esc(a)}" aria-label="Deixar de seguir">✕</button></span>`).join(" ")
      || '<p class="dica">Nenhum artista seguido: digite o nome acima e clique em Seguir.</p>';
    $r("#robo-estado").textContent = robo.ultima ? "Última verificação: " + new Date(robo.ultima).toLocaleString("pt-BR") + (robo.novas.length ? "" : " — nenhuma cifra nova.") : "Ainda não rodou.";
    $r("#robo-novas").innerHTML = robo.novas.length
      ? `<h4>${robo.novas.length} cifras novas para aprovar</h4><button type="button" data-todas="1">Aprovar todas</button> <button type="button" data-ignorar="*">Ignorar todas</button><ul class="sugestoes">${robo.novas.map(linhaArtista).join("")}</ul>` : "";
  }

  const musicasDe = async (artista) => (await chamarBusca({ artista })).musicas;

  $r("#aba-artista").addEventListener("submit", async (e) => {
    e.preventDefault();
    const alvo = $r("#art-lista");
    alvo.textContent = "Buscando…";
    try {
      const l = await musicasDe($r("#art-nome").value.trim());
      alvo.innerHTML = l.length ? `<button type="button" data-todas="1">Adicionar todas (${l.length})</button><ul class="sugestoes">${l.map(linhaArtista).join("")}</ul>` : "Nenhuma cifra encontrada para esse artista.";
    } catch (erro) {
      alvo.textContent = "Não consegui buscar: " + erro.message;
    }
  });

  let roboRodando = false;
  async function rodarRobo() {
    if (roboRodando) return;
    const digitado = $r("#art-nome").value.trim();
    if (digitado && !robo.seguidos.some((a) => comparavel(a) === comparavel(digitado)) && robo.seguidos.length < 10) robo.seguidos.push(digitado);
    if (!robo.seguidos.length) { $r("#robo-estado").textContent = "Nada para verificar: digite um artista no campo acima e clique em Seguir."; return; }
    roboRodando = true;
    $r("#robo-estado").textContent = "Verificando…";
    for (const a of robo.seguidos) {
      try {
        for (const i of await musicasDe(a)) if (!vistas.has(i.url) && !robo.novas.some((n) => n.url === i.url)) robo.novas.push(i);
      } catch (erro) {
        if (FATAL.test(erro.message)) { aviso("Robô parou: " + erro.message); break; }
        aviso(`Robô: falha em "${a}": ${erro.message}`);
      }
    }
    robo.ultima = Date.now();
    roboRodando = false;
    gravarRobo();
    renderRobo();
    if (robo.novas.length) aviso(`Robô: ${robo.novas.length} cifras novas em Adicionar músicas > Artistas e robô.`);
  }

  $r("#robo-agora").addEventListener("click", rodarRobo);
  $r("#robo-liga").addEventListener("change", (e) => { robo.ligado = e.target.checked; gravarRobo(); if (robo.ligado) rodarRobo(); });
  $r("#art-seguir").addEventListener("click", () => {
    const nome = $r("#art-nome").value.trim();
    if (!nome || robo.seguidos.length >= 10 || robo.seguidos.some((a) => comparavel(a) === comparavel(nome))) { aviso("Informe um artista novo (máximo 10 seguidos)."); return; }
    robo.seguidos.push(nome);
    gravarRobo();
    renderRobo();
  });
  $r("#aba-artista").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-url],button[data-ignorar],button[data-tirar],button[data-todas]");
    if (!b) return;
    if (b.dataset.todas) {
      const urls = [...b.parentElement.querySelectorAll("button[data-url]")].map((x) => x.dataset.url);
      const parte = parteDaLista($r("#art-parte").value);
      urls.forEach((u) => { vistas.add(u); const m = novaMusica(parte, u); rep.musicas.push(m); verDepois(m); });
      robo.novas = robo.novas.filter((n) => !vistas.has(n.url));
      if (urls.length) { salvar(); render(); buscarAutomatico(); aviso(`${urls.length} músicas adicionadas.`); }
      if (b.parentElement.id === "art-lista") b.parentElement.innerHTML = "";
    } else if (b.dataset.tirar) robo.seguidos = robo.seguidos.filter((a) => a !== b.dataset.tirar);
    else {
      const urls = b.dataset.ignorar === "*" ? robo.novas.map((n) => n.url) : [b.dataset.url || b.dataset.ignorar];
      urls.forEach((u) => vistas.add(u));
      robo.novas = robo.novas.filter((n) => !vistas.has(n.url));
      if (b.dataset.url) {
        const m = novaMusica(parteDaLista($r("#art-parte").value), b.dataset.url);
        rep.musicas.push(m);
        verDepois(m);
        salvar();
        render();
        buscarAutomatico();
      }
    }
    gravarRobo();
    renderRobo();
  });
  renderRobo();
  setTimeout(() => { if (robo.ligado && Date.now() - robo.ultima > 6 * 36e5) rodarRobo(); }, 4000);
  setInterval(() => { if (robo.ligado && Date.now() - robo.ultima > 6 * 36e5) rodarRobo(); }, 30 * 6e4);

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
    guardarGoc(url, textos.Música, textos.Artista, cifra);
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
    else { partes.unshift(nome.split(/\s+/).join(" ")); gravar(chavePartes(), partes); }
    $("#nova-parte").value = "";
    render();
  });

  $("#btn-remover-parte").addEventListener("click", () => {
    const parte = $("#remover-parte").value;
    partes = partes.filter((p) => p !== parte);
    gravar(chavePartes(), partes);
    render();
  });

  $("#btn-restaurar-partes").addEventListener("click", () => {
    partes = PARTES_TIPO[tipoAtual()].slice();
    gravar(chavePartes(), partes);
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
  const temporizadoresSalvar = {};

  /** Salva sozinho depois que a pessoa para de digitar (sem redesenhar, para não perder o cursor) */
  function autoSalvar(m, det) {
    const t = textosEditor(m);
    if (!mudouEditor(m) || !t.cifra.trim()) return; // cifra vazia não é salva
    m.resultado = {
      ...(m.resultado || {}),
      Posição: m.posicao, URL: m.url,
      Música: t.titulo.trim(), Artista: t.artista.trim(), Cifra: t.cifra.trimEnd(),
      Status: "OK", Erro: "", Editado: true,
    };
    delete rascunhos[m.id];
    salvar();
    det.querySelector(".nao-salvo").hidden = true;
    det.querySelector('[data-acao="salvar"]').disabled = true;
    det.querySelector(".salvo-auto").hidden = false;
    if (previas.has(m.id)) atualizarPreviaMusica(m);
  }
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
    det.querySelector(".salvo-auto").hidden = true;
    clearTimeout(temporizadoresSalvar[m.id]);
    if (mudou) temporizadoresSalvar[m.id] = setTimeout(() => autoSalvar(m, det), 1200);
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

  for (const [id, campo] of [["#folheto-paroquia", "paroquia"], ["#folheto-missa", "missa"]]) {
    $(id).addEventListener("change", (e) => {
      opcoes[campo] = e.target.value.trim();
      gravar(CHAVE.opcoes, opcoes);
      render();
    });
  }

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
   * 1. abre/usa a aba do Músico Católico e pede a lista de links que ainda estão sem cifra;
   * 2. manda a cifra da página aberta e busca as outras do MESMO site (o site não bloqueia,
   *    porque o pedido sai da própria página dele), mandando uma por uma para cá.
   * Regras para caber num favorito: sem comentários de linha e com ";" em tudo,
   * porque o navegador junta as linhas do endereço do favorito.
   */
  function favorito(SITE, ORIGEM) {
    var HASH = String.fromCharCode(35);
    var w = window.open(SITE + HASH + "conectar-" + Date.now(), "cifras-missa");
    if (!w) { alert("O navegador bloqueou a janela do Músico Católico. Permita pop-ups para este site e tente de novo."); return; }
    var norm = function (u) {
      try { var x = new URL(u); return (x.hostname.replace(/^www[.]/, "") + x.pathname.replace(/[/]+$/, "")).toLowerCase(); } catch (e) { return u; }
    };
    var extrair = function (doc, url) {
      var p = doc.querySelector("pre");
      if (!p || p.textContent.trim().length < 20) { return null; }
      var t = doc.title.split(" - "), h = doc.querySelector("h1");
      return { url: url, titulo: (h ? h.textContent : doc.title).trim(), artista: /cifraclub/.test(location.hostname) && t.length >= 3 ? t[1].trim() : /cifras[.]com[.]br/.test(location.hostname) && t.length >= 2 ? t[1].split(" | ")[0].trim() : "", cifra: p.textContent };
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
        if (!conectado) { alert("Não consegui falar com o Músico Católico. Tente de novo."); }
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
  // Busca automática pelo servidor (função cifras-busca do Supabase, código em supabase/functions/cifras-busca).
  // - Link: tenta buscar a cifra direto do link (qualquer site, menos o CifraClub, que bloqueia servidores).
  // - Se não der, ou se for CifraClub, ou se só tiver o nome: procura pelo nome em vários sites
  //   (Músicas para Missa, Cifras.com.br, Banana Cifras e busca na web). A versão exata do CifraClub continua no favorito.
  const API_BUSCA = Nuvem.FUNCAO_BUSCA;
  const FATAL = /sem conexão|entre na sua conta|sessão|cota|autorizad/; // erros que valem para todas as músicas: para a busca
  const SITES_BLOQUEADOS = ["cifraclub.com.br"];
  const bloqueado = (url) => SITES_BLOQUEADOS.includes(hostDe(url));
  const automatico = (url) => !bloqueado(url);
  const buscavel = (m) => m.url || m.busca;
  let buscandoAutomatico = false;

  /** Usa a cifra guardada no Supabase (sem gastar busca no site); se não tiver, busca no site */
  async function chamarBusca(parametros) {
    if (parametros.url && acervo.has(parametros.url)) {
      try {
        const l = await Nuvem.rest(`cifras_acervo?select=titulo,artista,cifra&url=eq.${encodeURIComponent(parametros.url)}`);
        if (l && l[0]) return { url: parametros.url, ...l[0] };
      } catch { /* busca no site */ }
    }
    return chamarFuncao(parametros);
  }

  async function chamarFuncao(parametros) {
    const token = await Nuvem.token(); // opcional: a busca é aberta
    let r;
    try {
      r = await fetch(API_BUSCA + "?" + new URLSearchParams(parametros), token ? { headers: { Authorization: "Bearer " + token } } : {});
    } catch {
      throw new Error("sem conexão com o serviço de busca");
    }
    const dados = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error("sessão vencida: entre de novo na seção ☁️ Conta");
    if (r.status === 429) throw new Error("cota diária de buscas atingida; tente amanhã ou cole a cifra");
    if (!r.ok) throw new Error(dados.erro || `erro ${r.status}`);
    return dados;
  }

  /** Nome e artista a partir do link (ex.: cifraclub.com.br/banda-capella/gloria/) */
  function nomeDoLink(url) {
    const partes = new URL(url).pathname.split("/").filter((p) => p && !/^(musica|cifra|cifras|letra|letras)$/i.test(p));
    const texto = (s) => decodeURIComponent(s || "").replace(/[-_]+/g, " ");
    return { titulo: texto(partes[partes.length - 1]), artista: texto(partes[partes.length - 2]) };
  }
  const consulta = (m) => m.busca || nomeDoLink(m.url);

  /** Coloca na música a cifra achada em outro site, guardando de onde veio e as outras opções */
  function aplicarAlternativa(m, d, alternativas) {
    const textos = { Música: d.titulo.trim(), Artista: d.artista.trim(), Cifra: Layout.limparCifra(d.cifra) };
    m.resultado = {
      ...textos, Posição: m.posicao, URL: m.url, Status: "OK", Erro: "",
      Original: textos, Editado: false, Fonte: d.url, Alternativas: alternativas,
    };
    delete rascunhos[m.id];
  }

  /** Biblioteca primeiro (cifras já achadas antes); só depois os sites */
  async function buscarUma(m) {
    const { titulo, artista } = consulta(m);
    const salva = await Nuvem.daBiblioteca({ url: m.url, titulo, artista });
    if (salva) {
      if (salva.exata) receberCifra({ url: salva.url, titulo: salva.titulo, artista: salva.artista, cifra: salva.cifra }, { lote: true });
      else aplicarAlternativa(m, salva, [salva.url]);
      return;
    }
    await buscarNaWeb(m);
    Nuvem.guardar(m.resultado);
  }

  async function buscarNaWeb(m) {
    if (m.url && automatico(m.url)) {
      try {
        receberCifra(await chamarBusca({ url: m.url }), { lote: true });
        return;
      } catch (erro) {
        if (FATAL.test(erro.message)) throw erro;
        /* o link não deu certo: procura pelo nome nos outros sites */
      }
    }
    const { titulo, artista } = consulta(m);
    const { candidatos } = await chamarBusca({ titulo, artista });
    if (!candidatos.length) {
      throw new Error("não achei essa música nos sites pesquisados (Músicas para Missa, Cifras.com.br, Banana Cifras e busca na web); confira o nome, use o favorito ou cole a cifra");
    }
    // Tenta as melhores opções, em ordem, até uma ter cifra com acordes (algumas só têm a letra)
    for (const c of candidatos.slice(0, 6)) {
      try {
        aplicarAlternativa(m, await chamarBusca({ url: c.url }), candidatos.map((x) => x.url));
        return;
      } catch (erro) {
        if (FATAL.test(erro.message)) throw erro;
      }
    }
    throw new Error("achei a música, mas nenhuma opção tinha a cifra com acordes (só letra ou site fora do ar); use o favorito ou cole a cifra");
  }

  /** Move para a parte certa (pela letra) as músicas com cifra que estão em "Outras" */
  const emOutras = (m) => comCifra(m) && ["outras", "outra"].includes(comparavel(m.posicao));
  function classificarPelaLetra() {
    let n = 0;
    for (const m of rep.musicas.filter(emOutras)) {
      const p = Classificar.parte(m.resultado.Música, m.resultado.Cifra, partes);
      if (p && p !== m.posicao) { m.posicao = p; m.resultado.Posição = p; n += 1; }
    }
    if (n) { salvar(); render(); }
    return n;
  }

  async function buscarAutomatico() {
    const alvo = rep.musicas.filter((m) => !comCifra(m) && buscavel(m));
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
        if (FATAL.test(erro.message)) { aviso("Busca interrompida: " + erro.message); salvar(); render(); break; }
      }
      salvar();
      render();
    }
    buscandoAutomatico = false;
    const outroSite = alvo.filter((m) => m.resultado && m.resultado.Fonte).length;
    const movidas = classificarPelaLetra();
    mostrarProgresso(`✅ ${ok} de ${alvo.length} cifra(s) encontrada(s)` + (movidas ? ` · ${movidas} classificada(s) pela letra` : "")
      + (outroSite ? ` · ${outroSite} achada(s) pelo nome em outro site (confira a versão na seção 4)` : "")
      + (erros.length ? ` · não encontradas: ${erros.join(", ")} (use o favorito ou cole a cifra)` : ""));
    render();
    if (aVer) { const ed = document.querySelector(`#editores details[data-id="${aVer}"]`); aVer = null; if (ed) ed.scrollIntoView({ behavior: "smooth", block: "start" }); }
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
    const faltando = rep.musicas.filter((m) => buscavel(m) && !comCifra(m));
    const el = $("#botoes-sites");
    const outras = rep.musicas.filter(emOutras).length;
    const botaoClassificar = outras ? ` <button data-classificar="1">🎯 Classificar pela letra — ${outras} em "Outras"</button>` : "";
    if (!rep.musicas.some(buscavel)) { el.innerHTML = botaoClassificar; }
    else if (!faltando.length) { el.innerHTML = '<p class="aviso">✅ Todas as músicas com link ou nome já têm cifra.</p>' + botaoClassificar; }
    else {
      el.innerHTML = `<button class="primario" data-auto="1" ${buscandoAutomatico ? "disabled" : ""}>${faltando.some((m) => m.resultado && m.resultado.Status === "Erro") ? "🔁 Tentar de novo as sem cifra" : "⚡ Buscar cifras automaticamente"} — ${faltando.length} faltando</button>` + botaoClassificar;
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
    if (e.target.closest("button[data-classificar]")) {
      const n = classificarPelaLetra();
      mostrarProgresso(n ? `🎯 ${n} música(s) classificada(s) pela letra` : "🎯 Sem sinal suficiente na letra; escolha a parte à mão.");
    }
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
    guardarGoc(d.url, textos.Música, textos.Artista, textos.Cifra);
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
  Nuvem.iniciar({
    aoMudar: () => render(),
    /** Repertórios vindos da nuvem: vale o mais novo; os que só existem aqui sobem para a nuvem */
    aoReceber(lista) {
      let mudou = false;
      const remotos = new Set(lista.map((r) => r.nome));
      for (const r of lista) {
        const local = ler(CHAVE.prefixo + r.nome, null);
        if (local && (r.atualizado || 0) <= (local.atualizado || 0)) continue;
        gravar(CHAVE.prefixo + r.nome, r);
        mudou = true;
        if (r.nome === rep.nome) { rep = r; rascunhos = {}; }
      }
      for (const nome of nomesRepertorios()) if (!remotos.has(nome)) Nuvem.agendarEnvio(ler(CHAVE.prefixo + nome, null));
      if (mudou) { render(); aviso("Repertórios atualizados com a nuvem."); }
    },
    aoAbrirCopia(dados) {
      const nome = nomeLivre(dados.nome);
      rep = { ...dados, nome, musicas: dados.musicas.map((m) => ({ ...m, id: novoId() })) };
      rascunhos = {};
      salvar();
      render();
      aviso(`Cópia aberta: ${nome}`);
    },
  });

  $("#btn-palco").addEventListener("click", () => {
    const itens = prontas().map((r) => ({ titulo: r.Música, artista: r.Artista, cifra: r.Cifra }));
    if (!itens.length) { aviso("Ainda não há músicas com cifra."); return; }
    Palco.abrir(itens, 0);
  });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { /* sem modo offline */ });

  // ---------------------------------------------------------------- Barra lateral: pastas do catálogo e busca de repertórios
  const ordemPartes = (nomes) => nomes.sort((a, b) => {
    const ia = PARTES_PADRAO.indexOf(a), ib = PARTES_PADRAO.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, "pt-BR");
  });
  const itensPasta = (parte, filtro) => {
    const todas = ((catalogo || {})[parte] || []).filter((m) => !filtro || comparavel(m.titulo).includes(filtro));
    return `<ul>` + todas.slice(0, 100).map((m) => `<li><button type="button" data-parte="${esc(parte)}" data-url="${esc(m.url)}" title="Adicionar à lista e ver a cifra">➕</button>${esc(m.titulo)}</li>`).join("") + "</ul>"
      + (todas.length > 100 ? `<small>Mostrando 100 de ${todas.length}; use a busca.</small>` : "");
  };

  function renderLateral() {
    const el = $("#lat-lista");
    if (!catalogo || !Object.keys(catalogo).length) { el.innerHTML = '<p class="dica">Catálogo vazio. Abra "Catálogo" em Adicionar músicas e clique em Atualizar catálogo.</p>'; return; }
    const filtro = comparavel($("#lat-filtro").value);
    const abertas = new Set([...el.querySelectorAll("details[open]")].map((d) => d.dataset.parte));
    el.innerHTML = ordemPartes(Object.keys(catalogo)).map((parte) => {
      const n = catalogo[parte].filter((m) => !filtro || comparavel(m.titulo).includes(filtro)).length;
      if (!n) return "";
      const aberta = filtro || abertas.has(parte);
      const guardadas = catalogo[parte].filter((m) => acervo.has(m.url)).length;
      return `<details data-parte="${esc(parte)}" ${aberta ? "open" : ""}><summary>📁 ${esc(parte)} (${n})${guardadas ? ` <small>✓${guardadas}</small>` : ""}<button type="button" class="lat-baixar" data-baixar="${esc(parte)}" title="Baixar as cifras que faltam desta pasta">⬇️</button></summary>${aberta ? itensPasta(parte, filtro) : ""}</details>`;
    }).join("") || '<p class="dica">Nenhuma música encontrada.</p>';
  }

  function tituloDe(m) { return nomeMusica(m.resultado) || (m.busca && m.busca.titulo) || ""; }
  function renderLateralReps() {
    const el = $("#lat-rep-lista");
    const filtro = comparavel($("#lat-rep-filtro").value);
    el.innerHTML = nomesRepertorios().flatMap((nome) => {
      const dados = ler(CHAVE.prefixo + nome, null);
      const musicas = (dados && dados.musicas) || [];
      const achadas = filtro ? musicas.filter((m) => comparavel(tituloDe(m)).includes(filtro)).map(tituloDe) : [];
      if (filtro && !comparavel(nome).includes(filtro) && !achadas.length) return [];
      return [`<div class="lat-rep-linha"><button type="button" class="lat-rep" data-rep="${esc(nome)}"><b>${esc(nome)}</b><small>${musicas.length} música(s)${achadas.length ? " · " + esc(achadas.slice(0, 3).join(", ")) : ""}</small></button>`
        + `<button type="button" class="icone" data-ren="${esc(nome)}" title="Renomear">✏️</button><button type="button" class="icone" data-del="${esc(nome)}" title="Excluir">🗑️</button></div>`];
    }).join("") || '<p class="dica">Nenhum repertório encontrado.</p>';
  }

  $("#lat-filtro").addEventListener("input", renderLateral);
  $("#lat-rep-filtro").addEventListener("input", renderLateralReps);
  $("#lat-lista").addEventListener("toggle", (e) => {
    const det = e.target;
    if (det.open && !det.querySelector("ul")) det.insertAdjacentHTML("beforeend", itensPasta(det.dataset.parte, comparavel($("#lat-filtro").value)));
  }, true);
  $("#lat-lista").addEventListener("click", (e) => {
    const bx = e.target.closest("button[data-baixar]");
    if (bx) { e.preventDefault(); baixarPasta(bx.dataset.baixar); return; }
    const b = e.target.closest("button[data-url]");
    if (b) adicionarDoCatalogo(b);
  });
  $("#lat-parar").addEventListener("click", () => { parar = true; });

  // Acervo: baixa as cifras de uma pasta inteira para o Supabase (devagar: 3 por vez)
  async function carregarAcervo() {
    try {
      const urls = new Set();
      for (let i = 0; ; i += 1000) {
        const lote = await Nuvem.rest(`cifras_acervo?select=url&order=url&limit=1000&offset=${i}`);
        lote.forEach((l) => urls.add(l.url));
        if (lote.length < 1000) break;
      }
      acervo = urls;
    } catch { /* sem acervo ainda */ }
    renderLateral();
  }

  async function baixarPasta(parte) {
    if (baixando) { aviso("Já há um download em andamento."); return; }
    const faltam = ((catalogo || {})[parte] || []).filter((m) => !acervo.has(m.url));
    if (!faltam.length) { aviso(`Todas as cifras de "${parte}" já estão guardadas.`); return; }
    if (!window.confirm(`Baixar ${faltam.length} cifra(s) de "${parte}" do Músicas para Missa e guardar no Supabase?\nLeva uns ${Math.ceil(faltam.length * 0.7 / 60)} min e usa ${faltam.length} da cota diária de buscas.`)) return;
    baixando = true; parar = false;
    const st = $("#lat-status"); st.hidden = false;
    let feitas = 0, falhas = 0, salvas = 0, pendentes = [], i = 0;
    const gravarLote = async () => {
      const lote = pendentes; pendentes = [];
      if (!lote.length) return;
      try {
        await Nuvem.rest("cifras_acervo?on_conflict=url", { metodo: "POST", corpo: lote, prefer: "resolution=merge-duplicates,return=minimal" });
        lote.forEach((l) => acervo.add(l.url)); salvas += lote.length;
      } catch { falhas += lote.length; }
    };
    const trabalhador = async () => {
      while (i < faltam.length && !parar) {
        const m = faltam[i++];
        try {
          const d = await chamarFuncao({ url: m.url });
          pendentes.push({ url: m.url, titulo: (d.titulo || m.titulo).slice(0, 200), artista: (d.artista || "").slice(0, 200), cifra: d.cifra.slice(0, 30000) });
        } catch (erro) {
          falhas += 1;
          if (/cota/.test(erro.message)) { parar = true; aviso("Download interrompido: " + erro.message); }
        }
        feitas += 1;
        st.firstElementChild.textContent = `⬇️ ${parte}: ${feitas} de ${faltam.length}${falhas ? ` · ${falhas} sem cifra` : ""}`;
        if (pendentes.length >= 10) await gravarLote();
      }
    };
    await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
    await gravarLote();
    baixando = false; st.hidden = true;
    renderLateral();
    aviso(`${parte}: ${salvas} cifra(s) guardada(s)${falhas ? `; ${falhas} sem cifra (só letra, fora do ar ou cota)` : ""}.`);
  }
  function renomearRep(antigo, novo) {
    novo = (novo || "").trim();
    if (!novo || novo === antigo) return;
    if (nomesRepertorios().includes(novo)) { aviso(`Já existe um repertório chamado "${novo}". Escolha outro nome.`); return; }
    const d = rep.nome === antigo ? rep : ler(CHAVE.prefixo + antigo, null);
    if (!d) return;
    Nuvem.apagar(antigo);
    apagar(CHAVE.prefixo + antigo);
    d.nome = novo;
    d.atualizado = Date.now();
    gravar(CHAVE.prefixo + novo, d);
    if (d === rep) gravar(CHAVE.atual, novo);
    Nuvem.agendarEnvio(d);
    render();
    aviso(`Renomeado para "${novo}".`);
  }

  function excluirRep(nome) {
    if (!window.confirm(`Excluir o repertório "${nome}" deste navegador? Isso não pode ser desfeito.`)) return;
    Nuvem.apagar(nome);
    apagar(CHAVE.prefixo + nome);
    if (rep.nome === nome) {
      const restantes = nomesRepertorios();
      if (!(restantes.length && carregarRepertorio(restantes[0]))) novoRepertorio(false);
    }
    render();
  }

  $("#lat-rep-lista").addEventListener("click", (e) => {
    const ren = e.target.closest("button[data-ren]"), del = e.target.closest("button[data-del]"), b = e.target.closest("button[data-rep]");
    if (ren) renomearRep(ren.dataset.ren, window.prompt("Novo nome do repertório:", ren.dataset.ren));
    else if (del) excluirRep(del.dataset.del);
    else if (b && carregarRepertorio(b.dataset.rep)) { render(); aviso(`Repertório aberto: ${b.dataset.rep}`); }
  });

  // Recuar / ampliar a barra (a escolha fica guardada neste navegador)
  const CHAVE_LAT = "cifras.lat.recolhida";
  const recolher = (sim) => {
    document.body.classList.toggle("lat-recolhida", sim);
    $("#lat-recolher").textContent = sim ? "▶" : "◀";
    gravar(CHAVE_LAT, sim);
  };
  recolher(!!ler(CHAVE_LAT, false));
  $("#lat-recolher").addEventListener("click", () => recolher(!document.body.classList.contains("lat-recolhida")));
  document.querySelectorAll(".lat-aba").forEach((aba) => aba.addEventListener("click", () => {
    document.querySelectorAll(".lat-aba").forEach((a) => a.classList.toggle("ativa", a === aba));
    document.querySelectorAll(".lat-painel").forEach((p) => { p.hidden = p.id !== aba.dataset.lat; });
    if (aba.dataset.lat === "lat-goc") carregarGoc().then(renderLateralGoc);
  }));
  $("#lat-abrir").addEventListener("click", () => $("#lateral").classList.toggle("aberta"));

  receberDoFavorito();
  render();
  carregarCatalogo();
  carregarAcervo();
  carregarGoc();
  // ---------------------------------------------------------------- API para js/nav.js (menu, tipos e busca inicial)
  window.CM = {
    TIPOS,
    get rep() { return rep; },
    get partes() { return partes; },
    get catalogo() { return catalogo; },
    get goc() { return goc; },
    tipo: tipoAtual,
    novo(tipo, nome) { novoRepertorio(false, PARTES_TIPO[tipo] ? tipo : "Missa", nome); render(); },
    definirTipo(tipo) { if (PARTES_TIPO[tipo]) { rep.tipo = tipo; salvar(); render(); } },
    adicionar({ parte, url, busca }) {
      const m = novaMusica(parteDaLista(parte || partes[0]), url || "");
      if (!url && busca) m.busca = { titulo: busca.titulo, artista: busca.artista || "" };
      rep.musicas.push(m);
      verDepois(m);
      salvar();
      render();
      buscarAutomatico();
      aviso(`Adicionada em ${m.posicao}.`);
    },
  };
})();
