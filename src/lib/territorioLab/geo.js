// ============================================================
// territorioLab/geo.js — a geometria do Atlas.
//
// GEOCODIFICAÇÃO: tabela CURADA de centróides de localidade, embutida
// — nenhum serviço externo é consultado, nenhuma morada sai daqui.
// Precisão declarada: LOCALIDADE (nunca rooftop; as posições são o
// centro da terra, não a casa de ninguém). Pedidos sem localidade ou
// com localidade vaga ficam FORA do mapa e são contados à parte —
// NUNCA se inventa uma coordenada. Localidade nova que ainda não
// esteja na tabela = registo «fora do mapa» até alguém a curar aqui
// (o processo certo à escala atual: dezenas de localidades, não
// milhares — uma plataforma GIS seria peso sem necessidade).
//
// DISTÂNCIAS: a única distância "verdadeira" no sistema são os km
// congelados nas linhas de Deslocação dos orçamentos. Para a
// simulação de núcleos usa-se SEMPRE o mesmo estimador para todos
// os núcleos — linha reta (haversine) × 1,3 de fator de estrada —
// para a comparação ser justa; o refinamento por estrada vem da
// função atlas-distancias (só coordenadas de localidade, nunca
// moradas). A aproximação é declarada na UI.
//
// NÚCLEO OPERACIONAL ≠ base de pricing (decisão de 03/08/2026: a
// MORADA_BASE dos orçamentos NÃO é o armazém). A posição real vive
// versionada em nucleoConfig.js (ver a decisão lá); o localStorage
// só serve de bootstrap quando não há configuração.
// ============================================================

import { normalizarLocalidade } from "../territorio/zonas.js";
import { NUCLEO_REAL } from "./nucleoConfig.js";

export const FATOR_ESTRADA = 1.3;

// Centróides de localidade (curadoria manual; precisão de localidade).
export const COORDS_LOCALIDADE = {
  // Linha de Cascais/Sintra
  cascais: [-9.4215, 38.6968],
  estoril: [-9.3977, 38.7057],
  guia: [-9.447, 38.695],
  parede: [-9.3565, 38.6899],
  carcavelos: [-9.334, 38.692],
  oeiras: [-9.311, 38.687],
  queluz: [-9.2545, 38.7566],
  "agualva-cacem": [-9.2988, 38.77],
  "rio de mouro": [-9.332, 38.766],
  "algueirao-mem martins": [-9.343, 38.798],
  sintra: [-9.3817, 38.8029],
  amadora: [-9.2399, 38.7597],
  // Lisboa e norte
  lisboa: [-9.1393, 38.7223],
  odivelas: [-9.184, 38.792],
  loures: [-9.1685, 38.8309],
  camarate: [-9.125, 38.792],
  sacavem: [-9.108, 38.79],
  "vila franca de xira": [-8.9902, 38.9552],
  "alverca do ribatejo": [-9.038, 38.898],
  // Mafra / Oeste
  mafra: [-9.327, 38.937],
  ericeira: [-9.417, 38.9631],
  "venda do pinheiro": [-9.245, 38.923],
  malveira: [-9.257, 38.933],
  "torres vedras": [-9.259, 39.091],
  lourinha: [-9.313, 39.241],
  peniche: [-9.3811, 39.3558],
  alenquer: [-9.009, 39.053],
  "arruda dos vinhos": [-9.078, 38.984],
  "sobral de monte agraco": [-9.152, 39.019],
  // Margem Sul
  almada: [-9.1569, 38.679],
  "costa da caparica": [-9.235, 38.644],
  seixal: [-9.101, 38.64],
  amora: [-9.115, 38.629],
  barreiro: [-9.072, 38.663],
  moita: [-8.99, 38.651],
  "alhos vedros": [-9.025, 38.652],
  montijo: [-8.973, 38.706],
  alcochete: [-8.962, 38.754],
  sesimbra: [-9.101, 38.444],
  setubal: [-8.893, 38.524],
  palmela: [-8.901, 38.569],
};

// As gralhas/casos reais da fotografia → localidade do PONTO (o mesmo
// espírito das correções do zonamento, mas ao nível da localidade).
const CORRECOES_PONTO = {
  "sociedade 1º de dezembro": "rio de mouro",
  "sociedade 1o de dezembro": "rio de mouro",
  "guia louge ( cascais)": "guia",
  "guia lounge (cascais)": "guia",
  "sesimbra ( associacao disportiva de azoia)": "sesimbra",
  "alhos vedros - margem sul": "alhos vedros",
  "av da liberdade": "lisboa",
  "avenida da liberdade": "lisboa",
};

// texto livre → { chave, lngLat } | null (sem adivinhar: só dicionário)
export const pontoDaLocalidade = (texto) => {
  const norm = normalizarLocalidade(texto);
  if (!norm) return null;
  const chave = CORRECOES_PONTO[norm] || norm;
  const lngLat = COORDS_LOCALIDADE[chave];
  return lngLat ? { chave, lngLat } : null;
};

// ---- distâncias ----

export const haversineKm = ([lng1, lat1], [lng2, lat2]) => {
  const R = 6371;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

// A estimativa ÚNICA da simulação (declarada na UI): linha reta ×1,3.
export const estimarKm = (a, b) => Math.round(haversineKm(a, b) * FATOR_ESTRADA);

// ---- arcos (núcleo → evento) ----
// Curva quadrática no plano geográfico: o ponto de controlo desloca-se
// na perpendicular do segmento. Devolve coordenadas prontas para uma
// LineString (com lineMetrics, o gradiente dá o "fluxo").
export const arco = (a, b, curvatura = 0.22, passos = 40) => {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const cx = mx - dy * curvatura;
  const cy = my + dx * curvatura;
  const pts = [];
  for (let i = 0; i <= passos; i++) {
    const t = i / passos;
    const u = 1 - t;
    pts.push([
      u * u * a[0] + 2 * u * t * cx + t * t * b[0],
      u * u * a[1] + 2 * u * t * cy + t * t * b[1],
    ]);
  }
  return pts;
};

// ---- núcleos ----

export const NUCLEO_PROVISORIO = {
  id: "atual",
  nome: "Núcleo atual",
  // ⚠ POSIÇÃO PROVISÓRIA: a sede (Ericeira). Só entra em jogo quando
  // NÃO há configuração da casa (NUCLEO_REAL em nucleoConfig.js) —
  // hoje há; isto é a rede de segurança do dia em que uma casa nova
  // arrancar sem posição, com o gesto de bootstrap do próprio Atlas.
  lngLat: COORDS_LOCALIDADE.ericeira,
  localidade: "Ericeira (sede — provisório)",
  provisorio: true,
};

const CHAVE_LS = "dlm.atlasLab.nucleoAtual";

export const lerNucleoGuardado = () => {
  try {
    const raw = globalThis.localStorage?.getItem(CHAVE_LS);
    if (!raw) return null;
    const n = JSON.parse(raw);
    if (Array.isArray(n?.lngLat) && n.lngLat.length === 2) return n;
  } catch {
    /* localStorage indisponível — fica o provisório */
  }
  return null;
};

export const guardarNucleo = (lngLat, localidade) => {
  try {
    globalThis.localStorage?.setItem(
      CHAVE_LS,
      JSON.stringify({ lngLat, localidade, provisorio: false }),
    );
  } catch {
    /* sem persistência — o gesto vale para a sessão */
  }
};

export const limparNucleoGuardado = () => {
  try {
    globalThis.localStorage?.removeItem(CHAVE_LS);
  } catch {
    /* nada a limpar */
  }
};

// A posição de arranque SEM contar com o localStorage: a CONFIGURAÇÃO
// da casa (nucleoConfig.js), se existir; senão a provisória.
export const nucleoPorOmissao = () =>
  NUCLEO_REAL
    ? {
        id: "atual",
        nome: "Núcleo atual",
        lngLat: NUCLEO_REAL.lngLat,
        localidade: NUCLEO_REAL.localidade,
        provisorio: false,
        configurado: true,
      }
    : NUCLEO_PROVISORIO;

// A posição com que o Atlas arranca. A CONFIGURAÇÃO da casa ganha
// SEMPRE (a mesma verdade em qualquer browser — em produção, um valor
// guardado há meses num browser não pode sobrepor-se em silêncio à
// configuração atualizada); o localStorage só conta enquanto NÃO há
// configuração — é o gesto de bootstrap de quem fixou a posição à mão
// antes de ela existir no código. Por fim o provisório, marcado.
export const nucleoInicial = () =>
  NUCLEO_REAL ? nucleoPorOmissao() : lerNucleoGuardado() || nucleoPorOmissao();

// A localidade curada mais próxima de um ponto (para dar nome a um
// núcleo largado no mapa: «≈ perto de Almada»).
export const localidadeMaisProxima = (lngLat) => {
  let melhor = null;
  let melhorKm = Infinity;
  for (const [chave, coords] of Object.entries(COORDS_LOCALIDADE)) {
    const km = haversineKm(lngLat, coords);
    if (km < melhorKm) {
      melhorKm = km;
      melhor = chave;
    }
  }
  const nome = melhor
    .split(" ")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
  return { chave: melhor, nome, km: Math.round(melhorKm) };
};

// ---- a rede: atribuição e métricas ----

// Cada evento vai para o núcleo mais próximo. A `distancia` é
// injetável para a rede poder ser calculada com o estimador rápido
// (por omissão) OU com km por estrada já refinados — a MESMA regra de
// atribuição para os dois modos, só a métrica muda.
export const atribuirRede = (
  eventos,
  nucleos,
  distancia = (n, e) => estimarKm(n.lngLat, e.lngLat),
) =>
  eventos.map((e) => {
    let melhor = null;
    let melhorKm = Infinity;
    for (const n of nucleos) {
      const km = distancia(n, e);
      if (km < melhorKm) {
        melhorKm = km;
        melhor = n.id;
      }
    }
    return { ...e, nucleoId: melhor, kmEstimado: melhorKm };
  });

export const metricasRede = (rede) => {
  const kms = rede.map((e) => e.kmEstimado).sort((a, b) => a - b);
  const meio = Math.floor(kms.length / 2);
  const porNucleo = {};
  for (const e of rede) porNucleo[e.nucleoId] = (porNucleo[e.nucleoId] || 0) + 1;
  return {
    n: rede.length,
    total: kms.reduce((a, b) => a + b, 0),
    media: kms.length ? Math.round(kms.reduce((a, b) => a + b, 0) / kms.length) : 0,
    mediana: kms.length
      ? kms.length % 2
        ? kms[meio]
        : Math.round((kms[meio - 1] + kms[meio]) / 2)
      : 0,
    maior: kms.length ? kms[kms.length - 1] : 0,
    porNucleo,
  };
};

// Antes/depois: quantos mudariam de núcleo e o Δ agregado.
export const compararRedes = (antes, depois) => {
  const antigo = new Map(antes.map((e) => [e.id, e.nucleoId]));
  const mudaram = depois.filter((e) => antigo.get(e.id) !== e.nucleoId).length;
  const mA = metricasRede(antes);
  const mD = metricasRede(depois);
  return { mudaram, antes: mA, depois: mD, delta: mD.total - mA.total };
};

// A DIVISA entre dois núcleos: a mediatriz do segmento A–B (com a
// longitude corrigida pelo cos da latitude, senão a linha entorta).
// Serve o «campo de influência» SIMULADO durante o arrasto — é
// geometria do estimador, não área de cobertura real, e a UI di-lo
// («distribuição simulada dos eventos»). Devolve um segmento longo
// (±meiaLargura graus) pronto para uma LineString.
export const divisaEntre = (a, b, meiaLargura = 2.4) => {
  const mLat = (a[1] + b[1]) / 2;
  const esc = Math.cos((mLat * Math.PI) / 180);
  const mx = (a[0] + b[0]) / 2;
  // vetor A→B no plano corrigido; a divisa segue a perpendicular
  const dx = (b[0] - a[0]) * esc;
  const dy = b[1] - a[1];
  const norma = Math.hypot(dx, dy);
  if (norma < 1e-9) return null; // núcleos no mesmo sítio — sem divisa
  const px = -dy / norma;
  const py = dx / norma;
  return [
    [mx - (px * meiaLargura) / esc, mLat - py * meiaLargura],
    [mx + (px * meiaLargura) / esc, mLat + py * meiaLargura],
  ];
};

// ---- enquadramentos ----

export const bboxDe = (pontos, margem = 0.08) => {
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  for (const [lng, lat] of pontos) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  return [
    [minLng - margem, minLat - margem],
    [maxLng + margem, maxLat + margem],
  ];
};

export const VISTA_PORTUGAL = { center: [-8.35, 39.55], zoom: 5.6 };
