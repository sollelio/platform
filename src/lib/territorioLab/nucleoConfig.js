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
// ⚠ A localização REAL do armazém ainda não existe no sistema.
// Quando existir, preenche-se assim (coordenadas [lng, lat] ao nível
// da localidade — nunca uma morada exata):
//
//   export const NUCLEO_REAL = {
//     lngLat: [-9.417, 38.963],
//     localidade: "Armazém — Ericeira",
//   };
//
// Enquanto for null, o Lab arranca no provisório (a sede, Ericeira)
// e di-lo com todas as letras. NUNCA usar a MORADA_BASE dos
// orçamentos aqui — são coisas diferentes (decisão de 03/08/2026).
// ============================================================

export const NUCLEO_REAL = null;
