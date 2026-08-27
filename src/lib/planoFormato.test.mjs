import test from "node:test";
import assert from "node:assert/strict";
import {
  dataOperacional,
  formatarPlanoTexto,
  planosDoEvento,
} from "./planoFormato.js";

// O agrupamento por dia, a ordem das tarefas e o que sai no texto não se
// confirmam com os olhos. Datas em hora LOCAL de propósito: é assim que
// a app as mostra, e um plano com horas UTC seria um plano errado.
//   node --test src/lib/planoFormato.test.mjs

const emLocal = (dia, hora) => new Date(`${dia}T${hora}:00`).toISOString();

const evento = { titulo: "Casa & Jardim", local: "Quinta Exemplo", morada: null };
const membros = [
  { id: "p1", display_name: "Ana", is_active: true },
  { id: "p2", display_name: "Bruno", is_active: true },
  { id: "p3", display_name: "Carla", is_active: false },
];

// vespera 09:00 (montagem), dia 18:00 e 20:00, dia seguinte 10:00 (recolha)
const tarefas = [
  { id: "t-montagem", title: "Montagem", starts_at: emLocal("2026-09-11", "09:00"), ends_at: emLocal("2026-09-11", "13:00"), is_active: true, notes: "Levar escadote" },
  { id: "t-jantar", title: "Servico ao jantar", starts_at: emLocal("2026-09-12", "18:00"), ends_at: emLocal("2026-09-12", "23:00"), is_active: true, notes: null },
  { id: "t-bar", title: "Bar", starts_at: emLocal("2026-09-12", "20:00"), ends_at: null, is_active: true, notes: null },
  { id: "t-recolha", title: "Recolha", starts_at: emLocal("2026-09-13", "10:00"), ends_at: null, is_active: true, notes: null },
  { id: "t-outra", title: "Tarefa de outra gente", starts_at: emLocal("2026-09-12", "19:00"), ends_at: null, is_active: true, notes: null },
  { id: "t-morta", title: "Tarefa desactivada", starts_at: emLocal("2026-09-12", "17:00"), ends_at: null, is_active: false, notes: null },
];

const instrucoes = {
  standard_instructions: "TEXTO NORMAL DE TESTE",
  hot_weather_instructions: "TEXTO DE CALOR DE TESTE",
};

const atribuicoes = [
  { id: "a1", event_task_id: "t-montagem", staff_member_id: "p1" },
  { id: "a2", event_task_id: "t-jantar", staff_member_id: "p1" },
  { id: "a3", event_task_id: "t-jantar", staff_member_id: "p2" },
  { id: "a4", event_task_id: "t-bar", staff_member_id: "p1" },
  { id: "a5", event_task_id: "t-recolha", staff_member_id: "p1" },
  { id: "a6", event_task_id: "t-outra", staff_member_id: "p2" },
  { id: "a7", event_task_id: "t-morta", staff_member_id: "p1" },
];

const planos = () =>
  planosDoEvento({ evento, tarefas, atribuicoes, membros, instrucoes });
const daAna = () => planos().find((p) => p.pessoa.id === "p1");

test("a data operacional é o dia local em que a tarefa começa", () => {
  assert.equal(dataOperacional(emLocal("2026-09-11", "09:00")), "2026-09-11");
  assert.equal(dataOperacional(null), null);
});

test("uma pessoa escalada produz um plano; só quem está escalado tem plano", () => {
  const r = planos();
  assert.deepEqual(
    r.map((p) => p.pessoa.id),
    ["p1", "p2"],
  );
  assert.equal(r.find((p) => p.pessoa.id === "p3"), undefined);
});

test("um evento com trabalho em três dias é UM plano com três secções, por ordem", () => {
  const ana = daAna();
  assert.deepEqual(
    ana.dias.map((d) => d.data),
    ["2026-09-11", "2026-09-12", "2026-09-13"],
  );
});

test("as tarefas dentro de um dia saem por ordem cronológica", () => {
  const dia = daAna().dias.find((d) => d.data === "2026-09-12");
  assert.deepEqual(
    dia.tarefas.map((t) => t.titulo),
    ["Servico ao jantar", "Bar"],
  );
});

test("uma tarefa antes da data do evento aparece no seu próprio dia", () => {
  const d = daAna().dias[0];
  assert.equal(d.data, "2026-09-11");
  assert.equal(d.tarefas[0].titulo, "Montagem");
});

test("uma tarefa depois da data do evento também", () => {
  const d = daAna().dias.at(-1);
  assert.equal(d.data, "2026-09-13");
  assert.equal(d.tarefas[0].titulo, "Recolha");
});

test("uma tarefa a que a pessoa não está escalada nunca aparece no plano dela", () => {
  const titulos = daAna().dias.flatMap((d) => d.tarefas.map((t) => t.titulo));
  assert.ok(!titulos.includes("Tarefa de outra gente"));
});

test("uma tarefa desactivada deixa de ser trabalho e sai do plano", () => {
  const titulos = daAna().dias.flatMap((d) => d.tarefas.map((t) => t.titulo));
  assert.ok(!titulos.includes("Tarefa desactivada"));
});

test("os colegas são só quem está na MESMA tarefa, e nunca a própria pessoa", () => {
  const ana = daAna();
  const jantar = ana.dias
    .flatMap((d) => d.tarefas)
    .find((t) => t.titulo === "Servico ao jantar");
  assert.deepEqual(jantar.colegas, ["Bruno"]);
  const bar = ana.dias.flatMap((d) => d.tarefas).find((t) => t.titulo === "Bar");
  assert.deepEqual(bar.colegas, []);
});

test("o plano de uma pessoa não mostra as outras tarefas dos colegas", () => {
  const bruno = planos().find((p) => p.pessoa.id === "p2");
  const titulos = bruno.dias.flatMap((d) => d.tarefas.map((t) => t.titulo));
  assert.deepEqual(titulos.sort(), ["Servico ao jantar", "Tarefa de outra gente"]);
  assert.ok(!titulos.includes("Montagem"));
});

test("quem está inactivo mas escalado continua a aparecer — a atribuição não desaparece", () => {
  const comInactiva = planosDoEvento({
    evento,
    tarefas,
    atribuicoes: [
      ...atribuicoes,
      { id: "a8", event_task_id: "t-jantar", staff_member_id: "p3" },
    ],
    membros,
    instrucoes,
  });
  const carla = comInactiva.find((p) => p.pessoa.id === "p3");
  assert.ok(carla, "a pessoa inactiva tem plano");
  assert.equal(carla.dias[0].tarefas[0].titulo, "Servico ao jantar");
  const ana = comInactiva.find((p) => p.pessoa.id === "p1");
  const jantar = ana.dias.flatMap((d) => d.tarefas).find((t) => t.titulo === "Servico ao jantar");
  assert.deepEqual(jantar.colegas, ["Bruno", "Carla"]);
});

test("a disponibilidade não entra na projecção — nada aqui a lê sequer", () => {
  // sem qualquer resposta no input, os planos são exactamente os mesmos
  const semRespostas = planosDoEvento({ evento, tarefas, atribuicoes, membros, instrucoes });
  assert.equal(semRespostas.length, 2);
  assert.equal(semRespostas.find((p) => p.pessoa.id === "p1").dias.length, 3);
});

test("o texto guarda a hierarquia: cabeçalho, evento, pessoa, dia, tarefas, colegas, indicações", () => {
  const txt = formatarPlanoTexto(daAna());
  assert.match(txt, /^PLANO DE TRABALHO\n/);
  assert.match(txt, /Evento: Casa & Jardim/);
  assert.match(txt, /Local: Quinta Exemplo/);
  assert.match(txt, /Para: Ana/);
  assert.match(txt, /- 09:00–13:00 · Montagem/);
  assert.match(txt, /\n {2}Levar escadote/);
  assert.match(txt, /\n {2}Com: Bruno/);
  assert.match(txt, /INDICAÇÕES DA EQUIPA\nTEXTO NORMAL DE TESTE/);
  assert.match(txt, /EM DIAS DE MUITO CALOR\nTEXTO DE CALOR DE TESTE/);
  assert.ok(!txt.includes("*"), "sem markdown: o significado não depende de estilos");
  assert.ok(!txt.includes("<"), "sem HTML");
});

test("uma tarefa sem fim marcado imprime só a hora de início", () => {
  const txt = formatarPlanoTexto(daAna());
  assert.match(txt, /- 20:00 · Bar/);
});

test("as secções de dia saem por ordem no texto", () => {
  const txt = formatarPlanoTexto(daAna());
  const pos = ["Montagem", "Servico ao jantar", "Bar", "Recolha"].map((t) =>
    txt.indexOf(t),
  );
  assert.ok(pos.every((p) => p > 0), "todas as tarefas aparecem no texto");
  assert.deepEqual(
    pos.slice().sort((a, b) => a - b),
    pos,
    "e aparecem por ordem cronológica",
  );
});

test("sem indicações escritas, o texto não inventa secções vazias", () => {
  const txt = formatarPlanoTexto({ ...daAna(), instrucoes: null });
  assert.ok(!txt.includes("INDICAÇÕES DA EQUIPA"));
  assert.ok(!txt.includes("EM DIAS DE MUITO CALOR"));
});

test("só a contingência escrita aparece, se for a única", () => {
  const txt = formatarPlanoTexto({
    ...daAna(),
    instrucoes: { standard_instructions: null, hot_weather_instructions: "SÓ CALOR" },
  });
  assert.ok(!txt.includes("INDICAÇÕES DA EQUIPA"));
  assert.match(txt, /EM DIAS DE MUITO CALOR\nSÓ CALOR/);
});

test("dois eventos dão dois planos distintos à mesma pessoa — nunca um combinado", () => {
  const outroEvento = { titulo: "Outro Evento", local: null, morada: null };
  const tarefasB = [
    { id: "tb1", title: "Servico", starts_at: emLocal("2026-10-03", "19:00"), ends_at: null, is_active: true, notes: null },
  ];
  const a = daAna();
  const b = planosDoEvento({
    evento: outroEvento,
    tarefas: tarefasB,
    atribuicoes: [{ id: "b1", event_task_id: "tb1", staff_member_id: "p1" }],
    membros,
    instrucoes,
  })[0];
  assert.equal(a.evento.titulo, "Casa & Jardim");
  assert.equal(b.evento.titulo, "Outro Evento");
  assert.equal(a.dias.length, 3);
  assert.equal(b.dias.length, 1);
  const txtA = formatarPlanoTexto(a);
  assert.ok(!txtA.includes("Outro Evento"), "um plano nunca mistura eventos");
});
