import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import * as maplibregl from "maplibre-gl";
// O worker do MapLibre resolve-se por omissão como um ficheiro
// IRMÃO do módulo (new URL("./maplibre-gl-worker.mjs", import.meta.url))
// — existe em dev, mas o build NÃO o emite e o mapa fica em branco em
// staging (canvas vazio, 'load' nunca dispara). O `?worker&url` do
// Vite embrulha o worker AUTOCONTIDO (o `?url` simples não chega: o
// ficheiro importa "./maplibre-gl-shared.mjs", que o build também não
// emitiria) e o setWorkerUrl aponta-lhe explicitamente, dev e build.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { arco, bboxDe, VISTA_PORTUGAL } from "../../../lib/territorioLab/geo";

maplibregl.setWorkerUrl(workerUrl);

// ============================================================
// MapaAtlas — o palco WebGL do Atlas.
//
// UM sistema de rendering (MapLibre GL, sem deck.gl — decisão
// reavaliada nesta ronda: com 16 eventos, tudo o que a experiência
// pede anima-se por paint properties num único requestAnimationFrame;
// a dependência extra não paga o que traria): pontos com halo,
// clusters, heatmap, colunas 3D, arcos núcleo→evento e marcadores DOM
// arrastáveis.
//
// A NOVIDADE desta ronda é o MOVIMENTO COM SIGNIFICADO:
//   · as cenas TRANSITAM (crossfade + extrusão progressiva + câmara),
//     nunca «layer off → layer on»;
//   · a rede DESENHA-SE do núcleo para fora (draw-on por
//     line-gradient) e um brilho lento percorre os arcos — a
//     deslocação sente-se sem partículas;
//   · a reorganização é visível: esconderArcos → ondular →
//     apresentarRede, orquestrado pelo TerritorioLab;
//   · destaque tem pulso; o arrasto tem a divisa simulada.
// Tudo num só rAF, limpo no unmount; prefers-reduced-motion salta
// para o estado final de cada animação.
//
// Tiles: OpenFreeMap (positron/dark — sem chave, uso comercial ok).
// Precisão dos pontos: LOCALIDADE (centróides curados) — nunca uma
// morada; o próprio mapa nunca recebe PII.
// ============================================================

const ESTILOS = {
  claro: "https://tiles.openfreemap.org/styles/positron",
  escuro: "https://tiles.openfreemap.org/styles/dark",
};

// Paleta por tema — literais de propósito (o WebGL não lê tokens CSS);
// os valores são os da casa (ouro #C9A84C/#D9BA67) + a prata do
// hipotético. `fluxo` é a banda de brilho que percorre os arcos.
const CORES = {
  claro: {
    ouro: "#C9A84C",
    ouroForte: "#A07830",
    fluxo: "#E6D3A0",
    prata: "#5E7A8E",
    fluxoPrata: "#9FB6C9",
    perigo: "#C0392B",
    halo: "rgba(201,168,76,0.30)",
    aro: "#FFFFFF",
    brilhoArcos: 0.14,
    heat: [
      "rgba(201,168,76,0)",
      "rgba(232,213,163,0.55)",
      "rgba(201,168,76,0.75)",
      "rgba(143,95,34,0.9)",
    ],
  },
  escuro: {
    ouro: "#D9BA67",
    ouroForte: "#F0DFAC",
    fluxo: "#FFF3CE",
    prata: "#9FB6C9",
    fluxoPrata: "#D3E2EE",
    perigo: "#E0716D",
    halo: "rgba(217,186,103,0.38)",
    aro: "#131109",
    brilhoArcos: 0.4,
    heat: [
      "rgba(217,186,103,0)",
      "rgba(96,78,32,0.5)",
      "rgba(217,186,103,0.82)",
      "rgba(255,240,192,0.96)",
    ],
  },
};

const fc = (features) => ({ type: "FeatureCollection", features });
const FC_VAZIA = fc([]);

// Hexágono geográfico (~raioKm) centrado em lngLat — a base das colunas 3D.
const hexagono = (lngLat, raioKm) => {
  const [lng, lat] = lngLat;
  const dLat = raioKm / 111;
  const dLng = raioKm / (111 * Math.cos((lat * Math.PI) / 180));
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    pts.push([lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat]);
  }
  return pts;
};

// ---------- easing + gradientes ----------
const suave = (p) => 1 - Math.pow(1 - p, 3); // easeOutCubic
const dentroFora = (p) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

const hexRgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// Paragens estritamente crescentes em [0,1] — o interpolate exige-o.
const paragens = (pares) => {
  const saida = [];
  let ultima = -1;
  for (const [pos, cor] of pares) {
    let p = Math.min(1, Math.max(0, pos));
    if (p <= ultima) p = ultima + 0.0006;
    if (p > 1) continue;
    saida.push(p, cor);
    ultima = p;
  }
  return saida.length >= 4 ? saida : [0, pares[0][1], 1, pares[pares.length - 1][1]];
};
const gradiente = (pares) => [
  "interpolate",
  ["linear"],
  ["line-progress"],
  ...paragens(pares),
];

// O gradiente dos arcos em três humores: cabeça (draw-on, mostra só
// [0..h] com a ponta a desvanecer), banda (o brilho a percorrer) e
// pleno (o estado estável de sempre).
const gradArco = (cor, { cabeca = null, banda = null, corBanda } = {}) => {
  const trans = hexRgba(cor, 0);
  if (cabeca != null) {
    const h = Math.max(0, Math.min(1, cabeca));
    if (h <= 0.02) return gradiente([[0, trans], [1, trans]]);
    return gradiente([
      [0, trans],
      [Math.min(0.1, h * 0.4), cor],
      [Math.max(0.11, h - 0.03), cor],
      [h, trans],
      [1, trans],
    ]);
  }
  if (banda != null) {
    const c = 0.14 + banda * 0.84; // a banda viaja do núcleo para fora
    return gradiente([
      [0, trans],
      [0.12, cor],
      [c - 0.11, cor],
      [c, corBanda],
      [c + 0.11, cor],
      [1, cor],
    ]);
  }
  return gradiente([[0, trans], [0.12, cor], [1, cor]]);
};

// Fatores de opacidade de cada grupo de camadas, por cena.
const FATORES_POR_CENA = {
  pontos: { pontos: 1, cluster: 1, heat: 0, cols: 0, arcos: 0 },
  calor: { pontos: 0, cluster: 0, heat: 1, cols: 0, arcos: 0 },
  relevo: { pontos: 0, cluster: 0, heat: 0, cols: 1, arcos: 0 },
  rede: { pontos: 1, cluster: 0, heat: 0, cols: 0, arcos: 1 },
};

const MapaAtlas = forwardRef(function MapaAtlas(
  {
    tema = "claro",
    eventos = [], // {id, lngLat, localidade, rotulo, estado, valor, dataEvento, criadoEmTs, kmReal}
    nucleos = [], // {id, nome, lngLat, tipo:'atual'|'simulado', provisorio, arrastavel}
    rede = [], // eventos + {nucleoId, kmEstimado}
    cena = "pontos", // pontos | calor | relevo | rede
    metrica3d = "pedidos", // pedidos | valor
    tempoLimite = null, // ts — só features com criadoEmTs <= tempoLimite
    destaqueIds = null, // Set de ids em destaque (resto esbate)
    divisa = null, // [[lng,lat],[lng,lat]] | null — a mediatriz simulada
    interativo = true,
    reduzMotion = false,
    onPronto,
    onEventoClick,
    onEventoHover, // (id|null) — só na cena da rede
    onColunaClick, // ({rotulo, pedidos, valor}) na cena relevo
    onCliqueMapa,
    onNucleoArrasto, // (id, lngLat, final)
  },
  ref,
) {
  const caixaRef = useRef(null);
  const mapaRef = useRef(null);
  const prontoRef = useRef(false);
  const marcadoresRef = useRef(new Map()); // nucleoId -> Marker
  const propsRef = useRef({});
  propsRef.current = {
    eventos,
    nucleos,
    rede,
    cena,
    metrica3d,
    tempoLimite,
    destaqueIds,
    divisa,
    tema,
    reduzMotion,
    onEventoClick,
    onEventoHover,
    onColunaClick,
    onCliqueMapa,
    onNucleoArrasto,
  };

  // ---------- o motor de animação (um só rAF) ----------
  const animsRef = useRef(new Map());
  const rafRef = useRef(null);
  const fatoresRef = useRef({ pontos: 1, cluster: 1, heat: 0, cols: 0, arcos: 0 });
  const alturaRef = useRef({ fator: 0, metrica: 0 }); // metrica: 0=pedidos 1=valor
  const cabecaRef = useRef(1); // progresso do draw-on dos arcos
  const hoverRef = useRef(null);

  const passoAnims = (agora) => {
    for (const [nome, a] of animsRef.current) {
      const bruto = a.loop
        ? ((agora - a.t0) % a.dur) / a.dur
        : Math.min(1, (agora - a.t0) / a.dur);
      try {
        a.onFrame(a.ease ? a.ease(bruto) : bruto);
      } catch {
        /* a camada pode ter sido desmontada a meio (troca de tema) */
      }
      if (!a.loop && bruto >= 1) {
        animsRef.current.delete(nome);
        a.onDone?.();
      }
    }
    rafRef.current = animsRef.current.size
      ? requestAnimationFrame(passoAnims)
      : null;
  };
  // Matar uma animação RESOLVE a sua promessa (onDone) — uma
  // coreografia em await nunca pode ficar pendurada para sempre; os
  // guards de sequência a jusante decidem se continua.
  const pararAnim = (nome) => {
    const a = animsRef.current.get(nome);
    if (!a) return;
    animsRef.current.delete(nome);
    if (!a.loop) a.onDone?.();
  };
  const pararTodas = () => {
    const pendentes = [...animsRef.current.values()];
    animsRef.current.clear();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    for (const a of pendentes) if (!a.loop) a.onDone?.();
  };
  const animar = (nome, { dur, ease = suave, loop = false, onFrame, onDone }) => {
    // Depois do unmount (mapa removido), nada se anima — mas quem
    // espera uma promessa (animarP) tem de a ver resolvida, senão a
    // coreografia a meio fica pendurada para sempre.
    if (!mapaRef.current) {
      onDone?.();
      return;
    }
    if (propsRef.current.reduzMotion && !loop) {
      try {
        onFrame(1);
      } catch {
        /* idem */
      }
      onDone?.();
      return;
    }
    if (propsRef.current.reduzMotion && loop) return; // sem brilho em loop
    pararAnim(nome); // substituir também RESOLVE a promessa antiga
    animsRef.current.set(nome, { t0: performance.now(), dur, ease, loop, onFrame, onDone });
    if (!rafRef.current) rafRef.current = requestAnimationFrame(passoAnims);
  };
  const animarP = (nome, opts) =>
    new Promise((resolve) => animar(nome, { ...opts, onDone: resolve }));

  const setPaint = (id, prop, v) => {
    const m = mapaRef.current;
    if (m && m.getLayer(id)) m.setPaintProperty(id, prop, v);
  };
  const setVis = (id, on) => {
    const m = mapaRef.current;
    if (m && m.getLayer(id))
      m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  };
  // Animações por frame não convivem com as transições implícitas do
  // MapLibre (300 ms por omissão) — desligam-se nas props animadas.
  const semTransicao = (id, props) => {
    for (const p of props) setPaint(id, `${p}-transition`, { duration: 0 });
  };

  const dim = (vivo, morto) => ["case", ["==", ["get", "dim"], 1], morto, vivo];

  // ---------- aplicação dos fatores (opacidade por grupo) ----------
  const aplicarFator = (grupo, f) => {
    fatoresRef.current[grupo] = f;
    const C = CORES[propsRef.current.tema] || CORES.claro;
    if (grupo === "heat") setPaint("l-heat", "heatmap-opacity", 0.85 * f);
    else if (grupo === "cols") {
      setPaint("l-cols", "fill-extrusion-opacity", 0.82 * f);
      setPaint("l-cols-rotulo", "text-opacity", f);
      setPaint("l-cols-rotulo", "text-halo-blur", 0.5);
    } else if (grupo === "pontos") {
      setPaint("l-halo", "circle-opacity", dim(1 * f, 0.08 * f));
      setPaint("l-pt", "circle-opacity", dim(f, 0.15 * f));
      setPaint("l-pt", "circle-stroke-opacity", dim(f, 0.15 * f));
    } else if (grupo === "cluster") {
      setPaint("l-cluster", "circle-opacity", 0.9 * f);
      setPaint("l-cluster", "circle-stroke-opacity", f);
      setPaint("l-cluster-n", "text-opacity", f);
    } else if (grupo === "arcos") {
      setPaint("l-arcos-a", "line-opacity", dim(0.9 * f, 0.1 * f));
      setPaint("l-arcos-b", "line-opacity", dim(0.9 * f, 0.1 * f));
      setPaint("l-arcos-glow-a", "line-opacity", C.brilhoArcos * f);
      setPaint("l-arcos-glow-b", "line-opacity", C.brilhoArcos * f);
    }
  };

  const aplicarAltura = () => {
    const { fator, metrica } = alturaRef.current;
    setPaint("l-cols", "fill-extrusion-height", [
      "*",
      fator,
      [
        "+",
        ["*", ["get", "alturaPedidos"], 1 - metrica],
        ["*", ["get", "alturaValor"], metrica],
      ],
    ]);
  };

  const aplicarGradientes = ({ cabeca = null, banda = null } = {}) => {
    const C = CORES[propsRef.current.tema] || CORES.claro;
    setPaint("l-arcos-a", "line-gradient", gradArco(C.ouro, { cabeca, banda, corBanda: C.fluxo }));
    setPaint("l-arcos-b", "line-gradient", gradArco(C.prata, { cabeca, banda, corBanda: C.fluxoPrata }));
    setPaint("l-arcos-glow-a", "line-gradient", gradArco(C.ouro, { cabeca }));
    setPaint("l-arcos-glow-b", "line-gradient", gradArco(C.prata, { cabeca }));
  };

  // O brilho lento que percorre os arcos — a deslocação sente-se.
  const arrancarFluxo = () => {
    pararAnim("fluxo");
    animar("fluxo", {
      dur: 3200,
      loop: true,
      ease: null,
      onFrame: (p) => {
        if (fatoresRef.current.arcos > 0.05 && cabecaRef.current >= 1)
          aplicarGradientes({ banda: dentroFora(p) });
      },
    });
  };

  // ---------- dados → GeoJSON ----------
  const dadosEventos = () => {
    const { eventos: evs, rede: r, tempoLimite: t, destaqueIds: d, cena: c } =
      propsRef.current;
    const porId = new Map(r.map((x) => [x.id, x]));
    // «nascimento»: no Tempo, quem chegou há pouco (na janela da
    // cabeça de leitura) acende maior — vê-se a frente a avançar.
    const ts = evs.map((e) => e.criadoEmTs);
    const janela = ts.length ? (Math.max(...ts) - Math.min(...ts)) * 0.08 : 0;
    return fc(
      evs
        .filter((e) => (t == null ? true : e.criadoEmTs <= t))
        .map((e) => {
          const foraDaRede = c === "rede" && !porId.has(e.id);
          const recente =
            t != null && t - e.criadoEmTs < janela ? 1 : 0;
          return {
            type: "Feature",
            id: e.id,
            geometry: { type: "Point", coordinates: e.lngLat },
            properties: {
              id: e.id,
              localidade: e.rotulo,
              estado: e.estado,
              valor: e.valor ?? 0,
              data: e.dataEvento || "",
              nucleo: porId.get(e.id)?.nucleoId || "atual",
              km: porId.get(e.id)?.kmEstimado ?? 0,
              kmReal: e.kmReal ?? 0,
              recente,
              dim: d ? (d.has(e.id) ? 0 : 1) : foraDaRede ? 1 : 0,
            },
          };
        }),
    );
  };

  const dadosArcos = () => {
    const { nucleos: ns, rede: r, tempoLimite: t, destaqueIds: d } =
      propsRef.current;
    const porNucleo = new Map(ns.map((n) => [n.id, n]));
    return fc(
      r
        .filter((e) => (t == null ? true : e.criadoEmTs <= t))
        .map((e) => {
          const n = porNucleo.get(e.nucleoId);
          if (!n) return null;
          return {
            type: "Feature",
            id: `arc-${e.id}`,
            geometry: {
              type: "LineString",
              coordinates: arco(n.lngLat, e.lngLat),
            },
            properties: {
              nucleo: n.tipo === "simulado" ? "b" : "a",
              km: e.kmEstimado,
              dim: d && !d.has(e.id) ? 1 : 0,
            },
          };
        })
        .filter(Boolean),
    );
  };

  const dadosColunas = () => {
    const { eventos: evs, tempoLimite: t } = propsRef.current;
    const porLocalidade = new Map();
    for (const e of evs) {
      if (t != null && e.criadoEmTs > t) continue;
      const chave = e.localidade;
      if (!porLocalidade.has(chave))
        porLocalidade.set(chave, {
          lngLat: e.lngLat,
          rotulo: e.rotulo,
          pedidos: 0,
          valor: 0,
        });
      const agg = porLocalidade.get(chave);
      agg.pedidos += 1;
      agg.valor += e.valor || 0;
    }
    return fc(
      [...porLocalidade.entries()].map(([chave, a]) => ({
        type: "Feature",
        id: chave,
        geometry: { type: "Polygon", coordinates: [hexagono(a.lngLat, 1.6)] },
        properties: {
          chave,
          rotulo: a.rotulo,
          pedidos: a.pedidos,
          valor: Math.round(a.valor),
          alturaPedidos: a.pedidos * 1700,
          alturaValor: Math.max(500, a.valor * 1.6),
        },
      })),
    );
  };

  const dadosDivisa = () => {
    const { divisa: dv } = propsRef.current;
    if (!dv) return FC_VAZIA;
    return fc([
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates: dv },
        properties: {},
      },
    ]);
  };

  // ---------- camadas ----------
  const montarCamadas = () => {
    const mapa = mapaRef.current;
    const C = CORES[propsRef.current.tema] || CORES.claro;
    // guarda idempotente: dois style.load seguidos (toggle rápido de
    // tema) não podem tentar criar a mesma camada duas vezes
    const addCamada = (def) => {
      if (!mapa.getLayer(def.id)) mapa.addLayer(def);
    };
    if (!mapa.getSource("ev"))
      mapa.addSource("ev", { type: "geojson", data: dadosEventos(), promoteId: "id" });
    if (!mapa.getSource("ev-cluster"))
      mapa.addSource("ev-cluster", {
        type: "geojson",
        data: dadosEventos(),
        cluster: true,
        clusterRadius: 46,
        clusterMaxZoom: 8,
      });
    if (!mapa.getSource("arcos"))
      mapa.addSource("arcos", { type: "geojson", data: dadosArcos(), lineMetrics: true });
    if (!mapa.getSource("cols"))
      mapa.addSource("cols", { type: "geojson", data: dadosColunas(), promoteId: "chave" });
    if (!mapa.getSource("fx-onda"))
      mapa.addSource("fx-onda", { type: "geojson", data: FC_VAZIA });
    if (!mapa.getSource("fx-divisa"))
      mapa.addSource("fx-divisa", { type: "geojson", data: dadosDivisa() });

    // Luz de viewport — dá volume às extrusões sem teatralidade.
    mapa.setLight({ anchor: "viewport", position: [1.2, 120, 40], intensity: 0.35 });

    // Heatmap — «concentração dos PEDIDOS REGISTADOS» (a legenda di-lo).
    addCamada({
      id: "l-heat",
      type: "heatmap",
      source: "ev",
      layout: { visibility: "none" },
      paint: {
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 6, 22, 10, 46],
        "heatmap-intensity": 1.1,
        "heatmap-opacity": 0,
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0, C.heat[0],
          0.25, C.heat[1],
          0.6, C.heat[2],
          1, C.heat[3],
        ],
      },
    });

    // Colunas 3D — altura = UMA métrica de cada vez (o morph anima-se).
    addCamada({
      id: "l-cols",
      type: "fill-extrusion",
      source: "cols",
      layout: { visibility: "none" },
      paint: {
        "fill-extrusion-color": [
          "case",
          ["boolean", ["feature-state", "sel"], false],
          C.ouroForte,
          C.ouro,
        ],
        "fill-extrusion-opacity": 0,
        "fill-extrusion-height": 0,
        "fill-extrusion-base": 0,
        "fill-extrusion-vertical-gradient": true,
      },
    });
    addCamada({
      id: "l-cols-rotulo",
      type: "symbol",
      source: "cols",
      layout: {
        visibility: "none",
        "text-field": [
          "format",
          ["get", "rotulo"],
          {},
          "\n",
          {},
          [
            "case",
            ["==", ["get", "pedidos"], 1],
            "1 pedido",
            ["concat", ["to-string", ["get", "pedidos"]], " pedidos"],
          ],
          { "font-scale": 0.82 },
        ],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-offset": [0, 1.6],
        "text-anchor": "top",
      },
      paint: {
        "text-color": propsRef.current.tema === "escuro" ? "#EDE3C8" : "#5B5442",
        "text-halo-color": propsRef.current.tema === "escuro" ? "#131109" : "#FFFFFF",
        "text-halo-width": 1.2,
        "text-opacity": 0,
      },
    });

    // A divisa simulada entre núcleos (só durante o arrasto).
    addCamada({
      id: "l-divisa",
      type: "line",
      source: "fx-divisa",
      layout: { "line-cap": "round" },
      paint: {
        "line-color": C.prata,
        "line-width": 1.4,
        "line-dasharray": [2.2, 2.6],
        "line-opacity": 0,
      },
    });
    addCamada({
      id: "l-divisa-rotulo",
      type: "symbol",
      source: "fx-divisa",
      layout: {
        "symbol-placement": "line",
        "text-field": "distribuição simulada dos eventos",
        "text-font": ["Noto Sans Regular"],
        "text-size": 10,
        "symbol-spacing": 520,
      },
      paint: {
        "text-color": C.prata,
        "text-halo-color": propsRef.current.tema === "escuro" ? "#131109" : "#FFFFFF",
        "text-halo-width": 1,
        "text-opacity": 0,
      },
    });

    // Arcos núcleo→evento — DUAS famílias (ouro/prata) porque o
    // line-gradient só aceita valores constantes, nunca ["get"]; cada
    // família tem um GLOW por baixo (a profundidade, sobretudo no
    // escuro) e a principal por cima.
    const arcoLayer = (id, filtroNucleo, cor, glow) => ({
      id,
      type: "line",
      source: "arcos",
      filter: ["==", ["get", "nucleo"], filtroNucleo],
      layout: { visibility: "none", "line-cap": "round" },
      paint: {
        "line-width": glow
          ? ["interpolate", ["linear"], ["get", "km"], 5, 4.2, 90, 9]
          : ["interpolate", ["linear"], ["get", "km"], 5, 1.4, 90, 3.4],
        ...(glow ? { "line-blur": 6 } : {}),
        "line-opacity": 0,
        "line-gradient": gradArco(cor),
      },
    });
    addCamada(arcoLayer("l-arcos-glow-a", "a", C.ouro, true));
    addCamada(arcoLayer("l-arcos-glow-b", "b", C.prata, true));
    addCamada(arcoLayer("l-arcos-a", "a", C.ouro, false));
    addCamada(arcoLayer("l-arcos-b", "b", C.prata, false));

    // Clusters (visão afastada)
    addCamada({
      id: "l-cluster",
      type: "circle",
      source: "ev-cluster",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": C.ouro,
        "circle-opacity": 0.9,
        "circle-radius": ["step", ["get", "point_count"], 14, 5, 18, 10, 23],
        "circle-stroke-width": 2,
        "circle-stroke-color": C.aro,
      },
    });
    addCamada({
      id: "l-cluster-n",
      type: "symbol",
      source: "ev-cluster",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 12,
      },
      paint: { "text-color": C.aro },
    });

    // Halo + pulso de destaque + ponto
    addCamada({
      id: "l-halo",
      type: "circle",
      source: "ev",
      paint: {
        "circle-radius": ["case", ["==", ["get", "recente"], 1], 23, 16],
        "circle-color": C.halo,
        "circle-blur": 0.85,
        "circle-opacity": dim(1, 0.08),
      },
    });
    addCamada({
      id: "l-pulso",
      type: "circle",
      source: "ev",
      filter: ["==", ["get", "id"], "__nada__"],
      paint: {
        "circle-radius": 10,
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": C.ouroForte,
        "circle-stroke-width": 2,
        "circle-stroke-opacity": 0,
      },
    });
    addCamada({
      id: "l-pt",
      type: "circle",
      source: "ev",
      paint: {
        "circle-radius": [
          "case",
          ["==", ["get", "estado"], "perdido"], 6,
          ["==", ["get", "recente"], 1], 9,
          7.5,
        ],
        "circle-color": [
          "case",
          ["==", ["get", "estado"], "perdido"], C.perigo,
          ["==", ["get", "estado"], "conversa"],
          propsRef.current.tema === "escuro" ? "#1D1A12" : "#FFFFFF",
          ["==", ["get", "nucleo"], "b"], C.prata,
          C.ouro,
        ],
        "circle-stroke-width": [
          "case",
          ["==", ["get", "estado"], "conversa"], 2,
          1.5,
        ],
        "circle-stroke-color": [
          "case",
          ["==", ["get", "estado"], "conversa"],
          ["case", ["==", ["get", "nucleo"], "b"], C.prata, C.ouro],
          C.aro,
        ],
        "circle-opacity": dim(1, 0.15),
        "circle-stroke-opacity": dim(1, 0.15),
      },
    });

    // A onda da criação de um núcleo (anel a expandir, uma vez).
    addCamada({
      id: "l-onda",
      type: "circle",
      source: "fx-onda",
      paint: {
        "circle-radius": 0,
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": C.prata,
        "circle-stroke-width": 2.5,
        "circle-stroke-opacity": 0,
      },
    });

    // As animações por frame pedem transições implícitas a zero.
    semTransicao("l-heat", ["heatmap-opacity"]);
    semTransicao("l-cols", ["fill-extrusion-opacity", "fill-extrusion-height"]);
    semTransicao("l-cols-rotulo", ["text-opacity"]);
    for (const id of ["l-arcos-a", "l-arcos-b", "l-arcos-glow-a", "l-arcos-glow-b"])
      semTransicao(id, ["line-opacity"]);
    for (const id of ["l-halo", "l-pt", "l-cluster", "l-pulso", "l-onda"])
      semTransicao(id, ["circle-opacity", "circle-stroke-opacity", "circle-radius"]);
    semTransicao("l-cluster-n", ["text-opacity"]);
    semTransicao("l-divisa", ["line-opacity"]);
    semTransicao("l-divisa-rotulo", ["text-opacity"]);

    aplicarCena(null);
  };
  const selColRef = useRef(null);

  // Os listeners do Map SOBREVIVEM ao setStyle — registam-se UMA vez
  // no load inicial (registá-los em montarCamadas duplicava-os a cada
  // troca de tema: cliques multiplicados, chamadas Edge duplicadas).
  const montarInteracao = () => {
    const mapa = mapaRef.current;
    mapa.on("click", "l-pt", (ev) => {
      const f = ev.features?.[0];
      if (f && propsRef.current.onEventoClick)
        propsRef.current.onEventoClick(f.properties, ev.lngLat);
    });
    mapa.on("click", "l-cols", (ev) => {
      const f = ev.features?.[0];
      if (!f) return;
      const anterior = selColRef.current;
      if (anterior != null)
        mapa.setFeatureState({ source: "cols", id: anterior }, { sel: false });
      selColRef.current = f.id;
      mapa.setFeatureState({ source: "cols", id: f.id }, { sel: true });
      propsRef.current.onColunaClick?.(f.properties);
    });
    const cursor = (on) => () => (mapa.getCanvas().style.cursor = on ? "pointer" : "");
    mapa.on("mouseenter", "l-pt", cursor(true));
    mapa.on("mouseleave", "l-pt", cursor(false));
    mapa.on("mouseenter", "l-cols", cursor(true));
    mapa.on("mouseleave", "l-cols", cursor(false));
    // Hover na rede: a ligação relevante ganha protagonismo.
    mapa.on("mousemove", "l-pt", (ev) => {
      const id = ev.features?.[0]?.id ?? null;
      if (id !== hoverRef.current) {
        hoverRef.current = id;
        if (propsRef.current.cena === "rede")
          propsRef.current.onEventoHover?.(id);
      }
    });
    mapa.on("mouseleave", "l-pt", () => {
      if (hoverRef.current != null) {
        hoverRef.current = null;
        propsRef.current.onEventoHover?.(null);
      }
    });
    mapa.on("click", (ev) => {
      // um clique numa camada interativa não é um clique no mapa
      const camadas = ["l-pt", "l-cols"].filter((l) => mapa.getLayer(l));
      const hits = camadas.length
        ? mapa.queryRenderedFeatures(ev.point, { layers: camadas })
        : [];
      if (hits.length) return;
      if (selColRef.current != null) {
        mapa.setFeatureState({ source: "cols", id: selColRef.current }, { sel: false });
        selColRef.current = null;
      }
      if (propsRef.current.onCliqueMapa)
        propsRef.current.onCliqueMapa([ev.lngLat.lng, ev.lngLat.lat], ev);
    });
  };

  // ---------- cenas com TRANSIÇÃO (nunca «off→on») ----------
  const cenaRef = useRef(null);
  const aplicarCena = (anterior) => {
    const mapa = mapaRef.current;
    if (!mapa || !mapa.getLayer("l-pt")) return;
    const { cena: c } = propsRef.current;
    const alvo = FATORES_POR_CENA[c] || FATORES_POR_CENA.pontos;
    const primeira = anterior == null;

    for (const grupo of Object.keys(alvo)) {
      const de = primeira ? 0 : fatoresRef.current[grupo] ?? 0;
      const para = alvo[grupo];
      const camadas = {
        heat: ["l-heat"],
        cols: ["l-cols", "l-cols-rotulo"],
        pontos: ["l-halo", "l-pt"],
        cluster: ["l-cluster", "l-cluster-n"],
        arcos: ["l-arcos-glow-a", "l-arcos-glow-b", "l-arcos-a", "l-arcos-b"],
      }[grupo];
      if (de === para) {
        // sem mudança: aplica-se JÁ, sem anim pendente — um fade 0→0
        // com esconder adiado apagava a rede a meio do draw-on inicial
        if (primeira) {
          aplicarFator(grupo, para);
          camadas.forEach((id) => setVis(id, para > 0));
        }
        continue;
      }
      if (para > 0) camadas.forEach((id) => setVis(id, true));

      if (grupo === "arcos" && para > 0 && de === 0) {
        // a rede DESENHA-SE — o fade simples não conta a história
        aplicarFator("arcos", 1);
        apresentarRede();
        continue;
      }
      if (grupo === "cols") {
        // extrusão progressiva: sobe ao entrar, recolhe ao sair
        pararAnim("altura");
        const hDe = alturaRef.current.fator;
        const hPara = para;
        animar("altura", {
          dur: para > 0 ? 950 : 480,
          ease: para > 0 ? suave : dentroFora,
          onFrame: (p) => {
            alturaRef.current.fator = hDe + (hPara - hDe) * p;
            aplicarAltura();
            aplicarFator("cols", (de + (para - de) * p) * 1);
          },
          onDone: () => {
            if (para === 0) camadas.forEach((id) => setVis(id, false));
          },
        });
        continue;
      }
      pararAnim(`fade-${grupo}`);
      animar(`fade-${grupo}`, {
        dur: para > 0 ? 620 : 430,
        onFrame: (p) => aplicarFator(grupo, de + (para - de) * p),
        onDone: () => {
          if (para === 0) camadas.forEach((id) => setVis(id, false));
        },
      });
    }
    if (c !== "rede") {
      pararAnim("fluxo");
      pararAnim("draw-rede"); // senão o onDone dele re-arrancava o fluxo
    }
    cenaRef.current = c;
  };

  // A rede desenha-se do núcleo para fora; o ouro parte primeiro, a
  // prata (o hipotético) chega um passo depois. Devolve uma promessa.
  const apresentarRede = (dur = 1150) => {
    pararAnim("fade-arcos"); // um esconder pendente não pode ganhar
    cabecaRef.current = 0;
    ["l-arcos-glow-a", "l-arcos-glow-b", "l-arcos-a", "l-arcos-b"].forEach((id) =>
      setVis(id, true),
    );
    aplicarFator("arcos", 1);
    return animarP("draw-rede", {
      dur,
      ease: dentroFora,
      onFrame: (p) => {
        cabecaRef.current = p;
        const C = CORES[propsRef.current.tema] || CORES.claro;
        const pa = Math.min(1, p * 1.15);
        const pb = Math.max(0, Math.min(1, p * 1.15 - 0.12));
        setPaint("l-arcos-a", "line-gradient", gradArco(C.ouro, { cabeca: pa }));
        setPaint("l-arcos-glow-a", "line-gradient", gradArco(C.ouro, { cabeca: pa }));
        setPaint("l-arcos-b", "line-gradient", gradArco(C.prata, { cabeca: pb }));
        setPaint("l-arcos-glow-b", "line-gradient", gradArco(C.prata, { cabeca: pb }));
      },
      onDone: () => {
        cabecaRef.current = 1;
        aplicarGradientes({});
        // só arranca o brilho se AINDA estamos na rede — um draw-on
        // cancelado por troca de cena não pode deixar o loop vivo
        if (propsRef.current.cena === "rede") arrancarFluxo();
      },
    });
  };

  const esconderArcos = (dur = 320) => {
    pararAnim("fluxo");
    pararAnim("draw-rede");
    const de = fatoresRef.current.arcos;
    return animarP("fade-arcos", {
      dur,
      onFrame: (p) => aplicarFator("arcos", de * (1 - p)),
    });
  };

  // A onda da criação: dois anéis, o segundo mais tímido.
  const ondular = (lngLat) => {
    const mapa = mapaRef.current;
    if (!mapa || !mapa.getSource("fx-onda")) return;
    mapa.getSource("fx-onda").setData(
      fc([{ type: "Feature", geometry: { type: "Point", coordinates: lngLat }, properties: {} }]),
    );
    animar("onda", {
      dur: 900,
      onFrame: (p) => {
        setPaint("l-onda", "circle-radius", 6 + 96 * p);
        setPaint("l-onda", "circle-stroke-opacity", 0.55 * (1 - p));
      },
      onDone: () =>
        animar("onda2", {
          dur: 650,
          onFrame: (p) => {
            setPaint("l-onda", "circle-radius", 4 + 52 * p);
            setPaint("l-onda", "circle-stroke-opacity", 0.32 * (1 - p));
          },
        }),
    });
  };

  // Pulso de destaque: um anel a abrir nos registos que a frase cita.
  const pulsar = (ids) => {
    const mapa = mapaRef.current;
    if (!mapa || !mapa.getLayer("l-pulso") || !ids?.length) return;
    mapa.setFilter("l-pulso", ["in", ["get", "id"], ["literal", ids]]);
    animar("pulso", {
      dur: 780,
      onFrame: (p) => {
        setPaint("l-pulso", "circle-radius", 10 + 22 * p);
        setPaint("l-pulso", "circle-stroke-opacity", 0.8 * (1 - p));
      },
      onDone: () => mapa.getLayer("l-pulso") && mapa.setFilter("l-pulso", ["==", ["get", "id"], "__nada__"]),
    });
  };

  // O marcador do núcleo acena (história / destaque de entrada).
  const acenarNucleo = (id) => {
    const m = marcadoresRef.current.get(id);
    const el = m?.getElement();
    if (!el) return;
    el.classList.remove("al-acena");
    void el.offsetWidth; // reinicia a animação CSS
    el.classList.add("al-acena");
  };

  const atualizarDados = () => {
    const mapa = mapaRef.current;
    if (!mapa || !mapa.getSource("ev")) return;
    mapa.getSource("ev").setData(dadosEventos());
    mapa.getSource("ev-cluster").setData(dadosEventos());
    mapa.getSource("arcos").setData(dadosArcos());
    mapa.getSource("cols").setData(dadosColunas());
  };

  // ---------- marcadores dos núcleos ----------
  const elementoNucleo = (n) => {
    const C = CORES[propsRef.current.tema] || CORES.claro;
    const cor = n.tipo === "simulado" ? C.prata : C.ouro;
    const el = document.createElement("div");
    el.className = n.tipo === "simulado" ? "al-marcador al-nasce" : "al-marcador";
    el.style.cssText = `position:relative;width:30px;height:30px;transform:rotate(45deg);
      background:${cor};border:2.5px solid ${C.aro};border-radius:7px;
      box-shadow:0 0 0 6px ${n.tipo === "simulado" ? "rgba(159,182,201,0.28)" : C.halo}, 0 6px 16px rgba(0,0,0,0.35);
      cursor:${n.arrastavel ? "grab" : "default"};`;
    const miolo = document.createElement("div");
    miolo.style.cssText = `position:absolute;inset:7px;border-radius:4px;
      border:1.5px solid ${C.aro};opacity:.9;`;
    el.appendChild(miolo);
    el.title = n.nome;
    return el;
  };

  const sincronizarNucleos = () => {
    const mapa = mapaRef.current;
    const { nucleos: ns } = propsRef.current;
    const vivos = new Set(ns.map((n) => n.id));
    for (const [id, m] of marcadoresRef.current) {
      if (!vivos.has(id)) {
        m.remove();
        marcadoresRef.current.delete(id);
      }
    }
    for (const n of ns) {
      let m = marcadoresRef.current.get(n.id);
      if (!m) {
        m = new maplibregl.Marker({
          element: elementoNucleo(n),
          draggable: !!n.arrastavel,
        })
          .setLngLat(n.lngLat)
          .addTo(mapa);
        // os handlers ligam-se SEMPRE (com draggable=false não
        // disparam) — é o setDraggable abaixo que abre e fecha o
        // gesto quando «Arrastar para o local real…» liga/desliga
        m.on("drag", () => {
          const p = m.getLngLat();
          propsRef.current.onNucleoArrasto?.(n.id, [p.lng, p.lat], false);
        });
        m.on("dragend", () => {
          const p = m.getLngLat();
          propsRef.current.onNucleoArrasto?.(n.id, [p.lng, p.lat], true);
        });
        marcadoresRef.current.set(n.id, m);
      } else {
        // não interromper um drag em curso
        const atual = m.getLngLat();
        if (
          Math.abs(atual.lng - n.lngLat[0]) > 1e-9 ||
          Math.abs(atual.lat - n.lngLat[1]) > 1e-9
        ) {
          m.setLngLat(n.lngLat);
        }
      }
      if (m.isDraggable() !== !!n.arrastavel) m.setDraggable(!!n.arrastavel);
      const el = m.getElement();
      if (el) el.style.cursor = n.arrastavel ? "grab" : "default";
    }
  };

  // ---------- ciclo de vida ----------
  useEffect(() => {
    const mapa = new maplibregl.Map({
      container: caixaRef.current,
      style: ESTILOS[tema] || ESTILOS.claro,
      center: VISTA_PORTUGAL.center,
      zoom: VISTA_PORTUGAL.zoom,
      pitch: 0,
      attributionControl: { compact: true },
    });
    mapaRef.current = mapa;
    mapa.on("load", () => {
      prontoRef.current = true;
      montarCamadas();
      montarInteracao(); // uma única vez — sobrevive às trocas de tema
      sincronizarNucleos();
      onPronto?.();
    });
    const marcadores = marcadoresRef.current;
    return () => {
      pararTodas();
      for (const [, m] of marcadores) m.remove();
      marcadores.clear();
      mapa.remove();
      mapaRef.current = null;
      prontoRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // tema → troca de estilo + remontagem das camadas e marcadores
  const temaRef = useRef(tema);
  const restyleRef = useRef(null); // handler pendente (toggle rápido)
  useEffect(() => {
    if (!mapaRef.current || temaRef.current === tema) return;
    temaRef.current = tema;
    const mapa = mapaRef.current;
    pararTodas();
    for (const [, m] of marcadoresRef.current) m.remove();
    marcadoresRef.current.clear();
    selColRef.current = null;
    // um toggle rápido não pode deixar DOIS once('style.load') vivos
    if (restyleRef.current) mapa.off("style.load", restyleRef.current);
    const aoEstilo = () => {
      restyleRef.current = null;
      montarCamadas();
      sincronizarNucleos();
    };
    restyleRef.current = aoEstilo;
    mapa.setStyle(ESTILOS[tema] || ESTILOS.claro);
    mapa.once("style.load", aoEstilo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tema]);

  useEffect(() => {
    if (prontoRef.current) atualizarDados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventos, rede, nucleos, tempoLimite, destaqueIds, metrica3d]);

  // metrica3d → morph suave entre alturas (pedidos ↔ valor)
  const metricaRef = useRef(metrica3d);
  useEffect(() => {
    if (!prontoRef.current || metricaRef.current === metrica3d) return;
    metricaRef.current = metrica3d;
    const de = alturaRef.current.metrica;
    const para = metrica3d === "valor" ? 1 : 0;
    pararAnim("metrica");
    animar("metrica", {
      dur: 750,
      ease: dentroFora,
      onFrame: (p) => {
        alturaRef.current.metrica = de + (para - de) * p;
        aplicarAltura();
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrica3d]);

  useEffect(() => {
    if (prontoRef.current) {
      const anterior = cenaRef.current;
      aplicarCena(anterior);
      atualizarDados(); // o esbatimento fora-da-rede depende da cena
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cena]);

  useEffect(() => {
    if (prontoRef.current) sincronizarNucleos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nucleos]);

  // divisa (aparece/some com fade curto)
  const divisaRef = useRef(false);
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!prontoRef.current || !mapa?.getSource("fx-divisa")) return;
    mapa.getSource("fx-divisa").setData(dadosDivisa());
    const tem = !!divisa;
    if (tem !== divisaRef.current) {
      divisaRef.current = tem;
      pararAnim("divisa");
      const de = tem ? 0 : 0.3;
      const para = tem ? 0.3 : 0;
      animar("divisa", {
        dur: 260,
        onFrame: (p) => {
          setPaint("l-divisa", "line-opacity", de + (para - de) * p);
          setPaint("l-divisa-rotulo", "text-opacity", (de + (para - de) * p) * 2.2);
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisa]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    const handler = interativo ? "enable" : "disable";
    ["scrollZoom", "dragPan", "dragRotate", "keyboard", "doubleClickZoom"].forEach(
      (h) => mapa[h]?.[handler](),
    );
  }, [interativo]);

  useImperativeHandle(ref, () => ({
    mapa: () => mapaRef.current,
    voarPara: (opcoes) => mapaRef.current?.easeTo(opcoes),
    enquadrar: (pontos, opcoes = {}) => {
      if (!pontos.length) return;
      mapaRef.current?.fitBounds(bboxDe(pontos), {
        // padding assimétrico: o trilho narrativo vive à esquerda.
        padding: { top: 90, right: 90, bottom: 150, left: 360 },
        maxZoom: 9.8,
        duration: 1100,
        ...opcoes,
      });
    },
    saltarPara: (opcoes) => mapaRef.current?.jumpTo(opcoes),
    redimensionar: () => mapaRef.current?.resize(),
    apresentarRede,
    esconderArcos,
    ondular,
    pulsar,
    acenarNucleo,
  }));

  return (
    <div
      ref={caixaRef}
      style={{ position: "absolute", inset: 0 }}
      aria-label="Mapa do território"
    />
  );
});

export default MapaAtlas;
