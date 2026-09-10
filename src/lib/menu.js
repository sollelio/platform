// ============================================================
// menu.js — a ARQUITETURA da navegação do backoffice, num sítio só.
//
// A regra de ouro mantém-se: os IDS dos separadores NUNCA mudam (os
// URLs vivem em rotasAdmin.js e não se tocam). O que este ficheiro
// fixa é a ARRUMAÇÃO: o que é trabalho diário, o que pertence a que
// domínio, e por que ordem — organizado pelo trabalho da Nádia, não
// pela estrutura técnica do software.
//
// Acrescentar um módulo novo = UMA linha no grupo certo (ou nos
// diários, se for mesmo de todos os dias). A sidebar, a folha «Mais»
// do telemóvel e a barra inferior leem TODOS daqui — não há segunda
// lista para divergir. Uma futura paleta de comandos (⌘K) também já
// tem aqui o seu índice: `todosOsDestinos()`.
//
// Vive em lib/ porque a regra da casa é lib/ nunca importar de
// components/ — os ícones (JSX) ficam na Navegacao; aqui só nomes.
// ============================================================

// O trabalho de TODOS os dias — sempre à vista, sem grupo, sem
// dobra. (A Caixa de Entrada não está aqui porque não é um
// separador: é a gaveta das notificações, e coroa o menu à parte.)
export const NAV_DIARIA = [
  { id: "inicio", label: "Início", icone: "inicio" },
  { id: "calendario", label: "Agenda", icone: "agenda" },
  { id: "clientes", label: "Contactos", icone: "contactos" },
];

// Os DOMÍNIOS do resto da casa. Fechados por omissão: a estrutura
// lê-se num relance (4 títulos), e a complexidade só se abre quando
// é preciso. «Documentos» vive no Comercial de propósito — são os
// orçamentos e contratos dos eventos, não um arquivo.
export const NAV_GRUPOS = [
  {
    id: "comercial",
    titulo: "Comercial",
    icone: "documentos",
    itens: [
      { id: "orcamentos", label: "Documentos", icone: "documentos" },
      { id: "convites", label: "Formulários", icone: "formularios" },
      { id: "mensagens", label: "Mensagens", icone: "mensagens" },
      { id: "comunicados", label: "Envios", icone: "comunicados" },
      { id: "avaliacoes", label: "Avaliações", icone: "avaliacoes" },
    ],
  },
  {
    id: "operacoes",
    titulo: "Operações",
    icone: "logistica",
    itens: [
      { id: "operacional", label: "Logística", icone: "logistica" },
      { id: "equipa", label: "Equipa", icone: "equipa" },
      { id: "consultas", label: "Disponibilidades", icone: "consultas" },
    ],
  },
  {
    id: "crescimento",
    titulo: "Crescimento",
    icone: "dashboard",
    itens: [
      { id: "dashboard", label: "Dashboard", icone: "dashboard" },
      { id: "territorio", label: "Território", icone: "pin" },
    ],
  },
  {
    id: "ferramentas",
    titulo: "Ferramentas",
    icone: "modelos",
    itens: [
      { id: "tiposEvento", label: "Modelos de Evento", icone: "modelos" },
      { id: "importar", label: "Importar clientes", icone: "importar" },
    ],
  },
];

// A barra inferior do telemóvel É UM ATALHO, não a estrutura: mantém
// os quatro gestos de sempre + «Mais», NA ORDEM DE SEMPRE (Início,
// Contactos, Agenda, Documentos — o polegar já a sabe de cor; herdar
// a ordem nova do desktop trocaria Contactos e Agenda em silêncio).
// Mexer no hábito do polegar é outra decisão, de outro dia.
export const NAV_MOVEL = [
  { id: "inicio", label: "Início", icone: "inicio" },
  { id: "clientes", label: "Contactos", icone: "contactos" },
  { id: "calendario", label: "Agenda", icone: "agenda" },
  { id: "orcamentos", label: "Documentos", icone: "documentos" },
];

// grupo a que um separador pertence (null = diário/da barra)
export const grupoDoSeparador = (id) =>
  NAV_GRUPOS.find((g) => g.itens.some((i) => i.id === id))?.id || null;

// O índice plano de todos os destinos — a futura paleta ⌘K lê daqui.
export const todosOsDestinos = () => [
  ...NAV_DIARIA,
  ...NAV_GRUPOS.flatMap((g) =>
    g.itens.map((i) => ({ ...i, grupo: g.titulo })),
  ),
];

// ---------- preferências de navegação (só conveniências locais) ----------

const CHAVE_GRUPOS = "dlm.backoffice.nav.grupos";
const CHAVE_COMPACTA = "dlm.backoffice.nav.compacta";

export const lerGruposAbertos = () => {
  try {
    const raw = globalThis.localStorage?.getItem(CHAVE_GRUPOS);
    const g = raw ? JSON.parse(raw) : null;
    return g && typeof g === "object" ? g : {};
  } catch {
    return {};
  }
};

export const guardarGruposAbertos = (abertos) => {
  try {
    globalThis.localStorage?.setItem(CHAVE_GRUPOS, JSON.stringify(abertos));
  } catch {
    /* sem persistência — vale para a sessão */
  }
};

export const lerNavCompacta = () => {
  try {
    return globalThis.localStorage?.getItem(CHAVE_COMPACTA) === "1";
  } catch {
    return false;
  }
};

export const guardarNavCompacta = (compacta) => {
  try {
    if (compacta) globalThis.localStorage?.setItem(CHAVE_COMPACTA, "1");
    else globalThis.localStorage?.removeItem(CHAVE_COMPACTA);
  } catch {
    /* idem */
  }
};
