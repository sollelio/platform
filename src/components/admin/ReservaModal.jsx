import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  createReserva,
  updateReserva,
  deleteReserva,
  cancelarReserva,
} from "../../lib/reservas";
import { irmaosDoDia } from "../../lib/disputaDia";
import AvisoDiaDisputado from "../AvisoDiaDisputado";

// ============================================================
// ReservaModal — criar ou editar uma reserva provisória.
// Usado pelo CalendarioTab: abre ao clicar no "+" de um dia
// (modo criar) ou ao clicar numa reserva existente (modo editar).
//
// Props:
//   dataInicial   — 'YYYY-MM-DD' pré-preenchida (modo criar)
//   reserva       — objeto da reserva a editar (modo editar); null = criar
//   eventTypes    — lista de tipos para o seletor
//   onGuardar(r)  — chamado após criar/atualizar, com a reserva resultante
//   onRemover(id) — chamado após apagar/cancelar
//   onConverter(r)— pedido de conversão em cliente (tratado no pai)
//   onFechar()
// ============================================================
export default function ReservaModal({
  dataInicial,
  reserva,
  eventTypes = [],
  onGuardar,
  onRemover,
  onConverter,
  onFechar,
}) {
  const edicao = !!reserva;

  const [nomeCliente, setNomeCliente] = useState(reserva?.nome_cliente || "");
  const [dataEvento, setDataEvento] = useState(
    reserva?.data_evento || dataInicial || "",
  );
  const [eventTypeId, setEventTypeId] = useState(reserva?.event_type_id || "");
  const [contacto, setContacto] = useState(reserva?.contacto || "");
  const [nota, setNota] = useState(reserva?.nota || "");
  const [guardando, setGuardando] = useState(false);
  const [erro, setErro] = useState(null);
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false);
  // A disputa da data escolhida — eventos vivos + reservas provisórias
  // do mesmo dia (Bloco 4; absorve a decisão pendente de 30/07). O "+"
  // do Calendário já traz a data pré-preenchida, por isso o aviso pinta
  // logo à abertura. Guarda-se {data, irmaos} e só se pinta quando a
  // data guardada É a actual do campo: uma resposta atrasada de uma
  // data antiga nunca aparece, e mudar a data apaga o aviso sozinha.
  const [disputaDia, setDisputaDia] = useState(null);

  // Consulta a disputa quando a data muda — debounce leve (o input de
  // data dispara a meio da escrita). Em edição exclui-se o evento
  // ligado à própria reserva (ninguém é rival de si mesmo); a linha da
  // própria reserva filtra-se abaixo pela mesma razão. Se a migração
  // 083 ainda não correu, irmaosDoDia devolve [] em silêncio e o aviso
  // não existe — degradação graciosa da casa.
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataEvento || "")) return undefined;
    let cancelado = false;
    const temporizador = setTimeout(async () => {
      // 104 · `[]` é resposta; a falha marca-se, não se confunde com ela.
      try {
        const lista = await irmaosDoDia(dataEvento, reserva?.submission_id);
        if (!cancelado) setDisputaDia({ data: dataEvento, irmaos: lista || [] });
      } catch (e) {
        console.error("Não foi possível verificar a disputa do dia:", e);
        if (!cancelado)
          setDisputaDia({ data: dataEvento, irmaos: [], falhou: true });
      }
    }, 350);
    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [dataEvento, reserva?.submission_id]);

  // Os irmãos VÁLIDOS para a data que está no campo agora — sem a
  // própria reserva (em edição, ela viria na lista como se fosse rival).
  const daDataActual = disputaDia && disputaDia.data === dataEvento;
  const irmaosDia = (daDataActual ? disputaDia.irmaos : []).filter(
    (i) => !(i.ehReserva && reserva && i.id === reserva.id),
  );
  // A consulta desta data não chegou ao fim (104).
  const falhouDia = !!daDataActual && !!disputaDia.falhou;

  const guardar = async () => {
    if (!nomeCliente.trim()) {
      setErro("O nome da cliente é obrigatório.");
      return;
    }
    setGuardando(true);
    setErro(null);
    try {
      const payload = {
        nomeCliente,
        dataEvento: dataEvento || null,
        eventTypeId: eventTypeId || null,
        contacto,
        nota,
      };
      const resultado = edicao
        ? await updateReserva(reserva.id, payload)
        : await createReserva(payload);
      onGuardar(resultado);
    } catch (e) {
      console.error(e);
      // As mensagens da casa (ex.: "já tem um evento vivo nesta data")
      // chegam inteiras; erros crus caem na genérica.
      setErro(
        e instanceof Error && e.message
          ? e.message
          : "Não foi possível guardar. Tenta novamente.",
      );
      setGuardando(false);
    }
  };

  const remover = async () => {
    setGuardando(true);
    try {
      await deleteReserva(reserva.id);
      onRemover(reserva.id);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível remover. Tenta novamente.");
      setGuardando(false);
    }
  };

  // Cancelar (soft) — a reserva fica registada fora da agenda e o
  // evento ligado passa a "perdido". Era a função que existia na lib
  // sem nenhum botão a chamá-la: "Remover" apagava a reserva e deixava
  // o evento fantasma em Interessados para sempre.
  const cancelar = async () => {
    setGuardando(true);
    try {
      await cancelarReserva(reserva.id);
      onRemover(reserva.id);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível cancelar. Tenta novamente.");
      setGuardando(false);
    }
  };

  return (
    <div
      onClick={onFechar}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 320,
        // Cortina unificada no token (decisão do Hélio, 16/08: um véu,
        // um valor): este era mais um 0.4 divergente.
        backgroundColor: "var(--cortina)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          backgroundColor: "var(--superficie)",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "400px",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 16px 48px rgba(0,0,0,0.18)",
        }}
      >
        {/* Cabeçalho */}
        <div
          style={{
            backgroundColor: "var(--gold)",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <p
              style={{
                fontFamily: "Playfair Display, serif",
                fontSize: "16px",
                color: "var(--texto-sobre-ouro)",
                margin: 0,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {edicao ? "Reserva" : "Nova Reserva"}
            </p>
            <p
              style={{
                fontSize: "10px",
                color: "var(--texto-sobre-ouro)",
                opacity: 0.85,
                margin: "2px 0 0 0",
                letterSpacing: "0.04em",
              }}
            >
              {edicao
                ? "Provisória · em conversa"
                : "Marcar um dia rapidamente"}
            </p>
          </div>
          <button
            onClick={onFechar}
            style={{
              background: "none",
              border: "none",
              color: "var(--texto-sobre-ouro)",
              fontSize: "18px",
              cursor: "pointer",
              lineHeight: 1,
              opacity: 0.85,
            }}
          >
            ✕
          </button>
        </div>

        {/* Corpo */}
        <div style={{ padding: "20px" }}>
          {/* Nome */}
          <div style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>Nome da cliente *</label>
            <input
              type="text"
              value={nomeCliente}
              onChange={(e) => setNomeCliente(e.target.value)}
              autoFocus={!edicao}
              placeholder="ex: Mónica Silva"
              style={inputStyle}
            />
          </div>

          {/* Data + Tipo lado a lado */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Data</label>
              <input
                type="date"
                value={dataEvento}
                onChange={(e) => setDataEvento(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Tipo</label>
              <select
                value={eventTypeId}
                onChange={(e) => setEventTypeId(e.target.value)}
                style={inputStyle}
              >
                <option value="">—</option>
                {eventTypes.map((et) => (
                  <option key={et.id} value={et.id}>
                    {et.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* O aviso da disputa — NUNCA bloqueia: a reserva cria-se na
              mesma (o dia só muda de mãos no registo do sinal). Fica
              logo por baixo do campo da data, a que ele responde. */}
          {/* O aviso é peça PÚBLICA embutida no admin — as cores dele
              são as da vitrina e não seguem o tema. A classe .papel
              reancora os tokens ao claro dentro desta ilha: no escuro,
              a moldura do modal escurece e o aviso fica como papel em
              cima da mesa (no claro a classe é um no-op, valores
              idênticos). */}
          {(irmaosDia.length > 0 || falhouDia) && (
            <div className="papel">
              <AvisoDiaDisputado
                dataISO={dataEvento}
                irmaos={irmaosDia}
                falhou={falhouDia}
                estilo={{ margin: "-4px 0 14px" }}
              />
            </div>
          )}

          {/* Contacto */}
          <div style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>Contacto</label>
            <input
              type="text"
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
              placeholder="Telefone, Instagram..."
              style={inputStyle}
            />
          </div>

          {/* Nota */}
          <div style={{ marginBottom: "18px" }}>
            <label style={labelStyle}>Nota</label>
            <textarea
              rows={2}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="ex: orçamento ~5k, vem ver o espaço dia 20"
              style={{ ...inputStyle, resize: "none" }}
            />
          </div>

          {erro && (
            <p
              style={{
                fontSize: "12px",
                // #EF4444 como TEXTO fica literal (padrão registado: o
                // token deste valor é o perigo CHEIO, escuro demais
                // para letra no modo escuro) — e o par fundo/borda
                // fica com ele: ilha clara legível nos dois modos.
                // Vai na lista.
                color: "#EF4444",
                backgroundColor: "#FEF2F2",
                border: "1px solid #FECACA",
                borderRadius: "8px",
                padding: "10px 14px",
                margin: "0 0 16px 0",
              }}
            >
              ⚠ {erro}
            </p>
          )}

          {/* Ações de conversão/remoção (só em edição) */}
          {edicao && (
            <div
              style={{
                display: "flex",
                gap: "8px",
                marginBottom: "16px",
                paddingBottom: "16px",
                borderBottom: "1px solid var(--gold-light)",
              }}
            >
              <button
                onClick={() => onConverter(reserva)}
                disabled={guardando}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: "600",
                  // O verde #15803D está fora da paleta (--sucesso-texto
                  // é #166534) — o par inteiro fica literal: ilha clara
                  // com letra escura nos dois modos. A borda #22C55E e
                  // o fundo #F0FDF4 seguem com o par; vai na lista.
                  border: "1.5px solid #22C55E",
                  backgroundColor: "#F0FDF4",
                  color: "#15803D",
                  cursor: guardando ? "not-allowed" : "pointer",
                  opacity: guardando ? 0.6 : 1,
                }}
              >
                ✓ Tornar cliente
              </button>
              {!confirmarRemocao ? (
                <button
                  onClick={() => {
                    setConfirmarRemocao(true);
                    setConfirmarCancelamento(false);
                  }}
                  disabled={guardando}
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: "600",
                    border: "1.5px solid var(--perigo-borda)",
                    backgroundColor: "var(--perigo-fundo)",
                    color: "var(--perigo)",
                    cursor: guardando ? "not-allowed" : "pointer",
                    opacity: guardando ? 0.6 : 1,
                  }}
                >
                  🗑 Remover
                </button>
              ) : (
                <button
                  onClick={remover}
                  disabled={guardando}
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: "700",
                    border: "none",
                    // Par literal: #DC2626 é o valor de --perigo, mas
                    // o papel aqui é botão CHEIO — no escuro esse
                    // token é salmão de texto e a letra branca deixava
                    // de se ler. O cheio da identidade é --perigo-cheio
                    // (#EF4444), outro valor; não se aproxima e segue
                    // no relatório.
                    backgroundColor: "#DC2626",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  Confirmar?
                </button>
              )}
            </div>
          )}

          {/* Cancelar (soft) — só quando há evento ligado no funil.
              A diferença diz-se por extenso; a confirmação é inline,
              nunca window.confirm. */}
          {edicao && reserva.submission_id && (
            <div style={{ margin: "-8px 0 16px 0" }}>
              {!confirmarCancelamento ? (
                <button
                  onClick={() => {
                    setConfirmarCancelamento(true);
                    setConfirmarRemocao(false);
                  }}
                  disabled={guardando}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: "600",
                    border: "1.5px solid var(--aviso-borda)",
                    backgroundColor: "var(--aviso-fundo)",
                    color: "var(--aviso-texto)",
                    cursor: guardando ? "not-allowed" : "pointer",
                    opacity: guardando ? 0.6 : 1,
                  }}
                >
                  ✖ Cancelar reserva — o negócio morreu
                </button>
              ) : (
                <button
                  onClick={cancelar}
                  disabled={guardando}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: "700",
                    border: "none",
                    // --aviso-texto com o papel trocado (texto usado
                    // como fundo): no escuro o token é âmbar-claro e o
                    // branco perdia-se — o par fica literal (branco
                    // sobre castanho lê-se nos dois modos) e segue na
                    // lista. A família aviso não tem «cheio».
                    backgroundColor: "#92400E",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  Confirmar? O evento dela passa a «perdido» no funil
                </button>
              )}
              <p
                style={{
                  fontSize: "10.5px",
                  color: "var(--gray-mid)",
                  margin: "6px 2px 0",
                  lineHeight: 1.5,
                }}
              >
                «Remover» apaga só a reserva e o evento fica no funil;
                «Cancelar» guarda o registo e marca o evento como perdido
                (recupera-se pelo funil se ela voltar).
              </p>
            </div>
          )}

          {/* Guardar / Cancelar */}
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={onFechar}
              style={{
                flex: 1,
                padding: "11px",
                borderRadius: "10px",
                fontSize: "13px",
                border: "1.5px solid var(--gold-light)",
                color: "var(--gray-mid)",
                backgroundColor: "var(--superficie)",
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={guardando}
              style={{
                flex: 2,
                padding: "11px",
                borderRadius: "10px",
                fontSize: "13px",
                fontWeight: "600",
                border: "none",
                // O ouro pálido do «A guardar…» fica literal (padrão da
                // casa, ver login): o token equivalente no escuro é tom
                // de borda, e um botão a meio do gesto não se apaga.
                backgroundColor: guardando ? "#E8D5A3" : "var(--gold)",
                color: "var(--texto-sobre-ouro)",
                cursor: guardando ? "not-allowed" : "pointer",
                boxShadow: "0 4px 12px rgba(var(--ouro-rgb), 0.3)",
              }}
            >
              {guardando
                ? "A guardar..."
                : edicao
                  ? "Guardar alterações"
                  : "Criar reserva"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

const labelStyle = {
  fontSize: "11px",
  fontWeight: "600",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  color: "var(--charcoal)",
  display: "block",
  marginBottom: "6px",
};

const inputStyle = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: "8px",
  border: "1.5px solid var(--gold-light)",
  fontSize: "13px",
  outline: "none",
  fontFamily: "Inter, sans-serif",
  boxSizing: "border-box",
  backgroundColor: "var(--superficie)",
};
