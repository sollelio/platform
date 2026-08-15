import { supabase } from "./supabase";
import { comOmissao, nomeDaCasa } from "./casa";

// Gera um código legível e único — ex: DLM-X7K9-2025
export const generateCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part1 = Array.from(
    { length: 4 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
  const part2 = Array.from(
    { length: 4 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
  return `DLM-${part1}-${part2}`;
};

// Cria um novo convite no Supabase
// "respostas" é um objecto genérico (ex: { nomeNoivo: "...", email: "..." })
// com os campos que a irmã escolheu preencher no Painel de Novo Convite —
// pode ter campos diferentes, dependendo do tipo de evento e do que ela
// decidiu mostrar nesse momento.
// "submissionAlvoId" (opcional) aponta o formulário a um EVENTO existente:
// ao submeter, as respostas ATUALIZAM esse evento em vez de criar
// cliente + evento novos (o caminho do onboarding pós-sinal).
export const createInvite = async ({
  dataEvento,
  eventTypeId,
  respostas,
  reservaId,
  submissionAlvoId,
}) => {
  let code, exists;
  do {
    code = generateCode();
    const { data } = await supabase
      .from("invites")
      .select("id")
      .eq("code", code)
      .single();
    exists = !!data;
  } while (exists);

  const { data, error } = await supabase
    .from("invites")
    .insert([
      {
        code,
        data_evento: dataEvento || null,
        event_type_id: eventTypeId,
        respostas: respostas || {},
        status: "Pendente",
        reserva_id: reservaId || null,
        submission_alvo_id: submissionAlvoId || null,
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Vai buscar todos os tipos de evento disponíveis
// (para preencher o seletor ao criar um convite, e a lista no Admin)
export const getEventTypes = async () => {
  const { data, error } = await supabase
    .from("event_types")
    .select("id, nome, predefinido, steps, icone")
    // ⚠ CORRECÇÃO DE BUG 3/3 — o `icone` faltava no select, e dois
    // consumidores dependiam dele em silêncio: a mensagem de partilha
    // nunca usava o 💍 do casamento (caía sempre no ✨), e o objecto
    // que vai para o formulário levava `icone: undefined`.
    .order("nome");
  if (error) throw error;
  return data;
};

// Valida um código e devolve o convite se válido
// Inclui também o tipo de evento associado (nome + steps), para o
// formulário saber que perguntas mostrar.
// Caminho novo: RPC formulario_validar_convite (migração 020), que
// traz também os dados do evento-alvo (alvo_dados) para o
// pré-preenchimento do onboarding — o formulário deixa de precisar de
// ler a tabela submissions directamente. Enquanto a função não existir
// na BD, usa o caminho antigo.
//
// A CASA entra por argumento (099): duas destas mensagens dizem a quem
// se há-de queixar, e esse nome deixou de ser constante. Não se lê aqui
// por hook — isto não é componente — nem se adivinha pelo prefixo do
// código; quem chama é a porta de entrada, que já tem o Provider. Sem
// argumento cai na omissão, como tudo o resto.
//
// 104 · Uma porta só. Havia um caminho antigo — ler a tabela `invites`
// directamente — para o código poder ir para o ar antes da migração
// 020. Depois da RLS por casa (091) esse SELECT não dá erro nenhum ao
// anónimo: dá ZERO LINHAS, e o `data` a null faz esta função responder
// «Código inválido» a quem tem um código bom. Era a pior forma de
// falhar que este ficheiro podia ter.
export const validateCode = async (code, casaCrua) => {
  const casa = comOmissao(casaCrua);

  const { data, error } = await supabase.rpc("formulario_validar_convite", {
    p_codigo: code,
  });
  // `data` a null é resposta legítima: o código não existe.
  if (error || !data) {
    return {
      valid: false,
      reason:
        "Código inválido. Verifica o código que recebeste e tenta novamente.",
    };
  }
  if (!data.event_types) {
    return {
      valid: false,
      reason:
        `Este convite não tem um tipo de evento associado. Contacta a ${nomeDaCasa(casa)}.`,
    };
  }
  if (data.status === "Preenchido") {
    return {
      valid: false,
      reason:
        `Este formulário já foi submetido. Se precisares de alterar alguma resposta, contacta a ${nomeDaCasa(casa)}.`,
    };
  }
  return { valid: true, invite: data };
};

// ------------------------------------------------------------
// A FONTE ÚNICA da pergunta "qual é o convite deste evento e em que
// estado está o formulário?". Antes havia quatro contas diferentes
// (drawer, Jornada, separador Documentos, AdminPage) que divergiam
// quando o evento tinha mais de um convite — e um convite que tinha
// duplicado (respostas gravadas noutro evento) acendia "Formulário ✓"
// no evento original, escondendo o próprio estrago.
//
// Estados devolvidos:
//   "nenhum"            → não há convite deste evento (criar)
//   "pendente"          → convite por preencher (preencher/partilhar)
//   "preenchido"        → respostas gravadas NESTE evento (ver)
//   "preenchido-noutro" → convite apontado cá, mas as respostas foram
//                         parar a OUTRO evento — o rasto da duplicação;
//                         conta como "sem respostas" em todos os ✓.
// Desempate determinístico: o mais recente primeiro (created_at; id
// como critério final, para listas que chegam sem ordenação da BD).
export const estadoFormularioDoEvento = (invites, eventoId) => {
  if (!eventoId) return { convite: null, estado: "nenhum" };
  const doEvento = (invites || []).filter(
    (i) => i.submission_id === eventoId || i.submission_alvo_id === eventoId,
  );
  const maisRecente = (lista) =>
    [...lista].sort(
      (a, b) =>
        new Date(b.created_at || 0) - new Date(a.created_at || 0) ||
        String(b.id).localeCompare(String(a.id)),
    )[0] || null;

  const preenchidoAqui = maisRecente(
    doEvento.filter((i) => i.submission_id === eventoId),
  );
  if (preenchidoAqui) return { convite: preenchidoAqui, estado: "preenchido" };

  // "Pendente" exige as duas coisas: sem submissão E status por
  // preencher. Um convite marcado "Preenchido" sem submission_id (o
  // rasto de um markInviteUsed que falhou a meio) não pode voltar a
  // ser oferecido para preencher.
  const pendente = maisRecente(
    doEvento.filter((i) => !i.submission_id && i.status !== "Preenchido"),
  );
  if (pendente) return { convite: pendente, estado: "pendente" };

  const desviado = maisRecente(doEvento);
  if (desviado) return { convite: desviado, estado: "preenchido-noutro" };

  return { convite: null, estado: "nenhum" };
};

// Aponta um convite PENDENTE a um evento existente — a reparação manual
// de um convite órfão (criado sem alvo, o caminho que duplicava). A
// guarda .is("submission_id", null) vive no servidor: um convite já
// preenchido nunca é re-apontado, mesmo com dois separadores abertos.
export const apontarConviteAoEvento = async (inviteId, submissionId) => {
  const { data, error } = await supabase
    .from("invites")
    .update({ submission_alvo_id: submissionId })
    .eq("id", inviteId)
    .is("submission_id", null)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// 104 · A markInviteUsed saiu daqui.
//
// Marcava o convite («Preenchido» + submission_id) e convertia a
// reserva de origem («Convertida» + submission_id) — exactamente os
// dois updates que a formulario_submeter já faz, dentro da MESMA
// transação (036, linhas 233 e 238). Verificado campo a campo antes de
// sair: não fazia mais nada.
//
// O que se perde é o modo de falhar: dois updates soltos no browser
// deixavam o convite marcado e a reserva por converter se o segundo
// falhasse — e o chamador engolia o erro de propósito, para não mandar
// o cliente resubmeter. O sintoma aparecia semanas depois, numa reserva
// que ficou na agenda.


// ============================================================
// OS FORMULÁRIOS ÓRFÃOS — a definição num sítio só.
//
// Um órfão é um formulário por preencher que não está ligado a evento
// nenhum. Cada um é uma porta para o duplicado: se for de alguém que já
// existe, o preenchimento cria cliente E evento novos.
//
// Havia duas formas de chegar a eles — a lista global (Formulários) e
// uma leitura própria (a página do evento, que só lê os convites DESTE
// evento). Duas formas com a regra escrita duas vezes divergiriam; a
// regra fica aqui, as formas de acesso é que são duas.
// ============================================================

export const ehFormularioOrfao = (i) =>
  i.status !== "Preenchido" && !i.submission_id && !i.submission_alvo_id;

// As TRÊS condições da adopção. Governavam o selector do painel antigo;
// agora que o aviso dentro do evento também as precisa, saem de lá.
//   1. um convite nascido de uma RESERVA não se adopta — pertence à
//      conversão dessa reserva;
//   2. o tipo tem de coincidir: apontar um Aniversário a um Casamento
//      reescreveria o tipo e fundiria respostas de outro modelo;
//   3. um órfão SEM tipo aceita qualquer evento.
export const podeSerAdoptadoPor = (orfao, evento) =>
  !!evento &&
  !orfao.reserva_id &&
  (!orfao.event_type_id || orfao.event_type_id === evento.event_type_id);

// A leitura própria, para quem não tem a lista global em mão.
export const getFormulariosOrfaos = async () => {
  const { data, error } = await supabase
    .from("invites")
    .select("*")
    .is("submission_id", null)
    .is("submission_alvo_id", null)
    .neq("status", "Preenchido")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};
