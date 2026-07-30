import { useState, useEffect, useRef } from "react";
import { getEventosFunil, updateFase } from "../../lib/clientes";
import {
  registarSinalDoFunil,
  METODOS_SUGERIDOS,
  getPagamentosEvento,
  saldoSinalPendente,
} from "../../lib/pagamentos";
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
  verPerdidos = null,
  aoConsumirVerPerdidos,
}) {
  const [eventos, setEventos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [mostrarPerdidos, setMostrarPerdidos] = useState(false);

  // A pílula «Recuperar no funil» da Jornada aterra aqui: liga o "Ver
  // perdidos" (a coluna aparece) e consome o pedido — a recuperação em
  // si continua a ser o gesto informado de sempre, no cartão.
  useEffect(() => {
    if (!verPerdidos) return;
    setMostrarPerdidos(true);
    aoConsumirVerPerdidos?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verPerdidos]);
  const [confirmandoPerda, setConfirmandoPerda] = useState(null); // id do evento
  // { id, valorSinal } — o valor mostrado na confirmação é o do
  // PREVISTO real (lido ao abrir), não uma divisão por dois: com o
  // remanescente preso por pagamentos, o sinal sincronizado pode não
  // ser metade, e o que se confirma tem de ser o que se regista.
  const [confirmandoSinal, setConfirmandoSinal] = useState(null);
  // Recuperação informada de um perdido COM dinheiro registado:
  // { id, sinalPago, totalPago } enquanto a Nádia escolhe a saída.
  const [recuperando, setRecuperando] = useState(null);
  const pedidoRecuperacaoRef = useRef(null);
  // "Sinal recebido →" SEM valor acordado deixou de avançar em
  // silêncio: confirma-se inline, com a consequência à vista.
  const [confirmandoAvancoSemValor, setConfirmandoAvancoSemValor] =
    useState(null); // id do evento
  const [atualizando, setAtualizando] = useState(null); // id do evento
  const [novoInteressado, setNovoInteressado] = useState(false); // modal aberto
  const [avisoErro, setAvisoErro] = useState(null); // toast discreto (adeus alert)

  const carregar = async () => {
    setCarregando(true);
    setErro(null);
    // Nenhuma confirmação inline sobrevive a um reload: os dados que a
    // justificavam podem ter mudado (valor definido no drawer, fase
    // alterada) e a pergunta antiga passaria a afirmar coisas falsas.
    setConfirmandoPerda(null);
    setConfirmandoSinal(null);
    setConfirmandoAvancoSemValor(null);
    setRecuperando(null);
    try {
      const data = await getEventosFunil();
      setEventos(data);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível carregar o funil.");
    }
    setCarregando(false);
  };

  // Um só aviso de cada vez, com um só timer — sem isto, o timer de um
  // aviso antigo apagava a mensagem seguinte a meio da leitura.
  const avisoTimerRef = useRef(null);
  const mostrarAviso = (mensagem, ms = 4500) => {
    if (avisoTimerRef.current) clearTimeout(avisoTimerRef.current);
    setAvisoErro(mensagem);
    avisoTimerRef.current = setTimeout(() => setAvisoErro(null), ms);
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

  // Abrir a confirmação do sinal lê o PREVISTO real primeiro: o valor
  // que a Nádia confirma é o que fica registado (com o remanescente
  // preso, o sinal sincronizado pode não ser metade do acordado). Sem
  // plano legível, cai na metade — que o registo depois sincroniza.
  const pedirSinal = async (ev) => {
    setAtualizando(ev.id);
    let valorSinal = (Number(ev.valor_acordado) || 0) / 2;
    try {
      const plano = await getPagamentosEvento(ev.id);
      const previstoSinal = (plano?.previstos || []).find(
        (p) => p.ordem === 1,
      );
      if (previstoSinal) valorSinal = Number(previstoSinal.valor) || valorSinal;
    } catch (e) {
      console.warn("Sem plano legível — a confirmação mostra a metade:", e);
    }
    setAtualizando(null);
    setConfirmandoSinal({ id: ev.id, valorSinal });
  };

  const mudarFase = async (ev, fase, opcoes = {}) => {
    setAtualizando(ev.id);
    try {
      const atualizada = await updateFase(ev.id, fase, opcoes);
      setEventos((prev) =>
        prev.map((e) =>
          e.id === ev.id ? { ...e, fase, status: atualizada.status } : e,
        ),
      );
      if (onDadosMudaram) onDadosMudaram();
    } catch (e) {
      console.error(e);
      // Só as mensagens da casa (Error traduzido em lib/clientes)
      // chegam à barra; um erro cru do Supabase/rede cai na genérica.
      mostrarAviso(
        e instanceof Error && e.message
          ? e.message
          : "Não foi possível atualizar a fase — verifica a ligação e as migrações.",
      );
    }
    setAtualizando(null);
    setConfirmandoPerda(null);
    setRecuperando(null);
    setConfirmandoAvancoSemValor(null);
  };

  // Recuperar um perdido — informado pelos dados, nunca em silêncio
  // quando há dinheiro (decisão do Hélio, Lote 2):
  //   sem pagamentos  → Interessados com o estado limpo ('Recebido'),
  //                     no MESMO update (o par atómico que o CHECK da
  //                     040 exige);
  //   com pagamentos  → a Nádia escolhe inline: voltar a Clientes
  //                     (mantém o estado que tinha) ou a Interessados
  //                     (limpa o estado) — o saldo do sinal destaca a
  //                     saída provável.
  const pedirRecuperacao = async (ev) => {
    // Só o pedido MAIS RECENTE conta — clicar ↩ noutro cartão com um
    // fetch em voo não pode trocar painéis nem piscar estados.
    pedidoRecuperacaoRef.current = ev.id;
    setAtualizando(ev.id);
    let plano;
    try {
      plano = await getPagamentosEvento(ev.id);
    } catch (e) {
      console.error(e);
      if (pedidoRecuperacaoRef.current !== ev.id) return;
      // Sem conseguir ver os pagamentos, não se recupera às cegas —
      // podia esconder dinheiro registado.
      setAtualizando(null);
      mostrarAviso(
        "Não foi possível verificar os pagamentos deste evento — tenta recuperar outra vez.",
      );
      return;
    }
    if (pedidoRecuperacaoRef.current !== ev.id) return;
    const pagamentos = plano?.pagamentos || [];
    if (pagamentos.length === 0) {
      await mudarFase(ev, "interessado", { status: "Recebido" });
      return;
    }
    const totalPago = pagamentos.reduce(
      (acc, p) => acc + (Number(p.valor) || 0),
      0,
    );
    // "Sinal pago" só se afirma com um previsto de sinal a existir —
    // saldoSinalPendente devolve 0 também quando não há plano nenhum,
    // e isso não é um sinal pago.
    const previstoSinal = (plano?.previstos || []).find(
      (p) => p.ordem === 1,
    );
    const sinalPago =
      !!previstoSinal &&
      saldoSinalPendente(ev.id, plano?.previstos || [], pagamentos) <= 0;
    setRecuperando({ id: ev.id, sinalPago, totalPago });
    setAtualizando(null);
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
        const registo = await registarSinalDoFunil(
          ev.id,
          ev.valor_acordado,
          ev.data_evento,
          { metodo, data },
        );
        if (!registo) {
          // Devolveu null sem erro: sem plano utilizável ou o sinal já
          // tinha um pagamento — a fase avançou, mas nada foi
          // registado AGORA. Diz-se, em vez do silêncio.
          mostrarAviso(
            "A fase avançou, mas o sinal não ficou registado agora (sem plano utilizável ou já existia um pagamento do sinal) — confirma na ficha do evento.",
            6000,
          );
        }
      } catch (e2) {
        console.error("registarSinalDoFunil falhou:", e2);
        mostrarAviso(
          "A fase avançou, mas não foi possível registar o pagamento do sinal — regista-o na ficha do evento.",
          6000,
        );
      }
      if (onDadosMudaram) onDadosMudaram();
    } catch (e) {
      console.error(e);
      mostrarAviso(
        "Não foi possível atualizar a fase — verifica a ligação e as migrações.",
      );
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

  // Só a PRIMEIRA carga mostra o texto; nas recargas (realtime, drawer)
  // o board anterior fica visível — sem piscar.
  if (carregando && eventos.length === 0) {
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
          + Registar pedido
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
                  aConfirmarSinal={confirmandoSinal?.id === ev.id}
                  valorSinalConfirmacao={
                    confirmandoSinal?.id === ev.id
                      ? confirmandoSinal.valorSinal
                      : null
                  }
                  onAbrir={() => onAbrirEvento && onAbrirEvento(ev)}
                  onAvancar={() => mudarFase(ev, PROXIMA_FASE[faseDe(ev)])}
                  onPedirPerda={() => setConfirmandoPerda(ev.id)}
                  onCancelarPerda={() => setConfirmandoPerda(null)}
                  onConfirmarPerda={() => mudarFase(ev, "perdido")}
                  aEscolherRecuperacao={
                    recuperando?.id === ev.id ? recuperando : null
                  }
                  onRecuperar={() => pedirRecuperacao(ev)}
                  onRecuperarPara={(fase, opcoes) =>
                    mudarFase(ev, fase, opcoes)
                  }
                  onCancelarRecuperacao={() => setRecuperando(null)}
                  aConfirmarAvancoSemValor={
                    confirmandoAvancoSemValor === ev.id
                  }
                  onPedirAvancoSemValor={() =>
                    setConfirmandoAvancoSemValor(ev.id)
                  }
                  onConfirmarAvancoSemValor={() => mudarFase(ev, "cliente")}
                  onCancelarAvancoSemValor={() =>
                    setConfirmandoAvancoSemValor(null)
                  }
                  onPedirSinal={() => pedirSinal(ev)}
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
                Novo pedido
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
              textoBotao="Registar pedido"
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
  valorSinalConfirmacao,
  aEscolherRecuperacao,
  aConfirmarAvancoSemValor,
  onAbrir,
  onAvancar,
  onPedirPerda,
  onCancelarPerda,
  onConfirmarPerda,
  onRecuperar,
  onRecuperarPara,
  onCancelarRecuperacao,
  onPedirAvancoSemValor,
  onConfirmarAvancoSemValor,
  onCancelarAvancoSemValor,
  onPedirSinal,
  onCancelarSinal,
  onConfirmarSinal,
}) {
  const proxima = PROXIMA_FASE[fase];
  const ehPerdido = fase === "perdido";
  const temValor =
    evento.valor_acordado !== null && evento.valor_acordado !== undefined;
  // Para DECIDIR o caminho do sinal, "ter valor" é > 0 — o mesmo gate
  // do registarSinalDoFunil (v <= 0 devolve null): um valor 0 abriria
  // o formulário de um sinal de 0,00 € e acabava no avanço silencioso
  // que este ramo existe para impedir. O temValor de cima continua a
  // mandar só na exibição do € no card.
  const temValorUtil = Number(evento.valor_acordado) > 0;

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
          valorSinal={
            valorSinalConfirmacao ?? (Number(evento.valor_acordado) || 0) / 2
          }
          aAtualizar={aAtualizar}
          onConfirmar={onConfirmarSinal}
          onCancelar={onCancelarSinal}
        />
      ) : aConfirmarAvancoSemValor && fase === "sinal" && !temValorUtil ? (
        // AUTOVALIDANTE: se os dados mudaram por baixo (valor definido
        // no drawer, fase alterada, evento perdido), a pergunta antiga
        // deixaria de ser verdade — cai-se nos ramos normais em vez de
        // afirmar coisas falsas ou contornar a recuperação informada.
        <div onClick={(e) => e.stopPropagation()}>
          <p
            style={{
              fontSize: "12px",
              color: "var(--gray-mid)",
              margin: "0 0 8px 0",
            }}
          >
            Sem valor acordado, avançar <strong>não regista dinheiro</strong> —
            o evento passa a «garantido (sinal pago)» sem um cêntimo na ficha.
            Define o valor no evento primeiro, ou avança na mesma.
          </p>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConfirmarAvancoSemValor();
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
              }}
            >
              {aAtualizar ? "..." : "Avançar na mesma"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancelarAvancoSemValor();
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
      ) : aEscolherRecuperacao ? (
        // O perdido tem dinheiro registado: a escolha é da Nádia,
        // inline, com a saída provável destacada pelo saldo do sinal.
        // O wrap com stopPropagation segue a lição do
        // FormularioSinalInline: sem ele, um clique no texto ou entre
        // botões propagava ao onAbrir do cartão e abria o drawer.
        <div onClick={(e) => e.stopPropagation()}>
          <p
            style={{
              fontSize: "12px",
              color: "var(--gray-mid)",
              margin: "0 0 8px 0",
            }}
          >
            Este evento tem{" "}
            <strong>{formatarEuros(aEscolherRecuperacao.totalPago)}</strong>{" "}
            registados
            {aEscolherRecuperacao.sinalPago ? " — o sinal está pago" : ""}.
            Recuperar para onde?
          </p>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "6px" }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRecuperarPara("cliente", {});
              }}
              disabled={aAtualizar}
              style={{
                padding: "7px 8px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: "600",
                border: aEscolherRecuperacao.sinalPago
                  ? "1.5px solid var(--gold)"
                  : "1px solid #D1D5DB",
                backgroundColor: aEscolherRecuperacao.sinalPago
                  ? "var(--gold)"
                  : "white",
                color: aEscolherRecuperacao.sinalPago
                  ? "white"
                  : "var(--gray-mid)",
                cursor: aAtualizar ? "wait" : "pointer",
              }}
            >
              {aAtualizar ? "..." : "Para Clientes — mantém o estado"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRecuperarPara("interessado", { status: "Recebido" });
              }}
              disabled={aAtualizar}
              style={{
                padding: "7px 8px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: "600",
                border: !aEscolherRecuperacao.sinalPago
                  ? "1.5px solid var(--gold)"
                  : "1px solid #D1D5DB",
                backgroundColor: !aEscolherRecuperacao.sinalPago
                  ? "var(--gold)"
                  : "white",
                color: !aEscolherRecuperacao.sinalPago
                  ? "white"
                  : "var(--gray-mid)",
                cursor: aAtualizar ? "wait" : "pointer",
              }}
            >
              {aAtualizar ? "..." : "Para Interessados — limpa o estado"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancelarRecuperacao();
              }}
              style={{
                padding: "6px 8px",
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
                if (fase === "sinal" && temValorUtil) {
                  onPedirSinal();
                } else if (fase === "sinal") {
                  // Sem valor acordado UTILIZÁVEL não há plano nem
                  // registo de dinheiro — o avanço confirma-se com a
                  // consequência à vista, nunca em silêncio.
                  onPedirAvancoSemValor();
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