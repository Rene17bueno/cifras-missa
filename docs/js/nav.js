/* Menu, tipos de repertório e busca da tela inicial. Carregado depois de app.js (usa window.CM). */
(function () {
  "use strict";
  const CM = window.CM;
  if (!CM) return;

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const norm = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const ICONE = { "Missa": "⛪", "Grupo de Oração": "🙏", "Encontro": "👥" };
  const LIMITE = 30;

  // ---------------------------------------------------------------- Menu
  function ir(vista) {
    if (!document.querySelector(`.vista[data-vista="${vista}"]`)) vista = "inicio";
    document.querySelectorAll(".vista").forEach((v) => { v.hidden = v.dataset.vista !== vista; });
    document.querySelectorAll(".menu-item").forEach((b) => b.classList.toggle("ativa", b.dataset.ir === vista));
    window.scrollTo(0, 0);
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ir]");
    if (b) ir(b.dataset.ir);
  });

  // ---------------------------------------------------------------- Busca (catálogo + grupo de oração, já carregados pelo app)
  let cache = { cat: null, ng: -1, itens: [] };
  function indice() {
    const cat = CM.catalogo, goc = CM.goc || [];
    if (cache.cat !== cat || cache.ng !== goc.length) {
      const itens = [];
      for (const [parte, lista] of Object.entries(cat || {}))
        for (const m of lista) itens.push({ titulo: m.titulo, url: m.url, parte, fonte: "Músicas para Missa", hay: norm(m.titulo) });
      const vistos = new Set(itens.map((i) => i.url));
      for (const m of goc)
        if (!(m.url_mpm && vistos.has(m.url_mpm)))
          itens.push({ titulo: m.titulo, artista: m.pasta, url: m.url_mpm || "", parte: m.etapa || "", fonte: "Grupo de Oração", hay: norm(m.titulo + " " + m.pasta) });
      cache = { cat, ng: goc.length, itens };
    }
    return cache.itens;
  }

  function buscar(q) {
    const t = norm(q).split(/\s+/).filter(Boolean);
    if (!t.length) return [];
    const ini = (i) => norm(i.titulo).startsWith(t[0]);
    return indice().filter((i) => t.every((w) => i.hay.includes(w)))
      .sort((a, b) => ini(b) - ini(a) || a.titulo.localeCompare(b.titulo, "pt-BR"));
  }

  const parteAuto = (p) => {
    const igual = CM.partes.find((x) => norm(x) === norm(p));
    if (igual) return igual;
    return CM.tipo() === "Missa" ? (p === "Outras" ? "Outra" : p) : CM.partes[0]; // Missa mantém a pasta do catálogo; os outros tipos usam a 1ª parte
  };

  let achados = [], tentativas = 0, timer = 0;
  function desenhar() {
    const q = $("#busca-q").value.trim(), el = $("#busca-res");
    achados = [];
    if (q.length < 2) { el.innerHTML = '<p class="dica">Digite pelo menos 2 letras (música ou artista) ou cole um link. ➕ coloca no repertório aberto.</p>'; return; }
    if (/^https?:\/\//i.test(q)) {
      el.innerHTML = `<ul class="resultados"><li><button type="button" class="primario" data-link>➕ Adicionar este link</button><span class="tit">${esc(q)}</span></li></ul>`;
      return;
    }
    achados = buscar(q);
    const tem = (a) => a.url && CM.rep.musicas.some((m) => m.url === a.url);
    const carregando = !CM.catalogo && tentativas++ < 20;
    if (carregando) { clearTimeout(timer); timer = setTimeout(desenhar, 1500); }
    el.innerHTML = (carregando ? '<p class="dica">⏳ Catálogo carregando…</p>' : "") + '<ul class="resultados">'
      + achados.slice(0, LIMITE).map((a, i) => `<li><button type="button" class="primario" data-i="${i}" ${tem(a) ? "disabled" : ""}>${tem(a) ? "✓ Na lista" : "➕ Adicionar"}</button>`
        + `<span class="tit"><b>${esc(a.titulo)}</b> <small>${esc(a.fonte)}${a.artista ? " · " + esc(a.artista) : ""}${a.parte ? " · " + esc(a.parte) : ""}</small></span></li>`).join("")
      + `<li><button type="button" data-web>🌐 Buscar “${esc(q)}” nos sites</button><span class="tit"><small>Cifras.com.br, Músicas para Missa e web; adiciona e traz a cifra</small></span></li></ul>`
      + (achados.length > LIMITE ? `<p class="dica">Mostrando ${LIMITE} de ${achados.length}. Refine a busca.</p>` : "");
  }

  $("#busca-q").addEventListener("input", () => { tentativas = 0; desenhar(); });
  $("#busca-res").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const q = $("#busca-q").value.trim(), parte = $("#busca-parte").value;
    if (b.hasAttribute("data-link")) CM.adicionar({ parte, url: q });
    else if (b.hasAttribute("data-web")) CM.adicionar({ parte, busca: { titulo: q } });
    else if (achados[+b.dataset.i]) {
      const a = achados[+b.dataset.i];
      CM.adicionar({ parte: parte || parteAuto(a.parte), url: a.url, busca: { titulo: a.titulo, artista: a.artista || "" } });
    }
  });

  // ---------------------------------------------------------------- Estado do repertório na tela
  function sincronizar() {
    const r = CM.rep;
    if (!r) return;
    const tipo = CM.tipo();
    $("#badge-rep").textContent = `${ICONE[tipo]} ${tipo} · ${r.nome}`;
    $("#inicio-status").textContent = `${r.musicas.length} música(s) na lista`;
    $("#tipo-repertorio").value = tipo;
    const sel = $("#busca-parte"), atual = sel.value;
    sel.innerHTML = '<option value="">Automática</option>' + CM.partes.map((p) => `<option>${esc(p)}</option>`).join("");
    if (CM.partes.includes(atual)) sel.value = atual;
    desenhar();
  }
  document.addEventListener("cm:render", sincronizar);
  $("#tipo-repertorio").addEventListener("change", (e) => CM.definirTipo(e.target.value));

  // ---------------------------------------------------------------- Novo repertório (escolha do tipo)
  const dlg = $("#dlg-novo");
  CM.pedirTipo = () => { dlg.querySelector("form").reset(); dlg.showModal(); };
  $("#inicio-novo").addEventListener("click", CM.pedirTipo);
  dlg.querySelector("form").addEventListener("submit", (e) => {
    if (!e.submitter || e.submitter.value !== "criar") return;
    CM.novo(dlg.querySelector("input[name=tipo]:checked").value, $("#novo-nome").value.trim());
    ir("inicio");
  });

  // ---------------------------------------------------------------- Ajustes de navegação entre seções
  // Resumo "N de M com cifra" também na tela inicial
  const copiarResumo = () => {
    const t = $("#resumo-cifras").textContent;
    $("#resumo-inicio-txt").textContent = t;
    $("#resumo-inicio").hidden = !t;
  };
  new MutationObserver(copiarResumo).observe($("#resumo-cifras"), { childList: true, characterData: true, subtree: true });
  copiarResumo();

  // ➕ de música do Grupo de Oração sem cifra guardada leva para "Colar cifra" (em Adicionar música)
  $("#lat-goc-lista").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-goc]");
    if (!b) return;
    const fim = Date.now() + 2500;
    const iv = setInterval(() => {
      if ($("#colar-titulo").value === b.dataset.titulo) { ir("adicionar"); clearInterval(iv); }
      else if (Date.now() > fim) clearInterval(iv);
    }, 150);
  });

  // O favorito "Enviar cifra" abre esta página com #conectar-…: mostra o andamento na seção Cifras
  const volta = () => { if (/^#conectar/.test(location.hash)) ir("cifras"); };
  window.addEventListener("hashchange", volta);
  volta();

  sincronizar();
})();
