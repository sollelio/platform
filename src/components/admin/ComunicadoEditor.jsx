import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { logoDe, assinaturaFolha } from "../../lib/casa";
import { useCasa } from "../CasaProvider";
import {
  criarComunicado,
  guardarComunicado,
  idDeBloco,
  comporFolha,
  subirImagemFolha,
} from "../../lib/comunicados";
import { realce } from "../../lib/realce";

// ============================================================
// ComunicadoEditor — a folha de um comunicado a ser escrita.
//
// Sobreposição de ecrã inteiro (o irmão do EventTypeEditor), pelo
// desenho «O editor»: cabeçalho fixo, corpo com scroll numa coluna de
// 720px, rodapé fixo com a linha de erro e o Guardar. Os blocos são
// {id, rotulo, texto} SEM tipo — o papel de cada um deriva-se em
// comporFolha, e é por isso que a pré-visualização (gaveta à direita)
// compõe dos dados locais e nunca da porta pública: a dlm_comunicado_ver
// conta leituras, e uma espreitadela da equipa não é uma leitura.
//
// O arrasto dos blocos é por pointer events próprio (o desenho fixou-o
// assim, NÃO dnd-kit): a pega agarra, o rAF reordena por
// elementsFromPoint sobre data-blk-id, um cartão-fantasma segue o dedo.
//
// props:
//   comunicado — o registo a editar (id + titulo + subtitulo + blocos)
//   inicial    — opcional, SÓ com comunicado null: um objecto EM MEMÓRIA
//                (o prepararDeModelo da lib) que pré-preenche o editor —
//                título, subtítulo, registo e blocos (ids e marcas
//                rever/pergunta preservados). Nada se escreve na base
//                antes do primeiro Guardar; é aí que modelo_id, publico
//                e mensagem seguem no payload do criarComunicado.
//   onFechar   — fecha sem guardar
//   onGuardado(rec) — guardou; recebe o registo actualizado
//
// Os blocos «a rever» (nascidos de modelo, 081): a pastilha, a pergunta
// em itálico e o «Está certo» vivem no próprio cartão do bloco. O gesto
// limpa rever/pergunta EM MEMÓRIA — persiste no Guardar, dentro do
// jsonb blocos, nunca numa RPC por bloco. Editar o texto de um bloco
// marcado NÃO limpa a marca: o fecho da revisão é um gesto dela.
// ============================================================

// O suporte de field-sizing:content decide-se uma vez: nos browsers sem
// ele, cada textarea ajusta a própria altura ao scrollHeight (o fallback
// digno que o desenho pede — a caixa cresce com o texto na mesma).
const SUPORTA_FIELD_SIZING =
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("field-sizing", "content");

const ajustarAltura = (el) => {
  if (!el || SUPORTA_FIELD_SIZING) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
};

// A curva da gaveta e o tempo — os do desenho, ao pixel.
const GAVETA_TRANSICAO = "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)";

const OVERLINE = {
  fontSize: "9.5px",
  fontWeight: "700",
  letterSpacing: "0.15em",
  color: "var(--gold-dark)",
};

const CAMPO = {
  width: "100%",
  boxSizing: "border-box",
  marginTop: "8px",
  padding: "12px 14px",
  fontFamily: "Inter, sans-serif",
  fontSize: "15px",
  color: "var(--charcoal)",
  border: "1.5px solid var(--gold-light)",
  borderRadius: "10px",
  backgroundColor: "white",
  outline: "none",
};

// Os campos DENTRO de um cartão de bloco — o rótulo a negrito, as linhas
// simples sem ele. Constantes partilhadas porque os cartões tipados
// (imagem, chamada) vestem exactamente a mesma roupa dos de texto.
const CAMPO_ROTULO = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 11px",
  fontFamily: "Inter, sans-serif",
  fontSize: "13px",
  fontWeight: "600",
  color: "var(--charcoal)",
  border: "1.5px solid #F0E6D0",
  borderRadius: "8px",
  backgroundColor: "white",
  outline: "none",
};

const CAMPO_LINHA = { ...CAMPO_ROTULO, fontWeight: "400" };

// A pastilha «A REVER» — a pele das marcas da casa (9.5px/700 dourada),
// em cápsula sobre o creme das marcas.
const PASTILHA_REVER = {
  flex: "none",
  fontSize: "9.5px",
  fontWeight: "700",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--gold-dark)",
  backgroundColor: "#FEF9EC",
  border: "1px solid var(--gold-light)",
  borderRadius: "999px",
  padding: "2px 8px",
  whiteSpace: "nowrap",
};

// A etiqueta de papel de um cartão (Fase C): o nome humano do que o
// bloco É na folha — derivado de comporFolha, nunca guardado. A pele
// neutra é a das marcas apagadas; as estruturais (nota, remate) vestem
// a variante dourada da casa.
const ETIQUETA_PAPEL = {
  position: "absolute",
  top: "-8px",
  right: "34px",
  fontSize: "9px",
  fontWeight: "700",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  borderRadius: "999px",
  padding: "2px 9px",
  whiteSpace: "nowrap",
  color: "#9B9B9B",
  backgroundColor: "#FDFBF5",
  border: "1px solid #E8DCC0",
};

const ETIQUETA_PAPEL_FORTE = {
  ...ETIQUETA_PAPEL,
  color: "var(--gold-dark)",
  backgroundColor: "#FEF9EC",
  borderColor: "var(--gold-light)",
};

const NOME_DO_PAPEL = {
  prosa: "Prosa",
  nota: "Nota em destaque",
  grupo: "Grupo",
  remate: "Remate",
  imagem: "Imagem",
  chamada: "Chamada",
  vazio: "Vazio",
};

const rotuloDaEtiqueta = (p) => {
  if (!p) return "Vazio";
  if (p.papel === "clausula") return `Cláusula ${p.num}`;
  return NOME_DO_PAPEL[p.papel] || "Vazio";
};

// A marca de revisão de um bloco, preservada tal e qual vive no jsonb
// (081): {rever: true, pergunta}. Um bloco sem marca não ganha chaves —
// revisto fica IGUAL a nunca marcado.
const marcaDe = (b) =>
  b.rever ? { rever: true, pergunta: b.pergunta || "" } : null;

// `comunicado` pode vir NULL: é uma folha nova, que ainda não existe na
// base — só nasce no primeiro Guardar. Cancelar deixa zero rasto.
// `inicial` (só com comunicado null) pré-preenche essa folha nova em
// memória — o nascer de um modelo sem escrever nada na base.
export default function ComunicadoEditor({ comunicado, inicial, onFechar, onGuardado }) {
  const reduzido = useReducedMotion();
  // A pré-visualização desenha a MESMA folha que a ComunicadoPage
  // publica — leva a mesma identidade, ou o editor mostrava uma folha
  // que não é a que sai.
  const casa = useCasa();
  const assinatura = assinaturaFolha(casa);

  // A fonte do arranque: o registo a editar, ou o preparado em memória
  // (nascer de modelo) quando não há registo nenhum.
  const base = comunicado || inicial || null;

  const [titulo, setTitulo] = useState(base?.titulo || "");
  const [subtitulo, setSubtitulo] = useState(base?.subtitulo || "");
  // A SAUDAÇÃO (Fase C, migração 085): a coluna própria é a ÚNICA fonte
  // — abre a folha em itálico de cerimónia, uma vez, no topo. Nascer de
  // modelo pré-preenche daqui, como o título.
  const [saudacao, setSaudacao] = useState(base?.saudacao || "");
  // O temperamento da MESMA folha (080): aviso sóbrio ou oferta com
  // desejo. Grava-se com o resto, no Guardar — não é um acto à parte.
  const [registo, setRegisto] = useState(base?.registo || "aviso");
  // Uma folha sem blocos abre com um em branco à espera — há sempre onde
  // escrever. O id nasce aqui e nunca mais se regenera. Cada tipo guarda
  // SÓ os campos que são seus — um cartão de imagem não arrasta um
  // `texto` fantasma que a derivação fosse ler por engano. As marcas
  // rever/pergunta atravessam o mapeamento intactas.
  const [blocos, setBlocos] = useState(() =>
    Array.isArray(base?.blocos) && base.blocos.length
      ? base.blocos.map((b) => {
          const limpo =
            b.tipo === "imagem"
              ? { id: b.id, tipo: "imagem", url: b.url || "", legenda: b.legenda || "" }
              : b.tipo === "chamada"
                ? {
                    id: b.id,
                    tipo: "chamada",
                    rotulo: b.rotulo || "",
                    url: b.url || "",
                    nota: b.nota || "",
                  }
                : { id: b.id, rotulo: b.rotulo || "", texto: b.texto || "" };
          const marca = marcaDe(b);
          return marca ? { ...limpo, ...marca } : limpo;
        })
      : [{ id: idDeBloco(), rotulo: "", texto: "" }],
  );

  // O estado de cada carregamento de imagem, por id de bloco — vive fora
  // dos blocos porque não é conteúdo da folha, é um gesto a decorrer.
  const [uploads, setUploads] = useState({});

  // Remoção em duas fases (o padrão do EventTypeEditor): armar,
  // confirmar, e o botão desarma sozinho aos 4s — um clique distraído
  // minutos depois não pode apagar sem novo aviso.
  const [armadoId, setArmadoId] = useState(null);
  const timerDesarmar = useRef(null);
  useEffect(() => {
    if (!armadoId) return undefined;
    const t = setTimeout(() => setArmadoId(null), 4000);
    timerDesarmar.current = t;
    return () => clearTimeout(t);
  }, [armadoId]);

  // A validação só fala DEPOIS de uma tentativa de guardar — enquanto se
  // escreve, a folha não ralha.
  const [tentouGuardar, setTentouGuardar] = useState(false);
  const [erroRede, setErroRede] = useState("");
  const [aGuardar, setAGuardar] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const timerGuardado = useRef(null);

  const [prevAberta, setPrevAberta] = useState(false);

  // A coluna persistente da pré-visualização (Fase C): a partir de
  // 1240px de viewport a folha vive ao lado do corpo — a aritmética
  // fixada, 720px de miolo + 432px de coluna + molduras. Abaixo disso,
  // TUDO como antes: botão «Pré-visualizar» + gaveta. matchMedia com
  // listener, para o redimensionar da janela responder ao vivo.
  const [larga, setLarga] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1240px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1240px)");
    const ouvir = (e) => {
      setLarga(e.matches);
      // Ao alargar, a gaveta fecha-se: a folha passou a viver ao lado —
      // e ao voltar a estreitar não pode reaparecer aberta sozinha.
      if (e.matches) setPrevAberta(false);
    };
    // O arranque já leu o matchMedia no inicializador do estado — o
    // efeito só assina as mudanças.
    mq.addEventListener("change", ouvir);
    return () => mq.removeEventListener("change", ouvir);
  }, []);

  // --- O arrasto -------------------------------------------------
  // O estado visível (fantasma) vive no React; o que os listeners de
  // janela precisam de ler no meio do gesto vive em refs, para os
  // handlers poderem ser estáveis sem closures viciadas.
  const [drag, setDrag] = useState(null); // {id, rotulo, texto} do fantasma
  const [fantasma, setFantasma] = useState({ x: 0, y: 0, w: 0 });
  // As etiquetas de papel congeladas durante o arrasto (Fase C): o mapa
  // fixa-se ao PEGAR e solta-se ao largar — recompor a meio do gesto
  // era ruído, e o fantasma já ocupa o olho.
  const [etiquetasCongeladas, setEtiquetasCongeladas] = useState(null);
  const dragRef = useRef(null); // {id, dx, dy}
  const pendRef = useRef(null);
  const rafRef = useRef(null);

  const aoMover = useCallback((e) => {
    pendRef.current = { x: e.clientX, y: e.clientY };
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const p = pendRef.current;
      const d = dragRef.current;
      if (!p || !d) return;
      // O alvo é o cartão de bloco por baixo do dedo — elementsFromPoint
      // atravessa o fantasma (pointer-events: none) e encontra-o.
      const alvo = document
        .elementsFromPoint(p.x, p.y)
        .find((el) => el.dataset && el.dataset.blkId && el.dataset.blkId !== d.id);
      if (alvo) {
        setBlocos((prev) => {
          const de = prev.findIndex((b) => b.id === d.id);
          const para = prev.findIndex((b) => b.id === alvo.dataset.blkId);
          if (de < 0 || para < 0 || de === para) return prev;
          const seg = prev.slice();
          seg.splice(para, 0, seg.splice(de, 1)[0]);
          return seg;
        });
      }
      setFantasma((g) => ({ ...g, x: p.x - d.dx, y: p.y - d.dy }));
    });
  }, []);

  // O pointerup regista-se com { once: true }: o browser tira-o sozinho
  // depois de disparar, e a função não precisa de se conhecer a si
  // própria para se remover — era essa a referência circular.
  const aoLargar = useCallback(() => {
    window.removeEventListener("pointermove", aoMover);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    dragRef.current = null;
    setDrag(null);
    // Largar solta as etiquetas: voltam a derivar da ordem nova.
    setEtiquetasCongeladas(null);
  }, [aoMover]);

  const pegar = (id) => (e) => {
    // Só o gesto principal pega — o botão direito tem outros ofícios.
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const cartao = e.currentTarget.closest("[data-blk-id]");
    if (!cartao) return;
    const r = cartao.getBoundingClientRect();
    const b = blocos.find((x) => x.id === id);
    if (!b) return;
    // Pegar desarma qualquer remoção pendente: o gesto mudou de assunto.
    setArmadoId(null);
    dragRef.current = { id, dx: e.clientX - r.left, dy: e.clientY - r.top };
    // O fantasma diz o que vai na mão: nos tipados, o tipo faz de rótulo
    // e o campo mais falador faz de texto.
    setDrag({
      id,
      rotulo:
        b.tipo === "imagem"
          ? "Imagem"
          : b.tipo === "chamada"
            ? "Chamada"
            : (b.rotulo || "").trim() || "(sem rótulo)",
      texto:
        b.tipo === "imagem"
          ? (b.legenda || "").trim() || "(sem legenda)"
          : b.tipo === "chamada"
            ? (b.rotulo || "").trim() || "(sem texto do botão)"
            : (b.texto || "").trim() || "(sem texto)",
    });
    setFantasma({ x: r.left, y: r.top, w: r.width });
    // O gesto começa: as etiquetas ficam como estão até ao largar.
    setEtiquetasCongeladas(new Map(comporFolha(blocos).map((p) => [p.id, p])));
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", aoMover);
    window.addEventListener("pointerup", aoLargar, { once: true });
  };

  // A limpeza do desmonte: timers, rAF, listeners e o corpo da página
  // devolvido como estava — um editor que fecha não deixa rasto.
  useEffect(
    () => () => {
      clearTimeout(timerDesarmar.current);
      clearTimeout(timerGuardado.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoLargar);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    },
    [aoMover, aoLargar],
  );

  // --- As mudanças -----------------------------------------------
  // Nota: mudar um campo preserva o resto do bloco — incluindo uma marca
  // rever/pergunta. Emendar o texto não fecha a revisão sozinho.
  const mudaBloco = (id, campo, valor) =>
    setBlocos((prev) =>
      prev.map((b) => (b.id === id ? { ...b, [campo]: valor } : b)),
    );

  // «Está certo» fecha a revisão de UM bloco — EM MEMÓRIA: tira as
  // chaves rever/pergunta (revisto fica igual a nunca marcado) e a
  // limpeza persiste no Guardar, dentro do jsonb blocos. Nada de RPCs
  // por bloco.
  const marcarRevisto = (id) =>
    setBlocos((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;
        const resto = { ...b };
        delete resto.rever;
        delete resto.pergunta;
        return resto;
      }),
    );

  // Três gestos, um método: sem tipo nasce um bloco de texto (o
  // principal); os tipados nascem já com os campos deles, vazios.
  const adicionar = (tipo) =>
    setBlocos((prev) => [
      ...prev,
      tipo === "imagem"
        ? { id: idDeBloco(), tipo: "imagem", url: "", legenda: "" }
        : tipo === "chamada"
          ? { id: idDeBloco(), tipo: "chamada", rotulo: "", url: "", nota: "" }
          : { id: idDeBloco(), rotulo: "", texto: "" },
    ]);

  // O carregamento de uma imagem: subirImagemFolha comprime SEMPRE
  // (regra da casa) e devolve o URL público. O estado fica no cartão —
  // «A carregar…» sereno enquanto sobe, o erro escrito no próprio
  // cartão se falhar. O input limpa-se para o mesmo ficheiro poder ser
  // escolhido duas vezes seguidas (trocar e voltar atrás).
  const escolherImagem = (id) => async (e) => {
    const ficheiro = e.target.files?.[0];
    e.target.value = "";
    if (!ficheiro) return;
    setUploads((u) => ({ ...u, [id]: { aCarregar: true, erro: "" } }));
    try {
      const url = await subirImagemFolha(ficheiro);
      mudaBloco(id, "url", url);
      setUploads((u) => ({ ...u, [id]: { aCarregar: false, erro: "" } }));
    } catch (err) {
      console.error(err);
      setUploads((u) => ({
        ...u,
        [id]: {
          aCarregar: false,
          erro: "Não foi possível carregar a imagem. Tente outra vez.",
        },
      }));
    }
  };

  const remover = (id) => {
    if (armadoId === id) {
      setArmadoId(null);
      setBlocos((prev) => prev.filter((b) => b.id !== id));
      return;
    }
    setArmadoId(id);
  };

  // As palavras exactas do desenho, incluindo o «N.º» por extenso. Os
  // tipados têm as suas próprias faltas: uma imagem sem fotografia é um
  // bloco vazio; uma chamada sem texto do botão ou sem endereço está
  // incompleta — as mensagens seguem o padrão da existente.
  const problema = () => {
    if (!titulo.trim()) return "A folha precisa de um título.";
    if (blocos.some((b) => uploads[b.id]?.aCarregar)) {
      return "Há uma imagem a carregar — um instante, e a folha guarda-se.";
    }
    for (let i = 0; i < blocos.length; i++) {
      const b = blocos[i];
      if (b.tipo === "imagem") {
        if (!b.url) {
          return `O ${i + 1}.º bloco é uma imagem sem fotografia — escolha-a ou remova o bloco.`;
        }
      } else if (b.tipo === "chamada") {
        if (!b.rotulo.trim()) {
          return `O ${i + 1}.º bloco é uma chamada sem o texto do botão — escreva-o ou remova o bloco.`;
        }
        if (!b.url.trim()) {
          return `O ${i + 1}.º bloco é uma chamada sem endereço — cole-o ou remova o bloco.`;
        }
      } else if (!b.rotulo.trim() && !b.texto.trim()) {
        return `O ${i + 1}.º bloco está vazio — escreva-o ou remova-o.`;
      }
    }
    return "";
  };

  const guardar = async () => {
    const p = problema();
    if (p) {
      setTentouGuardar(true);
      setErroRede("");
      return;
    }
    setTentouGuardar(false);
    setErroRede("");
    setAGuardar(true);
    try {
      const campos = {
        titulo: titulo.trim(),
        subtitulo: subtitulo.trim() || null,
        saudacao: saudacao.trim() || null,
        registo,
        // Cada bloco guarda SÓ os campos do seu tipo — nos de texto o
        // papel continua a derivar-se sempre, nunca se grava; nos
        // tipados grava-se o `tipo`, que é declaração e não derivação.
        // Uma marca rever/pergunta que ela ainda não fechou grava-se com
        // o bloco — é aqui que a revisão (aberta ou limpa) persiste.
        blocos: blocos.map((b) => {
          const limpo =
            b.tipo === "imagem"
              ? { id: b.id, tipo: "imagem", url: b.url, legenda: b.legenda.trim() }
              : b.tipo === "chamada"
                ? {
                    id: b.id,
                    tipo: "chamada",
                    rotulo: b.rotulo.trim(),
                    url: b.url.trim(),
                    nota: b.nota.trim(),
                  }
                : { id: b.id, rotulo: b.rotulo, texto: b.texto };
          const marca = marcaDe(b);
          return marca ? { ...limpo, ...marca } : limpo;
        }),
      };
      // Uma folha nova NASCE aqui, no primeiro Guardar — nunca antes.
      // Se veio de um modelo (inicial), a proveniência, a regra de quem
      // recebe e a mensagem seguem NESTE payload — o criarComunicado
      // filtra pela whitelist dele. A saudação já não precisa de ponte:
      // o campo dela existe no editor (Fase C), arrancou pré-preenchido
      // do modelo, e segue em `campos` como o título.
      const rec = comunicado?.id
        ? await guardarComunicado(comunicado.id, campos)
        : await criarComunicado(
            inicial
              ? {
                  ...campos,
                  modelo_id: inicial.modelo_id ?? null,
                  publico: inicial.publico ?? null,
                  mensagem: inicial.mensagem ?? null,
                }
              : campos,
          );
      setGuardado(true);
      // O visto fica 900ms à vista antes de a porta fechar — tempo de o
      // olho registar que o gesto aconteceu.
      timerGuardado.current = setTimeout(() => onGuardado(rec), 900);
    } catch (e) {
      console.error(e);
      setErroRede("Não foi possível guardar a folha. Tente outra vez.");
    } finally {
      setAGuardar(false);
    }
  };

  const erro = erroRede || (tentouGuardar ? problema() : "");

  const folha = comporFolha(blocos);

  // As etiquetas de papel: congeladas enquanto o arrasto durar (o mapa
  // fixado ao pegar), derivadas da composição fresca no resto do tempo.
  const etiquetas = etiquetasCongeladas || new Map(folha.map((p) => [p.id, p]));

  // A guarda anti-duplicação da saudação: com o campo preenchido E a
  // primeira linha do primeiro bloco de prosa a terminar em vírgula (a
  // regra antiga da derivação: ≤60 caracteres, mais do que uma linha),
  // o aviso âmbar aparece nesse cartão — nunca correção silenciosa.
  const primeiraProsa = folha.find((p) => p.papel === "prosa");
  const linhasDaProsa = primeiraProsa ? (primeiraProsa.texto || "").split("\n") : [];
  const primeiraLinha = (linhasDaProsa[0] || "").trim();
  const avisoSaudacaoId =
    saudacao.trim() &&
    primeiraProsa &&
    linhasDaProsa.length > 1 &&
    primeiraLinha &&
    primeiraLinha.length <= 60 &&
    primeiraLinha.endsWith(",")
      ? primeiraProsa.id
      : null;

  // «Tirar a linha do bloco»: remove a primeira linha com conteúdo do
  // texto desse bloco, EM MEMÓRIA — persiste no Guardar, como tudo aqui.
  const tirarLinhaSaudacao = (id) =>
    setBlocos((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;
        const linhas = (b.texto || "").split("\n");
        const i = linhas.findIndex((l) => l.trim() !== "");
        const texto = linhas
          .slice(i + 1)
          .join("\n")
          .replace(/^\n+/, "");
        return { ...b, texto };
      }),
    );
  // A pré-visualização segue o aspecto — É A MESMA REGRA da folha
  // pública; se divergirem, quem manda é a folha.
  const eOferta = registo === "oferta";

  // O miolo da pré-visualização — o logo da casa e a folha composta,
  // UM só JSX para os dois poisos: a gaveta (abaixo de 1240px) e a
  // coluna persistente (a partir daí); só um deles o mostra de cada
  // vez, e as duas folhas nunca divergem porque são a mesma. A
  // saudação desenha-se lá dentro UMA vez, lida do campo — a coluna
  // própria da 085.
  const previa = (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "7px" }}>
        {logoDe(casa) && (
          <img
            src={logoDe(casa)}
            alt={casa.nome}
            style={{ height: "84px", width: "auto", display: "block" }}
          />
        )}
        <div
          style={{
            fontSize: "8px",
            fontWeight: "700",
            letterSpacing: "0.22em",
            color: "var(--gold-dark)",
            marginTop: "2px",
            whiteSpace: "nowrap",
            textAlign: "center",
          }}
        >
          {(casa.linha_actividade || "").toUpperCase()}
        </div>
      </div>
      <div
        style={{
          backgroundColor: "white",
          border: "1.5px solid var(--gold-light)",
          borderRadius: "14px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
          marginTop: "16px",
          padding: "24px 20px 26px",
        }}
      >
        {/* Na OFERTA a linha de apresentação sobe a overline, em
            maiúsculas, no lugar do «COMUNICADO» — e não se repete em
            parágrafo; o título cresce. No AVISO fica tudo como era. */}
        <div style={{ textAlign: "center", fontSize: "9px", fontWeight: "700", letterSpacing: "0.22em", color: "var(--gold-dark)" }}>
          {eOferta && subtitulo.trim() ? subtitulo.trim().toUpperCase() : "COMUNICADO"}
        </div>
        <div
          style={{
            margin: eOferta ? "12px 0 0" : "9px 0 0",
            textAlign: "center",
            fontFamily: "'Playfair Display', serif",
            fontSize: eOferta ? "22px" : "19px",
            lineHeight: 1.32,
            textWrap: "balance",
            color: "var(--charcoal)",
          }}
        >
          {titulo.trim() || "Sem título, por enquanto"}
        </div>
        {/* A linha de apresentação segue o título na folha pública —
            a miniatura mostra o mesmo. */}
        {!eOferta && subtitulo.trim() && (
          <div
            style={{
              margin: "7px 0 0",
              textAlign: "center",
              fontSize: "11.5px",
              fontStyle: "italic",
              color: "var(--gray-mid)",
              textWrap: "pretty",
            }}
          >
            {subtitulo.trim()}
          </div>
        )}
        {/* Na oferta a folha do desenho abre sem filete — o espaço
            fala por ele. */}
        {!eOferta && (
          <div style={{ display: "flex", justifyContent: "center", margin: "16px 0 2px" }}>
            <div style={{ width: "44px", height: "1px", backgroundColor: "var(--gold-light)" }} />
          </div>
        )}

        {/* A SAUDAÇÃO — UMA vez, no topo da folha, lida da coluna
            (o campo lá de cima): o itálico de cerimónia da casa.
            comporFolha já não a deriva de bloco nenhum. */}
        {saudacao.trim() && (
          <p
            style={{
              margin: "14px 0 0",
              fontFamily: "'Playfair Display', serif",
              fontStyle: "italic",
              fontSize: "13px",
              color: "var(--gold-dark)",
              textAlign: eOferta ? "center" : "left",
            }}
          >
            {saudacao.trim()}
          </p>
        )}

        {folha.map((p) => {
          if (p.papel === "vazio") return null;
          // A imagem: emoldurada no aviso; à sangria do cartão (as
          // margens negativas comem o padding) e com legenda centrada
          // na oferta. Sem fotografia ainda, não há o que antever.
          if (p.papel === "imagem") {
            if (!p.url) return null;
            return eOferta ? (
              <figure key={p.id} style={{ margin: "18px -20px 0" }}>
                <img
                  src={p.url}
                  alt={p.legenda || "A imagem da folha"}
                  style={{ display: "block", width: "100%", height: "210px", objectFit: "cover" }}
                />
                {p.legenda && (
                  <figcaption
                    style={{
                      margin: "8px 20px 0",
                      textAlign: "center",
                      fontSize: "10.5px",
                      fontStyle: "italic",
                      color: "var(--gray-mid)",
                    }}
                  >
                    {p.legenda}
                  </figcaption>
                )}
              </figure>
            ) : (
              <figure key={p.id} style={{ margin: "18px 0 0" }}>
                <div
                  style={{
                    border: "1px solid var(--gold-light)",
                    borderRadius: "12px",
                    overflow: "hidden",
                  }}
                >
                  <img
                    src={p.url}
                    alt={p.legenda || "A imagem da folha"}
                    style={{ display: "block", width: "100%", height: "140px", objectFit: "cover" }}
                  />
                </div>
                {p.legenda && (
                  <figcaption
                    style={{
                      margin: "7px 0 0",
                      fontSize: "10.5px",
                      fontStyle: "italic",
                      color: "var(--gray-mid)",
                    }}
                  >
                    {p.legenda}
                  </figcaption>
                )}
              </figure>
            );
          }
          // A chamada: cápsula de contorno no aviso, botão dourado
          // cheio na oferta — sempre com a nota por baixo. Aqui não é
          // um link de propósito: a pré-visualização mostra, não abre.
          if (p.papel === "chamada")
            return (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  marginTop: eOferta ? "22px" : "18px",
                }}
              >
                <span
                  style={
                    eOferta
                      ? {
                          display: "inline-block",
                          padding: "12px 26px",
                          borderRadius: "12px",
                          backgroundColor: "var(--gold)",
                          color: "var(--charcoal)",
                          fontSize: "12.5px",
                          fontWeight: "600",
                          boxShadow: "0 4px 12px rgba(201,168,76,0.30)",
                        }
                      : {
                          display: "inline-block",
                          padding: "9px 18px",
                          border: "1.5px solid var(--gold-light)",
                          borderRadius: "999px",
                          backgroundColor: "white",
                          color: "var(--gold-dark)",
                          fontSize: "11.5px",
                          fontWeight: "600",
                        }
                  }
                >
                  {p.rotulo || "(sem texto do botão)"}
                </span>
                {p.nota && (
                  <p
                    style={{
                      margin: "8px 0 0",
                      fontSize: "10.5px",
                      fontStyle: "italic",
                      color: "var(--gray-mid)",
                    }}
                  >
                    {p.nota}
                  </p>
                )}
              </div>
            );
          // A saudação por-peça morreu com a Fase C: vive na coluna
          // e desenhou-se lá em cima, uma vez. Na oferta a prosa
          // lê-se ao centro, mais desafogada — a folha do desenho
          // fala assim.
          if (p.papel === "prosa")
            return (
              <p
                key={p.id}
                style={
                  eOferta
                    ? {
                        margin: "18px auto 0",
                        maxWidth: "280px",
                        textAlign: "center",
                        fontSize: "12.5px",
                        lineHeight: 1.85,
                        whiteSpace: "pre-line",
                        textWrap: "pretty",
                      }
                    : {
                        margin: "14px 0 0",
                        fontSize: "12px",
                        lineHeight: 1.7,
                        whiteSpace: "pre-line",
                        textWrap: "pretty",
                      }
                }
              >
                {realce(p.texto)}
              </p>
            );
          if (p.papel === "nota")
            return (
              <aside
                key={p.id}
                style={{
                  marginTop: "16px",
                  backgroundColor: "#FEF9EC",
                  border: "1px solid var(--gold-light)",
                  borderRadius: "10px",
                  padding: "12px 14px",
                }}
              >
                <div
                  style={{
                    fontSize: "8.5px",
                    fontWeight: "700",
                    letterSpacing: "0.18em",
                    color: "var(--gold-dark)",
                    textTransform: "uppercase",
                  }}
                >
                  {p.rotulo}
                </div>
                <p style={{ margin: "6px 0 0", fontSize: "12px", lineHeight: 1.65, whiteSpace: "pre-line", textWrap: "pretty" }}>
                  {realce(p.texto)}
                </p>
              </aside>
            );
          if (p.papel === "grupo") {
            // Na oferta o grupo é uma overline dourada centrada, sem
            // filetes — o que no desenho abre «MESAS A PARTIR DE…».
            if (eOferta)
              return (
                <div
                  key={p.id}
                  style={{
                    margin: "20px auto 0",
                    textAlign: "center",
                    fontSize: "8.5px",
                    fontWeight: "700",
                    letterSpacing: "0.18em",
                    lineHeight: 1.9,
                    color: "var(--gold-dark)",
                    textTransform: "uppercase",
                    textWrap: "balance",
                  }}
                >
                  {p.rotulo}
                </div>
              );
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "10px", margin: "18px 0 0" }}>
                <div style={{ flex: 1, height: "1px", backgroundColor: "#F0E6D0" }} />
                <div
                  style={{
                    fontSize: "8.5px",
                    fontWeight: "700",
                    letterSpacing: "0.22em",
                    color: "var(--gold-dark)",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                    flex: "none",
                  }}
                >
                  {p.rotulo}
                </div>
                <div style={{ flex: 1, height: "1px", backgroundColor: "#F0E6D0" }} />
              </div>
            );
          }
          if (p.papel === "clausula")
            return (
              <div key={p.id} style={{ display: "flex", gap: "12px", padding: "12px 2px 11px", borderBottom: "1px solid #F5ECD7" }}>
                <div
                  style={{
                    flex: "none",
                    width: "20px",
                    textAlign: "center",
                    fontFamily: "'Playfair Display', serif",
                    fontSize: "13px",
                    color: "var(--gold)",
                  }}
                >
                  {p.num}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "12px", fontWeight: "600" }}>{p.rotulo}</div>
                  <p style={{ margin: "5px 0 0", fontSize: "12px", lineHeight: 1.65, whiteSpace: "pre-line", textWrap: "pretty" }}>
                    {realce(p.texto)}
                  </p>
                </div>
              </div>
            );
          // O remate: filete com o rótulo, e o texto centrado em serif.
          return (
            <div key={p.id} style={{ marginTop: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ flex: 1, height: "1px", backgroundColor: "#F0E6D0" }} />
                <div
                  style={{
                    fontSize: "8.5px",
                    fontWeight: "700",
                    letterSpacing: "0.22em",
                    color: "var(--gold-dark)",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                    flex: "none",
                  }}
                >
                  {p.rotulo}
                </div>
                <div style={{ flex: 1, height: "1px", backgroundColor: "#F0E6D0" }} />
              </div>
              <p
                style={{
                  margin: "12px auto 0",
                  maxWidth: "300px",
                  textAlign: "center",
                  fontFamily: "'Playfair Display', serif",
                  fontSize: "14px",
                  lineHeight: 1.7,
                  whiteSpace: "pre-line",
                  textWrap: "pretty",
                }}
              >
                {realce(p.texto)}
              </p>
            </div>
          );
        })}

        {/* A assinatura fixa da casa — não é um bloco, é a folha. */}
        <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <svg width="6" height="6" viewBox="0 0 8 8" aria-hidden="true">
            <rect x="1.75" y="1.75" width="4.5" height="4.5" transform="rotate(45 4 4)" fill="var(--gold)" />
          </svg>
          <p
            style={{
              margin: "10px 0 0",
              fontFamily: "'Playfair Display', serif",
              fontStyle: "italic",
              fontSize: "13.5px",
              color: "var(--gold-dark)",
            }}
          >
            {assinatura?.despedida}
          </p>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "17px", marginTop: "2px" }}>
            {assinatura?.nome}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Editar a folha"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        backgroundColor: "var(--cream)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* A identidade do botão tracejado vive numa classe para o hover
          poder responder (a regra da camada de interacção da casa). */}
      <style>{`
        .dlm-gesto-bloco {
          border: none;
          background-color: transparent;
          color: var(--gray-mid);
        }
        .dlm-gesto-bloco:hover {
          background-color: #fbf7ef;
          color: var(--gold-dark);
        }
        .dlm-gesto-bloco--principal {
          color: var(--gold-dark);
        }
        .dlm-zona-imagem {
          border: 1.5px dashed var(--gold-light);
          background-color: transparent;
          color: var(--gold-dark);
        }
        .dlm-zona-imagem:hover:not(:disabled) {
          background-color: #fbf7ef;
          border-color: var(--gold);
        }
        .dlm-miniatura {
          border: 1px solid #F0E6D0;
          background: none;
        }
        .dlm-miniatura:hover {
          border-color: var(--gold-light);
        }
      `}</style>

      {/* ---- Cabeçalho fixo ---- */}
      <header
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "12px 20px",
          borderBottom: "1px solid #F0E6D0",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...OVERLINE, fontSize: "9px" }}>ENVIOS</div>
          <div
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "21px",
              lineHeight: 1.25,
              color: "var(--charcoal)",
            }}
          >
            Editar a folha
          </div>
        </div>
        {/* Com a coluna persistente visível o botão esconde-se — a
            folha já lá está, ao lado. */}
        {!larga && (
          <button
            onClick={() => setPrevAberta(true)}
            className="acao acao--ouro"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              padding: "8px 14px",
              borderRadius: "999px",
              fontSize: "11.5px",
              fontWeight: "600",
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M1.8 8s2.3-4.2 6.2-4.2S14.2 8 14.2 8s-2.3 4.2-6.2 4.2S1.8 8 1.8 8Z" />
              <circle cx="8" cy="8" r="1.9" />
            </svg>
            Pré-visualizar
          </button>
        )}
        <button
          onClick={onFechar}
          aria-label="Fechar sem guardar"
          className="icone-botao"
          style={{
            width: "34px",
            height: "34px",
            borderRadius: "10px",
            color: "var(--gray-mid)",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </header>

      {/* ---- Corpo com scroll — e, a partir de 1240px, a folha em
           coluna persistente ao lado (o mini-render verdadeiro) ---- */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
          <div style={{ maxWidth: "720px", margin: "0 auto", padding: "26px 20px 64px" }}>
            <label htmlFor="campo-titulo-comunicado" style={{ display: "block", ...OVERLINE }}>
              TÍTULO DA FOLHA
            </label>
            <input
              id="campo-titulo-comunicado"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="caixa-texto"
              style={CAMPO}
            />

            {/* EXTENSÃO AO DESENHO: o editor desenhado não deu campo ao
                subtítulo, mas a folha pública mostra-o (coluna `subtitulo`
                da migração 079) — sem este campo não havia onde o
                escrever. Segue o padrão do título, e é opcional. */}
            <label
              htmlFor="campo-subtitulo-comunicado"
              style={{ display: "block", marginTop: "22px", ...OVERLINE }}
            >
              LINHA DE APRESENTAÇÃO{" "}
              <span style={{ fontWeight: "400", letterSpacing: "0.06em", color: "var(--gray-mid)" }}>
                (opcional)
              </span>
            </label>
            <input
              id="campo-subtitulo-comunicado"
              value={subtitulo}
              onChange={(e) => setSubtitulo(e.target.value)}
              className="caixa-texto"
              style={{ ...CAMPO, fontSize: "13.5px" }}
            />

            {/* A SAUDAÇÃO (Fase C): a coluna própria da 085, escrita aqui
                e desenhada UMA vez no topo da folha — nos dois renders.
                A vírgula deixou de ser magia: agora é um campo. */}
            <label
              htmlFor="campo-saudacao-comunicado"
              style={{ display: "block", marginTop: "22px", ...OVERLINE }}
            >
              SAUDAÇÃO{" "}
              <span style={{ fontWeight: "400", letterSpacing: "0.06em", color: "var(--gray-mid)" }}>
                (opcional)
              </span>
            </label>
            <input
              id="campo-saudacao-comunicado"
              value={saudacao}
              onChange={(e) => setSaudacao(e.target.value)}
              placeholder="Queridas clientes,"
              className="caixa-texto"
              style={{ ...CAMPO, fontSize: "13.5px" }}
            />

            {/* O ASPECTO — a pastilha deslizante da casa (o padrão do
                recorte): trilho FBF7EF, pastilha branca a deslizar 180ms.
                É a MESMA folha com dois temperamentos, não duas folhas. */}
            <div style={{ display: "block", marginTop: "22px", ...OVERLINE }}>ASPECTO</div>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "12px", marginTop: "8px" }}>
              <div
                role="group"
                aria-label="O aspecto da folha"
                style={{
                  position: "relative",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  width: "188px",
                  boxSizing: "border-box",
                  padding: "3px",
                  backgroundColor: "#FBF7EF",
                  border: "1px solid #F0E6D0",
                  borderRadius: "999px",
                }}
              >
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: "3px",
                    bottom: "3px",
                    left: "3px",
                    width: "calc(50% - 3px)",
                    borderRadius: "999px",
                    backgroundColor: "white",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                    transform: registo === "oferta" ? "translateX(100%)" : "none",
                    transition: reduzido ? "none" : "transform 180ms ease",
                  }}
                />
                {[
                  ["aviso", "Sóbrio"],
                  ["oferta", "Convidativo"],
                ].map(([valor, palavra]) => (
                  <button
                    key={valor}
                    onClick={() => setRegisto(valor)}
                    aria-pressed={registo === valor}
                    className="acao"
                    style={{
                      position: "relative",
                      zIndex: 1,
                      padding: "7px 0",
                      border: "none",
                      borderRadius: "999px",
                      backgroundColor: "transparent",
                      fontSize: "11.5px",
                      fontWeight: "600",
                      color: registo === valor ? "var(--gold-dark)" : "var(--gray-mid)",
                      cursor: "pointer",
                    }}
                  >
                    {palavra}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginTop: "30px" }}>
              <div style={OVERLINE}>OS BLOCOS</div>
              <div style={{ fontSize: "11.5px", fontStyle: "italic", color: "var(--gray-mid)" }}>
                A ordem dá o papel a cada bloco — a etiqueta de cada cartão
                mostra-o. *Negrito* e _itálico_, como no WhatsApp.
              </div>
            </div>

            {blocos.map((b) => {
              const up = uploads[b.id] || {};
              const etq = etiquetas.get(b.id);
              return (
              <div
                key={b.id}
                data-blk-id={b.id}
                style={{
                  // relative (e overflow por omissão, visível) para a
                  // etiqueta de papel poder pousar no rebordo do cartão.
                  position: "relative",
                  display: "flex",
                  gap: "10px",
                  alignItems: "flex-start",
                  backgroundColor: "white",
                  // Um bloco por rever veste o filete das marcas (o mesmo
                  // tom do cartão marcado no resto da casa).
                  border: `1px solid ${b.rever ? "#F0D9B5" : "#F0E6D0"}`,
                  borderRadius: "12px",
                  padding: "13px",
                  marginTop: "12px",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                  // O original apaga-se enquanto o fantasma viaja — é o
                  // fantasma que se segue com os olhos.
                  opacity: drag && drag.id === b.id ? 0.35 : 1,
                }}
              >
                {/* A etiqueta de papel (Fase C): diz o que o bloco É na
                    folha — a linha de instrução acima ensina como se FAZ.
                    Congela durante o arrasto; recompõe ao largar. */}
                <span
                  style={{
                    ...(etq && (etq.papel === "nota" || etq.papel === "remate")
                      ? ETIQUETA_PAPEL_FORTE
                      : ETIQUETA_PAPEL),
                    opacity: !etq || etq.papel === "vazio" ? 0.6 : 1,
                  }}
                >
                  {rotuloDaEtiqueta(etq)}
                </span>
                <div
                  onPointerDown={pegar(b.id)}
                  role="button"
                  aria-label="Arrastar para reordenar"
                  title="Arrastar para reordenar"
                  style={{
                    flex: "none",
                    cursor: "grab",
                    touchAction: "none",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    color: "#9B9B9B",
                    fontSize: "15px",
                    lineHeight: 1,
                    padding: "8px 3px",
                  }}
                >
                  ⠿
                </div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                  {/* A revisão que veio do modelo: a pastilha, a pergunta
                      e o gesto que a fecha — tudo em memória até ao
                      Guardar. Emendar o texto abaixo não a limpa. */}
                  {b.rever && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "9px",
                      }}
                    >
                      <span style={PASTILHA_REVER}>A rever</span>
                      <span
                        style={{
                          flex: 1,
                          minWidth: "160px",
                          fontSize: "11.5px",
                          fontStyle: "italic",
                          lineHeight: 1.55,
                          color: "var(--gray-mid)",
                        }}
                      >
                        {b.pergunta || ""}
                      </span>
                      <button
                        onClick={() => marcarRevisto(b.id)}
                        className="acao acao--ouro"
                        style={{
                          flex: "none",
                          padding: "6px 12px",
                          borderRadius: "999px",
                          fontSize: "10.5px",
                          fontWeight: "600",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Está certo
                      </button>
                    </div>
                  )}
                  {b.tipo === "imagem" ? (
                    <>
                      {/* O input real fica escondido; quem fala com ele é o
                          botão (a zona ou a miniatura) — acessível ao teclado
                          sem a fealdade do input de ficheiros. */}
                      <input
                        id={`ficheiro-bloco-${b.id}`}
                        type="file"
                        accept="image/*"
                        onChange={escolherImagem(b.id)}
                        style={{ display: "none" }}
                      />
                      {b.url ? (
                        <button
                          type="button"
                          onClick={() =>
                            document.getElementById(`ficheiro-bloco-${b.id}`)?.click()
                          }
                          title="Trocar a imagem"
                          aria-label="Trocar a imagem"
                          className="acao dlm-miniatura"
                          style={{
                            display: "block",
                            width: "100%",
                            padding: 0,
                            borderRadius: "8px",
                            overflow: "hidden",
                            cursor: "pointer",
                          }}
                        >
                          <img
                            src={b.url}
                            alt={b.legenda || "A imagem do bloco"}
                            style={{
                              display: "block",
                              width: "100%",
                              height: "120px",
                              objectFit: "cover",
                            }}
                          />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            document.getElementById(`ficheiro-bloco-${b.id}`)?.click()
                          }
                          disabled={up.aCarregar}
                          className="acao dlm-zona-imagem"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "7px",
                            width: "100%",
                            boxSizing: "border-box",
                            padding: "18px 12px",
                            borderRadius: "8px",
                            fontSize: "12px",
                            fontWeight: "600",
                            fontStyle: up.aCarregar ? "italic" : "normal",
                            color: up.aCarregar ? "var(--gray-mid)" : undefined,
                          }}
                        >
                          {up.aCarregar ? (
                            "A carregar…"
                          ) : (
                            <>
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 16 16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <rect x="2.5" y="3" width="11" height="10" rx="1.6" />
                                <circle cx="6" cy="6.7" r="1.1" />
                                <path d="M2.5 11.2l3.2-3 2.6 2.4 2.4-2.2 2.8 2.8" />
                              </svg>
                              Escolher a fotografia…
                            </>
                          )}
                        </button>
                      )}
                      {b.url && up.aCarregar && (
                        <div style={{ fontSize: "11.5px", fontStyle: "italic", color: "var(--gray-mid)" }}>
                          A carregar…
                        </div>
                      )}
                      <input
                        value={b.legenda}
                        onChange={(e) => mudaBloco(b.id, "legenda", e.target.value)}
                        placeholder="Legenda (opcional)"
                        className="caixa-texto"
                        style={CAMPO_LINHA}
                      />
                      {up.erro && (
                        <div role="alert" style={{ fontSize: "11.5px", color: "#DC2626" }}>
                          {up.erro}
                        </div>
                      )}
                    </>
                  ) : b.tipo === "chamada" ? (
                    <>
                      <input
                        value={b.rotulo}
                        onChange={(e) => mudaBloco(b.id, "rotulo", e.target.value)}
                        placeholder="O texto do botão"
                        className="caixa-texto"
                        style={CAMPO_ROTULO}
                      />
                      <input
                        value={b.url}
                        onChange={(e) => mudaBloco(b.id, "url", e.target.value)}
                        type="url"
                        placeholder="O endereço que o botão abre (https://…)"
                        className="caixa-texto"
                        style={CAMPO_LINHA}
                      />
                      <input
                        value={b.nota}
                        onChange={(e) => mudaBloco(b.id, "nota", e.target.value)}
                        placeholder="Nota por baixo do botão (opcional)"
                        className="caixa-texto"
                        style={CAMPO_LINHA}
                      />
                    </>
                  ) : (
                    <>
                      <input
                        value={b.rotulo}
                        onChange={(e) => mudaBloco(b.id, "rotulo", e.target.value)}
                        placeholder="Rótulo (opcional)"
                        className="caixa-texto"
                        style={CAMPO_ROTULO}
                      />
                      <textarea
                        value={b.texto}
                        onChange={(e) => mudaBloco(b.id, "texto", e.target.value)}
                        onInput={(e) => ajustarAltura(e.currentTarget)}
                        ref={ajustarAltura}
                        placeholder="O texto do bloco"
                        rows={2}
                        className="caixa-texto"
                        style={{
                          ...CAMPO_LINHA,
                          lineHeight: 1.6,
                          resize: "none",
                          minHeight: "38px",
                          // Nos browsers que o falam, a caixa cresce sozinha;
                          // nos outros, o ajustarAltura acima faz o mesmo ofício.
                          fieldSizing: "content",
                        }}
                      />
                      {/* A guarda anti-duplicação da saudação: aviso âmbar
                          com um gesto de um toque — nunca correção muda. */}
                      {avisoSaudacaoId === b.id && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "8px",
                            fontSize: "11.5px",
                            lineHeight: 1.5,
                            color: "#92400E",
                            backgroundColor: "#FEF3E2",
                            border: "1px solid #F0D9B5",
                            borderRadius: "8px",
                            padding: "6px 10px",
                          }}
                        >
                          <span style={{ flex: 1, minWidth: "180px" }}>
                            Esta linha parece uma saudação — já há um campo
                            para ela, lá em cima.
                          </span>
                          <button
                            onClick={() => tirarLinhaSaudacao(b.id)}
                            className="acao"
                            style={{
                              flex: "none",
                              padding: 0,
                              border: "none",
                              backgroundColor: "transparent",
                              fontSize: "11.5px",
                              fontWeight: "600",
                              color: "var(--gold-dark)",
                              textDecoration: "underline",
                              textUnderlineOffset: "2px",
                              cursor: "pointer",
                            }}
                          >
                            Tirar a linha do bloco
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
                {armadoId === b.id ? (
                  <button
                    onClick={() => remover(b.id)}
                    className="acao"
                    style={{
                      flex: "none",
                      marginTop: "3px",
                      padding: "7px 11px",
                      border: "1px solid #FECACA",
                      borderRadius: "999px",
                      backgroundColor: "#FEF2F2",
                      color: "#DC2626",
                      fontSize: "11.5px",
                      fontWeight: "600",
                    }}
                  >
                    Confirmar? O bloco sai.
                  </button>
                ) : (
                  <button
                    onClick={() => remover(b.id)}
                    aria-label="Remover bloco"
                    title="Remover bloco"
                    className="icone-botao icone-botao--perigo"
                    style={{
                      flex: "none",
                      width: "30px",
                      height: "30px",
                      marginTop: "3px",
                      color: "#C4C4C4",
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  </button>
                )}
              </div>
              );
            })}

            {/* Os três gestos de acrescentar, lado a lado no mesmo
                tracejado: o texto é o principal (ganha espaço e cor), a
                imagem e a chamada acompanham. */}
            <div
              style={{
                display: "flex",
                gap: "6px",
                marginTop: "12px",
                boxSizing: "border-box",
                padding: "6px",
                border: "1.5px dashed var(--gold-light)",
                borderRadius: "12px",
              }}
            >
              <button
                onClick={() => adicionar()}
                className="acao dlm-gesto-bloco dlm-gesto-bloco--principal"
                style={{
                  flex: 1.6,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "7px",
                  padding: "10px 8px",
                  borderRadius: "8px",
                  fontSize: "12.5px",
                  fontWeight: "600",
                  letterSpacing: "0.03em",
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M3 4.5h10M3 8h10M3 11.5h6.5" />
                </svg>
                + Texto
              </button>
              <button
                onClick={() => adicionar("imagem")}
                className="acao dlm-gesto-bloco"
                style={{
                  flex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "7px",
                  padding: "10px 8px",
                  borderRadius: "8px",
                  fontSize: "12.5px",
                  fontWeight: "500",
                  letterSpacing: "0.03em",
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="2.5" y="3" width="11" height="10" rx="1.6" />
                  <circle cx="6" cy="6.7" r="1.1" />
                  <path d="M2.5 11.2l3.2-3 2.6 2.4 2.4-2.2 2.8 2.8" />
                </svg>
                + Imagem
              </button>
              <button
                onClick={() => adicionar("chamada")}
                className="acao dlm-gesto-bloco"
                style={{
                  flex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "7px",
                  padding: "10px 8px",
                  borderRadius: "8px",
                  fontSize: "12.5px",
                  fontWeight: "500",
                  letterSpacing: "0.03em",
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <rect x="2" y="5.2" width="12" height="5.6" rx="2.8" />
                  <path d="M5.5 8h5" />
                </svg>
                + Chamada
              </button>
            </div>
          </div>
        </div>

        {larga && (
          <aside
            aria-label="Pré-visualização da folha"
            style={{
              flex: "none",
              width: "432px",
              boxSizing: "border-box",
              overflowY: "auto",
              padding: "18px 18px 48px",
              backgroundColor: "#F6F2E9",
              borderLeft: "1px solid #F0E6D0",
            }}
          >
            {previa}
          </aside>
        )}
      </div>

      {/* ---- Rodapé fixo ---- */}
      <footer
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "12px 20px",
          borderTop: "1px solid #F0E6D0",
        }}
      >
        <div role="alert" style={{ flex: 1, minWidth: 0, fontSize: "12.5px", color: "#DC2626" }}>
          {erro}
        </div>
        <button
          onClick={onFechar}
          className="acao acao--neutra"
          style={{
            flex: "none",
            padding: "10px 16px",
            borderRadius: "10px",
            fontSize: "12.5px",
            fontWeight: "600",
          }}
        >
          Cancelar
        </button>
        <button
          onClick={guardar}
          disabled={aGuardar || guardado}
          className="acao acao--cheia"
          style={{
            flex: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            padding: "10px 20px",
            borderRadius: "10px",
            fontSize: "12.5px",
            fontWeight: "600",
            boxShadow: "0 4px 12px rgba(201,168,76,0.30)",
          }}
        >
          {guardado && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 8.6l3.2 3.2L13 5" />
            </svg>
          )}
          {guardado ? "Guardado" : "Guardar"}
        </button>
      </footer>

      {/* ---- O cartão-fantasma do arrasto ---- */}
      {drag && (
        <div
          style={{
            position: "fixed",
            left: `${fantasma.x}px`,
            top: `${fantasma.y}px`,
            width: `${fantasma.w}px`,
            zIndex: 80,
            pointerEvents: "none",
            boxSizing: "border-box",
            backgroundColor: "white",
            border: "1px solid var(--gold-light)",
            borderRadius: "12px",
            padding: "12px 14px",
            boxShadow: "0 8px 28px rgba(0,0,0,0.15)",
            transform: "rotate(0.5deg) scale(1.02)",
          }}
        >
          <div
            style={{
              fontSize: "12.5px",
              fontWeight: "600",
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {drag.rotulo}
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "var(--gray-mid)",
              marginTop: "3px",
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {drag.texto}
          </div>
        </div>
      )}

      {/* ---- O véu e a gaveta da pré-visualização — só abaixo de
           1240px: com a coluna persistente no ecrã, nem montam ---- */}
      {!larga && (
        <>
          <div
            onClick={() => setPrevAberta(false)}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(26,26,26,0.28)",
              opacity: prevAberta ? 1 : 0,
              pointerEvents: prevAberta ? "auto" : "none",
              transition: reduzido ? "none" : "opacity 200ms ease",
              zIndex: 90,
            }}
          />
          <aside
            aria-hidden={!prevAberta}
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(432px, 94vw)",
              boxSizing: "border-box",
              backgroundColor: "var(--cream)",
              borderLeft: "1px solid #F0E6D0",
              boxShadow: "-12px 0 48px rgba(0,0,0,0.12)",
              zIndex: 95,
              transform: prevAberta ? "translateX(0)" : "translateX(103%)",
              transition: reduzido ? "none" : GAVETA_TRANSICAO,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                flex: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                padding: "12px 16px",
                borderBottom: "1px solid #F0E6D0",
              }}
            >
              <div style={OVERLINE}>PRÉ-VISUALIZAÇÃO</div>
              <button
                onClick={() => setPrevAberta(false)}
                aria-label="Fechar a pré-visualização"
                className="icone-botao"
                style={{ width: "30px", height: "30px", color: "var(--gray-mid)" }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "22px 16px 48px" }}>
              {previa}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
