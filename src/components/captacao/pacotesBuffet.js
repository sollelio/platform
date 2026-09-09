// ============================================================
// A CARTA DA CASA — os pacotes de buffet, com tudo o que incluem.
//
// É a fonte ÚNICA dos pacotes: o seletor da captação desenha os
// cartões a partir daqui, e o submeter guarda "Nome (detalhe)" em
// respostas.servicosBuffet — resposta autoexplicativa em qualquer
// ecrã do admin, sem consultar tabela nenhuma.
//
// Conteúdo e preços vêm da carta da Nádia (imagens de 09/09/2026):
// Essence 450€ até 18 · Supreme 650€ até 35 · Premium 920€ até 50,
// e "mais de 50" é orçamento personalizado (o cliente diz quantos).
// Mudou a carta? Muda-se AQUI e o formulário acompanha.
// ============================================================

const OFERTA_BASE = [
  "Decoração incluída",
  "Bebida não alcoólica servida em copos decorativos",
  "Água aromatizada como elemento decorativo da mesa",
];

export const PACOTES_BUFFET = [
  {
    nome: "Essence",
    detalhe: "até 18 convidados",
    maxConvidados: 18,
    preco: 450,
    tagline: "A mesa essencial para uma celebração simples e elegante.",
    mesa: "Mesa de 180 cm",
    pecas: "250 peças",
    inclui: [
      "Mini sobremesas variadas",
      "Brigadeiros",
      "Mini salgados variados",
      "Mini hambúrgueres gourmet",
      "Mini cachorros gourmet",
      "Mini pizzas",
      "Cones de fruta / enchidos",
      "Donuts personalizados",
      "Mini barquinhos com asas de frango e chips",
    ],
    oferta: OFERTA_BASE,
  },
  {
    nome: "Supreme",
    detalhe: "até 35 convidados",
    maxConvidados: 35,
    preco: 650,
    maisEscolhido: true,
    tagline: "O equilíbrio ideal entre mesa, variedade e apresentação.",
    mesa: "Mesa de 360 cm",
    pecas: "450 peças",
    inclui: [
      "Mini sobremesas",
      "Brigadeiros",
      "Donuts personalizados",
      "Mini salgados variados",
      "Mini hambúrgueres gourmet",
      "Mini cachorros gourmet",
      "Mini pizzas",
      "Mini barquinhos com asas de frango e chips",
      "Cones de fruta / enchidos",
      "Crepes primavera",
      "Copos de salada César",
    ],
    oferta: OFERTA_BASE,
  },
  {
    nome: "Premium",
    detalhe: "até 50 convidados",
    maxConvidados: 50,
    preco: 920,
    tagline: "Serviço completo, com acompanhamento do buffet do início ao fim.",
    mesa: "Mesa de 360 cm",
    pecas: "650 peças",
    inclui: [
      "Brigadeiros",
      "Sobremesas de copo",
      "Donuts personalizados",
      "Mini salgados variados",
      "Mini hambúrgueres gourmet",
      "Mini cachorros gourmet",
      "Mini pizzas",
      "Mini barquinhos com asas de frango e chips",
      "Crepes primavera",
      "Cones de fruta e enchidos",
      "Mini wraps de frango",
      "Saladas frias",
      "Mini copos de salada César",
      "Saladas frias de grão com bacalhau",
      "Canapés diversos",
      "Camarões panados em molho agridoce",
    ],
    oferta: [
      ...OFERTA_BASE,
      "2 elementos de staff para serviço e reposição durante o evento",
    ],
  },
];

// A 4.ª opção — mais de 50 convidados não cabe em pacote fechado:
// pede-se orçamento personalizado, com o número exato de convidados.
export const PACOTE_PERSONALIZADO = {
  nome: "Personalizado",
  detalhe: "mais de 50 convidados",
};

export const pacotePorNome = (nome) =>
  nome === PACOTE_PERSONALIZADO.nome
    ? PACOTE_PERSONALIZADO
    : PACOTES_BUFFET.find((p) => p.nome === nome) || null;

// O pacote sugerido para um nº de convidados — null se o número
// ainda não estiver preenchido (ou não for um número válido).
export const pacoteSugerido = (numeroConvidados) => {
  const n = Number(numeroConvidados);
  if (!String(numeroConvidados ?? "").trim() || !Number.isFinite(n) || n < 1)
    return null;
  const cabe = PACOTES_BUFFET.find((p) => n <= p.maxConvidados);
  return cabe ? cabe.nome : PACOTE_PERSONALIZADO.nome;
};
