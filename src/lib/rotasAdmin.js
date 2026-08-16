// ============================================================
// rotasAdmin.js — a tradução entre o URL e o backoffice.
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
//
// ── 108 · A TERCEIRA REGRA: A CASA VAI NO ENDEREÇO ──────────────
//
// /admin/:casa/documentos, /evento/:casa/:id, /briefing/:casa/:id —
// o mesmo padrão do /interesse/:slug (093), aplicado ao lado de
// dentro. A razão que o escolheu lá vale aqui: o endereço nunca
// mente, e uma «casa activa» guardada em estado invisível é
// precisamente o que faz escritas caírem no sítio errado sem ninguém
// reparar. Por isso NÃO há aqui variável de módulo com a casa: quem
// compõe um caminho passa a casa, sempre.
//
// Como a casa e o separador são AMBOS o primeiro segmento (um no
// endereço novo, o outro no antigo), a desambiguação também vive
// aqui — é a única lista que sabe o vocabulário todo. Ver
// `casaDoCaminho`.
// ============================================================

import { useMemo } from "react";
import { useParams } from "react-router-dom";

// O separador onde a app abre, e para onde caem os URLs desconhecidos.
export const SEPARADOR_POR_OMISSAO = "inicio";

// id interno (o que o código usa) -> slug (o que o URL mostra)
const SLUG_POR_ID = {
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
const ID_POR_SLUG = Object.fromEntries(
  Object.entries(SLUG_POR_ID).map(([id, slug]) => [slug, id]),
);

// ------------------------------------------------------------
// A RAIZ DE UM CAMINHO DO BACKOFFICE.
//
// Com casa, é o endereço de hoje. SEM casa, compõe o endereço ANTIGO
// (/admin/documentos) — e isso é escolha, não descuido: o antigo
// continua a funcionar (a porta redirecciona-o para a casa de quem
// entrou), enquanto um `/admin/undefined/documentos` seria um link
// partido que só se descobre ao clicar. Quando falta a casa, a
// degradação tem de cair num sítio que existe.
// ------------------------------------------------------------
const raiz = (prefixo, casa) => (casa ? `/${prefixo}/${casa}` : `/${prefixo}`);

// O caminho de um separador. Um id desconhecido cai no separador por
// omissão em vez de compor um URL partido — a navegação nunca deve ser
// o sítio onde um erro de escrita se manifesta.
export const caminhoDoSeparador = (casa, id) =>
  `${raiz("admin", casa)}/${SLUG_POR_ID[id] || SLUG_POR_ID[SEPARADOR_POR_OMISSAO]}`;

// O id de um slug, ou null se o slug não existir — quem chama decide
// o que fazer com o null (a AdminPage redirecciona para o Início).
export const idDoSlug = (slug) => ID_POR_SLUG[slug] || null;

// O caminho da ficha de UM contacto. Existe para os quatro sítios que a
// compunham à mão deixarem de o fazer: quando o slug mudou de
// «clientes» para «contactos», foram eles que quase ficaram para trás.
export const caminhoDoContacto = (casa, id) =>
  `${caminhoDoSeparador(casa, "clientes")}/${id}`;

// A casa própria de um evento, e a folha imprimível dele. Estavam
// escritos à mão em dezassete sítios — o mesmo erro que o
// `caminhoDoContacto` já tinha corrigido para os contactos, e que a
// entrada da casa no endereço tornava caro repetir.
export const caminhoDoEvento = (casa, id, aba) =>
  [raiz("evento", casa), id, aba].filter(Boolean).join("/");

export const caminhoDoBriefing = (casa, id) =>
  [raiz("briefing", casa), id].filter(Boolean).join("/");

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
const SLUG_ANTIGO = {
  clientes: "contactos", // renomeado a 29/07/2026 (ver docs/glossario.md)
  comunicados: "envios", // renomeado a 09/08/2026 (ver docs/glossario.md)
};

export const caminhoDeSlugAntigo = (casa, slug, ...resto) => {
  const novo = SLUG_ANTIGO[slug];
  if (!novo) return null;
  return [raiz("admin", casa), novo, ...resto.filter(Boolean)].join("/");
};

// ------------------------------------------------------------
// A CASA DO ENDEREÇO — e o endereço que ainda não a tem.
//
// Os três prefixos de dentro levam a casa no segmento seguinte. O
// problema é que o endereço ANTIGO punha ali outra coisa: um
// separador (/admin/documentos) ou o id de um evento (/evento/<uuid>),
// e a forma sozinha não os distingue de um slug de casa.
//
// Distingue-se pelo VOCABULÁRIO, que é meu: os doze slugs de separador
// mais os dois que já foram válidos. Nenhuma casa se chamará
// «documentos» — e se um dia alguém tentar, esta lista é o sítio onde
// isso se recusa, em vez de o descobrir por um redirect em ciclo.
//
// ⚠ Consequência escrita: os catorze slugs desta tabela são palavras
// RESERVADAS para nomes de casa.
//
// O id de um evento reconhece-se pela forma (um uuid nunca é um slug),
// e é por isso que /evento/<uuid>/documentos ainda encontra o caminho
// de volta.
// ------------------------------------------------------------
const PREFIXOS_COM_CASA = ["admin", "evento", "briefing"];

const PARECE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A casa que o endereço nomeia, ou null quando ele é dos antigos.
export const casaDoCaminho = (pathname) => {
  const [, prefixo, primeiro] = String(pathname || "").split("/");
  if (!PREFIXOS_COM_CASA.includes(prefixo) || !primeiro) return null;
  if (prefixo === "admin" && (ID_POR_SLUG[primeiro] || SLUG_ANTIGO[primeiro]))
    return null;
  if (PARECE_UUID.test(primeiro)) return null;
  return primeiro;
};

// O mesmo endereço, com a casa lá dentro. Preserva o resto do caminho
// inteiro — um favorito de /admin/documentos/<id>/contrato tem de abrir
// o contrato, não o Início.
export const caminhoComCasa = (pathname, casa) => {
  const partes = String(pathname || "")
    .split("/")
    .filter(Boolean);
  if (!casa || !PREFIXOS_COM_CASA.includes(partes[0])) return pathname;
  return `/${[partes[0], casa, ...partes.slice(1)].join("/")}`;
};

// ------------------------------------------------------------
// O ATALHO PARA QUEM DESENHA.
//
// As funções acima pedem a casa por argumento — é a regra da camada
// (`lib/` recebe contexto por argumento, nunca o vai buscar). Mas
// dentro do backoffice a casa está sempre no mesmo sítio: o parâmetro
// da rota. Este hook lê-a UMA vez e devolve as mesmas funções já
// atadas a ela, para nenhum ecrã ter de a andar a passar de mão em
// mão — que é como um dos vinte sítios acabaria por a esquecer.
//
// É a excepção admitida em `docs/invariantes.md`: um hook pode ler o
// contexto onde vive.
// ------------------------------------------------------------
export function useRotas() {
  const { casa } = useParams();
  return useMemo(
    () => ({
      casa,
      separador: (id) => caminhoDoSeparador(casa, id),
      contacto: (id) => caminhoDoContacto(casa, id),
      evento: (id, aba) => caminhoDoEvento(casa, id, aba),
      briefing: (id) => caminhoDoBriefing(casa, id),
      slugAntigo: (slug, ...resto) => caminhoDeSlugAntigo(casa, slug, ...resto),
    }),
    [casa],
  );
}
