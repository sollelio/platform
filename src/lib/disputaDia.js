import { supabase } from "./supabase";
import { FASES_POS_SINAL } from "./fases";
import { ESTADOS_RESERVA } from "./reservas";
import { extrairDadosCliente } from "./clientes";

// ============================================================
// disputaDia.js — a lib ÚNICA da disputa do dia (migração 083).
//
// A regra da casa: quem decide o estado de um dia é a RPC
// dlm_dia_estado, no servidor — a definição única que todas as portas
// consultam (o registo na ficha, o Funil, o portal). Esta lib nunca
// reimplementa essa decisão em JS: pergunta ao servidor (estadoDoDia)
// e, para o painel da Nádia, junta a MATÉRIA-PRIMA da disputa
// (irmaosDoDia) — os eventos vivos da data e as reservas provisórias
// — para ela ver com quem está a falar, não para decidir por ela.
//
// TUDO deriva de data_evento em leitura (o padrão do caducou): mudar
// a data dissolve disputa, prazo e preferência sozinha. Por isso não
// há aqui caches nem estados guardados — cada pergunta vai à BD.
//
// Degradação graciosa: enquanto a 083 não correr numa BD, as colunas,
// a mesa e as RPCs não existem lá — tudo devolve null/[] em silêncio
// (um console.warn único) e a UI cala-se, como a casa sempre fez
// (padrão de notificacoes.js/rpc.js).
// ============================================================

// O PostgREST responde com estes códigos quando a peça não existe:
// tabela (42P01/PGRST205), coluna (42703/PGRST204), função
// (42883/PGRST202). Qualquer um deles = «a 083 ainda não correu aqui».
const ehEsquemaEmFalta = (erro) =>
  ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(
    erro?.code,
  ) ||
  /does not exist|could not find the (table|function)|could not find .* column/i.test(
    erro?.message || "",
  );

// Um aviso só por sessão — a disputa muda em vários ecrãs e repetir o
// warn a cada render era ruído, não informação.
let avisou083 = false;
const degradar = (erro, resposta) => {
  if (!ehEsquemaEmFalta(erro)) throw erro;
  if (!avisou083) {
    console.warn(
      "disputaDia: a migração 083 ainda não correu nesta BD — a disputa do dia fica muda.",
      erro?.message || erro,
    );
    avisou083 = true;
  }
  return resposta;
};

// O estado de um dia, pela definição ÚNICA (dlm_dia_estado):
// {estado: 'livre'|'tomado'|'preferencia'|'em_confirmacao',
//  rival_id?, rival_nome?, ate?}. `excluirId` tira o próprio evento da
// conta — ninguém é rival de si mesmo. Null quando a 083 falta.
export const estadoDoDia = async (dataISO, excluirId = null) => {
  try {
    const { data, error } = await supabase.rpc("dlm_dia_estado", {
      p_data: dataISO || null,
      p_excluir: excluirId,
    });
    if (error) throw error;
    return data || null;
  } catch (e) {
    return degradar(e, null);
  }
};

// Os IRMÃOS de um dia — a matéria-prima do painel da disputa: todos os
// eventos VIVOS (fase ≠ perdido) dessa data mais as reservas
// provisórias activas, cada um com o que a Nádia precisa de ver:
//   [{id, nome, fase, criadoEm, temSinal, confirmacao, guardadoAte,
//     ehReserva}]
// temSinal segue a definição canónica (077/078): fase pós-sinal OU
// pagamento de origem 'sinal' não reconstituído. Os pagamentos e as
// confirmações vêm numa ida cada (sem N+1) — com três irmãos no mesmo
// dia, seis queries seriam o painel a arrastar-se.
export const irmaosDoDia = async (dataISO, excluirId = null) => {
  if (!dataISO) return [];
  try {
    let query = supabase
      .from("submissions")
      .select("id, fase, created_at, dia_guardado_ate, respostas, clientes(nome)")
      .eq("data_evento", dataISO)
      .neq("fase", "perdido")
      .order("created_at", { ascending: true });
    if (excluirId) query = query.neq("id", excluirId);
    const { data: eventos, error: e1 } = await query;
    if (e1) throw e1;

    const ids = (eventos || []).map((ev) => ev.id);

    const [sinais, confirmacoes, reservas] = await Promise.all([
      ids.length === 0
        ? { data: [] }
        : supabase
            .from("pagamentos")
            .select("submission_id")
            .in("submission_id", ids)
            .eq("origem", "sinal")
            .eq("reconstituido", false),
      ids.length === 0
        ? { data: [] }
        : supabase
            .from("portal_sinal_confirmacoes")
            .select("id, submission_id, criado_em, metodo_indicado")
            .in("submission_id", ids)
            .is("anulada_em", null),
      supabase
        .from("reservas")
        .select("id, nome_cliente, created_at, submission_id")
        .eq("data_evento", dataISO)
        .eq("estado", ESTADOS_RESERVA.PROVISORIA),
    ]);
    if (sinais.error) throw sinais.error;
    if (confirmacoes.error) throw confirmacoes.error;
    if (reservas.error) throw reservas.error;

    const comSinal = new Set((sinais.data || []).map((p) => p.submission_id));
    const confPorEvento = new Map(
      (confirmacoes.data || []).map((c) => [
        c.submission_id,
        { id: c.id, criadoEm: c.criado_em, metodo: c.metodo_indicado || null },
      ]),
    );

    const irmaos = (eventos || []).map((ev) => ({
      id: ev.id,
      // O nome como as listas da casa o buscam: o cartão da pessoa
      // (clientes.nome) primeiro, e as respostas do formulário como
      // rede — a mesma extracção canónica da migração 011.
      nome: ev.clientes?.nome || extrairDadosCliente(ev.respostas || {}).nome,
      fase: ev.fase,
      criadoEm: ev.created_at,
      temSinal: FASES_POS_SINAL.includes(ev.fase) || comSinal.has(ev.id),
      confirmacao: confPorEvento.get(ev.id) || null,
      guardadoAte: ev.dia_guardado_ate || null,
      ehReserva: false,
    }));

    // As reservas provisórias da data — SEM as já representadas por um
    // evento contado acima (desde o Funil bloco 7 cada reserva nasce
    // com o seu evento ligado: contá-la outra vez seria o mesmo
    // interesse a aparecer duas vezes no painel). A ligada ao PRÓPRIO
    // evento excluído também fica de fora — é ele, não um rival.
    const idsContados = new Set(ids);
    for (const r of reservas.data || []) {
      if (r.submission_id && idsContados.has(r.submission_id)) continue;
      if (r.submission_id && r.submission_id === excluirId) continue;
      irmaos.push({
        id: r.id,
        nome: r.nome_cliente || "Cliente sem nome",
        // fase null de propósito: uma reserva sem evento contado não
        // tem lugar no funil — a UI mostra-a como «Reserva provisória».
        fase: null,
        criadoEm: r.created_at,
        temSinal: false,
        confirmacao: null,
        guardadoAte: null,
        ehReserva: true,
      });
    }
    return irmaos;
  } catch (e) {
    return degradar(e, []);
  }
};

// A confirmação VIVA («já paguei» por anular) de um evento — no máximo
// uma, garantida pelo índice parcial da 083. Null se não houver.
export const confirmacaoViva = async (submissionId) => {
  if (!submissionId) return null;
  try {
    const { data, error } = await supabase
      .from("portal_sinal_confirmacoes")
      .select("id, criado_em, metodo_indicado")
      .eq("submission_id", submissionId)
      .is("anulada_em", null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { id: data.id, criadoEm: data.criado_em, metodo: data.metodo_indicado || null };
  } catch (e) {
    return degradar(e, null);
  }
};

// «Afinal não pagou»: a confirmação ANULA-SE, nunca se apaga — amanhã
// é preciso saber que a promessa existiu (e quem a limpou). O filtro
// por anulada_em null torna o gesto idempotente: limpar duas vezes não
// reescreve a assinatura da primeira.
export const limparConfirmacaoSinal = async (id) => {
  if (!id) return null;
  try {
    const { data: sessao } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("portal_sinal_confirmacoes")
      .update({
        anulada_em: new Date().toISOString(),
        anulada_por: sessao?.user?.email || "backoffice",
      })
      .eq("id", id)
      .is("anulada_em", null)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (e) {
    return degradar(e, null);
  }
};

// O prazo da preferência: «guardado para si até DD/MM» — gesto da
// Nádia, um por dia no máximo (regra guardada na UI). Null LIMPA o
// prazo. Expira sozinho em leitura (dlm_dia_estado só o conta enquanto
// >= hoje) — por isso nunca há aqui vassoura nenhuma.
export const guardarPrazoDia = async (submissionId, dataISO) => {
  if (!submissionId) return null;
  try {
    const { data, error } = await supabase
      .from("submissions")
      .update({ dia_guardado_ate: dataISO || null })
      .eq("id", submissionId)
      .select("id, dia_guardado_ate")
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    return degradar(e, null);
  }
};

// A forma de pagamento do sinal DESTE evento:
//   {metodo: 'mbway_iban'|'conversa'|'dinheiro'|'outra',
//    mbway, iban, instrucao}
// Null volta ao default do front (os dados da casa). Jsonb livre de
// propósito, como o `metodo` dos pagamentos (025) — uma forma nova de
// receber nunca deve exigir migração.
export const guardarConfigSinal = async (submissionId, config) => {
  if (!submissionId) return null;
  try {
    const { data, error } = await supabase
      .from("submissions")
      .update({ sinal_pagamento: config || null })
      .eq("id", submissionId)
      .select("id, sinal_pagamento")
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    return degradar(e, null);
  }
};

// O registo do sinal COM a guarda do dia (dlm_registar_sinal): a porta
// do servidor verifica o dia, tranca-o (advisory lock) e insere o
// pagamento — ou recusa com estado em português ('dia_tomado',
// 'ja_registado', 'prazo_alheio', 'invalido'). Devolve a resposta CRUA
// da RPC — a UI decide o que dizer a cada estado. A ORDEM INVERTIDA do
// Funil é lei: a fase só avança DEPOIS do 'ok', nunca antes da guarda.
export const registarSinalComGuarda = async ({
  submissionId,
  valor,
  data,
  metodo,
  contribuinte = null,
  notas = null,
  forcar = false,
}) => {
  try {
    const { data: resposta, error } = await supabase.rpc(
      "dlm_registar_sinal",
      {
        p_submission: submissionId,
        p_valor: valor,
        p_data: data || null,
        p_metodo: metodo || null,
        p_contribuinte: contribuinte,
        p_notas: notas,
        p_forcar: !!forcar,
      },
    );
    if (error) throw error;
    return resposta;
  } catch (e) {
    return degradar(e, null);
  }
};

// Os meses à mão, como base.js:14-20 (a cópia é deliberada: uma lib
// nunca importa de components/) — a casa escreve em grafia pré-acordo,
// com maiúscula no mês, e o toLocaleDateString não dá nenhuma das duas:
// o locale moderno põe minúscula e, num browser sem ICU pt-PT, cai em
// inglês SEM erro nenhum — a mensagem sairia meio traduzida e ninguém
// dava por ela.
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio",
  "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// «25 de Setembro», a partir de 'YYYY-MM-DD' — a string parte-se à mão,
// sem passar por um Date local (o padrão de base.js/partesDaData): um
// parse ISO puro cai em UTC e num fuso atrás recuava um dia.
const diaPorExtenso = (iso) => {
  const [, m, d] = String(iso || "").slice(0, 10).split("-").map(Number);
  if (!m || !d || !MESES[m - 1]) return "";
  return `${d} de ${MESES[m - 1]}`;
};

// O texto pré-escrito do WhatsApp quando a Nádia guarda o dia — o tom
// da casa: aviso honesto, sem ameaça. Vive aqui para o botão «copiar»
// e o botão «abrir WhatsApp» dizerem SEMPRE a mesma coisa. Sem nome
// (nunca devia acontecer, mas os dados mandam), a saudação fica só
// «Olá!» — nunca um «Olá null!» copiado para uma cliente.
export const prazoWhatsApp = (nome, dataEventoISO, prazoISO) => {
  const saudacao = nome && String(nome).trim() ? `Olá ${String(nome).trim()}!` : "Olá!";
  return (
    `${saudacao} Há mais interesse no dia ${diaPorExtenso(dataEventoISO)}. ` +
    `Guardámos o dia para si até ${diaPorExtenso(prazoISO)} — depois fica ` +
    `em aberto. Qualquer dúvida, é só responder por aqui.`
  );
};

// O texto pré-escrito quando o sinal ENTRA — o fecho do círculo que o
// ecrã de espera do portal promete («assim que estiver connosco, a
// data fica reservada em seu nome, e esta página acorda por inteiro»).
// Vive ao lado do texto do prazo pela mesma razão que ele: o botão de
// abrir e o de copiar dizem SEMPRE a mesma coisa. Sem ligação viva do
// acompanhamento não se promete página nenhuma — a frase cala-se; e
// quando há, a mensagem TERMINA no endereço, sem ponto a seguir, para
// o WhatsApp ler a ligação limpa.
export const sinalRecebidoWhatsApp = (nome, dataEventoISO, ligacao = null) => {
  const saudacao = nome && String(nome).trim() ? `Olá ${String(nome).trim()}!` : "Olá!";
  const dia = diaPorExtenso(dataEventoISO);
  const reserva = dia
    ? `${saudacao} Recebemos o seu sinal — o dia ${dia} fica reservado em seu nome.`
    : `${saudacao} Recebemos o seu sinal — a sua data fica reservada em seu nome.`;
  const fecho = "Qualquer dúvida, é só responder por aqui.";
  return ligacao
    ? `${reserva} ${fecho} A sua página acordou por inteiro: ${ligacao}`
    : `${reserva} ${fecho}`;
};
