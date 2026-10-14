// Palpite da parte da missa pela letra: palavras-chave no título (peso 3) e na letra (peso 1).
(function () {
  const norm = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // [nomes possíveis da parte (usa o 1º que existir na lista), palavras-chave]
  const REGRAS = [
    [["Pai Nosso"], ["pai nosso"]],
    [["Espírito Santo"], ["espirito santo", "vem espirito", "consolador", "paraclito", "pentecostes", "sopro", "derrama"]],
    [["Adoração", "Comunhão"], ["adoro", "adorar", "adoracao", "eucaristia", "corpo e sangue", "pao da vida", "hostia", "santissimo", "comungar", "comunhao", "ceia", "pao do ceu", "cordeiro", "santo santo", "santo e o senhor"]],
    [["Final"], ["despedida", "ide em paz", "vai em paz", "final", "missao", "ide", "enviados", "enviar"]],
    [["Entrada"], ["entrada", "reunidos", "casa do senhor", "viemos", "vinde", "bendito seja", "celebrar", "assembleia"]],
    [["Animação"], ["palmas", "alegria", "festa", "danca", "pular", "vitoria", "aleluia", "cantai", "exulta", "louvai"]],
    [["Condução"], ["conduz", "guia", "caminhar", "caminho", "luz", "pastor", "segue", "confio"]],
  ];

  /** Devolve a parte (do vetor 'partes') que mais combina, ou null se não houver sinal suficiente */
  function parte(titulo, cifra, partes) {
    const t = " " + norm(titulo || "") + " ", l = " " + norm(cifra || "") + " ";
    const tem = (texto, p) => (texto.match(new RegExp(`(^|[^a-z])${p}`, "g")) || []).length;
    let melhor = null, pontos = 1; // exige 2+ pontos
    for (const [nomes, chaves] of REGRAS) {
      const alvo = nomes.map((n) => partes.find((p) => norm(p) === norm(n))).find(Boolean);
      if (!alvo) continue;
      const soma = chaves.reduce((s, p) => s + 3 * Math.min(tem(t, p), 1) + Math.min(tem(l, p), 3), 0);
      if (soma > pontos) { pontos = soma; melhor = alvo; }
    }
    return melhor;
  }

  const api = { parte };
  if (typeof module !== "undefined") module.exports = api; else window.Classificar = api;
})();
