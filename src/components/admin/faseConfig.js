// ============================================================
// faseConfig — as fases do funil comercial num sítio só, partilhadas
// entre a lista de clientes (pastilhas), o funil (colunas + avanço),
// a Agenda e o Início.
//
// As fases espelham a CHECK constraint da coluna `fase` (migração 016):
//   interessado → orcamento → sinal → cliente → projecto → contrato
//   (+ perdido = saída)
//
// A fase "sinal" = orçamento ACEITE, pagamento do sinal pendente —
// o limbo onde os negócios morrem, por isso tem coluna própria. Os
// botões contam a história: "Aceite →" entra nela, "Sinal recebido →"
// sai dela (ver AVANCO_LABEL). O pagamento final (até 48h
// antes do evento) vive na coluna pagamento_final e alerta no Início.
// ============================================================

export const FASE_LABEL = {
  interessado: "Interessado",
  orcamento: "Orçamento",
  sinal: "Aguarda sinal",
  cliente: "Cliente",
  projecto: "Projecto",
  contrato: "Contrato",
  perdido: "Perdido",
};

export const FASE_COR = {
  interessado: { bg: "#FEF3E2", cor: "#B45309" },
  orcamento: { bg: "#FEF9C3", cor: "#854D0E" },
  sinal: { bg: "#FFEDD5", cor: "#C2410C" },
  cliente: { bg: "#DCFCE7", cor: "#166534" },
  projecto: { bg: "#F3E8FF", cor: "#6B21A8" },
  contrato: { bg: "#E0E7FF", cor: "#3730A3" },
  perdido: { bg: "#F3F4F6", cor: "#6B7280" },
};

// As colunas do funil, pela ordem do negócio (perdido é saída, não
// coluna — só aparece quando a Nádia liga "Ver perdidos").
export const FASES_BOARD = [
  "interessado",
  "orcamento",
  "sinal",
  "cliente",
  "projecto",
  "contrato",
];

// Fases PÓS-SINAL (a data está garantida — o negócio é dela).
// Usado pela Agenda (sólido vs tracejado) e pelos alertas do Início.
export const FASES_POS_SINAL = ["cliente", "projecto", "contrato"];

// Para onde avança cada fase (contrato é o fim; perdido recupera-se
// para interessado via ação própria).
export const PROXIMA_FASE = {
  interessado: "orcamento",
  orcamento: "sinal",
  sinal: "cliente",
  cliente: "projecto",
  projecto: "contrato",
};

// O rótulo do botão de avanço — o ATO, não só o destino. A transição
// orcamento → cliente chama-se pelo nome verdadeiro: o sinal.
export const AVANCO_LABEL = {
  interessado: "Orçamento",
  orcamento: "Aceite",
  sinal: "Sinal recebido",
  cliente: "Projecto",
  projecto: "Contrato",
};

// ============================================================
// O ESTADO do evento — o OUTRO eixo, operacional, que corre em
// paralelo à fase comercial acima. A fase responde a "em que ponto
// está o negócio"; o estado responde a "em que ponto está o trabalho".
//
// Ficam os dois no mesmo ficheiro de propósito: são duas taxonomias a
// coexistir, e quem mexer numa tem de ver a outra. A Jornada mostra a
// fase e edita o estado (nos passos Preparação e O grande dia).
//
// Só se pode pôr um estado pós-sinal num evento cuja fase já é
// pós-sinal — a regra vive em updateStatus (lib/clientes.js), aqui só
// o vocabulário. Antes disto, estas duas constantes estavam copiadas
// à letra em SubmissionDrawer, DocumentosLista e DashboardTab.
// ============================================================
export const STATUS_OPTIONS = [
  "Recebido",
  "Em Preparação",
  "Confirmado",
  "Concluído",
];

export const STATUS_COLORS = {
  Recebido: { bg: "#FEF9EC", color: "#C9A84C", border: "#E8D5A3" },
  "Em Preparação": { bg: "#EFF6FF", color: "#3B82F6", border: "#BFDBFE" },
  Confirmado: { bg: "#F0FDF4", color: "#22C55E", border: "#BBF7D0" },
  Concluído: { bg: "#F9FAFB", color: "#6B7280", border: "#E5E7EB" },
};