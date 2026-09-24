import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assinaturaComercial,
  logisticaEmVigor,
  logisticaLegadaValida,
  totalDoOrcamento,
  valoresDaFolha,
} from "./orcamentoLegado.js";
// o parser REAL do gerador (orcamentoConfig não importa nada — corre em node)
import { parsearValor as p } from "../components/admin/orcamentos/orcamentoConfig.js";

const linha = (uid, servicoId, valor, qtd = 1, extra = {}) => ({
  uid,
  servicoId,
  valor,
  qtd,
  descricao: "",
  inclui: [],
  ...extra,
});

// o modelo NOVO: sem logística, o total é a soma das linhas
const emVigor = (guardada, inicial, atual) =>
  logisticaEmVigor({
    guardada,
    assinaturaInicial: assinaturaComercial(inicial, p),
    assinaturaAtual: assinaturaComercial(atual, p),
  });

test("orçamento novo pequeno: 150 + deslocação 21 = 171, sem logística", () => {
  const ls = [linha("a", "espaco_fotografavel", "150"), linha("b", "deslocacao", "21")];
  const log = emVigor(null, ls, ls);
  assert.equal(log, null);
  assert.equal(totalDoOrcamento(ls, log, p), 171);
  assert.deepEqual(valoresDaFolha(ls, log, p), [150, 21]);
});

test("orçamento novo com vários serviços: 800/200/300/21 = 1321, sem repartição", () => {
  const ls = [
    linha("a", "decoracao_mesas", "800"),
    linha("b", "espaco_fotografavel", "200"),
    linha("c", "pacote_buffet", "300"),
    linha("d", "deslocacao", "21"),
  ];
  const log = emVigor(null, ls, ls);
  assert.equal(totalDoOrcamento(ls, log, p), 1321);
  assert.deepEqual(valoresDaFolha(ls, log, p), [800, 200, 300, 21]);
});

// um rascunho gravado antes de 24/09: 800 + 200 com os 25€ repartidos 20/5
const legado = [
  linha("a", "decoracao_mesas", "800"),
  linha("b", "espaco_fotografavel", "200"),
  linha("c", "pacote_buffet", "300"),
  linha("d", "deslocacao", "21"),
];
const logLegada = { total: 25, parcelas: [20, 5, 0, 0] };

test("rascunho legado só aberto: mantém a logística gravada, total e folha iguais", () => {
  const log = emVigor(logLegada, legado, legado);
  assert.equal(log, logLegada); // a gravada, nunca recalculada
  assert.equal(totalDoOrcamento(legado, log, p), 1346);
  assert.deepEqual(valoresDaFolha(legado, log, p), [820, 205, 300, 21]);
});

test("mudanças NÃO comerciais não migram o rascunho legado", () => {
  const texto = legado.map((l, i) =>
    i === 0 ? { ...l, descricao: "Outra descrição", inclui: ["x"], lugares: "40" } : l,
  );
  assert.equal(emVigor(logLegada, legado, texto), logLegada);
  // o mesmo preço escrito de outra forma continua a ser o mesmo preço
  const formato = legado.map((l, i) => (i === 0 ? { ...l, valor: "800,00" } : l));
  assert.equal(emVigor(logLegada, legado, formato), logLegada);
  // a deslocação muda de morada mas não de valor
  const morada = legado.map((l, i) =>
    i === 3 ? { ...l, deslocacao: { morada: "Cascais", distanciaKm: 26 } } : l,
  );
  assert.equal(emVigor(logLegada, legado, morada), logLegada);
});

test("a primeira edição comercial passa o legado ao modelo novo", () => {
  const edicoes = {
    valor: legado.map((l, i) => (i === 0 ? { ...l, valor: "900" } : l)),
    qtd: legado.map((l, i) => (i === 1 ? { ...l, qtd: 2 } : l)),
    servico: legado.map((l, i) => (i === 1 ? { ...l, servicoId: "livre" } : l)),
    juntar: [...legado, linha("e", "livre", "50")],
    remover: legado.slice(1),
    deslocacao: legado.map((l, i) => (i === 3 ? { ...l, valor: "0" } : l)), // oferecida
  };
  for (const [nome, ls] of Object.entries(edicoes)) {
    const log = emVigor(logLegada, legado, ls);
    assert.equal(log, null, nome);
    assert.deepEqual(
      valoresDaFolha(ls, log, p),
      ls.map((l) => Math.round(p(l.valor) * 100) / 100),
      nome,
    );
  }
  // 900 + 200 + 300 + 21, sem os 25
  assert.equal(totalDoOrcamento(edicoes.valor, null, p), 1421);
});

test("só conta a forma que os leitores históricos reconhecem (parcelas em array)", () => {
  assert.equal(logisticaLegadaValida(null), null);
  assert.equal(logisticaLegadaValida({ total: 25 }), null);
  assert.equal(logisticaLegadaValida({ total: 25, parcelas: "20,5" }), null);
  assert.equal(logisticaLegadaValida(logLegada), logLegada);
  assert.equal(emVigor({ total: 25 }, legado, legado), null);
});

test("legado com qtd > 1: o acerto dos cêntimos fica igual ao que a folha mostrava", () => {
  const ls = [linha("a", "livre", "100", 3), linha("b", "decoracao_mesas", "500")];
  const log = { total: 25, parcelas: [9, 16] };
  const vals = valoresDaFolha(ls, log, p);
  // 309/3 = 103 exactos; 516 na linha de qtd 1
  assert.deepEqual(vals, [103, 516]);
  assert.equal(vals[0] * 3 + vals[1], totalDoOrcamento(ls, log, p));
});
