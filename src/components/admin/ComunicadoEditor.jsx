import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  LOGO_CASA as logoUrl,
  EMPRESA,
  LINHA_ACTIVIDADE,
  ASSINATURA_FOLHA,
} from "../../lib/casa";
import {
  guardarComunicado,
  idDeBloco,
  comporFolha,
  subirImagemFolha,
} from "../../lib/comunicados";

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
//   onFechar   — fecha sem guardar
//   onGuardado(rec) — guardou; recebe o registo actualizado
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

export default function ComunicadoEditor({ comunicado, onFechar, onGuardado }) {
  const reduzido = useReducedMotion();

  const [titulo, setTitulo] = useState(comunicado.titulo || "");
  const [subtitulo, setSubtitulo] = useState(comunicado.subtitulo || "");
  // O temperamento da MESMA folha (080): aviso sóbrio ou oferta com
  // desejo. Grava-se com o resto, no Guardar — não é um acto à parte.
  const [registo, setRegisto] = useState(comunicado.registo || "aviso");
  // Uma folha sem blocos abre com um em branco à espera — há sempre onde
  // escrever. O id nasce aqui e nunca mais se regenera. Cada tipo guarda
  // SÓ os campos que são seus — um cartão de imagem não arrasta um
  // `texto` fantasma que a derivação fosse ler por engano.
  const [blocos, setBlocos] = useState(() =>
    Array.isArray(comunicado.blocos) && comunicado.blocos.length
      ? comunicado.blocos.map((b) =>
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
              : { id: b.id, rotulo: b.rotulo || "", texto: b.texto || "" },
        )
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

  // --- O arrasto -------------------------------------------------
  // O estado visível (fantasma) vive no React; o que os listeners de
  // janela precisam de ler no meio do gesto vive em refs, para os
  // handlers poderem ser estáveis sem closures viciadas.
  const [drag, setDrag] = useState(null); // {id, rotulo, texto} do fantasma
  const [fantasma, setFantasma] = useState({ x: 0, y: 0, w: 0 });
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
  const mudaBloco = (id, campo, valor) =>
    setBlocos((prev) =>
      prev.map((b) => (b.id === id ? { ...b, [campo]: valor } : b)),
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
  // incompleta — as mensagens seguem o molde da existente.
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
      const rec = await guardarComunicado(comunicado.id, {
        titulo: titulo.trim(),
        subtitulo: subtitulo.trim() || null,
        registo,
        // Cada bloco guarda SÓ os campos do seu tipo — nos de texto o
        // papel continua a derivar-se sempre, nunca se grava; nos
        // tipados grava-se o `tipo`, que é declaração e não derivação.
        blocos: blocos.map((b) =>
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
              : { id: b.id, rotulo: b.rotulo, texto: b.texto },
        ),
      });
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
  // A pré-visualização segue o registo — É A MESMA REGRA da folha
  // pública; se divergirem, quem manda é a folha.
  const eOferta = registo === "oferta";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Editar a folha do comunicado"
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
          <div style={{ ...OVERLINE, fontSize: "9px" }}>COMUNICADO</div>
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

      {/* ---- Corpo com scroll ---- */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto", padding: "26px 20px 64px" }}>
          <label htmlFor="campo-titulo-comunicado" style={{ display: "block", ...OVERLINE }}>
            TÍTULO DA FOLHA
          </label>
          <input
            id="campo-titulo-comunicado"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="O nome do comunicado"
            className="caixa-texto"
            style={CAMPO}
          />

          {/* EXTENSÃO AO DESENHO: o editor desenhado não deu campo ao
              subtítulo, mas a folha pública mostra-o (coluna `subtitulo`
              da migração 079) — sem este campo não havia onde o
              escrever. Segue o molde do título, e é opcional. */}
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
            placeholder="Uma linha por baixo do título, se a folha a pedir"
            className="caixa-texto"
            style={{ ...CAMPO, fontSize: "13.5px" }}
          />

          {/* O REGISTO — a pastilha deslizante da casa (o molde do
              recorte): trilho FBF7EF, pastilha branca a deslizar 180ms.
              É a MESMA folha com dois temperamentos, não duas folhas. */}
          <div style={{ display: "block", marginTop: "22px", ...OVERLINE }}>REGISTO</div>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "12px", marginTop: "8px" }}>
            <div
              role="group"
              aria-label="O registo da folha"
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
                ["aviso", "Aviso"],
                ["oferta", "Oferta"],
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
            <div style={{ fontSize: "11.5px", fontStyle: "italic", color: "var(--gray-mid)" }}>
              {registo === "oferta"
                ? "A folha ganha desejo: título maior, prosa centrada, imagem à largura."
                : "A folha fala sóbria — o tom dos avisos da casa."}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginTop: "30px" }}>
            <div style={OVERLINE}>OS BLOCOS</div>
            <div style={{ fontSize: "11.5px", fontStyle: "italic", color: "var(--gray-mid)" }}>
              A ordem compõe a folha: o primeiro bloco com rótulo é a nota em
              destaque, o último é o remate, e um bloco só com rótulo abre um
              grupo.
            </div>
          </div>

          {blocos.map((b) => {
            const up = uploads[b.id] || {};
            return (
            <div
              key={b.id}
              data-blk-id={b.id}
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "flex-start",
                backgroundColor: "white",
                border: "1px solid #F0E6D0",
                borderRadius: "12px",
                padding: "13px",
                marginTop: "12px",
                boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                // O original apaga-se enquanto o fantasma viaja — é o
                // fantasma que se segue com os olhos.
                opacity: drag && drag.id === b.id ? 0.35 : 1,
              }}
            >
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
                  Confirmar?
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

          <div
            style={{
              marginTop: "20px",
              textAlign: "center",
              fontSize: "11.5px",
              fontStyle: "italic",
              color: "var(--gray-mid)",
            }}
          >
            {`A assinatura — «${ASSINATURA_FOLHA.despedida} ${ASSINATURA_FOLHA.nome}» — fecha todas as folhas da casa.`}
          </div>
        </div>
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

      {/* ---- O véu e a gaveta da pré-visualização ---- */}
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "7px" }}>
            <img
              src={logoUrl}
              alt={EMPRESA.designacao}
              style={{ height: "84px", width: "auto", display: "block" }}
            />
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
              {LINHA_ACTIVIDADE.toUpperCase()}
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
              if (p.papel === "prosa")
                return (
                  <div key={p.id}>
                    {p.saudacao && (
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
                        {p.saudacao}
                      </p>
                    )}
                    {/* Na oferta a prosa lê-se ao centro, mais desafogada
                        — a folha do desenho fala assim. */}
                    <p
                      style={
                        eOferta
                          ? {
                              margin: p.saudacao ? "8px auto 0" : "18px auto 0",
                              maxWidth: "280px",
                              textAlign: "center",
                              fontSize: "12.5px",
                              lineHeight: 1.85,
                              whiteSpace: "pre-line",
                              textWrap: "pretty",
                            }
                          : {
                              margin: p.saudacao ? "8px 0 0" : "14px 0 0",
                              fontSize: "12px",
                              lineHeight: 1.7,
                              whiteSpace: "pre-line",
                              textWrap: "pretty",
                            }
                      }
                    >
                      {p.texto}
                    </p>
                  </div>
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
                      {p.texto}
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
                        {p.texto}
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
                    {p.texto}
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
                {ASSINATURA_FOLHA.despedida}
              </p>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "17px", marginTop: "2px" }}>
                {ASSINATURA_FOLHA.nome}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
