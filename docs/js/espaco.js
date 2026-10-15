/* Repertórios: busca, sugestões (tema ou domingo) e lista de músicas na mesma tela.
 * Carregado depois de nav.js (usa window.CM). Não duplica nada: move para cá, enquanto a aba está aberta,
 * as seções "Buscar música" e "Lista de músicas" do Início e os resultados da sugestão do Grupo de Oração. */
(function () {
"use strict";
const CM = window.CM;
const $ = (s) => document.querySelector(s);
const vista = (n) => $(`.vista[data-vista="${n}"]`);
const norm = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const vRep = vista("repertorios"), vIni = vista("inicio");
const busca = $("#busca-q")?.closest("section"), lista = $("#lista-musicas")?.closest("section");
if (!CM || !vRep || !vIni || !busca || !lista) return;

const sug = $("#lat-goc-sug"); // onde o app desenha o roteiro sugerido (também usado em Grupo de Oração)
const origem = sug && { pai: sug.parentNode, depois: sug.nextSibling };

const caixa = document.createElement("section");
caixa.className = "cartao";
caixa.id = "esp-sug";
caixa.hidden = !sug || !$("#lat-goc-sugerir"); // index.html antigo: sem a função de sugestão
caixa.innerHTML = `<h2 id="esp-titulo"></h2>
<div class="linha">
<label class="campo cresce"><span id="esp-rotulo"></span>
<input id="esp-tema" type="text" maxlength="80" autocomplete="off"></label>
<button type="button" id="esp-sugerir" class="primario">Sugerir músicas</button>
</div>
<p id="esp-dica" class="dica"></p>
<div id="esp-res" aria-live="polite"></div>`;

document.head.insertAdjacentHTML("beforeend", `<style>
#esp-res .catalogo{display:block;columns:1;list-style:none;margin:.5rem 0;padding:0}
#esp-res .catalogo li{display:flex;align-items:center;flex-wrap:wrap;gap:.5rem;padding:.3rem 0;border-bottom:1px solid rgba(0,0,0,.08)}
#esp-res ol.catalogo>li>b{min-width:8rem}
#esp-res h4{margin:1rem 0 .25rem}
</style>`);
// O app tira emojis dos botões; o de trocar a música sorteada ficaria vazio
const res = caixa.querySelector("#esp-res");
const rotular = () => res.querySelectorAll("button[data-sorteio]:empty").forEach((b) => { b.textContent = "Trocar"; });
new MutationObserver(rotular).observe(res, { childList: true, subtree: true, characterData: true });

function textos() {
const missa = CM.tipo() === "Missa";
$("#esp-titulo").textContent = missa ? "Sugestões do domingo" : "Sugestões por tema";
$("#esp-rotulo").textContent = missa ? "Domingo ou celebração (vazio = próxima missa)" : "Tema do encontro";
$("#esp-tema").placeholder = missa ? "Ex.: Cristo Rei, 30º domingo do tempo comum" : "Ex.: perdão, Espírito Santo, Maria, cura";
$("#esp-dica").textContent = missa
? "Sugere uma música para cada parte da Missa. O + adiciona na parte certa."
: "Sugere músicas do catálogo, por etapa, de acordo com o tema. O + adiciona na etapa; o botão de troca sorteia outra.";
}

// Enquanto "Repertórios" está aberta, busca + sugestões + lista ficam aqui; nas outras telas voltam para o lugar de origem
function montar() {
const aqui = !vRep.hidden;
if (aqui) vRep.append(busca, caixa, lista);
else if (!vIni.hidden) vIni.append(busca, lista);
if (sug) {
if (aqui) $("#esp-res").append(sug);
else if (sug.parentNode !== origem.pai) origem.pai.insertBefore(sug, origem.depois);
}
textos();
}
for (const v of [vRep, vIni]) new MutationObserver(montar).observe(v, { attributes: true, attributeFilter: ["hidden"] });
document.addEventListener("cm:render", textos);
vRep.append(caixa);
montar();

// Reaproveita o sorteio por tema/missa do dia que o app já tem
const roteiro = { "Missa": "missa", "Encontro": "encontro", "Grupo de Oração": "oracao" };
$("#esp-sugerir").addEventListener("click", () => {
$("#lat-goc-tipo").value = roteiro[CM.tipo()] || "oracao";
$("#lat-goc-tema").value = $("#esp-tema").value.trim();
$("#lat-goc-sugerir").click();
});
$("#esp-tema").addEventListener("keydown", (e) => {
if (e.key === "Enter") { e.preventDefault(); $("#esp-sugerir").click(); }
});

// Música do Grupo de Oração sem cifra guardada: em vez de levar para "Colar cifra", adiciona e busca a cifra pelo nome
caixa.addEventListener("click", (e) => {
const b = e.target.closest("button[data-goc]");
if (!b || b.dataset.mpm || !/^Levar/.test(b.title)) return;
e.stopImmediatePropagation();
const etapa = CM.partes.find((p) => norm(p) === norm(b.dataset.etapa)); // sem etapa igual, cai na 1ª parte
CM.adicionar({ parte: etapa, busca: { titulo: b.dataset.titulo, artista: b.dataset.artista } });
b.disabled = true;
}, true);
})();
