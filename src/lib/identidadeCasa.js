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
// errada apareça. Por isso todas as portas devolvem null em vez de
// adivinhar, e null é caso normal, não erro.
// ============================================================

import { supabase } from "./supabase";

// Uma falha de rede a carregar a identidade nunca deve derrubar a
// página: quem chama cai na omissão do casa.js, que é a identidade
// de ontem — melhor do que uma folha sem cabeçalho.
const pedir = async (rpc, args) => {
  try {
    const { data, error } = await supabase.rpc(rpc, args);
    if (error) throw error;
    return data || null;
  } catch (e) {
    console.error(`identidade (${rpc}):`, e);
    return null;
  }
};

// O pedido de orçamento — a única porta sem registo de onde deduzir a
// casa. O slug vem do endereço (/interesse/:slug).
export const casaPorSlug = (slug) =>
  slug ? pedir("identidade_da_casa_por_slug", { p_slug: slug }) : Promise.resolve(null);

// O portal do noivo, a folha de comunicado, a campanha. A 098 aceita
// os três num coalesce; passar por aqui mantém o front honesto sobre
// qual é qual, e prepara o dia em que a 098 se partir em três.
export const casaPorTokenDePortal = (token) =>
  token ? pedir("identidade_por_token", { p_token: token }) : Promise.resolve(null);

export const casaPorTokenDeComunicado = (token) =>
  token ? pedir("identidade_por_token", { p_token: token }) : Promise.resolve(null);

export const casaPorTokenDeCampanha = (token) =>
  token ? pedir("identidade_por_token", { p_token: token }) : Promise.resolve(null);

// O formulário de convite — a casa vem da linha do convite, não do
// prefixo do código (ler o prefixo seria confiar no formato).
export const casaPorCodigo = (codigo) =>
  codigo ? pedir("identidade_por_codigo", { p_codigo: codigo }) : Promise.resolve(null);

// O backoffice. Aqui há sessão, e a casa vem dela.
export const casaDaSessao = () => pedir("identidade_da_minha_casa", {});