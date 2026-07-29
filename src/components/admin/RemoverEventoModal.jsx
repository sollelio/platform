import { useEffect, useState } from "react";
import { deleteEvento, getVinculosEvento } from "../../lib/clientes";
import { formatarEuros } from "./orcamentos/orcamentoConfig";

// ============================================================
// RemoverEventoModal — a confirmação de remoção de um evento.
//
// Extraída do painel de cliente da ClientesLista SEM lhe mudar uma
// palavra nem um pixel: a vista nova (/admin/clientes/:clienteId) e o
// painel antigo passam a mostrar exactamente o mesmo diálogo, em vez
// de haver duas cópias a divergir com o tempo. Enquanto o painel
// existir, os dois chamam isto; quando o painel sair do fluxo, sai só
// o chamador.
//
// A confirmação é RICA E HONESTA, e é essa a razão de ela existir:
//   • BLOQUEIA mesmo (botão desactivado) se houver pagamentos —
//     dinheiro real não se apaga junto com um evento;
//   • avisa que documentos vão em cascata, e nomeia-os;
//   • avisa que uma reserva da Agenda se desliga;
//   • avisa que convites por preencher ficam soltos e passam a criar
//     cliente+evento novos em vez de actualizarem este.
// Nunca window.confirm — regra da casa.
//
// Traz consigo o seu próprio ciclo: pede os vínculos ao abrir, faz a
// remoção, traduz os erros da base. Quem chama só diz QUE evento é e
// o que fazer a seguir.
// ============================================================

// Rótulos dos tipos de documento — os mesmos da tab Documentos.
// "proposta" é a chave interna; na UI é "Projecto".
const TIPO_DOC_LABEL = {
  orcamento: "Orçamento",
  contrato: "Contrato",
  proposta: "Projecto",
};

export default function RemoverEventoModal({
  evento,
  nomeCliente,
  nomeTipo,
  formatarData,
  onFechar,
  onRemovido,
}) {
  const [vinculos, setVinculos] = useState(null);
  const [erro, setErro] = useState(null);
  const [aRemover, setARemover] = useState(false);

  // Vai ver o que este evento arrasta consigo — a Nádia decide já
  // informada, não às escuras. Uma falha a verificar NÃO bloqueia a
  // remoção: mostra-se o aviso genérico e segue.
  useEffect(() => {
    // Sem reset síncrono: o diálogo é montado de fresco por evento
    // (`key` no sítio onde é usado), logo o estado inicial já é o vazio.
    let cancelado = false;
    if (!evento) return;
    getVinculosEvento(evento.id)
      .then((v) => {
        if (!cancelado) setVinculos(v);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado) {
          setVinculos({
            documentos: [],
            reservas: [],
            pagamentos: [],
            convitesPendentes: [],
          });
        }
      });
    return () => {
      cancelado = true;
    };
  }, [evento]);

  if (!evento) return null;

  const confirmar = async () => {
    setARemover(true);
    setErro(null);
    try {
      await deleteEvento(evento.id);
      if (onRemovido) await onRemovido(evento);
    } catch (e) {
      console.error(e);
      // Código 23503 = violação de chave estrangeira — duas causas
      // possíveis, cada uma com a sua constraint nomeada (ver
      // getVinculosEvento em lib/clientes.js). Esta apanha só o caso
      // raro de um pagamento ter sido registado ENTRE abrir este
      // diálogo e clicar Remover — o aviso normal já bloqueia o botão
      // antes disso.
      if (e.code === "23503" && e.message?.includes("pagamentos_submission_fk")) {
        setErro(
          "Não é possível remover: entretanto ficou um pagamento registado neste evento. Fecha e volta a tentar.",
        );
      } else if (e.code === "23503") {
        setErro(
          "Não é possível remover: há um convite/formulário já preenchido ligado a este evento.",
        );
      } else {
        setErro("Ocorreu um erro ao remover. Tenta novamente.");
      }
      setARemover(false);
    }
  };

  const bloqueadoPorPagamentos = (vinculos?.pagamentos?.length || 0) > 0;
  const desativado = aRemover || vinculos === null || bloqueadoPorPagamentos;

  return (
    <div
      onClick={onFechar}
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
          O evento <strong>{nomeTipo(evento)}</strong>{" "}
          {evento.data_evento ? `(${formatarData(evento.data_evento)}) ` : ""}
          de <strong>{nomeCliente}</strong> vai ser removido. Esta acção não
          pode ser anulada.
        </p>

        {vinculos === null ? (
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
            {vinculos.pagamentos.length > 0 && (
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
                  {vinculos.pagamentos.length === 1
                    ? "um pagamento registado"
                    : `${vinculos.pagamentos.length} pagamentos registados`}{" "}
                  — dinheiro real não se apaga junto com o evento. Apaga
                  primeiro{" "}
                  {vinculos.pagamentos.length === 1
                    ? "esse pagamento"
                    : "esses pagamentos"}{" "}
                  no separador Pagamentos da ficha do evento; só depois este
                  evento fica livre para remover.
                </p>
                <ul style={{ margin: 0, paddingLeft: "18px" }}>
                  {vinculos.pagamentos.map((p) => (
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
            {vinculos.documentos.length > 0 && (
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
                  {vinculos.documentos
                    .map((d) => TIPO_DOC_LABEL[d.tipo] || d.tipo)
                    .join(", ")}
                </strong>{" "}
                — {vinculos.documentos.length === 1 ? "vai" : "vão"} ser
                apagado{vinculos.documentos.length === 1 ? "" : "s"}{" "}
                definitivamente junto com o evento.
              </p>
            )}
            {vinculos.reservas.length > 0 && (
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
                ℹ Há uma reserva na Agenda ligada a este evento — fica lá, mas
                desliga-se do evento removido.
              </p>
            )}
            {(vinculos.convitesPendentes?.length || 0) > 0 && (
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
                {vinculos.convitesPendentes.length === 1
                  ? "Há um formulário por preencher apontado a este evento"
                  : `Há ${vinculos.convitesPendentes.length} formulários por preencher apontados a este evento`}{" "}
                ({vinculos.convitesPendentes.map((c) => c.code).join(", ")}). Ao
                remover o evento,{" "}
                {vinculos.convitesPendentes.length === 1
                  ? "esse convite fica solto e, se for preenchido, cria um cliente e um evento novos"
                  : "esses convites ficam soltos e, se forem preenchidos, criam clientes e eventos novos"}{" "}
                em vez de atualizar este. Apaga-
                {vinculos.convitesPendentes.length === 1 ? "o" : "os"} primeiro
                na secção Formulários.
              </p>
            )}
          </>
        )}

        {erro && (
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
            ⚠ {erro}
          </p>
        )}
        <div
          style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}
        >
          <button
            onClick={onFechar}
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
          <button
            onClick={confirmar}
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
            {aRemover
              ? "A remover..."
              : vinculos === null
                ? "A verificar..."
                : bloqueadoPorPagamentos
                  ? "Remoção bloqueada"
                  : "Remover"}
          </button>
        </div>
      </div>
    </div>
  );
}
