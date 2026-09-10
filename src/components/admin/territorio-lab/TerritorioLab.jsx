import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import MapaAtlas from "./MapaAtlas";
import { FOTOGRAFIA, KM_REAIS, META_FOTOGRAFIA } from "../../../lib/territorioLab/fotografia";
import {
  pontoDaLocalidade,
  atribuirRede,
  metricasRede,
  compararRedes,
  localidadeMaisProxima,
  lerNucleoGuardado,
  guardarNucleo,
  NUCLEO_PROVISORIO,
  COORDS_LOCALIDADE,
  FATOR_ESTRADA,
} from "../../../lib/territorioLab/geo";
import { gerarAtlas, dataCurta } from "../../../lib/territorio/motor";
import { FASES_POS_SINAL } from "../../../lib/fases";
import { temaEfectivo, assinarTema } from "../../../lib/tema";
import { formatarEuros } from "../orcamentos/orcamentoConfig";

// ============================================================
// TerritorioLab — o «Atlas Vision Prototype» (SÓ STAGING).
//
// Uma experiência de visão de futuro sobre o Atlas da Casa: a
// fotografia real dos pedidos registados, no mapa, com três lentes
// (Procura · Operações · Infraestrutura), cenas (pontos, calor,
// relevo 3D, tempo), entrada cinematográfica, e o grande momento —
// «e se operássemos também daqui?» com um núcleo simulado arrastável.
//
// Fronteira: montado apenas quando VITE_APP_ENV ∈ {development, test}
// (a guarda vive no TerritorioTab). Nada disto vai para produção;
// nada escreve na base de dados (o núcleo definido fica no
// localStorage do browser).
// ============================================================

const EASE = [0.22, 1, 0.36, 1];

const LENTES = [
  { id: "procura", rotulo: "Procura" },
  { id: "operacoes", rotulo: "Operações" },
  { id: "infraestrutura", rotulo: "Infraestrutura" },
];

const CENAS_POR_LENTE = {
  procura: [
    { id: "pontos", rotulo: "Pontos" },
    { id: "calor", rotulo: "Calor" },
    { id: "relevo", rotulo: "Relevo 3D" },
    { id: "tempo", rotulo: "Tempo" },
  ],
  operacoes: [{ id: "rede", rotulo: "Rede" }],
  infraestrutura: [{ id: "rede", rotulo: "Núcleos" }],
};

const CENARIOS_RAPIDOS = ["almada", "amadora", "sintra", "setubal", "torres vedras"];

const capitalizar = (s) =>
  s
    .split(" ")
    .map((p) => (p.length > 2 ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(" ");

export default function TerritorioLab() {
  const tema = useSyncExternalStore(assinarTema, temaEfectivo);
  const reduzMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // ---------- dados (a fotografia, geocodificada por localidade) ----------
  const { eventosGeo, foraDoMapa, tsMin, tsMax } = useMemo(() => {
    const geo = [];
    let fora = 0;
    for (const r of FOTOGRAFIA) {
      const texto = r.local_evento || r.respostas?.localEvento || "";
      const p = pontoDaLocalidade(texto);
      if (!p) {
        fora += 1;
        continue;
      }
      const realizado = r.status === "Concluído";
      const garantido = FASES_POS_SINAL.includes(r.fase) && !realizado;
      geo.push({
        id: r.id,
        lngLat: p.lngLat,
        localidade: p.chave,
        rotulo: capitalizar(p.chave),
        estado: r.fase === "perdido" ? "perdido" : realizado ? "realizado" : garantido ? "garantido" : "conversa",
        valor: r.valor_acordado == null ? null : Number(r.valor_acordado),
        dataEvento: r.data_evento,
        criadoEmTs: new Date(r.created_at).getTime(),
        kmReal: KM_REAIS[r.id]?.km ?? null,
      });
    }
    const ts = geo.map((e) => e.criadoEmTs);
    return {
      eventosGeo: geo,
      foraDoMapa: fora,
      tsMin: Math.min(...ts),
      tsMax: Math.max(...ts),
    };
  }, []);

  // ---------- frases (o motor do Lote A, intacto) ----------
  const frases = useMemo(() => {
    const deslocacoes = Object.entries(KM_REAIS).map(([id, k]) => ({
      submissionId: id,
      distanciaKm: k.km,
      duracaoMin: null,
      nTrocos: 2,
      isento: k.oferecida,
      valor: k.oferecida ? 0 : Math.max(0, (k.km - 5) * 1),
    }));
    return gerarAtlas(FOTOGRAFIA, { deslocacoes, hoje: new Date() });
  }, []);

  // ---------- núcleos ----------
  const [nucleoAtual, setNucleoAtual] = useState(
    () => lerNucleoGuardado() || NUCLEO_PROVISORIO,
  );
  const [definindoNucleo, setDefinindoNucleo] = useState(false);
  const [nucleoB, setNucleoB] = useState(null); // {lngLat, nome} | null

  // ---------- estado da experiência ----------
  const [lente, setLente] = useState("procura");
  const [cena, setCena] = useState("pontos");
  const [metrica3d, setMetrica3d] = useState("pedidos");
  const [expansao, setExpansao] = useState(false);
  const [tempoLimite, setTempoLimite] = useState(null);
  const [aTocar, setATocar] = useState(false);
  const [fraseAtiva, setFraseAtiva] = useState(null); // id da frase
  const [porqueAberto, setPorqueAberto] = useState(false);
  const [popup, setPopup] = useState(null); // propriedades do evento clicado
  const [entrada, setEntrada] = useState("por-ver"); // por-ver | a-rodar | feita
  const [interativo, setInterativo] = useState(true);
  const mapaRef = useRef(null);

  const largura = useSyncExternalStore(
    (cb) => {
      window.addEventListener("resize", cb);
      return () => window.removeEventListener("resize", cb);
    },
    () => window.innerWidth,
  );
  const desktop = largura >= 1000;
  // Enquadramento com espaço para o trilho (esquerda) e, no cenário,
  // para o painel (direita) — e SEGURO em ecrã pequeno (um padding
  // maior do que o canvas rebentava o fitBounds).
  const padPalco = desktop
    ? { top: 90, right: 90, bottom: 150, left: 360 }
    : { top: 60, right: 36, bottom: 110, left: 36 };

  // ---------- a rede ----------
  const nucleos = useMemo(() => {
    const lista = [
      {
        id: "atual",
        nome: nucleoAtual.provisorio
          ? "Núcleo atual (provisório: sede)"
          : `Núcleo atual — ${nucleoAtual.localidade || "definido"}`,
        lngLat: nucleoAtual.lngLat,
        tipo: "atual",
        provisorio: !!nucleoAtual.provisorio,
        arrastavel: definindoNucleo,
      },
    ];
    if (expansao && nucleoB)
      lista.push({
        id: "b",
        nome: `Núcleo simulado — ${nucleoB.nome}`,
        lngLat: nucleoB.lngLat,
        tipo: "simulado",
        arrastavel: true,
      });
    return lista;
  }, [nucleoAtual, nucleoB, expansao, definindoNucleo]);

  const redeAtual = useMemo(
    () => atribuirRede(eventosGeo, [{ id: "atual", lngLat: nucleoAtual.lngLat }]),
    [eventosGeo, nucleoAtual],
  );
  const rede = useMemo(
    () =>
      expansao && nucleoB
        ? atribuirRede(eventosGeo, [
            { id: "atual", lngLat: nucleoAtual.lngLat },
            { id: "b", lngLat: nucleoB.lngLat },
          ])
        : redeAtual,
    [eventosGeo, nucleoAtual, nucleoB, expansao, redeAtual],
  );
  const comparacao = useMemo(
    () => (expansao && nucleoB ? compararRedes(redeAtual, rede) : null),
    [expansao, nucleoB, redeAtual, rede],
  );
  const metricasAtuais = useMemo(() => metricasRede(redeAtual), [redeAtual]);

  // ---------- destaque a partir das frases ----------
  const destaqueIds = useMemo(() => {
    if (popup) return new Set([popup.id]);
    if (!fraseAtiva) return null;
    const f = [...frases.ativas, ...frases.arrumacao].find(
      (x) => x.id === fraseAtiva,
    );
    if (!f) return null;
    const ids = f.porque.linhas.map((l) => l.id).filter(Boolean);
    return ids.length ? new Set(ids) : null;
  }, [fraseAtiva, frases, popup]);

  const selecionarFrase = (f) => {
    setPopup(null);
    if (fraseAtiva === f.id) {
      setFraseAtiva(null);
      setPorqueAberto(false);
      return;
    }
    setFraseAtiva(f.id);
    setPorqueAberto(false);
    if (f.camada === "operacoes") {
      setLente("operacoes");
      mudarCena("rede");
    } else {
      setLente("procura");
      if (cena === "relevo" || cena === "calor") {
        /* mantém a cena analítica escolhida */
      } else {
        mudarCena("pontos");
      }
    }
    const ids = new Set(f.porque.linhas.map((l) => l.id).filter(Boolean));
    const pontos = eventosGeo.filter((e) => ids.has(e.id)).map((e) => e.lngLat);
    if (pontos.length) mapaRef.current?.enquadrar(pontos, { padding: padPalco });
  };

  const mudarLente = (id) => {
    setLente(id);
    setFraseAtiva(null);
    setPopup(null);
    mudarCena(CENAS_POR_LENTE[id][0].id);
    if (id === "operacoes" || id === "infraestrutura") {
      const pontos = [...eventosGeo.map((e) => e.lngLat), nucleoAtual.lngLat];
      mapaRef.current?.enquadrar(pontos, { padding: padPalco });
    }
  };

  // ---------- tempo ----------
  const tempoRaf = useRef(null);
  const pararTempo = () => {
    if (tempoRaf.current) cancelAnimationFrame(tempoRaf.current);
    tempoRaf.current = null;
    setATocar(false);
  };
  const tocarTempo = () => {
    pararTempo();
    setATocar(true);
    const dur = 11000;
    const t0 = performance.now();
    const inicio =
      tempoLimite != null && tempoLimite < tsMax ? tempoLimite : tsMin - 1;
    const passo = (agora) => {
      const p = Math.min(1, (agora - t0) / dur);
      const t = inicio + (tsMax - inicio) * p;
      setTempoLimite(t);
      if (p < 1) {
        tempoRaf.current = requestAnimationFrame(passo);
      } else {
        setATocar(false);
      }
    };
    tempoRaf.current = requestAnimationFrame(passo);
  };
  useEffect(() => () => pararTempo(), []);
  // A cena muda-se sempre por AQUI (nunca setCena solto): trocar de
  // cena arruma o tempo no próprio gesto — sem setState em efeitos,
  // como manda o lint da casa.
  const mudarCena = (id) => {
    pararTempo();
    setTempoLimite(id === "tempo" ? tsMax : null);
    setCena(id);
    // A câmara faz parte da cena: o 3D só fala com inclinação.
    const m = mapaRef.current;
    if (!m) return;
    if (id === "relevo")
      m.voarPara({
        center: [-9.19, 38.72],
        zoom: 9.6,
        pitch: 56,
        bearing: -18,
        duration: 1300,
      });
    else if (id === "rede") m.voarPara({ pitch: 38, bearing: -6, duration: 900 });
    else m.voarPara({ pitch: 0, bearing: 0, duration: 900 });
  };

  // ---------- entrada cinematográfica ----------
  const entradaTimers = useRef([]);
  const limparEntrada = () => {
    entradaTimers.current.forEach(clearTimeout);
    entradaTimers.current = [];
  };
  const terminarEntrada = () => {
    limparEntrada();
    pararTempo();
    setTempoLimite(null);
    setCena("rede");
    setLente("operacoes");
    setInterativo(true);
    setEntrada("feita");
    const pontos = [...eventosGeo.map((e) => e.lngLat), nucleoAtual.lngLat];
    mapaRef.current?.enquadrar(pontos, { padding: padPalco, duration: 900 });
  };
  const arrancarEntrada = () => {
    if (reduzMotion) {
      terminarEntrada();
      return;
    }
    setEntrada("a-rodar");
    setInterativo(false);
    setLente("procura");
    setCena("pontos");
    setTempoLimite(tsMin - 1);
    const mapa = mapaRef.current;
    mapa?.saltarPara({ center: [-8.35, 39.55], zoom: 5.55, pitch: 0, bearing: 0 });
    const t = (ms, fn) => entradaTimers.current.push(setTimeout(fn, ms));
    t(500, () =>
      mapa?.voarPara({
        center: [-9.16, 38.74],
        zoom: 8.5,
        pitch: 48,
        bearing: -14,
        duration: 3200,
        easing: (x) => 1 - Math.pow(1 - x, 3),
      }),
    );
    // os pedidos acendem pela ordem em que chegaram
    t(2600, () => {
      const dur = 3600;
      const t0 = performance.now();
      const passo = (agora) => {
        const p = Math.min(1, (agora - t0) / dur);
        setTempoLimite(tsMin - 1 + (tsMax - tsMin + 2) * p);
        if (p < 1 && entradaTimers.current.length)
          tempoRaf.current = requestAnimationFrame(passo);
      };
      tempoRaf.current = requestAnimationFrame(passo);
    });
    // a rede ganha vida
    t(6600, () => {
      setCena("rede");
      setLente("operacoes");
      mapa?.voarPara({ pitch: 40, bearing: -4, duration: 1800 });
    });
    t(8600, () => terminarEntrada());
  };
  useEffect(() => () => limparEntrada(), []);

  const aoMapaPronto = () => {
    const jaViu = sessionStorage.getItem("dlm.atlasLab.entrada");
    if (!jaViu && !reduzMotion) {
      sessionStorage.setItem("dlm.atlasLab.entrada", "1");
      arrancarEntrada();
    } else {
      terminarEntrada();
    }
  };

  // ---------- expansão ----------
  const abrirExpansao = () => {
    setExpansao(true);
    setLente("operacoes");
    mudarCena("rede");
    setFraseAtiva(null);
    setPopup(null);
  };
  const fecharExpansao = () => {
    setExpansao(false);
    setNucleoB(null);
  };
  const colocarNucleoB = (lngLat) => {
    const perto = localidadeMaisProxima(lngLat);
    setNucleoB({ lngLat, nome: `≈ ${perto.nome}` });
  };
  const cenarioRapido = (chave) => {
    setNucleoB({
      lngLat: COORDS_LOCALIDADE[chave],
      nome: capitalizar(chave),
    });
    const pontos = [
      ...eventosGeo.map((e) => e.lngLat),
      nucleoAtual.lngLat,
      COORDS_LOCALIDADE[chave],
    ];
    // O painel do cenário vive à direita — o enquadramento respeita-o.
    mapaRef.current?.enquadrar(pontos, {
      padding: desktop
        ? { top: 90, right: 380, bottom: 150, left: 360 }
        : padPalco,
    });
  };
  const aoArrastoNucleo = (id, lngLat, final) => {
    if (id === "b") {
      const perto = final ? localidadeMaisProxima(lngLat) : null;
      setNucleoB((n) => ({
        lngLat,
        nome: final ? `≈ ${perto.nome}` : n?.nome || "…",
      }));
    } else if (id === "atual") {
      setNucleoAtual((n) => ({ ...n, lngLat }));
      if (final) {
        const perto = localidadeMaisProxima(lngLat);
        setNucleoAtual({
          lngLat,
          localidade: `≈ ${perto.nome}`,
          provisorio: true, // só deixa de ser provisório ao Guardar
        });
      }
    }
  };
  const aoCliqueMapa = (lngLat) => {
    setPopup(null);
    if (expansao) colocarNucleoB(lngLat);
  };

  const guardarNucleoAtual = () => {
    const perto = localidadeMaisProxima(nucleoAtual.lngLat);
    guardarNucleo(nucleoAtual.lngLat, `≈ ${perto.nome}`);
    setNucleoAtual({
      lngLat: nucleoAtual.lngLat,
      localidade: `≈ ${perto.nome}`,
      provisorio: false,
    });
    setDefinindoNucleo(false);
  };

  // ---------- render ----------
  const cenaEfetiva =
    cena === "tempo" ? "pontos" : lente === "operacoes" || lente === "infraestrutura" ? "rede" : cena;

  const frasesRail = frases.ativas;

  return (
    <div style={{ position: "relative" }}>
      {/* Cabeçalho do Lab */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "10px",
          marginBottom: "12px",
        }}
      >
        <div>
          <p style={estOverline}>
            Atlas · pré-visão{" "}
            <span
              style={{
                border: "1px solid var(--aviso-borda)",
                backgroundColor: "var(--aviso-fundo)",
                color: "var(--aviso-texto)",
                borderRadius: "999px",
                padding: "1px 8px",
                marginLeft: "6px",
                letterSpacing: "0.08em",
              }}
            >
              staging
            </span>
          </p>
          <h2 style={{ fontSize: "22px", color: "var(--charcoal)", margin: 0 }}>
            O negócio no território
          </h2>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {LENTES.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => mudarLente(l.id)}
              className="acao"
              style={pill(lente === l.id)}
            >
              {l.rotulo}
            </button>
          ))}
          <button
            type="button"
            onClick={expansao ? fecharExpansao : abrirExpansao}
            className="acao"
            style={{
              ...pill(expansao),
              borderStyle: expansao ? "solid" : "dashed",
              fontWeight: 700,
            }}
          >
            {expansao ? "✕ Fechar cenário" : "✦ Explorar expansão"}
          </button>
        </div>
      </div>

      {/* O palco */}
      <div
        style={{
          position: "relative",
          height: desktop ? "min(72vh, 780px)" : "62vh",
          borderRadius: "18px",
          overflow: "hidden",
          border: "1px solid var(--borda)",
          boxShadow: "var(--sombra-cartao)",
          backgroundColor: tema === "escuro" ? "#0d0b06" : "#eef0ee",
        }}
      >
        <MapaAtlas
          ref={mapaRef}
          tema={tema}
          eventos={eventosGeo}
          nucleos={nucleos}
          rede={rede}
          cena={cenaEfetiva}
          metrica3d={metrica3d}
          tempoLimite={tempoLimite}
          destaqueIds={destaqueIds}
          interativo={interativo}
          onPronto={aoMapaPronto}
          onEventoClick={(props) => {
            setFraseAtiva(null);
            setPopup(props);
          }}
          onCliqueMapa={aoCliqueMapa}
          onNucleoArrasto={aoArrastoNucleo}
        />

        {/* Entrada: escurecer suave + saltar */}
        <AnimatePresence>
          {entrada === "a-rodar" && (
            <motion.button
              key="saltar"
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={terminarEntrada}
              style={{
                position: "absolute",
                top: "14px",
                right: "14px",
                zIndex: 30,
                ...vidro(tema),
                padding: "7px 14px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Saltar a entrada →
            </motion.button>
          )}
        </AnimatePresence>

        {/* Trilho narrativo (as frases do Lote A a conduzir o mapa) */}
        {entrada !== "a-rodar" && desktop && (
          <div
            style={{
              position: "absolute",
              top: "14px",
              left: "14px",
              bottom: "14px",
              width: "295px",
              zIndex: 20,
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              overflowY: "auto",
              paddingRight: "2px",
            }}
          >
            {frasesRail.map((f) => (
              <CartaoFraseMapa
                key={f.id}
                frase={f}
                ativa={fraseAtiva === f.id}
                tema={tema}
                onClick={() => selecionarFrase(f)}
                onPorque={() => {
                  setFraseAtiva(f.id);
                  setPorqueAberto(true);
                }}
              />
            ))}
            <p
              style={{
                ...vidro(tema),
                borderRadius: "10px",
                padding: "8px 10px",
                fontSize: "10px",
                color: "var(--gray-mid)",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Fotografia real de {dataCurta(META_FOTOGRAFIA.data)} ·{" "}
              {eventosGeo.length} no mapa · {foraDoMapa} fora (sem localidade
              ou vaga) · posição ao nível da LOCALIDADE — nunca uma morada.
            </p>
          </div>
        )}

        {/* Cenas (contextual à lente) */}
        {entrada !== "a-rodar" && lente === "procura" && (
          <div
            style={{
              position: "absolute",
              top: "14px",
              right: "14px",
              zIndex: 20,
              display: "flex",
              gap: "6px",
            }}
          >
            {CENAS_POR_LENTE.procura.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => mudarCena(c.id)}
                style={{ ...pill(cena === c.id), ...vidro(tema, cena === c.id) }}
              >
                {c.rotulo}
              </button>
            ))}
          </div>
        )}
        {entrada !== "a-rodar" && cena === "relevo" && lente === "procura" && (
          <div
            style={{
              position: "absolute",
              top: "56px",
              right: "14px",
              zIndex: 20,
              display: "flex",
              gap: "6px",
            }}
          >
            {[
              ["pedidos", "altura = pedidos"],
              ["valor", "altura = € acordados"],
            ].map(([m, r]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetrica3d(m)}
                style={{ ...pill(metrica3d === m), ...vidro(tema, metrica3d === m), fontSize: "10.5px" }}
              >
                {r}
              </button>
            ))}
          </div>
        )}

        {/* Timeline */}
        {entrada !== "a-rodar" && cena === "tempo" && lente === "procura" && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              bottom: "18px",
              zIndex: 25,
              ...vidro(tema),
              borderRadius: "14px",
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              width: "min(560px, 86%)",
            }}
          >
            <button
              type="button"
              onClick={aTocar ? pararTempo : tocarTempo}
              className="acao"
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "50%",
                border: "1.5px solid var(--gold)",
                backgroundColor: "var(--gold)",
                color: "var(--texto-sobre-ouro)",
                fontSize: "13px",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {aTocar ? "❚❚" : "▶"}
            </button>
            <input
              type="range"
              min={tsMin - 1}
              max={tsMax}
              value={tempoLimite ?? tsMax}
              onChange={(e) => {
                pararTempo();
                setTempoLimite(Number(e.target.value));
              }}
              style={{ flex: 1, accentColor: "var(--gold)" }}
            />
            <TempoResumo eventos={eventosGeo} t={tempoLimite ?? tsMax} />
          </div>
        )}

        {/* Legenda contextual */}
        {entrada !== "a-rodar" && (
          <Legenda
            tema={tema}
            lente={lente}
            cena={cena}
            metrica3d={metrica3d}
            expansao={expansao}
            desktop={desktop}
          />
        )}

        {/* Popup de evento (sem PII: localidade, estado, valor, km) */}
        <AnimatePresence>
          {popup && (
            <motion.div
              key="popup"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              style={{
                position: "absolute",
                left: desktop ? "324px" : "14px",
                bottom: "16px",
                zIndex: 26,
                ...vidro(tema),
                borderRadius: "12px",
                padding: "12px 14px",
                maxWidth: "260px",
              }}
            >
              <p style={{ ...estOverline, marginBottom: "4px" }}>
                {popup.localidade}
              </p>
              <p style={{ fontSize: "12.5px", color: "var(--charcoal)", margin: 0, lineHeight: 1.6 }}>
                {popup.data ? `${dataCurta(popup.data)} · ` : ""}
                {popup.estado}
                {Number(popup.valor) > 0 ? ` · ${formatarEuros(popup.valor)}` : ""}
                {Number(popup.kmReal) > 0
                  ? ` · ${popup.kmReal} km reais (orçamento)`
                  : ` · ≈${popup.km} km estimados`}
              </p>
              <button
                type="button"
                onClick={() => setPopup(null)}
                style={{
                  position: "absolute",
                  top: "6px",
                  right: "8px",
                  border: "none",
                  background: "none",
                  color: "var(--gray-mid)",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Painel da simulação */}
        <AnimatePresence>
          {expansao && entrada !== "a-rodar" && (
            <motion.div
              key="painel-exp"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.28, ease: EASE }}
              style={{
                position: "absolute",
                top: "14px",
                right: "14px",
                zIndex: 27,
                width: desktop ? "300px" : "calc(100% - 28px)",
                ...vidro(tema),
                borderRadius: "14px",
                padding: "14px 16px",
              }}
            >
              <p style={{ ...estOverline, marginBottom: "6px" }}>
                Explorar expansão · cenário de estudo
              </p>
              {!nucleoB ? (
                <>
                  <p style={estTexto}>
                    Toca no mapa para pousar um núcleo simulado — ou
                    experimenta um cenário:
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {CENARIOS_RAPIDOS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => cenarioRapido(c)}
                        style={pill(false)}
                      >
                        {capitalizar(c)}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <ComparacaoCenario
                  comparacao={comparacao}
                  nucleoB={nucleoB}
                  onLimpar={() => setNucleoB(null)}
                />
              )}
              <p style={{ ...estMicro, marginTop: "10px" }}>
                Distâncias estimadas em linha reta ×{FATOR_ESTRADA} — o MESMO
                estimador para os dois núcleos (comparação justa). Nada disto
                fica gravado: é um cenário de exploração.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Infraestrutura: definir o núcleo real */}
        {lente === "infraestrutura" && entrada !== "a-rodar" && !expansao && (
          <div
            style={{
              position: "absolute",
              top: "14px",
              right: "14px",
              zIndex: 26,
              width: desktop ? "300px" : "calc(100% - 28px)",
              ...vidro(tema),
              borderRadius: "14px",
              padding: "14px 16px",
            }}
          >
            <p style={{ ...estOverline, marginBottom: "6px" }}>
              Núcleo operacional
            </p>
            {nucleoAtual.provisorio && (
              <p
                style={{
                  fontSize: "11.5px",
                  color: "var(--aviso-texto)",
                  backgroundColor: "var(--aviso-fundo)",
                  border: "1px solid var(--aviso-borda)",
                  borderRadius: "8px",
                  padding: "8px 10px",
                  margin: "0 0 8px 0",
                  lineHeight: 1.55,
                }}
              >
                Posição PROVISÓRIA (a sede, Ericeira) — a localização real do
                armazém não existe no sistema. Define-a aqui antes da
                demonstração.
              </p>
            )}
            <p style={estTexto}>
              {nucleoAtual.localidade || "—"} · serve {metricasAtuais.n}{" "}
              pedidos mapeados · mediana ≈{metricasAtuais.mediana} km · máx ≈
              {metricasAtuais.maior} km
            </p>
            <p style={{ ...estMicro, margin: "6px 0 10px" }}>
              O núcleo operacional é onde a operação parte — NÃO é a base de
              pricing dos orçamentos (essa não muda aqui).
            </p>
            {definindoNucleo ? (
              <div style={{ display: "flex", gap: "6px" }}>
                <button type="button" onClick={guardarNucleoAtual} style={{ ...pill(true), flex: 1 }}>
                  Guardar posição
                </button>
                <button
                  type="button"
                  onClick={() => setDefinindoNucleo(false)}
                  style={{ ...pill(false), flex: 1 }}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDefinindoNucleo(true)}
                style={{ ...pill(false), width: "100%" }}
              >
                Arrastar para o local real…
              </button>
            )}
          </div>
        )}

        {/* Rever a entrada */}
        {entrada === "feita" && !expansao && (
          <button
            type="button"
            onClick={() => arrancarEntrada()}
            title="Rever a entrada"
            style={{
              position: "absolute",
              bottom: "16px",
              right: "14px",
              zIndex: 24,
              ...vidro(tema),
              borderRadius: "999px",
              padding: "6px 12px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            ↻ entrada
          </button>
        )}
      </div>

      {/* Trilho narrativo em ecrã pequeno */}
      {!desktop && entrada !== "a-rodar" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
          {frasesRail.slice(0, 4).map((f) => (
            <CartaoFraseMapa
              key={f.id}
              frase={f}
              ativa={fraseAtiva === f.id}
              tema={tema}
              solido
              onClick={() => selecionarFrase(f)}
              onPorque={() => {
                setFraseAtiva(f.id);
                setPorqueAberto(true);
              }}
            />
          ))}
        </div>
      )}

      {/* Mini-porquê (o contrato do Lote A mantém-se no mapa) */}
      <AnimatePresence>
        {porqueAberto && fraseAtiva && (
          <MiniPorque
            frase={[...frases.ativas, ...frases.arrumacao].find((x) => x.id === fraseAtiva)}
            onFechar={() => setPorqueAberto(false)}
          />
        )}
      </AnimatePresence>

      <p style={{ ...estMicro, marginTop: "10px" }}>
        Protótipo de visão (staging) — fotografia sanitizada de{" "}
        {dataCurta(META_FOTOGRAFIA.data)}, sem nomes nem contactos; geocodificação
        por tabela local de localidades (nenhum serviço externo); nada é
        escrito na base de dados. Não representa toda a procura do mercado —
        apenas os pedidos registados.
      </p>
    </div>
  );
}

// ---------- peças ----------

const estOverline = {
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--gold-dark)",
  margin: 0,
};
const estTexto = {
  fontSize: "12.5px",
  color: "var(--charcoal)",
  margin: "0 0 8px 0",
  lineHeight: 1.6,
};
const estMicro = {
  fontSize: "10.5px",
  color: "var(--gray-mid)",
  margin: 0,
  lineHeight: 1.55,
};

const pill = (ativo) => ({
  padding: "6px 13px",
  borderRadius: "999px",
  fontSize: "11.5px",
  fontWeight: 600,
  border: `1.5px solid ${ativo ? "var(--gold)" : "var(--gold-light)"}`,
  backgroundColor: ativo ? "var(--gold)" : "var(--superficie)",
  color: ativo ? "var(--texto-sobre-ouro)" : "var(--gray-mid)",
  cursor: "pointer",
});

// «vidro» — os overlays flutuam sobre o mapa nos dois temas.
const vidro = (tema, ativo = false) => ({
  backgroundColor:
    tema === "escuro"
      ? ativo
        ? "rgba(217,186,103,0.92)"
        : "rgba(19,17,9,0.82)"
      : ativo
        ? "rgba(201,168,76,0.95)"
        : "rgba(255,255,255,0.86)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  border: `1px solid ${tema === "escuro" ? "rgba(217,186,103,0.25)" : "var(--gold-light)"}`,
  boxShadow: "0 8px 26px rgba(0,0,0,0.22)",
});

function CartaoFraseMapa({ frase, ativa, tema, solido = false, onClick, onPorque }) {
  const texto = frase.segmentos.map((s) => s.v).join("");
  return (
    <div
      onClick={onClick}
      style={{
        ...(solido
          ? {
              backgroundColor: "var(--superficie)",
              border: `1px solid ${ativa ? "var(--gold)" : "var(--borda)"}`,
            }
          : vidro(tema)),
        ...(ativa && !solido ? { border: "1.5px solid var(--gold)" } : {}),
        borderRadius: "12px",
        padding: "10px 12px",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <p style={{ ...estOverline, fontSize: "9px", marginBottom: "4px" }}>
        {frase.familia}
      </p>
      <p
        style={{
          fontSize: "12px",
          lineHeight: 1.5,
          color: "var(--charcoal)",
          margin: 0,
          display: "-webkit-box",
          WebkitLineClamp: ativa ? "unset" : 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {texto}
      </p>
      {ativa && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPorque();
          }}
          style={{
            marginTop: "6px",
            border: "none",
            background: "none",
            color: "var(--gold-dark)",
            fontSize: "11px",
            fontWeight: 600,
            cursor: "pointer",
            padding: 0,
          }}
        >
          porquê →
        </button>
      )}
    </div>
  );
}

function TempoResumo({ eventos, t }) {
  const ate = eventos.filter((e) => e.criadoEmTs <= t);
  const localidades = new Set(ate.map((e) => e.localidade)).size;
  const data = ate.length
    ? new Date(Math.max(...ate.map((e) => e.criadoEmTs)))
    : null;
  return (
    <div style={{ textAlign: "right", minWidth: "118px" }}>
      <p
        style={{
          fontSize: "15px",
          fontWeight: 700,
          color: "var(--gold-dark)",
          margin: 0,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {ate.length} pedidos
      </p>
      <p style={{ ...estMicro }}>
        {localidades} localidades
        {data
          ? ` · até ${String(data.getDate()).padStart(2, "0")}/${String(data.getMonth() + 1).padStart(2, "0")}`
          : ""}
      </p>
    </div>
  );
}

function Legenda({ tema, lente, cena, metrica3d, expansao, desktop }) {
  if (cena === "tempo") return null; // a barra do tempo É a legenda
  const linhas = [];
  if (expansao) {
    linhas.push(["◆ ouro", "núcleo atual"], ["◆ prata", "núcleo simulado"], ["— arcos", "cada pedido liga ao núcleo mais próximo"]);
  } else if (lente === "procura" && cena === "calor") {
    linhas.push(["calor", "concentração dos PEDIDOS REGISTADOS — não é o mercado"]);
  } else if (lente === "procura" && cena === "relevo") {
    linhas.push([
      "colunas",
      metrica3d === "valor" ? "altura = € acordados por localidade" : "altura = pedidos registados por localidade",
    ]);
  } else if (lente === "operacoes" || lente === "infraestrutura") {
    linhas.push(["— arcos", "núcleo → evento (≈ linha reta ×1,3; 4 têm km reais de orçamento)"]);
  } else {
    linhas.push(
      ["● cheio", "realizado/garantido"],
      ["○ contorno", "em conversa"],
      ["● rubi", "perdido"],
    );
  }
  return (
    <div
      style={{
        position: "absolute",
        bottom: "16px",
        left: desktop ? "324px" : "14px",
        zIndex: 22,
        ...vidro(tema),
        borderRadius: "10px",
        padding: "8px 12px",
        maxWidth: desktop ? "360px" : "calc(100% - 28px)",
      }}
    >
      {linhas.map(([a, b]) => (
        <p key={a} style={{ ...estMicro, display: "flex", gap: "8px" }}>
          <span style={{ color: "var(--gold-dark)", fontWeight: 700, minWidth: "58px" }}>{a}</span>
          <span>{b}</span>
        </p>
      ))}
    </div>
  );
}

function LinhaMetrica({ r, v, forte }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
      <span style={{ ...estMicro, fontSize: "11px" }}>{r}</span>
      <span
        style={{
          fontSize: "11.5px",
          fontWeight: forte ? 700 : 600,
          color: forte ? "var(--gold-dark)" : "var(--charcoal)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {v}
      </span>
    </div>
  );
}

function ComparacaoCenario({ comparacao, nucleoB, onLimpar }) {
  const { antes, depois, mudaram, delta } = comparacao;
  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px",
          marginBottom: "8px",
        }}
      >
        <div style={{ borderRight: "1px solid var(--borda)", paddingRight: "10px" }}>
          <p style={{ ...estOverline, fontSize: "9px" }}>Atual</p>
          <LinhaMetrica r="núcleos" v="1" />
          <LinhaMetrica r="Σ distância" v={`≈${antes.total} km`} />
          <LinhaMetrica r="mediana" v={`≈${antes.mediana} km`} />
          <LinhaMetrica r="máxima" v={`≈${antes.maior} km`} />
        </div>
        <div>
          <p style={{ ...estOverline, fontSize: "9px" }}>Simulação</p>
          <LinhaMetrica r="núcleos" v="2" />
          <LinhaMetrica r="Σ distância" v={`≈${depois.total} km`} forte />
          <LinhaMetrica r="mediana" v={`≈${depois.mediana} km`} forte />
          <LinhaMetrica r="máxima" v={`≈${depois.maior} km`} forte />
        </div>
      </div>
      <p
        style={{
          fontSize: "12.5px",
          color: "var(--charcoal)",
          lineHeight: 1.6,
          margin: "0 0 8px 0",
        }}
      >
        Com um núcleo em <strong>{nucleoB.nome}</strong>,{" "}
        <strong style={{ color: "var(--gold-dark)" }}>{mudaram}</strong> dos{" "}
        {antes.n} pedidos mapeados passariam a ser servidos mais perto —{" "}
        <strong style={{ color: "var(--gold-dark)" }}>
          {delta <= 0 ? "−" : "+"}
          {Math.abs(delta)} km
        </strong>{" "}
        na distância agregada.
      </p>
      <p style={{ ...estMicro, marginBottom: "8px" }}>
        Podes ARRASTAR o losango prateado — a rede reorganiza-se em direto.
      </p>
      <button type="button" onClick={onLimpar} style={{ ...pill(false), width: "100%" }}>
        Limpar núcleo simulado
      </button>
    </div>
  );
}

function MiniPorque({ frase, onFechar }) {
  if (!frase) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onFechar}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 160,
        backgroundColor: "var(--cortina)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <motion.div
        initial={{ x: 30, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 30, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 100vw)",
          height: "100%",
          overflowY: "auto",
          backgroundColor: "var(--superficie)",
          borderLeft: "1px solid var(--borda)",
          padding: "20px 18px 40px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
          <p style={estOverline}>{frase.familia} · porquê</p>
          <button
            type="button"
            onClick={onFechar}
            style={{ border: "none", background: "none", cursor: "pointer", color: "var(--gray-mid)" }}
          >
            ✕
          </button>
        </div>
        <p style={{ fontSize: "14px", color: "var(--charcoal)", lineHeight: 1.6 }}>
          {frase.segmentos.map((s) => s.v).join("")}
        </p>
        <p style={{ ...estMicro, margin: "10px 0" }}>{frase.porque.formula}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {frase.porque.linhas.map((l, i) => (
            <p
              key={i}
              style={{
                ...estMicro,
                border: "1px solid var(--borda)",
                borderRadius: "8px",
                padding: "6px 9px",
                margin: 0,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {l.texto}
            </p>
          ))}
        </div>
        {frase.porque.notas.length > 0 && (
          <p style={{ ...estMicro, marginTop: "10px", fontStyle: "italic" }}>
            {frase.porque.notas.join(" ")}
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
