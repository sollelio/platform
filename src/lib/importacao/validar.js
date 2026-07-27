// ============================================================
// importacao/validar.js — anota o plano com erros, avisos e
// contagens. NÃO escreve nada na BD: só lê (clientes existentes e
// eventos, para dedupe) e resolve os tipos de evento por nome
// normalizado (o mesmo mecanismo da classificação do "Outro").
//
// Regras aprovadas:
//   • telefone já existente na BD → os eventos serão ANEXADOS a esse
//     cliente (aviso, não erro);
//   • tipo de evento desconhecido → aviso + opção no ecrã de criar o
//     modelo automaticamente (0 passos) na execução;
//   • erros bloqueiam SÓ o cliente em causa (fica desmarcado).
// ============================================================

import { supabase } from "../supabase";
import { encontrarModeloPorNome, normalizarNome } from "../tipoEvento";
import {
  CHAVES_RESPOSTAS_CANONICAS,
  ESTADOS_VALIDOS,
  FASES_VALIDAS,
  ehDataISO,
  normalizarTelefone,
} from "./schema";

export async function validarPlano(plano, eventTypes) {
  // ---- leituras da BD (uma vez) ----
  const { data: clientesBD, error: e1 } = await supabase
    .from("clientes")
    .select("id, nome, contacto");
  if (e1) throw e1;
  const { data: eventosBD, error: e2 } = await supabase
    .from("submissions")
    .select("id, cliente_id, data_evento, event_type_id");
  if (e2) throw e2;

  const clientesPorTelefone = new Map();
  (clientesBD || []).forEach((c) => {
    const t = normalizarTelefone(c.contacto);
    if (t && !clientesPorTelefone.has(t)) clientesPorTelefone.set(t, c);
  });

  const tiposDesconhecidos = new Set();
  const contagens = {
    clientes: 0,
    clientesNovos: 0,
    clientesAAtualizar: 0,
    eventos: 0,
    documentos: 0,
    formularios: 0,
    avisos: 0,
    erros: 0,
  };

  for (const item of plano.clientes) {
    // ---- cliente ----
    if (!item.cliente.nome) {
      item.erros.push("Cliente sem nome — obrigatório.");
    }
    const tel = normalizarTelefone(item.cliente.contacto);
    const existente = tel ? clientesPorTelefone.get(tel) : null;
    if (existente) {
      item.clienteExistente = { id: existente.id, nome: existente.nome };
      item.avisos.push(
        `O telefone já pertence a "${existente.nome}" — os eventos serão anexados a esse cliente (os dados da pessoa não são alterados).`,
      );
    }
    if (item.cliente.nome && !tel) {
      item.avisos.push(
        "Cliente sem telefone — a deteção de duplicados (agora e em captações futuras) não se aplica.",
      );
    }
    // ---- eventos ----
    item.eventos.forEach((ev, j) => {
      const ref = `Evento ${j + 1}`;

      if (ev.dataEvento && !ehDataISO(ev.dataEvento)) {
        item.erros.push(
          `${ref}: data "${ev.dataEvento}" inválida — usa AAAA-MM-DD.`,
        );
      }
      if (!ESTADOS_VALIDOS.includes(ev.estado)) {
        item.erros.push(
          `${ref}: estado "${ev.estado}" inválido (${ESTADOS_VALIDOS.join(" / ")}).`,
        );
      }
      if (!FASES_VALIDAS.includes(ev.fase)) {
        item.erros.push(
          `${ref}: fase "${ev.fase}" inválida (${FASES_VALIDAS.join(" / ")}).`,
        );
      }
      // O PAR estado/fase tem de respeitar o invariante da BD (CHECK
      // da migração 040): estado operacional exige fase pós-sinal ou
      // perdido. Validar aqui põe o erro no plano, legível, em vez de
      // deixar o INSERT rebentar no Postgres a meio da importação.
      if (
        ["Em Preparação", "Confirmado", "Concluído"].includes(ev.estado) &&
        FASES_VALIDAS.includes(ev.fase) &&
        !["cliente", "projecto", "contrato", "perdido"].includes(ev.fase)
      ) {
        item.erros.push(
          `${ref}: o estado "${ev.estado}" exige fase pós-sinal (cliente/projecto/contrato) ou perdido — com a fase "${ev.fase}", usa o estado "Recebido" ou omite-o.`,
        );
      }
      if (Number.isNaN(ev.valorAcordado)) {
        item.erros.push(`${ref}: valorAcordado não é um número.`);
      }
      if (Number.isNaN(ev.numeroConvidados)) {
        item.erros.push(`${ref}: numeroConvidados não é um número.`);
      }

      // Tipo de evento: match por nome normalizado
      if (ev.tipoEvento) {
        const modelo = encontrarModeloPorNome(ev.tipoEvento, eventTypes);
        if (modelo) {
          ev.tipoEventoId = modelo.id;
        } else {
          tiposDesconhecidos.add(ev.tipoEvento);
          item.avisos.push(
            `${ref}: o tipo "${ev.tipoEvento}" não existe nos Modelos de Evento.`,
          );
        }
      } else {
        item.avisos.push(`${ref}: sem tipo de evento.`);
      }

      // Datas dos documentos
      for (const [tipoDoc, dados] of Object.entries(ev.documentos)) {
        for (const campoData of ["dataEvento", "dataAssinatura"]) {
          if (dados[campoData] && !ehDataISO(dados[campoData])) {
            item.erros.push(
              `${ref}: ${tipoDoc} tem ${campoData} "${dados[campoData]}" inválida — usa AAAA-MM-DD.`,
            );
          }
        }
      }
      if (
        ev.documentos.orcamento &&
        ev.documentos.orcamento.linhas.length === 0
      ) {
        item.avisos.push(`${ref}: orçamento sem linhas de serviço.`);
      }
      if (
        ev.documentos.contrato &&
        !ev.documentos.contrato.contraentes.some((c) => c.nome)
      ) {
        item.avisos.push(`${ref}: contrato sem nome de contraente.`);
      }

      // Chaves de respostas fora da lista canónica — passam na mesma
      const foraDoMapa = Object.keys(ev.respostas).filter(
        (k) => !CHAVES_RESPOSTAS_CANONICAS.includes(k),
      );
      if (foraDoMapa.length) {
        item.avisos.push(
          `${ref}: respostas com chaves fora do mapa canónico (importadas na mesma): ${foraDoMapa.join(", ")}.`,
        );
      }
      if (ev.chavesDesconhecidas.length) {
        item.avisos.push(
          `${ref}: campos de evento desconhecidos ignorados: ${ev.chavesDesconhecidas.join(", ")}.`,
        );
      }

      // Possível duplicado na BD (cliente existente + mesma data + mesmo tipo)
      if (existente && ev.dataEvento) {
        const dup = (eventosBD || []).find(
          (s) =>
            s.cliente_id === existente.id &&
            s.data_evento === ev.dataEvento &&
            (ev.tipoEventoId ? s.event_type_id === ev.tipoEventoId : true),
        );
        if (dup) {
          item.avisos.push(
            `${ref}: "${existente.nome}" já tem um evento nesta data na app — possível duplicado.`,
          );
        }
      }
    });

    // Erros bloqueiam SÓ este cliente
    if (item.erros.length > 0) item.selecionado = false;

    // ---- contagens ----
    contagens.clientes += 1;
    if (item.clienteExistente) contagens.clientesAAtualizar += 1;
    else contagens.clientesNovos += 1;
    contagens.eventos += item.eventos.length;
    item.eventos.forEach((ev) => {
      contagens.documentos += Object.keys(ev.documentos).length;
      if (ev.formularioPreenchido) contagens.formularios += 1;
    });
    contagens.avisos += item.avisos.length;
    contagens.erros += item.erros.length;
  }

  return {
    plano,
    contagens,
    tiposDesconhecidos: [...tiposDesconhecidos].sort((a, b) =>
      normalizarNome(a).localeCompare(normalizarNome(b)),
    ),
  };
}
