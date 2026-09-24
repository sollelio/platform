// ============================================================
// nucleo.js — a analytics da casa, sem saber que existe PostHog.
//
// O resto da app só conhece track / identify / reset. Quem fala com o
// fornecedor é um adaptador (posthog.js) com esta forma:
//   { capture(nome, props), identify(id, props), reset() }
//
// Garantias (testadas):
//   · sem fornecedor (sem chave, ambiente errado, falha a carregar) é
//     um no-op silencioso — a analytics nunca parte um ecrã;
//   · um evento fora do catálogo não sai; propriedades fora do esquema
//     também não (lista de permissão — privacidade.js);
//   · nas rotas não medidas (páginas por token) nada sai;
//   · o identify só aceita um uuid — nunca email nem nome;
//   · chamadas feitas antes de o fornecedor carregar esperam numa fila
//     curta e saem pela ordem, depois.
// ============================================================

import { COMUNS, EVENTOS } from "./eventos.js";
import {
  filtrarPropriedades,
  moldeDoCaminho,
  rotaMedida,
  superficieDaRota,
} from "./privacidade.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILA_MAX = 100;

export const criarAnalytics = ({
  carregarFornecedor, // () => Promise<adaptador | null>
  ambiente = "unknown",
  lerContexto = () => ({ caminho: "/", autenticado: false }),
  aoRecusar = null, // (evento, chaves) — só em depuração
} = {}) => {
  let fornecedor = null;
  let morto = false; // decidido que não há fornecedor
  let fila = [];

  const executar = (fn) => {
    if (morto) return;
    if (fornecedor) {
      try {
        fn(fornecedor);
      } catch (e) {
        console.warn("analytics:", e?.message || e);
      }
      return;
    }
    if (fila.length < FILA_MAX) fila.push(fn);
  };

  const pronto = (async () => {
    try {
      fornecedor = carregarFornecedor ? await carregarFornecedor() : null;
    } catch (e) {
      console.warn("analytics: fornecedor indisponível —", e?.message || e);
      fornecedor = null;
    }
    if (!fornecedor) {
      morto = true;
      fila = [];
      return false;
    }
    const pendentes = fila;
    fila = [];
    pendentes.forEach((fn) => executar(fn));
    return true;
  })();

  const comuns = () => {
    const { caminho, autenticado } = lerContexto();
    return {
      environment: ambiente,
      surface: superficieDaRota(caminho),
      route: moldeDoCaminho(caminho),
      authenticated: !!autenticado,
      actor_type: autenticado ? "internal" : "anonymous",
    };
  };

  const track = (evento, props = {}) => {
    const esquema = EVENTOS[evento];
    if (!esquema) {
      aoRecusar?.(evento, ["<evento fora do catálogo>"]);
      return;
    }
    if (!rotaMedida(lerContexto().caminho)) return;
    const proprias = filtrarPropriedades(esquema, props);
    const base = filtrarPropriedades(COMUNS, comuns());
    if (proprias.recusadas.length) aoRecusar?.(evento, proprias.recusadas);
    const final = { ...base.aceites, ...proprias.aceites };
    executar((f) => f.capture(evento, final));
  };

  const identify = (idUtilizador) => {
    if (typeof idUtilizador !== "string" || !UUID.test(idUtilizador)) return;
    // Só propriedades de máquina: nada de email, nome ou telefone.
    executar((f) =>
      f.identify(idUtilizador, { role: "internal", environment: ambiente }),
    );
  };

  const reset = () => executar((f) => f.reset());

  // A navegação mudou: o adaptador decide o que isso implica (o do
  // PostHog pára a gravação ao sair das superfícies medidas).
  // NUNCA vai para a fila: um aviso «saiu das superfícies medidas» dado
  // ANTES de o fornecedor existir (ex.: a visita começa em «/» e só
  // depois chega ao /interesse) seria despejado DEPOIS do arranque e
  // pararia a gravação de uma sessão que já está numa rota medida
  // (apanhado no projecto TEST real, 24/09). O fornecedor só arranca
  // numa rota medida — antes disso não há nada para parar.
  const mudouDeRota = (caminho) => {
    if (!fornecedor || morto) return;
    const medida = rotaMedida(caminho);
    try {
      fornecedor.aoMudarDeRota?.(medida);
    } catch (e) {
      console.warn("analytics:", e?.message || e);
    }
  };

  return { track, identify, reset, mudouDeRota, pronto };
};

// A identidade segue a sessão. Devolve a função a chamar a cada
// mudança de sessão com o uuid (ou null). O mesmo uuid não mexe em
// nada (TOKEN_REFRESHED); quem estava sai SEMPRE primeiro (reset) —
// também quando entra outra pessoa sem passar pelo «Sair», porque
// identificar por cima fundiria as duas pessoas.
export const seguirIdentidade = (alvo) => {
  let atual = null;
  return (quem) => {
    const novo = quem || null;
    if (novo === atual) return;
    if (atual) alvo.reset();
    atual = novo;
    if (novo) alvo.identify(novo);
  };
};
