import { test } from "node:test";
import assert from "node:assert/strict";
import { criarAnalytics, seguirIdentidade } from "./analytics/nucleo.js";
import { criarFunilFormulario } from "./analytics/funilFormulario.js";
import { FORM_VERSION, EVENTOS } from "./analytics/eventos.js";
import {
  moldeDoCaminho,
  rotaMedida,
  urlSegura,
  limparEnderecos,
} from "./analytics/privacidade.js";
import {
  analyticsLigada,
  antesDeEnviar,
  configPostHog,
  HOST_UE,
} from "./analytics/configuracao.js";

const UUID_A = "11111111-2222-4333-8444-555555555555";

// Um fornecedor falso que só regista — nada de internos do PostHog.
const falso = () => {
  const registo = [];
  return {
    registo,
    capture: (nome, props) => registo.push(["capture", nome, props]),
    identify: (id, props) => registo.push(["identify", id, props]),
    reset: () => registo.push(["reset"]),
  };
};
const montar = async ({ caminho = "/interesse/demo", autenticado = false } = {}) => {
  const f = falso();
  const ctx = { caminho, autenticado };
  const a = criarAnalytics({
    ambiente: "test",
    carregarFornecedor: async () => f,
    lerContexto: () => ctx,
  });
  await a.pronto;
  return { a, f, ctx };
};

test("sem configuração é um no-op seguro", async () => {
  const a = criarAnalytics({ carregarFornecedor: async () => null });
  assert.equal(await a.pronto, false);
  assert.doesNotThrow(() => {
    a.track("request_created", { request_id: UUID_A });
    a.identify(UUID_A);
    a.reset();
    a.mudouDeRota("/admin/x");
  });
  // e um fornecedor que rebenta a carregar também não parte nada
  const b = criarAnalytics({ carregarFornecedor: async () => { throw new Error("rede"); } });
  assert.equal(await b.pronto, false);
});

test("só liga com chave, ambiente declarado, e nunca production no npm run dev", () => {
  assert.equal(analyticsLigada({ chave: "", ambiente: "test" }), false);
  assert.equal(analyticsLigada({ chave: "k", ambiente: undefined }), false);
  assert.equal(analyticsLigada({ chave: "k", ambiente: "test" }), true);
  assert.equal(analyticsLigada({ chave: "k", ambiente: "production", emDesenvolvimento: true }), false);
  assert.equal(analyticsLigada({ chave: "k", ambiente: "production", emDesenvolvimento: false }), true);
  assert.equal(analyticsLigada({ chave: "k", ambiente: "test", desligada: "true" }), false);
});

test("os eventos não levam PII: chaves não declaradas e valores fora da forma caem", async () => {
  const { a, f } = await montar();
  a.track("public_quote_form_validation_failed", {
    form_version: FORM_VERSION,
    invalid_fields: ["nome", "contacto"],
    invalid_field_count: 2,
    // o que um erro de programação poderia lá meter:
    nome: "Ana Cruz",
    email: "ana@example.com",
    telefone: "912345678",
    morada: "Rua X, 12",
    mensagem: "Casamento da Ana na Rua X",
  });
  a.track("request_created", {
    request_id: UUID_A,
    submission_surface: "public_form",
    submitted_by_type: "Ana Cruz", // valor fora do vocabulário
    attribution_method: "unidentified",
    tenant_slug: "Rua X, 12", // não é slug
  });
  a.track("public_quote_form_validation_failed", {
    invalid_fields: ["nome", "912345678"], // lista com um valor estranho → cai inteira
  });
  const texto = JSON.stringify(f.registo);
  for (const pii of ["Ana", "ana@example.com", "912345678", "Rua X", "Casamento"]) {
    assert.ok(!texto.includes(pii), `vazou «${pii}»`);
  }
  const [, , p1] = f.registo[0];
  assert.deepEqual(p1.invalid_fields, ["nome", "contacto"]);
  const [, , p2] = f.registo[1];
  assert.equal(p2.submitted_by_type, undefined);
  assert.equal(p2.submission_surface, "public_form");
  const [, , p3] = f.registo[2];
  assert.equal(p3.invalid_fields, undefined);
});

test("evento fora do catálogo não sai, nem nas páginas por token", async () => {
  const { a, f, ctx } = await montar();
  a.track("button_clicked", {});
  assert.equal(f.registo.length, 0);
  ctx.caminho = "/acompanhar/AbCdEfGhIjKlMnOpQrStUvWxYz123456";
  a.track("public_quote_form_viewed", { form_version: FORM_VERSION });
  assert.equal(f.registo.length, 0);
});

test("propriedades comuns: ambiente, superfície, rota em molde, actor", async () => {
  const { a, f } = await montar({ caminho: `/evento/demo/${UUID_A}/documentos`, autenticado: true });
  a.track("request_created", { request_id: UUID_A });
  const [, , p] = f.registo[0];
  assert.equal(p.environment, "test");
  assert.equal(p.surface, "admin");
  assert.equal(p.route, "/evento/demo/:id/documentos");
  assert.equal(p.authenticated, true);
  assert.equal(p.actor_type, "internal");
});

test("identify só aceita um uuid — nunca email nem nome — e só com propriedades de máquina", async () => {
  const { a, f } = await montar();
  a.identify("nadia@example.com");
  a.identify("Nádia");
  a.identify(UUID_A);
  assert.equal(f.registo.length, 1);
  assert.deepEqual(f.registo[0], ["identify", UUID_A, { role: "internal", environment: "test" }]);
});

test("a identidade segue a sessão: sair faz reset; trocar de pessoa faz reset antes", () => {
  const r = [];
  const seguir = seguirIdentidade({
    identify: (id) => r.push(`id:${id}`),
    reset: () => r.push("reset"),
  });
  seguir(null); // anónimo à chegada: nada
  seguir(UUID_A); // entrou
  seguir(UUID_A); // TOKEN_REFRESHED: nada
  seguir(null); // saiu
  seguir(null);
  const B = "99999999-2222-4333-8444-555555555555";
  seguir(UUID_A);
  seguir(B); // outra pessoa sem «Sair»
  assert.deepEqual(r, [`id:${UUID_A}`, "reset", `id:${UUID_A}`, "reset", `id:${B}`]);
});

test("chamadas antes de o fornecedor carregar esperam e saem pela ordem", async () => {
  const f = falso();
  let soltar;
  const a = criarAnalytics({
    ambiente: "test",
    carregarFornecedor: () => new Promise((r) => { soltar = () => r(f); }),
    lerContexto: () => ({ caminho: "/interesse/demo", autenticado: false }),
  });
  a.track("public_quote_form_viewed", { form_version: FORM_VERSION });
  a.track("public_quote_form_started", { form_version: FORM_VERSION });
  assert.equal(f.registo.length, 0);
  soltar();
  await a.pronto;
  assert.deepEqual(f.registo.map((x) => x[1]), ["public_quote_form_viewed", "public_quote_form_started"]);
});

test("funil: VIEW/START/REQUIRED/SUBMITTED saem UMA vez, por mais renders que haja", () => {
  const saiu = [];
  const funil = criarFunilFormulario((e, p) => saiu.push([e, p]), { tenantSlug: "demo" });
  for (let i = 0; i < 5; i++) {
    funil.visto();
    funil.iniciado();
    funil.obrigatoriosCompletos(6);
  }
  funil.tentativaDeEnvio();
  funil.validacaoFalhou(["nome", "nome", "data"]);
  funil.tentativaDeEnvio();
  funil.enviado({ deduplicado: false });
  funil.enviado({ deduplicado: false });
  const nomes = saiu.map((x) => x[0]);
  assert.deepEqual(nomes, [
    "public_quote_form_viewed",
    "public_quote_form_started",
    "public_quote_form_required_completed",
    "public_quote_form_submit_attempted",
    "public_quote_form_validation_failed",
    "public_quote_form_submit_attempted",
    "public_quote_form_submitted",
  ]);
  assert.ok(saiu.every(([, p]) => p.form_version === FORM_VERSION && p.tenant_slug === "demo"));
  const falha = saiu.find((x) => x[0] === "public_quote_form_validation_failed")[1];
  assert.deepEqual(falha.invalid_fields, ["nome", "data"]);
  assert.equal(falha.invalid_field_count, 2);
});

test("funil: enviar sem ter tocado num campo conta como START (uma vez)", () => {
  const saiu = [];
  const funil = criarFunilFormulario((e) => saiu.push(e));
  funil.visto();
  funil.tentativaDeEnvio();
  funil.iniciado();
  assert.deepEqual(saiu, [
    "public_quote_form_viewed",
    "public_quote_form_started",
    "public_quote_form_submit_attempted",
  ]);
});

test("funil: SUBMITTED só existe se alguém o chamar depois do servidor — o clique não chega", () => {
  const saiu = [];
  const funil = criarFunilFormulario((e) => saiu.push(e));
  funil.tentativaDeEnvio(); // o clique
  assert.ok(!saiu.includes("public_quote_form_submitted"));
});

test("todos os eventos do funil declaram form_version", () => {
  for (const [nome, esquema] of Object.entries(EVENTOS)) {
    if (nome.startsWith("public_quote_form_")) assert.ok(esquema.form_version, nome);
  }
});

test("endereços: sem query, sem hash, ids e tokens em molde", () => {
  assert.equal(moldeDoCaminho(`/evento/demo/${UUID_A}/documentos`), "/evento/demo/:id/documentos");
  assert.equal(moldeDoCaminho("/acompanhar/qualquer-coisa/documentos"), "/acompanhar/:token/documentos");
  assert.equal(moldeDoCaminho("/disponibilidade/abc"), "/disponibilidade/:token");
  assert.equal(moldeDoCaminho("/interesse/doluxoamesa?entrada=interna#x"), "/interesse/doluxoamesa");
  assert.equal(
    urlSegura(`https://app.exemplo.pt/admin/demo/documentos/${UUID_A}/orcamento?nome=Ana`),
    "https://app.exemplo.pt/admin/demo/documentos/:id/orcamento",
  );
  const limpo = limparEnderecos({
    $current_url: "https://x.pt/acompanhar/TOKENSECRETOabcdefghijklmnopq",
    $referrer: "https://x.pt/contribuir/abc?p=1",
    $pathname: `/evento/demo/${UUID_A}`,
    $browser: "Firefox",
  });
  assert.equal(limpo.$current_url, "https://x.pt/acompanhar/:token");
  assert.equal(limpo.$referrer, "https://x.pt/contribuir/:token");
  assert.equal(limpo.$pathname, "/evento/demo/:id");
  assert.equal(limpo.$browser, "Firefox");
});

test("só se mede o /interesse e o backoffice", () => {
  for (const p of ["/interesse", "/interesse/demo", "/admin/demo/inicio", "/evento/demo/x", "/briefing/demo/x"])
    assert.ok(rotaMedida(p), p);
  for (const p of ["/", "/formulario", "/acompanhar/t", "/contribuir/t", "/comunicado/t", "/disponibilidade/t", "/interessex"])
    assert.ok(!rotaMedida(p), p);
});

test("before_send: deita fora eventos de rotas por token e limpa os endereços dos outros", () => {
  const ev = { event: "$pageview", properties: { $current_url: `https://x.pt/evento/demo/${UUID_A}?a=1` } };
  assert.equal(antesDeEnviar(ev, "/acompanhar/abc"), null);
  const ok = antesDeEnviar(ev, "/evento/demo/x");
  assert.equal(ok.properties.$current_url, "https://x.pt/evento/demo/:id");
  const comSet = antesDeEnviar(
    { event: "$identify", properties: {}, $set_once: { $initial_current_url: "https://x.pt/interesse/demo?utm=1" } },
    "/admin/demo/inicio",
  );
  assert.equal(comSet.$set_once.$initial_current_url, "https://x.pt/interesse/demo");
  // sem enriquecimento GeoIP no servidor (cidade/CP/lat-long a partir do IP)
  assert.equal(ok.properties.$geoip_disable, true);
  assert.equal(comSet.properties.$geoip_disable, true);
  // heatmaps: as URLs vivem nas CHAVES do $heatmap_data — também limpas
  const hm = antesDeEnviar(
    { event: "$$heatmap", properties: { $heatmap_data: { [`https://x.pt/interesse/demo?entrada=interna`]: [{ x: 1 }], [`https://x.pt/evento/demo/${UUID_A}`]: [{ x: 2 }] } } },
    "/interesse/demo",
  );
  assert.deepEqual(Object.keys(hm.properties.$heatmap_data).sort(), ["https://x.pt/evento/demo/:id", "https://x.pt/interesse/demo"]);
});

test("configuração de privacidade: UE, texto e inputs mascarados, sem consola/rede/exceções", () => {
  const c = configPostHog();
  assert.equal(c.api_host, HOST_UE);
  assert.equal(c.mask_all_text, true);
  assert.equal(c.mask_all_element_attributes, true);
  assert.equal(c.session_recording.maskAllInputs, true);
  assert.equal(c.session_recording.maskTextSelector, "*");
  assert.match(c.session_recording.blockSelector, /img/);
  // máscara sem comprimento: o texto mascarado não diz quantas letras tinha
  assert.equal(c.session_recording.maskInputFn("939888777"), c.session_recording.maskInputFn("a"));
  assert.equal(c.session_recording.maskTextFn("Zeferina Canário"), c.session_recording.maskTextFn("Ana"));
  assert.equal(c.session_recording.maskTextFn("\n  "), "\n  ");
  assert.equal(c.session_recording.recordHeaders, false);
  assert.equal(c.session_recording.recordBody, false);
  assert.equal(c.enable_recording_console_log, false);
  assert.equal(c.capture_performance, false);
  assert.equal(c.capture_exceptions, false);
  assert.equal(c.person_profiles, "identified_only");
  assert.equal(typeof c.before_send, "function");
});

test("aviso de rota antes do arranque não vai para a fila (não pára a gravação depois)", async () => {
  const avisos = [];
  const f = { ...falso(), aoMudarDeRota: (medida) => avisos.push(medida) };
  let soltar;
  const a = criarAnalytics({
    ambiente: "test",
    carregarFornecedor: () => new Promise((r) => { soltar = () => r(f); }),
    lerContexto: () => ({ caminho: "/interesse/demo", autenticado: false }),
  });
  a.mudouDeRota("/"); // a visita começou numa rota não medida
  soltar();
  await a.pronto;
  assert.deepEqual(avisos, []); // nada despejado da fila
  a.mudouDeRota("/acompanhar/x"); // já com o fornecedor: aplica-se
  a.mudouDeRota("/interesse/demo");
  assert.deepEqual(avisos, [false, true]);
});
