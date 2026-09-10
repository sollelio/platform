import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { arco, bboxDe, VISTA_PORTUGAL } from "../../../lib/territorioLab/geo";

// ============================================================
// MapaAtlas — o palco WebGL do Atlas Vision Prototype (staging).
//
// UM sistema de rendering (MapLibre GL, sem deck.gl): pontos com halo,
// clusters ao afastar, heatmap, colunas 3D (fill-extrusion sobre
// hexágonos gerados por localidade), arcos núcleo→evento (LineStrings
// curvas com line-gradient) e marcadores DOM arrastáveis para os
// núcleos. As CENAS ligam/desligam camadas; o resto é paint.
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
// hipotético.
const CORES = {
  claro: {
    ouro: "#C9A84C",
    ouroForte: "#A07830",
    prata: "#5E7A8E",
    perigo: "#C0392B",
    halo: "rgba(201,168,76,0.30)",
    aro: "#FFFFFF",
    heat: [
      "rgba(201,168,76,0)",
      "rgba(232,213,163,0.55)",
      "rgba(201,168,76,0.75)",
      "rgba(143,95,34,0.9)",
    ],
  },
  escuro: {
    ouro: "#D9BA67",
    ouroForte: "#E8CF8C",
    prata: "#9FB6C9",
    perigo: "#E0716D",
    halo: "rgba(217,186,103,0.35)",
    aro: "#131109",
    heat: [
      "rgba(217,186,103,0)",
      "rgba(107,90,42,0.55)",
      "rgba(217,186,103,0.8)",
      "rgba(255,240,192,0.95)",
    ],
  },
};

const fc = (features) => ({ type: "FeatureCollection", features });

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

const MapaAtlas = forwardRef(function MapaAtlas(
  {
    tema = "claro",
    eventos = [], // {id, lngLat, localidade, estado, valor, dataEvento, criadoEmTs, kmReal}
    nucleos = [], // {id, nome, lngLat, tipo:'atual'|'simulado', provisorio, arrastavel}
    rede = [], // eventos + {nucleoId, kmEstimado}
    cena = "pontos", // pontos | calor | relevo | rede
    metrica3d = "pedidos", // pedidos | valor
    tempoLimite = null, // ts — só features com criadoEmTs <= tempoLimite
    destaqueIds = null, // Set de ids em destaque (resto esbate)
    interativo = true,
    onPronto,
    onEventoClick,
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
    tema,
    onEventoClick,
    onCliqueMapa,
    onNucleoArrasto,
  };

  // ---------- dados → GeoJSON ----------
  const dadosEventos = () => {
    const { eventos: evs, rede: r, tempoLimite: t, destaqueIds: d } =
      propsRef.current;
    const porId = new Map(r.map((x) => [x.id, x]));
    return fc(
      evs
        .filter((e) => (t == null ? true : e.criadoEmTs <= t))
        .map((e) => ({
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
            dim: d && !d.has(e.id) ? 1 : 0,
          },
        })),
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
    const { eventos: evs, metrica3d: m, tempoLimite: t } = propsRef.current;
    const porLocalidade = new Map();
    for (const e of evs) {
      if (t != null && e.criadoEmTs > t) continue;
      const chave = e.localidade;
      if (!porLocalidade.has(chave))
        porLocalidade.set(chave, { lngLat: e.lngLat, pedidos: 0, valor: 0 });
      const agg = porLocalidade.get(chave);
      agg.pedidos += 1;
      agg.valor += e.valor || 0;
    }
    return fc(
      [...porLocalidade.entries()].map(([chave, a]) => ({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [hexagono(a.lngLat, 2.0)] },
        properties: {
          localidade: chave,
          pedidos: a.pedidos,
          valor: Math.round(a.valor),
          altura:
            m === "valor" ? Math.max(500, a.valor * 1.6) : a.pedidos * 1700,
        },
      })),
    );
  };

  // ---------- camadas ----------
  const montarCamadas = () => {
    const mapa = mapaRef.current;
    const C = CORES[propsRef.current.tema] || CORES.claro;
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
      mapa.addSource("cols", { type: "geojson", data: dadosColunas() });

    const dim = (vivo, morto) => ["case", ["==", ["get", "dim"], 1], morto, vivo];

    // Heatmap — «concentração dos PEDIDOS REGISTADOS» (a legenda di-lo).
    mapa.addLayer({
      id: "l-heat",
      type: "heatmap",
      source: "ev",
      layout: { visibility: "none" },
      paint: {
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 6, 22, 10, 46],
        "heatmap-intensity": 1.1,
        "heatmap-opacity": 0.85,
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

    // Colunas 3D
    mapa.addLayer({
      id: "l-cols",
      type: "fill-extrusion",
      source: "cols",
      layout: { visibility: "none" },
      paint: {
        "fill-extrusion-color": C.ouro,
        "fill-extrusion-opacity": 0.82,
        "fill-extrusion-height": ["get", "altura"],
        "fill-extrusion-base": 0,
      },
    });

    // Arcos núcleo→evento — DUAS camadas (ouro/prata): o line-gradient
    // só aceita valores constantes, nunca ["get"] por feature.
    const arcoLayer = (id, filtroNucleo, cor) => ({
      id,
      type: "line",
      source: "arcos",
      filter: ["==", ["get", "nucleo"], filtroNucleo],
      layout: { visibility: "none", "line-cap": "round" },
      paint: {
        "line-width": ["interpolate", ["linear"], ["get", "km"], 5, 1.4, 90, 3.4],
        "line-opacity": dim(0.9, 0.1),
        "line-gradient": [
          "interpolate",
          ["linear"],
          ["line-progress"],
          0, "rgba(0,0,0,0)",
          0.12, cor,
          0.85, cor,
          1, cor,
        ],
      },
    });
    mapa.addLayer(arcoLayer("l-arcos-a", "a", C.ouro));
    mapa.addLayer(arcoLayer("l-arcos-b", "b", C.prata));

    // Clusters (visão afastada)
    mapa.addLayer({
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
    mapa.addLayer({
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

    // Halo + ponto + anel
    mapa.addLayer({
      id: "l-halo",
      type: "circle",
      source: "ev",
      paint: {
        "circle-radius": 16,
        "circle-color": C.halo,
        "circle-blur": 0.85,
        "circle-opacity": dim(1, 0.08),
      },
    });
    mapa.addLayer({
      id: "l-pt",
      type: "circle",
      source: "ev",
      paint: {
        "circle-radius": [
          "case",
          ["==", ["get", "estado"], "perdido"], 6,
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

    // Interação
    mapa.on("click", "l-pt", (ev) => {
      const f = ev.features?.[0];
      if (f && propsRef.current.onEventoClick)
        propsRef.current.onEventoClick(f.properties, ev.lngLat);
    });
    mapa.on("mouseenter", "l-pt", () => (mapa.getCanvas().style.cursor = "pointer"));
    mapa.on("mouseleave", "l-pt", () => (mapa.getCanvas().style.cursor = ""));
    mapa.on("click", (ev) => {
      if (propsRef.current.onCliqueMapa)
        propsRef.current.onCliqueMapa([ev.lngLat.lng, ev.lngLat.lat], ev);
    });

    aplicarCena();
  };

  const aplicarCena = () => {
    const mapa = mapaRef.current;
    if (!mapa || !mapa.getLayer("l-pt")) return;
    const { cena: c } = propsRef.current;
    const vis = (id, on) =>
      mapa.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    vis("l-heat", c === "calor");
    vis("l-cols", c === "relevo");
    vis("l-arcos-a", c === "rede");
    vis("l-arcos-b", c === "rede");
    const pontos = c === "pontos" || c === "rede";
    vis("l-halo", pontos || c === "calor" ? pontos : false);
    vis("l-pt", pontos);
    vis("l-cluster", c === "pontos");
    vis("l-cluster-n", c === "pontos");
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
        if (n.arrastavel) {
          m.on("drag", () => {
            const p = m.getLngLat();
            propsRef.current.onNucleoArrasto?.(n.id, [p.lng, p.lat], false);
          });
          m.on("dragend", () => {
            const p = m.getLngLat();
            propsRef.current.onNucleoArrasto?.(n.id, [p.lng, p.lat], true);
          });
        }
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
      sincronizarNucleos();
      onPronto?.();
    });
    const marcadores = marcadoresRef.current;
    return () => {
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
  useEffect(() => {
    if (!mapaRef.current || temaRef.current === tema) return;
    temaRef.current = tema;
    const mapa = mapaRef.current;
    for (const [, m] of marcadoresRef.current) m.remove();
    marcadoresRef.current.clear();
    mapa.setStyle(ESTILOS[tema] || ESTILOS.claro);
    mapa.once("style.load", () => {
      montarCamadas();
      sincronizarNucleos();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tema]);

  useEffect(() => {
    if (prontoRef.current) atualizarDados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventos, rede, nucleos, tempoLimite, destaqueIds, metrica3d]);
  useEffect(() => {
    if (prontoRef.current) aplicarCena();
     
  }, [cena]);
  useEffect(() => {
    if (prontoRef.current) sincronizarNucleos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nucleos]);
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
  }));

  return (
    <div
      ref={caixaRef}
      style={{ position: "absolute", inset: 0 }}
      aria-label="Mapa do território (staging)"
    />
  );
});

export default MapaAtlas;
