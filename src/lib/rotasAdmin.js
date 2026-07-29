// ============================================================
// rotasAdmin.js — a tradução entre o URL e o separador do backoffice.
//
// Duas regras que se contradiziam, e é aqui que se conciliam:
//
//   1. «Os ids dos separadores NUNCA mudam» (regra escrita em
//      Navegacao.jsx). O código, os handshakes de navegação e o
//      histórico dependem de `orcamentos`, `convites`, `calendario`,
//      `operacional`, `tiposEvento`.
//   2. O URL é para HUMANOS. A Nádia clica em «Documentos» — a barra
//      de endereço tem de dizer /admin/documentos, não
//      /admin/orcamentos. Um URL que diz uma palavra que a app já não
//      usa em lado nenhum é um URL que mente.
//
// Este ficheiro é o ÚNICO sítio onde as duas linguagens se encontram.
// Acrescentar um separador é acrescentar UMA linha aqui — e nada mais
// no resto da app precisa de saber que existe tradução.
//
// Cinco dos dez separadores têm slug diferente do id; os outros cinco
// coincidem e estão listados na mesma, de propósito: a tabela é a
// lista completa, não a lista das excepções.
// ============================================================

// O separador onde a app abre, e para onde caem os URLs desconhecidos.
export const SEPARADOR_POR_OMISSAO = "inicio";

// id interno (o que o código usa) -> slug (o que o URL mostra)
export const SLUG_POR_ID = {
  inicio: "inicio",
  clientes: "clientes",
  calendario: "agenda",
  orcamentos: "documentos",
  operacional: "logistica",
  convites: "formularios",
  mensagens: "mensagens",
  dashboard: "dashboard",
  tiposEvento: "modelos-evento",
  importar: "importar-clientes",
};

// slug -> id interno (derivado, para nunca haver duas listas a divergir)
export const ID_POR_SLUG = Object.fromEntries(
  Object.entries(SLUG_POR_ID).map(([id, slug]) => [slug, id]),
);

// O caminho de um separador. Um id desconhecido cai no separador por
// omissão em vez de compor um URL partido — a navegação nunca deve ser
// o sítio onde um erro de escrita se manifesta.
export const caminhoDoSeparador = (id) =>
  `/admin/${SLUG_POR_ID[id] || SLUG_POR_ID[SEPARADOR_POR_OMISSAO]}`;

// O id de um slug, ou null se o slug não existir — quem chama decide
// o que fazer com o null (a AdminPage redirecciona para o Início).
export const idDoSlug = (slug) => ID_POR_SLUG[slug] || null;
