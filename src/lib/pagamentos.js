import { supabase } from "./supabase";

// ============================================================
// pagamentos.js — regista dinheiro, não o move (ver docs/migracoes/025).
//
// pagamentos_previstos = o PLANO (sinal 50% + remanescente 50%),
//   gerado sozinho por gerarPrevistos sempre que valor_acordado é
//   gravado (chamado a partir de guardarValorAcordado em clientes.js)
//   — idempotente, nunca duplica um plano já existente.
// pagamentos = o que entrou DE FACTO. Nunca se guarda "está pago" nem
//   um saldo nalgum lado — calcula-se sempre a partir daqui.
//
// `metodo` e `origem` são texto livre de propósito (nunca enum) — a
// lista de sugestões vive em METODOS_SUGERIDOS, só para autocomplete.
// ============================================================

export const METODOS_SUGERIDOS = [
  "MB Way",
  "Transferência bancária",
  "Numerário",
];

const DESCRICAO_SINAL = "Sinal (50%)";
const DESCRICAO_REMANESCENTE = "Remanescente (50%)";

const arredondar = (n) => Math.round(n * 100) / 100;

// Gera o plano (sinal + remanescente) para um evento, SE ainda não
// tiver nenhum — chamar em cima de um valor já existente não duplica.
export const gerarPrevistos = async (submissionId, valorAcordado, dataEvento) => {
  const v = Number(valorAcordado);
  if (!submissionId || !Number.isFinite(v) || v <= 0) return;

  const { data: existentes, error: e1 } = await supabase
    .from("pagamentos_previstos")
    .select("id")
    .eq("submission_id", submissionId)
    .limit(1);
  if (e1) throw e1;
  if (existentes && existentes.length > 0) return;

  const metade = arredondar(v / 2);
  const dataLimite = dataEvento
    ? new Date(new Date(`${dataEvento}T00:00:00`).getTime() - 2 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
    : null;

  const { error: e2 } = await supabase.from("pagamentos_previstos").insert([
    {
      submission_id: submissionId,
      descricao: DESCRICAO_SINAL,
      valor: metade,
      data_limite: null,
      ordem: 1,
    },
    {
      submission_id: submissionId,
      descricao: DESCRICAO_REMANESCENTE,
      valor: metade,
      data_limite: dataLimite,
      ordem: 2,
    },
  ]);
  if (e2) throw e2;
};

// O plano + o dinheiro recebido de um evento, já ordenados — tudo o
// que o painel de pagamentos da ficha precisa.
export const getPagamentosEvento = async (submissionId) => {
  const [{ data: previstos, error: e1 }, { data: pagamentos, error: e2 }] =
    await Promise.all([
      supabase
        .from("pagamentos_previstos")
        .select("*")
        .eq("submission_id", submissionId)
        .order("ordem", { ascending: true }),
      supabase
        .from("pagamentos")
        .select("*")
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: true }),
    ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return { previstos: previstos || [], pagamentos: pagamentos || [] };
};

// Regista um pagamento real — reconstituido fica sempre false (é a
// Nádia a registá-lo agora, ao contrário do backfill/importação).
export const registarPagamento = async (
  submissionId,
  { previstoId = null, valor, data, metodo, origem, contribuinte = null, notas = null },
) => {
  const v = Number(valor);
  if (!submissionId || !Number.isFinite(v) || v <= 0) {
    throw new Error("Valor inválido.");
  }
  if (!metodo) throw new Error("Escolhe (ou escreve) o método de pagamento.");
  if (!origem) throw new Error("Falta a origem do pagamento.");

  const { data: registo, error } = await supabase
    .from("pagamentos")
    .insert({
      submission_id: submissionId,
      previsto_id: previstoId,
      valor: v,
      data: data || null,
      metodo,
      origem,
      contribuinte: contribuinte || null,
      notas: notas || null,
      reconstituido: false,
    })
    .select()
    .single();
  if (error) throw error;
  return registo;
};

// Apaga um pagamento — a UI tem de confirmar com valor+data ANTES de
// chamar isto (ver PagamentosEvento.jsx). Nunca window.confirm.
export const apagarPagamento = async (pagamentoId) => {
  const { error } = await supabase
    .from("pagamentos")
    .delete()
    .eq("id", pagamentoId);
  if (error) throw error;
};

// Chamado pelo botão "Sinal recebido →" do Funil — a ÚNICA transição
// de fase que move dinheiro a sério, por isso é a única que pede
// método + data antes de avançar (ver FunilBoard.jsx). Garante o
// plano primeiro (idempotente) e só regista o pagamento se ainda não
// houver nenhum ligado ao sinal — protege contra duplo clique.
export const registarSinalDoFunil = async (
  submissionId,
  valorAcordado,
  dataEvento,
  { metodo, data },
) => {
  const v = Number(valorAcordado);
  if (!submissionId || !Number.isFinite(v) || v <= 0) return null;

  await gerarPrevistos(submissionId, v, dataEvento);

  const { data: previstos, error: e1 } = await supabase
    .from("pagamentos_previstos")
    .select("id, valor")
    .eq("submission_id", submissionId)
    .eq("ordem", 1)
    .limit(1);
  if (e1) throw e1;
  const sinal = previstos && previstos[0];
  if (!sinal) return null;

  const { data: existentes, error: e2 } = await supabase
    .from("pagamentos")
    .select("id")
    .eq("previsto_id", sinal.id)
    .limit(1);
  if (e2) throw e2;
  if (existentes && existentes.length > 0) return null;

  return registarPagamento(submissionId, {
    previstoId: sinal.id,
    valor: sinal.valor,
    data,
    metodo,
    origem: "sinal",
  });
};

// Os previstos + pagamentos de VÁRIOS eventos duma vez — usado pelo
// Início para somar o sinal por receber sem N+1 queries (um pedido por
// evento seria lento com dezenas de eventos vivos).
export const getPagamentosVarios = async (submissionIds) => {
  const ids = [...new Set((submissionIds || []).filter(Boolean))];
  if (ids.length === 0) return { previstos: [], pagamentos: [] };
  const [{ data: previstos, error: e1 }, { data: pagamentos, error: e2 }] =
    await Promise.all([
      supabase.from("pagamentos_previstos").select("*").in("submission_id", ids),
      supabase.from("pagamentos").select("*").in("submission_id", ids),
    ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return { previstos: previstos || [], pagamentos: pagamentos || [] };
};

// O saldo por receber do sinal de UM evento: o previsto (ordem 1)
// menos o que já entrou ligado a ele. Nunca uma divisão por dois —
// a fonte é sempre o plano (pagamentos_previstos) menos o real
// (pagamentos), para respeitar pagamentos parciais.
export const saldoSinalPendente = (submissionId, previstos, pagamentos) => {
  const previstoSinal = (previstos || []).find(
    (p) => p.submission_id === submissionId && p.ordem === 1,
  );
  if (!previstoSinal) return 0;
  const pago = (pagamentos || [])
    .filter((p) => p.previsto_id === previstoSinal.id)
    .reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
  return Math.max(0, arredondar(Number(previstoSinal.valor) - pago));
};

// O resumo financeiro de um evento — sem clamping: "falta" negativo
// significa pago a mais, e a UI decide como mostrar isso.
export const resumoPagamentos = (valorAcordado, pagamentos) => {
  const total = Number(valorAcordado) || 0;
  const pago = (pagamentos || []).reduce(
    (acc, p) => acc + (Number(p.valor) || 0),
    0,
  );
  return {
    total: arredondar(total),
    pago: arredondar(pago),
    falta: arredondar(total - pago),
  };
};
