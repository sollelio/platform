// ============================================================
// territorioLab/registos.js — a SEMÂNTICA das populações do Atlas
// (Procura ≠ Operações), num módulo sem dados.
//
// PROCURA fala de PEDIDOS REGISTADOS: todos, incluindo os em conversa
// e os perdidos — é de onde a procura vem, não do que a equipa fez.
// OPERAÇÕES fala de EVENTOS: só os realizados (Concluído) e os
// garantidos (fase pós-sinal) — deslocações que a equipa fez ou vai
// fazer. Um pedido em conversa ou perdido NUNCA vira visualmente um
// evento executado. A derivação vive AQUI, num sítio só, para o
// componente e os testes lerem a mesma regra.
//
// (Viveu em fotografia.js enquanto o Atlas era protótipo de staging;
// saiu de lá quando a fotografia congelada passou a fixture de testes
// e o Atlas passou a receber os registos vivos.)
// ============================================================

import { FASES_POS_SINAL } from "../fases.js";

export const estadoDoRegisto = (r) => {
  if (r.fase === "perdido") return "perdido";
  if (r.status === "Concluído") return "realizado";
  if (FASES_POS_SINAL.includes(r.fase)) return "garantido";
  return "conversa";
};

export const eOperacional = (estado) =>
  estado === "realizado" || estado === "garantido";
