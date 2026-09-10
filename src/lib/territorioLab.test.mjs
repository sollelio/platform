import test from "node:test";
import assert from "node:assert/strict";
import {
  pontoDaLocalidade,
  haversineKm,
  estimarKm,
  arco,
  atribuirRede,
  metricasRede,
  compararRedes,
  localidadeMaisProxima,
  COORDS_LOCALIDADE,
  NUCLEO_PROVISORIO,
  nucleoPorOmissao,
} from "./territorioLab/geo.js";
import {
  FOTOGRAFIA,
  KM_REAIS,
  estadoDoRegisto,
  eOperacional,
} from "./territorioLab/fotografia.js";

// ============================================================
// O Vision Prototype é staging, mas a geometria é código a sério:
// se a atribuição ou as métricas mentirem, a demonstração mente.
// ============================================================

test("a fotografia é a query real, sanitizada (19 registos, sem PII)", () => {
  assert.equal(FOTOGRAFIA.length, 19);
  for (const r of FOTOGRAFIA) {
    assert.ok(!("nome" in r), "sem nomes");
    assert.ok(!r.respostas?.contactoPrincipal, "sem contactos");
    assert.ok(!r.respostas?.numeroWhatsapp, "sem whatsapp");
  }
  assert.equal(Object.keys(KM_REAIS).length, 4);
});

test("todas as localidades da fotografia resolvem para um ponto curado (ou ficam fora, contadas)", () => {
  const textos = FOTOGRAFIA.map(
    (r) => r.local_evento || r.respostas?.localEvento || "",
  );
  const resolvidos = textos.map((t) => pontoDaLocalidade(t));
  const fora = resolvidos.filter((p) => p === null).length;
  // 2 sem localidade + «Grande Lisboa» (vago) = 3 fora do mapa
  assert.equal(fora, 3);
  // As gralhas reais resolvem para a localidade certa:
  assert.equal(pontoDaLocalidade("Sociedade 1º de Dezembro").chave, "rio de mouro");
  assert.equal(pontoDaLocalidade("Guia Louge ( Cascais)").chave, "guia");
  assert.equal(pontoDaLocalidade("Av da liberdade").chave, "lisboa");
  assert.equal(pontoDaLocalidade("Grande Lisboa"), null); // vago nunca se adivinha
});

test("haversine e o estimador de estrada batem com a realidade conhecida", () => {
  // Ericeira → Lourinhã: ~31 km em linha reta; a estrada real dos
  // orçamentos deu 79 km DESDE A BASE DE PRICING (que não é a sede) —
  // o teste só garante ordem de grandeza do haversine, não igualdade.
  const d = haversineKm(COORDS_LOCALIDADE.ericeira, COORDS_LOCALIDADE.lourinha);
  assert.ok(d > 25 && d < 40, `ericeira→lourinhã ${d.toFixed(1)} km`);
  // O estimador aplica o fator uniforme e arredonda:
  assert.equal(estimarKm([0, 0], [0, 0]), 0);
  const e = estimarKm(COORDS_LOCALIDADE.lisboa, COORDS_LOCALIDADE.setubal);
  assert.ok(e >= 35 && e <= 55, `lisboa→setúbal ≈${e} km`);
});

test("o arco é uma curva de A a B (pontas exatas, barriga no meio)", () => {
  const a = [-9.4, 38.7];
  const b = [-9.0, 38.5];
  const pts = arco(a, b);
  assert.deepEqual(pts[0], a);
  assert.deepEqual(pts[pts.length - 1], b);
  const meio = pts[Math.floor(pts.length / 2)];
  const reta = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  assert.ok(
    Math.abs(meio[0] - reta[0]) + Math.abs(meio[1] - reta[1]) > 0.01,
    "curva de verdade, não uma reta",
  );
});

// A mesma derivação do componente: mapeados = com ponto curado;
// operacionais = eventos (realizado/garantido), a população da REDE.
const mapeados = FOTOGRAFIA.map((r) => {
  const p = pontoDaLocalidade(r.local_evento || r.respostas?.localEvento || "");
  return p
    ? { id: r.id, lngLat: p.lngLat, localidade: p.chave, estado: estadoDoRegisto(r) }
    : null;
}).filter(Boolean);
const operacionais = mapeados.filter((e) => eOperacional(e.estado));

test("Procura ≠ Operações: pedidos em conversa NUNCA entram na rede como eventos", () => {
  assert.equal(mapeados.length, 16); // pedidos registados no mapa
  assert.equal(operacionais.length, 10); // eventos: realizados + garantidos
  // Barreiro e Amora são pedidos em conversa — procura, não operação:
  const idsOp = new Set(operacionais.map((e) => e.localidade));
  assert.ok(!idsOp.has("barreiro"), "barreiro (conversa) fora da rede");
  assert.ok(!idsOp.has("amora"), "amora (conversa) fora da rede");
  // …mas continuam nos pedidos mapeados (a lente Procura vê-os):
  const idsMap = new Set(mapeados.map((e) => e.localidade));
  assert.ok(idsMap.has("barreiro") && idsMap.has("amora"));
  // e um registo perdido contaria como procura, nunca como evento:
  assert.equal(estadoDoRegisto({ fase: "perdido", status: "Concluído" }), "perdido");
  assert.ok(!eOperacional("perdido"));
  assert.ok(!eOperacional("conversa"));
});

test("a rede atribui cada EVENTO ao núcleo mais próximo — e um 2.º núcleo em Almada rouba a Margem Sul", () => {
  const soSede = atribuirRede(operacionais, [NUCLEO_PROVISORIO]);
  const mSede = metricasRede(soSede);
  assert.equal(mSede.n, 10);
  assert.equal(mSede.porNucleo.atual, 10);
  assert.ok(mSede.maior >= mSede.mediana && mSede.mediana > 0);

  const comAlmada = atribuirRede(operacionais, [
    NUCLEO_PROVISORIO,
    { id: "b", nome: "Simulado", lngLat: COORDS_LOCALIDADE.almada },
  ]);
  const comp = compararRedes(soSede, comAlmada);
  // A Margem Sul operacional (alhos vedros, sesimbra) e a coroa de
  // Lisboa ficam mais perto de Almada do que da Ericeira:
  assert.ok(comp.mudaram >= 5, `mudaram ${comp.mudaram}`);
  assert.ok(comp.delta < 0, "a distância agregada DESCE com o núcleo em Almada");
  const doB = comAlmada.filter((e) => e.nucleoId === "b").map((e) => e.localidade);
  for (const l of ["alhos vedros", "sesimbra"]) {
    assert.ok(doB.includes(l), `${l} devia ir para Almada`);
  }
});

test("a atribuição aceita uma métrica injetada — o caminho do refinamento por estrada", () => {
  // Km «por estrada» fabricados que CONTRARIAM o estimador: tudo
  // fica mais perto do simulado. A regra de atribuição é a mesma;
  // só a métrica muda — exatamente o contrato do refino.
  const kmsB = new Map(operacionais.map((e) => [e.id, 1]));
  const kmsA = new Map(operacionais.map((e) => [e.id, 999]));
  const rede = atribuirRede(
    operacionais,
    [NUCLEO_PROVISORIO, { id: "b", lngLat: COORDS_LOCALIDADE.almada }],
    (n, e) => (n.id === "b" ? kmsB : kmsA).get(e.id),
  );
  assert.ok(rede.every((e) => e.nucleoId === "b"));
  assert.equal(metricasRede(rede).total, operacionais.length);
});

test("o núcleo de arranque do staging é o armazém CONFIGURADO (Sintra), não o provisório", () => {
  const n = nucleoPorOmissao();
  assert.equal(n.configurado, true);
  assert.equal(n.provisorio, false);
  assert.match(n.localidade, /Armazém/);
  // A posição configurada tem de estar na zona de Sintra (precisão
  // declarada: localidade — nunca uma morada exata no repositório):
  const kmAoCentro = haversineKm(n.lngLat, COORDS_LOCALIDADE.sintra);
  assert.ok(kmAoCentro < 5, `armazém a ${kmAoCentro.toFixed(1)} km do centro de Sintra`);
});

test("localidadeMaisProxima dá nome a um ponto largado no mapa", () => {
  const perto = localidadeMaisProxima([-9.15, 38.68]);
  assert.equal(perto.chave, "almada");
  assert.match(perto.nome, /Almada/);
});
