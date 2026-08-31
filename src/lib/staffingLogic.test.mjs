import test from "node:test";
import assert from "node:assert/strict";
import {
  coberturaDaJanela,
  estadoDaPessoa,
  posicaoDaTarefa,
} from "./staffingLogic.js";

// As decisões subtis do Bloco 5 são de JavaScript puro: o que conta como
// conflito, o que conta como cobertura, e quem aparece na lista de quem
// disse que podia. A base garante o resto; isto garante isto.
//   node --test src/lib/assignments.test.mjs

const tarefa = {
  id: "t1",
  minimum_people: 2,
  starts_at: "2026-09-12T18:00:00.000Z",
  ends_at: "2026-09-12T23:00:00.000Z",
};
const semFim = { ...tarefa, id: "t2", ends_at: null };

const pessoa = (id, extra = {}) => ({
  id,
  display_name: id,
  is_active: true,
  may_be_consulted: true,
  ...extra,
});

const contexto = (pares) => ({
  consultadas: new Set(pares.map(([p]) => p)),
  respostas: new Map(
    pares.filter(([, r]) => r).map(([p, r]) => [`t1:${p}`, r]),
  ),
});

test("uma janela sem lados é ilimitada dos dois", () => {
  assert.equal(coberturaDaJanela(tarefa, { state: "partial" }), "cobre");
});

test("um limite inferior depois do início não cobre", () => {
  assert.equal(
    coberturaDaJanela(tarefa, { state: "partial", de: "2026-09-12T20:00:00.000Z" }),
    "nao-cobre",
  );
});

test("um limite inferior antes do início cobre", () => {
  assert.equal(
    coberturaDaJanela(tarefa, { state: "partial", de: "2026-09-12T17:00:00.000Z" }),
    "cobre",
  );
});

test("um limite superior antes do fim não cobre", () => {
  assert.equal(
    coberturaDaJanela(tarefa, { state: "partial", ate: "2026-09-12T21:00:00.000Z" }),
    "nao-cobre",
  );
});

test("um limite superior depois do fim cobre", () => {
  assert.equal(
    coberturaDaJanela(tarefa, { state: "partial", ate: "2026-09-13T02:00:00.000Z" }),
    "cobre",
  );
});

test("sem fim marcado na tarefa, um limite superior é indeterminado e não se inventa certeza", () => {
  assert.equal(
    coberturaDaJanela(semFim, { state: "partial", ate: "2026-09-12T21:00:00.000Z" }),
    "indeterminada",
  );
});

test("sem fim marcado, um limite só inferior continua determinável", () => {
  assert.equal(
    coberturaDaJanela(semFim, { state: "partial", de: "2026-09-12T17:00:00.000Z" }),
    "cobre",
  );
});

test("uma resposta que não é parcial não tem cobertura a calcular", () => {
  assert.equal(coberturaDaJanela(tarefa, { state: "available" }), null);
  assert.equal(coberturaDaJanela(tarefa, null), null);
});

test("não consultável e sem resposta são estados diferentes", () => {
  const { consultadas, respostas } = contexto([["a", null]]);
  assert.equal(
    estadoDaPessoa({
      pessoa: pessoa("responsavel", { may_be_consulted: false }),
      tarefa,
      consultadas,
      respostas,
    }).estado,
    "non_consultable",
  );
  assert.equal(
    estadoDaPessoa({ pessoa: pessoa("a"), tarefa, consultadas, respostas }).estado,
    "unanswered",
  );
  assert.equal(
    estadoDaPessoa({ pessoa: pessoa("z"), tarefa, consultadas, respostas }).estado,
    "not_consulted",
  );
});

test("abaixo do mínimo é detectável, e acima do mínimo não é aviso nenhum", () => {
  const compativeis = [pessoa("a"), pessoa("b"), pessoa("c")];
  const ctx = contexto([
    ["a", { state: "available" }],
    ["b", { state: "available" }],
    ["c", { state: "available" }],
  ]);
  const um = posicaoDaTarefa({
    tarefa,
    compativeis,
    atribuicoes: [{ id: "x1", event_task_id: "t1", staff_member_id: "a" }],
    ...ctx,
  });
  assert.equal(um.abaixoDoMinimo, true);
  assert.equal(um.emFalta, 1);

  const tres = posicaoDaTarefa({
    tarefa,
    compativeis,
    atribuicoes: [
      { id: "x1", event_task_id: "t1", staff_member_id: "a" },
      { id: "x2", event_task_id: "t1", staff_member_id: "b" },
      { id: "x3", event_task_id: "t1", staff_member_id: "c" },
    ],
    ...ctx,
  });
  assert.equal(tres.abaixoDoMinimo, false);
  assert.equal(tres.emFalta, 0);
  assert.equal(tres.conflitos.length, 0);
});

test("escalar quem disse que não podia é permitido e fica assinalado", () => {
  const ctx = contexto([
    ["a", { state: "unavailable" }],
    ["b", { state: "available" }],
  ]);
  const r = posicaoDaTarefa({
    tarefa,
    compativeis: [pessoa("a"), pessoa("b")],
    atribuicoes: [
      { id: "x1", event_task_id: "t1", staff_member_id: "a" },
      { id: "x2", event_task_id: "t1", staff_member_id: "b" },
    ],
    ...ctx,
  });
  assert.equal(r.escalados.length, 2);
  assert.equal(r.conflitos.length, 1);
  assert.equal(r.conflitos[0].pessoa.id, "a");
});

test("escalar quem não respondeu é permitido e fica assinalado", () => {
  const ctx = contexto([["a", null]]);
  const r = posicaoDaTarefa({
    tarefa,
    compativeis: [pessoa("a")],
    atribuicoes: [{ id: "x1", event_task_id: "t1", staff_member_id: "a" }],
    ...ctx,
  });
  assert.equal(r.conflitos.length, 1);
  assert.equal(r.conflitos[0].estado, "unanswered");
});

test("escalar quem é não consultável NÃO é conflito — nunca lhe foi perguntado", () => {
  const ctx = contexto([]);
  const r = posicaoDaTarefa({
    tarefa,
    compativeis: [pessoa("responsavel", { may_be_consulted: false })],
    atribuicoes: [{ id: "x1", event_task_id: "t1", staff_member_id: "responsavel" }],
    ...ctx,
  });
  assert.equal(r.escalados.length, 1);
  assert.equal(r.escalados[0].estado, "non_consultable");
  assert.equal(r.conflitos.length, 0);
});

test("uma janela parcial que não cobre a tarefa é conflito; uma que cobre não é", () => {
  const curta = contexto([
    ["a", { state: "partial", de: "2026-09-12T20:00:00.000Z" }],
  ]);
  const larga = contexto([
    ["a", { state: "partial", de: "2026-09-12T16:00:00.000Z" }],
  ]);
  const atribuicoes = [{ id: "x1", event_task_id: "t1", staff_member_id: "a" }];
  assert.equal(
    posicaoDaTarefa({ tarefa, compativeis: [pessoa("a")], atribuicoes, ...curta })
      .conflitos.length,
    1,
  );
  assert.equal(
    posicaoDaTarefa({ tarefa, compativeis: [pessoa("a")], atribuicoes, ...larga })
      .conflitos.length,
    0,
  );
});

test("cobertura indeterminada conta como conflito, para não fingir certeza", () => {
  const ctx = {
    consultadas: new Set(["a"]),
    respostas: new Map([
      ["t2:a", { state: "partial", ate: "2026-09-12T21:00:00.000Z" }],
    ]),
  };
  const r = posicaoDaTarefa({
    tarefa: semFim,
    compativeis: [pessoa("a")],
    atribuicoes: [{ id: "x1", event_task_id: "t2", staff_member_id: "a" }],
    ...ctx,
  });
  assert.equal(r.conflitos.length, 1);
  assert.equal(r.conflitos[0].cobertura, "indeterminada");
});

test("disponíveis por escalar são só quem disse «posso», e só quem não está escalado", () => {
  const ctx = contexto([
    ["a", { state: "available" }],
    ["b", { state: "available" }],
    ["c", { state: "partial", de: "2026-09-12T20:00:00.000Z" }],
    ["d", null],
    ["e", { state: "unavailable" }],
  ]);
  const compativeis = ["a", "b", "c", "d", "e"].map((x) => pessoa(x));
  compativeis.push(pessoa("inactiva", { is_active: false }));
  const r = posicaoDaTarefa({
    tarefa,
    compativeis,
    atribuicoes: [{ id: "x1", event_task_id: "t1", staff_member_id: "a" }],
    ...ctx,
  });
  assert.deepEqual(
    r.disponiveisPorEscalar.map((x) => x.pessoa.id),
    ["b"],
  );
});

test("a ordem é a ordem que entra — nada aqui ordena por aptidão", () => {
  const ctx = contexto([
    ["zulmira", { state: "available" }],
    ["ana", { state: "available" }],
  ]);
  const r = posicaoDaTarefa({
    tarefa,
    compativeis: [pessoa("zulmira"), pessoa("ana")],
    atribuicoes: [],
    ...ctx,
  });
  assert.deepEqual(
    r.disponiveisPorEscalar.map((x) => x.pessoa.id),
    ["zulmira", "ana"],
  );
});

// ---------------------------------------------------------------
// Uma atribuição não pode desaparecer do ecrã por a pessoa ter
// perdido a função depois de ter sido escalada (produção, 31/08/2026:
// o Frederico aparecia nos Planos e não aparecia nas Tarefas).
// ---------------------------------------------------------------

test("quem foi escalado e perdeu a função continua visível, e marcado", () => {
  const semFuncao = pessoa("frederico");           // já não é compatível
  const ctx = contexto([["a", { state: "available" }]]);
  const r = posicaoDaTarefa({
    tarefa,
    compativeis: [pessoa("a")],                    // o Frederico não está aqui
    membros: [pessoa("a"), semFuncao],             // mas está na equipa
    atribuicoes: [
      { id: "x1", event_task_id: "t1", staff_member_id: "a" },
      { id: "x2", event_task_id: "t1", staff_member_id: "frederico" },
    ],
    ...ctx,
  });
  assert.equal(r.escalados.length, 2, "os dois aparecem");
  const f = r.escalados.find((e) => e.pessoa.id === "frederico");
  assert.ok(f, "o que perdeu a função não desaparece");
  assert.equal(f.semAFuncao, true, "e vem marcado");
  assert.equal(f.atribuicaoId, "x2", "com o id da atribuição, para se poder retirar");
  assert.equal(
    r.escalados.find((e) => e.pessoa.id === "a").semAFuncao,
    false,
    "quem mantém a função não leva a marca",
  );
});

test("o mínimo conta quem está mesmo escalado, não só os compatíveis", () => {
  const r = posicaoDaTarefa({
    tarefa,                                        // mínimo 2
    compativeis: [pessoa("a")],
    membros: [pessoa("a"), pessoa("frederico")],
    atribuicoes: [
      { id: "x1", event_task_id: "t1", staff_member_id: "a" },
      { id: "x2", event_task_id: "t1", staff_member_id: "frederico" },
    ],
    ...contexto([["a", { state: "available" }]]),
  });
  assert.equal(r.abaixoDoMinimo, false, "2 escalados para um mínimo de 2");
  assert.equal(r.emFalta, 0);
});

test("sem membros, cai nos compatíveis — o comportamento antigo não parte", () => {
  const r = posicaoDaTarefa({
    tarefa,
    compativeis: [pessoa("a")],
    atribuicoes: [{ id: "x1", event_task_id: "t1", staff_member_id: "a" }],
    ...contexto([["a", { state: "available" }]]),
  });
  assert.equal(r.escalados.length, 1);
  assert.equal(r.escalados[0].semAFuncao, false);
});
