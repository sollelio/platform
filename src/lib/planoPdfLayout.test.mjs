import test from "node:test";
import assert from "node:assert/strict";
import {
  blocosDoPlano,
  carimboDeGeracao,
  dataPorExtenso,
  marcaDaCasa,
  nomeDoFicheiroDoPlano,
} from "./planoPdfLayout.js";
import { medidaDoLogo } from "./planoPdf.js";

// O que entra no papel e como se chama o ficheiro são decisões de
// produto: testam-se aqui, sem abrir um PDF. O desenho (margens,
// quebras) é do planoPdf.js e prova-se a extrair texto do ficheiro.
//   node --test src/lib/planoPdfLayout.test.mjs

const plano = () => ({
  pessoa: { display_name: "Jonas Cação" },
  evento: { titulo: "Casamento Ação", data: "2026-08-27", local: "Quinta São João", morada: null },
  dias: [
    { data: "2026-08-26", dataPorExtenso: "quarta-feira, 26 de agosto de 2026",
      tarefas: [{ id: "a", titulo: "Montagem", inicio: "09:00", fim: "13:00", notas: "Levar escadote", colegas: ["Ana"] }] },
    { data: "2026-08-27", dataPorExtenso: "quinta-feira, 27 de agosto de 2026",
      tarefas: [{ id: "b", titulo: "Serviço", inicio: "18:00", fim: null, notas: null, colegas: [] }] },
  ],
  instrucoes: { standard_instructions: "NORMAIS", hot_weather_instructions: "CALOR" },
});
const tipos = (b) => b.map((x) => x.tipo);
const textos = (b) => b.map((x) => (x.rotulo ? `${x.rotulo}: ${x.texto}` : x.texto));

test("o nome do ficheiro segue o exemplo aprovado", () => {
  assert.equal(
    nomeDoFicheiroDoPlano({ pessoa: { display_name: "Jonas" }, evento: { data: "2026-08-27" } }),
    "Plano_de_Trabalho_Jonas_2026-08-27.pdf",
  );
});

test("o nome do ficheiro é seguro: acentos, barras e símbolos saem", () => {
  const n = (nome) => nomeDoFicheiroDoPlano({ pessoa: { display_name: nome }, evento: { data: "2026-08-27" } });
  assert.equal(n("Nádia Gonçalves"), "Plano_de_Trabalho_Nadia_Goncalves_2026-08-27.pdf");
  assert.equal(n("João/Ana \\ Maria"), "Plano_de_Trabalho_Joao_Ana_Maria_2026-08-27.pdf");
  assert.equal(n("../../etc/passwd"), "Plano_de_Trabalho_etc_passwd_2026-08-27.pdf");
  assert.equal(n("???"), "Plano_de_Trabalho_Equipa_2026-08-27.pdf", "nunca fica vazio");
  assert.ok(!n("x".repeat(200)).includes("x".repeat(60)), "o nome é limitado");
  assert.match(n("Ana"), /^[A-Za-z0-9_.-]+$/, "só caracteres seguros");
});

test("sem data de evento cai no primeiro dia de trabalho, e só depois no dia de hoje", () => {
  assert.equal(
    nomeDoFicheiroDoPlano({ pessoa: { display_name: "Ana" }, evento: {}, dias: [{ data: "2026-09-05" }] }),
    "Plano_de_Trabalho_Ana_2026-09-05.pdf",
  );
  assert.equal(
    nomeDoFicheiroDoPlano({ pessoa: { display_name: "Ana" } }, new Date(2026, 11, 1)),
    "Plano_de_Trabalho_Ana_2026-12-01.pdf",
  );
});

test("a marca escolhe campos — nunca espalha a casa", () => {
  const m = marcaDaCasa({ nome: "Casa", linha_actividade: "Linha", id: "uuid-secreto", nif: "999" });
  assert.deepEqual(m, { nome: "Casa", linha: "Linha" });
  assert.deepEqual(marcaDaCasa(null), { nome: null, linha: null });
});

test("nenhum bloco leva identificadores internos", () => {
  const b = blocosDoPlano(plano(), { casa: { nome: "Casa", id: "uuid-secreto" } });
  const tudo = JSON.stringify(b);
  assert.ok(!tudo.includes("uuid-secreto"), "o id da organização não vai ao papel");
  for (const chave of ["id", "submission_id", "staff_member_id", "token"])
    assert.ok(!b.some((x) => chave in x), `nenhum bloco expõe ${chave}`);
});

test("a ordem do documento é a aprovada", () => {
  const b = blocosDoPlano(plano(), { casa: { nome: "Do Luxo à Mesa", linha_actividade: "Decoração" } });
  assert.deepEqual(tipos(b).slice(0, 8), [
    "marca", "marca-linha", "titulo", "campo", "campo", "campo", "campo", "dia",
  ]);
  assert.deepEqual(tipos(b).slice(-6), [
    "tarefa", "seccao", "paragrafo", "seccao", "paragrafo", "rodape",
  ], "as instruções vêm depois do trabalho, e o carimbo fecha o documento");
  const t = textos(b);
  assert.ok(t.includes("PLANO DE TRABALHO"));
  assert.ok(t.includes("Evento: Casamento Ação"));
  assert.ok(t.includes("Data: quinta-feira, 27 de agosto de 2026"));
  assert.ok(t.includes("Local: Quinta São João"));
  assert.ok(t.includes("Para: Jonas Cação"));
  assert.ok(t.includes("INDICAÇÕES DA EQUIPA"));
  assert.ok(t.includes("EM DIAS DE MUITO CALOR"));
});

test("cada dia operacional tem a sua secção, por ordem", () => {
  const b = blocosDoPlano(plano(), {});
  const dias = b.filter((x) => x.tipo === "dia").map((x) => x.texto);
  assert.equal(dias.length, 2);
  assert.match(dias[0], /26 DE AGOSTO/);
  assert.match(dias[1], /27 DE AGOSTO/);
});

test("notas e colegas só aparecem quando existem", () => {
  const b = blocosDoPlano(plano(), {});
  assert.equal(b.filter((x) => x.tipo === "nota").length, 1);
  assert.equal(b.filter((x) => x.tipo === "colegas").length, 1);
  assert.equal(b.find((x) => x.tipo === "colegas").texto, "Com: Ana");
});

test("uma tarefa sem fim marcado imprime só o início", () => {
  const tarefas = blocosDoPlano(plano(), {}).filter((x) => x.tipo === "tarefa");
  assert.match(tarefas[0].texto, /^09:00–13:00 {2}Montagem$/);
  assert.match(tarefas[1].texto, /^18:00 {2}Serviço$/);
});

test("sem instruções, não se inventam secções vazias", () => {
  const b = blocosDoPlano({ ...plano(), instrucoes: null }, {});
  assert.equal(b.filter((x) => x.tipo === "seccao").length, 0);
  assert.equal(b.filter((x) => x.tipo === "paragrafo").length, 0);
});

test("só a contingência de calor, se for a única configurada", () => {
  const b = blocosDoPlano({ ...plano(), instrucoes: { standard_instructions: null, hot_weather_instructions: "SÓ CALOR" } }, {});
  const s = b.filter((x) => x.tipo === "seccao").map((x) => x.texto);
  assert.deepEqual(s, ["EM DIAS DE MUITO CALOR"]);
});

test("sem casa, sem local e sem título, o documento continua a fazer sentido", () => {
  const b = blocosDoPlano({ pessoa: { display_name: "Ana" }, evento: {}, dias: [], instrucoes: null }, {});
  assert.deepEqual(tipos(b), ["titulo", "campo", "rodape"]);
  assert.equal(b[1].texto, "Ana");
});

test("o carimbo é sempre de Lisboa, seja qual for o relógio de quem gera", () => {
  // 2026-08-27T20:34Z = 21:34 em Lisboa (WEST, UTC+1)
  assert.equal(carimboDeGeracao(new Date("2026-08-27T20:34:00Z")), "27/08/2026, 21:34");
  // em Janeiro Lisboa está em UTC+0
  assert.equal(carimboDeGeracao(new Date("2026-01-15T09:05:00Z")), "15/01/2026, 09:05");
  const b = blocosDoPlano(plano(), { agora: new Date("2026-08-27T20:34:00Z") });
  assert.equal(b.at(-1).texto, "Gerado em 27/08/2026, 21:34");
});

test("a data do evento por extenso, e o que não é data passa intacto", () => {
  assert.equal(dataPorExtenso("2026-08-27"), "quinta-feira, 27 de agosto de 2026");
  assert.equal(dataPorExtenso("A combinar"), "A combinar");
  assert.equal(dataPorExtenso(null), null);
});

test("um plano inexistente não rebenta", () => {
  assert.deepEqual(blocosDoPlano(null), []);
});

test("a marca do logótipo encolhe sem deformar, e nunca amplia", () => {
  const caixa = { larguraMax: 70, alturaMax: 70 };
  const quadrado = medidaDoLogo(472, 472, caixa);
  assert.deepEqual(quadrado, { largura: 70, altura: 70 }, "a marca quadrada enche a caixa");
  const largo = medidaDoLogo(600, 200, caixa);
  assert.ok(Math.abs(largo.largura / largo.altura - 3) < 0.001, "proporção mantida");
  assert.ok(largo.largura <= 70 && largo.altura <= 70, "uma marca deitada bate na largura");
  const alto = medidaDoLogo(200, 600, caixa);
  assert.ok(alto.altura <= 70, "manda o lado que primeiro bate na caixa");
  const pequeno = medidaDoLogo(40, 20, caixa);
  assert.deepEqual(pequeno, { largura: 40, altura: 20 }, "um logótipo pequeno não se estica");
  for (const mau of [[0, 10], [10, 0], [null, 10], [-5, 5]])
    assert.equal(medidaDoLogo(...mau, caixa), null, "medidas impossíveis não desenham nada");
});

// ---------------------------------------------------------------
// As unidades que a paginação não pode partir.
// ---------------------------------------------------------------

test("hora, nota e colegas de uma tarefa partilham o mesmo grupo", () => {
  const b = blocosDoPlano(plano(), {});
  const daTarefa = b.filter((x) => ["tarefa", "nota", "colegas"].includes(x.tipo));
  const grupos = new Set(daTarefa.map((x) => x.grupo));
  assert.equal(grupos.size, 2, "duas tarefas, dois grupos");
  const primeira = daTarefa.filter((x) => x.grupo === daTarefa[0].grupo);
  assert.deepEqual(
    primeira.map((x) => x.tipo),
    ["tarefa", "nota", "colegas"],
    "a tarefa com nota e colegas é uma unidade só",
  );
});

test("tarefas diferentes nunca partilham grupo, mesmo com o mesmo título", () => {
  const repetida = {
    ...plano(),
    dias: [
      { data: "2026-08-26", dataPorExtenso: "d1",
        tarefas: [
          { id: "a", titulo: "Serviço", inicio: "18:00", fim: null, notas: null, colegas: [] },
          { id: "b", titulo: "Serviço", inicio: "20:00", fim: null, notas: null, colegas: [] },
        ] },
    ],
  };
  const grupos = blocosDoPlano(repetida, {}).filter((x) => x.tipo === "tarefa").map((x) => x.grupo);
  assert.equal(new Set(grupos).size, 2);
});

test("cada título de secção anda colado ao seu texto", () => {
  const b = blocosDoPlano(plano(), {});
  const inst = b.filter((x) => x.grupo === "instrucoes").map((x) => x.tipo);
  const calor = b.filter((x) => x.grupo === "calor").map((x) => x.tipo);
  assert.deepEqual(inst, ["seccao", "paragrafo"]);
  assert.deepEqual(calor, ["seccao", "paragrafo"]);
});

test("o cabeçalho de dia não leva grupo: junta-se à primeira tarefa no pintor", () => {
  const dias = blocosDoPlano(plano(), {}).filter((x) => x.tipo === "dia");
  assert.ok(dias.every((x) => x.grupo === undefined));
});

test("com logótipo, o nome da casa sai do cabeçalho; a linha de actividade fica", () => {
  const casa = { nome: "Do Luxo à Mesa", linha_actividade: "Decoração e aluguer" };
  const com = blocosDoPlano(plano(), { casa, comLogotipo: true });
  assert.equal(com.some((x) => x.tipo === "marca"), false, "não se repete a marca");
  assert.equal(com[0].tipo, "marca-linha", "a linha de actividade acrescenta contexto e fica");

  const sem = blocosDoPlano(plano(), { casa, comLogotipo: false });
  assert.equal(sem[0].tipo, "marca", "sem logótipo, o nome é o que identifica a folha");
  assert.equal(sem[0].texto, "Do Luxo à Mesa");
});

test("sem logótipo e sem linha de actividade, o documento abre no título", () => {
  const b = blocosDoPlano(plano(), { casa: { nome: "Casa" }, comLogotipo: true });
  assert.equal(b[0].tipo, "titulo");
});
