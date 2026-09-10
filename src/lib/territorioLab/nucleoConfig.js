// ============================================================
// territorioLab/nucleoConfig.js — a posição ESTÁVEL do núcleo
// operacional no STAGING do Atlas.
//
// O localStorage serve para experimentar num browser; ISTO é o que
// faz o staging abrir já com o núcleo no sítio certo em QUALQUER
// browser/sessão, sem ninguém configurar nada. Vive num ficheiro do
// próprio Lab (versionado, entra no deploy do develop) e nunca é
// lido fora do Atlas — a produção não importa este módulo.
//
// Coordenadas [lng, lat] arredondadas (~100 m) — de propósito: a
// morada com número de porta NÃO entra no repositório; a precisão
// declarada do Atlas é a localidade. NUNCA usar a MORADA_BASE dos
// orçamentos aqui — são coisas diferentes (decisão de 03/08/2026).
//
// Posição fornecida pelo Hélio a 10/09/2026: o armazém fica na zona
// de Vale Flores, Sintra (Av. Paul Harris, 2710-72x — só a zona é
// que fica registada aqui).
// ============================================================

export const NUCLEO_REAL = {
  lngLat: [-9.38, 38.791],
  localidade: "Armazém (Sintra · Vale Flores)",
};
