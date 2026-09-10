import test from "node:test";
import assert from "node:assert/strict";
import {
  NAV_DIARIA,
  NAV_DESTAQUES,
  NAV_GRUPOS,
  NAV_MOVEL,
  SEPARADORES_COM_CHAVE,
  separadoresOcultosDe,
  grupoDoSeparador,
  todosOsDestinos,
  lerNavCompacta,
  guardarNavCompacta,
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
    ...NAV_DESTAQUES.map((d) => d.id),
    ...NAV_GRUPOS.flatMap((g) => g.itens.map((i) => i.id)),
  ];
  assert.equal(new Set(ids).size, ids.length, `duplicados em: ${ids.join(", ")}`);
});

test("o Território é destaque standalone — fora dos grupos, com chip e dica honesta", () => {
  const territorio = NAV_DESTAQUES.find((d) => d.id === "territorio");
  assert.ok(territorio, "o Território vive nos destaques");
  assert.equal(grupoDoSeparador("territorio"), null); // saiu do dropdown
  assert.ok(territorio.chip, "chip discreto presente");
  assert.ok(territorio.dica?.length > 10, "micro-copy de utilidade presente");
  // e o Dashboard FICOU no Crescimento
  assert.equal(grupoDoSeparador("dashboard"), "crescimento");
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

// ============================================================
// A sidebar do desktop nasce recolhida (decisão de 10/09) — e é
// por isso que «expandida» tem de ser uma escolha GRAVADA: se
// fosse a ausência da chave, a omissão nova apagá-la-ia a cada
// sessão. Estes testes fixam o tri-estado.
// ============================================================

test("sem preferência gravada, a sidebar nasce recolhida — e expandir fica gravado", () => {
  const memoria = new Map();
  globalThis.localStorage = {
    getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
    setItem: (k, v) => memoria.set(k, String(v)),
    removeItem: (k) => memoria.delete(k),
  };
  try {
    // 1.ª entrada de sempre: chave ausente → compacta por omissão
    assert.equal(lerNavCompacta(), true);
    // a pessoa expande → a escolha sobrevive à «sessão» seguinte
    guardarNavCompacta(false);
    assert.equal(lerNavCompacta(), false);
    // volta a recolher → idem
    guardarNavCompacta(true);
    assert.equal(lerNavCompacta(), true);
    // legado: quem já tinha "1" gravado continua compacta
    memoria.clear();
    memoria.set("dlm.backoffice.nav.compacta", "1");
    assert.equal(lerNavCompacta(), true);
  } finally {
    delete globalThis.localStorage;
  }
});

test("sem localStorage (ou a atirar), a omissão continua a ser recolhida", () => {
  assert.equal(lerNavCompacta(), true); // node: sem localStorage
  globalThis.localStorage = {
    getItem: () => {
      throw new Error("bloqueado");
    },
  };
  try {
    assert.equal(lerNavCompacta(), true);
  } finally {
    delete globalThis.localStorage;
  }
});

test("grupoDoSeparador aponta o domínio certo (o contexto da página atual)", () => {
  assert.equal(grupoDoSeparador("territorio"), null); // destaque standalone
  assert.equal(grupoDoSeparador("operacional"), "operacoes");
  assert.equal(grupoDoSeparador("orcamentos"), "comercial");
  assert.equal(grupoDoSeparador("inicio"), null); // diário: sem grupo
});
