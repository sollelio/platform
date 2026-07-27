// ============================================================
// importacao/executar.js — o plano aprovado → escrita real.
//   1. Cria os modelos de evento em falta (se autorizado no ecrã),
//      uma vez cada, com 0 passos — como o atalho da classificação.
//   2. Por cada cliente selecionado, monta o payload (registos em
//      snake_case, colunas legadas via FIELD_MAP_INVERSO — o mesmo
//      duplo-registo do drawer) e chama a função Postgres
//      importar_cliente: UMA TRANSAÇÃO por cliente. Um cliente que
//      falhe reverte inteiro; os restantes seguem.
//   3. Devolve o relatório (ok/falhados, contagens, duração).
//
// NÃO é idempotente: reimportar o mesmo ficheiro duplica dados —
// o ecrã bloqueia o botão depois de uma execução.
// ============================================================

import { supabase } from "../supabase";
import { generateCode } from "../invites";
import { FIELD_MAP_INVERSO } from "../submissionFields";
import { normalizarNome } from "../tipoEvento";

// Erros do Postgres traduzidos para o relatório — a rede final por
// baixo da validação do plano (o CHECK da 040 responde com 23514).
const traduzErroImportacao = (error) => {
  if (
    error?.code === "23514" &&
    (error.message || "").includes("submissions_status_pos_sinal")
  ) {
    return "estado/fase incompatíveis: um estado operacional (Em Preparação/Confirmado/Concluído) exige fase pós-sinal (cliente/projecto/contrato) ou perdido.";
  }
  if (error?.code === "23502") {
    return "campo obrigatório em falta no registo (provavelmente o estado).";
  }
  return error?.message || "erro desconhecido";
};

// Registo do evento em snake_case, pronto para o jsonb_populate_record.
// Precedência: os campos do evento (data, valor, estado...) ganham às
// respostas; as colunas legadas derivam das respostas canónicas.
function registoDoEvento(ev, mapaModelos) {
  const tipoId =
    ev.tipoEventoId ||
    (ev.tipoEvento ? mapaModelos.get(normalizarNome(ev.tipoEvento)) : null) ||
    null;

  const respostas = { ...ev.respostas };
  // Sem modelo (tipo não criado): guarda o tipo como "Outro" — o
  // banner de classificação do drawer trata dele mais tarde.
  if (!tipoId && ev.tipoEvento && !respostas.tipoEventoOutro) {
    respostas.tipoEventoOutro = ev.tipoEvento;
  }

  const registo = {
    event_type_id: tipoId,
    data_evento: ev.dataEvento || null,
    status: ev.estado,
    fase: ev.fase,
    valor_acordado: ev.valorAcordado,
    pagamento_final: ev.pagamentoFinal,
    numero_convidados: ev.numeroConvidados,
    respostas,
  };

  for (const [campo, coluna] of Object.entries(FIELD_MAP_INVERSO)) {
    if (respostas[campo] !== undefined && registo[coluna] === undefined) {
      registo[coluna] = respostas[campo];
    }
  }
  return registo;
}

function payloadDoCliente(item, mapaModelos) {
  return {
    cliente_existente_id: item.clienteExistente?.id || null,
    cliente: item.clienteExistente ? null : item.cliente,
    eventos: item.eventos.map((ev) => ({
      registo: registoDoEvento(ev, mapaModelos),
      formulario_preenchido: !!ev.formularioPreenchido,
      code: generateCode(),
      documentos: Object.entries(ev.documentos).map(([tipo, dados]) => ({
        tipo,
        dados,
      })),
    })),
  };
}

export async function executarPlano(
  resultado,
  { criarModelos = true, aoProgresso } = {},
) {
  const inicio = Date.now();
  const selecionados = resultado.plano.clientes.filter(
    (c) => c.selecionado && c.erros.length === 0,
  );

  // 1) modelos em falta (falha aqui aborta tudo — ainda nada foi escrito
  //    de clientes, e sem os modelos o plano ficaria inconsistente)
  const mapaModelos = new Map();
  let modelosCriados = 0;
  if (criarModelos) {
    for (const nome of resultado.tiposDesconhecidos) {
      const { data, error } = await supabase
        .from("event_types")
        .insert({ nome, steps: [] })
        .select("id")
        .single();
      if (error) {
        throw new Error(
          `Não foi possível criar o modelo "${nome}" — ${error.message}`,
        );
      }
      mapaModelos.set(normalizarNome(nome), data.id);
      modelosCriados += 1;
    }
  }

  // 2) clientes, um a um (transação por cliente na função Postgres)
  const relatorio = {
    clientesOk: [],
    clientesFalhados: [],
    modelosCriados,
    eventos: 0,
    documentos: 0,
    formularios: 0,
    pagamentos: 0,
    duracaoMs: 0,
  };

  for (const item of selecionados) {
    if (aoProgresso) aoProgresso(item.cliente.nome);
    const payload = payloadDoCliente(item, mapaModelos);
    const { data, error } = await supabase.rpc("importar_cliente", {
      payload,
    });
    if (error) {
      console.error("importar_cliente falhou:", item.cliente.nome, error);
      relatorio.clientesFalhados.push({
        nome: item.cliente.nome,
        erro: traduzErroImportacao(error),
      });
    } else {
      relatorio.clientesOk.push({
        nome: item.cliente.nome,
        anexado: !!item.clienteExistente,
        eventos: data?.eventos ?? 0,
      });
      relatorio.eventos += data?.eventos ?? 0;
      relatorio.documentos += data?.documentos ?? 0;
      relatorio.formularios += data?.formularios ?? 0;
      relatorio.pagamentos += data?.pagamentos ?? 0;
    }
  }

  relatorio.duracaoMs = Date.now() - inicio;
  return relatorio;
}