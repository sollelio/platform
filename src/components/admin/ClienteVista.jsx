import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  getClienteComEventos,
  createEventoParaCliente,
} from "../../lib/clientes";
import { FASE_LABEL, FASE_COR } from "./faseConfig";
import { Icone } from "./Navegacao";
import RemoverEventoModal from "./RemoverEventoModal";
import { caminhoDoSeparador } from "../../lib/rotasAdmin";
import { Esqueleto } from "./acabamento";

// ============================================================
// ClienteVista — a casa de UM contacto, em /admin/contactos/:clienteId.
//
// Substitui o painel lateral que abria ao lado da lista: as mesmas
// quatro coisas que ele tinha (quem é a pessoa, os eventos dela,
// criar mais um, remover um), agora num sítio com endereço próprio.
// O que se ganha ao ter URL: o link é partilhável, o F5 não perde o
// contexto, e voltar de um evento traz a Nádia de volta AQUI — à
// cliente de onde saiu — em vez de a atirar para a lista e obrigá-la
// a procurar outra vez.
//
// O contacto e o NIF vivem aqui porque não vivem em mais lado nenhum
// da app: a página do evento recebe o cliente e nunca o mostra. Se
// esta vista não os tivesse, deixaria de haver forma de ver o NIF de
// uma cliente — e é dele que a facturação precisa.
//
// Os cartões de evento seguem o desenho dos cartões da lista de
// clientes, de propósito: é a mesma gramática (uma pastilha de fase
// com as cores de FASE_COR, o tipo em destaque, data e local por
// baixo), para não haver duas linguagens para a mesma coisa.
// ============================================================

const iniciais = (nome) =>
  (nome || "?")
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");

const formatarData = (iso) => {
  if (!iso) return "sem data";
  const [a, m, d] = iso.split("-");
  const meses = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  return `${Number(d)} ${meses[Number(m) - 1]} ${a}`;
};

const EASE = [0.22, 1, 0.36, 1];

// O framer-motion resolve var(--…) ao animar — o tema entra também no
// hover destes cartões.
const cartaoVariants = {
  rest: {
    backgroundColor: "var(--superficie)",
    borderColor: "var(--borda)",
    y: 0,
  },
  hover: {
    backgroundColor: "var(--superficie-quente)",
    borderColor: "var(--ouro-suave)",
    y: -1.5,
  },
};

export default function ClienteVista({
  eventTypes = [],
  onDadosMudaram,
  refrescarEm,
}) {
  const { p1: clienteId } = useParams();
  const navigate = useNavigate();

  const [cliente, setCliente] = useState(null);
  const [estado, setEstado] = useState("a-carregar");
  const [perguntandoFase, setPerguntandoFase] = useState(false);
  const [criandoEvento, setCriandoEvento] = useState(false);
  const [eventoParaRemover, setEventoParaRemover] = useState(null);

  // Sem reset para "a-carregar" a cada chamada, de propósito: o
  // esqueleto é o estado INICIAL (e a vista remonta a cada cliente,
  // pela `key` no sítio onde é usada), por isso trocar de cliente
  // mostra esqueleto e um refrescar silencioso não pisca o ecrã.
  const carregar = useCallback(async () => {
    try {
      const c = await getClienteComEventos(clienteId);
      if (!c) {
        setEstado("nao-encontrado");
        return;
      }
      setCliente(c);
      setEstado("pronto");
    } catch (e) {
      console.error(e);
      // Um uuid mal formado devolve 22P02 da base — para a Nádia é o
      // mesmo caso que um cliente apagado: o link já não serve.
      setEstado("nao-encontrado");
    }
  }, [clienteId]);

  useEffect(() => {
    // O lint vê a chamada e assume um setState síncrono. Não é: tudo o
    // que o `carregar` escreve acontece DEPOIS do await à base de dados.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar, refrescarEm]);

  const nomeTipo = (ev) => {
    if (!ev) return "Evento";
    const t = eventTypes.find((x) => x.id === ev.event_type_id);
    return t?.nome || (ev.respostas?.tipoEventoOutro || "").trim() || "Evento";
  };

  const novoEvento = async (fase) => {
    setCriandoEvento(true);
    setPerguntandoFase(false);
    try {
      await createEventoParaCliente(clienteId, { fase });
      await carregar();
      // Ao contrário do painel antigo, avisa o resto da app: sem isto o
      // Início, a Agenda e o funil ficavam a mostrar um evento a menos
      // até ao gesto seguinte.
      if (onDadosMudaram) onDadosMudaram();
    } catch (e) {
      console.error(e);
    }
    setCriandoEvento(false);
  };

  // --- estados curtos -------------------------------------------------
  if (estado === "a-carregar") {
    return (
      <div style={{ maxWidth: "720px" }}>
        <Esqueleto w={180} h={14} style={{ marginBottom: "18px" }} />
        <Esqueleto w={320} h={26} style={{ marginBottom: "26px" }} />
        <Esqueleto w="100%" h={64} r={12} style={{ marginBottom: "10px" }} />
        <Esqueleto w="100%" h={64} r={12} />
      </div>
    );
  }

  if (estado === "nao-encontrado") {
    return (
      <div style={{ maxWidth: "720px" }}>
        <VoltarAosClientes />
        <p
          style={{
            fontFamily: "Playfair Display, serif",
            fontSize: "20px",
            color: "var(--charcoal)",
            margin: "18px 0 8px",
          }}
        >
          Esta cliente já não existe.
        </p>
        <p style={{ fontSize: "13px", color: "var(--gray-mid)", margin: 0 }}>
          Pode ter sido removida, ou o endereço estar errado. Volta à lista
          para a procurar.
        </p>
      </div>
    );
  }

  const eventos = cliente.eventos || [];

  return (
    <div style={{ maxWidth: "720px" }}>
      <VoltarAosClientes />

      {/* ---- Quem é a pessoa ---- */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          margin: "18px 0 6px",
        }}
      >
        <div
          style={{
            width: "46px",
            height: "46px",
            borderRadius: "50%",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--superficie-quente)",
            border: "1px solid var(--gold-light)",
            color: "var(--gold-dark)",
            fontFamily: "Playfair Display, serif",
            fontSize: "17px",
          }}
        >
          {iniciais(cliente.nome)}
        </div>
        <div style={{ minWidth: 0 }}>
          <h2
            style={{
              fontFamily: "Playfair Display, serif",
              fontSize: "24px",
              fontWeight: "400",
              color: "var(--charcoal)",
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            {cliente.nome}
          </h2>
          <p
            style={{
              fontSize: "12.5px",
              color: "var(--gray-mid)",
              margin: "2px 0 0",
            }}
          >
            {[
              cliente.contacto || "sem contacto",
              cliente.nif ? `NIF ${cliente.nif}` : null,
              cliente.email || null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      {/* ---- Os eventos ---- */}
      <p
        style={{
          fontSize: "10px",
          fontWeight: "700",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--gold-dark)",
          margin: "26px 0 12px",
        }}
      >
        {eventos.length === 1
          ? "O evento"
          : `Eventos${eventos.length ? ` · ${eventos.length}` : ""}`}
      </p>

      {eventos.length === 0 ? (
        <div
          style={{
            // #DFD3B8/#FCFBF7 estão fora da paleta — o par inteiro fica
            // literal (ilha clara nos dois modos) e segue no relatório;
            // os textos de dentro fixam-se no literal claro para nunca
            // ficar letra clara sobre fundo claro no escuro.
            border: "1px dashed #DFD3B8",
            borderRadius: "14px",
            padding: "28px 24px",
            backgroundColor: "#FCFBF7",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontFamily: "Playfair Display, serif",
              fontSize: "17px",
              color: "#1A1A1A",
              margin: "0 0 6px",
            }}
          >
            Ainda sem eventos.
          </p>
          <p
            style={{
              fontSize: "12.5px",
              color: "#6B6B6B",
              margin: "0 0 18px",
              lineHeight: 1.6,
            }}
          >
            Esta pessoa já está no sistema, mas ainda não tem nenhum evento.
            Cria o primeiro para começar a acompanhá-lo.
          </p>
          {!perguntandoFase && !criandoEvento && (
            <button
              onClick={() => setPerguntandoFase(true)}
              className="acao acao--cheia"
              style={{
                padding: "10px 18px",
                borderRadius: "999px",
                fontSize: "13px",
                fontWeight: "600",
              }}
            >
              Criar o primeiro evento
            </button>
          )}
        </div>
      ) : (
        eventos.map((ev) => {
          const f = FASE_COR[ev.fase] || FASE_COR.interessado;
          return (
            <motion.div
              key={ev.id}
              // Leva a origem: quem sai DAQUI deve voltar PARA AQUI.
              // Sem isto, o «← Voltar» do evento atirava sempre para a
              // lista geral e ela tinha de procurar a cliente outra vez
              // — o mesmo trabalho que o atalho de um clique poupou à
              // ida, devolvido na volta.
              onClick={() =>
                navigate(`/evento/${ev.id}`, {
                  state: { origemCliente: clienteId },
                })
              }
              initial="rest"
              whileHover="hover"
              variants={cartaoVariants}
              transition={{ duration: 0.18, ease: EASE }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                padding: "14px 16px",
                borderRadius: "12px",
                border: "1px solid var(--borda)",
                marginBottom: "10px",
                cursor: "pointer",
                boxShadow: "var(--sombra-cartao)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "var(--charcoal)",
                    margin: 0,
                  }}
                >
                  {nomeTipo(ev)}
                </p>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--gray-mid)",
                    margin: "2px 0 0",
                  }}
                >
                  {formatarData(ev.data_evento)}
                  {ev.local_evento ? ` · ${ev.local_evento}` : ""}
                </p>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: "600",
                    padding: "3px 10px",
                    borderRadius: "999px",
                    backgroundColor: f.bg,
                    color: f.cor,
                    whiteSpace: "nowrap",
                  }}
                >
                  {FASE_LABEL[ev.fase] || ev.fase}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEventoParaRemover(ev);
                  }}
                  title="Remover este evento"
                  aria-label="Remover este evento"
                  style={{
                    width: "26px",
                    height: "26px",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "50%",
                    border: "none",
                    background: "transparent",
                    color: "var(--traco-discreto)",
                    cursor: "pointer",
                  }}
                >
                  <Icone nome="lixo" tamanho={14} />
                </button>
              </div>
            </motion.div>
          );
        })
      )}

      {/* ---- Criar mais um ---- */}
      {criandoEvento && (
        <p style={{ fontSize: "12.5px", color: "var(--gray-mid)" }}>
          A criar o evento…
        </p>
      )}

      {perguntandoFase && !criandoEvento && (
        <div
          style={{
            marginTop: "10px",
            padding: "14px",
            borderRadius: "12px",
            border: "1.5px solid var(--gold-light)",
            backgroundColor: "var(--superficie)",
          }}
        >
          <p
            style={{
              fontSize: "12.5px",
              fontWeight: "600",
              color: "var(--charcoal)",
              margin: "0 0 10px 0",
            }}
          >
            Em que ponto está este evento?
          </p>
          <BotaoFase
            onClick={() => novoEvento("interessado")}
            borda="var(--aviso-borda)"
            fundo="var(--aviso-fundo)"
            cor="var(--aviso)"
            titulo="🟡 Ainda a decidir"
            nota="Vai precisar de orçamento"
          />
          <BotaoFase
            onClick={() => novoEvento("cliente")}
            // #BBE5C8 está fora da paleta (--sucesso-borda é #BBF7D0) —
            // fica literal e segue no relatório de violações.
            borda="#BBE5C8"
            fundo="var(--sucesso-fundo-forte)"
            cor="var(--sucesso-texto)"
            titulo="🟢 Já fechado"
            nota="A cliente confirmou o evento"
          />
          <button
            onClick={() => setPerguntandoFase(false)}
            className="ligacao"
            style={{
              fontSize: "12px",
              color: "var(--gray-mid)",
              textDecoration: "underline",
              marginTop: "2px",
            }}
          >
            Cancelar
          </button>
        </div>
      )}

      {eventos.length > 0 && !perguntandoFase && !criandoEvento && (
        <button
          onClick={() => setPerguntandoFase(true)}
          className="ligacao"
          style={{
            marginTop: "6px",
            fontSize: "12.5px",
            color: "var(--gold-dark)",
            textDecoration: "underline",
          }}
        >
          + Novo evento para esta cliente
        </button>
      )}

      <RemoverEventoModal
        key={eventoParaRemover?.id || "nenhum"}
        evento={eventoParaRemover}
        nomeCliente={cliente.nome}
        nomeTipo={nomeTipo}
        formatarData={formatarData}
        onFechar={() => setEventoParaRemover(null)}
        onRemovido={async () => {
          setEventoParaRemover(null);
          await carregar();
          if (onDadosMudaram) onDadosMudaram();
        }}
      />
    </div>
  );
}

function VoltarAosClientes() {
  return (
    <Link
      to={caminhoDoSeparador("clientes")}
      replace
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "12px",
        color: "var(--gray-mid)",
        textDecoration: "none",
      }}
    >
      ← Clientes
    </Link>
  );
}

function BotaoFase({ onClick, borda, fundo, cor, titulo, nota }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        padding: "10px",
        borderRadius: "8px",
        fontSize: "12px",
        fontWeight: "600",
        border: `1.5px solid ${borda}`,
        backgroundColor: fundo,
        color: cor,
        cursor: "pointer",
        marginBottom: "8px",
        textAlign: "left",
      }}
    >
      {titulo}
      <span
        style={{
          display: "block",
          fontWeight: "400",
          fontSize: "11px",
          marginTop: "2px",
        }}
      >
        {nota}
      </span>
    </button>
  );
}
