import { FASE_LABEL } from "./fases";
import { supabase } from "./supabase";

// ============================================================
// notas.js — o histórico de interação de um evento.
//
// Duas origens, uma linha do tempo:
//   • notas ESCRITAS (tabela notas_evento, migração 029) — o que foi
//     dito ao telefone, o que ficou combinado. Cartão na UI.
//   • entradas DERIVADAS — o que a app já sabe (formulário preenchido,
//     sinal registado, documento gerado). Linha fina com bolinha.
//
// As derivadas NÃO se gravam: constroem-se na leitura, aqui, a partir
// das tabelas que já são a fonte de verdade dessas coisas. Assim nunca
// divergem do que aconteceu de facto, e o histórico dos eventos
// antigos aparece todo sem backfill nenhum. Metade do histórico
// escreve-se sozinho — ela só escreve o que foi dito ao telefone.
// ============================================================

// Os quatro tipos que a UI oferece, com as cores da casa. Espelham a
// CHECK da migração 029.
export const TIPOS_NOTA = [
  {
    id: "chamada",
    label: "Chamada",
    cor: "var(--gold-dark)",
    fundo: "#FEF9EC",
    borda: "var(--gold-light)",
  },
  {
    id: "mensagem",
    label: "Mensagem",
    cor: "#166534",
    fundo: "#F0FDF4",
    borda: "#BBF7D0",
  },
  {
    id: "alteracao",
    label: "Alteração",
    cor: "#B45309",
    fundo: "#FEF3E2",
    borda: "#FADCB4",
  },
  {
    id: "interna",
    label: "Nota interna",
    cor: "var(--gray-mid)",
    fundo: "white",
    borda: "#E4DCCB",
  },
];

export const tipoNota = (id) =>
  TIPOS_NOTA.find((t) => t.id === id) || TIPOS_NOTA[3];

// ---------- As notas escritas ----------

export const getNotas = async (submissionId) => {
  if (!submissionId) return [];
  const { data, error } = await supabase
    .from("notas_evento")
    .select("*")
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

// 105 · O autor NÃO se envia. A coluna `autor` (texto) desapareceu e o
// `criado_por` que a substituiu preenche-se sozinho, com o
// `default auth.uid()` — mandá-lo daqui seria deixar o browser dizer
// quem escreveu, que é precisamente o que a coluna existe para não
// permitir. Até aqui o parâmetro viajava sempre a null e o insert
// passou a dar 42703 assim que a migração correu.
export const criarNota = async (submissionId, { tipo, corpo }) => {
  const texto = (corpo || "").trim();
  if (!submissionId) throw new Error("Falta o evento.");
  if (!texto) throw new Error("Escreve alguma coisa antes de guardar.");
  const { data, error } = await supabase
    .from("notas_evento")
    .insert({
      submission_id: submissionId,
      tipo: tipo || "interna",
      corpo: texto,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

// A UI confirma antes de chamar — nunca window.confirm (mesmo padrão
// da remoção de pagamentos).
export const apagarNota = async (notaId) => {
  const { error } = await supabase
    .from("notas_evento")
    .delete()
    .eq("id", notaId);
  if (error) throw error;
};

// ---------- As entradas derivadas ----------

// Os documentos deste evento, só com o que a linha do tempo precisa.
export const getDocumentosDoEvento = async (submissionId) => {
  if (!submissionId) return [];
  const { data, error } = await supabase
    .from("documentos")
    .select("id, tipo, created_at, updated_at")
    .eq("submission_id", submissionId);
  if (error) throw error;
  return data || [];
};

const NOME_DOCUMENTO = {
  orcamento: "Orçamento",
  contrato: "Contrato",
  // chave interna 'proposta'; na UI chama-se "Projecto"
  proposta: "Projecto",
};

const euros = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `${n % 1 === 0 ? n : n.toFixed(2)}€`;
};

// Junta tudo numa linha do tempo, da mais recente para a mais antiga.
// Puro: recebe o que já foi carregado, não vai buscar nada.
export function construirHistorico({
  submissao,
  notas = [],
  pagamentos = [],
  previstos = [],
  documentos = [],
  invites = [],
}) {
  const entradas = [];

  for (const n of notas) {
    entradas.push({
      id: `nota:${n.id}`,
      origem: "nota",
      tipo: n.tipo,
      corpo: n.corpo,
      criadoPor: n.criado_por,
      quando: n.created_at,
      notaId: n.id,
    });
  }

  // O princípio de tudo — o primeiro contacto.
  if (submissao?.created_at) {
    entradas.push({
      id: "sistema:inicio",
      origem: "sistema",
      texto: `${FASE_LABEL.interessado} — primeiro contacto`,
      quando: submissao.created_at,
      inicio: true,
    });
  }

  for (const inv of invites) {
    if (inv.created_at) {
      entradas.push({
        id: `sistema:convite-enviado:${inv.id}`,
        origem: "sistema",
        texto: "Formulário enviado",
        quando: inv.created_at,
      });
    }
    // O convite não guarda quando foi preenchido — só que já está.
    // Sem updated_at na tabela, a entrada assenta na data de envio;
    // é o melhor que há sem inventar uma data plausível mas falsa.
    if (inv.status === "Preenchido" || inv.submission_id) {
      entradas.push({
        id: `sistema:convite-preenchido:${inv.id}`,
        origem: "sistema",
        texto: "Formulário preenchido pela cliente",
        quando: inv.updated_at || inv.created_at,
      });
    }
  }

  for (const p of pagamentos) {
    const previsto = previstos.find((pv) => pv.id === p.previsto_id);
    const rotulo = previsto?.descricao?.startsWith("Sinal")
      ? "Sinal registado"
      : "Pagamento registado";
    entradas.push({
      id: `sistema:pagamento:${p.id}`,
      origem: "sistema",
      texto: rotulo,
      valor: euros(p.valor),
      detalhe: p.metodo || null,
      // `data` é o dia em que o dinheiro entrou; created_at é quando
      // foi registado. Na linha do tempo interessa o primeiro.
      quando: p.data ? `${p.data}T12:00:00` : p.created_at,
    });
  }

  for (const d of documentos) {
    const nome = NOME_DOCUMENTO[d.tipo] || d.tipo;
    entradas.push({
      id: `sistema:doc:${d.id}`,
      origem: "sistema",
      texto: `${nome} gerado`,
      quando: d.created_at,
    });
    // Só conta como alteração se for mesmo mais tarde (a gravação
    // inicial deixa os dois carimbos praticamente iguais).
    const criado = new Date(d.created_at).getTime();
    const alterado = new Date(d.updated_at).getTime();
    if (Number.isFinite(alterado) && alterado - criado > 60 * 1000) {
      entradas.push({
        id: `sistema:doc-alt:${d.id}`,
        origem: "sistema",
        texto: `${nome} actualizado`,
        quando: d.updated_at,
      });
    }
  }

  return entradas
    .filter((e) => e.quando)
    .sort((a, b) => new Date(b.quando) - new Date(a.quando));
}

// As contagens da coluna "Mostrar" — calculadas do histórico já
// construído, para o que se conta ser exactamente o que se vê.
export function contarHistorico(historico) {
  const conta = (f) => historico.filter(f).length;
  return {
    tudo: historico.length,
    chamada: conta((e) => e.origem === "nota" && e.tipo === "chamada"),
    mensagem: conta((e) => e.origem === "nota" && e.tipo === "mensagem"),
    alteracao: conta((e) => e.origem === "nota" && e.tipo === "alteracao"),
    interna: conta((e) => e.origem === "nota" && e.tipo === "interna"),
    percurso: conta((e) => e.origem === "sistema"),
  };
}
