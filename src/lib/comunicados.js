import { supabase } from "./supabase";
import { FASES_POS_SINAL } from "./fases";
import { comprimirFotoParaJpeg } from "./captacao";
import { resolverMensagem } from "./mensagens";

// ============================================================
// comunicados.js — a camada de dados dos comunicados (migração 079).
//
// A FOLHA de um comunicado: uma página com endereço próprio, pública e
// reencaminhável, sem um único dado pessoal. A equipa lê e escreve a
// tabela directamente (é o que a RLS lhe dá); publicar e retirar passam
// pelas RPCs; a leitura pública é a dlm_comunicado_ver — que este
// ficheiro NÃO chama de propósito: está concedida só ao anon, porque
// conta uma leitura de cada vez que corre. A pré-visualização do
// backoffice lê a tabela, nunca a porta pública.
//
// Vocabulário (glossário): RETIRAR uma folha (pública) não é REVOGAR um
// acesso (pessoal, o portal). Actos diferentes, objectos diferentes.
// ============================================================

// Lista os comunicados, os mais recentes primeiro. A ordenação fina
// (por publicar à cabeça) é da lista no ecrã — regra de desenho, não de
// dados.
export const listarComunicados = async () => {
  const { data, error } = await supabase
    .from("comunicados")
    // registo e mensagem vêm já na lista: os editores podem abrir de uma
    // linha antes de o getComunicado fresco aterrar, e não podem nascer
    // com o temperamento (ou o texto) em branco por causa dessa corrida.
    .select("id, titulo, subtitulo, blocos, registo, mensagem, token, publicado_em, retirado_em, expira_em, n_acessos, created_at, actualizado_em")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

export const getComunicado = async (id) => {
  const { data, error } = await supabase
    .from("comunicados")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
};

// A folha nasce ao PRIMEIRO GUARDAR, com o que ela escreveu — não ao
// abrir o editor. Nasceu ao contrário na fase 1 (a linha entrava na base
// logo no «+ Novo comunicado») e o teste real do dono apanhou o rasto:
// cancelar deixava um «Sem título, por enquanto» na lista, sem remédio.
// Cancelar agora deixa zero. Sem campos, nasce em branco (o caminho dos
// moldes e das fixtures continua a valer).
export const criarComunicado = async (campos = {}) => {
  const { data, error } = await supabase
    .from("comunicados")
    .insert([
      {
        titulo: campos.titulo ?? "",
        subtitulo: campos.subtitulo ?? null,
        registo: campos.registo ?? "aviso",
        blocos: campos.blocos ?? [{ id: idDeBloco(), rotulo: "", texto: "" }],
        mensagem: campos.mensagem ?? null,
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Apagar só o que NÃO TEM HISTÓRIA: nem leituras, nem lista de
// expedição. Uma folha lida ou expedida é registo do que aconteceu — o
// gesto público para essas é RETIRAR, nunca apagar. O método verifica
// (a UI já escondeu o botão, mas a regra vive aqui, não no ecrã).
export const apagarComunicado = async (id) => {
  const { data: c, error: erroLer } = await supabase
    .from("comunicados")
    .select("id, n_acessos, congelado_em")
    .eq("id", id)
    .single();
  if (erroLer) throw erroLer;
  if ((c.n_acessos || 0) > 0 || c.congelado_em) {
    throw new Error(
      "Esta folha tem história — leituras ou uma lista de expedição. Retira-se; não se apaga.",
    );
  }
  const { error } = await supabase.from("comunicados").delete().eq("id", id);
  if (error) throw error;
};

// Atualiza uma folha (whitelist — lição 3, o molde do updateMensagem).
export const guardarComunicado = async (id, campos) => {
  const permitidos = ["titulo", "subtitulo", "blocos", "mensagem", "expira_em", "registo"];
  const patch = {};
  for (const k of permitidos) {
    if (k in campos) patch[k] = campos[k];
  }
  if (Object.keys(patch).length === 0) throw new Error("Nada para atualizar.");
  patch.actualizado_em = new Date().toISOString();

  const { data, error } = await supabase
    .from("comunicados")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Publicar dá (ou volta a dar) o endereço; a RPC devolve o token — o
// MESMO de antes se a folha já teve um, porque o endereço é a
// identidade da folha.
export const publicarComunicado = async (id) => {
  const { data, error } = await supabase.rpc("dlm_comunicado_publicar", {
    p_id: id,
  });
  if (error) throw error;
  return data;
};

export const retirarComunicado = async (id) => {
  const { error } = await supabase.rpc("dlm_comunicado_retirar", {
    p_id: id,
  });
  if (error) throw error;
};

// O endereço completo da folha, a partir de onde a app está a correr —
// em teste dá o endereço de teste, em produção o real.
export const enderecoDoComunicado = (token) =>
  `${window.location.origin}/comunicado/${token}`;

// Um id de bloco novo: curto, único o suficiente para uma folha, e
// gerado no cliente — como o brief manda.
export const idDeBloco = () =>
  `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ------------------------------------------------------------
// comporFolha — o papel de cada bloco, derivado.
//
// O editor guarda blocos {id, rotulo, texto} sem tipo nenhum; é a
// posição e o conteúdo que dizem o que cada um é NA FOLHA (a regra que
// o Design fixou, escrita na própria linha de instrução do editor):
//   · só texto           → prosa
//   · só rótulo          → abre um grupo (separador com filete)
//   · rótulo + texto     → cláusula, numerada em romano
//   · o 1.º com ambos    → a nota em destaque (não é cláusula)
//   · o último com ambos → o remate (não é cláusula)
//
// Vive aqui, e não no componente, porque há DUAS folhas a compor — a
// pré-visualização do editor e a página pública — e uma regra com duas
// cópias é uma regra com duas versões.
//
// A PRIMEIRA PERGUNTA é o `tipo`: um bloco que o traga manda, antes de
// qualquer derivação — e fica de fora dela (uma imagem no fim não rouba
// o remate ao bloco anterior; um botão no meio não vira cláusula):
//   · tipo "imagem"  → {papel:'imagem', url, legenda}
//   · tipo "chamada" → {papel:'chamada', rotulo, url, nota}
//     (o rotulo é o texto do botão)
// Sem tipo, deriva como sempre.
//
// Na prosa, uma primeira linha curta terminada em vírgula é a saudação
// («Queridos noivos,») e leva o tratamento de cerimónia — é assim que a
// folha do Design abre, sem pedir um campo a mais a quem escreve.
//
// ⚠ ARMADILHA QUE FICA DE PÉ (registada a pedido do dono): a saudação
// deriva da primeira linha curta terminada em VÍRGULA — «Queridos
// noivos» sem a vírgula vira parágrafo normal e nada avisa quem escreve.
// ------------------------------------------------------------
const ROMANOS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
export const romano = (n) => ROMANOS[n - 1] || String(n);

// Os tipos declarados que o editor pode marcar num bloco. Qualquer outro
// valor (ou nenhum) cai na derivação — retrocompatível com as folhas da
// fase 1, que não têm tipo nenhum.
const TIPOS_DE_BLOCO = ["imagem", "chamada"];

export const comporFolha = (blocos) => {
  const lista = Array.isArray(blocos) ? blocos : [];
  // Só os blocos SEM tipo entram na derivação de nota/remate/cláusulas —
  // o «último com ambos» é o último derivável, para uma imagem no fim
  // não apagar o remate em silêncio.
  const derivaveis = lista.filter((b) => !TIPOS_DE_BLOCO.includes(b.tipo));
  const comAmbos = derivaveis.filter((b) => b.rotulo?.trim() && b.texto?.trim());
  const notaId = comAmbos.length ? comAmbos[0].id : null;
  const ultimo = derivaveis[derivaveis.length - 1];
  const remateId =
    ultimo && ultimo.rotulo?.trim() && ultimo.texto?.trim() && ultimo.id !== notaId
      ? ultimo.id
      : null;

  let n = 0;
  return lista.map((b) => {
    if (b.tipo === "imagem") {
      return {
        id: b.id,
        papel: "imagem",
        url: b.url || "",
        legenda: (b.legenda || "").trim(),
      };
    }
    if (b.tipo === "chamada") {
      return {
        id: b.id,
        papel: "chamada",
        rotulo: (b.rotulo || "").trim(),
        url: b.url || "",
        nota: (b.nota || "").trim(),
      };
    }
    const rotulo = (b.rotulo || "").trim();
    const texto = (b.texto || "").trim();
    if (!rotulo && !texto) return { id: b.id, papel: "vazio", rotulo, texto };
    if (b.id === notaId) return { id: b.id, papel: "nota", rotulo, texto };
    if (b.id === remateId) return { id: b.id, papel: "remate", rotulo, texto };
    if (!rotulo) {
      // A saudação: primeira linha curta a acabar em vírgula.
      const linhas = texto.split("\n");
      const primeira = linhas[0].trim();
      const saudacao =
        primeira.endsWith(",") && primeira.length <= 60 && linhas.length > 1
          ? primeira
          : null;
      const resto = saudacao ? linhas.slice(1).join("\n").trim() : texto;
      return { id: b.id, papel: "prosa", rotulo, texto: resto, saudacao };
    }
    if (!texto) return { id: b.id, papel: "grupo", rotulo, texto };
    n += 1;
    return { id: b.id, papel: "clausula", rotulo, texto, num: romano(n) };
  });
};

// ============================================================
// FASE 2 — o público e a expedição (migração 080).
//
// O RECORTE responde «quem vai receber isto?» antes de qualquer envio;
// o CONGELAMENTO fixa a lista em comunicado_destinatarios (instantâneos:
// se a ficha mudar depois, a linha continua a dizer o que dizia quando a
// Nádia começou a enviar); a EXPEDIÇÃO é pessoa a pessoa, com dois
// carimbos (aberto_em/enviado_em) e um texto próprio quando a base não
// chega. A folha pública nunca sabe que nada disto existe.
// ============================================================

// O que se escreve quando não há nome nenhum — nem na ficha, nem nas
// respostas. É texto visível na lista, não um estado.
const SEM_NOME = "(sem nome)";

// A chave canónica de um telefone: os últimos 9 dígitos (migração 043).
// É a MESMA regra da v_destinatarios_possiveis — a vista aplica-a às
// linhas de eventos no Postgres; esta cópia em JS existe só para a
// origem «contactos», que a vista não cobre (clientes sem evento não
// aparecem numa vista que nasce de submissions).
const chaveDeTelefone = (telefone) => {
  const d = String(telefone || "").replace(/\D/g, "");
  return d === "" ? null : d.slice(-9);
};

// Hoje em ISO LOCAL, não UTC: às 00h30 de Lisboa em horário de verão,
// o toISOString ainda diz «ontem» — e um evento de hoje escorregava
// para os «passados».
const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// As chaves REAIS de nome nas respostas — pela ordem do dono (cliente →
// noiva → noivo), cada uma alargada às variantes que existem de facto,
// INCLUINDO as trocadas do modelo Casamento (nomeDaNoivo é a NOIVA e
// nomeDoNoiva é o NOIVO — ver a lição em getDadosParaDocumento,
// clientes.js; os ids nasceram de etiquetas trocadas e ficam assim para
// sempre). Não «arrumar» esta lista a olhar só para os nomes.
const CHAVES_NOME_RESPOSTAS = [
  "nomeDoCliente", "nomeCliente",
  "nomeNoiva", "nomeDaNoiva", "nomeDaNoivo",
  "nomeNoivo", "nomeDoNoivo", "nomeDoNoiva",
];

const nomeDasRespostas = (det) => {
  if (!det) return null;
  for (const chave of CHAVES_NOME_RESPOSTAS) {
    const v = (det[chave] || "").trim();
    if (v) return v;
  }
  return null;
};

// Vai às respostas dos eventos buscar o que a vista não dá: o nome
// (quando a ficha não tem) e o tipo escrito à mão (tipoEventoOutro).
// Uma ida só, e só para as linhas que precisam dela.
const completarDetalhes = async (rows) => {
  const ids = rows
    .filter((r) => !(r.nome || "").trim() || !r.event_type_id)
    .map((r) => r.submission_id)
    .filter(Boolean);
  if (ids.length === 0) return new Map();
  const aliases = CHAVES_NOME_RESPOSTAS.map((c) => `${c}:respostas->>${c}`).join(", ");
  const { data, error } = await supabase
    .from("submissions")
    .select(`id, tipoEventoOutro:respostas->>tipoEventoOutro, ${aliases}`)
    .in("id", ids);
  if (error) throw error;
  return new Map((data || []).map((d) => [d.id, d]));
};

const tiposDeEvento = async () => {
  const { data, error } = await supabase.from("event_types").select("id, nome");
  if (error) throw error;
  return new Map((data || []).map((t) => [t.id, t.nome]));
};

// ---- A selecção crua de cada origem (partilhada por contar e congelar:
// contar o que se congela e congelar o que se contou é a MESMA pergunta,
// e uma pergunta com duas cópias é uma pergunta com duas respostas). ----

const seleccionarEventos = async ({ eventTypeId, janela = "todos" }) => {
  if (!["porvir", "passados", "todos"].includes(janela)) {
    throw new Error(`Janela inválida: ${janela}`);
  }
  let query = supabase.from("v_destinatarios_possiveis").select("*");
  if (eventTypeId) query = query.eq("event_type_id", eventTypeId);
  const { data, error } = await query;
  if (error) throw error;
  const hoje = hojeISO();
  return (data || []).filter((r) => {
    if (r.fase === "perdido") return false; // um perdido nunca recebe nada
    // «porvir» inclui quem não tem data: ainda pode vir a ser.
    if (janela === "porvir") return !r.data_evento || r.data_evento >= hoje;
    if (janela === "passados") return Boolean(r.data_evento) && r.data_evento < hoje;
    return true;
  });
};

const seleccionarContactos = async ({ quem = "todos" }) => {
  if (!["clientes", "interessados", "todos"].includes(quem)) {
    throw new Error(`Recorte de contactos inválido: ${quem}`);
  }
  const { data, error } = await supabase
    .from("clientes")
    .select(
      "id, nome, contacto, recusou_promocoes_em, submissions(id, fase, numeroWhatsapp:respostas->>numeroWhatsapp, contactoPrincipal:respostas->>contactoPrincipal)",
    );
  if (error) throw error;

  const incluidos = [];
  const excluidasPromocoes = [];
  for (const c of data || []) {
    const eventos = c.submissions || [];
    // A classificação que o funil já dá (lib/fases.js): CLIENTE tem
    // pelo menos um evento pós-sinal; INTERESSADO tem evento vivo mas
    // nenhum pós-sinal; o resto é só um contacto na base.
    const posSinal = eventos.some((e) => FASES_POS_SINAL.includes(e.fase));
    const vivos = eventos.filter((e) => e.fase !== "perdido");
    const classe = posSinal ? "Cliente" : vivos.length ? "Interessado" : "Contacto";
    const entra =
      quem === "todos" ||
      (quem === "clientes" && posSinal) ||
      (quem === "interessados" && vivos.length > 0 && !posSinal);
    if (!entra) continue;
    // Quem recusou promoções fica FORA — mas SÓ nesta origem: um aviso
    // operacional a quem tem evento marcado não é promoção (080, §3).
    // Lista-se só quem TERIA entrado, para a contagem dizer a verdade
    // deste recorte e não da base inteira.
    if (c.recusou_promocoes_em) {
      excluidasPromocoes.push((c.nome || "").trim() || SEM_NOME);
      continue;
    }
    // Coluna primeiro, respostas como recurso — a regra da vista (043),
    // aqui varrida evento a evento.
    let telefone = (c.contacto || "").trim() || null;
    if (!telefone) {
      for (const e of eventos) {
        telefone =
          (e.numeroWhatsapp || "").trim() || (e.contactoPrincipal || "").trim() || null;
        if (telefone) break;
      }
    }
    incluidos.push({
      cliente_id: c.id,
      nome: (c.nome || "").trim() || SEM_NOME,
      classe,
      telefone,
      telefone_chave: chaveDeTelefone(telefone),
      eventosVivos: vivos.length,
    });
  }
  return { incluidos, excluidasPromocoes };
};

// ------------------------------------------------------------
// contarRecorte — a pré-contagem honesta: quantas pessoas, quantos
// eventos, quem fica de fora e PORQUÊ. Pessoas deduplicadas por
// telefone_chave (sem chave não há como saber se é a mesma — conta
// cada uma). Nada se escreve: é só a resposta à pergunta.
// ------------------------------------------------------------
export const contarRecorte = async ({ origem, eventTypeId, janela, quem } = {}) => {
  let linhas;
  let eventos;
  let excluidasPromocoes = [];

  if (origem === "eventos") {
    const rows = await seleccionarEventos({ eventTypeId, janela });
    const detalhes = await completarDetalhes(rows);
    linhas = rows.map((r) => ({
      nome:
        (r.nome || "").trim() || nomeDasRespostas(detalhes.get(r.submission_id)) || SEM_NOME,
      telefone: r.telefone,
      telefone_chave: r.telefone_chave,
    }));
    eventos = rows.length;
  } else if (origem === "contactos") {
    const sel = await seleccionarContactos({ quem });
    linhas = sel.incluidos;
    excluidasPromocoes = sel.excluidasPromocoes;
    // Na origem contactos «eventos» são os vivos das pessoas incluídas —
    // o que a classificação olhou, não a base inteira.
    eventos = sel.incluidos.reduce((n, p) => n + p.eventosVivos, 0);
  } else {
    throw new Error(`Origem de recorte inválida: ${origem}`);
  }

  const porChave = new Map();
  const semNumero = [];
  for (const l of linhas) {
    if (l.telefone_chave) {
      const grupo = porChave.get(l.telefone_chave);
      if (grupo) grupo.n += 1;
      else porChave.set(l.telefone_chave, { nome: l.nome, n: 1 });
    } else {
      semNumero.push({
        nome: l.nome,
        // Distinguir «não há número» de «há, mas não serve» — são
        // conversas diferentes com a pessoa.
        porque: l.telefone
          ? "o número registado não tem dígitos utilizáveis"
          : origem === "eventos"
            ? "sem número na ficha nem nas respostas do evento"
            : "sem número na ficha nem em nenhum evento",
      });
    }
  }

  return {
    pessoas: porChave.size + semNumero.length,
    eventos,
    comNumero: porChave.size,
    semNumero,
    excluidasPromocoes,
    duplicados: [...porChave.values()]
      .filter((g) => g.n > 1)
      .map((g) => ({ nome: g.nome, n: g.n })),
  };
};

// ------------------------------------------------------------
// congelarLista — fixa o recorte em linhas de comunicado_destinatarios.
// ------------------------------------------------------------

// Os meses da âncora em minúscula («12 de setembro») — a grafia que o
// desenho da fase 2 fixou para esta linha. O portal tem os seus MESES
// com maiúscula (grafia pré-acordo), mas lib/ não importa de
// components/ e a âncora não é o portal; se a casa preferir «Setembro»,
// muda-se aqui, uma vez.
const MESES_ANCORA = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const ancoraDeData = (iso) => {
  const [, m, d] = (iso || "").split("-");
  const mes = MESES_ANCORA[Number(m) - 1];
  if (!mes || !d) return null;
  return `${Number(d)} de ${mes}`;
};

export const congelarLista = async (comunicadoId, regra = {}) => {
  // O método também verifica — o índice único é a rede, não o método.
  // E a rede tem um buraco de propósito: linhas sem telefone_chave não
  // colidem, logo congelar por cima duplicava toda a gente sem número.
  const { data: existentes, error: erroExistentes } = await supabase
    .from("comunicado_destinatarios")
    .select("id")
    .eq("comunicado_id", comunicadoId)
    .limit(1);
  if (erroExistentes) throw erroExistentes;
  if (existentes && existentes.length) {
    throw new Error(
      "Esta folha já tem uma lista congelada — desfaz o congelamento antes de congelar de novo.",
    );
  }

  const { origem } = regra;
  let linhas;
  if (origem === "eventos") {
    const rows = await seleccionarEventos(regra);
    const [detalhes, tipos] = await Promise.all([completarDetalhes(rows), tiposDeEvento()]);
    linhas = rows.map((r) => {
      const det = detalhes.get(r.submission_id);
      const tipoNome =
        (r.event_type_id && tipos.get(r.event_type_id)) ||
        (det?.tipoEventoOutro || "").trim() ||
        "Evento";
      return {
        submission_id: r.submission_id,
        cliente_id: r.cliente_id,
        nome: (r.nome || "").trim() || nomeDasRespostas(det) || SEM_NOME,
        ancora: `${tipoNome} · ${ancoraDeData(r.data_evento) || "sem data marcada"}`,
        telefone: r.telefone,
        telefone_chave: r.telefone_chave,
        dataOrdenacao: r.data_evento || null,
      };
    });
  } else if (origem === "contactos") {
    const { incluidos } = await seleccionarContactos(regra);
    linhas = incluidos.map((p) => ({
      submission_id: null,
      cliente_id: p.cliente_id,
      nome: p.nome,
      // Sem evento não há âncora de data — a classe é o que situa.
      ancora: p.classe,
      telefone: p.telefone,
      telefone_chave: p.telefone_chave,
      dataOrdenacao: null,
    }));
  } else {
    throw new Error(`Origem de recorte inválida: ${origem}`);
  }

  // Ordem de expedição: por data do evento (sem data no fim) e nome.
  linhas.sort(
    (a, b) =>
      (a.dataOrdenacao || "9999-99-99").localeCompare(b.dataOrdenacao || "9999-99-99") ||
      a.nome.localeCompare(b.nome, "pt"),
  );

  // DEDUPLICAR por chave antes de inserir — a primeira ocorrência (a de
  // data mais próxima, pela ordenação acima) fica; sem chave entram todas.
  const vistos = new Set();
  const registos = [];
  for (const l of linhas) {
    if (l.telefone_chave) {
      if (vistos.has(l.telefone_chave)) continue;
      vistos.add(l.telefone_chave);
    }
    registos.push({
      comunicado_id: comunicadoId,
      submission_id: l.submission_id,
      cliente_id: l.cliente_id,
      nome: l.nome,
      ancora: l.ancora,
      telefone: l.telefone,
      telefone_chave: l.telefone_chave,
      ordem: registos.length,
    });
  }
  if (registos.length === 0) {
    throw new Error("O recorte não apanha ninguém — não há lista para congelar.");
  }

  const { data: inseridos, error: erroInserir } = await supabase
    .from("comunicado_destinatarios")
    .insert(registos)
    .select();
  if (erroInserir) throw erroInserir;

  // A regra guarda-se na forma que a 080 documenta (snake_case): é a BD
  // que se vai lembrar dela para a fase 3, não este ficheiro. Se este
  // update falhar depois do insert, desfazerCongelamento limpa — não há
  // transação do lado do cliente.
  const publico = {
    origem,
    event_type_id: regra.eventTypeId ?? null,
    janela: regra.janela ?? null,
    quem: regra.quem ?? null,
  };
  const { error: erroComunicado } = await supabase
    .from("comunicados")
    .update({ publico, congelado_em: new Date().toISOString() })
    .eq("id", comunicadoId);
  if (erroComunicado) throw erroComunicado;

  return (inseridos || []).sort((a, b) => a.ordem - b.ordem);
};

// Desfaz o congelamento — SÓ enquanto a expedição não começou: uma
// linha aberta ou enviada é história, e história não se apaga. (Entre a
// verificação e o delete há uma janela sem transação; com uma equipa de
// uma pessoa, aceita-se e regista-se.)
export const desfazerCongelamento = async (comunicadoId) => {
  const { data: mexidas, error: erroMexidas } = await supabase
    .from("comunicado_destinatarios")
    .select("id")
    .eq("comunicado_id", comunicadoId)
    .or("aberto_em.not.is.null,enviado_em.not.is.null")
    .limit(1);
  if (erroMexidas) throw erroMexidas;
  if (mexidas && mexidas.length) {
    throw new Error(
      "A expedição já começou — há conversas abertas ou envios marcados. O congelamento já não se desfaz.",
    );
  }
  const { error: erroApagar } = await supabase
    .from("comunicado_destinatarios")
    .delete()
    .eq("comunicado_id", comunicadoId);
  if (erroApagar) throw erroApagar;
  const { data, error } = await supabase
    .from("comunicados")
    .update({ publico: null, congelado_em: null })
    .eq("id", comunicadoId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// ---- Destinatários: a lista e os dois carimbos ----

export const listarDestinatarios = async (comunicadoId) => {
  const { data, error } = await supabase
    .from("comunicado_destinatarios")
    .select("*")
    .eq("comunicado_id", comunicadoId)
    .order("ordem");
  if (error) throw error;
  return data || [];
};

const patchDestinatario = async (id, patch) => {
  const { data, error } = await supabase
    .from("comunicado_destinatarios")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// aberto_em preenchido, enviado_em vazio → à espera de resposta;
// enviado_em preenchido → enviado; ambos vazios → por enviar.
// «Não saiu» limpa o aberto_em e a linha volta ao princípio.
export const marcarAberto = (id) =>
  patchDestinatario(id, { aberto_em: new Date().toISOString() });

export const marcarEnviado = (id) =>
  patchDestinatario(id, { enviado_em: new Date().toISOString() });

export const limparAberto = (id) => patchDestinatario(id, { aberto_em: null });

// O texto PRÓPRIO desta pessoa; vazio (ou null) volta à mensagem base
// do comunicado — apagar tudo é a maneira natural de «despersonalizar».
export const guardarMensagemDestinatario = (id, texto) =>
  patchDestinatario(id, {
    mensagem: typeof texto === "string" && texto.trim() !== "" ? texto : null,
  });

// Marca como enviadas todas as linhas POR ENVIAR que têm telefone —
// o remate de uma sessão de difusão. Quem não tem número fica por
// enviar (não recebeu nada); quem já tinha carimbo não é tocado.
// Devolve quantas linhas foram marcadas.
export const marcarTodosEnviados = async (comunicadoId) => {
  const { data, error } = await supabase
    .from("comunicado_destinatarios")
    .update({ enviado_em: new Date().toISOString() })
    .eq("comunicado_id", comunicadoId)
    .is("enviado_em", null)
    .not("telefone", "is", null)
    // Uma dispensada NUNCA leva carimbo: «dispensada e enviada» seria a
    // contradição de registar «a mensagem saiu» sobre quem a casa
    // decidiu não contactar. O CHECK da 081 rebentava aqui — este
    // filtro é a cinta, o CHECK são os suspensórios.
    .is("dispensado_em", null)
    .select("id");
  if (error) throw error;
  return (data || []).length;
};

// As linhas que CONTAM — sem dispensado_em. As vistas de expedição e as
// contagens filtram por aqui; listarDestinatarios continua a devolver
// tudo de propósito, porque o ecrã de «quem entrou depois» precisa de
// ver as dispensadas (é assim que sabe não voltar a perguntar).
export const linhasActivas = (linhas) => (linhas || []).filter((l) => !l.dispensado_em);

// As folhas que já SAÍRAM para UM evento — a linha da ficha do evento
// (a outra metade das «folhas da casa» que o portal mostra desde a 082,
// aqui lida da tabela e nunca da dlm_comunicado_ver, que conta leituras).
// Junta as linhas de destinatário deste evento com carimbo de envio — e
// sem dispensa: uma dispensada nunca teve envio nenhum para contar — à
// folha-mãe, do envio mais recente para trás.
//
// A palavra é «enviado», nunca «recebido»: o carimbo diz que a conversa
// se abriu e a mensagem saiu, não que chegou nem que foi lida. E o
// `no_ar` segue o contrato da 082 (publicada, não retirada, não
// expirada): a ficha mostra o envio SEMPRE — história não se apaga —
// mas só oferece a ligação quando ela ainda abre alguma coisa.
export const comunicadosDoEvento = async (submissionId) => {
  if (!submissionId) return [];
  const { data, error } = await supabase
    .from("comunicado_destinatarios")
    .select("enviado_em, comunicados(titulo, token, publicado_em, retirado_em, expira_em)")
    .eq("submission_id", submissionId)
    .not("enviado_em", "is", null)
    .is("dispensado_em", null)
    .order("enviado_em", { ascending: false });
  if (error) throw error;
  const agora = Date.now();
  return (data || [])
    // Sem folha-mãe não há o que dizer (uma folha apagada leva as linhas
    // por cascade, mas o filtro custa nada e poupa um rebentar mudo).
    .filter((l) => l.comunicados)
    .map((l) => ({
      titulo: l.comunicados.titulo,
      token: l.comunicados.token,
      enviado_em: l.enviado_em,
      no_ar: Boolean(
        l.comunicados.token &&
          l.comunicados.publicado_em &&
          !l.comunicados.retirado_em &&
          (!l.comunicados.expira_em ||
            new Date(l.comunicados.expira_em).getTime() > agora),
      ),
    }));
};

// ---- A imagem da folha ----

const BUCKET_COMUNICADOS = "comunicados";

// A compressão é OBRIGATÓRIA e é a de captacao.js (canvas → JPEG 0.82),
// com o lado maior a 1600px: a folha mostra a imagem à largura da
// página, maior do que as vinhetas de referência (1200) pedem.
// O caminho não leva o id de NADA — o balde é público por URL mas não
// enumerável (080, §5), e um nome adivinhável seria uma porta.
export const subirImagemFolha = async (file) => {
  if (!file) throw new Error("Nenhum ficheiro selecionado.");
  if (!file.type.startsWith("image/")) {
    throw new Error("O ficheiro tem de ser uma imagem.");
  }
  const blob = await comprimirFotoParaJpeg(file, 1600);
  const caminho = `folha_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET_COMUNICADOS)
    .upload(caminho, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET_COMUNICADOS).getPublicUrl(caminho);
  return data.publicUrl;
};

// ---- O texto que sai para o WhatsApp ----

// O primeiro nome, para a saudação («Olá, Maria!»). De um casal
// «Maria & João» sai a Maria — a mensagem vai para UM telefone. De
// «(sem nome)» não sai nada: o resolvedor põe «___» e a Nádia vê logo
// que tem de preencher à mão antes de enviar.
export const primeiroNome = (nome) => {
  const s = (nome || "").trim();
  if (!s || s === SEM_NOME) return null;
  return s.split(/\s+/)[0];
};

// O texto de UMA pessoa: o dela, se foi personalizado; senão a base do
// comunicado com {NOME} e {LINK_FOLHA} resolvidos pelo resolvedor ÚNICO
// da casa (resolverMensagem, mensagens.js) — regra do dono: um
// resolvedor, não dois.
export const textoParaDestinatario = (comunicado, destinatario, endereco) =>
  destinatario.mensagem ??
  resolverMensagem(comunicado.mensagem || "", {
    nomeCliente: primeiroNome(destinatario.nome),
    linkFolha: endereco,
  });

// O texto para DIFUSÃO (lista de transmissão): ninguém tem nome numa
// difusão, por isso «Olá, {NOME}!» encolhe para «Olá!» e um {NOME}
// solto sai — arrumando os espaços que o token deixa para trás. O
// {LINK_FOLHA} resolve-se pelo mesmo resolvedor.
export const textoDifusao = (comunicado, endereco) => {
  const semNome = (comunicado.mensagem || "")
    .replace(/Olá,\s*\{NOME\}\s*([!,.])/g, "Olá$1")
    .split("{NOME}")
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([!?.,;:])/g, "$1");
  return resolverMensagem(semNome, { linkFolha: endereco });
};

// ============================================================
// FASE 3 — os moldes e quem entrou depois (migração 081).
//
// Um molde guarda três coisas: a FOLHA, a MENSAGEM e a REGRA de público
// — nunca os nomes, o endereço ou as leituras. Cada comunicado que nasce
// de um molde é novo, ganha endereço próprio e conta os nomes de novo.
// A história de um molde («Usado 2 vezes · o último em agosto») não se
// guarda: DERIVA-SE dos comunicados com o modelo_id — contador guardado
// é contador que deriva.
// ============================================================

// ---- Modelos: o CRUD e a história derivada ----

// Os moldes todos, cada um com {usos, ultimoUso} derivados. São duas
// idas (moldes + comunicados com modelo_id) agregadas aqui, em vez de
// um contador guardado — a regra da 081.
export const listarModelos = async () => {
  const [moldes, usos] = await Promise.all([
    supabase
      .from("comunicado_modelos")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("comunicados")
      .select("modelo_id, created_at")
      .not("modelo_id", "is", null),
  ]);
  if (moldes.error) throw moldes.error;
  if (usos.error) throw usos.error;

  // count e max(created_at) por modelo_id, no cliente — a lista é curta
  // (uma casa, uma dúzia de moldes) e a BD já deu tudo o que sabe.
  const porModelo = new Map();
  for (const c of usos.data || []) {
    const h = porModelo.get(c.modelo_id) || { usos: 0, ultimoUso: null };
    h.usos += 1;
    if (!h.ultimoUso || c.created_at > h.ultimoUso) h.ultimoUso = c.created_at;
    porModelo.set(c.modelo_id, h);
  }
  return (moldes.data || []).map((m) => ({
    ...m,
    ...(porModelo.get(m.id) || { usos: 0, ultimoUso: null }),
  }));
};

// «abril de 2026» — mês minúsculo, ano sempre (o cartão do molde diz
// QUANDO foi o último uso, e sem o ano «abril» mentiria daqui a um ano).
const mesEAno = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${MESES_ANCORA[d.getMonth()]} de ${d.getFullYear()}`;
};

// A frase da história do cartão. O caso de zero é o mais comum no
// princípio — e diz «guardado», não «nunca usado», porque um molde
// acabado de guardar não falhou nada.
export const historiaDoModelo = (usos, ultimoUso) => {
  if (!usos) return "Guardado, ainda não usado";
  const quando = mesEAno(ultimoUso);
  if (usos === 1) return quando ? `Usado uma vez · ${quando}` : "Usado uma vez";
  return quando
    ? `Usado ${usos} vezes · o último em ${quando}`
    : `Usado ${usos} vezes`;
};

// Atualiza um molde (whitelist — a mesma lição do guardarComunicado).
export const guardarModelo = async (id, campos) => {
  const permitidos = ["nome", "registo", "titulo", "subtitulo", "blocos", "mensagem", "publico"];
  const patch = {};
  for (const k of permitidos) {
    if (k in campos) patch[k] = campos[k];
  }
  if (Object.keys(patch).length === 0) throw new Error("Nada para atualizar.");
  patch.actualizado_em = new Date().toISOString();

  const { data, error } = await supabase
    .from("comunicado_modelos")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Apagar é a sério — a UI já confirmou em duas fases. Os comunicados
// que nasceram deste molde FICAM: o FK é on delete set null, e o que se
// perde é só a contagem de utilizações.
export const apagarModelo = async (id) => {
  const { error } = await supabase.from("comunicado_modelos").delete().eq("id", id);
  if (error) throw error;
};

// ---- De comunicado a molde, e de molde a comunicado ----

// Guarda um comunicado como molde. Os blocos vêm por argumento (não do
// comunicado) porque é o ecrã de guardar que os traz já com as marcas
// de revisão — rever/pergunta decidem-se ao GUARDAR, com o contexto
// todo à frente, não ao usar.
export const guardarComoMolde = async (comunicado, nome, blocos) => {
  const n = (nome || "").trim();
  if (!n) throw new Error("O molde precisa de um nome.");
  const { data, error } = await supabase
    .from("comunicado_modelos")
    .insert([
      {
        nome: n,
        registo: comunicado.registo || "aviso",
        titulo: comunicado.titulo || "",
        subtitulo: comunicado.subtitulo,
        blocos: Array.isArray(blocos) ? blocos : comunicado.blocos || [],
        mensagem: comunicado.mensagem,
        publico: comunicado.publico,
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Um comunicado novo a partir de um molde: a folha e a mensagem TAL E
// QUAL (com rever/pergunta — é no comunicado que a revisão se fecha),
// a regra de público pré-carregada (o ComunicadoRecorte lê
// comunicado.publico para os filtros iniciais), e a proveniência no
// modelo_id. SEM token e SEM congelado_em: publicar e congelar são
// actos deste comunicado, não herança.
//
// Os ids dos blocos MANTÊM-SE (decisão registada): cada comunicado é
// uma cópia independente e os ids só têm de ser únicos DENTRO da folha
// — e mantê-los é o que deixa um bloco marcado no molde ser encontrado
// na folha que nasceu dele.
export const nascerDeMolde = async (modelo) => {
  const { data, error } = await supabase
    .from("comunicados")
    .insert([
      {
        titulo: modelo.titulo || "",
        subtitulo: modelo.subtitulo,
        registo: modelo.registo || "aviso",
        blocos: modelo.blocos || [],
        mensagem: modelo.mensagem,
        publico: modelo.publico,
        modelo_id: modelo.id,
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
};

// «Está certo» fecha a revisão de UM bloco NESTE comunicado: limpa
// rever/pergunta e grava. O molde fica intacto — a marca dele volta a
// aparecer no próximo comunicado que nascer.
export const marcarBlocoRevisto = (comunicadoId, blocos, blocoId) => {
  const limpos = (blocos || []).map((b) => {
    if (b.id !== blocoId) return b;
    // Tirar as chaves em vez de as pôr a false/vazio: um bloco revisto
    // fica IGUAL a um bloco que nunca teve marca.
    const resto = { ...b };
    delete resto.rever;
    delete resto.pergunta;
    return resto;
  });
  return guardarComunicado(comunicadoId, { blocos: limpos });
};

// ---- O que envelhece: a heurística de AJUDA ----

// True se o texto trouxer sinais de data ou prazo — mês por extenso,
// ano, dd/mm, palavras de prazo. Serve para PROPOR a marca de revisão
// ao guardar o molde; nunca decide sozinha (ela confirma, desmarca ou
// acrescenta). Errar por excesso aqui custa um clique; errar por
// defeito custa uma folha com a data do ano passado.
export const detectarEnvelhecimento = (texto) => {
  const t = String(texto || "");
  if (new RegExp(`(^|[^a-zà-ü])(${MESES_ANCORA.join("|")})([^a-zà-ü]|$)`, "i").test(t)) return true;
  if (/\b20\d\d\b/.test(t)) return true;
  if (/\b\d{1,2}\/\d{1,2}\b/.test(t)) return true;
  // «até » com espaço: apanha «até 30 de…» sem disparar em «atéu»
  // (que não existe) nem exigir fronteira ASCII depois do é.
  return /até\s|prazo|marcações|inscrições|reservas/i.test(t);
};

// A pergunta-padrão que acompanha uma marca de revisão — datada de
// AGORA, porque é agora que o molde se guarda. Ela pode reescrevê-la.
export const perguntaProposta = () => {
  const d = new Date();
  return `Vem de ${MESES_ANCORA[d.getMonth()]} de ${d.getFullYear()}. A data ainda serve?`;
};

// ---- Quem entrou depois de a lista fechar ----

// Corre a regra guardada (comunicado.publico) pelos MESMOS selectores
// do recorte e devolve quem NÃO está na lista congelada — os que
// entraram depois. A comparação é por telefone_chave quando houver
// (a identidade da casa desde a 043); sem chave, por submission_id ou
// cliente_id. As dispensadas ESTÃO na lista (é linha, não tabela nova),
// por isso excluem-se sozinhas — não se volta a perguntar.
export const candidatosPosteriores = async (comunicado) => {
  const pub = comunicado.publico;
  // Sem regra guardada não há o que correr — um comunicado congelado
  // antes da fase 2 tardia, ou nunca congelado, não tem «depois».
  if (!pub || !pub.origem) return [];

  const existentes = await listarDestinatarios(comunicado.id);
  const chaves = new Set(existentes.map((d) => d.telefone_chave).filter(Boolean));
  const subs = new Set(existentes.map((d) => d.submission_id).filter(Boolean));
  const clis = new Set(existentes.map((d) => d.cliente_id).filter(Boolean));

  let candidatos;
  if (pub.origem === "eventos") {
    const rows = await seleccionarEventos({
      eventTypeId: pub.event_type_id,
      janela: pub.janela || "todos",
    });
    const [detalhes, tipos] = await Promise.all([completarDetalhes(rows), tiposDeEvento()]);
    candidatos = rows.map((r) => {
      const det = detalhes.get(r.submission_id);
      const tipoNome =
        (r.event_type_id && tipos.get(r.event_type_id)) ||
        (det?.tipoEventoOutro || "").trim() ||
        "Evento";
      return {
        nome: (r.nome || "").trim() || nomeDasRespostas(det) || SEM_NOME,
        // A MESMA âncora do congelamento — o cartão do candidato tem de
        // se ler como as linhas ao lado dele.
        ancora: `${tipoNome} · ${ancoraDeData(r.data_evento) || "sem data marcada"}`,
        telefone: r.telefone,
        telefone_chave: r.telefone_chave,
        submission_id: r.submission_id,
        cliente_id: r.cliente_id,
      };
    });
  } else if (pub.origem === "contactos") {
    const { incluidos } = await seleccionarContactos({ quem: pub.quem || "todos" });
    candidatos = incluidos.map((p) => ({
      nome: p.nome,
      ancora: p.classe,
      telefone: p.telefone,
      telefone_chave: p.telefone_chave,
      submission_id: null,
      cliente_id: p.cliente_id,
    }));
  } else {
    throw new Error(`Origem de recorte inválida: ${pub.origem}`);
  }

  const jaNaLista = (c) =>
    c.telefone_chave
      ? chaves.has(c.telefone_chave)
      : c.submission_id
        ? subs.has(c.submission_id)
        : Boolean(c.cliente_id) && clis.has(c.cliente_id);

  // Deduplicar os candidatos entre si pela mesma regra do congelamento:
  // duas linhas novas com o mesmo telefone são UMA pessoa a perguntar.
  const vistos = new Set();
  const novos = [];
  for (const c of candidatos) {
    if (jaNaLista(c)) continue;
    if (c.telefone_chave) {
      if (vistos.has(c.telefone_chave)) continue;
      vistos.add(c.telefone_chave);
    }
    novos.push(c);
  }
  return novos.sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
};

// A ordem da linha nova: no fim da lista — quem entrou depois não fura
// a fila de expedição que a Nádia já tem na cabeça.
const inserirLinhaPosterior = async (comunicadoId, candidato, extra = {}) => {
  const { data: ultima, error: erroUltima } = await supabase
    .from("comunicado_destinatarios")
    .select("ordem")
    .eq("comunicado_id", comunicadoId)
    .order("ordem", { ascending: false })
    .limit(1);
  if (erroUltima) throw erroUltima;
  const ordem = ultima && ultima.length ? (ultima[0].ordem ?? 0) + 1 : 0;

  const { data, error } = await supabase
    .from("comunicado_destinatarios")
    .insert([
      {
        comunicado_id: comunicadoId,
        submission_id: candidato.submission_id ?? null,
        cliente_id: candidato.cliente_id ?? null,
        nome: candidato.nome,
        ancora: candidato.ancora,
        telefone: candidato.telefone ?? null,
        telefone_chave: candidato.telefone_chave ?? null,
        ordem,
        ...extra,
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Acrescentar: linha normal, no fim. «Acrescentada» não é coluna —
// deriva-se de created_at > congelado_em do comunicado.
export const acrescentarDestinatario = (comunicadoId, candidato) =>
  inserirLinhaPosterior(comunicadoId, candidato);

// Dispensar: a linha grava-se NA MESMA (o instantâneo fica guardado e o
// índice único continua a valer), mas com dispensado_em — não conta
// para nada e não se volta a perguntar por esta pessoa.
export const dispensarCandidato = (comunicadoId, candidato) =>
  inserirLinhaPosterior(comunicadoId, candidato, {
    dispensado_em: new Date().toISOString(),
  });

// «Desfazer» a dispensa limpa a coluna — a letra do brief (o protótipo
// voltava à pergunta; o desvio ficou registado nas decisões). A linha
// passa a contar como acrescentada, derivado do created_at dela.
export const desfazerDispensa = (id) => patchDestinatario(id, { dispensado_em: null });

// ---- O rótulo humano de uma regra de público ----

// O plural de um nome de tipo de evento, para o rótulo. As regras
// comuns chegam para os tipos da casa (Casamento→Casamentos,
// Festinha→Festinhas, Comunhão→Comunhões); um tipo com plural irregular
// em -ão (Pães?) sairia errado — aceita-se, é um rótulo, não um
// documento.
const pluralDeTipo = (nome) => {
  const s = (nome || "").trim();
  if (!s) return "Eventos";
  if (/s$/i.test(s)) return s;
  if (/ão$/i.test(s)) return s.slice(0, -2) + "ões";
  if (/m$/i.test(s)) return s.slice(0, -1) + "ns";
  if (/[rz]$/i.test(s)) return s + "es";
  return s + "s";
};

// A regra de público em UMA linha legível: «Casamentos por vir»,
// «Festinhas — todos», «Todos os contactos», «Só clientes». Recebe os
// tipos do getEventTypes (a lista, não o Map interno) porque é o que os
// ecrãs já têm na mão. Sem tipo conhecido, «Eventos»; sem regra
// nenhuma, null — o cartão decide o que mostra a um comunicado sem
// público.
export const rotuloDaRegra = (publico, tipos) => {
  if (!publico || !publico.origem) return null;
  if (publico.origem === "contactos") {
    if (publico.quem === "clientes") return "Só clientes";
    if (publico.quem === "interessados") return "Só interessados";
    return "Todos os contactos";
  }
  if (publico.origem === "eventos") {
    const tipo = (tipos || []).find((t) => t.id === publico.event_type_id);
    const base = tipo ? pluralDeTipo(tipo.nome) : "Eventos";
    if (publico.janela === "porvir") return `${base} por vir`;
    if (publico.janela === "passados") return `${base} passados`;
    return `${base} — todos`;
  }
  return null;
};
