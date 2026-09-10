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

const cache = new Map(); // morada normalizada -> { km, duracaoMin|null }

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

// Devolve { km, duracaoMin } até à morada, ou rejeita com uma mensagem
// PT-PT amigável. `duracaoMin` (minutos de viagem POR TROÇO, inteiros)
// chega da mesma resposta paga da Distance Matrix — até ao R1 (109) era
// simplesmente descartada na Edge Function. Pode vir null enquanto a
// Edge Function antiga estiver no ar (o deploy é do Hélio): quem
// consome trata null como «sem duração», nunca como zero.
export const obterDeslocacao = async (morada) => {
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

  const resultado = {
    km: Math.round(data.km),
    duracaoMin:
      typeof data.duracaoMin === "number" ? Math.round(data.duracaoMin) : null,
  };
  cache.set(chaveCache, resultado);
  return resultado;
};

// O contrato histórico — km inteiros e mais nada. Continua a ser a
// porta de quem só quer o número; partilha a cache com a de cima.
export const obterDistancia = async (morada) =>
  (await obterDeslocacao(morada)).km;
