// ============================================================
// territorioLab/nucleoConfig.js — a posição ESTÁVEL do núcleo
// operacional do Atlas.
//
// Decisão de produção (10/09/2026): fica CONFIGURAÇÃO VERSIONADA —
// a menor solução correta enquanto a casa é uma e o núcleo é um.
// É a mesma verdade em qualquer browser/sessão e ganha SEMPRE ao
// localStorage (ver nucleoInicial em geo.js). Quando houver segundo
// núcleo ou segunda casa, o caminho já desenhado é a tabela
// nucleos_operacionais (Revisão 2) — a arquitetura do Lab já fala
// de núcleos no plural; só a origem do dado mudará.
//
// Coordenadas [lng, lat] arredondadas (~100 m) — de propósito: a
// morada com número de porta NÃO entra no repositório; a precisão
// declarada do Atlas é a localidade. NUNCA usar a MORADA_BASE dos
// orçamentos aqui — são coisas diferentes (decisão de 03/08/2026).
//
// Posição fornecida pelo Hélio a 10/09/2026: o armazém fica na zona
// de Vale Flores, Sintra (só a zona é que fica registada aqui).
// ============================================================

export const NUCLEO_REAL = {
  lngLat: [-9.38, 38.791],
  localidade: "Armazém (Sintra · Vale Flores)",
};
