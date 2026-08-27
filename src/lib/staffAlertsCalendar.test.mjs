// A contagem dos alertas é em DIAS DE CALENDÁRIO do negócio, não em
// períodos de 24 horas e não na data UTC. As duas armadilhas são reais:
//
//   · à meia-noite local no Verão, Lisboa está em UTC+1, por isso a data
//     UTC ainda é a de ontem — ler `toISOString()` daria um dia a mais;
//   · o dia da mudança da hora tem 23 ou 25 horas, por isso dividir o
//     tempo decorrido por 24h dá 3,96 dias onde o calendário diz 4.
//
// Este ficheiro corre inteiramente em Europe/Lisbon.
process.env.TZ = "Europe/Lisbon";

import test from "node:test";
import assert from "node:assert/strict";
import { alertasDeEquipa, diasAte } from "./staffAlertsLogic.js";

// Portugal muda a hora no último domingo de Março e de Outubro:
// 2026-03-29 (01:00 → 02:00, dia de 23h) e 2026-10-25 (02:00 → 01:00,
// dia de 25h).
const local = (a, m, d, h = 12, min = 0) => new Date(a, m - 1, d, h, min);

test("o ficheiro corre mesmo em Europe/Lisbon", () => {
  assert.equal(local(2026, 6, 15).getTimezoneOffset(), -60, "Junho é WEST (UTC+1)");
  assert.equal(local(2026, 1, 15).getTimezoneOffset(), 0, "Janeiro é WET (UTC+0)");
});

test("à meia-noite local no Verão a contagem é a do calendário local, não a UTC", () => {
  // 2026-06-15 00:05 em Lisboa é ainda 2026-06-14 23:05 em UTC.
  const meiaNoite = local(2026, 6, 15, 0, 5);
  assert.equal(meiaNoite.toISOString().slice(0, 10), "2026-06-14", "premissa: a data UTC está atrasada um dia");
  assert.equal(diasAte("2026-06-22", meiaNoite), 7, "e mesmo assim faltam 7 dias, não 8");
  assert.equal(diasAte("2026-06-19", meiaNoite), 4, "e 4, não 5");
});

test("um minuto antes da meia-noite local dá a mesma contagem que um minuto depois do meio-dia", () => {
  assert.equal(diasAte("2026-06-22", local(2026, 6, 15, 23, 55)), 7);
  assert.equal(diasAte("2026-06-22", local(2026, 6, 15, 12, 1)), 7);
  assert.equal(diasAte("2026-06-22", local(2026, 6, 15, 0, 0)), 7);
});

test("exactamente 7 dias de calendário, e 8 não", () => {
  const hoje = local(2026, 6, 15);
  assert.equal(diasAte("2026-06-22", hoje), 7);
  assert.equal(diasAte("2026-06-23", hoje), 8);
});

test("exactamente 4 dias de calendário, e 5 não", () => {
  const hoje = local(2026, 6, 15);
  assert.equal(diasAte("2026-06-19", hoje), 4);
  assert.equal(diasAte("2026-06-20", hoje), 5);
});

test("a mudança para a hora de Verão não encolhe o intervalo", () => {
  // 26 de Março → 30 de Março atravessa o dia de 23 horas (29/03).
  const hoje = local(2026, 3, 26);
  const decorridas = (new Date(2026, 2, 30) - new Date(2026, 2, 26)) / 36e5;
  assert.equal(decorridas, 95, "premissa: são 95 horas, não 96");
  assert.equal(diasAte("2026-03-30", hoje), 4, "mas o calendário diz 4 dias");
  assert.equal(diasAte("2026-04-02", hoje), 7, "e 7 para o limiar da consulta");
});

test("a mudança para a hora de Inverno não estica o intervalo", () => {
  // 22 de Outubro → 26 de Outubro atravessa o dia de 25 horas (25/10).
  const hoje = local(2026, 10, 22);
  const decorridas = (new Date(2026, 9, 26) - new Date(2026, 9, 22)) / 36e5;
  assert.equal(decorridas, 97, "premissa: são 97 horas, não 96");
  assert.equal(diasAte("2026-10-26", hoje), 4, "e continuam a ser 4 dias");
  assert.equal(diasAte("2026-10-29", hoje), 7, "e 7 para o limiar da consulta");
});

test("os limiares disparam na mudança da hora, à meia-noite local", () => {
  const evento = (id, data) => ({ id, data_evento: data, status: "Recebido" });
  const tarefa = (id, eventoId) => ({
    id, submission_id: eventoId, minimum_people: 2, is_active: true,
  });
  // 00:10 de 26 de Março: em UTC ainda é dia 25.
  const hoje = local(2026, 3, 26, 0, 10);
  const cartoes = alertasDeEquipa({
    eventos: [evento("sete", "2026-04-02"), evento("quatro", "2026-03-30"), evento("oito", "2026-04-03")],
    tarefas: [tarefa("t1", "sete"), tarefa("t2", "quatro"), tarefa("t3", "oito")],
    coberturas: [{ submission_id: "quatro" }],
    atribuicoes: [],
    hoje,
  });
  const tipos = (id) => (cartoes.find((c) => c.evento.id === id)?.motivos ?? []).map((m) => m.tipo);
  assert.deepEqual(tipos("sete"), ["consulta"], "a 7 dias de calendário, através da mudança da hora");
  assert.deepEqual(tipos("quatro"), ["equipa"], "a 4 dias de calendário, através da mudança da hora");
  assert.equal(cartoes.find((c) => c.evento.id === "oito"), undefined, "a 8 dias, ainda não");
});

test("uma data que passou continua por resolver até o evento ser dado por concluído", () => {
  const hoje = local(2026, 6, 15);
  const porConcluir = { id: "e", data_evento: "2026-06-10", status: "Recebido" };
  const tarefas = [{ id: "t", submission_id: "e", minimum_people: 2, is_active: true }];
  const base = { tarefas, coberturas: [], atribuicoes: [], hoje };

  assert.equal(diasAte("2026-06-10", hoje), -5, "a contagem é negativa");
  const aberto = alertasDeEquipa({ eventos: [porConcluir], ...base });
  assert.equal(aberto.length, 1, "e o alerta continua de pé");
  assert.deepEqual(aberto[0].motivos.map((m) => m.tipo), ["consulta", "equipa"]);

  const concluido = alertasDeEquipa({
    eventos: [{ ...porConcluir, status: "Concluído" }], ...base,
  });
  assert.equal(concluido.length, 0, "só a conclusão explícita o cala");
});

test("uma data que passou através da mudança da hora conta na mesma", () => {
  // hoje 30 de Março, evento a 26 — o dia de 23h fica no meio.
  assert.equal(diasAte("2026-03-26", local(2026, 3, 30)), -4);
  assert.equal(diasAte("2026-10-22", local(2026, 10, 26)), -4);
});
