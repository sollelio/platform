// ============================================================
// errosDaCasa.js — os code-words da casa, ditos por extenso.
//
// A 108 pôs guardas no servidor que PARAM em vez de mentirem:
// `tenant_actual()` com duas memberships levanta `CASA_AMBIGUA`, o
// `captacao_submeter` com o slug de outra casa levanta `CASA_ERRADA`.
// São palavras para a MÁQUINA — e chegavam ao ecrã como estavam.
//
// O caminho que elas fazem, verificado: um default de coluna que
// rebenta aborta o INSERT; o PostgREST devolve `message` (o code-word)
// e `hint` (a frase); o supabase-js entrega os dois em `error`; as
// libs fazem `throw error`; e cada ecrã mostrava ou a SUA frase
// genérica de gravação — que engolia o porquê — ou o code-word cru
// entre parênteses, que era pior: «CASA_AMBIGUA» não é português.
//
// Por isso um sítio só. Acrescentar um code-word é acrescentar uma
// linha aqui.
//
// ── COMO SE USA ─────────────────────────────────────────────
//
// Devolve `null` quando o erro NÃO é da casa, para se encaixar à
// frente da cadeia que cada ecrã já tinha, sem lhe mexer:
//
//   setErro(traduzirErroDaCasa(e) || e.message || "Não foi possível…");
//   setErro(traduzirErroDaCasa(e) || "Não foi possível criar…");
//
// O `e.message` do meio fica onde estava de propósito: muitas vezes já
// é uma frase legível que a `lib/` compôs a traduzir uma constraint
// (23503/23514 pelo NOME — ver invariantes). Engoli-la para pôr uma
// genérica no lugar seria uma perda.
// ============================================================

// ---------- As frases (Hélio, 16/08/2026) ----------
// Todas dizem, quando é verdade, que NÃO SE GRAVOU NADA. É a primeira
// coisa que a Nádia precisa de saber: se tem de repetir o gesto. O
// sintoma antigo — a frase genérica de gravação — deixava-a sem saber
// se o pedido tinha ficado a meio.
const FRASES = {
  CASA_AMBIGUA:
    "Esta sessão tem mais do que uma casa, e este gesto não diz de qual é. Abra o endereço da casa certa e repita — não se gravou nada.",
  CASA_ERRADA:
    "Este endereço não é de nenhuma das suas casas, por isso não se gravou nada.",
  CASA_DESCONHECIDA:
    "Não foi possível saber a que casa pertence este pedido, por isso não se gravou nada.",
  NOME_OBRIGATORIO: "Falta o nome. Sem ele o pedido não pode ser registado.",
};

// Um code-word é uma palavra de máquina: MAIÚSCULAS, underscores, sem
// espaços. É o que distingue `CASA_AMBIGUA` de «duplicate key value
// violates unique constraint…» e das frases que a `lib/` já compõe.
//
// O teste é sobre a FORMA e não sobre a lista, de propósito: um
// code-word novo que o servidor ganhe amanhã e que ninguém se lembre
// de acrescentar aqui em baixo tem de cair na rede na mesma. A lista
// diz quais é que sabemos dizer melhor; a forma diz quais é que nunca
// podem chegar ao ecrã como estão.
const PARECE_CODE_WORD = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/;

// O último recurso. Não promete que nada se gravou — de um code-word
// que não conhecemos não sabemos isso — mas também não deixa passar a
// palavra da máquina.
const RECUSA_SEM_EXPLICACAO =
  "O servidor recusou este pedido. Recarregue a página e tente novamente.";

// A frase da casa para este erro, ou null se o erro não for da casa.
//
// Ordem: a nossa frase, o `hint` do servidor (que a 108 pôs de
// propósito nas excepções, para a razão viajar até aos ecrãs que não
// traduzem), e só depois a recusa sem explicação.
export const traduzirErroDaCasa = (erro) => {
  const codigo = String(erro?.message || "").trim();
  if (!PARECE_CODE_WORD.test(codigo)) return null;

  if (FRASES[codigo]) return FRASES[codigo];

  const hint = String(erro?.hint || "").trim();
  if (hint) return hint;

  // Chega aqui um code-word que ninguém previu e que veio sem hint. A
  // pessoa recebe uma frase; nós ficamos com a palavra na consola, que
  // é onde ela serve para alguma coisa.
  console.error("errosDaCasa: code-word por traduzir:", codigo, erro);
  return RECUSA_SEM_EXPLICACAO;
};
