import { getResumoSubmissao } from "./submissionFields";
import { validateField } from "./validation";

// ============================================================
// camposFormulario.js — as funções puras que descrevem os CAMPOS de um
// modelo de evento e o título de um formulário.
//
// Extraídas da AdminPage sem mudar uma linha, porque passaram a ter dois
// donos: o painel de criação (que escolhe campos e mostra o título de um
// convite órfão) e a própria AdminPage (que valida ao criar, pré-preenche
// a partir de um evento e desenha os cartões da supervisão).
//
// Viviam num ficheiro de página; funções que dois sítios usam não podem
// morar dentro de um deles.
// ============================================================

export function getTituloConvite(invite, submissions, eventTypes) {
  let fonte = null;
  if (invite?.submission_id && submissions) {
    fonte = submissions.find((s) => s.id === invite.submission_id) || null;
  }
  // Convite AINDA por preencher mas apontado a um evento (onboarding):
  // o nome vem do evento-alvo — senão o cartão fica "Casamento · CÓDIGO"
  // e ninguém sabe de quem é o formulário.
  if (!fonte && invite?.submission_alvo_id && submissions) {
    fonte =
      submissions.find((s) => s.id === invite.submission_alvo_id) || null;
  }
  if (!fonte) {
    fonte = {
      event_type_id: invite?.event_type_id,
      respostas: invite?.respostas || {},
    };
  }

  const resumo = getResumoSubmissao(fonte, eventTypes);
  const tipo = eventTypes?.find((et) => et.id === invite?.event_type_id);

  // Se caiu no genérico (título === nome do tipo, ou "Evento" sem tipo),
  // usa nome do tipo + código do convite como identificador.
  const caiuNoGenerico = tipo && resumo.titulo === tipo.nome;
  const semTitulo = !tipo && resumo.titulo === "Evento";
  if (caiuNoGenerico || semTitulo) {
    return tipo
      ? `${tipo.nome} · ${invite.code}`
      : invite?.code || "Formulário sem nome";
  }
  return resumo.titulo;
}

// Junta os campos de todos os passos de um tipo de evento numa única
// lista, guardando também o título do passo a que cada um pertence
// (usado no Painel de Novo Formulário, para a irmã escolher campos)
export function getAllFields(tipo) {
  if (!tipo || !tipo.steps) return [];
  return tipo.steps.flatMap((step) =>
    (step.fields || []).map((f) => ({ ...f, stepTitle: step.title })),
  );
}

// Todos os tipos de evento arrancam vazios no Painel de Novo Formulário,
// sem excepções — nem o Casamento tem campos por defeito. A irmã
// escolhe sempre o que quer pelo campo de busca.
export function getDefaultCampos(tipo) {
  return [];
}

// A partir do estado do painel, devolve a informação completa (label,
// tipo, validações...) de cada campo activo — partilhado entre o render
// e a validação ao criar o formulário
export function getCamposActivosInfo(eventTypes, newInvite) {
  const tipo = eventTypes.find((et) => et.id === newInvite.eventTypeId);
  const todosOsCampos = getAllFields(tipo);
  return newInvite.camposAtivos
    .map((id) => todosOsCampos.find((f) => f.id === id))
    .filter(Boolean);
}

// ============================================================
// As duas regras que os DOIS anfitriões do painel têm de partilhar.
//
// Passaram a ser dois desde que a criação também acontece dentro do
// evento. Ficam aqui, e não em cada um, porque foi exactamente aqui que
// viveu o bug da data: o acto de criar lia a chave literal "dataEvento"
// e o pré-preenchimento escrevia pelo id REAL do campo. Duas cópias
// disto voltariam a divergir.
// ============================================================

// Valida o FORMATO do que ela preencheu — nunca a obrigatoriedade, já
// que qualquer campo pode estar ausente do painel.
export function validarRascunho(newInvite, eventTypes) {
  const erros = {};
  getCamposActivosInfo(eventTypes, newInvite).forEach((campo) => {
    const erro = validateField(
      { ...campo, required: false },
      newInvite.valores[campo.id],
    );
    if (erro) erros[campo.id] = erro;
  });
  return erros;
}

// A data do evento, lida pelo id REAL do primeiro campo do tipo "date"
// do modelo (os ids são gerados a partir da etiqueta: «Data do Evento»
// -> "dataDoEvento"). A chave literal fica como último recurso, para
// convites antigos.
export function dataDoRascunho(newInvite, eventTypes) {
  const tipo = eventTypes.find((et) => et.id === newInvite.eventTypeId);
  for (const campo of getAllFields(tipo)) {
    const v = newInvite.valores[campo.id];
    if (campo.type === "date" && v != null && v !== "") return v;
  }
  return newInvite.valores.dataEvento || null;
}

// ============================================================
// abrirQuestionarioComoCliente — «Preencher»: a Nádia abre o
// questionário e responde ela própria, como se fosse a organizadora.
//
// Estava na AdminPage e passou a ter dois chamadores (a lista de
// supervisão e a linha do Formulário dentro do evento). O trabalho dele
// é sobretudo GUARDAR: três coisas podem estar mal antes de sair do
// backoffice, e cada uma tem de ser dita no ecrã de onde se partiu —
// senão o formulário abre em branco na cara de quem o vai preencher.
//
// `avisar` e `navegar` chegam de fora porque cada anfitrião tem a sua
// barra e o seu router. Devolve true quando saiu, false quando travou.
// ============================================================
export function abrirQuestionarioComoCliente(
  convite,
  eventTypes,
  { modelosPorChegar = false, avisar, navegar },
) {
  // «Não carregou» não é «não existe»: sem os modelos em mão, a mensagem
  // certa não é «o tipo de evento já não existe».
  if (modelosPorChegar) {
    avisar(
      "Ainda não foi possível ler os tipos de evento. Recarrega a página e tenta outra vez.",
    );
    return false;
  }
  const tipo = eventTypes.find((et) => et.id === convite.event_type_id);
  if (!tipo) {
    avisar(
      "O tipo de evento deste formulário já não existe. Recarrega a página; se o aviso persistir, verifica o modelo no editor de Modelos de Evento.",
    );
    return false;
  }
  // Um modelo sem passos partia o questionário da cliente (ecrã em
  // branco) — diz-se aqui, onde há quem leia, e não lá.
  if (!Array.isArray(tipo.steps) || tipo.steps.length === 0) {
    avisar(
      `O modelo "${tipo.nome}" não tem passos — o questionário abriria em branco. Abre o editor de Modelos de Evento e compõe os passos desse modelo antes de o partilhar.`,
    );
    return false;
  }
  sessionStorage.setItem(
    "dlm_invite",
    JSON.stringify({
      ...convite,
      event_types: { nome: tipo.nome, steps: tipo.steps, icone: tipo.icone },
    }),
  );
  navegar("/formulario");
  return true;
}
