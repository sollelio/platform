import { supabase } from "./supabase";

// ============================================================
// questionarioPortal.js — o questionário visto do lado da cliente.
//
// Ficheiro à parte do `portal.js` de propósito: aquele trata do evento e
// dos documentos, este trata das respostas. São duas conversas diferentes
// com a mesma pessoa, e misturá-las num ficheiro só tornava difícil ver
// qual das duas é que está a escrever no quê.
//
// ⚠ A REGRA DE SEMPRE (063): tudo passa por RPC com projecção explícita.
// Nunca acrescentar campos do lado de cá — se falta alguma coisa, é a
// migração que muda. É SQL, não JavaScript: o que não sai do servidor não
// se inspecciona no browser.
//
// ⚠ E A INVARIANTE: o id interno do evento nunca chega aqui. Se algum dia
// aparecer num objecto destes, é bug grave na RPC, não conveniência.
// ============================================================

// Tudo o que o ecrã precisa: os passos do modelo, as respostas actuais, a
// autoria de cada uma, o prazo de cada grupo e os pedidos em aberto.
//
// `mostrar: false` quer dizer que este modelo não tem questionário que
// chegue (menos de 5 campos) — e aí o portal não fala do assunto de todo.
export const verQuestionario = async (token) => {
  const { data, error } = await supabase.rpc("dlm_portal_questionario", {
    p_token: token,
  });
  if (error) throw error;
  return data;
};

// Grava UM campo. É assim, e não tudo no fim, porque é o que a página
// promete à cliente desde a fase 1: «fica guardado à medida que escreve».
//
// O valor vai como JSON — um texto é `"assim"`, um número é `12`, uma
// escolha múltipla é um array. Quem chama passa o valor cru; a serialização
// é do supabase-js.
export const responder = async (token, campoId, valor) => {
  const { data, error } = await supabase.rpc("dlm_portal_responder", {
    p_token: token,
    p_campo: campoId,
    p_valor: valor ?? null,
  });
  if (error) throw error;
  return data;
};

// O CARIMBO DE ENTREGA NÃO SE PEDE DAQUI. Havia aqui uma função para isso e
// nunca foi chamada por ecrã nenhum — resultado: a cliente respondia a tudo
// e a pendência continuava a pedir, para sempre.
//
// Agora é o próprio `responder` que fecha o questionário quando não falta
// nada obrigatório (069). Sem botão de submeter, porque o desenho fez de
// responder e rever o mesmo ecrã.

// Passado o prazo do grupo, alterar deixa de mudar o valor e passa a pedir.
// Não é recusa: é o mesmo caminho com outra porta.
export const pedirAlteracaoCampo = async (token, campoId, pedido) => {
  const { data, error } = await supabase.rpc("dlm_portal_pedir_alteracao_campo", {
    p_token: token,
    p_campo: campoId,
    p_pedido: pedido,
  });
  if (error) throw error;
  return data;
};

// ---------- Contas que o ecrã faz, e que não valem uma ida ao servidor ----------

// Um passo está respondido quando todos os campos obrigatórios têm valor —
// e, se não houver obrigatórios nenhuns, quando todos têm.
//
// Isto não é «completo» no sentido administrativo: nenhum dos casamentos
// tem os cinco passos inteiros (36 de 44 campos), e isso é o estado normal,
// não um defeito. O ecrã usa-o só para dizer onde ela ficou.
export const passoRespondido = (passo) => {
  const campos = passo?.campos || [];
  if (campos.length === 0) return false;
  const temValor = (c) =>
    c.valor !== null && c.valor !== undefined && c.valor !== "" &&
    !(Array.isArray(c.valor) && c.valor.length === 0);
  const obrigatorios = campos.filter((c) => c.obrigatorio);
  return obrigatorios.length > 0
    ? obrigatorios.every(temValor)
    : campos.every(temValor);
};

// Onde ela ficou: o primeiro passo por responder. Se estiverem todos
// respondidos, devolve null — não há «onde ficou», há revisão.
export const passoOndeFicou = (passos) =>
  (passos || []).find((p) => !passoRespondido(p)) || null;

// «seis perguntas» — a contagem por extenso do ecrã do convite. Acima de
// doze escreve-se o número, que é onde o por extenso deixa de ajudar a ler.
const EXTENSO = ["nenhuma", "uma", "duas", "três", "quatro", "cinco", "seis",
  "sete", "oito", "nove", "dez", "onze", "doze"];

export const contagemPorExtenso = (n) => {
  const q = Number(n) || 0;
  const palavra = q <= 12 ? EXTENSO[q] : String(q);
  return `${palavra} ${q === 1 ? "pergunta" : "perguntas"}`;
};

// O prazo dito à maneira da casa: a data por extenso e o que falta. Devolve
// null quando não há prazo nenhum — e nessa altura o ecrã não fala de
// prazos, em vez de dizer «sem prazo».
export const diasAte = (isoData) => {
  if (!isoData) return null;
  const [a, m, d] = String(isoData).slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return null;
  const alvo = Date.UTC(a, m - 1, d);
  const hoje = new Date();
  const hojeUTC = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo - hojeUTC) / 86400000);
};

// «Ficou nas cores e as flores.» — o título do ecrã da retoma.
//
// Não se adivinha a contracção: DERIVA-SE do artigo com que o próprio
// título começa, que é como os modelos os escrevem («O dia e as horas»,
// «A mesa e os lugares», «As cores e as flores», «Os acessos ao espaço»).
// Artigo conhecido → contracção certa, sempre:
//
//   O   -> no     A   -> na
//   Os  -> nos    As  -> nas
//
// Se o título NÃO começar por artigo — a Nádia escreve os modelos como
// quiser —, devolve-se null e o ecrã usa uma frase que não nomeia o sítio.
// Mais vale não nomear do que nomear em português torto.
const ARTIGOS = { o: "no", a: "na", os: "nos", as: "nas" };

// «na paleta», «no texto da placa» — a mesma tabela, para quando o que
// falta é a preposição e não o sítio. Estava escrita uma segunda vez dentro
// da vista, e duas tabelas do mesmo português divergem à primeira mão que
// lhes toque.

export const ondeFicouPorExtenso = (titulo) => {
  const t = String(titulo || "").trim();
  const espaco = t.indexOf(" ");
  if (espaco < 1) return null;
  const contraccao = ARTIGOS[t.slice(0, espaco).toLowerCase()];
  if (!contraccao) return null;
  return `${contraccao} ${t.slice(espaco + 1)}`;
};

export const emDe = (rotulo) => {
  const t = String(rotulo || "").trim();
  const espaco = t.indexOf(" ");
  const contraccao = espaco > 0 ? ARTIGOS[t.slice(0, espaco).toLowerCase()] : null;
  // A MEIO DE UMA FRASE vai tudo em minúscula («mudar na paleta»); no
  // TÍTULO preserva-se a caixa do modelo («Ficou nas Cores e as Flores»).
  // É a única coisa que separa esta da `ondeFicouPorExtenso`, e foi por
  // isso que alguém escreveu a segunda em vez de reutilizar a primeira.
  return contraccao
    ? `${contraccao} ${t.slice(espaco + 1).toLowerCase()}`
    : `em ${t.toLowerCase()}`;
};
