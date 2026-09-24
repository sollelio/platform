// ============================================================
// configuracao.js — a configuração do PostHog, pura e testável.
//
// Nomes de opções conferidos contra os tipos do SDK instalado
// (@posthog/types, posthog-js 1.434.x) — não de memória.
//
// A regra é CONSERVADORA: o que queremos ver é navegação, cliques,
// fluxo, tempo, fricção e estado da UI — nunca dados de clientes.
//   · replay: TODO o texto mascarado (o backoffice é feito de nomes,
//     telefones e moradas — mascarar «só os sensíveis» esquecia um),
//     todos os inputs mascarados, imagens/vídeo/canvas/iframes
//     bloqueados (fotografias de referência, o mapa), nada de consola
//     nem de rede (os URLs da API levam filtros com dados);
//   · autocapture: sem texto e sem atributos dos elementos (um
//     aria-label «Ficha de <nome>» é PII);
//   · endereços: limpos em TODOS os eventos (before_send), e os
//     eventos de rotas não medidas deitados fora;
//   · sem exceções automáticas (a observabilidade técnica é outra
//     fatia) e sem inquéritos.
// ============================================================

import { limparEnderecos, rotaMedida, urlSegura } from "./privacidade.js";

export const HOST_UE = "https://eu.i.posthog.com";

export const MASCARA = "•••";

const AMBIENTES = ["production", "test", "development"];

// Liga-se? Só com chave, com um ambiente DECLARADO, e nunca «production»
// a partir do servidor de desenvolvimento (npm run dev): uma chave de
// produção esquecida no .env local não pode encher o projecto de
// produção com cliques de ensaio. Desligar à mão: VITE_ANALYTICS_DESLIGADA=true.
export const analyticsLigada = ({ chave, ambiente, emDesenvolvimento, desligada }) => {
  if (!chave || String(desligada) === "true") return false;
  if (!AMBIENTES.includes(ambiente)) return false;
  if (emDesenvolvimento && ambiente === "production") return false;
  return true;
};

export const ambienteDeclarado = (valor) =>
  AMBIENTES.includes(valor) ? valor : "unknown";

export const antesDeEnviar = (evento, caminhoAtual) => {
  if (!evento) return evento;
  if (!rotaMedida(caminhoAtual)) return null;
  // $geoip_disable: o PostHog enriquece cada evento com cidade, código
  // postal e latitude/longitude a partir do IP ANTES de o «Discard client
  // IP» o deitar fora — verificado no projecto TEST real (24/09: 41/41
  // eventos com cidade e CP). Para uma cliente anónima isso é localização
  // aproximada: pede-se ao servidor que não enriqueça, evento a evento.
  const limpo = {
    ...evento,
    properties: { ...limparEnderecos(evento.properties), $geoip_disable: true },
  };
  if (evento.$set) limpo.$set = limparEnderecos(evento.$set);
  if (evento.$set_once) limpo.$set_once = limparEnderecos(evento.$set_once);
  if (limpo.properties?.$set) limpo.properties.$set = limparEnderecos(limpo.properties.$set);
  if (limpo.properties?.$set_once)
    limpo.properties.$set_once = limparEnderecos(limpo.properties.$set_once);
  // Os heatmaps agrupam os pontos por URL numa CHAVE de objecto — que o
  // limparEnderecos (valores) não vê. Mesma limpeza, nas chaves.
  const hm = limpo.properties?.$heatmap_data;
  if (hm && typeof hm === "object") {
    const novo = {};
    for (const [url, pontos] of Object.entries(hm)) {
      const chave = urlSegura(url);
      novo[chave] = [...(novo[chave] || []), ...(Array.isArray(pontos) ? pontos : [])];
    }
    limpo.properties.$heatmap_data = novo;
  }
  return limpo;
};

export const configPostHog = ({
  host = HOST_UE,
  depurar = false,
  lerCaminho = () => "/",
} = {}) => ({
  api_host: host,
  defaults: "2026-08-30",
  person_profiles: "identified_only",
  capture_pageview: "history_change",
  capture_pageleave: true,
  // Autocapture: comportamento, nunca conteúdo.
  autocapture: {
    dom_event_allowlist: ["click", "submit", "change"],
  },
  mask_all_text: true,
  mask_all_element_attributes: true,
  mask_personal_data_properties: true,
  capture_heatmaps: true,
  capture_performance: false,
  capture_exceptions: false,
  disable_surveys: true,
  enable_recording_console_log: false,
  session_recording: {
    maskAllInputs: true,
    maskInputOptions: { password: true },
    maskTextSelector: "*",
    // Máscara de comprimento FIXO: «*********» diria que o telefone tem
    // nove dígitos e o nome quantas letras tem. Sem comprimento, sem pista.
    maskInputFn: () => MASCARA,
    maskTextFn: (texto) => (texto && texto.trim() ? MASCARA : texto),
    blockSelector: "img, video, canvas, iframe, svg image, [data-analytics-bloquear]",
    maskAllElementAttributes: true,
    recordHeaders: false,
    recordBody: false,
    captureCanvas: { recordCanvas: false },
    captureJsonLd: false,
  },
  before_send: (evento) => antesDeEnviar(evento, lerCaminho()),
  debug: !!depurar,
});
