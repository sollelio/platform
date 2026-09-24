// O guarda da cadeia de migrações (24/09/2026).
//
// A cadeia executável é supabase/migrations/. Uma 109/110 escrita só em
// docs/migracoes/ e aplicada à mão deixou o TEST (reconstruído pela
// cadeia canónica) para trás — este teste impede que se repita:
//   · cada migração numerada DEPOIS do baseline (> 108) tem de ter a sua
//     cópia canónica `*_legacy_NNN_*.sql` em supabase/migrations/;
//   · os nomes timestamped seguem a convenção e não colidem;
//   · as cópias canónicas da 109/110 não divergem do SQL aprovado.
// Ver docs/migracoes/README.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL("../../", import.meta.url));
const historico = `${raiz}docs/migracoes/`;
const canonica = `${raiz}supabase/migrations/`;

// O baseline (20260821024034) contém o esquema de produção auditado a
// 21/08/2026 — isto é, tudo até à 108.
const BASELINE_COBRE_ATE = 108;

const numeradas = readdirSync(historico)
  .filter((f) => /^\d{3}[a-z]?_.+\.sql$/.test(f))
  .map((f) => ({ ficheiro: f, numero: Number(f.slice(0, 3)) }));
const timestamped = readdirSync(canonica).filter((f) => f.endsWith(".sql"));

test("toda a migração numerada depois do baseline tem cópia canónica", () => {
  const depois = numeradas.filter((m) => m.numero > BASELINE_COBRE_ATE);
  assert.ok(depois.length >= 2, "a 109 e a 110 existem no histórico");
  for (const m of depois) {
    const copia = timestamped.find((f) => f.includes(`_legacy_${String(m.numero).padStart(3, "0")}_`));
    assert.ok(
      copia,
      `${m.ficheiro} não tem cópia em supabase/migrations/ — migração nova nasce lá (docs/migracoes/README.md)`,
    );
  }
});

test("os nomes timestamped seguem a convenção e não colidem", () => {
  const stamps = timestamped.map((f) => {
    assert.match(f, /^\d{14}_[a-z0-9_]+\.sql$/, f);
    return f.slice(0, 14);
  });
  assert.equal(new Set(stamps).size, stamps.length, "timestamps repetidos");
  const legados = timestamped.filter((f) => /_legacy_\d{3}_/.test(f));
  const ordem = legados.map((f) => Number(f.match(/_legacy_(\d{3})_/)[1]));
  assert.deepEqual(ordem, [...ordem].sort((a, b) => a - b), "as cópias legadas seguem a ordem dos números");
  assert.ok(legados.every((f) => f > "20260821024034"), "as cópias legadas vêm depois do baseline");
});

// Remove o cabeçalho canónico (comentários iniciais até à 1.ª linha em
// branco) para comparar só o SQL copiado.
const semCabecalho = (txt) => txt.slice(txt.indexOf("\n\n") + 2);
const semTransaccao = (txt) =>
  txt.replace("begin;\n\n", "").replace(/\ncommit;\n$/, "\n");

test("as cópias canónicas da 109 e da 110 não divergem do SQL aprovado", () => {
  const ler = (dir, f) => readFileSync(dir + f, "utf8");
  const c109 = timestamped.find((f) => f.includes("_legacy_109_"));
  const c110 = timestamped.find((f) => f.includes("_legacy_110_"));
  assert.equal(
    semCabecalho(ler(canonica, c109)),
    ler(historico, "109_a_procura_nao_se_apaga.sql"),
    "109: o SQL canónico tem de ser byte a byte o da 109",
  );
  assert.equal(
    semCabecalho(ler(canonica, c110)),
    semTransaccao(ler(historico, "110_quem_pediu_e_por_onde.sql")),
    "110: o SQL canónico tem de ser o da 110 sem o begin/commit próprio",
  );
  assert.ok(!/^\s*(begin|commit)\s*;/im.test(semCabecalho(ler(canonica, c110))), "sem transacção própria");
  assert.match(ler(canonica, c110), /AUTORIA_IMUTAVEL/, "a 110 canónica inclui a secção 4 (autoria)");
});
