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
// Oito dos doze separadores têm slug diferente do id; os outros quatro
// coincidem e estão listados na mesma, de propósito: a tabela é a
// lista completa, não a lista das excepções.
// ============================================================

// O separador onde a app abre, e para onde caem os URLs desconhecidos.
export const SEPARADOR_POR_OMISSAO = "inicio";

// id interno (o que o código usa) -> slug (o que o URL mostra)
export const SLUG_POR_ID = {
  inicio: "inicio",
  clientes: "contactos",
  calendario: "agenda",
  orcamentos: "documentos",
  operacional: "logistica",
  convites: "formularios",
  mensagens: "mensagens",
  comunicados: "envios",
  dashboard: "dashboard",
  avaliacoes: "avaliacoes",
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

// O caminho da ficha de UM contacto. Existe para os quatro sítios que a
// compunham à mão deixarem de o fazer: quando o slug mudou de
// «clientes» para «contactos», foram eles que quase ficaram para trás.
export const caminhoDoContacto = (id) =>
  `${caminhoDoSeparador("clientes")}/${id}`;

// ------------------------------------------------------------
// SLUGS QUE JÁ FORAM VÁLIDOS.
//
// Renomear um separador não pode matar o que já circulou: um favorito
// da Nádia, um endereço colado numa nota, um separador do browser
// aberto há três dias. Um slug antigo traduz-se para o novo PRESERVANDO
// o resto do caminho — /admin/clientes/<id> passa a
// /admin/contactos/<id>, e a ficha certa abre.
//
// Não é dívida: é a única forma de um nome poder mudar sem custo. Quando
// deixar de haver quem use o antigo, apaga-se a linha.
// ------------------------------------------------------------
export const SLUG_ANTIGO = {
  clientes: "contactos", // renomeado a 29/07/2026 (ver docs/glossario.md)
  comunicados: "envios", // renomeado a 09/08/2026 (ver docs/glossario.md)
};

export const caminhoDeSlugAntigo = (slug, ...resto) => {
  const novo = SLUG_ANTIGO[slug];
  if (!novo) return null;
  return ["/admin", novo, ...resto.filter(Boolean)].join("/");
};
