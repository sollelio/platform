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
  // Uma morada guardada como TEXTO JSON, e não como objecto — acontece
  // em submissões antigas e importadas. É a mesma morada, só mal
  // arrumada: mais vale compô-la do que despejar as chavetas no ecrã.
  if (typeof v === "string" && v.trim().startsWith("{")) {
    try {
      const composta = formatarMorada(JSON.parse(v));
      if (composta) return composta;
    } catch {
      /* não era JSON — segue como texto normal */
    }
  }
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
// getFaixaOperacional — as respostas que ela procura com o carro à
// porta, resolvidas CONTRA O MODELO e não contra as colunas antigas.
//
// A faixa pedia ids canónicos (horaMontagem, nomeResponsavel, …), e
// esses só existem nas colunas escritas à medida do Casamento original.
// Nenhum modelo os usa: o Casamento de hoje chama-lhes
// horaDisponivelParaMontagem e nomeDoResponsavelNoDia. O resultado era
// a faixa a mostrar a coluna antiga enquanto a folha logo por baixo
// mostrava o campo do modelo — duas respostas diferentes à mesma
// pergunta, no sítio onde ela lê de pé. E uma correcção feita no lugar
// escrevia no campo do modelo sem a faixa mexer.
//
// Mesma escada do getResumoSubmissao, e pela mesma razão:
//   1. o campo marcado com PAPEL no modelo — explícito ganha sempre;
//   2. o campo do modelo encontrado por palavra-chave no id/etiqueta;
//   3. o id canónico (coluna antiga) — retrocompatibilidade.
//
// A camada 2 é o que faz isto funcionar hoje, sem obrigar a voltar a
// todos os modelos já criados para marcar papéis. A 3 garante que as
// submissões antigas, as que só têm colunas, continuam a mostrar
// exactamente o que sempre mostraram.
// ============================================================

const semAcentos = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Procura-se no id E na etiqueta: um modelo importado pode ter o id em
// código e a etiqueta em português, ou o contrário.
const chaveDoCampo = (campo) =>
  semAcentos(`${campo?.id || ""} ${campo?.label || ""}`);

const temTudo = (...palavras) => (campo) => {
  const chave = chaveDoCampo(campo);
  return palavras.every((p) => chave.includes(p));
};
const semNenhuma = (...palavras) => (campo) => {
  const chave = chaveDoCampo(campo);
  return !palavras.some((p) => chave.includes(p));
};
const doTipo = (...tipos) => (campo) => tipos.includes(campo?.type);
const tudo = (...criterios) => (campo) => criterios.every((c) => c(campo));

// O primeiro campo de todos os passos que satisfaz o critério. Devolve
// também o passo, porque há campos que só se identificam pela
// vizinhança — ver os contactos, mais abaixo.
function acharCampo(seccoes, criterio) {
  for (const seccao of seccoes || []) {
    for (const campo of seccao.campos || []) {
      if (criterio(campo)) return { campo, seccao };
    }
  }
  return null;
}

// "10:00:00" → "10:00". As colunas antigas são `time` do Postgres e
// chegam com os segundos; os campos do modelo já vêm "10:00". Só mexe
// em valores que são exactamente uma hora — nunca em texto livre.
const horaCurta = (v) =>
  typeof v === "string" && /^\d{2}:\d{2}:\d{2}$/.test(v) ? v.slice(0, 5) : v;

function resolverCampo(submissao, seccoes, { papel, criterios, canonico }) {
  let achado = papel ? acharCampo(seccoes, (c) => c.papel === papel) : null;
  for (const criterio of criterios || []) {
    if (achado) break;
    achado = acharCampo(seccoes, criterio);
  }
  if (achado) {
    const v = getValorAtual(submissao, achado.campo.id);
    if (!semValor(v)) return { valor: v, seccao: achado.seccao };
  }
  // Sem campo no modelo (ou com o campo vazio) cai-se na coluna antiga,
  // que é o que estas submissões têm.
  const v = canonico ? getValorAtual(submissao, canonico) : undefined;
  return semValor(v) ? null : { valor: v, seccao: null };
}

export function getFaixaOperacional(submissao, seccoes) {
  if (!submissao) return {};

  const ler = (spec) => resolverCampo(submissao, seccoes, spec);
  const valor = (r) => (r ? formatarValor(r.valor) : null);
  const hora = (r) => (r ? formatarValor(horaCurta(r.valor)) : null);

  // O contacto de uma pessoa não tem nome próprio no modelo — chama-se
  // "Contacto" ou "Contacto Telefónico" e o que o liga ao responsável (ou
  // a quem abre o espaço) é estar no MESMO passo. É assim que se
  // distingue o telefone do responsável do telefone de quem abre a porta.
  const contactoDe = (dono) => {
    if (!dono?.seccao) return null;
    const achado = acharCampo(
      [dono.seccao],
      tudo(doTipo("tel", "text", "number"), temTudo("contacto"), semNenhuma("principal")),
    );
    if (!achado) return null;
    const v = getValorAtual(submissao, achado.campo.id);
    return semValor(v) ? null : formatarValor(v);
  };

  const responsavel = ler({
    papel: "responsavel",
    criterios: [tudo(temTudo("responsavel"), semNenhuma("contacto", "relacao"))],
    canonico: "nomeResponsavel",
  });

  const abre = ler({
    papel: "abreEspaco",
    criterios: [tudo(temTudo("abre"), semNenhuma("contacto"))],
    canonico: "pessoaAbreEspaco",
  });

  return {
    montagem: hora(
      ler({
        papel: "montagem",
        criterios: [tudo(doTipo("time"), temTudo("montagem"), semNenhuma("limite"))],
        canonico: "horaMontagem",
      }),
    ),
    limiteMontagem: hora(
      ler({
        papel: "limiteMontagem",
        criterios: [tudo(doTipo("time"), temTudo("montagem", "limite"))],
        canonico: "horaLimiteMontagem",
      }),
    ),
    recolha: hora(
      ler({
        papel: "recolha",
        criterios: [tudo(doTipo("time"), temTudo("recolha"))],
        canonico: "horaRecolha",
      }),
    ),
    diaSeguinte: valor(
      ler({
        papel: "recolhaDiaSeguinte",
        criterios: [tudo(temTudo("recolha", "seguinte"))],
        canonico: "recolhaDiaSeguinte",
      }),
    ),
    responsavel: valor(responsavel),
    relacao: valor(
      ler({
        papel: "relacaoResponsavel",
        criterios: [temTudo("relacao")],
        canonico: "relacaoResponsavel",
      }),
    ),
    contactoResponsavel:
      contactoDe(responsavel) ||
      valor(ler({ criterios: [], canonico: "contactoResponsavel" })),
    abre: valor(abre),
    contactoAbre:
      contactoDe(abre) ||
      valor(ler({ criterios: [], canonico: "contactoPessoaAbre" })),
    morada:
      valor(
        ler({
          papel: "morada",
          criterios: [
            temTudo("morada", "exacta"),
            doTipo("morada"),
            temTudo("morada"),
          ],
          canonico: "moradaExacta",
        }),
      ) || valor(ler({ papel: "local", criterios: [temTudo("local")], canonico: "localEvento" })),
    acessos: valor(
      ler({
        papel: "acessoLocal",
        criterios: [tudo(doTipo("checkbox"), temTudo("acesso"))],
        canonico: "acessoLocal",
      }),
    ),
    notasAcesso: valor(
      ler({
        papel: "notasAcesso",
        criterios: [tudo(doTipo("textarea"), temTudo("acesso"))],
        canonico: "notasAcesso",
      }),
    ),
    inicio: hora(
      ler({
        papel: "horaInicio",
        criterios: [tudo(doTipo("time"), temTudo("inicio"))],
        canonico: "horaInicio",
      }),
    ),
    fim: hora(
      ler({
        papel: "horaTermino",
        criterios: [tudo(doTipo("time"), temTudo("termino")), tudo(doTipo("time"), temTudo("fim"))],
        canonico: "horaTermino",
      }),
    ),
  };
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