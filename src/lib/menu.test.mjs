import test from "node:test";
import assert from "node:assert/strict";
import {
  NAV_DIARIA,
  NAV_GRUPOS,
  NAV_MOVEL,
  SEPARADORES_COM_CHAVE,
  separadoresOcultosDe,
  grupoDoSeparador,
  todosOsDestinos,
} from "./menu.js";
import { caminhoDoSeparador } from "./rotasAdmin.js";

// ============================================================
// A arquitetura da navegação é UMA lista (lib/menu.js) — estes
// testes garantem que ela e as rotas nunca divergem: um id com
// gralha cairia em silêncio no Início.
// ============================================================

test("todos os destinos do menu têm rota própria (nenhum cai no Início por gralha)", () => {
  const caminhoOmissao = caminhoDoSeparador("x", "__id_que_nao_existe__");
  for (const d of todosOsDestinos()) {
    const caminho = caminhoDoSeparador("x", d.id);
    if (d.id === "inicio") continue;
    assert.notEqual(
      caminho,
      caminhoOmissao,
      `«${d.label}» (${d.id}) não tem slug em rotasAdmin — cairia no Início`,
    );
  }
});

test("nenhum separador aparece duas vezes na arquitetura", () => {
  const ids = [
    ...NAV_DIARIA.map((d) => d.id),
    ...NAV_GRUPOS.flatMap((g) => g.itens.map((i) => i.id)),
  ];
  assert.equal(new Set(ids).size, ids.length, `duplicados em: ${ids.join(", ")}`);
});

test("a barra do telemóvel só usa destinos que existem na arquitetura", () => {
  const conhecidos = new Set(todosOsDestinos().map((d) => d.id));
  for (const n of NAV_MOVEL) {
    assert.ok(conhecidos.has(n.id), `${n.id} na barra móvel mas fora do menu`);
  }
});

// ============================================================
// A regra de esconder por permissão — a MESMA para AdminPage,
// EventoPage, rail compacto, flyouts e folha «Mais»: todas as
// superfícies derivam de NAV_GRUPOS + visiveis(ocultar), e o ocultar
// vem sempre de separadoresOcultosDe (via usePermissoesDeNavegacao).
// ============================================================

const COM_ACESSO = { podeLer: true, podeGerir: false };
const SEM_ACESSO = { podeLer: false, podeGerir: false };
const FALHOU = { podeLer: false, podeGerir: false, indisponivel: true };

test("com acesso, Equipa e Disponibilidades ficam visíveis; sem acesso, escondem-se", () => {
  assert.deepEqual(separadoresOcultosDe(COM_ACESSO, COM_ACESSO), []);
  assert.deepEqual(separadoresOcultosDe(SEM_ACESSO, SEM_ACESSO), [
    "equipa",
    "consultas",
  ]);
  // chaves independentes: ler a equipa não abre as disponibilidades
  assert.deepEqual(separadoresOcultosDe(COM_ACESSO, SEM_ACESSO), ["consultas"]);
  assert.deepEqual(separadoresOcultosDe(SEM_ACESSO, COM_ACESSO), ["equipa"]);
});

test("resposta em falta (ainda a caminho, ou rede a tossir) esconde — nunca mostra e retira", () => {
  assert.deepEqual(separadoresOcultosDe(undefined, undefined), [
    "equipa",
    "consultas",
  ]);
  assert.deepEqual(separadoresOcultosDe(FALHOU, FALHOU), [
    "equipa",
    "consultas",
  ]);
});

test("esconder pelos grupos cobre TODAS as superfícies: os separadores com chave nunca vivem no diário nem na barra móvel", () => {
  for (const id of SEPARADORES_COM_CHAVE) {
    assert.equal(
      NAV_DIARIA.some((d) => d.id === id),
      false,
      `${id} no diário escaparia ao filtro dos grupos`,
    );
    assert.equal(
      NAV_MOVEL.some((d) => d.id === id),
      false,
      `${id} na barra móvel escaparia ao filtro dos grupos`,
    );
    // …e vive mesmo num grupo (senão o esconder não teria onde atuar)
    assert.ok(
      grupoDoSeparador(id),
      `${id} tem de pertencer a um grupo da arquitetura`,
    );
  }
});

test("grupoDoSeparador aponta o domínio certo (o contexto da página atual)", () => {
  assert.equal(grupoDoSeparador("territorio"), "crescimento");
  assert.equal(grupoDoSeparador("operacional"), "operacoes");
  assert.equal(grupoDoSeparador("orcamentos"), "comercial");
  assert.equal(grupoDoSeparador("inicio"), null); // diário: sem grupo
});
