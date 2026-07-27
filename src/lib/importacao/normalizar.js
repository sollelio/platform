// ============================================================
// importacao/normalizar.js — estrutura bruta → PLANO DE IMPORTAÇÃO.
// O plano é a representação canónica que a validação anota e a
// execução (Fase 2) escreve. Aqui:
//   • limpam-se strings e tipos;
//   • aplicam-se os defaults do "estado final" (histórico concluído);
//   • fundem-se entradas com o MESMO telefone no mesmo cliente;
//   • injetam-se uids nas linhas/secções dos documentos (o formato
//     exacto que os geradores gravam — importado ≡ criado à mão);
//   • registam-se chaves desconhecidas (aviso, não erro — o jsonb
//     importa-as na mesma).
// ============================================================

import {
  CHAVES_CLIENTE,
  CHAVES_EVENTO,
  limpar,
  normalizarTelefone,
  uidImportacao,
} from "./schema";

const numeroOuNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN; // NaN = valor inválido (a validação acusa)
};

// ---------- documentos (formato dos geradores) ----------

function normalizarOrcamento(o = {}) {
  return {
    cliente: limpar(o.cliente) || "",
    tipoEvento: limpar(o.tipoEvento) || "",
    dataEvento: limpar(o.dataEvento) || "",
    local: limpar(o.local) || "",
    subtitulo: limpar(o.subtitulo) || "",
    linhas: (Array.isArray(o.linhas) ? o.linhas : []).map((l) => ({
      uid: uidImportacao("l"),
      descricao: limpar(l?.descricao) || "",
      inclui: Array.isArray(l?.inclui) ? l.inclui.map(String) : [],
      qtd: l?.qtd ?? 1,
      valor: l?.valor ?? "",
      lugares: limpar(l?.lugares) || "",
      temLugares: !!l?.temLugares,
    })),
    // Imagens não são importadas na v1 (exigiriam upload para o
    // storage) — o documento fica completo sem elas.
    imagens: [],
  };
}

function normalizarContrato(c = {}) {
  const contraentes = (
    Array.isArray(c.contraentes) && c.contraentes.length > 0
      ? c.contraentes
      : [{}]
  ).map((x) => ({
    uid: uidImportacao("c"),
    nome: limpar(x?.nome) || "",
    nif: limpar(x?.nif) || "",
  }));
  return {
    contraentes,
    morada: limpar(c.morada) || "",
    contacto: limpar(c.contacto) || "",
    tipoEvento: limpar(c.tipoEvento) || "",
    dataEvento: limpar(c.dataEvento) || "",
    horaInicio: limpar(c.horaInicio) || "",
    horaFim: limpar(c.horaFim) || "",
    local: limpar(c.local) || "",
    lugares: limpar(c.lugares) || "",
    composicao: typeof c.composicao === "string" ? c.composicao : "",
    seccoesExtra: (Array.isArray(c.seccoesExtra) ? c.seccoesExtra : []).map(
      (s) => ({
        uid: uidImportacao("se"),
        titulo: limpar(s?.titulo) || "",
        itens: typeof s?.itens === "string" ? s.itens : "",
      }),
    ),
    valor: c.valor === null || c.valor === undefined ? "" : String(c.valor),
    valorExtenso: limpar(c.valorExtenso) || "",
    localAssinatura: limpar(c.localAssinatura) || "",
    dataAssinatura: limpar(c.dataAssinatura) || "",
  };
}

function normalizarProposta(p = {}) {
  return {
    cliente: limpar(p.cliente) || "",
    tipoEvento: limpar(p.tipoEvento) || "",
    dataEvento: limpar(p.dataEvento) || "",
    subtitulo: limpar(p.subtitulo) || "",
    seccoes: (Array.isArray(p.seccoes) ? p.seccoes : []).map((s) => ({
      uid: uidImportacao("s"),
      titulo: limpar(s?.titulo) || "",
      imagem: "", // sem upload na v1
      descricao: typeof s?.descricao === "string" ? s.descricao : "",
    })),
  };
}

// ---------- evento ----------

function normalizarEvento(e = {}) {
  const docsBrutos = e.documentos || {};
  const documentos = {};
  if (docsBrutos.orcamento)
    documentos.orcamento = normalizarOrcamento(docsBrutos.orcamento);
  if (docsBrutos.contrato)
    documentos.contrato = normalizarContrato(docsBrutos.contrato);
  // Tolerância de nome: o chat pode escrever "projecto"/"projeto";
  // a chave interna do sistema é 'proposta'.
  const proposta =
    docsBrutos.proposta || docsBrutos.projecto || docsBrutos.projeto;
  if (proposta) documentos.proposta = normalizarProposta(proposta);

  // Defaults do "estado final" (histórico concluído) — mas o par tem
  // de nascer coerente com o invariante da 040 (estado operacional ⇒
  // fase pós-sinal ou perdido): um evento importado com fase PRÉ-SINAL
  // explícita e sem estado é um negócio a decorrer, não um concluído —
  // o default cego de "Concluído" fabricava o par inválido que o CHECK
  // agora recusa.
  const fase = limpar(e.fase) || "contrato";
  const faseComEstadoOperacional = [
    "cliente",
    "projecto",
    "contrato",
    "perdido",
  ].includes(fase);
  const estado =
    limpar(e.estado) || (faseComEstadoOperacional ? "Concluído" : "Recebido");

  return {
    tipoEvento: limpar(e.tipoEvento),
    tipoEventoId: null, // resolvido na validação (match por nome)
    dataEvento: limpar(e.dataEvento),
    estado,
    fase,
    valorAcordado: numeroOuNull(e.valorAcordado),
    pagamentoFinal: e.pagamentoFinal !== false,
    numeroConvidados: numeroOuNull(e.numeroConvidados),
    respostas: { ...(e.respostas || {}) },
    formularioPreenchido: e.formularioPreenchido !== false,
    documentos,
    chavesDesconhecidas: Object.keys(e).filter(
      (k) => !CHAVES_EVENTO.includes(k),
    ),
  };
}

// ---------- plano ----------

export function normalizarPlano(bruto) {
  const clientes = [];
  const porTelefone = new Map();

  (bruto.clientes || []).forEach((entrada, i) => {
    const c = entrada?.cliente || {};
    const cliente = {
      nome: limpar(c.nome),
      contacto: limpar(c.contacto),
      email: limpar(c.email),
      nif: limpar(c.nif),
      morada: limpar(c.morada),
      notas: limpar(c.notas),
    };
    const eventos = (entrada?.eventos || []).map(normalizarEvento);
    const chavesDesconhecidasCliente = Object.keys(c).filter(
      (k) => !CHAVES_CLIENTE.includes(k),
    );

    // Mesmo telefone dentro do ficheiro → funde no primeiro cliente
    // (a mesma pessoa não se duplica — o padrão da captação).
    const tel = normalizarTelefone(cliente.contacto);
    if (tel && porTelefone.has(tel)) {
      const alvo = porTelefone.get(tel);
      alvo.eventos.push(...eventos);
      alvo.avisos.push(
        `Entrada ${i + 1} ("${cliente.nome || "?"}") tem o mesmo telefone — os eventos foram fundidos neste cliente.`,
      );
      return;
    }

    const item = {
      chave: `c${i}`,
      selecionado: true,
      cliente,
      eventos,
      clienteExistente: null, // resolvido na validação (BD)
      erros: [],
      avisos: chavesDesconhecidasCliente.length
        ? [
            `Campos de cliente desconhecidos ignorados: ${chavesDesconhecidasCliente.join(", ")}.`,
          ]
        : [],
    };
    if (tel) porTelefone.set(tel, item);
    clientes.push(item);
  });

  return { versao: bruto.versao, clientes };
}