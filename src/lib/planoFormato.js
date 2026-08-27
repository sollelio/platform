// ============================================================
// O PLANO INDIVIDUAL — projecção e texto, sem base de dados.
//
// Um plano é de UMA pessoa num EVENTO. A mesma pessoa em dois eventos
// tem dois planos; nunca se juntam. Mas um evento pode ter trabalho em
// vários dias — montagem na véspera, recolha no dia seguinte — e isso
// continua a ser UM plano com secções por dia, não um plano por dia.
//
// Sai das ATRIBUIÇÕES do Bloco 5 e de mais nada. Quem está escalado
// tem plano: quem disse que não podia, quem respondeu parte do tempo e
// quem nunca respondeu têm plano na mesma, porque a Nádia escalou-os e
// é ela quem manda. A disponibilidade avisa; não decide, e não filtra.
//
// Não guarda nada: é uma leitura do que está agora. Um plano gravado
// era uma segunda verdade a envelhecer sozinha.
//
// Vive à parte porque é puro e testável sozinho — a ordem dos dias, a
// ordem das tarefas e o que sai no texto não se confirmam com os olhos.
// ============================================================

// A DATA OPERACIONAL de uma tarefa é o dia em que ela começa, na hora
// local de quem lê. Não é a data do evento: a montagem da véspera é do
// dia da véspera, e é assim que a pessoa a procura no telemóvel.
export const dataOperacional = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const horaLocal = (iso) =>
  iso
    ? new Date(iso).toLocaleTimeString("pt-PT", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

const diaPorExtenso = (chave) =>
  chave
    ? new Date(`${chave}T00:00:00`).toLocaleDateString("pt-PT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

// ---------- A projecção ----------

// Um plano por pessoa escalada neste evento. `atribuicoes` são as do
// evento inteiro; cada plano fica só com as da sua pessoa.
export const planosDoEvento = ({
  evento,
  tarefas,
  atribuicoes,
  membros,
  instrucoes,
}) => {
  const tarefaPorId = new Map((tarefas ?? []).map((t) => [t.id, t]));
  const membroPorId = new Map((membros ?? []).map((m) => [m.id, m]));

  // quem está escalado nesta tarefa, para os colegas
  const porTarefa = new Map();
  for (const a of atribuicoes ?? []) {
    if (!porTarefa.has(a.event_task_id)) porTarefa.set(a.event_task_id, []);
    porTarefa.get(a.event_task_id).push(a.staff_member_id);
  }

  const porPessoa = new Map();
  for (const a of atribuicoes ?? []) {
    const tarefa = tarefaPorId.get(a.event_task_id);
    const pessoa = membroPorId.get(a.staff_member_id);
    // uma tarefa desactivada deixou de ser trabalho a fazer
    if (!tarefa || !pessoa || !tarefa.is_active) continue;
    if (!porPessoa.has(pessoa.id)) porPessoa.set(pessoa.id, []);

    // Só quem está NESTA tarefa. O plano de uma pessoa nunca mostra o
    // que os outros fazem noutras tarefas — só quem está ao lado dela.
    const colegas = (porTarefa.get(tarefa.id) ?? [])
      .filter((id) => id !== pessoa.id)
      .map((id) => membroPorId.get(id)?.display_name)
      .filter(Boolean)
      .sort((x, y) => x.localeCompare(y, "pt-PT"));

    porPessoa.get(pessoa.id).push({ tarefa, colegas });
  }

  return [...porPessoa.entries()]
    .map(([pessoaId, itens]) => {
      const pessoa = membroPorId.get(pessoaId);
      const porDia = new Map();
      for (const item of itens) {
        const chave = dataOperacional(item.tarefa.starts_at);
        if (!porDia.has(chave)) porDia.set(chave, []);
        porDia.get(chave).push(item);
      }
      const dias = [...porDia.entries()]
        .sort(([a], [b]) => String(a).localeCompare(String(b)))
        .map(([chave, itens2]) => ({
          data: chave,
          dataPorExtenso: diaPorExtenso(chave),
          tarefas: itens2
            .slice()
            .sort(
              (x, y) =>
                new Date(x.tarefa.starts_at) - new Date(y.tarefa.starts_at) ||
                x.tarefa.title.localeCompare(y.tarefa.title, "pt-PT"),
            )
            .map((x) => ({
              id: x.tarefa.id,
              titulo: x.tarefa.title,
              inicio: horaLocal(x.tarefa.starts_at),
              fim: horaLocal(x.tarefa.ends_at),
              notas: x.tarefa.notes || null,
              colegas: x.colegas,
            })),
        }));
      return { pessoa, evento, dias, instrucoes: instrucoes ?? null };
    })
    .sort((a, b) =>
      (a.pessoa.display_name ?? "").localeCompare(
        b.pessoa.display_name ?? "",
        "pt-PT",
      ),
    );
};

// ---------- O texto que vai para o WhatsApp ----------

// Texto simples, sem markdown e sem depender de estilos: o significado
// tem de sobreviver a ser colado numa conversa. A hierarquia faz-se com
// linhas em branco e travessões, que é o que o WhatsApp respeita.
export const formatarPlanoTexto = (plano) => {
  if (!plano) return "";
  const l = [];
  l.push("PLANO DE TRABALHO");
  if (plano.evento?.titulo) l.push(`Evento: ${plano.evento.titulo}`);
  const onde = plano.evento?.local || plano.evento?.morada;
  if (onde) l.push(`Local: ${onde}`);
  l.push(`Para: ${plano.pessoa?.display_name ?? ""}`);

  for (const dia of plano.dias ?? []) {
    l.push("");
    l.push(dia.dataPorExtenso.toUpperCase());
    for (const t of dia.tarefas) {
      const horas = t.fim ? `${t.inicio}–${t.fim}` : t.inicio;
      l.push(`- ${horas} · ${t.titulo}`);
      if (t.notas) l.push(`  ${t.notas}`);
      if (t.colegas.length)
        l.push(
          `  ${t.colegas.length === 1 ? "Com" : "Com"}: ${t.colegas.join(", ")}`,
        );
    }
  }

  const std = plano.instrucoes?.standard_instructions;
  const calor = plano.instrucoes?.hot_weather_instructions;
  if (std) {
    l.push("");
    l.push("INDICAÇÕES DA EQUIPA");
    l.push(std);
  }
  if (calor) {
    l.push("");
    l.push("EM DIAS DE MUITO CALOR");
    l.push(calor);
  }
  return l.join("\n");
};
