import { supabase } from "./supabase";

// ============================================================
// campanhas.js — a contribuição coletiva de um evento (migração 033).
//
// A campanha é ESTADO (meta, token, fase de vida); o dinheiro é sempre
// `pagamentos` com origem='contribuicao' — somar contribuições é somar
// pagamentos, e o resto do sistema fica certo sem aprender nada.
//
// A IMPUTAÇÃO POR ORDEM (decisão de 26/07/2026): cada contribuição
// enche primeiro o sinal, depois o remanescente — assim o
// saldoSinalPendente, a Jornada e o pagamento_final continuam
// verdadeiros de borla. Uma contribuição que atravesse a fronteira
// divide-se em DUAS linhas, inseridas num só statement (mesmo
// created_at) — é por esse carimbo que a UI as agrupa de volta numa
// contribuição só, e apagá-la apaga as duas num só DELETE (atómico).
// O que exceder o plano inteiro fica numa linha sem previsto
// (excedente): dinheiro é dinheiro, o resumo soma-o na mesma.
//
// O TOKEN nasce na app com aleatoriedade criptográfica (32 bytes hex),
// nunca derivado do id, e é revogável: regenerar substitui-o e o link
// antigo morre. (A página pública que o vai ler chega na F2.)
// ============================================================

const arredondar = (n) => Math.round(n * 100) / 100;

export const gerarToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
};

// A campanha mais recente do evento (ativa, concluída ou fechada) —
// a UI decide o que mostrar a partir do estado.
export const getCampanha = async (submissionId) => {
  const { data, error } = await supabase
    .from("campanhas")
    .select("*")
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
};

export const ativarCampanha = async (
  submissionId,
  { objetivo, mensagem = null, comoContribuir = null },
) => {
  const v = Number(objetivo);
  if (!submissionId || !Number.isFinite(v) || v <= 0) {
    throw new Error("Define a meta da campanha.");
  }
  const { data, error } = await supabase
    .from("campanhas")
    .insert({
      submission_id: submissionId,
      objetivo: arredondar(v),
      mensagem: mensagem || null,
      como_contribuir: comoContribuir || null,
      token: gerarToken(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

const actualizarCampanha = async (id, campos) => {
  const { data, error } = await supabase
    .from("campanhas")
    .update(campos)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const actualizarMeta = (id, objetivo) => {
  const v = Number(objetivo);
  if (!Number.isFinite(v) || v <= 0) throw new Error("Meta inválida.");
  return actualizarCampanha(id, { objetivo: arredondar(v) });
};

export const fecharCampanha = (id) =>
  actualizarCampanha(id, {
    estado: "fechada",
    fechada_em: new Date().toISOString(),
  });

// Meta atingida: concluída + celebração carimbada (acontece UMA vez).
export const concluirCampanha = (id) =>
  actualizarCampanha(id, {
    estado: "concluida",
    celebrada_em: new Date().toISOString(),
  });

// Revogação: o link partilhado por engano morre aqui, nasce outro.
export const regenerarToken = (id) =>
  actualizarCampanha(id, { token: gerarToken() });

export const actualizarComoContribuir = (id, texto) =>
  actualizarCampanha(id, { como_contribuir: texto?.trim() || null });

// A leitura PÚBLICA — sempre pela RPC da 034 (security definer, por
// token), nunca pela tabela: o anon não lê campanhas, e a RPC devolve
// só o que a página mostra (percentagem e pessoas — nunca valores).
export const getCampanhaPublica = async (token) => {
  const { data, error } = await supabase.rpc("campanha_publica", {
    p_token: token,
  });
  if (error) throw error;
  return data || null;
};

// ============================================================
// INTENÇÕES (035) — promessas deixadas na página pública. Não são
// dinheiro: só quando a Nádia confirma é que nasce o pagamento real
// (registarContribuicao), e a intenção fica carimbada.
// ============================================================

// A escrita pública — pela RPC da 035, com os travões dela (campanha
// ativa, nome obrigatório, valor são, máx. 200 pendentes).
export const prometerContribuicao = async (token, { nome, valor, mensagem }) => {
  const { data, error } = await supabase.rpc("prometer_contribuicao", {
    p_token: token,
    p_nome: nome,
    p_valor: Number(valor),
    p_mensagem: mensagem || null,
  });
  if (error) throw error;
  return data;
};

export const getIntencoesPendentes = async (campanhaId) => {
  const { data, error } = await supabase
    .from("campanha_intencoes")
    .select("*")
    .eq("campanha_id", campanhaId)
    .eq("estado", "pendente")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

const marcarIntencao = async (id, campos) => {
  const { data, error } = await supabase
    .from("campanha_intencoes")
    .update(campos)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// A confirmação em si (o dinheiro) faz-se ANTES, por
// registarContribuicao — o registo do dinheiro é o que não se pode
// perder; este carimbo vem a seguir, e se falhar a intenção fica
// pendente à vista (nunca o contrário: carimbada sem dinheiro).
export const marcarIntencaoConfirmada = (id) =>
  marcarIntencao(id, {
    estado: "confirmada",
    confirmada_em: new Date().toISOString(),
  });

export const anularIntencao = (id) =>
  marcarIntencao(id, {
    estado: "anulada",
    anulada_em: new Date().toISOString(),
  });

// Regista uma contribuição, imputada por ordem ao plano. Recebe os
// previstos e pagamentos que a página já tem (nunca refaz a query).
// Devolve as linhas inseridas (1..N), todas com o MESMO created_at.
export const registarContribuicao = async (
  submissionId,
  previstos,
  pagamentos,
  { valor, contribuinte = null, metodo, data, notas = null },
) => {
  const v = arredondar(Number(valor));
  if (!submissionId || !Number.isFinite(v) || v <= 0) {
    throw new Error("Valor inválido.");
  }
  if (!metodo) throw new Error("Escolhe (ou escreve) o método.");
  // reconstituido=false exige data (CHECK da 025) — e um registo ao
  // vivo tem sempre data a sério.
  if (!data) throw new Error("Falta a data da contribuição.");

  const partes = [];
  let resto = v;
  const ordenados = [...(previstos || [])].sort((a, b) => a.ordem - b.ordem);
  for (const previsto of ordenados) {
    if (resto <= 0) break;
    const pago = (pagamentos || [])
      .filter((p) => p.previsto_id === previsto.id)
      .reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
    const faltaAqui = arredondar(Number(previsto.valor) - pago);
    if (faltaAqui <= 0) continue;
    const parte = arredondar(Math.min(resto, faltaAqui));
    partes.push({ previsto_id: previsto.id, valor: parte });
    resto = arredondar(resto - parte);
  }
  // excedente: para lá do plano inteiro fica sem previsto — o resumo
  // soma-o na mesma ("pago a mais" é a UI a dizer a verdade)
  if (resto > 0) partes.push({ previsto_id: null, valor: resto });

  const { data: inseridos, error } = await supabase
    .from("pagamentos")
    .insert(
      partes.map((parte) => ({
        submission_id: submissionId,
        previsto_id: parte.previsto_id,
        valor: parte.valor,
        data,
        metodo,
        origem: "contribuicao",
        contribuinte: contribuinte || null,
        notas: notas || null,
        reconstituido: false,
      })),
    )
    .select();
  if (error) throw error;
  return inseridos;
};

// Apagar uma contribuição é apagar TODAS as linhas dela (a dividida
// tem duas) — um só DELETE, atómico.
export const apagarContribuicao = async (ids) => {
  const lista = (ids || []).filter(Boolean);
  if (lista.length === 0) return;
  const { error } = await supabase.from("pagamentos").delete().in("id", lista);
  if (error) throw error;
};

// As linhas de origem='contribuicao' agrupadas de volta em
// CONTRIBUIÇÕES (uma pessoa, um gesto): a chave é contribuinte +
// método + created_at — o carimbo idêntico do insert em lote.
export const agruparContribuicoes = (pagamentos) => {
  const grupos = new Map();
  for (const p of pagamentos || []) {
    if (p.origem !== "contribuicao") continue;
    const chave = `${p.contribuinte || ""}|${p.metodo || ""}|${p.created_at}`;
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        chave,
        contribuinte: p.contribuinte || null,
        metodo: p.metodo,
        data: p.data,
        created_at: p.created_at,
        total: 0,
        ids: [],
      });
    }
    const g = grupos.get(chave);
    g.total = arredondar(g.total + (Number(p.valor) || 0));
    g.ids.push(p.id);
  }
  return [...grupos.values()].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at),
  );
};
