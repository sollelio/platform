// ============================================================
// Configuração do CONTRATO de prestação de serviços.
// Baseado no template real da Do Luxo à Mesa (contrato mais completo,
// o da Dúnia). O texto fixo das cláusulas vive aqui; as partes variáveis
// (partes, objeto, valor, serviços) são preenchidas no formulário.
//
// {PLACEHOLDERS} são substituídos na geração.
// ============================================================

// ⚠ O ÚLTIMO CONSUMIDOR DA PONTE (099).
//
// As cláusulas abaixo são texto JURÍDICO escrito pela titular, com a
// identidade cosida por dentro da frase — «sob a designação comercial
// X», «o padrão estético da marca X», «o foro da X». Trocar o X por
// `casa.nome` não resolve nada: a frase inteira é dela, e a casa
// seguinte escreve as suas. Por isso este ficheiro não migrou com os
// outros e continua a ler o EMPRESA cravado — que, enquanto houver uma
// casa só, diz a verdade.
//
// Fica em aberto como migração PRÓPRIA: as cláusulas passam a texto por
// casa (base de dados), não a template com furos. Até lá, as
// exportações @deprecated do casa.js não podem cair — esta linha é a
// razão, e é a única.
import { EMPRESA } from "../../../lib/casa";

// Introdução (a seguir aos dados das partes)
export const CONTRATO_INTRO = `Titular da atividade de prestação de serviços de decoração de eventos, atuando sob a designação comercial "${EMPRESA.designacao}".

As partes acordam celebrar o presente Contrato de Prestação de Serviços, o qual se rege pelas cláusulas seguintes:`;

// As cláusulas fixas. Cada uma tem número, título e corpo.
// {TIPO_EVENTO}, {DATA_EXTENSO}, {LOCAL}, {HORA_INICIO}, {HORA_FIM},
// {VALOR}, {VALOR_EXTENSO} são substituídos na geração.
export const CLAUSULAS = [
  {
    n: "1.ª",
    titulo: "Objeto do Contrato",
    // {TIPO_EVENTO} — o contrato serve casamentos, batizados,
    // aniversários, etc.; o tipo vem do modelo do evento (ou é escrito
    // à mão no modo manual).
    corpo: `O presente contrato tem como objeto a prestação de serviços de decoração para a celebração de {TIPO_EVENTO}, a realizar-se no dia {DATA_EXTENSO}, no espaço situado na {LOCAL}, com início previsto para as {HORA_INICIO} e término previsto para as {HORA_FIM}.`,
  },
  {
    n: "2.ª",
    titulo: "Serviços Incluídos",
    // O corpo dos serviços é dinâmico (vem do formulário) — marcado aqui.
    corpo: "{SERVICOS}",
    ehServicos: true,
  },
  {
    n: "3.ª",
    titulo: "Valor do Serviço",
    corpo: `O valor do serviço contratado é de {VALOR} ({VALOR_EXTENSO}).`,
  },
  {
    n: "4.ª",
    titulo: "Condições de Pagamento",
    corpo: `1. No ato da assinatura do presente contrato, o cliente compromete-se a proceder ao pagamento de 50% do valor total do serviço à 2.ª Contraente, a título de sinal e reserva da data.

2. O valor remanescente deverá ser liquidado até 48 horas antes do início do evento, igualmente à 2.ª Contraente, através do meio de pagamento acordado entre as partes.

3. A falta de pagamento dentro do prazo estipulado confere à 2.ª Contraente o direito de suspender ou não executar o serviço contratado, sem devolução do valor pago a título de sinal.

Dados para Pagamento
Titular da Conta: ${EMPRESA.nome}
IBAN: ${EMPRESA.iban}

O pagamento considera-se efetuado apenas após boa cobrança dos respetivos valores.`,
  },
  {
    n: "5.ª",
    titulo: "Materiais e Responsabilidades",
    corpo: `1. Todo o material decorativo e de serviço disponibilizado pela 2.ª Contraente deverá ser utilizado de forma adequada e cuidada.

2. Não é permitida a utilização de utensílios abrasivos ou metálicos que possam danificar o material.

3. A recolha do material será efetuada no final do evento ou no dia seguinte, em horário a acordar entre as partes.

4. Em caso de danos, extravios ou utilização indevida do material, a 2.ª Contraente reserva-se o direito de proceder à cobrança dos respetivos custos de reparação ou substituição.

5. A montagem e desmontagem da decoração competem exclusivamente à 2.ª Contraente, não sendo permitida a intervenção do cliente ou terceiros.

6. A responsabilidade pelo material decorativo e de serviço é do cliente desde o final da montagem até à respetiva recolha, incluindo situações de furto, quebra, desaparecimento ou dano causado por convidados ou terceiros.

7. A 2.ª Contraente não se responsabiliza por danos causados por crianças, convidados ou terceiros durante o evento.`,
  },
  {
    n: "6.ª",
    titulo: "Limpeza do Espaço",
    corpo: `A 2.ª Contraente responsabiliza-se apenas pela recolha e remoção dos materiais, equipamentos e elementos decorativos da sua propriedade. A limpeza geral do espaço do evento não se encontra incluída no serviço contratado, salvo acordo escrito em contrário.`,
  },
  {
    n: "7.ª",
    titulo: "Impossibilidade de Prestação do Serviço",
    // "pelo cliente" (era "pelos noivos") — o contrato serve todos os
    // tipos de evento, não só casamentos.
    corpo: `Em caso de impossibilidade comprovada de realização do serviço por motivo de força maior, doença, acidente ou outra situação imprevisível e alheia à vontade da ${EMPRESA.designacao}, será efetuada a devolução dos valores já pagos pelo cliente, não sendo devida qualquer indemnização adicional.`,
  },
  {
    n: "8.ª",
    titulo: "Obrigações da 2.ª Contraente",
    corpo: `1. Executar o serviço com profissionalismo e de acordo com o padrão estético da marca ${EMPRESA.designacao}.

2. A 2.ª Contraente não se responsabiliza por alimentos ou bebidas não fornecidos pela mesma.

3. A 2.ª Contraente não se responsabiliza por danos decorrentes de utilização indevida do material após a montagem.`,
  },
  {
    n: "9.ª",
    titulo: "Obrigações do Cliente",
    corpo: `1. Garantir acesso ao local e condições adequadas para montagem e desmontagem.

2. Zelar pela correta utilização do material decorativo.

3. Cumprir as orientações da 2.ª Contraente.`,
  },
  {
    n: "10.ª",
    titulo: "Cancelamento",
    corpo: `• O cancelamento deverá ser comunicado por escrito à 2.ª Contraente.

• Cancelamento com mais de 30 dias de antecedência: perda do valor pago a título de sinal.

• Cancelamento entre 30 e 15 dias antes do evento: perda de 75% do valor total contratado.

• Cancelamento com menos de 15 dias de antecedência: sem devolução de quaisquer valores pagos.`,
  },
  {
    n: "11.ª",
    titulo: "Disposições Finais",
    corpo: `1. Qualquer alteração só será válida se feita por escrito.

2. O contrato é celebrado em duplicado.

3. As partes elegem o foro da ${EMPRESA.foro}, para resolução de litígios.`,
  },
];

// Composição por lugar (texto habitual dos serviços de mesa) — sugestão
// pré-preenchida que a Nádia pode editar no formulário.
export const COMPOSICAO_LUGAR_SUGERIDA = [
  "Prato principal e prato de sobremesa",
  "Talheres (garfo, faca e colher)",
  "Guardanapo de tecido",
  "Copo de vinho e copo de água",
  "Centro de mesa decorativo",
  "Castiçais e velas decorativas",
];

// Meses em português para a data por extenso
const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

// Converte "2026-08-01" → "1 de Agosto de 2026"
export const dataPorExtenso = (iso) => {
  if (!iso) return "___";
  const [a, m, d] = iso.split("-").map(Number);
  if (!a || !m || !d) return iso;
  const mes = MESES[m - 1];
  const mesCap = mes.charAt(0).toUpperCase() + mes.slice(1);
  return `${d} de ${mesCap} de ${a}`;
};

// ============================================================
// Valor por extenso (PT-PT) — ex: 650 → "seiscentos e cinquenta euros",
// 1250.80 → "mil duzentos e cinquenta euros e oitenta cêntimos".
// Cobre até 999 999€ (mais que suficiente para eventos); acima disso
// devolve "" e a Nádia escreve à mão.
// ============================================================

const ATE_DEZANOVE = [
  "zero",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "catorze",
  "quinze",
  "dezasseis",
  "dezassete",
  "dezoito",
  "dezanove",
];

const DEZENAS = [
  "",
  "",
  "vinte",
  "trinta",
  "quarenta",
  "cinquenta",
  "sessenta",
  "setenta",
  "oitenta",
  "noventa",
];

const CENTENAS = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];

// 0–99 por extenso
const ate99 = (n) => {
  if (n < 20) return ATE_DEZANOVE[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  return u ? `${DEZENAS[d]} e ${ATE_DEZANOVE[u]}` : DEZENAS[d];
};

// 0–999 por extenso ("cem" só quando é exatamente 100)
const ate999 = (n) => {
  if (n === 100) return "cem";
  if (n < 100) return ate99(n);
  const c = Math.floor(n / 100);
  const r = n % 100;
  return r ? `${CENTENAS[c]} e ${ate99(r)}` : CENTENAS[c];
};

// 0–999999 por extenso. Regra do "e" entre milhares e o resto:
// usa-se quando o resto é < 100 ou é uma centena redonda
// (ex: "mil e duzentos", mas "mil duzentos e cinquenta").
const ate999999 = (n) => {
  if (n < 1000) return ate999(n);
  const m = Math.floor(n / 1000);
  const r = n % 1000;
  const milhar = m === 1 ? "mil" : `${ate999(m)} mil`;
  if (!r) return milhar;
  const liga = r < 100 || r % 100 === 0 ? " e " : " ";
  return milhar + liga + ate999(r);
};

// Converte um valor em euros para texto por extenso (PT-PT).
export const valorPorExtensoPT = (valor) => {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0 || n >= 1000000) return "";

  let euros = Math.floor(n);
  let cent = Math.round((n - euros) * 100);
  // proteção ao arredondar (ex: 649.999 → 650 euros e 0 cêntimos)
  if (cent === 100) {
    euros += 1;
    cent = 0;
  }

  const parteEuros = `${ate999999(euros)} euro${euros === 1 ? "" : "s"}`;
  if (!cent) return parteEuros;
  const parteCent = `${ate99(cent)} cêntimo${cent === 1 ? "" : "s"}`;
  return `${parteEuros} e ${parteCent}`;
};
