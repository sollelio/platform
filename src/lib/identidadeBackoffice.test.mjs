import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { comOrganizacao } from "./identidadeBackoffice.js";

// A regressão que isto guarda tem dois lados, e os dois importam:
//   · a casa do backoffice PASSA a levar o id da organização, senão o
//     módulo da Equipa nunca chega a perguntar a permissão;
//   · nenhuma porta pública passa a levá-lo, porque a identidade vai
//     embutida nas projecções do portal, do comunicado e da campanha.
//   node --test src/lib/identidadeBackoffice.test.mjs

const ORG = "cb563908-0000-4000-8000-000000000001"; // sintético
const conhecida = () => ({
  estado: "conhecida",
  casa: { nome: "Casa Sintética", logo_url: null, nif: "000000000" },
});

test("uma casa conhecida do backoffice passa a levar o id da organização", () => {
  const r = comOrganizacao(conhecida(), ORG);
  assert.equal(r.estado, "conhecida");
  assert.equal(r.casa.id, ORG);
  assert.equal(r.casa.nome, "Casa Sintética", "e a identidade fica intacta");
});

test("sem id, a identidade sai exactamente como entrou — falha fechada", () => {
  for (const vazio of [null, undefined, ""]) {
    const r = comOrganizacao(conhecida(), vazio);
    assert.equal("id" in r.casa, false, "não se inventa um id");
    assert.equal(r.casa.nome, "Casa Sintética", "e o backoffice legado não dá por nada");
  }
});

test("uma casa suspensa não se veste: sem equipa a trabalhar, sem id", () => {
  const susp = { estado: "suspensa", casa: { nome: "Casa Parada" } };
  assert.equal("id" in comOrganizacao(susp, ORG).casa, false);
});

test("desconhecida e sem-resposta atravessam sem tocar", () => {
  const d = { estado: "desconhecida" };
  const s = { estado: "sem-resposta" };
  assert.deepEqual(comOrganizacao(d, ORG), d);
  assert.deepEqual(comOrganizacao(s, ORG), s);
  assert.equal(comOrganizacao(undefined, ORG), undefined);
});

test("não muta a resposta recebida", () => {
  const original = conhecida();
  const copia = JSON.parse(JSON.stringify(original));
  comOrganizacao(original, ORG);
  assert.deepEqual(original, copia, "o objecto de entrada fica como estava");
});

// ---------------------------------------------------------------
// A guarda estrutural: o id entra por UMA porta e só por essa.
// ---------------------------------------------------------------
const fonte = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "identidadeCasa.js"),
  "utf8",
);

test("só a porta do backoffice resolve o id da organização", () => {
  // a CHAMADA, não a palavra: o comentário e o rótulo do console também
  // a mencionam, e mencionar não é resolver
  const chamadas = fonte.match(/rpc\(\s*"tenant_do_pedido"/g) ?? [];
  assert.equal(chamadas.length, 1, "uma única chamada em todo o ficheiro");

  // e essa chamada tem de estar depois das portas públicas, dentro do
  // bloco do backoffice — se alguém a subir para uma delas, isto cai
  const posChamada = fonte.search(/rpc\(\s*"tenant_do_pedido"/);
  for (const publica of [
    "casaPorSlug",
    "casaPorTokenDePortal",
    "casaPorTokenDeComunicado",
    "casaPorTokenDeCampanha",
    "casaPorCodigo",
  ]) {
    const bloco = fonte.slice(
      fonte.indexOf(`export const ${publica}`),
      fonte.indexOf(";", fonte.indexOf(`export const ${publica}`)) + 1,
    );
    assert.ok(
      !bloco.includes("tenant_do_pedido") && !bloco.includes("comOrganizacao"),
      `${publica} não pode resolver nem vestir o id`,
    );
  }
  assert.ok(
    posChamada > fonte.indexOf("export const casaPorCodigo"),
    "a chamada vive depois de todas as portas públicas",
  );
});

test("as portas públicas continuam a devolver o que a base lhes der, sem enriquecer", () => {
  const publicas = fonte.slice(
    fonte.indexOf("export const casaPorSlug"),
    fonte.indexOf("// O backoffice."),
  );
  assert.ok(!publicas.includes("comOrganizacao"));
  assert.ok(!publicas.includes("tenant_do_pedido"));
  // «id» como CHAVE, não como sílaba: «identidade_da_casa_por_slug» tem
  // as duas letras lá dentro e não é um identificador nenhum
  assert.equal(
    publicas.match(/\bid\b\s*[:,]|\.id\b/g),
    null,
    "nenhuma porta pública lê ou escreve um campo id",
  );
});
