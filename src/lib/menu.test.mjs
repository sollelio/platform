import test from "node:test";
import assert from "node:assert/strict";
import {
  NAV_DIARIA,
  NAV_GRUPOS,
  NAV_MOVEL,
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

test("grupoDoSeparador aponta o domínio certo (o contexto da página atual)", () => {
  assert.equal(grupoDoSeparador("territorio"), "crescimento");
  assert.equal(grupoDoSeparador("operacional"), "operacoes");
  assert.equal(grupoDoSeparador("orcamentos"), "comercial");
  assert.equal(grupoDoSeparador("inicio"), null); // diário: sem grupo
});
