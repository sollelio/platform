import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import MapaAtlas from "./MapaAtlas";
import {
  FOTOGRAFIA,
  KM_REAIS,
  META_FOTOGRAFIA,
  estadoDoRegisto,
  eOperacional,
} from "../../../lib/territorioLab/fotografia";
import {
  pontoDaLocalidade,
  atribuirRede,
  metricasRede,
  compararRedes,
  localidadeMaisProxima,
  lerNucleoGuardado,
  guardarNucleo,
  limparNucleoGuardado,
  nucleoInicial,
  nucleoPorOmissao,
  divisaEntre,
  COORDS_LOCALIDADE,
  FATOR_ESTRADA,
} from "../../../lib/territorioLab/geo";
import { kmPorEstrada, chavePonto } from "../../../lib/territorioLab/estrada";
import { gerarAtlas, dataCurta } from "../../../lib/territorio/motor";
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

// ------------------------------------------------------------
// Microinterações do Lab — só propriedades que os estilos inline não
// definem (transform, sombra, filtro, outline), para o CSS poder
// ganhar sem !important. Ofício: 180 ms ease-out, sem bounce.
// ------------------------------------------------------------
const CSS_LAB = `
.al-pill{transition:transform .18s ease,box-shadow .18s ease,filter .18s ease}
.al-pill:hover{transform:translateY(-1px);box-shadow:0 3px 10px rgba(0,0,0,.14)}
.al-pill:active{transform:translateY(0);transition-duration:.08s}
.al-pill:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.al-cartao{transition:transform .2s ease,box-shadow .2s ease}
.al-cartao:hover{transform:translateY(-1px);box-shadow:0 8px 22px rgba(0,0,0,.16)}
.al-cartao-ativa{box-shadow:inset 3px 0 0 var(--gold),0 8px 22px rgba(0,0,0,.16)}
.al-marcador{transition:box-shadow .25s ease,filter .25s ease}
.al-marcador:hover{filter:brightness(1.06)}
.al-nasce{animation:alNasce .5s ease-out}
@keyframes alNasce{0%{opacity:0;box-shadow:0 0 0 0 rgba(159,182,201,.0)}60%{opacity:1;box-shadow:0 0 0 18px rgba(159,182,201,.25),0 6px 16px rgba(0,0,0,.35)}100%{opacity:1}}
.al-acena{animation:alAcena 1.1s ease-out}
@keyframes alAcena{0%,100%{filter:brightness(1)}30%{filter:brightness(1.35) drop-shadow(0 0 14px rgba(201,168,76,.8))}}
@media (prefers-reduced-motion: reduce){
  .al-pill,.al-cartao,.al-marcador{transition:none}
  .al-nasce,.al-acena{animation:none}
}
`;

// O imersivo tranca o scroll do gestor por trás (helper de módulo:
// a mutação do DOM não vive no corpo do efeito).
const definirOverflowDoBody = (v) => {
  document.body.style.overflow = v;
};

// Um número que rola até ao valor — os contadores da comparação e do
// tempo. Sem spring: interpolação curta, tabular-nums.
function Contador({ valor, dur = 620, prefixo = "", sufixo = "" }) {
  const [mostrado, setMostrado] = useState(valor);
  const anterior = useRef(valor);
  const raf = useRef(null);
  useEffect(() => {
    const de = anterior.current;
    anterior.current = valor;
    if (de === valor) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      // números não rolam para quem pediu sem movimento
      raf.current = requestAnimationFrame(() => setMostrado(valor));
      return () => raf.current && cancelAnimationFrame(raf.current);
    }
    const t0 = performance.now();
    const passo = (agora) => {
      const p = Math.min(1, (agora - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setMostrado(Math.round(de + (valor - de) * e));
      if (p < 1) raf.current = requestAnimationFrame(passo);
    };
    raf.current = requestAnimationFrame(passo);
    return () => raf.current && cancelAnimationFrame(raf.current);
  }, [valor, dur]);
  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      {prefixo}
      {mostrado}
      {sufixo}
    </span>
  );
}

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
  // vivo (não lido uma só vez): mudar a preferência do SO com o Lab
  // aberto muda o comportamento, como o CSS já fazia via media query
  const reduzMotion = useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
      mq?.addEventListener?.("change", cb);
      return () => mq?.removeEventListener?.("change", cb);
    },
    () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
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
      geo.push({
        id: r.id,
        lngLat: p.lngLat,
        localidade: p.chave,
        rotulo: capitalizar(p.chave),
        estado: estadoDoRegisto(r),
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
  // Arranque: guardado neste browser > configurado no staging
  // (nucleoConfig.js) > provisório (a sede), marcado como tal.
  const [nucleoAtual, setNucleoAtual] = useState(() => nucleoInicial());
  const [nucleoGuardadoExiste, setNucleoGuardadoExiste] = useState(
    () => !!lerNucleoGuardado(),
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
  const [imersivo, setImersivo] = useState(false);
  const [hoverId, setHoverId] = useState(null); // hover na cena da rede
  const [arrastando, setArrastando] = useState(false); // losango em arrasto
  const [redeCongelada, setRedeCongelada] = useState(null); // durante a coreografia
  const [revelado, setRevelado] = useState(true); // números do cenário
  const [historia, setHistoria] = useState(null); // {passo, legenda} | null
  const mapaRef = useRef(null);
  const coreoSeq = useRef(0);
  const pulsoTimer = useRef(null);

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

  // A REDE fala de EVENTOS (realizados + garantidos): deslocações que
  // a equipa fez ou vai fazer. Pedidos em conversa/perdidos ficam na
  // lente Procura — no mapa da rede aparecem esbatidos, sem arco.
  const eventosOperacionais = useMemo(
    () => eventosGeo.filter((e) => eOperacional(e.estado)),
    [eventosGeo],
  );

  const redeAtual = useMemo(
    () =>
      atribuirRede(eventosOperacionais, [
        { id: "atual", lngLat: nucleoAtual.lngLat },
      ]),
    [eventosOperacionais, nucleoAtual],
  );
  const rede = useMemo(
    () =>
      expansao && nucleoB
        ? atribuirRede(eventosOperacionais, [
            { id: "atual", lngLat: nucleoAtual.lngLat },
            { id: "b", lngLat: nucleoB.lngLat },
          ])
        : redeAtual,
    [eventosOperacionais, nucleoAtual, nucleoB, expansao, redeAtual],
  );
  const comparacao = useMemo(
    () => (expansao && nucleoB ? compararRedes(redeAtual, rede) : null),
    [expansao, nucleoB, redeAtual, rede],
  );
  const metricasAtuais = useMemo(() => metricasRede(redeAtual), [redeAtual]);

  // ---------- refinamento por estrada (dois níveis de rigor) ----------
  // Ao arrastar, o estimador ×1,3 responde a cada frame; quando o
  // cenário ESTABILIZA (largar, escolher cenário), pede-se o cálculo
  // por estrada (estrada.js → Edge `atlas-distancias`) — nunca por
  // frame. A chave prende o resultado à posição: mal o núcleo mexa,
  // os valores voltam a dizer «≈ estimativa» até novo refinamento.
  const [refino, setRefino] = useState(null); // {estado, chave, kmsAtual, kmsB}
  const seqRefino = useRef(0);
  const chaveCenario = (a, b) => `${chavePonto(a)}|${chavePonto(b)}`;
  const refinarCenario = (posAtual, posB) => {
    const chave = chaveCenario(posAtual, posB);
    const meu = ++seqRefino.current;
    setRefino({ estado: "a-calcular", chave });
    const destinos = eventosOperacionais.map((e) => e.lngLat);
    Promise.all([
      kmPorEstrada(posAtual, destinos),
      kmPorEstrada(posB, destinos),
    ])
      .then(([tA, tB]) => {
        if (seqRefino.current !== meu) return;
        setRefino({
          estado: "pronto",
          chave,
          kmsAtual: new Map(eventosOperacionais.map((e, i) => [e.id, tA[i].km])),
          kmsB: new Map(eventosOperacionais.map((e, i) => [e.id, tB[i].km])),
        });
      })
      .catch(() => {
        if (seqRefino.current === meu)
          setRefino({ estado: "indisponivel", chave });
      });
  };
  const limparRefino = () => {
    seqRefino.current += 1;
    setRefino(null);
  };

  // O refino só vale para a posição EXATA a que foi pedido.
  const refinoAtivo =
    expansao && nucleoB && refino &&
    refino.chave === chaveCenario(nucleoAtual.lngLat, nucleoB.lngLat)
      ? refino
      : null;
  const estrada = useMemo(() => {
    if (!refinoAtivo || refinoAtivo.estado !== "pronto") return null;
    // (o refino chega sem coreografia própria — os arcos ajustam-se e
    // os contadores rolam; a encenação grande é da criação do cenário)
    // A MESMA regra de atribuição da rede, com os km por estrada no
    // lugar do estimador — o mapa e o painel contam a mesma história.
    const antes = atribuirRede(
      eventosOperacionais,
      [{ id: "atual", lngLat: nucleoAtual.lngLat }],
      (n, e) => refinoAtivo.kmsAtual.get(e.id),
    );
    const depois = atribuirRede(
      eventosOperacionais,
      [
        { id: "atual", lngLat: nucleoAtual.lngLat },
        { id: "b", lngLat: nucleoB.lngLat },
      ],
      (n, e) =>
        (n.id === "b" ? refinoAtivo.kmsB : refinoAtivo.kmsAtual).get(e.id),
    );
    return { comparacao: compararRedes(antes, depois), depois };
  }, [refinoAtivo, eventosOperacionais, nucleoAtual, nucleoB]);
  const redeMapa = redeCongelada || (estrada ? estrada.depois : rede);
  const comparacaoRef = useRef(null);
  useEffect(() => {
    comparacaoRef.current = {
      comp: estrada ? estrada.comparacao : comparacao,
      porEstrada: !!estrada,
    };
  });

  // A divisa simulada entre os dois núcleos — só enquanto se arrasta,
  // e nomeada com honestidade («distribuição simulada dos eventos»).
  const divisa = useMemo(
    () =>
      arrastando && expansao && nucleoB
        ? divisaEntre(nucleoAtual.lngLat, nucleoB.lngLat)
        : null,
    [arrastando, expansao, nucleoB, nucleoAtual],
  );

  // ---------- a COREOGRAFIA da reorganização ----------
  // «ver a operação reorganizar-se»: congela a rede exibida, esconde
  // os arcos, ondula no núcleo novo, liberta a rede nova e desenha-a.
  // Uma sequência por vez (coreoSeq); reduzMotion salta ao fim.
  const coreografarCenario = async (lngLatOnda) => {
    const meu = ++coreoSeq.current;
    const m = mapaRef.current;
    if (!m || reduzMotion) {
      setRedeCongelada(null);
      setRevelado(true);
      return;
    }
    setRevelado(false);
    await m.esconderArcos(300);
    if (coreoSeq.current !== meu) return;
    setRedeCongelada(null); // a rede nova entra nos dados
    if (lngLatOnda) m.ondular(lngLatOnda);
    await new Promise((r) => setTimeout(r, 160));
    if (coreoSeq.current !== meu) return;
    await m.apresentarRede(1050);
    if (coreoSeq.current !== meu) return;
    setRevelado(true); // os números só ganham protagonismo DEPOIS
  };

  // ---------- destaque a partir das frases (e do hover na rede) ----------
  const destaqueIds = useMemo(() => {
    if (popup) return new Set([popup.id]);
    if (hoverId != null) return new Set([hoverId]); // a ligação em foco
    if (!fraseAtiva) return null;
    const f = [...frases.ativas, ...frases.arrumacao].find(
      (x) => x.id === fraseAtiva,
    );
    if (!f) return null;
    const ids = f.porque.linhas.map((l) => l.id).filter(Boolean);
    return ids.length ? new Set(ids) : null;
  }, [fraseAtiva, frases, popup, hoverId]);

  const selecionarFrase = (f) => {
    setPopup(null);
    if (pulsoTimer.current) clearTimeout(pulsoTimer.current);
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
    const ids = [...new Set(f.porque.linhas.map((l) => l.id).filter(Boolean))];
    const pontos = eventosGeo
      .filter((e) => ids.includes(e.id))
      .map((e) => e.lngLat);
    if (pontos.length) {
      mapaRef.current?.enquadrar(pontos, { padding: padPalco });
      // coreografado: a câmara pousa, e SÓ ENTÃO os registos pulsam
      pulsoTimer.current = setTimeout(
        () => mapaRef.current?.pulsar(ids),
        reduzMotion ? 0 : 1150,
      );
    }
  };
  useEffect(
    () => () => pulsoTimer.current && clearTimeout(pulsoTimer.current),
    [],
  );

  const mudarLente = (id) => {
    cortarEntrada(); // interagir interrompe o filme — nunca lutam
    coreoSeq.current += 1; // invalida uma coreografia em curso
    setRedeCongelada(null);
    setRevelado(true);
    if (pulsoTimer.current) clearTimeout(pulsoTimer.current);
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
        center: [-9.17, 38.7],
        zoom: 9.4,
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
    setPopup(null);
    setFraseAtiva(null);
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

  // Interagir a meio do filme corta-o LIMPO (sem mudar cena/lente —
  // quem interagiu já escolheu para onde vai): os timers da entrada
  // não podem atropelar a história nem a expansão.
  const cortarEntrada = () => {
    if (entrada !== "a-rodar") return;
    limparEntrada();
    pararTempo();
    setTempoLimite(null);
    setInterativo(true);
    setEntrada("feita");
  };

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
    cortarEntrada();
    if (pulsoTimer.current) clearTimeout(pulsoTimer.current);
    setExpansao(true);
    setLente("operacoes");
    mudarCena("rede");
    setFraseAtiva(null);
    setPopup(null);
  };
  const desfazerCenario = async () => {
    // a rede regressa ao núcleo atual — também com transformação
    const m = mapaRef.current;
    const meu = ++coreoSeq.current;
    setNucleoB(null);
    limparRefino();
    setRevelado(true);
    if (m && !reduzMotion) {
      setRedeCongelada(null);
      await m.esconderArcos(260);
      if (coreoSeq.current !== meu) return;
      await m.apresentarRede(820);
    }
  };
  const fecharExpansao = () => {
    setExpansao(false);
    desfazerCenario();
  };
  const colocarNucleoB = (lngLat) => {
    const perto = localidadeMaisProxima(lngLat);
    setRedeCongelada(redeMapa); // a rede ANTIGA fica um instante
    setNucleoB({ lngLat, nome: `≈ ${perto.nome}` });
    refinarCenario(nucleoAtual.lngLat, lngLat); // cenário estável → estrada
    coreografarCenario(lngLat);
  };
  const cenarioRapido = (chave) => {
    setRedeCongelada(redeMapa);
    setNucleoB({
      lngLat: COORDS_LOCALIDADE[chave],
      nome: capitalizar(chave),
    });
    refinarCenario(nucleoAtual.lngLat, COORDS_LOCALIDADE[chave]);
    coreografarCenario(COORDS_LOCALIDADE[chave]);
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
      setArrastando(!final);
      const perto = final ? localidadeMaisProxima(lngLat) : null;
      setNucleoB((n) => ({
        lngLat,
        nome: final ? `≈ ${perto.nome}` : n?.nome || "…",
      }));
      // durante o arrasto responde o estimador em direto (a divisa
      // acompanha); ao LARGAR, refina-se por estrada
      if (final) refinarCenario(nucleoAtual.lngLat, lngLat);
    } else if (id === "atual") {
      if (expansao && nucleoB) setArrastando(!final);
      setNucleoAtual((n) => ({ ...n, lngLat }));
      if (final) {
        const perto = localidadeMaisProxima(lngLat);
        setNucleoAtual({
          lngLat,
          localidade: `≈ ${perto.nome}`,
          provisorio: true, // só deixa de ser provisório ao Guardar
        });
        if (expansao && nucleoB) refinarCenario(lngLat, nucleoB.lngLat);
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
    setNucleoGuardadoExiste(true);
    setDefinindoNucleo(false);
  };
  // Volta à posição de origem (configurada no staging, ou provisória)
  // — apaga só o que ESTE browser guardou; simulações nunca tocam nisto.
  const reporNucleo = () => {
    limparNucleoGuardado();
    setNucleoAtual(nucleoPorOmissao());
    setNucleoGuardadoExiste(false);
    setDefinindoNucleo(false);
  };

  // ---------- modo imersivo ----------
  useEffect(() => {
    if (!imersivo) return undefined;
    const alvo = mapaRef.current; // o MapaAtlas persiste; capturar chega
    definirOverflowDoBody("hidden");
    const t = setTimeout(() => alvo?.redimensionar(), 60);
    return () => {
      definirOverflowDoBody("");
      clearTimeout(t);
      setTimeout(() => alvo?.redimensionar(), 60);
    };
  }, [imersivo]);
  // ---------- a história guiada (▶ Ver a história do território) ----------
  // Não é uma ferramenta nova: é uma sequência coreografada sobre o
  // que já existe, com dados reais e honestos, saltável a qualquer
  // momento — e no fim o Atlas fica todo explorável.
  const historiaTimers = useRef([]);
  const passosRef = useRef([]);
  const limparHistoria = () => {
    historiaTimers.current.forEach(clearTimeout);
    historiaTimers.current = [];
  };
  const terminarHistoria = () => {
    limparHistoria();
    pararTempo();
    setTempoLimite(null);
    setHistoria(null);
    setInterativo(true);
    if (!expansao) {
      setLente("operacoes");
      mudarCena("rede");
      const pontos = [...eventosGeo.map((e) => e.lngLat), nucleoAtual.lngLat];
      mapaRef.current?.enquadrar(pontos, { padding: padPalco });
    }
  };
  const animarTempo = (de, para, dur) => {
    pararTempo();
    if (reduzMotion) {
      setTempoLimite(para); // sem rampa para quem pediu sem movimento
      return;
    }
    let t0 = null;
    const passo = (agora) => {
      if (t0 == null) t0 = agora;
      const p = Math.min(1, (agora - t0) / dur);
      setTempoLimite(de + (para - de) * p);
      if (p < 1) tempoRaf.current = requestAnimationFrame(passo);
    };
    tempoRaf.current = requestAnimationFrame(passo);
  };

  const fraseDe = (prefixo) =>
    frases.ativas.find((f) =>
      (f.familia || "").toLowerCase().startsWith(prefixo),
    );
  const textoDe = (f) => (f ? f.segmentos.map((s) => s.v).join("") : "");
  const pontosDe = (f) => {
    if (!f) return [];
    const ids = new Set(f.porque.linhas.map((l) => l.id).filter(Boolean));
    return eventosGeo.filter((e) => ids.has(e.id));
  };
  const nLocalidades = useMemo(
    () => new Set(eventosGeo.map((e) => e.localidade)).size,
    [eventosGeo],
  );

  const passosHistoria = () => {
    const m = () => mapaRef.current;
    const voo = (o) =>
      reduzMotion ? m()?.saltarPara(o) : m()?.voarPara(o);
    const interno = (ms, fn) =>
      historiaTimers.current.push(setTimeout(fn, ms));
    const fraseConc = fraseDe("concentra");
    const fraseValor = fraseDe("valor");
    return [
      {
        dur: 5200,
        legenda: `A operação parte do ${nucleoAtual.localidade}.`,
        acao: () => {
          setLente("procura");
          mudarCena("pontos");
          setTempoLimite(tsMin - 1);
          m()?.saltarPara({ center: [-8.35, 39.55], zoom: 5.6, pitch: 0, bearing: 0 });
          voo({
            center: nucleoAtual.lngLat,
            zoom: 10.3,
            pitch: 46,
            bearing: -12,
            duration: 3400,
          });
          interno(3400, () => m()?.acenarNucleo("atual"));
        },
      },
      {
        dur: 4600,
        legenda: "Julho de 2026: chegam os primeiros pedidos.",
        acao: () => {
          voo({ pitch: 0, bearing: 0, duration: 800 });
          interno(820, () =>
            m()?.enquadrar(eventosGeo.map((e) => e.lngLat), { padding: padPalco }),
          );
          animarTempo(tsMin - 1, tsMin + (tsMax - tsMin) * 0.3, 3400);
        },
      },
      {
        dur: 5600,
        legenda: `Em dois meses: ${FOTOGRAFIA.length} pedidos registados — ${eventosGeo.length} no mapa, em ${nLocalidades} localidades.`,
        acao: () =>
          animarTempo(tsMin + (tsMax - tsMin) * 0.3, tsMax, 4600),
      },
      {
        dur: 5000,
        legenda: textoDe(fraseConc) || "A concentração desenha-se no mapa.",
        acao: () => {
          pararTempo();
          setTempoLimite(null);
          mudarCena("calor");
          const pts = pontosDe(fraseConc).map((e) => e.lngLat);
          if (pts.length) m()?.enquadrar(pts, { padding: padPalco });
        },
      },
      {
        dur: 4600,
        legenda: textoDe(fraseValor) || "A Margem Sul ganha peso.",
        acao: () => {
          mudarCena("pontos");
          const evs = pontosDe(fraseValor);
          if (evs.length) {
            m()?.enquadrar(evs.map((e) => e.lngLat), { padding: padPalco });
            interno(1200, () => m()?.pulsar(evs.map((e) => e.id)));
          }
        },
      },
      {
        dur: 5400,
        legenda: `A rede de hoje: ${metricasAtuais.n} eventos servidos do armazém — mediana ≈${metricasAtuais.mediana} km.`,
        acao: () => {
          setLente("operacoes");
          mudarCena("rede");
          const pontos = [...eventosGeo.map((e) => e.lngLat), nucleoAtual.lngLat];
          m()?.enquadrar(pontos, { padding: padPalco });
        },
      },
      {
        dur: 2800,
        legenda: "E se operássemos também daqui?",
        acao: () =>
          voo({ center: COORDS_LOCALIDADE.almada, zoom: 9.3, pitch: 38, duration: 1600 }),
      },
      {
        dur: 5800,
        legenda: "Um segundo núcleo em Almada — a rede reorganiza-se…",
        acao: () => {
          abrirExpansao();
          cenarioRapido("almada");
        },
      },
      {
        dur: 5600,
        legenda: () => {
          const { comp, porEstrada } = comparacaoRef.current || {};
          if (!comp) return "O cenário calcula-se…";
          return `${comp.mudaram} dos ${comp.antes.n} eventos ficariam mais perto — −${Math.abs(comp.delta)} km ${porEstrada ? "por estrada" : "(≈ estimativa)"}.`;
        },
        acao: () => {},
      },
      {
        dur: 3400,
        legenda:
          "Explora à vontade — arrasta o losango prateado e vê a rede reorganizar-se.",
        acao: () => {},
      },
    ];
  };

  const executarPassoHistoria = (i) => {
    const p = passosRef.current[i];
    if (!p) {
      terminarHistoria();
      return;
    }
    setHistoria({
      passo: i,
      total: passosRef.current.length,
      legenda: typeof p.legenda === "function" ? p.legenda() : p.legenda,
    });
    p.acao?.();
  };
  const iniciarHistoria = () => {
    cortarEntrada(); // o filme de entrada não pode atropelar a história
    coreoSeq.current += 1; // nem uma coreografia a meio
    if (pulsoTimer.current) clearTimeout(pulsoTimer.current);
    limparHistoria();
    setImersivo(true);
    setPopup(null);
    setFraseAtiva(null);
    setPorqueAberto(false);
    setExpansao(false);
    setNucleoB(null);
    setRedeCongelada(null);
    limparRefino();
    setRevelado(true);
    setInterativo(false);
    passosRef.current = passosHistoria();
    if (reduzMotion) {
      // sem movimento automático: a história avança ao toque
      executarPassoHistoria(0);
      return;
    }
    let t = 300; // o imersivo assenta primeiro
    passosRef.current.forEach((_, i) => {
      historiaTimers.current.push(setTimeout(() => executarPassoHistoria(i), t));
      t += passosRef.current[i].dur;
    });
    historiaTimers.current.push(setTimeout(() => terminarHistoria(), t));
  };
  useEffect(() => () => limparHistoria(), []);

  // Esc sai do imersivo (e termina a história, se estiver a correr).
  // Sem deps de propósito: re-regista a cada render, closures frescos.
  useEffect(() => {
    if (!imersivo) return undefined;
    const aoTecla = (e) => {
      if (e.key !== "Escape") return;
      if (historia) terminarHistoria();
      setImersivo(false);
    };
    window.addEventListener("keydown", aoTecla);
    return () => window.removeEventListener("keydown", aoTecla);
  });

  // ---------- render ----------
  const cenaEfetiva =
    cena === "tempo" ? "pontos" : lente === "operacoes" || lente === "infraestrutura" ? "rede" : cena;

  const frasesRail = frases.ativas;

  const controlos = (
    <>
      {LENTES.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => mudarLente(l.id)}
          className="acao al-pill"
          style={pill(lente === l.id)}
        >
          {l.rotulo}
        </button>
      ))}
      <button
        type="button"
        onClick={expansao ? fecharExpansao : abrirExpansao}
        className="acao al-pill"
        style={{
          ...pill(expansao),
          borderStyle: expansao ? "solid" : "dashed",
          fontWeight: 700,
        }}
      >
        {expansao ? "✕ Fechar cenário" : "✦ Explorar expansão"}
      </button>
      <button
        type="button"
        onClick={iniciarHistoria}
        className="acao al-pill"
        title="Uma volta guiada de ~40 s pelo território — saltável"
        style={pill(false)}
      >
        ▶ História
      </button>
      <button
        type="button"
        onClick={() => setImersivo((v) => !v)}
        className="acao al-pill"
        title={imersivo ? "Sair do modo imersivo (Esc)" : "Expandir o Atlas"}
        style={{ ...pill(imersivo), fontWeight: 700 }}
      >
        {imersivo ? "✕ Sair" : "Expandir ↗"}
      </button>
    </>
  );

  return (
    <div style={{ position: "relative" }}>
      <style>{CSS_LAB}</style>
      {/* Cabeçalho do Lab (no imersivo vira HUD dentro do palco) */}
      {!imersivo && (
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
            {controlos}
          </div>
        </div>
      )}

      {/* O palco */}
      <div
        style={
          imersivo
            ? {
                position: "fixed",
                inset: 0,
                zIndex: 150,
                overflow: "hidden",
                backgroundColor: tema === "escuro" ? "#0d0b06" : "#eef0ee",
              }
            : {
                position: "relative",
                height: desktop ? "min(72vh, 780px)" : "62vh",
                borderRadius: "18px",
                overflow: "hidden",
                border: "1px solid var(--borda)",
                boxShadow: "var(--sombra-cartao)",
                backgroundColor: tema === "escuro" ? "#0d0b06" : "#eef0ee",
              }
        }
      >
        <MapaAtlas
          ref={mapaRef}
          tema={tema}
          eventos={eventosGeo}
          nucleos={nucleos}
          rede={redeMapa}
          cena={cenaEfetiva}
          metrica3d={metrica3d}
          tempoLimite={tempoLimite}
          destaqueIds={destaqueIds}
          divisa={divisa}
          interativo={interativo}
          reduzMotion={reduzMotion}
          onPronto={aoMapaPronto}
          onEventoClick={(props) => {
            if (entrada === "a-rodar") return; // o filme não abre popups
            setFraseAtiva(null);
            // o rótulo dos km depende do MODO em vigor no clique
            setPopup({ ...props, porEstrada: !!estrada });
          }}
          onEventoHover={setHoverId}
          onColunaClick={(p) => {
            if (entrada === "a-rodar") return;
            setFraseAtiva(null);
            setPopup({
              coluna: true,
              localidade: p.rotulo,
              pedidos: p.pedidos,
              valor: p.valor,
            });
          }}
          onCliqueMapa={aoCliqueMapa}
          onNucleoArrasto={aoArrastoNucleo}
        />

        {/* HUD do imersivo: os mesmos controlos, a flutuar no palco */}
        {imersivo && entrada !== "a-rodar" && (
          <div
            style={{
              position: "absolute",
              top: "14px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 28,
              display: "flex",
              gap: "8px",
              alignItems: "center",
              flexWrap: "wrap",
              justifyContent: "center",
              ...vidro(tema),
              borderRadius: "999px",
              padding: "8px 12px",
            }}
          >
            {controlos}
          </div>
        )}

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
        {entrada !== "a-rodar" && desktop && !historia && (
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
        {entrada !== "a-rodar" && lente === "procura" && !historia && (
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

        {/* A legenda da HISTÓRIA + o apanha-cliques que a interrompe */}
        {historia && (
          <>
            <div
              onClick={(e) => {
                e.stopPropagation();
                terminarHistoria();
              }}
              title="Tocar para saltar a história"
              style={{ position: "absolute", inset: 0, zIndex: 29, cursor: "pointer" }}
            />
            <motion.div
              key={`hist-${historia.passo}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
              style={{
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
                bottom: desktop ? "34px" : "18px",
                zIndex: 30,
                ...vidro(tema),
                borderRadius: "16px",
                padding: "16px 22px",
                width: "min(640px, 88%)",
                textAlign: "center",
              }}
            >
              <p style={{ ...estOverline, marginBottom: "6px" }}>
                A história do território · {historia.passo + 1}/{historia.total}
              </p>
              <p
                style={{
                  fontSize: desktop ? "16.5px" : "13.5px",
                  color: "var(--charcoal)",
                  margin: 0,
                  lineHeight: 1.55,
                  fontFamily: "'Playfair Display', serif",
                }}
              >
                {historia.legenda}
              </p>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  justifyContent: "center",
                  marginTop: "10px",
                }}
              >
                {reduzMotion && (
                  <button
                    type="button"
                    onClick={() => executarPassoHistoria(historia.passo + 1)}
                    className="al-pill"
                    style={pill(true)}
                  >
                    Seguinte →
                  </button>
                )}
                <button
                  type="button"
                  onClick={terminarHistoria}
                  className="al-pill"
                  style={pill(false)}
                >
                  Saltar ▸▸
                </button>
              </div>
            </motion.div>
          </>
        )}

        {/* Legenda contextual */}
        {entrada !== "a-rodar" && !historia && (
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
              {popup.coluna ? (
                <p style={{ fontSize: "12.5px", color: "var(--charcoal)", margin: 0, lineHeight: 1.6 }}>
                  {popup.pedidos} pedido{popup.pedidos === 1 ? "" : "s"} registado
                  {popup.pedidos === 1 ? "" : "s"}
                  {Number(popup.valor) > 0
                    ? ` · ${formatarEuros(popup.valor)} acordados`
                    : ""}
                </p>
              ) : (
                <p style={{ fontSize: "12.5px", color: "var(--charcoal)", margin: 0, lineHeight: 1.6 }}>
                  {popup.data ? `${dataCurta(popup.data)} · ` : ""}
                  {popup.estado}
                  {Number(popup.valor) > 0 ? ` · ${formatarEuros(popup.valor)}` : ""}
                  {Number(popup.kmReal) > 0
                    ? ` · ${popup.kmReal} km reais (orçamento)`
                    : Number(popup.km) > 0
                      ? popup.porEstrada
                        ? ` · ${popup.km} km por estrada`
                        : ` · ≈${popup.km} km estimados`
                      : ""}
                </p>
              )}
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
                  comparacao={estrada ? estrada.comparacao : comparacao}
                  modoEstrada={!!estrada}
                  refinoEstado={refinoAtivo?.estado ?? null}
                  nucleoB={nucleoB}
                  nomeAtual={nucleoAtual.localidade || "núcleo atual"}
                  revelado={revelado}
                  onLimpar={desfazerCenario}
                />
              )}
              {estrada ? (
                <p style={{ ...estMicro, marginTop: "10px" }}>
                  Distâncias por ESTRADA (função da casa), entre centróides
                  de localidade — não porta-a-porta. Ao arrastar vês a
                  estimativa ≈×{FATOR_ESTRADA}; ao largar, refina-se. Nada
                  disto fica gravado: é um cenário de exploração.
                </p>
              ) : (
                <p style={{ ...estMicro, marginTop: "10px" }}>
                  Distâncias estimadas em linha reta ×{FATOR_ESTRADA} — o
                  MESMO estimador para os dois núcleos (comparação justa).
                  {nucleoB && refinoAtivo?.estado === "indisponivel"
                    ? " O cálculo por estrada está indisponível (a função atlas-distancias ainda não está publicada em TEST)."
                    : ""}{" "}
                  Nada disto fica gravado: é um cenário de exploração.
                </p>
              )}
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
              eventos (realizados + garantidos) · mediana ≈
              {metricasAtuais.mediana} km · máx ≈{metricasAtuais.maior} km
            </p>
            <p style={{ ...estMicro, margin: "6px 0 10px" }}>
              O núcleo operacional é onde a operação parte — NÃO é a base de
              pricing dos orçamentos (essa não muda aqui).{" "}
              {nucleoGuardadoExiste
                ? "Posição guardada NESTE browser (as simulações nunca a alteram)."
                : nucleoAtual.configurado
                  ? "Posição fixa do staging (nucleoConfig) — igual em qualquer browser."
                  : ""}
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
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => setDefinindoNucleo(true)}
                  style={{ ...pill(false), flex: 1 }}
                >
                  Arrastar para o local real…
                </button>
                {nucleoGuardadoExiste && (
                  <button
                    type="button"
                    onClick={reporNucleo}
                    title="Volta à posição de origem do staging"
                    style={{ ...pill(false), flexShrink: 0 }}
                  >
                    Repor
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Rever a entrada */}
        {entrada === "feita" && !expansao && !historia && (
          <button
            type="button"
            onClick={() => arrancarEntrada()}
            title="Rever a entrada"
            style={{
              position: "absolute",
              bottom: "44px", // acima da atribuição OpenStreetMap (obrigatória)
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

      {!imersivo && (
      <p style={{ ...estMicro, marginTop: "10px" }}>
        Protótipo de visão (staging) — fotografia sanitizada de{" "}
        {dataCurta(META_FOTOGRAFIA.data)}, sem nomes nem contactos;
        geocodificação por tabela local de localidades (nenhum serviço
        externo). Procura = PEDIDOS REGISTADOS; a rede e a simulação =
        EVENTOS (realizados + garantidos). O refinamento por estrada do
        cenário usa a função da casa, só com coordenadas de localidade;
        nada é escrito na base de dados. Não representa toda a procura do
        mercado — apenas os pedidos registados.
      </p>
      )}
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
      className={ativa ? "al-cartao al-cartao-ativa" : "al-cartao"}
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
    <div style={{ textAlign: "right", minWidth: "126px" }}>
      <p
        style={{
          fontSize: "16px",
          fontWeight: 700,
          color: "var(--gold-dark)",
          margin: 0,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <Contador valor={ate.length} dur={260} /> pedidos
      </p>
      <p style={{ ...estMicro }}>
        <Contador valor={localidades} dur={260} /> localidades
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
    linhas.push(
      ["◆ ouro", "núcleo atual"],
      ["◆ prata", "núcleo simulado"],
      ["— arcos", "cada EVENTO (realizado + garantido) liga ao núcleo mais próximo"],
      ["○ esbatido", "pedidos em conversa — sem deslocação da equipa"],
    );
  } else if (lente === "procura" && cena === "calor") {
    linhas.push(["calor", "concentração dos PEDIDOS REGISTADOS — não é o mercado"]);
  } else if (lente === "procura" && cena === "relevo") {
    linhas.push([
      "colunas",
      metrica3d === "valor" ? "altura = € acordados por localidade" : "altura = pedidos registados por localidade",
    ]);
  } else if (lente === "operacoes" || lente === "infraestrutura") {
    linhas.push(
      ["— arcos", "núcleo → EVENTO realizado/garantido (≈ linha reta ×1,3; 2 têm km reais de orçamento)"],
      ["○ esbatido", "pedidos em conversa — não são deslocações da equipa"],
    );
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

function ComparacaoCenario({
  comparacao,
  modoEstrada = false,
  refinoEstado = null,
  nucleoB,
  nomeAtual,
  revelado = true,
  onLimpar,
}) {
  const { antes, depois, mudaram, delta } = comparacao;
  // Dois níveis de rigor, ditos com todas as letras: «≈» é a
  // estimativa instantânea (arrasto); sem «≈» é o cálculo por estrada.
  const aprox = modoEstrada ? "" : "≈";
  const selo = modoEstrada
    ? "por estrada"
    : refinoEstado === "a-calcular"
      ? "≈ estimativa · a calcular estrada…"
      : "≈ estimativa";
  if (!revelado) {
    // o mapa mostra a transformação PRIMEIRO; os números esperam
    return (
      <p style={{ ...estMicro, margin: "4px 0 2px" }}>
        A rede reorganiza-se…
      </p>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <p
        style={{
          ...estMicro,
          display: "inline-block",
          border: "1px solid var(--gold-light)",
          borderRadius: "999px",
          padding: "1px 9px",
          marginBottom: "8px",
          color: modoEstrada ? "var(--gold-dark)" : "var(--gray-mid)",
          fontWeight: 600,
        }}
      >
        {selo}
      </p>
      {/* ANTES → DEPOIS: a transformação primeiro, os números depois */}
      <div style={{ marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <span style={{ ...estMicro, minWidth: "52px" }}>Atual</span>
          <span style={{ fontSize: "13px", color: "var(--charcoal)", fontWeight: 600 }}>
            {nomeAtual}
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: "15px",
              fontWeight: 700,
              color: "var(--gray-mid)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {aprox}
            <Contador valor={antes.total} /> km
          </span>
        </div>
        <div style={{ textAlign: "center", color: "var(--gold-dark)", fontSize: "13px", lineHeight: 1.2, margin: "2px 0" }}>
          ↓
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <span style={{ ...estMicro, minWidth: "52px" }}>Simulação</span>
          <span style={{ fontSize: "13px", color: "var(--charcoal)", fontWeight: 600 }}>
            + {nucleoB.nome}
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: "19px",
              fontWeight: 700,
              color: "var(--gold-dark)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {aprox}
            <Contador valor={depois.total} /> km
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", marginTop: "4px" }}>
          <span
            style={{
              ...estMicro,
              border: "1px solid var(--gold-light)",
              backgroundColor: "var(--superficie-quente)",
              color: "var(--gold-dark)",
              borderRadius: "999px",
              padding: "1px 9px",
              fontWeight: 700,
            }}
          >
            {delta <= 0 ? "−" : "+"}
            <Contador valor={Math.abs(delta)} /> km
          </span>
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
        <strong style={{ color: "var(--gold-dark)" }}>{mudaram}</strong> dos{" "}
        {antes.n} eventos (realizados + garantidos) passariam a ser servidos
        mais perto{modoEstrada ? " — distâncias por estrada" : ""}.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px",
          marginBottom: "8px",
        }}
      >
        <div style={{ borderRight: "1px solid var(--borda)", paddingRight: "10px" }}>
          <LinhaMetrica r="mediana" v={`${aprox}${antes.mediana} km`} />
          <LinhaMetrica r="máxima" v={`${aprox}${antes.maior} km`} />
        </div>
        <div>
          <LinhaMetrica r="mediana" v={`${aprox}${depois.mediana} km`} forte />
          <LinhaMetrica r="máxima" v={`${aprox}${depois.maior} km`} forte />
        </div>
      </div>
      <p style={{ ...estMicro, marginBottom: "8px" }}>
        Podes ARRASTAR o losango prateado — a rede reorganiza-se em direto.
      </p>
      <button
        type="button"
        onClick={onLimpar}
        className="al-pill"
        style={{ ...pill(false), width: "100%" }}
      >
        Limpar núcleo simulado
      </button>
    </motion.div>
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
