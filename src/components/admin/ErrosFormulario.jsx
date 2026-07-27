import { useState, useEffect } from "react";
import {
  getErrosFormulario,
  apagarErroFormulario,
} from "../../lib/errosForm";

// ============================================================
// ErrosFormulario — cartão no Início que mostra os erros técnicos
// registados pelos formulários públicos (tabela form_errors).
//
// Invisível quando não há erros (o caso normal). Quando um cliente
// falha a submeter, aparece aqui: a causa real (detalhe do PostgREST)
// E as respostas que o cliente tinha preenchido — dá para investigar
// e recuperar os dados sem pedir nada ao cliente.
// ============================================================

const formatarData = (iso) =>
  new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function ErrosFormulario() {
  const [erros, setErros] = useState([]);
  const [abertoId, setAbertoId] = useState(null);
  const [erroAcao, setErroAcao] = useState(null);

  const carregar = () => {
    getErrosFormulario(30)
      .then(setErros)
      .catch(() => {
        // Tabela ainda não criada ou BD indisponível — o cartão
        // simplesmente não aparece.
        setErros([]);
      });
  };

  useEffect(carregar, []);

  const resolver = async (id) => {
    setErroAcao(null);
    try {
      await apagarErroFormulario(id);
      setErros((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      console.error(e);
      // Barra no próprio cartão — a regra da casa não deixa alert()
      setErroAcao("Não foi possível apagar o registo. Tenta novamente.");
    }
  };

  if (erros.length === 0) return null;

  return (
    <div
      style={{
        backgroundColor: "#FEF2F2",
        border: "1px solid #FECACA",
        borderRadius: "14px",
        padding: "16px 18px",
        marginBottom: "22px",
      }}
    >
      <p
        style={{
          fontSize: "12px",
          fontWeight: "700",
          color: "#B91C1C",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          margin: "0 0 10px 0",
        }}
      >
        ⚠ {erros.length}{" "}
        {erros.length === 1
          ? "erro técnico num formulário"
          : "erros técnicos em formulários"}{" "}
        (últimos 30 dias)
      </p>
      {erroAcao && (
        <p
          style={{
            fontSize: "12px",
            color: "#B91C1C",
            backgroundColor: "white",
            border: "1px solid #FECACA",
            borderRadius: "8px",
            padding: "8px 12px",
            margin: "0 0 10px 0",
          }}
        >
          ⚠ {erroAcao}
        </p>
      )}
      {erros.map((e) => {
        const aberto = abertoId === e.id;
        const ctx = e.contexto || {};
        return (
          <div
            key={e.id}
            style={{
              backgroundColor: "white",
              borderRadius: "10px",
              border: "1px solid #FECACA",
              padding: "10px 14px",
              marginBottom: "8px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
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
                  {formatarData(e.created_at)} · {e.origem}
                  {ctx.inviteCode ? ` · convite ${ctx.inviteCode}` : ""}
                </p>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#B91C1C",
                    margin: "2px 0 0 0",
                    wordBreak: "break-word",
                  }}
                >
                  {e.mensagem}
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                <button
                  onClick={() => setAbertoId(aberto ? null : e.id)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    fontWeight: "600",
                    border: "1.5px solid var(--gold-light)",
                    backgroundColor: "white",
                    color: "var(--gold-dark)",
                    cursor: "pointer",
                  }}
                >
                  {aberto ? "fechar" : "detalhes"}
                </button>
                <button
                  onClick={() => resolver(e.id)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    fontWeight: "600",
                    border: "1.5px solid #FECACA",
                    backgroundColor: "white",
                    color: "#B91C1C",
                    cursor: "pointer",
                  }}
                >
                  ✓ resolvido
                </button>
              </div>
            </div>
            {aberto && (
              <pre
                style={{
                  marginTop: "10px",
                  marginBottom: 0,
                  padding: "10px",
                  backgroundColor: "#FAFAF8",
                  borderRadius: "8px",
                  fontSize: "11px",
                  lineHeight: 1.5,
                  overflowX: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {JSON.stringify(
                  {
                    detalhe: e.detalhe,
                    contexto: e.contexto,
                    respostas: e.respostas,
                  },
                  null,
                  2,
                )}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
