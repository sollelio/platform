// ============================================================
// perda.js — o vocabulário do «perdido» (109).
//
// «Perdido» é um estado de NEGÓCIO: um pedido que existiu e não
// aconteceu. «Apagar» é outra coisa — registos que nunca deviam ter
// existido (erro de introdução, teste, duplicado técnico). A UI que
// perde pede sempre um motivo deste vocabulário; o Atlas lê-o para a
// procura recusada por zona, e as 3 primeiras perdas reais validam se
// as categorias estavam certas (decisão da Revisão 2, 10/09/2026).
// ============================================================

export const MOTIVOS_PERDA = [
  { chave: "distancia", rotulo: "Distância" },
  { chave: "preco", rotulo: "Preço" },
  { chave: "data_ocupada", rotulo: "Data ocupada" },
  { chave: "sem_resposta", rotulo: "Sem resposta" },
  { chave: "outro", rotulo: "Outro" },
];

export const rotuloMotivoPerda = (chave) =>
  MOTIVOS_PERDA.find((m) => m.chave === chave)?.rotulo || chave || null;
