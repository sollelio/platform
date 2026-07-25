import { formatarMorada } from "./morada";

// Mapa entre as colunas antigas (snake_case, escritas à medida do
// Casamento) e os IDs dos campos do formulário (camelCase).
const FIELD_MAP = {
  nome_noivo: "nomeNoivo",
  nome_noiva: "nomeNoiva",
  contacto_principal: "contactoPrincipal",
  email: "email",
  morada: "morada",
  local_evento: "localEvento",
  numero_convidados: "numeroConvidados",
  hora_inicio: "horaInicio",
  hora_termino: "horaTermino",
  hora_montagem: "horaMontagem",
  hora_limite_montagem: "horaLimiteMontagem",
  hora_recolha: "horaRecolha",
  recolha_dia_seguinte: "recolhaDiaSeguinte",
  nome_responsavel: "nomeResponsavel",
  contacto_responsavel: "contactoResponsavel",
  relacao_responsavel: "relacaoResponsavel",
  estilo_evento: "estiloEvento",
  estilo_outro: "estiloOutro",
  paleta_cores: "paletaCores",
  paleta_observacoes: "paletaObservacoes",
  mesa_noivos: "mesaNoivos",
  cartoes_pratos: "cartoesPratos",
  observacoes_cartoes: "observacoesCartoes",
  descricao_mesa_noivos: "descricaoMesaNoivos",
  cenario_palco: "cenarioPalco",
  descricao_cenario: "descricaoCenario",
  medidas_espaco: "medidasEspaco",
  centros_mesa: "centrosMesa",
  tipo_flores: "tipoFlores",
  numero_mesas: "numeroMesas",
  formato_mesas: "formatoMesas",
  lugares_por_mesa: "lugaresporMesa",
  observacoes_mesas: "observacoesMesas",
  texto_principal_placa: "textoPrincipalPlaca",
  texto_secundario_placa: "textoSecundarioPlaca",
  estilo_placa: "estiloPlaca",
  notas_placa: "notasPlaca",
  morada_exacta: "moradaExacta",
  pessoa_abre_espaco: "pessoaAbreEspaco",
  contacto_pessoa_abre: "contactoPessoaAbre",
  notas_acesso: "notasAcesso",
  observacoes_gerais: "observacoesGerais",
  acesso_local: "acessoLocal",
};

// Exportado para quem precisa de gravar nas duas fontes (respostas +
// colunas antigas): o SubmissionDrawer (edição) e o
// atualizarEventoComQuestionario (formulário apontado a um evento).
export const FIELD_MAP_INVERSO = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([coluna, campo]) => [campo, coluna]),
);

export function getValorAtual(submissao, campoId) {
  if (!submissao) return undefined;
  const colunaAntiga = FIELD_MAP_INVERSO[campoId];
  if (
    colunaAntiga &&
    submissao[colunaAntiga] !== null &&
    submissao[colunaAntiga] !== undefined &&
    submissao[colunaAntiga] !== ""
  ) {
    return submissao[colunaAntiga];
  }
  return submissao.respostas?.[campoId];
}

export function normalizeSubmission(s) {
  if (!s || !s.respostas) return s;
  const normalized = { ...s };
  for (const [colKey, campoKey] of Object.entries(FIELD_MAP)) {
    if (
      (normalized[colKey] === null || normalized[colKey] === undefined) &&
      s.respostas[campoKey] !== undefined
    ) {
      normalized[colKey] = s.respostas[campoKey];
    }
  }
  return normalized;
}

// ============================================================
// As secções do briefing — os campos do modelo agrupados pelo passo a
// que pertencem, e o filtro do que está mesmo preenchido.
//
// Vivem aqui, e não no componente, porque a fonte é a mesma nos três
// sítios que a leem: o drawer, o separador Visão geral da página e a
// folha impressa. Uma "visão geral" desenhada à parte seria uma
// segunda leitura dos mesmos dados, e duas leituras divergem sempre.
// ============================================================

// Junta os campos de um modelo, agrupados pelo título do passo.
export function seccoesDoModelo(tipo) {
  if (!tipo || !tipo.steps) return [];
  return tipo.steps.map((step) => ({
    titulo: step.title || "Detalhes",
    campos: step.fields || [],
  }));
}

// Formata um valor para leitura (arrays viram lista separada por
// vírgulas; objectos — hoje só a morada — viram a morada composta
// numa linha).
export function formatarValor(v) {
  if (Array.isArray(v)) return v.join(", ");
  if (v && typeof v === "object") return formatarMorada(v);
  return v;
}

const semValor = (v) =>
  v === undefined ||
  v === null ||
  v === "" ||
  (Array.isArray(v) && v.length === 0);

// As secções que têm mesmo alguma coisa para mostrar, já com os
// valores resolvidos — para quem desenha não repetir o filtro.
export function seccoesPreenchidas(submissao, seccoes) {
  return (seccoes || [])
    .map((sec) => ({
      titulo: sec.titulo,
      campos: sec.campos
        .map((campo) => ({
          campo,
          valor: formatarValor(getValorAtual(submissao, campo.id)),
        }))
        .filter(({ valor }) => !semValor(valor)),
    }))
    .filter((sec) => sec.campos.length > 0);
}

// ============================================================
// getResumoSubmissao — título, data, LOCAL e MORADA de QUALQUER
// submissão, independentemente do modelo de evento.
//
// Prioridade de leitura, em três camadas (da mais fiável para o
// último recurso):
//   1. Colunas fixas (Casamento / submissões editadas à mão)
//   2. PAPÉIS marcados no modelo (papel: "titulo" | "local" | "morada" | "data")
//   3. Fallback por TYPE dos campos — MORADA cai primeiro para o
//      primeiro campo do tipo "morada" (não é preciso marcar o papel só
//      para haver UM campo morada por modelo, o caso normal), depois
//      para os campos ad-hoc "moradaExacta"/"localEvento" de antes deste
//      tipo existir.
//
// A camada 2 é a novidade. A 3 garante RETROCOMPATIBILIDADE: modelos
// sem papéis marcados comportam-se exactamente como antes, por isso
// nada parte — os títulos só melhoram à medida que se marcam papéis.
// ============================================================

// Junta todos os campos de todos os passos de um modelo.
function camposDoModelo(tipo) {
  if (!tipo || !tipo.steps) return [];
  return tipo.steps.flatMap((step) => step.fields || []);
}

// Lê o valor de um campo do respostas, achatando arrays para string.
function valorTexto(respostas, campoId) {
  const v = respostas?.[campoId];
  const s = Array.isArray(v) ? v.join(", ") : v;
  return typeof s === "string" && s.trim() !== "" ? s.trim() : "";
}

export function getResumoSubmissao(submissao, eventTypes) {
  if (!submissao)
    return { titulo: "Evento", data: null, local: null, morada: null };

  const tipo = eventTypes?.find((et) => et.id === submissao.event_type_id);
  const campos = camposDoModelo(tipo);
  const respostas = submissao.respostas || {};

  // ---------------------------------------------------------------
  // TÍTULO
  // ---------------------------------------------------------------
  // 1) colunas fixas (Casamento / editado à mão)
  const nomesFixos = [submissao.nome_noivo, submissao.nome_noiva]
    .map((n) => (typeof n === "string" ? n.trim() : ""))
    .filter((n) => n !== "");
  let titulo = nomesFixos.join(" & ");

  // 1.5) chaves CANÓNICAS da captação/reserva (migração 011: a
  // prioridade é nomeNoivo & nomeNoiva → nomeDoCliente → ... →
  // nomeResponsavel no fim; nomeDoBebe NUNCA é usado como nome).
  // Sem isto, eventos da captação apareciam como o nome do TIPO
  // ("Casamento · Casamento") na Agenda e no Início.
  if (!titulo) titulo = valorTexto(respostas, "nomeDoCliente");

  // 2) campos marcados com papel "titulo" (na ordem do modelo)
  if (!titulo && campos.length) {
    const marcados = campos
      .filter((f) => f.papel === "titulo")
      .map((f) => valorTexto(respostas, f.id))
      .filter((s) => s !== "");
    if (marcados.length > 0) titulo = marcados.join(" & ");
  }

  // 3) fallback antigo: primeiros 2 campos de texto preenchidos
  if (!titulo && campos.length) {
    const textos = campos
      .filter((f) => f.type === "text")
      .map((f) => valorTexto(respostas, f.id))
      .filter((s) => s !== "")
      .slice(0, 2);
    if (textos.length > 0) titulo = textos.join(" & ");
  }

  // 3.5) responsável (último nome humano antes de cair no tipo)
  if (!titulo) titulo = valorTexto(respostas, "nomeResponsavel");

  // 4) último recurso
  if (!titulo) titulo = tipo ? tipo.nome : "Evento";

  // ---------------------------------------------------------------
  // LOCAL
  // ---------------------------------------------------------------
  // 1) coluna fixa
  let local =
    typeof submissao.local_evento === "string" &&
    submissao.local_evento.trim() !== ""
      ? submissao.local_evento.trim()
      : null;
  // 2) campo marcado com papel "local"
  if (!local && campos.length) {
    const campoLocal = campos.find((f) => f.papel === "local");
    if (campoLocal) {
      const v = valorTexto(respostas, campoLocal.id);
      if (v) local = v;
    }
  }

  // ---------------------------------------------------------------
  // MORADA (o endereço completo do evento — alimenta o cálculo de
  // deslocação no orçamento; não é o mesmo que LOCAL, que pode ser só
  // o nome do espaço, ex: "Quinta dos Rosais")
  // ---------------------------------------------------------------
  // O valor de um campo "morada" é sempre um OBJECTO (o tipo estruturado,
  // ver morada.js), por isso passa por formatarMorada — nunca por
  // valorTexto, que só serve para valores texto/array.
  let morada = null;
  // 1) campo marcado com papel "morada" (desambigua se houver mais do
  //    que um campo do tipo morada no modelo)
  if (campos.length) {
    const campoMorada = campos.find((f) => f.papel === "morada");
    if (campoMorada) {
      const v = formatarMorada(respostas?.[campoMorada.id]);
      if (v) morada = v;
    }
  }
  // 2) fallback por TYPE: o primeiro campo do tipo "morada" preenchido —
  //    na prática só há um por modelo, por isso não devia ser preciso
  //    marcar o papel à parte para isto funcionar (mesmo critério já
  //    usado para "data", ver acima).
  if (!morada && campos.length) {
    const campoMoradaPorTipo = campos.find((f) => f.type === "morada");
    if (campoMoradaPorTipo) {
      const v = formatarMorada(respostas?.[campoMoradaPorTipo.id]);
      if (v) morada = v;
    }
  }
  // 3) fallback: campos ad-hoc mais antigos que já guardavam a morada
  //    exacta do espaço por convenção de nome, de antes deste tipo existir
  if (!morada) {
    morada =
      getValorAtual(submissao, "moradaExacta") ||
      getValorAtual(submissao, "localEvento") ||
      null;
    if (typeof morada !== "string" || !morada.trim()) morada = null;
  }

  // ---------------------------------------------------------------
  // DATA
  // ---------------------------------------------------------------
  // 1) coluna fixa
  let data = submissao.data_evento || null;
  // 2) campo marcado com papel "data"
  if (!data && campos.length) {
    const campoDataMarcado = campos.find((f) => f.papel === "data");
    if (campoDataMarcado && respostas[campoDataMarcado.id]) {
      data = respostas[campoDataMarcado.id];
    }
  }
  // 3) fallback antigo: primeiro campo type "date" preenchido
  if (!data && campos.length) {
    const campoData = campos.find((f) => f.type === "date");
    if (campoData && respostas[campoData.id]) {
      data = respostas[campoData.id];
    }
  }

  return { titulo, data, local, morada };
}