// ============================================================
// territorioLab/estrada.js — o refinamento por ESTRADA do Atlas
// (o único ponto do Lab que faz uma chamada de rede).
//
// Dois níveis de rigor, de propósito:
//   · durante o ARRASTO, a simulação usa o estimador instantâneo
//     (linha reta ×1,3 — geo.js), que corre a cada frame sem custo;
//   · quando o cenário ESTABILIZA (largar o núcleo, escolher um
//     cenário), pede-se AQUI o cálculo por estrada à Edge Function
//     `atlas-distancias` — uma chamada por núcleo, com os destinos
//     todos em lote, nunca por frame.
//
// O que sai daqui continua a ser uma estimativa POR LOCALIDADE
// (centróides curados → centróides), não porta-a-porta — a UI di-lo.
// Nenhuma morada nem PII passa por aqui: só coordenadas.
//
// Cache por PAR (origem→destino), arredondado a ~100 m: os destinos
// mudam devagar (centróides de localidade), por isso o núcleo atual
// paga uma chamada por sessão e cada posição nova do simulado paga
// uma. Só os SUCESSOS ficam em cache (a mesma regra da
// obterDistancia) — e a cache é PARTILHÁVEL sem risco: km por
// estrada entre dois pontos é geografia, igual para toda a gente.
// Se a função não responder, tudo aqui rejeita — e o Atlas fica,
// honesto, na estimativa.
// ============================================================

import { supabase } from "../supabase";

const cache = new Map(); // "olng,olat|dlng,dlat" -> { km, duracaoMin }

// ~3 casas ≈ 110 m — de sobra para centróides de localidade, e faz
// dois pousos quase iguais do núcleo partilharem a cache.
export const chavePonto = ([lng, lat]) => `${lng.toFixed(3)},${lat.toFixed(3)}`;
const chavePar = (o, d) => `${chavePonto(o)}|${chavePonto(d)}`;

// Devolve, pela ordem dos destinos, { km inteiros, duracaoMin } por
// troço — ou lança se o serviço falhar ou algum troço vier vazio
// (refinamento é tudo-ou-nada: nunca se soma estrada com estimativa
// na mesma métrica).
export const kmPorEstrada = async (origem, destinos) => {
  const faltam = destinos.filter((d) => !cache.has(chavePar(origem, d)));
  if (faltam.length) {
    const { data, error } = await supabase.functions.invoke(
      "atlas-distancias",
      { body: { origem, destinos: faltam } },
    );
    if (error || !Array.isArray(data?.troncos)) {
      throw new Error("Cálculo por estrada indisponível.");
    }
    faltam.forEach((d, i) => {
      const t = data.troncos[i];
      if (t && typeof t.km === "number") {
        cache.set(chavePar(origem, d), {
          km: Math.round(t.km),
          duracaoMin:
            typeof t.duracaoMin === "number" ? Math.round(t.duracaoMin) : null,
        });
      }
    });
  }
  return destinos.map((d) => {
    const t = cache.get(chavePar(origem, d));
    if (!t) throw new Error("Um dos troços não pôde ser calculado.");
    return t;
  });
};
