import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  getClientes,
  getClienteComEventos,
  createEventoParaCliente,
  deleteEvento,
  getVinculosEvento,
} from "../../lib/clientes";
import { FASE_LABEL, FASE_COR } from "./faseConfig";
import FunilBoard from "./FunilBoard";
import { Icone } from "./Navegacao";
import { formatarEuros } from "./orcamentos/orcamentoConfig";

// Memória da última vista escolhida (dura a sessão): se a Nádia
// estava no funil, voltar aos Clientes volta ao FUNIL, não à lista.
let ultimaVista = "lista";

// ============================================================
// ClientesLista — a vista de Clientes: PESSOAS (não eventos), agora
// com duas vistas alternáveis:
//   • Lista  — cards de clientes → eventos de cada um (como sempre)
//   • Funil  — a esteira comercial por fases (FunilBoard)
//
// Clicar num evento (em qualquer vista) delega no onAbrirEvento
// (o SubmissionDrawer que já existe).
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

// Os tipos de evento do cliente ("Casamento", "Casamento + Aniversário",
// "Casamento + Aniversário +1"...) — a Nádia quer VER o evento no
// cartão, não contar eventos. Sem tipo conhecido, cai na contagem.
const tiposDoCliente = (c, eventTypes) => {
  const nomes = [
    ...new Set(
      (c.submissions || [])
        .map(
          (e) =>
            (eventTypes || []).find((t) => t.id === e.event_type_id)?.nome ||
            (e.tipoEventoOutro || e.respostas?.tipoEventoOutro || "").trim() ||
            null,
        )
        .filter(Boolean),
    ),
  ];
  if (nomes.length === 0)
    return `${c.totalEventos} ${c.totalEventos === 1 ? "evento" : "eventos"}`;
  const visiveis = nomes.slice(0, 2).join(" + ");
  const resto = nomes.length - 2;
  const contagem =
    c.totalEventos > nomes.length ? ` (${c.totalEventos} eventos)` : "";
  return `${visiveis}${resto > 0 ? ` +${resto}` : ""}${contagem}`;
};

// Data e hora de criação do contacto — visível no card (os cards
// vêm ordenados do mais recente para o mais antigo).
const formatarCriado = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
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
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${meses[d.getMonth()]} · ${hh}:${mm}`;
};

// A fase "mais avançada" de uma pessoa, para a pastilha do card da
// lista: um cliente fechado sobrepõe-se a tudo; senão, o ponto mais
// adiantado da negociação; só "perdido" quando todos os eventos o são.
// Torna visível, sem cliques, quem é cliente e quem é interessado.
const faseDaPessoa = (c) => {
  const fases = (c.submissions || []).map((e) => e.fase).filter(Boolean);
  if (fases.length === 0) return null;
  for (const f of [
    "contrato",
    "projecto",
    "cliente",
    "sinal",
    "orcamento",
    "interessado",
  ]) {
    if (fases.includes(f)) return f;
  }
  if (fases.every((f) => f === "perdido")) return "perdido";
  return null;
};

// Rótulos dos tipos de documento — os mesmos da tab Documentos
// (DocumentosTab.jsx). "proposta" é a chave interna; na UI é "Projecto".
const TIPO_DOC_LABEL = {
  orcamento: "Orçamento",
  contrato: "Contrato",
  proposta: "Projecto",
};

const EASE = [0.22, 1, 0.36, 1];

// Linha de evento: ao passar o rato, aquece ligeiramente (reforça que é
// clicável) — os valores são hex reais, não var(--...), porque o motor de
// animação do framer-motion precisa de interpolar cores de verdade.
const linhaEventoVariants = {
  rest: { backgroundColor: "#FBF7EF", borderColor: "rgba(201,168,76,0)" },
  hover: { backgroundColor: "#F7EFDA", borderColor: "#E8D5A3" },
};

// O botão de remover vive sempre ali (nunca escondido), mas em repouso
// fica discreto — só "acorda" (opacidade, tamanho e vermelho) quando o
// rato passa pela LINHA inteira, não só pelo próprio botão: é isso que o
// torna óbvio sem ter de o ires procurar primeiro.
const botaoRemoverVariants = {
  rest: { opacity: 0.35, scale: 0.85, backgroundColor: "rgba(220,38,38,0)", color: "#8A8272" },
  hover: { opacity: 1, scale: 1, backgroundColor: "rgba(220,38,38,0.12)", color: "#DC2626" },
};

export default function ClientesLista({
  eventTypes = [],
  onAbrirEvento,
  onDadosMudaram,
  refrescarEm = 0,
}) {
  const [vista, setVista] = useState(ultimaVista); // "lista" | "funil"
  const [clientes, setClientes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [aberto, setAberto] = useState(null); // cliente com eventos
  const [busca, setBusca] = useState("");
  const [criandoEvento, setCriandoEvento] = useState(false);
  const [perguntandoFase, setPerguntandoFase] = useState(false);
  const [eventoParaRemover, setEventoParaRemover] = useState(null);
  const [vinculosEvento, setVinculosEvento] = useState(null); // { documentos, reservas } | null enquanto verifica
  const [erroRemoverEvento, setErroRemoverEvento] = useState(null);
  const [removendoEvento, setRemovendoEvento] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    setErro(null);
    try {
      const data = await getClientes();
      setClientes(data);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível carregar os clientes.");
    }
    setCarregando(false);
  };

  // Corre ao montar E sempre que se volta à vista Lista (trocar para o
  // Funil e voltar NÃO desmonta este componente — sem isto, um
  // interessado novo só aparecia depois de um refresh à página) ou
  // quando o AdminPage sinaliza uma mudança (refrescarEm).
  useEffect(() => {
    if (vista === "lista") carregar();
  }, [vista, refrescarEm]);

  const abrirCliente = async (id) => {
    setPerguntandoFase(false);
    try {
      const c = await getClienteComEventos(id);
      setAberto(c);
    } catch (e) {
      console.error(e);
    }
  };

  // O painel do cliente aberto (à direita, com os eventos dela) tem o
  // seu próprio fetch, independente da lista — sem isto, editar a data
  // (ou outro campo) no drawer do evento só se refletia aqui ao
  // fechar e reabrir o cliente. "aberto" fica de fora das dependências
  // de propósito: só queremos voltar a pedir quando o AdminPage avisa
  // uma mudança (refrescarEm), não sempre que abrirCliente troca o
  // próprio "aberto" (senão duplicava o pedido a cada clique na lista).
  useEffect(() => {
    if (aberto) abrirCliente(aberto.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refrescarEm]);

  const nomeTipo = (ev) => {
    if (!ev) return "Evento";
    const t = eventTypes.find((x) => x.id === ev.event_type_id);
    return t?.nome || (ev.respostas?.tipoEventoOutro || "").trim() || "Evento";
  };

  const novoEvento = async (fase) => {
    if (!aberto) return;
    setCriandoEvento(true);
    setPerguntandoFase(false);
    try {
      await createEventoParaCliente(aberto.id, { fase });
      await abrirCliente(aberto.id); // recarrega os eventos
      await carregar(); // atualiza contagens na lista
    } catch (e) {
      console.error(e);
    }
    setCriandoEvento(false);
  };

  // Abre a confirmação e, em paralelo, vai ver o que este evento arrasta
  // consigo (documentos que se perdem, reservas que se desligam) — a
  // Nádia decide já informada, não às escuras.
  const pedirRemocaoEvento = async (ev) => {
    setErroRemoverEvento(null);
    setEventoParaRemover(ev);
    setVinculosEvento(null);
    try {
      const v = await getVinculosEvento(ev.id);
      setVinculosEvento(v);
    } catch (e) {
      console.error(e);
      // Sem a lista de vínculos, mostra o aviso genérico à mesma —
      // não bloqueia a remoção por a verificação ter falhado.
      setVinculosEvento({
        documentos: [],
        reservas: [],
        pagamentos: [],
        convitesPendentes: [],
      });
    }
  };

  const handleConfirmarRemocaoEvento = async () => {
    if (!eventoParaRemover || !aberto) return;
    setRemovendoEvento(true);
    setErroRemoverEvento(null);
    try {
      await deleteEvento(eventoParaRemover.id);
      setEventoParaRemover(null);
      setVinculosEvento(null);
      await abrirCliente(aberto.id); // recarrega os eventos
      await carregar(); // atualiza contagens na lista
      if (onDadosMudaram) onDadosMudaram();
    } catch (e) {
      console.error(e);
      // Código 23503 = violação de chave estrangeira — duas causas
      // possíveis, cada uma com a sua constraint nomeada (ver
      // getVinculosEvento em lib/clientes.js). Esta apanha só o caso
      // raro de um pagamento ter sido registado ENTRE abrir este
      // diálogo e clicar Remover — o aviso normal já bloqueia o botão
      // antes disso (ver o JSX do diálogo).
      if (e.code === "23503" && e.message?.includes("pagamentos_submission_fk")) {
        setErroRemoverEvento(
          "Não é possível remover: entretanto ficou um pagamento registado neste evento. Fecha e volta a tentar.",
        );
      } else if (e.code === "23503") {
        setErroRemoverEvento(
          "Não é possível remover: há um convite/formulário já preenchido ligado a este evento.",
        );
      } else {
        setErroRemoverEvento("Ocorreu um erro ao remover. Tenta novamente.");
      }
    }
    setRemovendoEvento(false);
  };

  // Pesquisa NORMALIZADA (Lote 3A, antecipada por decisão do Hélio na
  // Fase 1 — "ajuda a revelar duplicados"): acentos fora nos nomes
  // ("joao" encontra "João") e telefones comparados só por dígitos
  // ("912345678" encontra "912 345 678" e "+351 912 345 678").
  const semAcentos = (s) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const filtrados = clientes.filter((c) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    const texto = semAcentos(
      [c.nome, c.contacto, c.email].filter(Boolean).join(" ").toLowerCase(),
    );
    if (texto.includes(semAcentos(q))) return true;
    const qDigitos = q.replace(/\D/g, "");
    if (qDigitos.length >= 3) {
      // O número pode viver na ficha OU nas respostas dos eventos
      // (numeroWhatsapp/contactoPrincipal) — é onde o dedupe também o
      // procura; a pesquisa vê o mesmo que o sistema sabe.
      const numeros = [
        c.contacto,
        ...(c.submissions || []).flatMap((e) => [
          e.respostas?.contactoPrincipal,
          e.respostas?.numeroWhatsapp,
        ]),
      ]
        .filter(Boolean)
        .map((n) => String(n).replace(/\D/g, ""));
      if (numeros.some((n) => n.includes(qDigitos))) return true;
    }
    return false;
  });

  // Alternador Lista ↔ Funil — vive acima de tudo, nas duas vistas
  const alternador = (
    <div style={{ display: "flex", gap: "8px", marginBottom: "18px" }}>
      {[
        { id: "lista", label: "Lista", icone: "contactos" },
        { id: "funil", label: "Funil", icone: "funil" },
      ].map((v) => {
        const ativo = vista === v.id;
        return (
          <button
            key={v.id}
            onClick={() => {
              ultimaVista = v.id;
              setVista(v.id);
            }}
            style={{
              padding: "8px 20px",
              borderRadius: "999px",
              fontSize: "13px",
              fontWeight: ativo ? "700" : "500",
              border: `1.5px solid ${ativo ? "var(--gold)" : "var(--gold-light)"}`,
              backgroundColor: ativo ? "var(--gold)" : "white",
              color: ativo ? "white" : "var(--charcoal)",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Icone nome={v.icone} tamanho={15} />
              {v.label}
            </span>
          </button>
        );
      })}
    </div>
  );

  // ===== VISTA FUNIL =====
  if (vista === "funil") {
    return (
      <div>
        {alternador}
        <FunilBoard
          eventTypes={eventTypes}
          onAbrirEvento={onAbrirEvento}
          refrescarEm={refrescarEm}
          onDadosMudaram={() => {
            carregar(); // a lista de pessoas
            if (onDadosMudaram) onDadosMudaram(); // Agenda/Início (AdminPage)
          }}
        />
      </div>
    );
  }

  // ===== VISTA LISTA =====
  if (carregando) {
    return (
      <div>
        {alternador}
        <p style={{ color: "var(--gray-mid)", fontSize: "14px" }}>
          A carregar clientes...
        </p>
      </div>
    );
  }
  if (erro) {
    return (
      <div>
        {alternador}
        <p style={{ color: "#DC2626", fontSize: "14px" }}>{erro}</p>
      </div>
    );
  }

  return (
    <div>
      {alternador}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: aberto
            ? "repeat(auto-fit, minmax(300px, 1fr))"
            : "1fr",
          gap: "20px",
          alignItems: "start",
        }}
      >
        {/* ===== LISTA DE CLIENTES (pessoas) ===== */}
        <div>
          <input
            style={{
              width: "100%",
              padding: "11px 14px",
              borderRadius: "10px",
              border: "1.5px solid var(--gold-light)",
              fontSize: "13px",
              outline: "none",
              marginBottom: "14px",
              boxSizing: "border-box",
            }}
            placeholder="Procurar por nome, contacto ou email..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />

          {filtrados.length === 0 && (
            <p style={{ color: "var(--gray-mid)", fontSize: "13px" }}>
              Nenhum cliente encontrado.
            </p>
          )}

          {filtrados.map((c) => {
            const ativo = aberto?.id === c.id;
            const fase = faseDaPessoa(c);
            const corFase = fase ? FASE_COR[fase] : null;
            return (
              <div
                key={c.id}
                onClick={() => abrirCliente(c.id)}
                style={{
                  backgroundColor: "white",
                  borderRadius: "14px",
                  padding: "14px 16px",
                  marginBottom: "10px",
                  border: ativo ? "2px solid var(--gold)" : "1px solid #F0EBE0",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  transition: "border 0.15s",
                }}
              >
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "50%",
                    backgroundColor: "#FBF7EF",
                    border: "1px solid var(--gold-light)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "Playfair Display, serif",
                    fontSize: "15px",
                    color: "var(--gold)",
                    flexShrink: 0,
                  }}
                >
                  {iniciais(c.nome)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: "14px",
                      fontWeight: "600",
                      color: "var(--charcoal)",
                      margin: 0,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {c.nome}
                  </p>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--gray-mid)",
                      margin: 0,
                    }}
                  >
                    {tiposDoCliente(c, eventTypes)}
                    {c.created_at ? ` · ${formatarCriado(c.created_at)}` : ""}
                  </p>
                </div>
                {corFase && (
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: "11px",
                      fontWeight: "600",
                      padding: "3px 10px",
                      borderRadius: "999px",
                      backgroundColor: corFase.bg,
                      color: corFase.cor,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {FASE_LABEL[fase]}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* ===== CLIENTE ABERTO — os eventos dela ===== */}
        {aberto && (
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "14px",
              padding: "18px",
              border: "1px solid #F0EBE0",
              boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
              position: "sticky",
              top: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "6px",
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  backgroundColor: "#FBF7EF",
                  border: "1px solid var(--gold-light)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Playfair Display, serif",
                  fontSize: "17px",
                  color: "var(--gold)",
                }}
              >
                {iniciais(aberto.nome)}
              </div>
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    fontSize: "16px",
                    fontWeight: "600",
                    fontFamily: "Playfair Display, serif",
                    color: "var(--charcoal)",
                    margin: 0,
                  }}
                >
                  {aberto.nome}
                </p>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--gray-mid)",
                    margin: 0,
                  }}
                >
                  {[aberto.contacto, aberto.nif ? `NIF ${aberto.nif}` : null]
                    .filter(Boolean)
                    .join(" · ") || "sem contacto"}
                </p>
              </div>
              <button
                onClick={() => setAberto(null)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "18px",
                  color: "var(--gray-mid)",
                  cursor: "pointer",
                }}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div
              style={{
                borderTop: "1px solid #F0EBE0",
                paddingTop: "12px",
                marginTop: "10px",
              }}
            >
              {aberto.eventos.length === 0 && (
                <p style={{ fontSize: "13px", color: "var(--gray-mid)" }}>
                  Ainda sem eventos.
                </p>
              )}
              {aberto.eventos.map((ev) => {
                const f = FASE_COR[ev.fase] || FASE_COR.interessado;
                return (
                  <motion.div
                    key={ev.id}
                    onClick={() => onAbrirEvento && onAbrirEvento(ev)}
                    initial="rest"
                    whileHover="hover"
                    variants={linhaEventoVariants}
                    transition={{ duration: 0.18, ease: EASE }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      padding: "11px 13px",
                      borderRadius: "10px",
                      border: "1px solid transparent",
                      marginBottom: "8px",
                      cursor: onAbrirEvento ? "pointer" : "default",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: "13px",
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
                          margin: 0,
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
                        gap: "6px",
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
                      <motion.button
                        onClick={(e) => {
                          e.stopPropagation();
                          pedirRemocaoEvento(ev);
                        }}
                        title="Remover este evento"
                        aria-label="Remover este evento"
                        variants={botaoRemoverVariants}
                        whileTap={{ scale: 0.85 }}
                        transition={{ duration: 0.18, ease: EASE }}
                        style={{
                          width: "26px",
                          height: "26px",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "50%",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        <Icone nome="lixo" tamanho={14} />
                      </motion.button>
                    </div>
                  </motion.div>
                );
              })}

              {perguntandoFase && !criandoEvento ? (
                <div
                  style={{
                    marginTop: "8px",
                    padding: "12px",
                    borderRadius: "10px",
                    border: "1.5px solid var(--gold-light)",
                    backgroundColor: "white",
                  }}
                >
                  <p
                    style={{
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "var(--charcoal)",
                      margin: "0 0 10px 0",
                    }}
                  >
                    Em que ponto está este evento?
                  </p>
                  <button
                    onClick={() => novoEvento("interessado")}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontWeight: "600",
                      border: "1.5px solid #F0D9B5",
                      backgroundColor: "#FEF3E2",
                      color: "#B45309",
                      cursor: "pointer",
                      marginBottom: "8px",
                      textAlign: "left",
                    }}
                  >
                    🟡 Ainda a decidir
                    <span
                      style={{
                        display: "block",
                        fontWeight: "400",
                        fontSize: "11px",
                        marginTop: "2px",
                      }}
                    >
                      Vai precisar de orçamento
                    </span>
                  </button>
                  <button
                    onClick={() => novoEvento("cliente")}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontWeight: "600",
                      border: "1.5px solid #BBE5C8",
                      backgroundColor: "#DCFCE7",
                      color: "#166534",
                      cursor: "pointer",
                      marginBottom: "8px",
                      textAlign: "left",
                    }}
                  >
                    🟢 Já fechado
                    <span
                      style={{
                        display: "block",
                        fontWeight: "400",
                        fontSize: "11px",
                        marginTop: "2px",
                      }}
                    >
                      A cliente confirmou o evento
                    </span>
                  </button>
                  <button
                    onClick={() => setPerguntandoFase(false)}
                    style={{
                      width: "100%",
                      padding: "7px",
                      borderRadius: "8px",
                      fontSize: "12px",
                      border: "none",
                      backgroundColor: "transparent",
                      color: "var(--gray-mid)",
                      cursor: "pointer",
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setPerguntandoFase(true)}
                  disabled={criandoEvento}
                  style={{
                    width: "100%",
                    marginTop: "8px",
                    padding: "10px",
                    borderRadius: "10px",
                    fontSize: "13px",
                    fontWeight: "600",
                    border: "1.5px solid var(--gold)",
                    color: criandoEvento ? "var(--gray-mid)" : "var(--gold)",
                    backgroundColor: "white",
                    cursor: criandoEvento ? "wait" : "pointer",
                  }}
                >
                  {criandoEvento
                    ? "A criar..."
                    : "+ Novo evento para esta cliente"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Confirmação de remoção de evento — nunca window.confirm,
          e nunca escondida dentro do detalhe (SubmissionDrawer): o
          botão vive já na lista, aqui a confirmação só evita um
          clique acidental a apagar um evento por engano. */}
      {eventoParaRemover && (
        <div
          onClick={() => {
            setEventoParaRemover(null);
            setVinculosEvento(null);
            setErroRemoverEvento(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 150,
            backgroundColor: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "white",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "400px",
              width: "100%",
              boxShadow: "0 8px 48px rgba(0,0,0,0.15)",
            }}
          >
            <h3
              style={{
                fontSize: "16px",
                color: "var(--charcoal)",
                margin: "0 0 12px 0",
                fontFamily: "Playfair Display, serif",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Remover evento?
            </h3>
            <p
              style={{
                fontSize: "13px",
                color: "var(--gray-mid)",
                margin: "0 0 16px 0",
                lineHeight: "1.6",
              }}
            >
              O evento <strong>{nomeTipo(eventoParaRemover)}</strong>{" "}
              {eventoParaRemover.data_evento
                ? `(${formatarData(eventoParaRemover.data_evento)}) `
                : ""}
              de <strong>{aberto?.nome}</strong> vai ser removido. Esta acção
              não pode ser anulada.
            </p>

            {vinculosEvento === null ? (
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--gray-mid)",
                  margin: "0 0 16px 0",
                }}
              >
                A verificar o que está ligado a este evento...
              </p>
            ) : (
              <>
                {vinculosEvento.pagamentos.length > 0 && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#7F1D1D",
                      backgroundColor: "#FEF2F2",
                      border: "1.5px solid #EF4444",
                      borderRadius: "8px",
                      padding: "12px 14px",
                      margin: "0 0 10px 0",
                      lineHeight: "1.6",
                    }}
                  >
                    <p style={{ margin: "0 0 6px 0", fontWeight: "700" }}>
                      🛑 Isto impede a remoção
                    </p>
                    <p style={{ margin: "0 0 6px 0" }}>
                      Este evento tem{" "}
                      {vinculosEvento.pagamentos.length === 1
                        ? "um pagamento registado"
                        : `${vinculosEvento.pagamentos.length} pagamentos registados`}{" "}
                      — dinheiro real não se apaga junto com o evento. Apaga
                      primeiro{" "}
                      {vinculosEvento.pagamentos.length === 1
                        ? "esse pagamento"
                        : "esses pagamentos"}{" "}
                      no separador Pagamentos da ficha do evento; só depois
                      este evento fica livre para remover.
                    </p>
                    <ul style={{ margin: 0, paddingLeft: "18px" }}>
                      {vinculosEvento.pagamentos.map((p) => (
                        <li key={p.id}>
                          {formatarEuros(p.valor)}
                          {p.data
                            ? ` · ${formatarData(p.data)}`
                            : " · data desconhecida (reconstituído)"}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {vinculosEvento.documentos.length > 0 && (
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#B91C1C",
                      backgroundColor: "#FEF2F2",
                      border: "1px solid #FECACA",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      margin: "0 0 10px 0",
                      lineHeight: "1.6",
                    }}
                  >
                    ⚠ Este evento tem{" "}
                    <strong>
                      {vinculosEvento.documentos
                        .map((d) => TIPO_DOC_LABEL[d.tipo] || d.tipo)
                        .join(", ")}
                    </strong>{" "}
                    — {vinculosEvento.documentos.length === 1 ? "vai" : "vão"}{" "}
                    ser apagado{vinculosEvento.documentos.length === 1 ? "" : "s"}{" "}
                    definitivamente junto com o evento.
                  </p>
                )}
                {vinculosEvento.reservas.length > 0 && (
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#92400E",
                      backgroundColor: "#FEF3E2",
                      border: "1px solid #F0D9B5",
                      margin: "0 0 10px 0",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      lineHeight: "1.6",
                    }}
                  >
                    ℹ Há uma reserva na Agenda ligada a este evento — fica lá,
                    mas desliga-se do evento removido.
                  </p>
                )}
                {(vinculosEvento.convitesPendentes?.length || 0) > 0 && (
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#92400E",
                      backgroundColor: "#FEF3E2",
                      border: "1px solid #F0D9B5",
                      margin: "0 0 10px 0",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      lineHeight: "1.6",
                    }}
                  >
                    ⚠{" "}
                    {vinculosEvento.convitesPendentes.length === 1
                      ? "Há um formulário por preencher apontado a este evento"
                      : `Há ${vinculosEvento.convitesPendentes.length} formulários por preencher apontados a este evento`}{" "}
                    (
                    {vinculosEvento.convitesPendentes
                      .map((c) => c.code)
                      .join(", ")}
                    ). Ao remover o evento,{" "}
                    {vinculosEvento.convitesPendentes.length === 1
                      ? "esse convite fica solto e, se for preenchido, cria um cliente e um evento novos"
                      : "esses convites ficam soltos e, se forem preenchidos, criam clientes e eventos novos"}{" "}
                    em vez de atualizar este. Apaga-
                    {vinculosEvento.convitesPendentes.length === 1 ? "o" : "os"}{" "}
                    primeiro na secção Formulários.
                  </p>
                )}
              </>
            )}

            {erroRemoverEvento && (
              <p
                style={{
                  fontSize: "12px",
                  color: "#EF4444",
                  backgroundColor: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  margin: "0 0 16px 0",
                }}
              >
                ⚠ {erroRemoverEvento}
              </p>
            )}
            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => {
                  setEventoParaRemover(null);
                  setVinculosEvento(null);
                  setErroRemoverEvento(null);
                }}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  border: "1.5px solid var(--gold-light)",
                  color: "var(--gray-mid)",
                  backgroundColor: "white",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              {(() => {
                const bloqueadoPorPagamentos =
                  (vinculosEvento?.pagamentos?.length || 0) > 0;
                const desativado =
                  removendoEvento ||
                  vinculosEvento === null ||
                  bloqueadoPorPagamentos;
                return (
                  <button
                    onClick={handleConfirmarRemocaoEvento}
                    disabled={desativado}
                    title={
                      bloqueadoPorPagamentos
                        ? "Apaga primeiro os pagamentos deste evento"
                        : undefined
                    }
                    style={{
                      padding: "10px 20px",
                      borderRadius: "8px",
                      fontSize: "13px",
                      fontWeight: "600",
                      border: "none",
                      backgroundColor: desativado ? "#FCA5A5" : "#EF4444",
                      color: "white",
                      cursor: desativado ? "not-allowed" : "pointer",
                    }}
                  >
                    {removendoEvento
                      ? "A remover..."
                      : vinculosEvento === null
                        ? "A verificar..."
                        : bloqueadoPorPagamentos
                          ? "Remoção bloqueada"
                          : "Remover"}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
