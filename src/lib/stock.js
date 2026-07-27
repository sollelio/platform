import { supabase } from "./supabase";

// =====================================================================
// Fase C — Gestão de Stock + Alertas
//
// Este módulo tem duas partes:
//   1. CRUD simples: ler/escrever o stock dos materiais e a config.
//   2. Lógica pura de disponibilidade: dado um material e uma janela de
//      datas, quantas unidades estão livres? É o coração da Fase C.
//
// Princípio-chave: o "disponível" NUNCA é guardado. Guardamos só o total
// (materiais.quantidade_total); o disponível é sempre calculado na hora,
// porque depende SEMPRE de que datas estamos a perguntar.
// =====================================================================

// ---------------------------------------------------------------------
// 1. Config (app_config) — buffer de ocupação
// ---------------------------------------------------------------------

// Lê toda a config como um objecto { chave: valor }
export const getAppConfig = async () => {
  const { data, error } = await supabase.from("app_config").select("*");
  if (error) {
    console.error("Erro ao ir buscar config:", error);
    return {};
  }
  return (data || []).reduce((acc, linha) => {
    acc[linha.chave] = linha.valor;
    return acc;
  }, {});
};

// Escreve um valor de config (upsert pela chave)
export const updateAppConfig = async (chave, valor) => {
  const { data, error } = await supabase
    .from("app_config")
    .update({ valor: String(valor), updated_at: new Date().toISOString() })
    .eq("chave", chave)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Devolve o buffer de ocupação já convertido em números: { antes, depois }.
// Aceita a config já carregada (para não ir à BD duas vezes), ou vai
// buscá-la se não lhe passarem nada. Cai para 2/2 se faltar algum valor.
export const getBuffer = async (config = null) => {
  const cfg = config || (await getAppConfig());
  const antes = Number.parseInt(cfg.buffer_dias_antes, 10);
  const depois = Number.parseInt(cfg.buffer_dias_depois, 10);
  return {
    antes: Number.isFinite(antes) ? antes : 2,
    depois: Number.isFinite(depois) ? depois : 2,
  };
};

// ---------------------------------------------------------------------
// 2. Stock dos materiais
// ---------------------------------------------------------------------

// Escreve a quantidade total em stock de um material
export const updateStock = async (materialId, quantidade) => {
  const qtd = Math.max(0, Math.round(Number(quantidade) || 0));
  const { data, error } = await supabase
    .from("materiais")
    .update({ quantidade_total: qtd })
    .eq("id", materialId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// ---------------------------------------------------------------------
// 3. Lógica pura de datas e sobreposição
// ---------------------------------------------------------------------

// Normaliza qualquer entrada de data para meia-noite UTC, para que as
// comparações sejam feitas por DIA e não por instante (uma toalha ocupada
// "no dia 12" está ocupada o dia inteiro, não só a partir da hora X).
const aoDia = (data) => {
  if (!data) return null;
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
};

// Soma (ou subtrai) dias a uma data, ao nível do dia
const somaDias = (data, dias) => {
  const d = aoDia(data);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
};

// A janela de ocupação de um evento: o dia do evento, alargado pelo buffer
// (montagem antes, higienização/devolução depois). Devolve { inicio, fim }
// como Datas ao dia, ou null se a data do evento for inválida.
export const janelaDoEvento = (dataEvento, buffer) => {
  const ancora = aoDia(dataEvento);
  if (!ancora) return null;
  return {
    inicio: somaDias(ancora, -buffer.antes),
    fim: somaDias(ancora, buffer.depois),
  };
};

// Regra standard de sobreposição de dois intervalos [inicioA, fimA] e
// [inicioB, fimB]: cruzam-se sse inicioA <= fimB E inicioB <= fimA.
// Inclusiva nos limites (se um acaba no dia em que o outro começa,
// consideramos que ainda se tocam — o material não teve tempo de rodar).
export const intervalosSobrepoem = (a, b) => {
  if (!a || !b || !a.inicio || !a.fim || !b.inicio || !b.fim) return false;
  return a.inicio <= b.fim && b.inicio <= a.fim;
};

// ---------------------------------------------------------------------
// 4. Cálculo de disponibilidade — o coração da Fase C
// ---------------------------------------------------------------------

// Para um material, numa janela de datas, calcula quanto está livre.
//
// É uma função PURA: recebe todos os dados já carregados e não faz
// nenhuma query. Isto torna-a trivial de testar e evita ir à BD uma vez
// por material quando estamos a calcular vários de uma vez.
//
// Parâmetros:
//   materialId       — id do material a analisar
//   quantidadeTotal  — quantas unidades a Nádia possui (materiais.quantidade_total)
//   janela           — { inicio, fim } (Datas) — o período que nos interessa.
//                      Para um evento específico, é a janelaDoEvento dele.
//                      Para a vista semanal, são os 7 dias dessa semana.
//   submissions      — lista de submissões (cada uma com id e data_evento)
//   buffer           — { antes, depois }, para alargar a janela de cada evento
//   materiaisPorEvento — Map/objecto: submission_id -> [{ material_id, quantidade }]
//                        (as fichas operacionais, agrupadas por evento)
//   ignorarSubmissionId — opcional: um evento a excluir da conta (útil
//                        quando calculamos a disponibilidade PARA esse
//                        evento, para não o contar contra si próprio)
//
// Devolve:
//   { total, ocupado, disponivel, eventosEmConflito: [{ submissionId, dataEvento, quantidade }] }
//
// NOTA sobre reservas provisórias (decisão b2): NÃO entram neste cálculo.
// Uma reserva provisória tem data mas não tem materiais associados, por
// isso subtraí-la seria inventar números. As reservas tratam-se ao nível
// do AVISO (na UI), não do número. Esta função só conta eventos com ficha.
export const calcularDisponibilidade = ({
  materialId,
  quantidadeTotal,
  janela,
  submissions,
  buffer,
  materiaisPorEvento,
  ignorarSubmissionId = null,
}) => {
  // O 'quantidadeTotal' recebido já deve vir como stock efetivo para
  // conflitos (total − por_confirmar), calculado por quem chama. Aqui só
  // garantimos que não é negativo.
  const total = Math.max(0, Number(quantidadeTotal) || 0);

  // Acesso uniforme ao mapa de materiais por evento (aceita Map ou objecto)
  const materiaisDe = (submissionId) => {
    if (!materiaisPorEvento) return [];
    if (materiaisPorEvento instanceof Map) {
      return materiaisPorEvento.get(submissionId) || [];
    }
    return materiaisPorEvento[submissionId] || [];
  };

  const eventosEmConflito = [];
  let ocupado = 0;

  (submissions || []).forEach((s) => {
    if (!s || !s.data_evento) return;
    if (ignorarSubmissionId && s.id === ignorarSubmissionId) return;

    // Este evento sobrepõe-se à janela que nos interessa?
    const janelaEvento = janelaDoEvento(s.data_evento, buffer);
    if (!intervalosSobrepoem(janela, janelaEvento)) return;

    // Quanto deste material é que o evento usa?
    const linha = materiaisDe(s.id).find((m) => m.material_id === materialId);
    const qtd = linha ? Math.max(0, Number(linha.quantidade) || 0) : 0;
    if (qtd <= 0) return;

    ocupado += qtd;
    eventosEmConflito.push({
      submissionId: s.id,
      dataEvento: s.data_evento,
      quantidade: qtd,
    });
  });

  return {
    total,
    ocupado,
    disponivel: total - ocupado,
    eventosEmConflito,
  };
};

// ---------------------------------------------------------------------
// 5. Carregamento em lote das fichas (para o motor de alertas)
// ---------------------------------------------------------------------

// Traz TODAS as linhas de evento_materiais, só com os campos que os
// motores precisam (a conferência também lê lista_carga — decisão de
// 27/07: a conferência respeita a Lista de Carga).
// NÃO faz join com o catálogo — o stock de cada material vem à parte, do
// getMateriais(), e juntamos as duas peças no cliente pelo material_id.
// Pagina às 1000 (o teto por resposta do PostgREST): sem isto, a partir
// da linha 1001 as fichas desapareciam SILENCIOSAMENTE dos alertas e da
// conferência — o pior tipo de erro, o que parece um "está tudo bem".
export const getTodasFichas = async () => {
  const PAGINA = 1000;
  const todas = [];
  let inicio = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("evento_materiais")
      .select("submission_id, material_id, quantidade, lista_carga")
      .order("id", { ascending: true })
      .range(inicio, inicio + PAGINA - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    todas.push(...data);
    // Avança pelo que VEIO, não pelo que se pediu: se o servidor tiver
    // um Max Rows menor que a página, parar em "veio menos que pedi"
    // perdia o resto em silêncio.
    inicio += data.length;
  }
  return todas;
};

// ---------------------------------------------------------------------
// 6. Motor de alertas — o clímax da Fase C
// ---------------------------------------------------------------------

// Constrói o mapa submission_id -> [{ material_id, quantidade }] a partir
// da lista plana de todas as fichas.
const construirMateriaisPorEvento = (todasFichas) => {
  const mapa = new Map();
  (todasFichas || []).forEach((linha) => {
    if (!linha || !linha.submission_id) return;
    if (!mapa.has(linha.submission_id)) mapa.set(linha.submission_id, []);
    mapa.get(linha.submission_id).push({
      material_id: linha.material_id,
      quantidade: Math.max(0, Number(linha.quantidade) || 0),
      // Truthy, como a Lista de Carga impressa (imprimirFicha) e a
      // checkbox da ficha: NULL sempre se COMPORTOU como "fora da
      // carga" nos dois — a conferência tem de dizer o mesmo número.
      foraDaCarga: !linha.lista_carga,
    });
  });
  return mapa;
};

// Agrupa eventos cujas janelas de ocupação se tocam, em "clusters"
// temporais. Dois eventos no mesmo fim de semana caem no mesmo cluster;
// eventos afastados ficam em clusters diferentes. Cada cluster representa
// UM aperto físico de stock (um período em que as peças não rodam).
//
// Devolve uma lista de clusters, cada um { janela: {inicio, fim},
// submissionIds: Set }. A janela do cluster é a união das janelas dos
// eventos que o compõem.
const agruparEventosEmClusters = (submissions, buffer) => {
  // Eventos com data, ordenados por data, cada um com a sua janela
  const comJanela = (submissions || [])
    .filter((s) => s && s.data_evento)
    .map((s) => ({ id: s.id, janela: janelaDoEvento(s.data_evento, buffer) }))
    .filter((e) => e.janela)
    .sort((a, b) => a.janela.inicio - b.janela.inicio);

  const clusters = [];
  comJanela.forEach((ev) => {
    // Tenta encaixar no último cluster se as janelas se tocarem
    const ultimo = clusters[clusters.length - 1];
    if (ultimo && intervalosSobrepoem(ultimo.janela, ev.janela)) {
      ultimo.submissionIds.add(ev.id);
      // alarga a janela do cluster para conter também este evento
      if (ev.janela.inicio < ultimo.janela.inicio)
        ultimo.janela.inicio = ev.janela.inicio;
      if (ev.janela.fim > ultimo.janela.fim) ultimo.janela.fim = ev.janela.fim;
    } else {
      clusters.push({
        janela: { inicio: ev.janela.inicio, fim: ev.janela.fim },
        submissionIds: new Set([ev.id]),
      });
    }
  });
  return clusters;
};

// Stock efetivo para o cálculo de CONFLITOS entre eventos.
//
// Regra (decidida por análise de risco, dado não sabermos ao certo como a
// Nádia usa as colunas):
//   • desconta 'por_confirmar' — é incerteza estrutural ("não sei se as
//     tenho"); contar com elas seria otimismo perigoso (faltariam peças).
//   • NÃO desconta 'em_higienizacao' — é um estado temporário de hoje; as
//     peças na lavandaria estarão limpas no evento futuro. Descontá-las
//     geraria alertas falsos, que minam a confiança nos alertas.
//
// (O CARD do inventário desconta ambas, porque fala do disponível de HOJE.
//  O motor de conflitos fala do FUTURO — daí a diferença, que é correta.)
const stockParaConflitos = (info) => {
  const total = Math.max(0, Number(info.quantidade_total) || 0);
  const porConfirmar = Math.max(0, Number(info.por_confirmar) || 0);
  return Math.max(0, total - porConfirmar);
};

// Calcula todos os alertas de rutura de stock.
//
// Um alerta = um material que, num cluster temporal (um "aperto"), é
// pedido em maior quantidade do que existe em stock. Eventos que
// partilham o mesmo aperto geram UM só alerta por material, listando
// todos os eventos envolvidos.
//
// Parâmetros:
//   materiais    — catálogo com stock: [{ id, nome, categoria, unidade, quantidade_total }]
//   submissions  — eventos com id + data_evento
//   todasFichas  — todas as linhas de evento_materiais (getTodasFichas)
//   buffer       — { antes, depois }
//
// Devolve lista de alertas, ordenada pela maior falta primeiro:
//   { materialId, material, janela, stock, necessario, falta,
//     eventos: [{ submissionId, dataEvento, quantidade }] }
export const calcularAlertas = ({
  materiais,
  submissions,
  todasFichas,
  buffer,
  fasesPosSinal = null,
}) => {
  // Um evento perdido não vai buscar material nenhum — contá-lo criava
  // alertas de rutura fantasma (e contradizia a conferência, que já o
  // excluía: dois números do mesmo ecrã a discordarem um do outro).
  //
  // Decisão de 27/07 (docs/decisoes-de-produto.md): os Alertas são um
  // RADAR LATO — os orçamentos sem sinal CONTAM (o valor do radar é
  // avisar antes de se aceitar o sinal de dois eventos incompatíveis),
  // mas um alerta que só existe por causa deles é CONDICIONAL
  // (condicional: true) — a UI marca-o e o badge vermelho não o conta.
  // As linhas fora da lista de carga também contam: a Montagem também
  // sai de casa; a ocupação física não é a folha da carrinha.
  const vivos = (submissions || []).filter((s) => s && s.fase !== "perdido");
  const confirmado = (s) =>
    !Array.isArray(fasesPosSinal) || fasesPosSinal.includes(s.fase);
  const materiaisPorEvento = construirMateriaisPorEvento(todasFichas);
  const clusters = agruparEventosEmClusters(vivos, buffer);
  const catalogoPorId = new Map((materiais || []).map((m) => [m.id, m]));

  const alertas = [];

  clusters.forEach((cluster) => {
    // Só interessam clusters com mais de um evento (um evento sozinho
    // nunca disputa stock consigo próprio) OU um evento que sozinho já
    // exceda o stock (ex: pediu 200 cadeiras e só há 150).
    const idsCluster = cluster.submissionIds;

    // Que materiais são usados neste cluster?
    const materiaisUsados = new Set();
    idsCluster.forEach((sid) => {
      (materiaisPorEvento.get(sid) || []).forEach((l) => {
        if (l.quantidade > 0) materiaisUsados.add(l.material_id);
      });
    });

    materiaisUsados.forEach((materialId) => {
      const info = catalogoPorId.get(materialId);
      const stock = info ? stockParaConflitos(info) : 0;

      // Soma o que todos os eventos do cluster pedem deste material,
      // separando o que vem de eventos CONFIRMADOS do que vem de
      // orçamentos sem sinal.
      let necessario = 0;
      let necessarioConfirmado = 0;
      const eventos = [];
      idsCluster.forEach((sid) => {
        const linha = (materiaisPorEvento.get(sid) || []).find(
          (l) => l.material_id === materialId,
        );
        const qtd = linha ? linha.quantidade : 0;
        if (qtd > 0) {
          const sub = vivos.find((s) => s.id === sid);
          const provisorio = sub ? !confirmado(sub) : false;
          necessario += qtd;
          if (!provisorio) necessarioConfirmado += qtd;
          eventos.push({
            submissionId: sid,
            dataEvento: sub?.data_evento || null,
            quantidade: qtd,
            provisorio,
          });
        }
      });

      const falta = necessario - stock;
      if (falta > 0) {
        alertas.push({
          materialId,
          material: info || { id: materialId, nome: "(material desconhecido)" },
          janela: cluster.janela,
          stock,
          // "Sem stock definido" é NÃO TER TOTAL REGISTADO — a mesma
          // definição da conferência. Um total registado mas todo "por
          // confirmar" dá stock 0 a sério ("tens 0"), não "por definir".
          semStock:
            !info ||
            info.quantidade_total == null ||
            Number(info.quantidade_total) <= 0,
          necessario,
          necessarioConfirmado,
          falta,
          // Só rebenta SE algum orçamento fechar — os confirmados,
          // sozinhos, ainda cabem no stock.
          condicional: necessarioConfirmado - stock <= 0,
          // eventos ordenados por data
          eventos: eventos.sort(
            (a, b) => new Date(a.dataEvento) - new Date(b.dataEvento),
          ),
        });
      }
    });
  });

  // A mesma triagem a três da UI (AlertaCard): ruturas reais
  // (vermelho) primeiro, depois "sem stock definido", condicionais no
  // fim. Dentro de cada grupo, a maior falta no topo.
  const rank = (a) => (a.semStock ? 1 : a.condicional ? 2 : 0);
  return alertas.sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    return b.falta - a.falta;
  });
};

// ---------------------------------------------------------------------
// 7. Alertas de REPOSIÇÃO (stock ideal) — o segundo tipo de alerta
// ---------------------------------------------------------------------

// Disponível de HOJE de um material = total − higienização − por confirmar.
// (É o mesmo conceito do card do inventário: o que ela tem mesmo agora.)
const disponivelHoje = (m) => {
  const total = Math.max(0, Number(m.quantidade_total) || 0);
  const higien = Math.max(0, Number(m.em_higienizacao) || 0);
  const conf = Math.max(0, Number(m.por_confirmar) || 0);
  return total - higien - conf;
};

// Calcula os alertas de reposição: materiais cujo disponível de hoje está
// abaixo do stock_ideal definido. Materiais SEM stock_ideal não entram
// (a Nádia não definiu meta → não há do que a avisar).
//
// Cada alerta classifica a severidade, coerente com os cards:
//   'critico' — disponível <= 0, ou abaixo de metade do ideal
//   'atencao' — abaixo do ideal, mas acima de metade
//
// Parâmetro:
//   materiais — catálogo [{ id, nome, categoria, quantidade_total,
//               em_higienizacao, por_confirmar, stock_ideal, ativo }]
//
// Devolve lista ordenada pela maior falta relativa primeiro (o mais longe
// do ideal no topo), cada item:
//   { materialId, material, disponivel, ideal, falta, severidade }
export const calcularAlertasReposicao = ({ materiais }) => {
  const alertas = [];

  (materiais || []).forEach((m) => {
    if (!m || m.ativo === false) return; // ignora inativos
    const ideal = m.stock_ideal == null ? null : Number(m.stock_ideal);
    if (ideal == null || ideal <= 0) return; // sem meta → sem alerta

    const disp = disponivelHoje(m);
    if (disp >= ideal) return; // tem o suficiente → sem alerta

    const falta = ideal - disp;
    const severidade = disp <= 0 || disp < ideal / 2 ? "critico" : "atencao";

    alertas.push({
      materialId: m.id,
      material: m,
      disponivel: disp,
      ideal,
      falta,
      severidade,
    });
  });

  // Ordena: críticos primeiro, depois pela maior falta
  const rank = { critico: 0, atencao: 1 };
  return alertas.sort((a, b) => {
    if (rank[a.severidade] !== rank[b.severidade])
      return rank[a.severidade] - rank[b.severidade];
    return b.falta - a.falta;
  });
};

// ---------------------------------------------------------------------
// 6. Conferência do período — "o que sai de casa"
// ---------------------------------------------------------------------

// A pergunta é outra e por isso a função é outra: os alertas respondem
// a "onde é que isto vai rebentar?" e por isso só devolvem o que falta
// (calcularAlertas descarta tudo com falta <= 0). A conferência
// responde a "tenho material para tudo o que sai este fim de semana?",
// e para isso precisa da lista TODA — o que chega também tem de estar
// lá, para se poder conferir no armazém.
//
// A outra diferença: o período é ESCOLHIDO (esta semana, o fim de
// semana, 15 dias, datas à mão) em vez de deduzido dos clusters. Dois
// eventos afastados que caiam no mesmo intervalo aparecem juntos aqui,
// e é isso que se quer — a carrinha é a mesma.
//
// Usa stockParaConflitos (total − por confirmar), não disponivelHoje:
// isto é uma pergunta sobre o FUTURO, e o que está em higienização hoje
// volta a estar disponível até lá.
//
// Decisões de produto de 27/07 (docs/decisoes-de-produto.md):
//   • A aritmética conta SÓ eventos pós-sinal (fasesPosSinal, vinda do
//     faseConfig.js por quem chama). Orçamentos com ficha aparecem à
//     parte como CARGA PROVISÓRIA — visíveis, fora dos totais e do
//     alarme: um orçamento não se carrega na carrinha, e um alarme que
//     mente é um alarme que se deixa de ler.
//   • Só linhas com lista_carga contam — a conferência e a Lista de
//     Carga impressa do evento dão SEMPRE o mesmo número.
//   • Eventos VIZINHOS (pós-sinal, fora do período, janela de buffer
//     sobreposta) descontam na disponibilidade: o material deles não
//     está no armazém, e a conferência reflete a realidade física.
//   • Materiais desativados entram COM MARCA (inativo: true) — a ficha
//     antiga ainda os leva; omiti-los fazia a carrinha partir sem eles.
//
// Devolve:
//   { eventos: [{ submissionId, submissao, dataEvento, total }],
//     linhas:  [{ materialId, material, categoria, porEvento: Map,
//                 necessario, stock, foraEmVizinhos, vizinhos,
//                 disponivel, saldo, estado, inativo }],
//     porCategoria: [{ categoria, linhas, total }],
//     provisorios: { eventos: [...], linhas: [{ materialId, material,
//                    quantidade, inativo }], unidades },
//     vizinhosInfo: [{ submissionId, submissao, dataEvento }],
//     totais: { eventos, materiais, unidades, ruturas, foraDaCarga,
//               provisorios } }
//
// estado: "rutura" | "no-limite" | "sem-stock" | "ok"
export const calcularConferencia = ({
  materiais,
  submissions,
  todasFichas,
  periodo,
  buffer = { antes: 2, depois: 2 },
  fasesPosSinal = null,
}) => {
  const vazio = {
    eventos: [],
    linhas: [],
    porCategoria: [],
    provisorios: { eventos: [], linhas: [], unidades: 0 },
    vizinhosInfo: [],
    totais: {
      eventos: 0,
      materiais: 0,
      unidades: 0,
      ruturas: 0,
      foraDaCarga: 0,
      provisorios: 0,
    },
  };
  if (!periodo || !periodo.inicio || !periodo.fim) return vazio;

  const inicio = aoDia(periodo.inicio);
  const fim = aoDia(periodo.fim);
  if (!inicio || !fim) return vazio;

  const confirmado = (s) =>
    !Array.isArray(fasesPosSinal) || fasesPosSinal.includes(s.fase);

  // Os eventos do período — pela data do evento (o dia em que as coisas
  // saem mesmo de casa), não pela janela alargada pelo buffer: quem
  // confere no armazém pensa em dias de evento, não em ocupação.
  const noPeriodo = (submissions || [])
    .filter((s) => {
      if (!s || !s.data_evento) return false;
      if (s.fase === "perdido") return false;
      const d = aoDia(s.data_evento);
      return d && d >= inicio && d <= fim;
    })
    .sort((a, b) => a.data_evento.localeCompare(b.data_evento));

  const eventos = noPeriodo.filter(confirmado);
  const eventosProvisorios = noPeriodo.filter((s) => !confirmado(s));

  const materiaisPorEvento = construirMateriaisPorEvento(todasFichas);
  const catalogo = new Map((materiais || []).map((m) => [m.id, m]));

  // As linhas de CARGA de um evento (as outras listas não saem de casa)
  const cargaDe = (submissionId) =>
    (materiaisPorEvento.get(submissionId) || []).filter(
      (l) => l.quantidade > 0 && !l.foraDaCarga,
    );

  // Linhas da ficha que ficam fora da carga — contadas para a nota de
  // rodapé, para a exclusão nunca ser silenciosa. Só dos CONFIRMADOS:
  // as linhas de um orçamento estão fora da soma inteiras, pela fase —
  // contá-las aqui inflacionava a nota com linhas que nunca entrariam.
  let foraDaCarga = 0;
  for (const s of eventos) {
    foraDaCarga += (materiaisPorEvento.get(s.id) || []).filter(
      (l) => l.quantidade > 0 && l.foraDaCarga,
    ).length;
  }

  // --- Vizinhos: eventos pós-sinal FORA do período cuja janela de
  // ocupação (data ± buffer) toca o período escolhido. Só os pós-sinal
  // levam material a sério — um orçamento vizinho não tira nada de casa.
  const idsNoPeriodo = new Set(noPeriodo.map((s) => s.id));
  const janelaPeriodo = { inicio, fim };
  const vizinhos = (submissions || []).filter((s) => {
    if (!s || !s.data_evento || idsNoPeriodo.has(s.id)) return false;
    if (s.fase === "perdido" || !confirmado(s)) return false;
    return intervalosSobrepoem(
      janelaPeriodo,
      janelaDoEvento(s.data_evento, buffer),
    );
  });

  if (eventos.length === 0 && eventosProvisorios.length === 0) return vazio;

  // material_id → { submissionId → quantidade } (só confirmados, só carga)
  const pedidos = new Map();
  for (const s of eventos) {
    for (const linha of cargaDe(s.id)) {
      if (!pedidos.has(linha.material_id))
        pedidos.set(linha.material_id, new Map());
      const porEvento = pedidos.get(linha.material_id);
      porEvento.set(s.id, (porEvento.get(s.id) || 0) + linha.quantidade);
    }
  }

  // material_id → quantidade fora de casa em vizinhos (e em que eventos)
  const foraPorMaterial = new Map();
  for (const s of vizinhos) {
    for (const linha of cargaDe(s.id)) {
      if (!foraPorMaterial.has(linha.material_id))
        foraPorMaterial.set(linha.material_id, { quantidade: 0, eventos: [] });
      const info = foraPorMaterial.get(linha.material_id);
      info.quantidade += linha.quantidade;
      info.eventos.push({
        submissionId: s.id,
        submissao: s,
        dataEvento: s.data_evento,
        quantidade: linha.quantidade,
      });
    }
  }

  const linhas = [];
  for (const [materialId, porEvento] of pedidos.entries()) {
    const material = catalogo.get(materialId);
    if (!material) continue;

    const necessario = [...porEvento.values()].reduce((a, b) => a + b, 0);
    if (necessario <= 0) continue;

    // Sem stock registado, o saldo não se pode calcular — e um zero
    // seria mentira. A UI diz "sem stock definido", como nos Alertas.
    const semStock =
      material.quantidade_total == null || Number(material.quantidade_total) <= 0;
    const stock = semStock ? null : stockParaConflitos(material);
    const vizinhosDaLinha = foraPorMaterial.get(materialId) || null;
    const foraEmVizinhos = vizinhosDaLinha ? vizinhosDaLinha.quantidade : 0;
    const disponivel = semStock ? null : stock - foraEmVizinhos;
    const saldo = semStock ? null : disponivel - necessario;

    linhas.push({
      materialId,
      material,
      categoria: material.categoria || "Sem categoria",
      porEvento,
      necessario,
      stock,
      foraEmVizinhos,
      vizinhos: vizinhosDaLinha ? vizinhosDaLinha.eventos : [],
      disponivel,
      saldo,
      inativo: material.ativo === false,
      estado: semStock
        ? "sem-stock"
        : saldo < 0
          ? "rutura"
          : saldo === 0
            ? "no-limite"
            : "ok",
    });
  }

  linhas.sort((a, b) => (a.material.nome || "").localeCompare(b.material.nome || ""));

  // Agrupadas por categoria, com subtotal — o agrupamento já existe no
  // sistema (ver CATEGORIAS_ORDEM em materiais.js); aqui ganha o total.
  const mapaCategorias = new Map();
  for (const linha of linhas) {
    if (!mapaCategorias.has(linha.categoria))
      mapaCategorias.set(linha.categoria, []);
    mapaCategorias.get(linha.categoria).push(linha);
  }
  const porCategoria = [...mapaCategorias.entries()]
    .map(([categoria, ls]) => ({
      categoria,
      linhas: ls,
      total: ls.reduce((acc, l) => acc + l.necessario, 0),
    }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria));

  const totaisPorEvento = eventos.map((s) => {
    let total = 0;
    for (const linha of linhas) total += linha.porEvento.get(s.id) || 0;
    return { submissionId: s.id, submissao: s, dataEvento: s.data_evento, total };
  });

  // --- Carga provisória: os orçamentos com ficha, agregados por
  // material. Visíveis, mas fora da aritmética (ver decisão acima).
  const provisoriosPorMaterial = new Map();
  const provisoriosEventos = eventosProvisorios
    .map((s) => {
      let total = 0;
      for (const linha of cargaDe(s.id)) {
        const material = catalogo.get(linha.material_id);
        if (!material) continue;
        total += linha.quantidade;
        if (!provisoriosPorMaterial.has(linha.material_id))
          provisoriosPorMaterial.set(linha.material_id, {
            materialId: linha.material_id,
            material,
            quantidade: 0,
            inativo: material.ativo === false,
          });
        provisoriosPorMaterial.get(linha.material_id).quantidade +=
          linha.quantidade;
      }
      return { submissionId: s.id, submissao: s, dataEvento: s.data_evento, total };
    })
    // Um orçamento sem ficha de carga não é carga provisória — é só um
    // orçamento; não há nada para mostrar ao armazém.
    .filter((e) => e.total > 0);
  const provisoriosLinhas = [...provisoriosPorMaterial.values()].sort((a, b) =>
    (a.material.nome || "").localeCompare(b.material.nome || ""),
  );

  return {
    eventos: totaisPorEvento,
    linhas,
    porCategoria,
    provisorios: {
      eventos: provisoriosEventos,
      linhas: provisoriosLinhas,
      unidades: provisoriosLinhas.reduce((acc, l) => acc + l.quantidade, 0),
    },
    // Só os vizinhos que descontam MESMO nalguma linha — nomear um
    // vizinho sem materiais partilhados mandava conferir um desconto
    // que não existe.
    vizinhosInfo: (() => {
      const descontam = new Set(
        linhas.flatMap((l) => l.vizinhos.map((v) => v.submissionId)),
      );
      return vizinhos
        .filter((s) => descontam.has(s.id))
        .map((s) => ({
          submissionId: s.id,
          submissao: s,
          dataEvento: s.data_evento,
        }));
    })(),
    totais: {
      eventos: eventos.length,
      materiais: linhas.length,
      unidades: linhas.reduce((acc, l) => acc + l.necessario, 0),
      ruturas: linhas.filter((l) => l.estado === "rutura").length,
      foraDaCarga,
      provisorios: provisoriosEventos.length,
    },
  };
};

// Os períodos que se escolhem com um clique. "Fim de semana" é o
// próximo sexta→domingo (incluindo hoje, se hoje já for fim de semana).
export const periodosPredefinidos = (hoje = new Date()) => {
  const base = aoDia(hoje.toISOString().slice(0, 10));
  const diaSemana = base.getUTCDay(); // 0 = domingo

  const sextaProxima = somaDias(base, diaSemana === 0 ? -2 : 5 - diaSemana);
  return [
    {
      id: "semana",
      label: "Esta semana",
      inicio: base,
      fim: somaDias(base, 6),
    },
    {
      id: "fimDeSemana",
      label: "Fim de semana",
      inicio: sextaProxima,
      fim: somaDias(sextaProxima, 2),
    },
    { id: "quinzena", label: "15 dias", inicio: base, fim: somaDias(base, 14) },
  ];
};
