// ============================================================
// posthog.js — o ÚNICO ficheiro que conhece o PostHog.
//
// Carrega o SDK à preguiça (import dinâmico): quem não tem analytics
// ligada não descarrega nem um byte dele. Devolve o adaptador que o
// núcleo espera — capture / identify / reset — e pára a gravação de
// sessão quando a navegação sai das superfícies medidas.
// Trocar de fornecedor = reescrever este ficheiro, e só este.
// ============================================================

import { configPostHog } from "./configuracao.js";

export const carregarPostHog = async ({ chave, host, depurar, lerCaminho }) => {
  const { default: posthog } = await import("posthog-js");
  posthog.init(chave, configPostHog({ host, depurar, lerCaminho }));
  let gravacaoParada = false;
  return {
    capture: (nome, props) => posthog.capture(nome, props),
    identify: (id, props) => posthog.identify(id, props),
    reset: () => posthog.reset(),
    // Saiu para uma página por token (portal da cliente, etc.)? A
    // gravação pára e não recomeça nesta visita — mais vale perder o
    // resto de uma sessão do que gravar a página de uma cliente.
    aoMudarDeRota: (medida) => {
      if (!medida && !gravacaoParada) {
        posthog.stopSessionRecording();
        gravacaoParada = true;
      }
    },
  };
};
