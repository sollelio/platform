import test from "node:test";
import assert from "node:assert/strict";
import {
  alertasDeEquipa,
  diasAte,
  prazoEmPalavras,
  tarefasAbaixoDoMinimo,
} from "./staffAlertsLogic.js";

// Os limiares são o coração deste bloco e não se confirmam com os olhos:
// 7 e 4 têm de disparar EXACTAMENTE, e uma data passada não pode calar
// nada. `hoje` é injectado para os testes não dependerem do relógio.
//   node --test src/lib/staffAlertsLogic.test.mjs

const HOJE = new Date(2026, 8, 1); // 1 de Setembro de 2026, hora local
const emDias = (n) => {
  const d = new Date(2026, 8, 1 + n);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const evento = (id, dias, status = "Recebido") => ({
  id,
  data_evento: dias === null ? null : emDias(dias),
  status,
});
const tarefa = (id, eventoId, min = 2, is_active = true) => ({
  id,
  submission_id: eventoId,
  minimum_people: min,
  is_active,
});
const correr = (o) => alertasDeEquipa({ hoje: HOJE, ...o });
const tipos = (cartoes, id) =>
  (cartoes.find((c) => c.evento.id === id)?.motivos ?? []).map((m) => m.tipo);

test("diasAte conta dias de calendário e ignora a hora", () => {
  assert.equal(diasAte(emDias(7), HOJE), 7);
  assert.equal(diasAte(emDias(0), HOJE), 0);
  assert.equal(diasAte(emDias(-3), HOJE), -3);
  assert.equal(diasAte(null, HOJE), null);
});

test("o limiar da consulta é inclusivo: 7 dispara, 8 não", () => {
  const tarefas = [tarefa("t7", "e7"), tarefa("t8", "e8")];
  const c = correr({
    eventos: [evento("e7", 7), evento("e8", 8)],
    tarefas,
    coberturas: [],
    atribuicoes: [],
  });
  assert.deepEqual(tipos(c, "e7"), ["consulta"]);
  assert.equal(c.find((x) => x.evento.id === "e8"), undefined);
});

test("o limiar da equipa é inclusivo: 4 dispara, 5 não", () => {
  const eventos = [evento("e4", 4), evento("e5", 5)];
  const tarefas = [tarefa("t4", "e4"), tarefa("t5", "e5")];
  const coberturas = [{ submission_id: "e4" }, { submission_id: "e5" }];
  const c = correr({ eventos, tarefas, coberturas, atribuicoes: [] });
  assert.deepEqual(tipos(c, "e4"), ["equipa"]);
  assert.equal(c.find((x) => x.evento.id === "e5"), undefined);
});

test("uma consulta que cobre o evento resolve o alerta de consulta", () => {
  const base = {
    eventos: [evento("e", 5)],
    tarefas: [tarefa("t", "e")],
    atribuicoes: [],
  };
  assert.deepEqual(tipos(correr({ ...base, coberturas: [] }), "e"), ["consulta"]);
  assert.deepEqual(
    tipos(correr({ ...base, coberturas: [{ submission_id: "e" }] }), "e"),
    [],
  );
});

test("um evento sem tarefas diz que não há o que consultar, em vez de fingir", () => {
  const c = correr({
    eventos: [evento("e", 3)],
    tarefas: [],
    coberturas: [],
    atribuicoes: [],
  });
  assert.deepEqual(tipos(c, "e"), ["consulta-sem-tarefas"]);
  assert.match(c[0].motivos[0].texto, /Sem tarefas/);
});

test("mais gente do que o mínimo nunca é aviso", () => {
  const c = correr({
    eventos: [evento("e", 2)],
    tarefas: [tarefa("t", "e", 2)],
    coberturas: [{ submission_id: "e" }],
    atribuicoes: [
      { event_task_id: "t" },
      { event_task_id: "t" },
      { event_task_id: "t" },
    ],
  });
  assert.equal(c.length, 0);
});

test("menos gente do que o mínimo é aviso, e conta as tarefas", () => {
  const c = correr({
    eventos: [evento("e", 2)],
    tarefas: [tarefa("t1", "e", 2), tarefa("t2", "e", 3)],
    coberturas: [{ submission_id: "e" }],
    atribuicoes: [{ event_task_id: "t1" }],
  });
  assert.deepEqual(tipos(c, "e"), ["equipa"]);
  assert.match(c[0].motivos[0].texto, /^2 tarefas/);
});

test("uma tarefa desactivada não conta para o mínimo", () => {
  const abaixo = tarefasAbaixoDoMinimo(
    [tarefa("viva", "e", 2), tarefa("morta", "e", 5, false)],
    [],
  );
  assert.deepEqual(
    abaixo.map((t) => t.id),
    ["viva"],
  );
});

test("os dois motivos aparecem juntos, num só cartão por evento", () => {
  const c = correr({
    eventos: [evento("e", 3)],
    tarefas: [tarefa("t", "e", 2)],
    coberturas: [],
    atribuicoes: [],
  });
  assert.equal(c.length, 1, "um cartão, não dois");
  assert.deepEqual(tipos(c, "e"), ["consulta", "equipa"]);
});

test("um evento explicitamente concluído não produz alerta nenhum", () => {
  const c = correr({
    eventos: [evento("e", 1, "Concluído")],
    tarefas: [tarefa("t", "e", 2)],
    coberturas: [],
    atribuicoes: [],
  });
  assert.equal(c.length, 0);
});

test("uma data que passou NÃO conclui nada: o alerta por resolver continua", () => {
  const c = correr({
    eventos: [evento("e", -3)],
    tarefas: [tarefa("t", "e", 2)],
    coberturas: [],
    atribuicoes: [],
  });
  assert.equal(c.length, 1);
  assert.deepEqual(tipos(c, "e"), ["consulta", "equipa"]);
  assert.equal(c[0].dias, -3);
});

test("um evento sem data não produz alertas de dias — não se inventa a data", () => {
  const c = correr({
    eventos: [evento("e", null)],
    tarefas: [tarefa("t", "e", 2)],
    coberturas: [],
    atribuicoes: [],
  });
  assert.equal(c.length, 0);
});

test("sem permissão para ler consultas, não se inventa «falta consultar»", () => {
  const base = {
    eventos: [evento("e", 3)],
    tarefas: [tarefa("t", "e", 2)],
    coberturas: [],
    atribuicoes: [],
  };
  assert.deepEqual(tipos(correr({ ...base, podeVerConsultas: false }), "e"), [
    "equipa",
  ]);
  assert.deepEqual(tipos(correr({ ...base, podeVerAtribuicoes: false }), "e"), [
    "consulta",
  ]);
  assert.equal(
    correr({ ...base, podeVerConsultas: false, podeVerAtribuicoes: false })
      .length,
    0,
  );
});

test("os cartões saem do mais urgente para o menos", () => {
  const c = correr({
    eventos: [evento("tarde", 6), evento("cedo", 1), evento("passado", -2)],
    tarefas: ["tarde", "cedo", "passado"].map((e) => tarefa(`t-${e}`, e, 2)),
    coberturas: [],
    atribuicoes: [],
  });
  assert.deepEqual(
    c.map((x) => x.evento.id),
    ["passado", "cedo", "tarde"],
  );
});

test("a disponibilidade não entra na contagem do mínimo", () => {
  // duas pessoas escaladas numa tarefa de mínimo 2: coberta, independentemente
  // do que qualquer uma delas tenha respondido — que nem sequer é lido aqui
  const c = correr({
    eventos: [evento("e", 1)],
    tarefas: [tarefa("t", "e", 2)],
    coberturas: [{ submission_id: "e" }],
    atribuicoes: [{ event_task_id: "t" }, { event_task_id: "t" }],
  });
  assert.equal(c.length, 0);
});

test("o prazo lê-se em português, e o passado diz-se passado", () => {
  assert.equal(prazoEmPalavras(0), "é hoje");
  assert.equal(prazoEmPalavras(1), "é amanhã");
  assert.equal(prazoEmPalavras(4), "faltam 4 dias");
  assert.equal(prazoEmPalavras(-1), "foi ontem");
  assert.equal(prazoEmPalavras(-5), "foi há 5 dias");
});
