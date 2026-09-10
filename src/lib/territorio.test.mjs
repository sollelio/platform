import test from "node:test";
import assert from "node:assert/strict";
import {
  classificarLocalidade,
  normalizarLocalidade,
} from "./territorio/zonas.js";
import {
  construirCenso,
  gerarAtlas,
  percentagemHonesta,
  pontosDeSensibilidade,
  agruparApertos,
  contextoAvaliacao,
} from "./territorio/motor.js";

// ============================================================
// O Atlas testa-se com a FOTOGRAFIA REAL de produção (query corrida
// pelo Hélio a 10/09/2026, 19 pedidos registados) — se as frases
// mudarem de conteúdo com estes dados, é para se dar por isso aqui,
// não no ecrã da Nádia.
// (Sem nomes nem contactos: só os campos agregáveis da query.)
// ============================================================

const R = (localidade, tipo, fase, status, data, convidados, valor, pedidoEm) => ({
  id: `id-${pedidoEm}-${localidade || "x"}`,
  local_evento: null,
  respostas: { localEvento: localidade || undefined, tipoLocal: tipo || undefined },
  fase,
  status,
  data_evento: data,
  numero_convidados: convidados,
  valor_acordado: valor,
  created_at: `${pedidoEm}T12:00:00Z`,
});

const PRODUCAO = [
  R("Sociedade 1º de Dezembro", "Salão", "projecto", "Concluído", "2026-07-19", 25, "280.00", "2026-07-12"),
  R("Av da liberdade", "Outro: Escritório", "projecto", "Concluído", "2026-07-24", 40, "270.00", "2026-07-12"),
  R("Alhos Vedros - Margem Sul", "Ao domicílio", "projecto", "Concluído", "2026-07-25", 12, "282.00", "2026-07-13"),
  R("Guia Louge ( Cascais)", "Quinta", "projecto", "Concluído", "2026-08-01", 60, "800.00", "2026-07-13"),
  R("Sesimbra ( associação disportiva de azóia)", "Salão", "contrato", "Recebido", "2026-09-05", 80, "1565.00", "2026-07-13"),
  R("Loures", "Salão", "contrato", "Recebido", "2026-12-26", 144, "986.00", "2026-07-13"),
  R("Cascais", "Ao domicílio", "projecto", "Concluído", "2026-08-16", 25, "770.00", "2026-07-13"),
  R("Venda do pinheiro", "Ao domicílio", "contrato", "Recebido", "2026-09-19", null, "668.00", "2026-07-13"),
  R("Rio de Mouro", "Salão", "contrato", "Concluído", "2026-08-22", 50, "650.00", "2026-07-16"),
  R("Camarate", "Salão", "cliente", "Recebido", "2026-11-01", 42, "1020.00", "2026-07-17"),
  R(null, "Salão", "interessado", "Recebido", "2026-09-12", 50, "950.00", "2026-07-18"),
  R("Barreiro", "Outro: Salão de clube desportivo", "interessado", "Recebido", "2026-10-30", 80, "1290.00", "2026-07-21"),
  R("Grande Lisboa", "Salão", "contrato", "Concluído", "2026-08-15", 20, "280.00", "2026-07-29"),
  R("Lourinhã", "Salão", "interessado", "Recebido", "2026-10-05", 55, "648.90", "2026-08-07"),
  R("Cascais", "Outro: A escolher ainda", "interessado", "Recebido", "2027-03-09", 40, "780.00", "2026-08-09"),
  R(null, null, "sinal", "Recebido", null, null, null, "2026-08-27"),
  R("Cascais", "Exterior", "interessado", "Recebido", "2026-09-26", 50, null, "2026-08-30"),
  R("Amadora", "Salão", "interessado", "Recebido", "2026-09-16", 30, null, "2026-08-31"),
  R("Amora", "Ao domicílio", "interessado", "Recebido", "2026-12-05", 30, "1330.00", "2026-08-31"),
];

const HOJE = new Date("2026-09-10T10:00:00Z");

// ---- zonas: as correções reais, uma a uma ----

test("classificarLocalidade arruma as gralhas reais de produção", () => {
  assert.equal(classificarLocalidade("Sociedade 1º de Dezembro").concelho, "Sintra");
  assert.equal(classificarLocalidade("Guia Louge ( Cascais)").concelho, "Cascais");
  assert.equal(
    classificarLocalidade("Sesimbra ( associação disportiva de azóia)").concelho,
    "Sesimbra",
  );
  assert.equal(classificarLocalidade("Alhos Vedros - Margem Sul").concelho, "Moita");
  assert.equal(classificarLocalidade("Av da liberdade").zona, "Lisboa");
  assert.equal(classificarLocalidade("Venda do pinheiro").zona, "Norte de Lisboa");
});

test("vago e desconhecido nunca se adivinham", () => {
  assert.equal(classificarLocalidade("Grande Lisboa").estado, "vaga");
  assert.equal(classificarLocalidade("Vale de Cambra").estado, "por_classificar");
  assert.equal(classificarLocalidade("").estado, "vazia");
  assert.equal(classificarLocalidade(null).estado, "vazia");
});

test("normalização é determinística (acentos, maiúsculas, espaços)", () => {
  assert.equal(normalizarLocalidade("  LOURINHÃ  "), "lourinha");
  assert.equal(normalizarLocalidade("Rio  de   Mouro"), "rio de mouro");
});

// ---- censo: os números da fotografia ----

test("o censo conta a fotografia real como o levantamento contou", () => {
  const c = construirCenso(PRODUCAO, HOJE);
  assert.equal(c.n, 19);
  assert.equal(c.semLocalidade.length, 2);
  assert.equal(c.vagas.length, 1); // «Grande Lisboa»
  assert.equal(c.porClassificar.length, 0); // as correções cobrem tudo
  assert.equal(c.zonaveis.length, 16);
  const zonas = Object.fromEntries(c.zonasOrdenadas.map((z) => [z.zona, z.n]));
  assert.equal(zonas["Linha de Sintra/Cascais"], 7);
  assert.equal(zonas["Margem Sul"], 4);
  assert.equal(zonas["Norte de Lisboa"], 3);
  assert.equal(zonas["Lisboa"], 1);
  assert.equal(zonas["Oeste"], 1);
  assert.equal(c.comValor.length, 16);
  assert.equal(c.perdidos.length, 0);
});

// ---- regime de números: derivado, não decretado ----

test("percentagens só com licença (n≥20), múltiplos de 5 até 39", () => {
  assert.equal(percentagemHonesta(7, 16), null);
  assert.equal(percentagemHonesta(7, 19), null);
  assert.equal(percentagemHonesta(8, 20), "40% (8 de 20)");
  assert.equal(percentagemHonesta(9, 25), "35% (9 de 25)");
  assert.equal(percentagemHonesta(20, 40), "50%");
  assert.equal(pontosDeSensibilidade(19), 5);
});

// ---- frases: o que acende hoje, e como ----

test("concentração acende com vantagem em eventos (7 vs 4), nunca quota", () => {
  const atlas = gerarAtlas(PRODUCAO, { hoje: HOJE });
  const f = atlas.ativas.find((x) => x.id === "concentracao");
  assert.ok(f, "concentração devia estar acesa");
  const texto = f.segmentos.map((s) => s.v).join("");
  assert.match(texto, /7/);
  assert.match(texto, /Linha de Sintra\/Cascais/);
  assert.match(texto, /Margem Sul, com 4/);
  // honestidade epistemológica: fala de pedidos registados, nunca de «procura»
  assert.match(texto, /pedidos registados/);
});

test("três frentes acende (3 zonas com ≥2)", () => {
  const atlas = gerarAtlas(PRODUCAO, { hoje: HOJE });
  assert.ok(atlas.ativas.find((x) => x.id === "tres-frentes"));
});

test("o funil da zona conta parcelas, nunca taxas", () => {
  const atlas = gerarAtlas(PRODUCAO, { hoje: HOJE });
  const f = atlas.ativas.find((x) => x.id === "funil-zona");
  assert.ok(f);
  const texto = f.segmentos.map((s) => s.v).join("");
  assert.match(texto, /Linha de Sintra\/Cascais/); // a zona com mais registos
  assert.doesNotMatch(texto, /%/);
  assert.match(texto, /perdidos, ainda nenhum registado/);
});

test("procura perdida DORME com 0 perdidos — e diz porquê", () => {
  const atlas = gerarAtlas(PRODUCAO, { hoje: HOJE });
  const d = atlas.adormecidas.find((x) => x.id === "procura-perdida");
  assert.ok(d, "devia estar a dormir");
  assert.match(d.condicao, /não te sei dizer onde recusas/);
});

test("procura perdida ACORDA com 3 perdas do mesmo motivo", () => {
  const comPerdas = [
    ...PRODUCAO,
    { ...R("Setúbal", "Salão", "perdido", "Recebido", "2026-10-01", 40, null, "2026-09-01"), motivo_perda: "distancia" },
    { ...R("Sesimbra", "Salão", "perdido", "Recebido", "2026-10-02", 30, null, "2026-09-02"), motivo_perda: "distancia" },
    { ...R("Palmela", "Salão", "perdido", "Recebido", "2026-10-03", 20, null, "2026-09-03"), motivo_perda: "distancia" },
  ];
  const atlas = gerarAtlas(comPerdas, { hoje: HOJE });
  const f = atlas.ativas.find((x) => x.id === "procura-perdida");
  assert.ok(f, "devia ter acordado");
  const texto = f.segmentos.map((s) => s.v).join("");
  assert.match(texto, /3/);
  assert.match(texto, /distância/i);
});

test("alcance e estrada cobrada acendem com deslocações conhecidas", () => {
  const deslocacoes = [
    { submissionId: PRODUCAO[13].id, distanciaKm: 78.9, duracaoMin: 55, nTrocos: 2, isento: false, valor: 74 },
    { submissionId: PRODUCAO[6].id, distanciaKm: 25, duracaoMin: null, nTrocos: 2, isento: false, valor: 20 },
    { submissionId: PRODUCAO[3].id, distanciaKm: 30, duracaoMin: null, nTrocos: 2, isento: true, valor: 0 },
  ];
  const atlas = gerarAtlas(PRODUCAO, { hoje: HOJE, deslocacoes });
  const alcance = atlas.ativas.find((x) => x.id === "alcance");
  assert.ok(alcance);
  assert.match(alcance.segmentos.map((s) => s.v).join(""), /79 km/);
  const estrada = atlas.ativas.find((x) => x.id === "estrada-rendida");
  assert.ok(estrada);
  const texto = estrada.segmentos.map((s) => s.v).join("");
  assert.match(texto, /94 €/); // 74 + 20, a isenta fica de fora da soma
  assert.match(texto, /1 oferecida/);
});

test("apertos: 15/08 (Grande Lisboa) + 16/08 (Cascais) partilham a janela ±2", () => {
  const c = construirCenso(PRODUCAO, HOJE);
  const clusters = agruparApertos(c.pedidos, HOJE);
  // Estes dois já estão Concluídos — não são aperto vivo. Mas 05/09
  // (Sesimbra, contrato) está sozinho; 12/09+16/09 tocam-se? 12→16 são
  // 4 dias = 2·buffer → SIM, partilham; 16→19 são 3 → junta; 26/09 fica fora.
  const alvo = clusters.find((cl) => cl.de === "2026-09-12");
  assert.ok(alvo, "o aperto de 12–19/09 devia existir");
  assert.equal(alvo.lista.length, 3); // 12/09, 16/09 (Amadora), 19/09 (Venda do Pinheiro)
  assert.ok(alvo.zonas.includes("por localizar")); // o 12/09 não tem localidade
});

test("arrumação aponta os 2 sem localidade e o vago, com honestidade", () => {
  const atlas = gerarAtlas(PRODUCAO, { hoje: HOJE });
  const sem = atlas.arrumacao.find((x) => x.id === "sem-localidade");
  assert.equal(sem.porque.linhas.length, 2);
  const cls = atlas.arrumacao.find((x) => x.id === "por-classificar");
  assert.equal(cls.porque.linhas.length, 1); // «Grande Lisboa»
});

test("contexto de avaliação: interessados com localidade e valor típico", () => {
  const c = construirCenso(PRODUCAO, HOJE);
  const ctx = contextoAvaliacao(c, []);
  assert.ok(ctx.interessados.length >= 5);
  assert.equal(ctx.valorTipico, 775); // mediana dos 16 valores: (770+780)/2
});

test("um pedido perdido CONTINUA a contar como procura — e sai das operações", () => {
  // Barreiro (interessado, Margem Sul, 1.290 €, 30/10) dá-se por perdido.
  const comPerda = PRODUCAO.map((p, i) =>
    i === 11 ? { ...p, fase: "perdido", motivo_perda: "preco" } : p,
  );
  const c = construirCenso(comPerda, HOJE);
  // O registo não desaparece de nenhuma população de PROCURA:
  assert.equal(c.n, 19);
  assert.equal(c.zonaveis.length, 16);
  assert.equal(c.perdidos.length, 1);
  const zonas = Object.fromEntries(c.zonasOrdenadas.map((z) => [z.zona, z.n]));
  assert.equal(zonas["Margem Sul"], 4); // a zona não o perde
  const atlas = gerarAtlas(comPerda, { hoje: HOJE });
  // Concentração continua sobre os 16 com zona (o perdido incluído):
  const conc = atlas.ativas.find((x) => x.id === "concentracao");
  assert.match(conc.segmentos.map((s) => s.v).join(""), /16 pedidos registados/);
  // Valor por zona continua a incluí-lo — com a nota «não é receita»:
  const valor = atlas.ativas.find((x) => x.id === "valor-zona");
  assert.match(valor.segmentos.map((s) => s.v).join(""), /Margem Sul/);
  assert.match(valor.porque.notas.join(" "), /perdido/);
  // Mas sai da agenda OPERACIONAL (próximos 90 dias):
  const cal = atlas.ativas.find((x) => x.id === "calendario-90");
  assert.doesNotMatch(
    cal.porque.linhas.map((l) => l.texto).join("\n"),
    /Barreiro/,
  );
  // Recuperar devolve-o ao funil e à agenda:
  const recuperado = comPerda.map((p) =>
    p.fase === "perdido" ? { ...p, fase: "interessado", motivo_perda: null } : p,
  );
  const cal2 = gerarAtlas(recuperado, { hoje: HOJE }).ativas.find(
    (x) => x.id === "calendario-90",
  );
  assert.match(cal2.porque.linhas.map((l) => l.texto).join("\n"), /Barreiro/);
});

test("o funil da zona mostra o perdido na parcela certa", () => {
  // Um Cascais (interessado, Linha) dá-se por perdido — a zona líder
  // continua a ser a Linha (7, o perdido conta) e a parcela aparece.
  const comPerda = PRODUCAO.map((p, i) =>
    i === 14 ? { ...p, fase: "perdido", motivo_perda: "distancia" } : p,
  );
  const f = gerarAtlas(comPerda, { hoje: HOJE }).ativas.find(
    (x) => x.id === "funil-zona",
  );
  const texto = f.segmentos.map((s) => s.v).join("");
  assert.match(texto, /Linha de Sintra\/Cascais/);
  assert.match(texto, /7/); // o perdido continua nos 7 da zona
  assert.match(texto, /1 perdido/);
});

test("nenhuma frase ativa usa a palavra «procura» como população", () => {
  const atlas = gerarAtlas(PRODUCAO, { hoje: HOJE });
  for (const f of atlas.ativas) {
    const texto = f.segmentos.map((s) => s.v).join("");
    // «procura» só é admissível na frase de procura perdida (que fala
    // do que NÃO está registado, com a ressalva no porquê)
    if (f.id !== "procura-perdida") {
      assert.doesNotMatch(texto, /\bprocura\b/i, `frase ${f.id}: ${texto}`);
    }
  }
});
