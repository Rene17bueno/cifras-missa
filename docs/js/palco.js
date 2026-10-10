/*
 * Modo palco: cifra em tela cheia, fonte grande, rolagem automática, troca de tom e passagem entre músicas.
 * Mantém a tela acesa (quando o navegador permite). Palco.abrir([{titulo, artista, cifra}], indiceInicial)
 */
const Palco = (function () {
  "use strict";

  const CSS = `
  #palco{position:fixed;inset:0;z-index:1000;background:#111;color:#f5f5f5;display:flex;flex-direction:column}
  #palco .barra{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;padding:.5rem;background:#222;border-bottom:1px solid #444}
  #palco .barra button,#palco .barra input{font-size:1rem}
  #palco .barra button{min-width:2.6rem;min-height:2.6rem;border-radius:.4rem;border:1px solid #666;background:#333;color:#fff;cursor:pointer}
  #palco .titulo{flex:1;min-width:10rem;font-weight:700}
  #palco .titulo small{display:block;font-weight:400;color:#bbb}
  #palco pre{flex:1;margin:0;padding:1rem;overflow:auto;white-space:pre;font-family:ui-monospace,Consolas,monospace;line-height:1.35}
  `;

  let el = null, lista = [], i = 0, extra = 0, tamanho = 22, velocidade = 0, rolando = false;
  let posicao = 0, ultimo = 0, quadro = null, trava = null;

  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function estilo() {
    if (document.getElementById("palco-css")) return;
    const s = document.createElement("style");
    s.id = "palco-css"; s.textContent = CSS;
    document.head.appendChild(s);
  }

  function textoAtual() {
    const m = lista[i];
    return extra ? Transpor.transpor(m.cifra, extra) : m.cifra;
  }

  function rotuloTom() {
    const tom = Transpor.tomDaCifra(lista[i].cifra);
    return tom ? Transpor.rotuloTom(tom.indice + extra, tom.menor) : "";
  }

  function desenhar() {
    const m = lista[i];
    el.querySelector(".titulo").innerHTML = `${esc(m.titulo)}<small>${esc(m.artista)} · ${i + 1}/${lista.length}${rotuloTom() ? " · Tom " + esc(rotuloTom()) : ""}</small>`;
    const pre = el.querySelector("pre");
    pre.textContent = textoAtual();
    pre.style.fontSize = tamanho + "px";
    el.querySelector("[data-a=rolar]").textContent = rolando ? "⏸" : "⏯";
  }

  function ir(delta) {
    const novo = i + delta;
    if (novo < 0 || novo >= lista.length) return;
    i = novo; extra = 0; posicao = 0;
    el.querySelector("pre").scrollTop = 0;
    desenhar();
  }

  function passo(ts) {
    quadro = requestAnimationFrame(passo);
    const pre = el.querySelector("pre");
    if (rolando) {
      posicao += velocidade * (ts - ultimo) / 1000;
      pre.scrollTop = posicao;
      if (pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 1) { rolando = false; desenhar(); }
    } else posicao = pre.scrollTop;
    ultimo = ts;
  }

  function teclado(e) {
    if (e.key === "Escape") fechar();
    else if (e.key === "ArrowRight") ir(1);
    else if (e.key === "ArrowLeft") ir(-1);
    else if (e.key === "+" || e.key === "=") { tamanho = Math.min(60, tamanho + 2); desenhar(); }
    else if (e.key === "-") { tamanho = Math.max(10, tamanho - 2); desenhar(); }
  }

  function fechar() {
    if (!el) return;
    cancelAnimationFrame(quadro);
    document.removeEventListener("keydown", teclado);
    document.body.style.overflow = "";
    if (trava) { trava.release().catch(() => {}); trava = null; }
    el.remove(); el = null;
  }

  async function abrir(itens, indice = 0) {
    if (!itens.length || el) return;
    estilo();
    lista = itens; i = Math.min(Math.max(indice, 0), itens.length - 1); extra = 0; rolando = false; posicao = 0;
    el = document.createElement("div");
    el.id = "palco";
    el.innerHTML = `<div class="barra">
        <button data-a="fechar" title="Fechar (Esc)">✕</button>
        <button data-a="ant" title="Música anterior">◀</button>
        <div class="titulo"></div>
        <button data-a="prox" title="Próxima música">▶</button>
        <button data-a="menos" title="Fonte menor">A−</button>
        <button data-a="mais" title="Fonte maior">A+</button>
        <button data-a="tom-" title="Meio tom abaixo">♭½</button>
        <button data-a="tom+" title="Meio tom acima">♯½</button>
        <button data-a="rolar" title="Rolagem automática">⏯</button>
        <input data-a="vel" type="range" min="5" max="80" value="20" title="Velocidade da rolagem" aria-label="Velocidade da rolagem">
      </div><pre></pre>`;
    velocidade = 20;
    el.addEventListener("click", (e) => {
      const a = e.target.closest("[data-a]");
      if (!a) return;
      const acao = a.dataset.a;
      if (acao === "fechar") fechar();
      else if (acao === "ant") ir(-1);
      else if (acao === "prox") ir(1);
      else if (acao === "mais") { tamanho = Math.min(60, tamanho + 2); desenhar(); }
      else if (acao === "menos") { tamanho = Math.max(10, tamanho - 2); desenhar(); }
      else if (acao === "tom+") { extra += 1; desenhar(); }
      else if (acao === "tom-") { extra -= 1; desenhar(); }
      else if (acao === "rolar") { rolando = !rolando; posicao = el.querySelector("pre").scrollTop; desenhar(); }
    });
    el.querySelector("[data-a=vel]").addEventListener("input", (e) => { velocidade = Number(e.target.value); });
    document.body.appendChild(el);
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", teclado);
    desenhar();
    quadro = requestAnimationFrame((ts) => { ultimo = ts; passo(ts); });
    try { if (navigator.wakeLock) trava = await navigator.wakeLock.request("screen"); } catch { /* sem trava de tela */ }
  }

  return { abrir, fechar };
})();
