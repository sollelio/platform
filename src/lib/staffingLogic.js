// ============================================================
// A LÓGICA DA ESCALA — decisões puras, sem base de dados.
//
// Vive à parte do `assignments.js` por duas razões: é a parte subtil
// (o que conta como conflito, o que conta como cobertura, quem aparece
// como disponível) e é a única testável sem rede. Não importa nada.
//
// Nada aqui escolhe, ordena por aptidão, pontua ou recomenda ninguém.
// Descreve o que está; a decisão é da Nádia.
// ============================================================

// ---------- Estados de resposta, tal como o ecrã os distingue ----------
//
// `unanswered` e `not_consulted` NÃO são a mesma coisa, e nenhum deles é
// «disponível». A Nádia é o caso a ter em conta: nunca recebe ligação de
// consulta — não é um esquecimento dela, é uma decisão da casa — e
// continua a poder ser escalada.
export const ESTADO_RESPOSTA = {
  available: "Disponível",
  unavailable: "Indisponível",
  partial: "Parte do tempo",
  unanswered: "Sem resposta",
  not_consulted: "Não consultada",
  non_consultable: "Não recebe consultas",
};

// ---------- A leitura da grelha, sem uma única decisão ----------

// A janela de uma resposta parcial contra o intervalo da tarefa.
//   'cobre'         — a janela conhecida cobre a tarefa inteira;
//   'nao-cobre'     — sabe-se que não cobre;
//   'indeterminada' — a tarefa não tem fim marcado e a janela tem, por
//                     isso não há como afirmar cobertura sem inventar.
// Um lado em falta é ILIMITADO desse lado, não «zero».
export const coberturaDaJanela = (tarefa, resposta) => {
  if (!resposta || resposta.state !== "partial") return null;
  const inicioTarefa = tarefa.starts_at ? new Date(tarefa.starts_at) : null;
  const fimTarefa = tarefa.ends_at ? new Date(tarefa.ends_at) : null;
  const de = resposta.de ? new Date(resposta.de) : null;
  const ate = resposta.ate ? new Date(resposta.ate) : null;

  if (de && inicioTarefa && de > inicioTarefa) return "nao-cobre";
  if (ate) {
    if (!fimTarefa) return "indeterminada";
    if (ate < fimTarefa) return "nao-cobre";
  }
  if (!inicioTarefa) return "indeterminada";
  return "cobre";
};

// O estado de uma pessoa perante UMA tarefa, na consulta escolhida.
export const estadoDaPessoa = ({ pessoa, tarefa, consultadas, respostas }) => {
  if (!pessoa.may_be_consulted) return { estado: "non_consultable" };
  if (!consultadas.has(pessoa.id)) return { estado: "not_consulted" };
  const r = respostas.get(`${tarefa.id}:${pessoa.id}`);
  if (!r) return { estado: "unanswered" };
  return {
    estado: r.state,
    de: r.de,
    ate: r.ate,
    nota: r.nota,
    cobertura: coberturaDaJanela(tarefa, r),
  };
};

// A posição de uma tarefa: quem está escalado, quantos faltam, e que
// conflitos existem entre os escalados. Descreve; não sugere.
export const posicaoDaTarefa = ({
  tarefa,
  compativeis,
  membros,
  atribuicoes,
  consultadas,
  respostas,
}) => {
  // Quem JÁ ESTÁ escalado resolve-se contra a equipa inteira, nunca contra
  // os compatíveis. A função exigida é um portão à ENTRADA (Bloco 5): tirar
  // depois a função a alguém não desfaz o que ela ficou a fazer. Resolver
  // aqui pelos compatíveis fazia a atribuição desaparecer do ecrã sem
  // desaparecer da base — e ninguém a conseguia retirar.
  const todos = membros ?? compativeis;
  const daTarefa = atribuicoes.filter((a) => a.event_task_id === tarefa.id);
  const escalados = daTarefa
    .map((a) => {
      const pessoa = todos.find((p) => p.id === a.staff_member_id);
      if (!pessoa) return null;
      return {
        ...estadoDaPessoa({ pessoa, tarefa, consultadas, respostas }),
        pessoa,
        atribuicaoId: a.id,
        // já não tem a função que esta tarefa exige — mostra-se, para a
        // Nádia decidir; não se esconde
        semAFuncao: !compativeis.some((p) => p.id === a.staff_member_id),
      };
    })
    .filter(Boolean);

  const conflitos = escalados.filter(
    (e) =>
      e.estado === "unavailable" ||
      e.estado === "unanswered" ||
      (e.estado === "partial" && e.cobertura !== "cobre"),
  );

  // Só quem disse «posso», por palavras próprias. Parcial e sem resposta
  // ficam de fora desta lista de propósito: rotulá-los de disponíveis
  // seria pôr na boca deles o que não disseram.
  const idsEscalados = new Set(daTarefa.map((a) => a.staff_member_id));
  const disponiveisPorEscalar = compativeis
    .filter((p) => !idsEscalados.has(p.id) && p.is_active)
    .map((p) => ({
      pessoa: p,
      ...estadoDaPessoa({ pessoa: p, tarefa, consultadas, respostas }),
    }))
    .filter((x) => x.estado === "available");

  return {
    escalados,
    conflitos,
    disponiveisPorEscalar,
    emFalta: Math.max(0, (tarefa.minimum_people ?? 1) - escalados.length),
    abaixoDoMinimo: escalados.length < (tarefa.minimum_people ?? 1),
  };
};
