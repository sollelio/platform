// ============================================================
// identidadeCasa.js — as portas por onde a casa se conhece.
//
// A 097 pôs a identidade na tabela `tenants`; a 098 abriu as portas.
// Aqui fica o lado de cá: uma função por porta, cada uma a dizer o
// que tem na mão.
//
// PORQUÊ UMA POR PORTA, e não uma que adivinhe: a página SABE o que
// tem — a PortalPage tem um token de portal, a ComunicadoPage um de
// comunicado. Uma função que aceitasse os três e tentasse por ordem
// seria a mesma "porta que adivinha" que o resto do sistema evita, e
// devolveria a casa errada ao primeiro token que coincidisse por
// acaso.
//
// A identidade NÃO é segredo — são os dados que a casa imprime nas
// folhas que entrega. O que se protege é o contrário: que a casa
// errada apareça. Por isso nenhuma porta adivinha.
//
// A 100 mudou a FORMA da resposta: as portas devolvem {estado, casa} e
// dizem o que sabem, em vez de um objecto ou null. Aqui traduz-se isso
// nas TRÊS respostas que o lado de cá precisa de distinguir.
// ============================================================

import { supabase } from "./supabase";

// ---------- As três respostas ----------
// Duas vêm da base: «conhecida», com a casa dentro, e «desconhecida»,
// que é resposta legítima e não falha — a porta perguntou e não há casa
// nenhuma naquele endereço.
//
// A terceira é nossa: quando a pergunta não chega ao fim, não há
// resposta. Antes da 100 as três chegavam como o mesmo `null` e a
// distinção morria neste ficheiro — e «não há casa» e «não deu para
// perguntar» pedem coisas opostas, porque uma delas apaga a marca.
const SEM_RESPOSTA = { estado: "sem-resposta" };

const pedir = async (rpc, args) => {
  try {
    const { data, error } = await supabase.rpc(rpc, args);
    if (error) throw error;
    if (data?.estado === "conhecida" && data.casa)
      return { estado: "conhecida", casa: data.casa };
    if (data?.estado === "desconhecida") return { estado: "desconhecida" };
    // Um envelope que não se reconhece é uma porta por migrar, não uma
    // casa que não existe. Cai em «sem resposta» de propósito: apagar a
    // marca por causa de uma forma inesperada seria destruir justamente
    // o que se está a tentar proteger.
    console.error(`identidade (${rpc}): resposta de forma inesperada`, data);
    return SEM_RESPOSTA;
  } catch (e) {
    console.error(`identidade (${rpc}):`, e);
    return SEM_RESPOSTA;
  }
};

// Sem chave não se perguntou — e não perguntar não é ouvir «não há
// casa». O formulário aberto sem ?codigo= vive aqui.
const naoPerguntado = () => Promise.resolve(SEM_RESPOSTA);

// O pedido de orçamento — a única porta sem registo de onde deduzir a
// casa. O slug vem do endereço (/interesse/:slug).
export const casaPorSlug = (slug) =>
  slug
    ? pedir("identidade_da_casa_por_slug", { p_slug: slug })
    : naoPerguntado();

// O portal do noivo, a folha de comunicado, a campanha. A 098 aceita
// os três num coalesce; passar por aqui mantém o front honesto sobre
// qual é qual, e prepara o dia em que a 098 se partir em três.
export const casaPorTokenDePortal = (token) =>
  token
    ? pedir("identidade_por_token", { p_token: token })
    : naoPerguntado();

export const casaPorTokenDeComunicado = (token) =>
  token
    ? pedir("identidade_por_token", { p_token: token })
    : naoPerguntado();

export const casaPorTokenDeCampanha = (token) =>
  token
    ? pedir("identidade_por_token", { p_token: token })
    : naoPerguntado();

// O formulário de convite — a casa vem da linha do convite, não do
// prefixo do código (ler o prefixo seria confiar no formato).
export const casaPorCodigo = (codigo) =>
  codigo
    ? pedir("identidade_por_codigo", { p_codigo: codigo })
    : naoPerguntado();

// O backoffice. Aqui há sessão, e a casa vem dela.
export const casaDaSessao = () => pedir("identidade_da_minha_casa", {});
