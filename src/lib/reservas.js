import { supabase } from "./supabase";

// ============================================================
// reservas.js — reservas provisórias da Agenda.
// Marcação rápida de um dia enquanto a irmã fala com a cliente.
//
// ALINHADO COM O FUNIL (bloco 7): criar uma reserva cria também a
// PESSOA (clientes) + o EVENTO (submission em fase "interessado"),
// ligados via submission_id — a reserva segura a data na Agenda e a
// pessoa entra no funil no mesmo gesto, como qualquer interessado.
//
// submission_id = "o evento desta reserva" (desde a criação); o
// ESTADO continua a ser o marcador do ciclo de vida:
//   Provisória → aparece na Agenda (tracejada)
//   Convertida → o formulário de onboarding foi submetido
//   Cancelada  → saiu da Agenda (e o evento ligado passa a "perdido")
//
// NOTA DE USO: a reserva é para pessoas NOVAS (ao telefone). Para
// alguém que já está no funil, o certo é pôr a data no próprio
// evento (drawer) — criar reserva duplicaria a pessoa.
// ============================================================

// Estados possíveis de uma reserva no funil.
export const ESTADOS_RESERVA = {
  PROVISORIA: "Provisória",
  CONVERTIDA: "Convertida",
  CANCELADA: "Cancelada",
};

// Vai buscar as reservas, com o nome do tipo de evento (join opcional).
// Por defeito só traz as provisórias — as convertidas já viraram
// submissões e aparecem como eventos reais; as canceladas não interessam.
// incluirTodas = true traz tudo (para históricos/depuração).
export const getReservas = async ({ incluirTodas = false } = {}) => {
  let query = supabase
    .from("reservas")
    .select("*, event_types(nome, icone)")
    .order("data_evento", { ascending: true });

  if (!incluirTodas) query = query.eq("estado", ESTADOS_RESERVA.PROVISORIA);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

// Cria uma reserva E a entrada no funil (pessoa + evento interessado).
// Só o nome é obrigatório — o resto é opcional, para ela poder marcar
// rápido ao telefone. Cadeia de rollback: se algum passo falhar, os
// anteriores são desfeitos (nada fica órfão).
export const createReserva = async ({
  nomeCliente,
  dataEvento,
  eventTypeId,
  contacto,
  nota,
}) => {
  if (!nomeCliente || !nomeCliente.trim()) {
    throw new Error("O nome da cliente é obrigatório.");
  }
  const nome = nomeCliente.trim();
  const contactoLimpo = contacto?.trim() || null;

  // 1) A PESSOA — reutilizada pelo telefone quando já existe (Lote 3A,
  //    o precedente da captação): marcar uma reserva para alguém que
  //    já está no funil deixou de criar um segundo cartão. NOTA: na UI
  //    atual, a criação de reservas passa pelo CaptacaoForm (que já
  //    deduplica) — este caminho está DORMENTE, mas fica correto para
  //    quando/se o ReservaModal voltar a criar. O dedupe degrada sem
  //    travar; um evento VIVO na mesma data trava com mensagem clara.
  let clienteReutilizado = false;
  let cliente = null;
  if (contactoLimpo) {
    const { data: dedupe, error: erroDedupe } = await supabase.rpc(
      "captacao_dedupe",
      { p_digitos: contactoLimpo, p_data: dataEvento || null },
    );
    if (erroDedupe) {
      // Degrada sem travar a reserva — mas deixa rasto (um revoke ou
      // migração em falta recomeçariam a duplicar em silêncio).
      console.warn(
        "captacao_dedupe indisponível na reserva:",
        erroDedupe.message || erroDedupe,
      );
    }
    const hit = Array.isArray(dedupe) ? dedupe[0] : dedupe;
    if (hit?.evento_id) {
      // Mesma pessoa, mesma data, evento vivo: criar uma reserva por
      // cima seria o duplicado clássico — trava-se com o caminho certo
      // à vista (o padrão do CaptacaoForm público).
      throw new Error(
        "Esta pessoa já tem um evento vivo nesta data — abre-o em Clientes/Funil em vez de criares uma reserva nova.",
      );
    }
    if (hit?.cliente_id) {
      cliente = { id: hit.cliente_id };
      clienteReutilizado = true;
    }
  }
  if (!cliente) {
    const { data: novoCliente, error: erroCliente } = await supabase
      .from("clientes")
      .insert({ nome, contacto: contactoLimpo })
      .select()
      .single();
    if (erroCliente) throw erroCliente;
    cliente = novoCliente;
  }

  // 2) O EVENTO em fase "interessado" — chaves canónicas no respostas,
  //    para o drawer/resumo/documentos lerem tudo sem código novo.
  const respostas = { nomeDoCliente: nome };
  if (contactoLimpo) respostas.contactoPrincipal = contactoLimpo;
  if (dataEvento) respostas.dataEvento = dataEvento;
  if (nota?.trim()) respostas.mensagemInicial = nota.trim();

  const { data: evento, error: erroEvento } = await supabase
    .from("submissions")
    .insert([
      {
        cliente_id: cliente.id,
        fase: "interessado",
        event_type_id: eventTypeId || null,
        data_evento: dataEvento || null,
        respostas,
      },
    ])
    .select()
    .single();
  if (erroEvento) {
    // Rollback só do que ESTA chamada criou — apagar um cliente
    // REUTILIZADO levaria consigo uma pessoa real com histórico.
    if (!clienteReutilizado) {
      await supabase.from("clientes").delete().eq("id", cliente.id);
    }
    throw erroEvento;
  }

  // 3) A RESERVA, já ligada ao evento
  const { data, error } = await supabase
    .from("reservas")
    .insert([
      {
        nome_cliente: nome,
        data_evento: dataEvento || null,
        event_type_id: eventTypeId || null,
        contacto: contactoLimpo,
        nota: nota?.trim() || null,
        estado: ESTADOS_RESERVA.PROVISORIA,
        submission_id: evento.id,
      },
    ])
    .select("*, event_types(nome, icone)")
    .single();
  if (error) {
    await supabase.from("submissions").delete().eq("id", evento.id);
    if (!clienteReutilizado) {
      await supabase.from("clientes").delete().eq("id", cliente.id);
    }
    throw error;
  }
  // A bandeira deixa a Agenda avisar que a reserva ficou ligada a uma
  // cliente que já existia (nenhum cartão novo foi criado).
  return { ...data, clienteReutilizado };
};

// Actualiza campos de uma reserva. Só passa os campos presentes.
// Se a DATA mudar e a reserva tiver evento ligado, a data do evento
// acompanha — a Agenda e o funil nunca divergem.
export const updateReserva = async (id, campos) => {
  const mapa = {
    nomeCliente: "nome_cliente",
    dataEvento: "data_evento",
    eventTypeId: "event_type_id",
    contacto: "contacto",
    nota: "nota",
    estado: "estado",
    submissionId: "submission_id",
  };
  const patch = {};
  for (const [chaveJS, coluna] of Object.entries(mapa)) {
    if (chaveJS in campos) {
      let valor = campos[chaveJS];
      if (typeof valor === "string") valor = valor.trim() || null;
      patch[coluna] = valor;
    }
  }
  if (Object.keys(patch).length === 0) throw new Error("Nada para actualizar.");

  const { data, error } = await supabase
    .from("reservas")
    .update(patch)
    .eq("id", id)
    .select("*, event_types(nome, icone)")
    .single();
  if (error) throw error;

  // Sincronizar a data do evento ligado (se a data mudou)
  if ("dataEvento" in campos && data.submission_id) {
    const { error: erroSync } = await supabase
      .from("submissions")
      .update({ data_evento: patch.data_evento })
      .eq("id", data.submission_id);
    if (erroSync)
      console.error("Falha a sincronizar a data do evento:", erroSync);
  }

  return data;
};

// Remove uma reserva definitivamente. O evento ligado (se existir)
// NÃO é apagado — continua no funil, onde a Nádia decide o destino.
export const deleteReserva = async (id) => {
  const { error } = await supabase.from("reservas").delete().eq("id", id);
  if (error) throw error;
};

// Cancela uma reserva (soft) — mantém o registo mas tira-a da agenda.
// O evento ligado passa a "perdido" (o negócio morreu); se a pessoa
// reaparecer, recupera-se pelo funil (↩ Recuperar → interessado).
export const cancelarReserva = async (id) => {
  const reserva = await updateReserva(id, {
    estado: ESTADOS_RESERVA.CANCELADA,
  });
  if (reserva.submission_id) {
    const { error } = await supabase
      .from("submissions")
      .update({ fase: "perdido" })
      .eq("id", reserva.submission_id);
    if (error) console.error("Falha a marcar o evento como perdido:", error);
  }
  return reserva;
};

// Converte uma reserva num cliente fechado: liga-a à submissão criada
// e marca como convertida. A reserva não é apagada — fica como o
// registo de onde este cliente começou.
export const converterReserva = async (id, submissionId) => {
  if (!submissionId) throw new Error("submissionId em falta na conversão.");
  return updateReserva(id, {
    estado: ESTADOS_RESERVA.CONVERTIDA,
    submissionId,
  });
};

// Agrupa reservas por dia (chave 'YYYY-MM-DD') — útil para o calendário
// juntar reservas e eventos reais no mesmo dia.
export const agruparReservasPorDia = (reservas) => {
  const mapa = {};
  for (const r of reservas) {
    if (!r.data_evento) continue;
    const chave = r.data_evento; // já vem como 'YYYY-MM-DD' do Postgres (date)
    if (!mapa[chave]) mapa[chave] = [];
    mapa[chave].push(r);
  }
  return mapa;
};
