import { supabase } from "./supabase";
import { ehFuncaoRpcEmFalta, codigoErroRpc } from "./rpc";

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

const gerarToken = () => {
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

// Fechar RESOLVE as promessas por confirmar (anuladas em lote, com
// carimbo) em vez de as deixar órfãs invisíveis para sempre — a UI
// mostra a contagem no gesto de confirmação, antes de chegar aqui.
export const fecharCampanha = async (id) => {
  const { error: erroPendentes } = await supabase
    .from("campanha_intencoes")
    .update({ estado: "anulada", anulada_em: new Date().toISOString() })
    .eq("campanha_id", id)
    .eq("estado", "pendente");
  if (erroPendentes) throw erroPendentes;
  return actualizarCampanha(id, {
    estado: "fechada",
    fechada_em: new Date().toISOString(),
  });
};

// Reabrir uma campanha concluída — acontece ao subir a meta acima do
// contribuído (o gesto explícito da gestora; ver ContribuicaoColetiva).
// celebrada_em fica: a celebração não repete. O índice único "uma
// ativa por evento" (033) protege — se entretanto nasceu outra ativa,
// o Postgres recusa (23505) e o chamador traduz.
export const reabrirCampanha = (id) =>
  actualizarCampanha(id, { estado: "ativa", fechada_em: null });

// Meta atingida: concluída + celebração carimbada (acontece UMA vez —
// uma campanha reaberta que volte a concluir preserva o carimbo da
// PRIMEIRA celebração, passado por quem chama).
export const concluirCampanha = (id, celebradaEm = null) =>
  actualizarCampanha(id, {
    estado: "concluida",
    celebrada_em: celebradaEm || new Date().toISOString(),
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

// O erro que os dois separadores partilham: quem chega segundo a uma
// promessa já resolvida vê isto, e nada é escrito.
export const INTENCAO_JA_RESOLVIDA = "INTENCAO_JA_RESOLVIDA";

// Só no fallback pré-039 (sem transação): o claim carimbou a promessa
// mas o INSERT do dinheiro falhou — meio-estado que a UI tem de
// explicar com todas as letras.
export const INTENCAO_CARIMBADA_SEM_DINHEIRO =
  "INTENCAO_CARIMBADA_SEM_DINHEIRO";

// A guarda vive no SERVIDOR: o update só toca a intenção se ela ainda
// estiver no estado esperado (.eq("estado", ...)). Antes, um segundo
// separador podia confirmar por cima de confirmada (duplicando o
// dinheiro) ou anular por cima de confirmada (histórico a mentir).
const marcarIntencao = async (id, campos, deEstado = "pendente") => {
  const { data, error } = await supabase
    .from("campanha_intencoes")
    .update(campos)
    .eq("id", id)
    .eq("estado", deEstado)
    .select()
    .single();
  if (error?.code === "PGRST116") {
    // 0 linhas: a intenção já não está "pendente" — resolvida noutro
    // separador/dispositivo.
    throw new Error(INTENCAO_JA_RESOLVIDA);
  }
  if (error) throw error;
  return data;
};

const marcarIntencaoConfirmada = (id) =>
  marcarIntencao(id, {
    estado: "confirmada",
    confirmada_em: new Date().toISOString(),
  });

export const anularIntencao = (id) =>
  marcarIntencao(id, {
    estado: "anulada",
    anulada_em: new Date().toISOString(),
  });

// Regista uma contribuição, imputada por ordem ao plano — e, se vier
// uma intenção (intencaoId), confirma-a NA MESMA transação: é a RPC
// contribuicao_registar (039) que reclama a promessa com guarda de
// estado, calcula a imputação com os números lidos no servidor (nunca
// com o retrato do browser) e insere as linhas — tudo ou nada.
// Devolve as linhas inseridas (1..N), todas com o MESMO created_at.
//
// Os `previstos`/`pagamentos` recebidos só servem o FALLBACK pré-039
// (a conta antiga, no browser) — com a RPC na BD são ignorados.
export const registarContribuicao = async (
  submissionId,
  previstos,
  pagamentos,
  { valor, contribuinte = null, metodo, data, notas = null },
  intencaoId = null,
  campanhaId = null,
) => {
  const v = arredondar(Number(valor));
  if (!submissionId || !Number.isFinite(v) || v <= 0) {
    throw new Error("Valor inválido.");
  }
  if (!metodo) throw new Error("Escolhe (ou escreve) o método.");
  // reconstituido=false exige data (CHECK da 025) — e um registo ao
  // vivo tem sempre data a sério.
  if (!data) throw new Error("Falta a data da contribuição.");

  const rpc = await supabase.rpc("contribuicao_registar", {
    p_submission_id: submissionId,
    p_valor: v,
    p_metodo: metodo,
    p_data: data,
    p_contribuinte: contribuinte || null,
    p_notas: notas || null,
    p_intencao_id: intencaoId || null,
    // A campanha dona do dinheiro (042). No caminho da promessa a RPC
    // usa a campanha da própria intenção — este parâmetro é o do
    // registo manual.
    p_campanha_id: campanhaId || null,
  });
  // Os códigos de negócio da RPC em português — o cliente pré-valida
  // os três primeiros, por isso só falam se as validações divergirem.
  const MENSAGENS = {
    VALOR_INVALIDO: "Valor inválido.",
    METODO_EM_FALTA: "Escolhe (ou escreve) o método.",
    DATA_EM_FALTA: "Falta a data da contribuição.",
    CAMPANHA_INVALIDA:
      "Esta campanha já não existe (ou não é deste evento) — recarrega a página.",
  };
  const traduzir = (erro) => {
    const codigo = codigoErroRpc(erro);
    if (codigo === INTENCAO_JA_RESOLVIDA) return new Error(INTENCAO_JA_RESOLVIDA);
    if (MENSAGENS[codigo]) return new Error(MENSAGENS[codigo]);
    return erro;
  };

  if (!rpc.error) return rpc.data || [];
  if (!ehFuncaoRpcEmFalta(rpc.error)) throw traduzir(rpc.error);

  // A assinatura de 8 argumentos não existe — pode ser uma BD com a
  // 039 mas SEM a 042: re-tenta a RPC ANTIGA (7 argumentos). Mantém a
  // transação e o cadeado; só o campanha_id fica por gravar nessa
  // janela (o backfill da 042 apanha-o depois, e o filtro da taça
  // tolera órfãos até lá).
  console.warn(
    "contribuicao_registar sem p_campanha_id — a tentar a assinatura da 039 (corre a 042).",
  );
  const rpc039 = await supabase.rpc("contribuicao_registar", {
    p_submission_id: submissionId,
    p_valor: v,
    p_metodo: metodo,
    p_data: data,
    p_contribuinte: contribuinte || null,
    p_notas: notas || null,
    p_intencao_id: intencaoId || null,
  });
  if (!rpc039.error) return rpc039.data || [];
  if (!ehFuncaoRpcEmFalta(rpc039.error)) throw traduzir(rpc039.error);

  // BD ainda sem a 039: a conta antiga, no browser. Reclama-se a
  // promessa PRIMEIRO (a ordem decidida pelo Hélio: só se insere o
  // dinheiro se o claim afetou uma linha) — sem transação, se o INSERT
  // falhar depois do claim fica promessa carimbada sem dinheiro, e
  // isso é dito com todas as letras a quem está a olhar.
  console.warn("contribuicao_registar em falta — a usar o fallback pré-039.");
  if (intencaoId) await marcarIntencaoConfirmada(intencaoId);

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
  if (error) {
    if (intencaoId) {
      // A causa original fica na consola para diagnóstico; o código
      // próprio deixa o componente tirar a promessa da lista e
      // explicar o meio-estado.
      console.error("Fallback pré-039: claim gravado, INSERT falhou:", error);
      throw new Error(INTENCAO_CARIMBADA_SEM_DINHEIRO);
    }
    throw error;
  }
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
// Com campanhaId, as contribuições de OUTRAS campanhas ficam de fora
// (042): era a soma por evento que fazia uma campanha nova nascer
// cheia com o dinheiro da anterior. Linhas SEM campanha_id (pré-042,
// ou a janela do fallback) ENTRAM de propósito — esconder dinheiro
// acabado de registar seria pior que o risco de herança, e a fronteira
// dura vive na BD: correr a 042 + backfill elimina os órfãos.
export const agruparContribuicoes = (pagamentos, campanhaId = null) => {
  const grupos = new Map();
  for (const p of pagamentos || []) {
    if (p.origem !== "contribuicao") continue;
    if (campanhaId && p.campanha_id && p.campanha_id !== campanhaId) continue;
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
