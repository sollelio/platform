// ============================================================
// OS ALERTAS DA EQUIPA — decisões puras, sem base de dados.
//
// A Nádia não quer um ecrã que tenha de se lembrar de ir ver: quer que
// a app lhe diga. São duas perguntas, feitas sobre o que está agora:
//
//   1. faltam 7 dias ou menos e ainda não há consulta que cubra este
//      evento?
//   2. faltam 4 dias ou menos e alguma tarefa activa tem menos gente
//      escalada do que o mínimo?
//
// Os limiares são INCLUSIVOS: exactamente 7 e exactamente 4 disparam.
//
// Não há linha de alerta guardada em lado nenhum. Um alerta gravado
// envelhece sozinho — resolve-se o problema e o aviso fica lá. Isto
// calcula-se de cada vez, e por isso não pode mentir.
//
// Um alerta por resolver CONTINUA visível depois da data passar,
// enquanto o evento não for dado por concluído: uma data que passou não
// é um evento que aconteceu, e um evento por concluir com gente a menos
// continua a ser um problema. Só «Concluído» cala os alertas.
//
// Sem data marcada não há alerta de dias — não se inventa uma data.
// ============================================================

export const DIAS_CONSULTA = 7;
export const DIAS_EQUIPA = 4;

const ESTADO_CONCLUIDO = "Concluído";

// Dias de calendário entre hoje e a data do evento. Normaliza os dois
// lados a meia-noite UTC antes de subtrair: sem isso uma mudança de
// hora legal metia-se ao caminho e o sétimo dia às vezes era o sexto.
export const diasAte = (dataEvento, hoje = new Date()) => {
  if (!dataEvento) return null;
  const [a, m, d] = String(dataEvento).slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return null;
  const alvo = Date.UTC(a, m - 1, d);
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo - base) / 86400000);
};

export const eventoConcluido = (evento) =>
  (evento?.status ?? "") === ESTADO_CONCLUIDO;

// Quantas tarefas activas deste evento têm menos gente do que o mínimo.
// Mais gente do que o mínimo NUNCA conta: o mínimo é um chão.
// A disponibilidade não entra aqui — quem está escalado está escalado,
// tenha respondido o que tiver respondido. Os conflitos de
// disponibilidade são outro aviso, noutro sítio.
export const tarefasAbaixoDoMinimo = (tarefas, atribuicoes) => {
  const conta = new Map();
  for (const a of atribuicoes ?? [])
    conta.set(a.event_task_id, (conta.get(a.event_task_id) ?? 0) + 1);
  return (tarefas ?? []).filter(
    (t) => t.is_active && (conta.get(t.id) ?? 0) < (t.minimum_people ?? 1),
  );
};

// Um cartão por evento, com um ou dois motivos. Nunca dois cartões para
// o mesmo evento: é o mesmo evento e o mesmo gesto de o abrir.
export const alertasDeEquipa = ({
  eventos,
  tarefas,
  coberturas,
  atribuicoes,
  podeVerConsultas = true,
  podeVerAtribuicoes = true,
  hoje = new Date(),
}) => {
  const tarefasPorEvento = new Map();
  for (const t of tarefas ?? []) {
    if (!tarefasPorEvento.has(t.submission_id))
      tarefasPorEvento.set(t.submission_id, []);
    tarefasPorEvento.get(t.submission_id).push(t);
  }
  const comConsulta = new Set(
    (coberturas ?? []).map((c) => c.submission_id).filter(Boolean),
  );

  const cartoes = [];
  for (const evento of eventos ?? []) {
    // Só «Concluído» cala os alertas. Uma data passada não conclui nada.
    if (eventoConcluido(evento)) continue;
    const dias = diasAte(evento.data_evento, hoje);
    if (dias === null) continue; // sem data não há alerta de dias

    const doEvento = tarefasPorEvento.get(evento.id) ?? [];
    const activas = doEvento.filter((t) => t.is_active);
    const motivos = [];

    if (podeVerConsultas && dias <= DIAS_CONSULTA && !comConsulta.has(evento.id)) {
      motivos.push(
        activas.length === 0
          ? {
              tipo: "consulta-sem-tarefas",
              // Dizer «falta consultar» num evento sem tarefas era mandar
              // a Nádia a um sítio onde não há nada para fazer.
              texto:
                "Sem tarefas registadas — não há o que consultar até as escreveres",
            }
          : {
              tipo: "consulta",
              texto: "Ainda não perguntaste disponibilidade à equipa",
            },
      );
    }

    if (podeVerAtribuicoes && dias <= DIAS_EQUIPA) {
      const emFalta = tarefasAbaixoDoMinimo(activas, atribuicoes);
      if (emFalta.length > 0)
        motivos.push({
          tipo: "equipa",
          texto:
            emFalta.length === 1
              ? "1 tarefa com menos gente do que o mínimo"
              : `${emFalta.length} tarefas com menos gente do que o mínimo`,
          tarefas: emFalta.map((t) => t.id),
        });
    }

    if (motivos.length > 0) cartoes.push({ evento, dias, motivos });
  }

  // O mais urgente primeiro; a data desempata para a ordem ser estável.
  return cartoes.sort(
    (x, y) => x.dias - y.dias || String(x.evento.id).localeCompare(String(y.evento.id)),
  );
};

// Como se lê a contagem, em português da casa.
export const prazoEmPalavras = (dias) => {
  if (dias < 0) return dias === -1 ? "foi ontem" : `foi há ${-dias} dias`;
  if (dias === 0) return "é hoje";
  if (dias === 1) return "é amanhã";
  return `faltam ${dias} dias`;
};
