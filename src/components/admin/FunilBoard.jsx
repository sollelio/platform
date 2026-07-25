import { useState, useEffect } from "react";
import { getEventosFunil, updateFase } from "../../lib/clientes";
import { registarSinalDoFunil, METODOS_SUGERIDOS } from "../../lib/pagamentos";
import { getResumoSubmissao } from "../../lib/submissionFields";
import { formatarEuros } from "./orcamentos/orcamentoConfig";
import {
  FASE_LABEL,
  FASE_COR,
  FASES_BOARD,
  FASES_POS_SINAL,
  PROXIMA_FASE,
  AVANCO_LABEL,
} from "./faseConfig";
import CaptacaoForm from "../captacao/CaptacaoForm";

// ============================================================
// FunilBoard — a esteira visual do funil comercial, dentro de Clientes.
// TRÊS colunas: Interessados (pré-sinal) | Clientes (pós-sinal, ainda
// por preparar) | Em Preparação (pós-sinal, já em mãos), empilhadas
// no telemóvel. Perdido NÃO é coluna (é saída): só aparece quando a
// Nádia liga "Ver perdidos".
//
// A coluna é decidida por DOIS eixos ortogonais:
//   • fase (funil comercial)  → Interessados vs pós-sinal
//   • status (operacional)    → Clientes ("Recebido") vs Em Preparação
//     ("Em Preparação" OU "Confirmado" — confirmar nunca faz recuar).
// O evento atravessa para a Em Preparação quando a Nádia clica
// "Em Preparação" na ficha do evento (drawer) — é só o status a mudar.
// "Concluído" sai do board, como sempre.
//
// refrescarEm — bump vindo do AdminPage: quando o drawer altera um
// evento (estado, valor, dados), o board recarrega (tem fetch próprio
// e o drawer abre por cima dele).
//
// Interação por TOQUE, não drag-and-drop (decisão validada: DnD entre
// colunas com scroll horizontal é péssimo no telemóvel):
//   • tocar no corpo do card → abre o drawer do evento (onAbrirEvento)
//   • "FaseSeguinte →" → avança uma fase
//   • "perder" → confirmação inline → fase perdido
//   • na coluna Perdidos: "↩ Recuperar" → volta a interessado
// Todos os botões dos cards usam e.stopPropagation() (lição conhecida).
// ============================================================

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

// Soma o valor acordado de uma lista de eventos (quem não tem valor
// simplesmente não pesa — sem inventar zeros).
const somaValores = (lista) =>
  lista.reduce((acc, e) => acc + (Number(e.valor_acordado) || 0), 0);

// Os estados operacionais que movem um evento pós-sinal para a coluna
// Em Preparação ("a partir do preencher formulário em diante").
const STATUS_EM_PREPARACAO = ["Em Preparação", "Confirmado"];

export default function FunilBoard({
  eventTypes = [],
  onAbrirEvento,
  onDadosMudaram,
  refrescarEm = 0,
}) {
  const [eventos, setEventos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [mostrarPerdidos, setMostrarPerdidos] = useState(false);
  const [confirmandoPerda, setConfirmandoPerda] = useState(null); // id do evento
  const [confirmandoSinal, setConfirmandoSinal] = useState(null); // id do evento
  const [atualizando, setAtualizando] = useState(null); // id do evento
  const [novoInteressado, setNovoInteressado] = useState(false); // modal aberto
  const [avisoErro, setAvisoErro] = useState(null); // toast discreto (adeus alert)

  const carregar = async () => {
    setCarregando(true);
    setErro(null);
    try {
      const data = await getEventosFunil();
      setEventos(data);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível carregar o funil.");
    }
    setCarregando(false);
  };

  // Corre ao montar E sempre que o drawer altera um evento (bump do
  // refrescarEm no AdminPage) — o cartão muda de coluna sem reload.
  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refrescarEm]);

  // Fase segura: eventos antigos sem fase (não devia haver, mas há BD
  // de teste) caem em "interessado" para nunca desaparecerem do funil.
  const faseDe = (ev) => (FASE_LABEL[ev.fase] ? ev.fase : "interessado");

  const mudarFase = async (ev, fase) => {
    setAtualizando(ev.id);
    try {
      await updateFase(ev.id, fase);
      setEventos((prev) =>
        prev.map((e) => (e.id === ev.id ? { ...e, fase } : e)),
      );
      if (onDadosMudaram) onDadosMudaram();
    } catch (e) {
      console.error(e);
      setAvisoErro(
        "Não foi possível atualizar a fase — verifica a ligação e as migrações.",
      );
      setTimeout(() => setAvisoErro(null), 4500);
    }
    setAtualizando(null);
    setConfirmandoPerda(null);
  };

  // "Sinal recebido →" é a ÚNICA transição de fase que move dinheiro a
  // sério — por isso é a única que pede método + data antes de avançar
  // (ver FormularioSinalInline). A fase avança mesmo que o registo do
  // pagamento falhe (são coisas decoupled: fase é funil, pagamento é
  // dinheiro) — só avisa a Nádia para o registar à mão na ficha.
  const confirmarSinalRecebido = async (ev, { metodo, data }) => {
    setAtualizando(ev.id);
    try {
      await updateFase(ev.id, "cliente");
      setEventos((prev) =>
        prev.map((e) => (e.id === ev.id ? { ...e, fase: "cliente" } : e)),
      );
      try {
        await registarSinalDoFunil(ev.id, ev.valor_acordado, ev.data_evento, {
          metodo,
          data,
        });
      } catch (e2) {
        console.error("registarSinalDoFunil falhou:", e2);
        setAvisoErro(
          "A fase avançou, mas não foi possível registar o pagamento do sinal — regista-o na ficha do evento.",
        );
        setTimeout(() => setAvisoErro(null), 6000);
      }
      if (onDadosMudaram) onDadosMudaram();
    } catch (e) {
      console.error(e);
      setAvisoErro(
        "Não foi possível atualizar a fase — verifica a ligação e as migrações.",
      );
      setTimeout(() => setAvisoErro(null), 4500);
    }
    setAtualizando(null);
    setConfirmandoSinal(null);
  };

  const nomeTipo = (ev) => {
    const t = eventTypes.find((x) => x.id === ev.event_type_id);
    if (t?.nome) return t.nome;
    // Tipo "Outro" da captação — o texto do cliente com a marca ✳
    // (por classificar) até ser associado a um modelo na ficha.
    const livre = (ev.respostas?.tipoEventoOutro || "").trim();
    return livre ? `${livre} ✳` : "Evento";
  };

  // O nome no card: o cliente (a pessoa que contrata); se o evento não
  // tiver cliente ligado, o título do resumo (dupla fonte).
  // O card é do EVENTO: mostra o nome digitado na captação (resumo).
  // Só cai no nome do CLIENTE quando o evento não tem nome próprio
  // (o resumo devolveu o genérico) — importa quando a deduplicação
  // pendura um evento novo num cliente antigo: sem isto, o nome novo
  // ficava escondido atrás do antigo.
  const nomeCard = (ev) => {
    const resumo = getResumoSubmissao(ev, eventTypes);
    const tipo = eventTypes.find((t) => t.id === ev.event_type_id);
    const generico =
      !resumo.titulo ||
      resumo.titulo === "Evento" ||
      (tipo && resumo.titulo === tipo.nome);
    return generico ? ev.clientes?.nome || resumo.titulo : resumo.titulo;
  };

  if (carregando) {
    return (
      <p style={{ color: "var(--gray-mid)", fontSize: "14px" }}>
        A carregar o funil...
      </p>
    );
  }
  if (erro) {
    return <p style={{ color: "#DC2626", fontSize: "14px" }}>{erro}</p>;
  }

  const perdidos = eventos.filter((e) => faseDe(e) === "perdido");

  return (
    <div>
      {/* Barra de topo: novo interessado (o caso Instagram: a Nádia
          transcreve a conversa) + filtro de perdidos */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "10px",
          marginBottom: "14px",
        }}
      >
        <button
          onClick={() => setNovoInteressado(true)}
          style={{
            padding: "9px 18px",
            borderRadius: "10px",
            fontSize: "13px",
            fontWeight: "600",
            border: "none",
            backgroundColor: "var(--gold)",
            color: "white",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(201,168,76,0.3)",
            whiteSpace: "nowrap",
          }}
        >
          + Novo interessado
        </button>
        <button
          onClick={() => setMostrarPerdidos((v) => !v)}
          style={{
            padding: "7px 16px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: mostrarPerdidos ? "600" : "500",
            border: `1.5px solid ${mostrarPerdidos ? "#9CA3AF" : "var(--gold-light)"}`,
            backgroundColor: mostrarPerdidos ? "#F3F4F6" : "white",
            color: "var(--gray-mid)",
            cursor: "pointer",
            transition: "all 0.2s",
            whiteSpace: "nowrap",
          }}
        >
          {mostrarPerdidos ? "✓ " : ""}Ver perdidos ({perdidos.length})
        </button>
      </div>

      {avisoErro && (
        <p
          style={{
            fontSize: "12px",
            color: "#DC2626",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "10px",
            padding: "8px 14px",
            margin: "0 0 12px 0",
          }}
        >
          {avisoErro}
        </p>
      )}

      {/* ===== AS TRÊS COLUNAS DA NÁDIA =====
          Interessados (pré-sinal) | Clientes (pós-sinal, status
          "Recebido") | Em Preparação (pós-sinal, status "Em Preparação"
          ou "Confirmado"). As ETAPAS viram pastilhas nos cartões;
          "Sinal recebido →" atravessa o cartão para a direita sozinho
          (é só a fase a mudar), e o clique em "Em Preparação" no drawer
          atravessa-o para a terceira (é só o status a mudar). O € vive
          nos cabeçalhos — garantido total = Clientes + Em Preparação. */}
      {(() => {
        const FASES_ESQ = ["interessado", "orcamento", "sinal"];
        const FASES_DIR = ["cliente", "projecto", "contrato"];
        const ordemFase = (f) => FASES_BOARD.indexOf(f);
        const ordenar = (lista) =>
          [...lista].sort((a, b) => {
            const df = ordemFase(faseDe(a)) - ordemFase(faseDe(b));
            if (df !== 0) return df;
            if (!a.data_evento) return 1;
            if (!b.data_evento) return -1;
            return new Date(a.data_evento) - new Date(b.data_evento);
          });
        const interessados = ordenar(
          eventos.filter((e) => FASES_ESQ.includes(faseDe(e))),
        );
        // Pós-sinal ativos, repartidos pelo STATUS operacional. A
        // coluna Clientes é o apanha-tudo (status "Recebido", nulo ou
        // desconhecido) — nenhum evento desaparece do board.
        const posSinalAtivos = eventos.filter(
          (e) => FASES_DIR.includes(faseDe(e)) && e.status !== "Concluído",
        );
        const emPreparacao = ordenar(
          posSinalAtivos.filter((e) =>
            STATUS_EM_PREPARACAO.includes(e.status),
          ),
        );
        const clientes = ordenar(
          posSinalAtivos.filter(
            (e) => !STATUS_EM_PREPARACAO.includes(e.status),
          ),
        );

        const Coluna = ({ titulo, cor, fundo, borda, lista, legendaEuros }) => (
          <div
            style={{
              backgroundColor: fundo,
              borderRadius: "14px",
              padding: "14px",
              border: `1px solid ${borda}`,
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: "700",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: cor,
                  margin: 0,
                }}
              >
                {titulo}
              </p>
              <span style={{ fontSize: "12px", color: "var(--gray-mid)" }}>
                {lista.length}
              </span>
            </div>
            <p
              style={{
                fontSize: "15px",
                fontWeight: "700",
                color: cor,
                margin: "2px 0 14px 0",
              }}
            >
              {formatarEuros(somaValores(lista))}{" "}
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: "400",
                  color: "var(--gray-mid)",
                }}
              >
                {legendaEuros}
              </span>
            </p>
            {lista.length === 0 ? (
              <p
                style={{
                  fontSize: "12px",
                  fontStyle: "italic",
                  color: "var(--gray-mid)",
                  textAlign: "center",
                  padding: "18px 0",
                  margin: 0,
                }}
              >
                Sem eventos nesta coluna.
              </p>
            ) : (
              lista.map((ev) => (
                <CardEvento
                  key={ev.id}
                  evento={ev}
                  fase={faseDe(ev)}
                  nome={nomeCard(ev)}
                  tipo={nomeTipo(ev)}
                  aAtualizar={atualizando === ev.id}
                  aConfirmarPerda={confirmandoPerda === ev.id}
                  aConfirmarSinal={confirmandoSinal === ev.id}
                  onAbrir={() => onAbrirEvento && onAbrirEvento(ev)}
                  onAvancar={() => mudarFase(ev, PROXIMA_FASE[faseDe(ev)])}
                  onPedirPerda={() => setConfirmandoPerda(ev.id)}
                  onCancelarPerda={() => setConfirmandoPerda(null)}
                  onConfirmarPerda={() => mudarFase(ev, "perdido")}
                  onRecuperar={() => mudarFase(ev, "interessado")}
                  onPedirSinal={() => setConfirmandoSinal(ev.id)}
                  onCancelarSinal={() => setConfirmandoSinal(null)}
                  onConfirmarSinal={(dados) => confirmarSinalRecebido(ev, dados)}
                />
              ))
            )}
          </div>
        );

        return (
          <div
            style={{
              display: "grid",
              // 280px: 3 colunas cabem lado a lado no contentor de
              // 960px do Admin (com 300px a terceira embrulhava para
              // baixo por 16px). No telemóvel continuam empilhadas.
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "14px",
              alignItems: "start",
            }}
          >
            <Coluna
              titulo="Interessados"
              cor="var(--gold-dark)"
              fundo="#FBF7EF"
              borda="#F0EBE0"
              lista={interessados}
              legendaEuros="em negociação"
            />
            <Coluna
              titulo="Clientes"
              cor="#166534"
              fundo="#F6FBF6"
              borda="#CDEBD3"
              lista={clientes}
              legendaEuros="garantidos (sinal pago)"
            />
            <Coluna
              titulo="Em Preparação"
              cor="#3B82F6"
              fundo="#F5F9FF"
              borda="#BFDBFE"
              lista={emPreparacao}
              legendaEuros="em preparação"
            />
            {mostrarPerdidos && (
              <Coluna
                titulo="Perdidos"
                cor="var(--gray-mid)"
                fundo="#F9FAFB"
                borda="#E5E7EB"
                lista={perdidos}
                legendaEuros=""
              />
            )}
          </div>
        );
      })()}

      {/* Modal: novo interessado — reutiliza o CaptacaoForm da página
          pública (uma UI, duas portas). Ao criar, recarrega o funil. */}
      {novoInteressado && (
        <div
          onClick={() => setNovoInteressado(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            backgroundColor: "rgba(0,0,0,0.35)",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            padding: "24px 16px",
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "white",
              borderRadius: "16px",
              padding: "22px 20px",
              width: "100%",
              maxWidth: "440px",
              border: "1px solid var(--gold-light)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "4px",
              }}
            >
              <h3
                style={{
                  fontSize: "17px",
                  fontFamily: "Playfair Display, serif",
                  color: "var(--charcoal)",
                  margin: 0,
                }}
              >
                Novo interessado
              </h3>
              <button
                onClick={() => setNovoInteressado(false)}
                aria-label="Fechar"
                style={{
                  fontSize: "18px",
                  color: "var(--gray-mid)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
            <p
              style={{
                fontSize: "12px",
                color: "var(--gray-mid)",
                margin: "0 0 16px 0",
              }}
            >
              Transcreve o que a pessoa te disse na conversa.
            </p>
            <CaptacaoForm
              modoInterno
              textoBotao="Criar interessado"
              onSubmetido={() => {
                setNovoInteressado(false);
                carregar();
                if (onDadosMudaram) onDadosMudaram();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Método + data do sinal — a única pergunta que "Sinal recebido →"
// faz antes de avançar (é dinheiro a sério, ver registarSinalDoFunil).
// Vive dentro do card (onClick já para de propagar por causa do wrap).
// ------------------------------------------------------------
function FormularioSinalInline({ valorSinal, aAtualizar, onConfirmar, onCancelar }) {
  const [metodo, setMetodo] = useState("");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));

  const inputStyle = {
    width: "100%",
    padding: "6px 8px",
    borderRadius: "6px",
    border: "1.5px solid var(--gold-light)",
    fontSize: "12px",
    marginBottom: "6px",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <p style={{ fontSize: "11px", color: "var(--gray-mid)", margin: "0 0 6px 0" }}>
        Sinal recebido — {formatarEuros(valorSinal)}
      </p>
      <input
        list="metodos-pagamento-funil"
        placeholder="Método de pagamento"
        value={metodo}
        onChange={(e) => setMetodo(e.target.value)}
        style={inputStyle}
      />
      <datalist id="metodos-pagamento-funil">
        {METODOS_SUGERIDOS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <input
        type="date"
        value={data}
        onChange={(e) => setData(e.target.value)}
        style={{ ...inputStyle, marginBottom: "8px" }}
      />
      <div style={{ display: "flex", gap: "6px" }}>
        <button
          onClick={() => metodo && onConfirmar({ metodo, data })}
          disabled={aAtualizar || !metodo}
          style={{
            flex: 1,
            padding: "7px 8px",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: "600",
            border: "none",
            backgroundColor: "var(--gold)",
            color: "white",
            cursor: aAtualizar || !metodo ? "not-allowed" : "pointer",
          }}
        >
          {aAtualizar ? "..." : "Confirmar"}
        </button>
        <button
          onClick={onCancelar}
          disabled={aAtualizar}
          style={{
            flex: 1,
            padding: "7px 8px",
            borderRadius: "8px",
            fontSize: "12px",
            border: "1px solid #E5E7EB",
            backgroundColor: "white",
            color: "var(--gray-mid)",
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Card de um evento no funil
// ------------------------------------------------------------
function CardEvento({
  evento,
  fase,
  nome,
  tipo,
  aAtualizar,
  aConfirmarPerda,
  aConfirmarSinal,
  onAbrir,
  onAvancar,
  onPedirPerda,
  onCancelarPerda,
  onConfirmarPerda,
  onRecuperar,
  onPedirSinal,
  onCancelarSinal,
  onConfirmarSinal,
}) {
  const proxima = PROXIMA_FASE[fase];
  const ehPerdido = fase === "perdido";
  const temValor =
    evento.valor_acordado !== null && evento.valor_acordado !== undefined;

  return (
    <div
      onClick={onAbrir}
      style={{
        backgroundColor: "white",
        borderRadius: "12px",
        padding: "12px",
        marginBottom: "8px",
        border: "1px solid #F0EBE0",
        boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
        cursor: "pointer",
        opacity: ehPerdido ? 0.85 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "8px",
          marginBottom: "2px",
        }}
      >
        <p
          style={{
            fontSize: "13px",
            fontWeight: "600",
            color: ehPerdido ? "var(--gray-mid)" : "var(--charcoal)",
            margin: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
          }}
        >
          {nome}
        </p>
        {/* A etapa — era uma coluna, agora é uma pastilha */}
        <span
          style={{
            flexShrink: 0,
            fontSize: "8.5px",
            fontWeight: "700",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            padding: "3px 9px",
            borderRadius: "999px",
            backgroundColor: (FASE_COR[fase] || {}).bg || "#F3F4F6",
            color: (FASE_COR[fase] || {}).cor || "var(--gray-mid)",
          }}
        >
          {FASE_LABEL[fase] || fase}
        </span>
      </div>
      <p
        style={{
          fontSize: "12px",
          color: "var(--gray-mid)",
          margin: temValor ? "0 0 2px 0" : "0 0 10px 0",
        }}
      >
        {tipo} · {formatarData(evento.data_evento)}
      </p>
      {temValor && (
        <p
          style={{
            fontSize: "12px",
            fontWeight: "600",
            color: "var(--gold-dark)",
            margin: "0 0 10px 0",
          }}
        >
          {formatarEuros(evento.valor_acordado)}
          {fase === "sinal" &&
            ` · sinal (50%): ${formatarEuros(evento.valor_acordado / 2)}`}
        </p>
      )}
      {!temValor && fase === "sinal" && (
        <p
          style={{
            fontSize: "11px",
            fontStyle: "italic",
            color: "var(--gray-mid)",
            margin: "0 0 10px 0",
          }}
        >
          sem valor acordado — define-o no evento (✏️ Editar)
        </p>
      )}

      {/* Ações — dependem do estado */}
      {aConfirmarPerda ? (
        <div>
          <p
            style={{
              fontSize: "12px",
              color: "var(--gray-mid)",
              margin: "0 0 8px 0",
            }}
          >
            Marcar como perdido?
          </p>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConfirmarPerda();
              }}
              disabled={aAtualizar}
              style={{
                flex: 1,
                padding: "7px 8px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: "600",
                border: "none",
                backgroundColor: "#DC2626",
                color: "white",
                cursor: aAtualizar ? "wait" : "pointer",
              }}
            >
              {aAtualizar ? "..." : "Sim, perdido"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancelarPerda();
              }}
              style={{
                flex: 1,
                padding: "7px 8px",
                borderRadius: "8px",
                fontSize: "12px",
                border: "1px solid #E5E7EB",
                backgroundColor: "white",
                color: "var(--gray-mid)",
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : aConfirmarSinal ? (
        <FormularioSinalInline
          valorSinal={(Number(evento.valor_acordado) || 0) / 2}
          aAtualizar={aAtualizar}
          onConfirmar={onConfirmarSinal}
          onCancelar={onCancelarSinal}
        />
      ) : ehPerdido ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRecuperar();
          }}
          disabled={aAtualizar}
          style={{
            width: "100%",
            padding: "7px 8px",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: "600",
            border: "1px solid #D1D5DB",
            backgroundColor: "white",
            color: "var(--gray-mid)",
            cursor: aAtualizar ? "wait" : "pointer",
          }}
        >
          {aAtualizar ? "A recuperar..." : "↩ Recuperar"}
        </button>
      ) : (
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {proxima && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (fase === "sinal" && temValor) {
                  onPedirSinal();
                } else {
                  onAvancar();
                }
              }}
              disabled={aAtualizar}
              style={{
                flex: 1,
                padding: "7px 8px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: "600",
                border: "1.5px solid var(--gold)",
                backgroundColor: "white",
                color: "var(--gold)",
                cursor: aAtualizar ? "wait" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {aAtualizar ? "..." : `${AVANCO_LABEL[fase] || FASE_LABEL[proxima]} →`}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPedirPerda();
            }}
            title="Marcar como perdido"
            style={{
              padding: "7px 8px",
              borderRadius: "8px",
              fontSize: "12px",
              border: "none",
              backgroundColor: "transparent",
              color: "var(--gray-mid)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            perder
          </button>
        </div>
      )}
    </div>
  );
}