// ============================================================
// territorio/zonas.js — a tabela de zonamento do Atlas (Lote A).
//
// É o ARTEFACTO VERSIONADO de que todas as frases por zona dependem
// (auditoria da Revisão 2: «nenhum limiar sobre zonas vale mais do que
// a tabela de zonamento que o suporta»). Vive em código de propósito
// — os 3 gatilhos declarados para virar tabela na BD: (a) 2.º tenant
// com geografia própria; (b) «mudar a cobertura» virar gesto da Nádia
// na UI; (c) precisar de reproduzir frases históricas após uma
// redefinição de zonas.
//
// Regras duras:
//   • NUNCA fuzzy matching — adivinhar é contra o contrato. Ou a
//     localidade bate certo no dicionário (normalizada), ou está numa
//     correção CONHECIDA (gralhas reais de produção, uma a uma), ou
//     vai para «por classificar».
//   • Zona é agrupamento de APRESENTAÇÃO sobre concelhos; o degrau
//     localidade→concelho→zona mantém-se explícito.
// ============================================================

// Muda SEMPRE que o zonamento mudar — o drawer «porquê» mostra-a.
export const VERSAO_ZONAMENTO = "2026-09-10.a";

export const ZONA_FORA = "Fora da Grande Lisboa";

// Normalização determinística: minúsculas, sem acentos, espaços
// colapsados. (A mesma família da porta de distâncias.)
export const normalizarLocalidade = (s) =>
  (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// Correções CONHECIDAS (texto completo, já normalizado → concelho).
// Cada entrada é um caso real visto em produção — nomes de salão,
// artérias sem cidade, anotações coladas. Nunca padrões, só literais.
const CORRECOES = {
  "sociedade 1º de dezembro": "Sintra", // salão; fica em Rio de Mouro
  "sociedade 1o de dezembro": "Sintra",
  "guia louge ( cascais)": "Cascais", // gralha de «Lounge» + espaço
  "guia lounge (cascais)": "Cascais",
  "guia lounge ( cascais)": "Cascais",
  "sesimbra ( associacao disportiva de azoia)": "Sesimbra",
  "sesimbra (associacao desportiva de azoia)": "Sesimbra",
  "alhos vedros - margem sul": "Moita",
  "av da liberdade": "Lisboa", // artéria sem cidade (contexto real)
  "avenida da liberdade": "Lisboa",
  "venda do pinheiro": "Mafra",
};

// Termos VAGOS — não são geocodificáveis a um ponto nem a um concelho;
// vão para a fila com a etiqueta própria (a frase de arrumação pede a
// localidade certa).
const VAGAS = new Set([
  "grande lisboa",
  "lisboa e arredores",
  "margem sul",
  "linha de cascais",
  "linha de sintra",
]);

// localidade normalizada → concelho. Cobre as localidades vistas em
// produção + as vizinhas óbvias da zona de operação. Cresce à mão.
const LOCALIDADE_PARA_CONCELHO = {
  // Cascais
  cascais: "Cascais",
  estoril: "Cascais",
  guia: "Cascais",
  parede: "Cascais",
  carcavelos: "Cascais",
  "sao domingos de rana": "Cascais",
  alcabideche: "Cascais",
  // Sintra
  sintra: "Sintra",
  "rio de mouro": "Sintra",
  "algueirao-mem martins": "Sintra",
  "algueirao mem martins": "Sintra",
  queluz: "Sintra",
  "agualva-cacem": "Sintra",
  "agualva cacem": "Sintra",
  colares: "Sintra",
  // resto da Linha
  amadora: "Amadora",
  oeiras: "Oeiras",
  "paco de arcos": "Oeiras",
  "caxias": "Oeiras",
  // Lisboa
  lisboa: "Lisboa",
  // Norte
  odivelas: "Odivelas",
  loures: "Loures",
  camarate: "Loures",
  sacavem: "Loures",
  "vila franca de xira": "Vila Franca de Xira",
  "alverca do ribatejo": "Vila Franca de Xira",
  alverca: "Vila Franca de Xira",
  // Mafra / Oeste
  mafra: "Mafra",
  ericeira: "Mafra",
  malveira: "Mafra",
  "torres vedras": "Torres Vedras",
  lourinha: "Lourinhã",
  peniche: "Peniche",
  obidos: "Óbidos",
  "caldas da rainha": "Caldas da Rainha",
  alenquer: "Alenquer",
  "arruda dos vinhos": "Arruda dos Vinhos",
  "sobral de monte agraco": "Sobral de Monte Agraço",
  cadaval: "Cadaval",
  // Margem Sul
  almada: "Almada",
  "costa da caparica": "Almada",
  seixal: "Seixal",
  amora: "Seixal",
  corroios: "Seixal",
  barreiro: "Barreiro",
  moita: "Moita",
  "alhos vedros": "Moita",
  montijo: "Montijo",
  alcochete: "Alcochete",
  sesimbra: "Sesimbra",
  azoia: "Sesimbra",
  setubal: "Setúbal",
  palmela: "Palmela",
};

// concelho → zona (apresentação).
const CONCELHO_PARA_ZONA = {
  Cascais: "Linha de Sintra/Cascais",
  Sintra: "Linha de Sintra/Cascais",
  Oeiras: "Linha de Sintra/Cascais",
  Amadora: "Linha de Sintra/Cascais",
  Lisboa: "Lisboa",
  Loures: "Norte de Lisboa",
  Odivelas: "Norte de Lisboa",
  Mafra: "Norte de Lisboa",
  "Vila Franca de Xira": "Norte de Lisboa",
  Almada: "Margem Sul",
  Seixal: "Margem Sul",
  Barreiro: "Margem Sul",
  Moita: "Margem Sul",
  Montijo: "Margem Sul",
  Alcochete: "Margem Sul",
  Sesimbra: "Margem Sul",
  "Setúbal": "Margem Sul",
  Palmela: "Margem Sul",
  "Torres Vedras": "Oeste",
  "Lourinhã": "Oeste",
  Peniche: "Oeste",
  "Óbidos": "Oeste",
  "Caldas da Rainha": "Oeste",
  Alenquer: "Oeste",
  "Arruda dos Vinhos": "Oeste",
  "Sobral de Monte Agraço": "Oeste",
  Cadaval: "Oeste",
};

// Classifica o texto livre de localidade de um pedido registado.
// Devolve sempre um objeto com `estado`:
//   'vazia'           — sem texto nenhum
//   'vaga'            — termo vago conhecido («Grande Lisboa»)
//   'zonada'          — { concelho, zona } encontrados
//   'por_classificar' — texto que o dicionário não conhece (SEM
//                       adivinhar; a fila de arrumação trata dele)
export const classificarLocalidade = (texto) => {
  const original = (texto || "").toString().trim();
  const chave = normalizarLocalidade(original);
  if (!chave) return { estado: "vazia", original };
  if (VAGAS.has(chave)) return { estado: "vaga", original };
  const concelho = CORRECOES[chave] || LOCALIDADE_PARA_CONCELHO[chave] || null;
  if (!concelho) return { estado: "por_classificar", original };
  const zona = CONCELHO_PARA_ZONA[concelho] || ZONA_FORA;
  return { estado: "zonada", original, concelho, zona };
};
