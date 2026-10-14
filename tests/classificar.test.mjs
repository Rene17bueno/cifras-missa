import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { parte } = createRequire(import.meta.url)("../docs/js/classificar.js");
const P = ["Animação", "Condução", "Espírito Santo", "Adoração", "Final", "Outras", "Pai Nosso", "Entrada"];

test("classifica pela letra e título", () => {
  assert.equal(parte("Vem Espírito Santo", "vem espirito santo, consolador", P), "Espírito Santo");
  assert.equal(parte("Pai Nosso", "Pai nosso que estais nos céus", P), "Pai Nosso");
  assert.equal(parte("Adoro-te", "adoro te devotamente, santissimo", P), "Adoração");
  assert.equal(parte("Bate palmas", "palmas e alegria, é festa", P), "Animação");
});
test("sem sinal ou parte inexistente: null", () => {
  assert.equal(parte("Qualquer", "lalala", P), null);
  assert.equal(parte("Pai Nosso", "pai nosso", ["Outras"]), null);
});
