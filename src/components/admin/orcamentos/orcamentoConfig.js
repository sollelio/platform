// ============================================================
// Configuração do módulo de orçamentos/contratos.
// Dados fixos da empresa (confirmados) e catálogo de serviços
// recorrentes. Editável aqui num sítio só.
// ============================================================

// A identidade da 2.ª contraente NÃO passa mais por aqui (099). Este
// ficheiro re-exportava o EMPRESA do casa.js, e a cadeia de três saltos
// — casa → orcamentoConfig → contratoConfig — escondia quem ainda vivia
// da ponte. Hoje quem precisa dela lê-a do Provider; o único que ficou
// para trás é o contratoConfig.js, e vai buscá-la ao casa.js à vista de
// todos (ver a pendência do texto dos documentos).

// Condições fixas que aparecem no rodapé do orçamento.
// A primeira nomeia o sinal e a percentagem: «mediante confirmação» era
// vago e os sinais demoravam — a condição agora diz o que reserva o dia.
// (Os orçamentos já publicados guardam o texto antigo no instantâneo.)
export const CONDICOES_ORCAMENTO = [
  "Reserva mediante pagamento de sinal de 50% do valor total",
  "Valor sujeito a ajuste conforme número final de convidados",
  "Alterações poderão implicar revisão",
];

export const NOTA_RODAPE_ORCAMENTO =
  "Toda a loiça reutilizável e restante material disponibilizado para a mesa posta deverá ser entregue recolhido sem resíduos alimentares no final do evento, sendo a higienização realizada posteriormente pela Do Luxo à Mesa.";

export const VALIDADE_ORCAMENTO_DIAS = 30;

// Custo fixo do trajecto entre as duas moradas da casa, por evento — a
// morada-base do calculador de deslocação NÃO é o armazém, e este troço
// não era pago por ninguém (decisão de 03/08/2026). O gerador DILUI este
// valor pelas linhas de serviço elegíveis (nunca no Pacote Buffet nem na
// Deslocação): o cliente vê os serviços ligeiramente mais cheios, nunca
// uma linha de logística.
export const LOGISTICA_ENTRE_MORADAS = 25;

// ------------------------------------------------------------
// Catálogo de serviços recorrentes. A Nádia escolhe um, ajusta o
// valor/quantidade, e o texto do "Inclui:" vem predefinido (pode editar).
// Há sempre a opção de linha livre para casos especiais.
// ------------------------------------------------------------
export const CATALOGO_SERVICOS = [
  {
    id: "decoracao_mesas",
    // {N} é substituído pelo nº de lugares
    descricaoTemplate: "Decoração de Mesas — {N} Lugares Completos",
    temLugares: true,
    inclui: [
      "Mesa posta completa",
      "Mobiliário incluído",
      "Centros de mesa decorativos",
      "Castiçais e velas decorativas",
    ],
    valorSugerido: null,
  },
  {
    id: "espaco_fotografavel",
    descricaoTemplate: "Espaço Fotografável dos Noivos",
    temLugares: false,
    inclui: [
      "Paineis decorativos",
      "Arranjos florais artificiais de aspeto natural",
      "Elementos decorativos complementares",
      "Montagem e desmontagem",
    ],
    valorSugerido: null,
  },
  {
    id: "pacote_buffet",
    descricaoTemplate: "Pacote Buffet",
    temLugares: false,
    // «Inclui:» nasce vazio de propósito — é a Nádia que o escreve por
    // evento. E este serviço NUNCA absorve a logística entre moradas.
    inclui: [],
    valorSugerido: null,
  },
  {
    id: "deslocacao",
    descricaoTemplate: "Deslocação",
    temLugares: false,
    inclui: [],
    valorSugerido: null,
  },
  {
    id: "livre",
    descricaoTemplate: "",
    temLugares: false,
    inclui: [],
    valorSugerido: null,
    ehLivre: true,
  },
];

// Converte texto de valor em número, aceitando vírgula OU ponto como
// separador decimal (ex: "36,5" → 36.5, "1.250,50" → 1250.5). Quando há
// vários separadores, o último é o decimal e os restantes são de milhares.
export const parsearValor = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "")
    .trim()
    .replace(/[\s€]/g, "");
  if (!s) return 0;
  const ultimo = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  const limpo =
    ultimo === -1
      ? s
      : s.slice(0, ultimo).replace(/[.,]/g, "") + "." + s.slice(ultimo + 1);
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
};

// Formata um valor como euros (ex: 650 → "650€", 36.8 → "36,80€").
// Arredonda a cêntimos, para absorver ruído de vírgula flutuante
// (649.9999… → "650€") e aceita vírgula decimal no texto de entrada.
export const formatarEuros = (v) => {
  const n = Math.round(parsearValor(v) * 100) / 100;
  if (Number.isInteger(n)) return `${n}€`;
  return `${n.toFixed(2).replace(".", ",")}€`;
};

// Formata data ISO (yyyy-mm-dd) para dd/mm/yyyy
export const formatarDataPT = (iso) => {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  if (!a || !m || !d) return iso;
  return `${d}/${m}/${a}`;
};

// ------------------------------------------------------------
// Estilos partilhados dos formulários de orçamento — vivem aqui (não
// no ficheiro do componente) para poderem ser importados por outros
// ficheiros (ex: PainelDeslocacao.jsx) sem violar a regra do Fast
// Refresh, que exige que um ficheiro de componente só exporte componentes.
// ------------------------------------------------------------
export const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "8px",
  border: "1.5px solid var(--gold-light)",
  fontSize: "13px",
  outline: "none",
  fontFamily: "Inter, sans-serif",
  boxSizing: "border-box",
  // Campo da MOLDURA (partilhado pelo gerador e pelo painel de
  // deslocação) — segue o tema; a folha tem os campos dela.
  backgroundColor: "var(--superficie)",
};

export const miniLabel = {
  fontSize: "11px",
  fontWeight: "600",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--charcoal)",
  display: "block",
  marginBottom: "5px",
};
