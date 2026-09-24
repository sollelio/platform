// ============================================================
// analytics — a porta única da app para a analytics de produto.
//
//   import { analytics } from "../lib/analytics";
//   analytics.track("request_created", { … });
//
// Nunca `posthog.capture()` espalhado pelos ecrãs: o fornecedor vive
// atrás de lib/analytics/posthog.js, o catálogo em eventos.js, e as
// regras de privacidade em privacidade.js. Ver docs/analytics/.
//
// Liga-se só com VITE_POSTHOG_KEY + VITE_APP_ENV declarado (e nunca
// production a partir do `npm run dev`). Sem isso é um no-op.
// O SDK só se descarrega na PRIMEIRA visita a uma superfície medida
// (/interesse, backoffice) — quem entra por um link de portal nunca
// o carrega.
//
// IDENTIDADE: segue a sessão do Supabase. Entrou → identify(uuid).
// Saiu → reset(), para que a actividade anónima seguinte (o
// /interesse aberto depois) não fique colada a quem saiu. O
// TOKEN_REFRESHED traz o mesmo uuid e não mexe em nada.
// ============================================================

import { supabase } from "../supabase";
import { criarAnalytics, seguirIdentidade } from "./nucleo.js";
import { analyticsLigada, ambienteDeclarado, HOST_UE } from "./configuracao.js";
import { rotaMedida } from "./privacidade.js";

const env = import.meta.env;
const ambiente = ambienteDeclarado(env.VITE_APP_ENV);
const ligada =
  typeof window !== "undefined" &&
  analyticsLigada({
    chave: env.VITE_POSTHOG_KEY,
    ambiente,
    emDesenvolvimento: !!env.DEV,
    desligada: env.VITE_ANALYTICS_DESLIGADA,
  });

let utilizador = null; // uuid da sessão, ou null
const lerCaminho = () =>
  typeof window === "undefined" ? "/" : window.location.pathname;

let arrancar;
const arranque = new Promise((r) => {
  arrancar = r;
});

const nucleo = criarAnalytics({
  ambiente,
  lerContexto: () => ({ caminho: lerCaminho(), autenticado: !!utilizador }),
  carregarFornecedor: async () => {
    if (!ligada) return null;
    await arranque;
    const { carregarPostHog } = await import("./posthog.js");
    return carregarPostHog({
      chave: env.VITE_POSTHOG_KEY,
      host: env.VITE_POSTHOG_HOST || HOST_UE,
      depurar: !!env.DEV,
      lerCaminho,
    });
  },
  aoRecusar: env.DEV
    ? (evento, chaves) =>
        console.warn(`analytics: «${evento}» — propriedades recusadas:`, chaves)
    : null,
});

if (ligada) {
  const seguir = seguirIdentidade(nucleo);
  supabase.auth.onAuthStateChange((_evento, sessao) => {
    utilizador = sessao?.user?.id || null;
    seguir(utilizador);
  });
}

export const analytics = {
  track: nucleo.track,
  // A navegação mudou (chamado pelo RastreioDeRota, dentro do router).
  rota: (caminho) => {
    if (rotaMedida(caminho)) arrancar();
    nucleo.mudouDeRota(caminho);
  },
  ligada,
};
