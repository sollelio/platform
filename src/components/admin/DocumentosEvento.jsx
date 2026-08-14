import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { documentosDoEvento, marcarPassoDocumento } from "../../lib/documentos";
import {
  estadoFormularioDoEvento,
  podeSerAdoptadoPor,
} from "../../lib/invites";
import FormularioDoEvento from "./FormularioDoEvento";
import { abrirQuestionarioComoCliente } from "../../lib/camposFormulario";
import { formatarEuros } from "./orcamentos/orcamentoConfig";
import { Icone } from "./Navegacao";
import { Esqueleto } from "./acabamento";

// ============================================================
// DocumentosEvento — o separador Documentos da página do evento.
//
// Cinco botões com o mesmo peso não diziam qual era o próximo. Aqui
// são cinco LINHAS com peso diferente: o próximo gesto em destaque
// dourado, o que já está feito em verde discreto, o que ainda não tem
// vez em cinzento.
//
// O estado de cada documento é o percurso gerar → enviar → assinar,
// com data. "Gerado" deduz-se (a linha existe em `documentos`);
// enviado e assinado são carimbos explícitos (migração 030) — a app
// não tem como saber que ela carregou em enviar no WhatsApp dela.
//
// A ORDEM dos cartões é da Nádia: arrasta pelo punho ⠿ (o gesto do
// editor de blocos) e a sequência guarda-se no navegador — uma ordem
// só, para todas as fichas. O destaque dourado continua a ser da fase
// do funil, esteja o cartão onde estiver.
// ============================================================

const TIPOS = {
  orcamento: { nome: "Orçamento", icone: "orcamento", ultimo: "aceite" },
  proposta: { nome: "Projecto", icone: "proposta", ultimo: "assinado" },
  contrato: { nome: "Contrato", icone: "contrato", ultimo: "assinado" },
};

// O passo por fazer diz o VERBO ("assinar"), o já feito diz o estado
// ("assinado"). Cortar o "o" final e colar "ar" dava "assinadar" — o
// português não se conjuga por aritmética de sufixos, por isso o par
// vem escrito.
const POR_FAZER = { assinado: "assinar", aceite: "aceitar" };

// A ordem dos cartões é da Nádia — global, uma para todas as fichas,
// guardada no navegador dela. A BD não sabe de preferências visuais;
// noutro computador volta a ordem de origem e reordena-se uma vez.
const ORDEM_DE_ORIGEM = [
  "briefing",
  "formulario",
  "orcamento",
  "proposta",
  "contrato",
];
const CHAVE_ORDEM = "dlm.documentosEvento.ordem";

const lerOrdem = () => {
  try {
    const guardada = JSON.parse(localStorage.getItem(CHAVE_ORDEM));
    if (!Array.isArray(guardada)) return ORDEM_DE_ORIGEM;
    // Só cartões conhecidos e sem repetidos; um cartão novo da casa
    // entra no fim — nunca desaparece por a ordem guardada ser antiga.
    const ordem = guardada.filter(
      (id, i) => ORDEM_DE_ORIGEM.includes(id) && guardada.indexOf(id) === i,
    );
    for (const id of ORDEM_DE_ORIGEM) if (!ordem.includes(id)) ordem.push(id);
    return ordem;
  } catch {
    return ORDEM_DE_ORIGEM;
  }
};

const guardarOrdem = (ordem) => {
  try {
    localStorage.setItem(CHAVE_ORDEM, JSON.stringify(ordem));
  } catch {
    // Sem localStorage (modo privado apertado), a ordem vive só na sessão.
  }
};

// Que documento é o próximo gesto, a partir da fase do funil — o mesmo
// eixo que a Jornada mostra, para as duas peças nunca discordarem.
// Ordem final (077): o orçamento é o documento em jogo até o sinal
// entrar (fase sinal = aceite, 50% por pagar); com o sinal pago (fase
// contrato) o gesto é o contrato; assinado (cliente), o projecto.
const DOC_DA_FASE = {
  interessado: "orcamento",
  orcamento: "orcamento",
  sinal: "orcamento",
  contrato: "contrato",
  cliente: "proposta",
  projecto: "proposta",
};

const dataCurta = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "2-digit",
      })
    : null;

const desdeQuando = (iso) => {
  if (!iso) return null;
  const horas = Math.round((Date.now() - new Date(iso)) / 3600000);
  if (horas < 1) return "actualizada agora mesmo";
  if (horas < 24) return `actualizada há ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? "actualizada ontem" : `actualizada há ${dias} dias`;
};

// Uma bolinha do percurso: cheia (feito), anel (a seguir), vazia.
// O visto salta com mola quando se marca À FRENTE DOS OLHOS — marcar
// "assinado" é um marco do negócio, merece confirmação à altura.
function Passo({ rotulo, feito, aSeguir, data, onClick }) {
  const primeiraPintura = useRef(true);
  useEffect(() => {
    primeiraPintura.current = false;
  }, []);
  const reduzirMovimento = useReducedMotion();

  const conteudo = (
    <>
      <span
        style={{
          width: "14px",
          height: "14px",
          borderRadius: "50%",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          backgroundColor: feito ? "var(--gold)" : aSeguir ? "white" : "#F1EBDD",
          border: aSeguir ? "2px solid var(--gold)" : "none",
          transition: "background-color 300ms ease",
        }}
      >
        {feito && (
          <motion.span
            initial={
              primeiraPintura.current || reduzirMovimento
                ? false
                : { scale: 0, opacity: 0 }
            }
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 520, damping: 26 }}
            style={{ display: "inline-flex" }}
          >
            <svg width="8" height="8" viewBox="0 0 24 24">
              <path
                d="M4.5 12.5l5 5 10-10"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.span>
        )}
      </span>
      <span
        style={{
          fontSize: "11px",
          color: feito
            ? "var(--gray-mid)"
            : aSeguir
              ? "var(--gold-dark)"
              : "#B0A88F",
          fontWeight: aSeguir ? "600" : "400",
          whiteSpace: "nowrap",
        }}
      >
        {rotulo}
        {data ? ` ${data}` : ""}
      </span>
    </>
  );

  if (!onClick) {
    return (
      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {conteudo}
      </span>
    );
  }
  return (
    <button
      onClick={onClick}
      title={feito ? "Desmarcar" : `Marcar como ${rotulo}`}
      className="toca"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        border: "none",
        background: "none",
        padding: 0,
      }}
    >
      {conteudo}
    </button>
  );
}

// O punho do arrasto — o mesmo ⠿ do editor de blocos, o gesto que a
// Nádia já conhece. Fica à esquerda do ícone, fora do miolo clicável.
function Punho({ aoPegar }) {
  return (
    <div
      onPointerDown={aoPegar}
      role="button"
      aria-label="Arrastar para reordenar"
      title="Arrastar para reordenar"
      style={{
        cursor: "grab",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        color: "var(--gray-mid)",
        fontSize: "14px",
        lineHeight: 1,
        padding: "6px 2px",
        justifySelf: "center",
      }}
    >
      ⠿
    </div>
  );
}

function Linha({ icone, titulo, sufixo, descricao, passos, accoes, tom, punho }) {
  const destaque = tom === "destaque";
  const adormecido = tom === "adormecido";

  return (
    <div
      style={{
        backgroundColor: destaque ? "#FFFDF6" : "white",
        border: destaque
          ? "1.5px solid var(--gold)"
          : "1px solid #F0E6D0",
        borderRadius: "14px",
        padding: "16px 20px",
        display: "grid",
        gridTemplateColumns: punho
          ? "14px 34px minmax(220px, 1fr) auto auto"
          : "34px minmax(220px, 1fr) auto auto",
        gap: "18px",
        alignItems: "center",
        boxShadow: destaque ? "0 4px 14px rgba(201,168,76,0.14)" : "none",
      }}
    >
      {punho}
      <span style={{ color: adormecido ? "#DCD3C0" : "var(--gold)" }}>
        <Icone nome={icone} tamanho={22} />
      </span>
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            fontSize: "15px",
            margin: "0 0 3px",
            color: adormecido ? "var(--gray-mid)" : "var(--charcoal)",
          }}
        >
          {titulo}
          {sufixo && (
            <span style={{ fontSize: "12px", color: "#9B9B9B" }}> {sufixo}</span>
          )}
        </p>
        <p
          style={{
            fontSize: "12px",
            margin: 0,
            color: destaque
              ? "var(--gold-dark)"
              : adormecido
                ? "#9B9B9B"
                : "var(--gray-mid)",
          }}
        >
          {descricao}
        </p>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          flexWrap: "wrap",
        }}
      >
        {passos}
      </div>
      <div
        style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}
      >
        {accoes}
      </div>
    </div>
  );
}

// A identidade (cor, hover, foco) vive nas classes .acao--* do
// index.css; aqui fica a medida — e o realce do botão principal.
const classeBotao = (variante) =>
  variante === "principal"
    ? "acao acao--cheia"
    : variante === "ouro"
      ? "acao acao--ouro"
      : "acao acao--neutra";

const medidaBotao = (variante) => ({
  padding: variante === "principal" ? "9px 16px" : "8px 14px",
  borderRadius: "10px",
  fontSize: variante === "principal" ? "12.5px" : "12px",
  fontWeight: variante === "principal" ? "600" : "500",
  whiteSpace: "nowrap",
  ...(variante === "principal"
    ? { boxShadow: "0 4px 12px rgba(201,168,76,0.30)" }
    : {}),
});

export default function DocumentosEvento({
  submissao,
  // Uma chave opaca que a página muda quando os carimbos podem ter
  // mudado por fora (a folha do Acompanhamento publicou; um acto do
  // portal assinou) — cada mudança relê `documentos` em silêncio.
  refrescarEm = "",
  invites = [],
  // O painel de criação precisa dos modelos: é deles que saem os campos
  // para escolher. A página tem-nos e não os passava.
  eventTypes = [],
  // O convite criado tem de subir, para a linha mudar de estado no
  // instante em que ela espera confirmação (a página não subscreve
  // realtime de convites).
  onConviteCriado,
  // Os formulários soltos (sem evento nenhum) e o gesto de adoptar um.
  // O aviso que sai daqui é a metade que apanha o erro no instante em
  // que ele nasce: ela ia criar um segundo formulário para alguém que
  // já tem um à espera.
  orfaos = [],
  onAdoptarOrfao,
  // A reserva provisória deste evento, se houver — o convite nasce
  // ligado a ela para que submeter a confirme.
  reservaProvisoria = null,
  // Para o «Preencher» sair daqui em vez de atravessar o backoffice.
  onNavegar,
  onAvisar,
  onGerarDocumento,
  onVerFormulario,
  realce = null,
  onRealceConsumido,
  onContagem,
}) {
  const [documentos, setDocumentos] = useState([]);
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState(null);
  // A aterragem da pílula/etapa da Jornada: a linha em causa acende —
  // gerada ou por gerar, é a mesma linha (a afordância de criação é o
  // caso normal: o próximo gesto é quase sempre criar o que falta).
  const [pulsando, setPulsando] = useState(null); // "orcamento"|"proposta"|"contrato"|"formulario"
  const linhaRefs = useRef({});

  // --- A ordem e o arrasto (o molde do editor de blocos) ----------
  const [ordem, setOrdem] = useState(lerOrdem);
  useEffect(() => {
    guardarOrdem(ordem);
  }, [ordem]);

  const [drag, setDrag] = useState(null); // {id, titulo, icone} do fantasma
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
      // O alvo é o cartão por baixo do dedo — elementsFromPoint
      // atravessa o fantasma (pointer-events: none) e encontra-o.
      const alvo = document
        .elementsFromPoint(p.x, p.y)
        .find(
          (el) => el.dataset && el.dataset.docId && el.dataset.docId !== d.id,
        );
      if (alvo) {
        setOrdem((prev) => {
          const de = prev.indexOf(d.id);
          const para = prev.indexOf(alvo.dataset.docId);
          if (de < 0 || para < 0 || de === para) return prev;
          const seg = prev.slice();
          seg.splice(para, 0, seg.splice(de, 1)[0]);
          return seg;
        });
      }
      setFantasma((g) => ({ ...g, x: p.x - d.dx, y: p.y - d.dy }));
    });
  }, []);

  const aoLargar = useCallback(() => {
    window.removeEventListener("pointermove", aoMover);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    dragRef.current = null;
    setDrag(null);
  }, [aoMover]);

  // Um só handler para os cinco punhos: o cartão (e o seu id) lê-se do
  // próprio DOM ao pegar — é o que deixa o handler ser estável.
  const aoPegar = useCallback(
    (e) => {
      // Só o gesto principal pega — o botão direito tem outros ofícios.
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      const cartao = e.currentTarget.closest("[data-doc-id]");
      if (!cartao) return;
      const id = cartao.dataset.docId;
      const r = cartao.getBoundingClientRect();
      dragRef.current = { id, dx: e.clientX - r.left, dy: e.clientY - r.top };
      setDrag({
        id,
        titulo: TIPOS[id]
          ? TIPOS[id].nome
          : id === "briefing"
            ? "Briefing"
            : "Formulário",
        icone: TIPOS[id]
          ? TIPOS[id].icone
          : id === "briefing"
            ? "documentos"
            : "formularios",
      });
      setFantasma({ x: r.left, y: r.top, w: r.width });
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", aoMover);
      window.addEventListener("pointerup", aoLargar, { once: true });
    },
    [aoMover, aoLargar],
  );

  // A limpeza do desmonte: rAF, listeners e o corpo devolvido como estava.
  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoLargar);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    },
    [aoMover, aoLargar],
  );

  const submissionId = submissao?.id;

  useEffect(() => {
    if (!realce || !carregado) return;
    // Um realce de OUTRO separador não se consome aqui — com os
    // separadores todos montados em simultâneo, roubá-lo era apagar a
    // aterragem antes de o destino certo a fazer.
    const alvo = ["orcamento", "proposta", "contrato", "formulario"].includes(
      realce.alvo,
    )
      ? realce.alvo
      : null;
    if (!alvo) return;
    setPulsando(alvo);
    linhaRefs.current[alvo]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    setTimeout(() => setPulsando(null), 2600);
    if (onRealceConsumido) onRealceConsumido();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realce, carregado]);

  // A contagem do separador: quantos documentos já foram gerados.
  useEffect(() => {
    if (carregado && onContagem) onContagem(documentos.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregado, documentos]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const docs = await documentosDoEvento(submissionId);
        if (cancelado) return;
        setDocumentos(docs);
        setCarregado(true);
      } catch (e) {
        if (cancelado) return;
        console.error(e);
        setErro(
          "Não foi possível ler o estado dos documentos (a migração 030 já correu?).",
        );
        setCarregado(true);
      }
    })();
    return () => {
      cancelado = true;
    };
    // refrescarEm: o salto vem de fora (publicação, assinatura) e o
    // refresco é silencioso — `carregado` já é true, o esqueleto não
    // volta a piscar.
  }, [submissionId, refrescarEm]);

  const porTipo = useMemo(() => {
    const mapa = {};
    for (const d of documentos) mapa[d.tipo] = d;
    return mapa;
  }, [documentos]);

  const proximoDoc = DOC_DA_FASE[submissao?.fase] || null;

  // ------------------------------------------------------------
  // O COMPOSER — a bancada da ponte (FormularioDoEvento), de ecrã
  // inteiro. Esta linha só guarda a intenção de o abrir: o rascunho, a
  // ponte e o createInvite vivem lá dentro. O painel inline (e com ele
  // o bloco de botões «Copiar») morreu — o transporte do pedido para os
  // campos é agora trabalho do código, não da Nádia.
  // ------------------------------------------------------------
  const [mostrarComposer, setMostrarComposer] = useState(false);
  const [aAdoptar, setAAdoptar] = useState(null);

  // «Preencher» — a Nádia responde ela própria. Sai daqui directamente:
  // antes fazia uma viagem ao separador Formulários só para chegar ao
  // mesmo sítio, e essa viagem era o último uso do handshake de
  // navegação que agora desaparece.
  const preencher = (convite) =>
    abrirQuestionarioComoCliente(convite, eventTypes, {
      avisar: (m) => onAvisar && onAvisar(m),
      navegar: (destino) => onNavegar && onNavegar(destino),
    });

  // AS TRÊS CONDIÇÕES, da lib — não repetidas aqui. Sem elas o aviso
  // ofereceria adopções inválidas: um Aniversário apontado a um
  // Casamento reescreve o tipo e funde respostas de outro modelo, e um
  // convite vindo de reserva não se adopta de forma alguma.
  const orfaosAdoptaveis = (orfaos || []).filter((o) =>
    podeSerAdoptadoPor(o, submissao),
  );

  // O estado da linha Formulário vem da fonte única (lib/invites) — a
  // mesma conta da Jornada e do drawer. "preenchido-noutro" é o rasto
  // de um convite que duplicou: apontado cá, respostas noutro evento.
  const { convite, estado: estadoFormulario } = estadoFormularioDoEvento(
    invites,
    submissionId,
  );
  // Respondido pelo ACOMPANHAMENTO (03/08): mesmas respostas, outra
  // porta. Sem isto, a linha convidava a criar um convite para
  // perguntas que a cliente já respondeu no portal.
  const respondidoPortal =
    estadoFormulario !== "preenchido" && !!submissao?.questionario_entregue_em;
  const formularioFeito = estadoFormulario === "preenchido" || respondidoPortal;

  const alternarPasso = async (doc, passo) => {
    const coluna = passo === "enviado" ? "enviado_em" : "assinado_em";
    try {
      const atualizado = await marcarPassoDocumento(
        doc.id,
        passo,
        doc[coluna] ? null : new Date(),
      );
      setDocumentos((atuais) =>
        atuais.map((d) => (d.id === atualizado.id ? { ...d, ...atualizado } : d)),
      );
    } catch (e) {
      console.error(e);
      // O trancado é TERMINAL — convidar a repetir era prometer que a
      // repetição ia mudar alguma coisa, e não ia.
      setErro(
        /DOCUMENTO_TRANCADO/.test(e?.message || "")
          ? "Este contrato está assinado e trancado — não se altera. Um erro resolve-se com contrato novo."
          : "Não foi possível guardar o estado. Tente novamente.",
      );
    }
  };

  if (!carregado) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Esqueleto key={i} h={74} r={14} />
        ))}
      </div>
    );
  }

  // Os dois cartões fora do molde dos tipos, cada um já desenhado —
  // quem dita a sequência é a `ordem` da Nádia, no return.
  const cartoes = {
    // Briefing — sempre disponível, sem percurso: é a folha do
    // evento, não um documento que se gera e envia.
    briefing: (
      <div
        key="briefing"
        data-doc-id="briefing"
        style={{
          borderRadius: "14px",
          opacity: drag?.id === "briefing" ? 0.35 : 1,
        }}
      >
      <Linha
        punho={<Punho aoPegar={aoPegar} />}
        icone="documentos"
        titulo="Briefing"
        descricao={`A folha do evento · ${
          desdeQuando(submissao?.updated_at) || "sempre a par do evento"
        } · /briefing/:id em favoritos`}
        passos={
          <span
            style={{
              fontSize: "11px",
              padding: "4px 11px",
              borderRadius: "999px",
              backgroundColor: "#FEF9EC",
              color: "var(--gold-dark)",
              border: "1px solid var(--gold-light)",
              fontWeight: "500",
              whiteSpace: "nowrap",
            }}
          >
            Sempre disponível
          </span>
        }
        accoes={
          <button
            onClick={() => window.open(`/briefing/${submissionId}`, "_blank")}
            className={classeBotao("ouro")}
            style={medidaBotao("ouro")}
          >
            Abrir folha →
          </button>
        }
      />
      </div>
    ),

    // Formulário — o percurso vive nos convites, não em `documentos`
    formulario: (
      <div
        key="formulario"
        data-doc-id="formulario"
        ref={(el) => (linhaRefs.current.formulario = el)}
        className={pulsando === "formulario" ? "realce-pulso" : undefined}
        style={{
          borderRadius: "14px",
          opacity: drag?.id === "formulario" ? 0.35 : 1,
        }}
      >
      <Linha
        punho={<Punho aoPegar={aoPegar} />}
        icone="formularios"
        titulo="Formulário"
        descricao={
          mostrarComposer
            ? "A compor…"
            : respondidoPortal
              ? `Respondido no acompanhamento ${dataCurta(submissao.questionario_entregue_em)} — não precisa de convite`
              : estadoFormulario === "nenhum"
            ? "Ainda não foi criado"
            : estadoFormulario === "preenchido"
              ? `Criado ${dataCurta(convite.created_at)} · respondido pela cliente`
              : estadoFormulario === "preenchido-noutro"
                ? "As respostas ficaram noutro evento (convite antigo sem alvo) — cria um formulário novo apontado a este evento"
                : `Criado ${dataCurta(convite.created_at)} · à espera de resposta`
        }
        tom={
          mostrarComposer
            ? "destaque"
            : estadoFormulario === "nenhum" && !respondidoPortal
              ? "adormecido"
              : undefined
        }
        passos={
          respondidoPortal && !convite ? (
            // Sem convite não há passo «criado» a cobrar: o caminho foi
            // outro, e a régua não pode pedir o que já não faz falta.
            <Passo
              rotulo="respondido"
              data={dataCurta(submissao.questionario_entregue_em)}
              feito
            />
          ) : (
            <>
              <Passo
                rotulo="criado"
                data={convite ? dataCurta(convite.created_at) : null}
                feito={!!convite}
                aSeguir={estadoFormulario === "nenhum" && !respondidoPortal}
              />
              <Passo rotulo="preenchido" feito={formularioFeito} />
            </>
          )
        }
        accoes={
          respondidoPortal ? (
            <button
              onClick={() => onVerFormulario && onVerFormulario(submissao)}
              className={classeBotao("ouro")}
              style={medidaBotao("ouro")}
            >
              Ver respostas
            </button>
          ) : estadoFormulario === "pendente" || estadoFormulario === "preenchido" ? (
            <button
              onClick={() =>
                formularioFeito
                  ? onVerFormulario && onVerFormulario(submissao)
                  : preencher(convite)
              }
              className={classeBotao("ouro")}
              style={medidaBotao("ouro")}
            >
              {formularioFeito ? "Ver respostas" : "Preencher"}
            </button>
          ) : mostrarComposer ? null : (
            <button
              onClick={() => setMostrarComposer(true)}
              className={classeBotao("ouro")}
              style={medidaBotao("ouro")}
            >
              Criar formulário
            </button>
          )
        }
      />

      {/* O AVISO DOS ÓRFÃOS — a prevenção no sítio onde o erro nasce.
          Aparece só quando este evento NÃO tem formulário e ela ainda não
          começou a compor um: é nesse instante que criar um segundo faria
          nascer o duplicado. Adoptar é preferir o que já existe. */}
      {!mostrarComposer &&
        estadoFormulario === "nenhum" &&
        orfaosAdoptaveis.length > 0 && (
          <div
            style={{
              maxWidth: "640px",
              marginLeft: "48px",
              backgroundColor: "#FEF3E2",
              border: "1px solid #F0D9B5",
              borderRadius: "10px",
              padding: "12px 14px",
              margin: "-2px 0 9px 48px",
            }}
          >
            <p
              style={{
                margin: "0 0 6px",
                fontSize: "12.5px",
                color: "#92400E",
                lineHeight: 1.6,
              }}
            >
              {orfaosAdoptaveis.length === 1
                ? "Há um formulário pendente sem evento associado"
                : `Há ${orfaosAdoptaveis.length} formulários pendentes sem evento associado`}
              , do mesmo tipo. Se for desta cliente,{" "}
              <strong>não crie um segundo</strong> — aponta o que já existe.
            </p>
            {orfaosAdoptaveis.slice(0, 3).map((o) => (
              <div
                key={o.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  flexWrap: "wrap",
                  backgroundColor: "white",
                  border: "1px solid #F0D9B5",
                  borderRadius: "9px",
                  padding: "8px 11px",
                  marginTop: "6px",
                }}
              >
                <span
                  style={{
                    fontSize: "11.5px",
                    color: "var(--gray-mid)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {o.code}
                  {o.created_at ? ` · ${dataCurta(o.created_at)}` : ""}
                </span>
                <button
                  onClick={async () => {
                    setAAdoptar(o.id);
                    try {
                      if (onAdoptarOrfao) await onAdoptarOrfao(o);
                    } catch (e) {
                      console.error("Erro ao apontar o formulário:", e);
                    }
                    setAAdoptar(null);
                  }}
                  disabled={aAdoptar === o.id}
                  style={{
                    marginLeft: "auto",
                    border: "1px solid #F0D9B5",
                    backgroundColor: "white",
                    color: "#92400E",
                    fontWeight: "600",
                    fontSize: "11px",
                    padding: "5px 12px",
                    borderRadius: "999px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {aAdoptar === o.id ? "A apontar…" : "É deste"}
                </button>
              </div>
            ))}
            {orfaosAdoptaveis.length > 3 && (
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: "11.5px",
                  color: "#92400E",
                }}
              >
                … e mais {orfaosAdoptaveis.length - 3} em Formulários.
              </p>
            )}
          </div>
        )}

      {/* A BANCADA DA PONTE — sobreposição de ecrã inteiro, não um
          painel indentado: compor um formulário com o pedido à vista
          precisa da largura toda, e a aba continua a ler-se como cinco
          linhas calmas porque o composer não vive entre elas. O alvo é
          ESTE evento, fixo — é o que faz a bancada ser curta. */}
      {mostrarComposer && (
        <FormularioDoEvento
          submissao={submissao}
          eventTypes={eventTypes}
          reservaProvisoria={reservaProvisoria}
          onConviteCriado={onConviteCriado}
          onFechar={() => setMostrarComposer(false)}
        />
      )}
      </div>
    ),
  };

  // Os três documentos com percurso saem do mesmo molde.
  const cartaoDoTipo = (tipo) => {
    const cfg = TIPOS[tipo];
    const doc = porTipo[tipo];
    const eProximo = proximoDoc === tipo && !doc;
    const tom = eProximo ? "destaque" : !doc ? "adormecido" : undefined;

    return (
          <div
            key={tipo}
            data-doc-id={tipo}
            ref={(el) => (linhaRefs.current[tipo] = el)}
            className={pulsando === tipo ? "realce-pulso" : undefined}
            style={{
              borderRadius: "14px",
              opacity: drag?.id === tipo ? 0.35 : 1,
            }}
          >
          <Linha
            punho={<Punho aoPegar={aoPegar} />}
            icone={cfg.icone}
            titulo={cfg.nome}
            descricao={
              doc
                ? [
                    tipo === "orcamento" && submissao?.valor_acordado
                      ? formatarEuros(submissao.valor_acordado)
                      : null,
                    // Trancado é terminal e a linha di-lo — os passos
                    // deixam de ser botões (ver onClick abaixo).
                    doc.trancado_em
                      ? `assinado e trancado em ${dataCurta(doc.trancado_em)} — não se altera`
                      : doc.assinado_em
                        ? `${cfg.ultimo} em ${dataCurta(doc.assinado_em)}`
                        : doc.enviado_em
                          ? `enviado em ${dataCurta(doc.enviado_em)}`
                          : "gerado, por enviar",
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : eProximo
                  ? "É o gesto a seguir."
                  : "Ainda não tem vez"
            }
            tom={tom}
            passos={
              <>
                <Passo
                  rotulo={doc ? `gerado ${dataCurta(doc.created_at)}` : "gerar"}
                  feito={!!doc}
                  aSeguir={eProximo}
                />
                <Passo
                  rotulo={doc?.enviado_em ? "enviado" : "enviar"}
                  data={doc?.enviado_em ? dataCurta(doc.enviado_em) : null}
                  feito={!!doc?.enviado_em}
                  onClick={
                    doc && !doc.trancado_em
                      ? () => alternarPasso(doc, "enviado")
                      : undefined
                  }
                />
                <Passo
                  rotulo={
                    doc?.assinado_em
                      ? cfg.ultimo
                      : POR_FAZER[cfg.ultimo] || cfg.ultimo
                  }
                  data={doc?.assinado_em ? dataCurta(doc.assinado_em) : null}
                  feito={!!doc?.assinado_em}
                  onClick={
                    doc && !doc.trancado_em
                      ? () => alternarPasso(doc, "assinado")
                      : undefined
                  }
                />
              </>
            }
            accoes={
              <button
                onClick={() =>
                  onGerarDocumento && onGerarDocumento(submissao, tipo)
                }
                className={classeBotao(
                  eProximo ? "principal" : doc ? "ouro" : "neutro",
                )}
                style={medidaBotao(
                  eProximo ? "principal" : doc ? "ouro" : "neutro",
                )}
              >
                {doc ? "Abrir" : `Preparar ${cfg.nome.toLowerCase()}`}
              </button>
            }
          />
          </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {erro && (
        <p
          style={{
            fontSize: "12.5px",
            color: "#B91C1C",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "10px",
            padding: "10px 14px",
            margin: 0,
          }}
        >
          {erro}
        </p>
      )}

      {ordem.map((id) => cartoes[id] || cartaoDoTipo(id))}

      {/* ---- O cartão-fantasma do arrasto (o molde do editor de
          blocos): diz o que vai na mão, e mais nada. ---- */}
      {drag && (
        <div
          style={{
            position: "fixed",
            left: `${fantasma.x}px`,
            top: `${fantasma.y}px`,
            width: `${fantasma.w}px`,
            zIndex: 90,
            pointerEvents: "none",
            backgroundColor: "white",
            border: "1.5px solid var(--gold)",
            borderRadius: "14px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.16)",
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <span style={{ color: "var(--gold)" }}>
            <Icone nome={drag.icone} tamanho={20} />
          </span>
          <span style={{ fontSize: "14px", color: "var(--charcoal)" }}>
            {drag.titulo}
          </span>
        </div>
      )}
    </div>
  );
}
