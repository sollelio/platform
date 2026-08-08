import { supabase } from "./supabase";

// ============================================================
// obterDistancia.js — a ÚNICA porta de entrada para "quantos km é
// esta morada". Chama a Edge Function `obter-distancia`
// (supabase/functions/obter-distancia/index.ts), que por sua vez usa a
// Google Distance Matrix API — a chave e a morada-base vivem em secrets
// do Supabase, nunca aqui nem no bundle do frontend.
//
// Contrato preservado (quem consome isto não muda nada):
//   obterDistancia(morada) => Promise<number> km INTEIROS, ou throw
//   new Error("...") — a Nádia trabalha em km redondos (6,90 → 7;
//   6,4 → 6), e o arredondamento vive aqui, na porta única, para o
//   painel, a consulta e a regra de custo verem todos o mesmo número.
//
// Protecção de quota: cache em memória por morada — o painel do
// orçamento e a consulta rápida do Início partilham esta cache (é o
// mesmo módulo), por isso recalcular a mesma morada duas vezes na
// mesma sessão não dispara uma segunda chamada paga. Só os SUCESSOS
// ficam em cache — uma morada que falhou pode ter sido só um erro de
// digitação, e deve poder tentar-se de novo.
// ============================================================

const cache = new Map(); // morada normalizada -> km

const normalizar = (s) =>
  (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas diacríticas (á, é, ã, ç → a, e, a, c)
    .trim()
    .toLowerCase();

// A Edge Function devolve { erro: "mensagem PT-PT" } no corpo das respostas
// de erro — supabase-js embrulha isso em error.context (a Response crua).
const extrairMensagemErro = async (error) => {
  try {
    const corpo = await error?.context?.json?.();
    if (corpo?.erro) return corpo.erro;
  } catch {
    /* corpo não é JSON — usa a mensagem genérica abaixo */
  }
  return "O serviço de distâncias está indisponível de momento.";
};

// Devolve os km até à morada, ou rejeita com uma mensagem PT-PT amigável.
export const obterDistancia = async (morada) => {
  const chaveCache = normalizar(morada);
  if (!chaveCache) {
    throw new Error("Escreve uma morada para calcular a distância.");
  }
  if (cache.has(chaveCache)) return cache.get(chaveCache);

  const { data, error } = await supabase.functions.invoke("obter-distancia", {
    body: { morada },
  });
  if (error) throw new Error(await extrairMensagemErro(error));
  if (typeof data?.km !== "number") {
    throw new Error("O serviço de distâncias está indisponível de momento.");
  }

  const km = Math.round(data.km);
  cache.set(chaveCache, km);
  return km;
};

// As localidades mais comuns da zona — chips de sugestão do painel do
// orçamento (resolvidas agora pela API real, já não por uma tabela fixa).
export const LOCALIDADES_MOCK = ["Faro", "Loulé", "Albufeira", "Lagos", "Portimão"];
