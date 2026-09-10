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
} from "./territorioLab/geo.js";
import { FOTOGRAFIA, KM_REAIS } from "./territorioLab/fotografia.js";

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

test("a rede atribui cada evento ao núcleo mais próximo — e um 2.º núcleo em Almada rouba a Margem Sul", () => {
  const eventos = FOTOGRAFIA.map((r) => {
    const p = pontoDaLocalidade(r.local_evento || r.respostas?.localEvento || "");
    return p ? { id: r.id, lngLat: p.lngLat, localidade: p.chave } : null;
  }).filter(Boolean);
  assert.equal(eventos.length, 16);

  const soSede = atribuirRede(eventos, [NUCLEO_PROVISORIO]);
  const mSede = metricasRede(soSede);
  assert.equal(mSede.n, 16);
  assert.equal(mSede.porNucleo.atual, 16);
  assert.ok(mSede.maior >= mSede.mediana && mSede.mediana > 0);

  const comAlmada = atribuirRede(eventos, [
    NUCLEO_PROVISORIO,
    { id: "b", nome: "Simulado", lngLat: COORDS_LOCALIDADE.almada },
  ]);
  const comp = compararRedes(soSede, comAlmada);
  // A Margem Sul inteira (alhos vedros, sesimbra, barreiro, amora) e
  // Lisboa ficam mais perto de Almada do que da Ericeira:
  assert.ok(comp.mudaram >= 5, `mudaram ${comp.mudaram}`);
  assert.ok(comp.delta < 0, "a distância agregada DESCE com o núcleo em Almada");
  const doB = comAlmada.filter((e) => e.nucleoId === "b").map((e) => e.localidade);
  for (const l of ["alhos vedros", "sesimbra", "barreiro", "amora"]) {
    assert.ok(doB.includes(l), `${l} devia ir para Almada`);
  }
});

test("localidadeMaisProxima dá nome a um ponto largado no mapa", () => {
  const perto = localidadeMaisProxima([-9.15, 38.68]);
  assert.equal(perto.chave, "almada");
  assert.match(perto.nome, /Almada/);
});
