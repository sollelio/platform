// ============================================================
// localidades.js — as localidades da zona de operação (Grande Lisboa
// + Oeste), num sítio só.
//
// Serve duas bocas:
//   • o datalist do campo «Localidade do evento» na captação — a
//     melhoria de recolha do R1 (10/09/2026): sugerir a grafia certa
//     seca na origem as gralhas e os nomes de salão que estragavam a
//     leitura por zona («Guia Louge ( Cascais)», «disportiva»...);
//   • os chips de sugestão do painel de deslocação (que até aqui
//     listavam o ALGARVE — resquício do handoff de design, corrigido).
//
// É sugestão, nunca restrição: o campo continua texto livre — um
// datalist não bloqueia ninguém, só encaminha. A lista cresce à mão
// quando a operação crescer; não é taxonomia, é conveniência.
// ============================================================

export const LOCALIDADES_ZONA = [
  // Linha de Sintra/Cascais
  "Cascais",
  "Estoril",
  "Parede",
  "Carcavelos",
  "Oeiras",
  "Sintra",
  "Rio de Mouro",
  "Algueirão-Mem Martins",
  "Queluz",
  "Agualva-Cacém",
  "Amadora",
  // Lisboa e norte
  "Lisboa",
  "Odivelas",
  "Loures",
  "Camarate",
  "Sacavém",
  "Vila Franca de Xira",
  "Alverca do Ribatejo",
  // Mafra / Oeste
  "Mafra",
  "Ericeira",
  "Venda do Pinheiro",
  "Malveira",
  "Torres Vedras",
  "Lourinhã",
  "Peniche",
  "Alenquer",
  "Arruda dos Vinhos",
  "Sobral de Monte Agraço",
  // Margem Sul
  "Almada",
  "Costa da Caparica",
  "Seixal",
  "Amora",
  "Barreiro",
  "Moita",
  "Alhos Vedros",
  "Montijo",
  "Alcochete",
  "Sesimbra",
  "Setúbal",
  "Palmela",
];

// Os chips do painel de deslocação — as bocas mais prováveis ao
// telefone, curtas de propósito (o resto escreve-se).
export const LOCALIDADES_SUGERIDAS = [
  "Cascais",
  "Sintra",
  "Lisboa",
  "Almada",
  "Torres Vedras",
];
