import { estadoFormularioDoEvento } from "../../lib/invites";

// ============================================================
// faseConfig — as fases do funil comercial num sítio só, partilhadas
// entre a lista de clientes (pastilhas), o funil (colunas + avanço),
// a Agenda e o Início.
//
// A ordem do negócio (decisão FINAL da dona do negócio, migração 077):
//   interessado → orcamento → sinal → contrato → cliente → projecto
//   (+ perdido = saída)
//
// A fase "sinal" = orçamento ACEITE, os 50% por pagar — o limbo
// pós-aceite: "Aceite →" entra nela, "Sinal recebido →" sai dela (é o
// sinal que reserva a data). Segue-se a fase "contrato": sinal pago,
// data garantida, contrato por assinar — "Contrato assinado →" fecha o
// negócio por inteiro (fase "cliente"). "projecto" é o fim do funil; o
// trabalho operacional corre no eixo STATUS. O pagamento final (até
// 48h antes do evento) vive na coluna pagamento_final e alerta no
// Início.
// ============================================================

// Os rótulos e a lista pós-sinal mudaram-se para lib/fases.js — a fonte
// única que também a camada de dados pode ler (lib/ não importa de
// components/). Re-exportados daqui para nenhum consumidor mudar.
// ⚠ importa E re-exporta, não `export … from`: o re-export puro não põe
// os nomes no ÂMBITO deste módulo, e o ehLacunaDeFormulario lá em baixo
// usa FASES_POS_SINAL — rebentava em runtime com o build a passar.
import { FASE_LABEL, FASES_POS_SINAL } from "../../lib/fases";
export { FASE_LABEL, FASES_POS_SINAL };

// Cores de ESTADO da UI (pastilhas de fase). Só se traduziu ao token o
// que coincide EXACTAMENTE com a tabela da identidade e no mesmo papel
// (texto/fundo de estado); os pares fora da paleta ficam literais —
// ilha clara com letra escura também no escuro — e seguem no relatório.
export const FASE_COR = {
  interessado: { bg: "var(--aviso-fundo)", cor: "var(--aviso)" },
  orcamento: { bg: "#FEF9C3", cor: "#854D0E" }, // amarelo fora da paleta
  sinal: { bg: "#FFEDD5", cor: "#C2410C" }, // laranja fora da paleta
  cliente: { bg: "var(--sucesso-fundo-forte)", cor: "var(--sucesso-texto)" },
  projecto: { bg: "#F3E8FF", cor: "#6B21A8" }, // roxo fora da paleta
  contrato: { bg: "#E0E7FF", cor: "#3730A3" }, // índigo fora da paleta
  // O fundo #F3F4F6 está fora da paleta (--neutro-fundo é #F9FAFB) —
  // o par INTEIRO fica literal (o #6B7280 até é --neutro-texto, mas
  // não se parte o par).
  perdido: { bg: "#F3F4F6", cor: "#6B7280" },
};

// As colunas do funil, pela ordem do negócio (perdido é saída, não
// coluna — só aparece quando a Nádia liga "Ver perdidos").
export const FASES_BOARD = [
  "interessado",
  "orcamento",
  "sinal",
  "contrato",
  "cliente",
  "projecto",
];

// Para onde avança cada fase (projecto é o fim; perdido recupera-se
// para interessado via ação própria).
export const PROXIMA_FASE = {
  interessado: "orcamento",
  orcamento: "sinal",
  sinal: "contrato",
  contrato: "cliente",
  cliente: "projecto",
};

// O rótulo do botão de avanço — o ATO, não só o destino. Cada transição
// chama-se pelo nome verdadeiro: o aceite, o sinal, a assinatura.
export const AVANCO_LABEL = {
  interessado: "Orçamento",
  orcamento: "Aceite",
  sinal: "Sinal recebido",
  contrato: "Contrato assinado",
  cliente: "Projecto",
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
  // `textoActivo` é a letra de quem fica com `color` como FUNDO (a
  // pastilha activa da Jornada): nos estados tematizados o branco
  // morreria sobre os preenchimentos claros do modo escuro — o par
  // certo é o do ouro (--texto-sobre-ouro, branco no claro na mesma);
  // no azul congelado o fundo não muda, e o branco fica.
  Recebido: {
    bg: "var(--superficie-selo)",
    color: "var(--ouro)",
    border: "var(--ouro-suave)",
    textoActivo: "var(--texto-sobre-ouro)",
  },
  // Azul fora da paleta da identidade — o trio fica literal e segue
  // no relatório (ilha clara com letra azul nos dois modos).
  "Em Preparação": {
    bg: "#EFF6FF",
    color: "#3B82F6",
    border: "#BFDBFE",
    textoActivo: "white",
  },
  Confirmado: {
    bg: "var(--sucesso-fundo)",
    color: "var(--sucesso)",
    border: "var(--sucesso-borda)",
    textoActivo: "var(--texto-sobre-ouro)",
  },
  Concluído: {
    bg: "var(--neutro-fundo)",
    color: "var(--neutro-texto)",
    border: "var(--neutro-borda)",
    textoActivo: "var(--texto-sobre-ouro)",
  },
};
// ============================================================
// ehLacunaDeFormulario — um evento que ainda NÃO tem formulário e
// devia ter.
//
// Vive AQUI e não numa lib porque depende de FASES_POS_SINAL, e a regra
// da casa é que lib/ não importa de components/ (ver a nota em
// lib/clientes.js, onde a lista teve de ser espelhada por essa razão).
// Duplicá-la aqui seria «uma lista nova», que o registo de decisões
// proíbe para exactamente este caso — por isso o predicado é que vem ao
// encontro da lista, e não o contrário.
//
// O CRITÉRIO: trabalho a sério (pós-sinal), ainda por acontecer, sem
// formulário. Um interessado precisa de orçamento, não de formulário;
// um evento que já aconteceu não tem lacuna, tem história. Sem data
// ENTRA — não se pode afirmar que passou, e entre esconder e mostrar a
// mais, mostra-se.
// ============================================================
export function ehLacunaDeFormulario(evento, invites, hojeISO) {
  if (!FASES_POS_SINAL.includes(evento.fase)) return false;
  if (evento.data_evento && evento.data_evento < hojeISO) return false;
  const { estado } = estadoFormularioDoEvento(invites, evento.id);
  // "preenchido-noutro" também é lacuna: este evento continua sem
  // respostas próprias, e o caminho é criar um formulário apontado a ele.
  return estado === "nenhum" || estado === "preenchido-noutro";
}
