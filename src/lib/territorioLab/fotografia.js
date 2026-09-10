// ============================================================
// territorioLab/fotografia.js — a FOTOGRAFIA de staging do Atlas
// Vision Prototype.
//
// É uma cópia SANITIZADA dos pedidos registados reais (query corrida
// pelo Hélio na produção a 10/09/2026): só os campos agregáveis —
// localidade, tipo de espaço, fase, estado, datas, convidados, valor.
// SEM nomes, SEM contactos, SEM moradas de rua. O protótipo NUNCA
// consulta a produção em runtime: lê daqui.
//
// Os km reais são os 4 congelados nas linhas de Deslocação dos
// orçamentos dessa fotografia (a única distância "verdadeira" que o
// sistema tem; o resto estima-se — ver geo.js).
// ============================================================

export const META_FOTOGRAFIA = {
  data: "2026-09-10",
  origem: "produção (query manual do Hélio — sem PII)",
  nota: "Protótipo de staging: nenhum acesso à produção em runtime.",
};

const R = (i, localidade, tipo, fase, status, data, convidados, valor, pedidoEm) => ({
  id: `foto-${String(i).padStart(2, "0")}`,
  local_evento: null,
  respostas: {
    localEvento: localidade || undefined,
    tipoLocal: tipo || undefined,
  },
  fase,
  status,
  data_evento: data,
  numero_convidados: convidados,
  valor_acordado: valor,
  created_at: `${pedidoEm}T12:00:00Z`,
});

export const FOTOGRAFIA = [
  R(1, "Sociedade 1º de Dezembro", "Salão", "projecto", "Concluído", "2026-07-19", 25, "280.00", "2026-07-12"),
  R(2, "Av da liberdade", "Outro: Escritório", "projecto", "Concluído", "2026-07-24", 40, "270.00", "2026-07-12"),
  R(3, "Alhos Vedros - Margem Sul", "Ao domicílio", "projecto", "Concluído", "2026-07-25", 12, "282.00", "2026-07-13"),
  R(4, "Guia Louge ( Cascais)", "Quinta", "projecto", "Concluído", "2026-08-01", 60, "800.00", "2026-07-13"),
  R(5, "Sesimbra ( associação disportiva de azóia)", "Salão", "contrato", "Recebido", "2026-09-05", 80, "1565.00", "2026-07-13"),
  R(6, "Loures", "Salão", "contrato", "Recebido", "2026-12-26", 144, "986.00", "2026-07-13"),
  R(7, "Cascais", "Ao domicílio", "projecto", "Concluído", "2026-08-16", 25, "770.00", "2026-07-13"),
  R(8, "Venda do pinheiro", "Ao domicílio", "contrato", "Recebido", "2026-09-19", null, "668.00", "2026-07-13"),
  R(9, "Rio de Mouro", "Salão", "contrato", "Concluído", "2026-08-22", 50, "650.00", "2026-07-16"),
  R(10, "Camarate", "Salão", "cliente", "Recebido", "2026-11-01", 42, "1020.00", "2026-07-17"),
  R(11, null, "Salão", "interessado", "Recebido", "2026-09-12", 50, "950.00", "2026-07-18"),
  R(12, "Barreiro", "Outro: Salão de clube desportivo", "interessado", "Recebido", "2026-10-30", 80, "1290.00", "2026-07-21"),
  R(13, "Grande Lisboa", "Salão", "contrato", "Concluído", "2026-08-15", 20, "280.00", "2026-07-29"),
  R(14, "Lourinhã", "Salão", "interessado", "Recebido", "2026-10-05", 55, "648.90", "2026-08-07"),
  R(15, "Cascais", "Outro: A escolher ainda", "interessado", "Recebido", "2027-03-09", 40, "780.00", "2026-08-09"),
  R(16, null, null, "sinal", "Recebido", null, null, null, "2026-08-27"),
  R(17, "Cascais", "Exterior", "interessado", "Recebido", "2026-09-26", 50, null, "2026-08-30"),
  R(18, "Amadora", "Salão", "interessado", "Recebido", "2026-09-16", 30, null, "2026-08-31"),
  R(19, "Amora", "Ao domicílio", "interessado", "Recebido", "2026-12-05", 30, "1330.00", "2026-08-31"),
];

// km por estrada CONGELADOS nos orçamentos (desde a base de pricing
// dos orçamentos — não confundir com o núcleo operacional; ver
// geo.js). id → { km, oferecida }
export const KM_REAIS = {
  "foto-14": { km: 79, oferecida: false }, // Lourinhã (auto)
  "foto-07": { km: 26, oferecida: false }, // Cascais (auto, 25,656)
  "foto-15": { km: 25, oferecida: false }, // Cascais (manual)
  "foto-04": { km: 30, oferecida: true }, // Guia (manual, oferecida)
};
