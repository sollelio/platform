import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Convite } from "./acabamento";
import ConsultaEditor from "./ConsultaEditor";
import { listStaffMembers } from "../../lib/staff";
import {
  closeConsultation,
  enderecoDaConsulta,
  listConsultations,
  revokeRecipient,
} from "../../lib/consultas";

// ============================================================
// AS CONSULTAS DE DISPONIBILIDADE.
//
// Cada consulta cobre um ou mais eventos e tem uma ligação por pessoa. A
// entrega é à mão, por WhatsApp: o que esta página tem de fazer bem é
// dar a ligação certa, da pessoa certa, pronta a colar.
//
// «Copiado» só se afirma quando a cópia ACONTECEU — ver a folha do
// Portal do Cliente, que aprendeu isto primeiro: afirmar sucesso
// punha a Nádia a colar nada numa conversa.
//
// As respostas ainda não existem. Não se promete aqui nenhum estado
// de resposta que a base não saiba dar.
// ============================================================

const caixaErro = {
  fontSize: "12.5px",
  color: "var(--perigo-texto)",
  backgroundColor: "var(--perigo-fundo)",
  border: "1px solid var(--perigo-borda)",
  borderRadius: "10px",
  padding: "10px 14px",
  margin: "0 0 16px",
};

const cartao = {
  backgroundColor: "var(--superficie)",
  border: "1px solid var(--borda)",
  borderRadius: "14px",
  padding: "18px 20px",
  boxShadow: "var(--sombra-cartao)",
};

const seccao = {
  fontSize: "11px",
  fontWeight: "600",
  color: "var(--texto-suave)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  margin: "0 0 10px",
};

const dataCurta = (d) =>
  d
    ? new Date(`${d}T00:00:00`).toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "sem data";

export default function ConsultasTab({ organizationId, podeGerir }) {
  const [consultas, setConsultas] = useState([]);
  const [membros, setMembros] = useState([]);
  const [eventos, setEventos] = useState({});
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState(null);
  const [sucesso, setSucesso] = useState(null);
  const [copiado, setCopiado] = useState(null);
  const [aGuardar, setAGuardar] = useState(null);
  const [aCriar, setACriar] = useState(false);
  const [aFechar, setAFechar] = useState(null);

  const anunciar = (msg) => {
    setSucesso(msg);
    setTimeout(() => setSucesso(null), 4000);
  };

  const buscar = useCallback(async () => {
    if (!organizationId) return null;
    const [c, m] = await Promise.all([
      listConsultations(organizationId),
      listStaffMembers(organizationId),
    ]);
    // As datas dos eventos cobertos vêm do registo legado, pelo caminho
    // de sempre: não se duplica a data numa tabela nova.
    const ids = [
      ...new Set(c.flatMap((x) => x.eventos.map((e) => e.submission_id))),
    ];
    let mapa = {};
    if (ids.length) {
      const { supabase } = await import("../../lib/supabase");
      const { data, error } = await supabase
        .from("submissions")
        .select("id, data_evento, status, event_types ( nome )")
        .in("id", ids);
      if (error) throw error;
      mapa = Object.fromEntries((data ?? []).map((s) => [s.id, s]));
    }
    return { consultas: c, membros: m, eventos: mapa };
  }, [organizationId]);

  const carregar = useCallback(async () => {
    setACarregar(true);
    try {
      const r = await buscar();
      if (!r) return;
      setConsultas(r.consultas);
      setMembros(r.membros);
      setEventos(r.eventos);
      setErro(null);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível ler as consultas.");
    } finally {
      setACarregar(false);
    }
  }, [buscar]);

  useEffect(() => {
    let vivo = true;
    buscar()
      .then((r) => {
        if (!vivo || !r) return;
        setConsultas(r.consultas);
        setMembros(r.membros);
        setEventos(r.eventos);
        setErro(null);
        setACarregar(false);
      })
      .catch((e) => {
        if (!vivo) return;
        console.error(e);
        setErro("Não foi possível ler as consultas.");
        setACarregar(false);
      });
    return () => {
      vivo = false;
    };
  }, [buscar]);

  const nomeDaPessoa = (id) =>
    membros.find((m) => m.id === id)?.display_name ?? "—";

  const copiar = async (chave, endereco) => {
    try {
      await navigator.clipboard.writeText(endereco);
      setErro(null);
      setCopiado(chave);
      setTimeout(() => setCopiado(null), 2500);
    } catch (e) {
      console.error(e);
      setErro(
        "Não foi possível copiar automaticamente. Toca na ligação e copia à mão.",
      );
    }
  };

  const fechar = async (c) => {
    setAGuardar(`consulta:${c.id}`);
    try {
      await closeConsultation(c.id, "Fechada pela casa");
      await carregar();
      anunciar("Consulta fechada. As ligações deixaram de abrir.");
    } catch (e) {
      console.error(e);
      setErro("Não foi possível fechar a consulta.");
    } finally {
      setAGuardar(null);
      setAFechar(null);
    }
  };

  const revogar = async (d) => {
    setAGuardar(`destinatario:${d.id}`);
    try {
      await revokeRecipient(d.id, "Revogada pela casa");
      await carregar();
      anunciar("Ligação revogada.");
    } catch (e) {
      console.error(e);
      setErro("Não foi possível revogar a ligação.");
    } finally {
      setAGuardar(null);
    }
  };

  return (
    <motion.div
      key="tab-consultas"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "20px",
        }}
      >
        <div style={{ flex: 1, minWidth: "220px" }}>
          <h2
            style={{
              fontFamily: "Playfair Display, serif",
              fontSize: "20px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--texto)",
              margin: "0 0 6px",
            }}
          >
            Disponibilidades
          </h2>
          <p
            style={{
              fontSize: "12.5px",
              color: "var(--texto-suave)",
              margin: 0,
              lineHeight: 1.55,
            }}
          >
            Perguntar à equipa quem pode, para os eventos que escolheres. Cada
            pessoa recebe a sua ligação; envia-a por WhatsApp.
          </p>
        </div>
        {podeGerir && (
          <button
            className="acao acao--ouro"
            onClick={() => setACriar(true)}
            style={{
              padding: "9px 16px",
              borderRadius: "10px",
              fontSize: "12.5px",
              fontWeight: "500",
            }}
          >
            Nova consulta
          </button>
        )}
      </div>

      {erro && (
        <p role="alert" style={caixaErro}>
          ⚠ {erro}
        </p>
      )}
      {sucesso && (
        <p
          style={{
            fontSize: "12px",
            color: "var(--sucesso)",
            backgroundColor: "var(--sucesso-fundo)",
            border: "1px solid var(--sucesso-borda)",
            borderRadius: "8px",
            padding: "10px 14px",
            marginBottom: "16px",
          }}
        >
          ✓ {sucesso}
        </p>
      )}

      {aCarregar ? (
        <p style={{ color: "var(--texto-suave)", fontSize: "13px" }}>
          A carregar…
        </p>
      ) : consultas.length === 0 ? (
        <Convite
          titulo="Ainda não perguntaste a ninguém"
          texto="Uma consulta cobre os eventos que escolheres — costumam ser três de cada vez — e dá uma ligação a cada pessoa da equipa que tenha trabalho compatível neles. Precisa que os eventos já tenham tarefas escritas."
          accao="Nova consulta"
          onAccao={podeGerir ? () => setACriar(true) : undefined}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {consultas.map((c) => {
            const fechada = Boolean(c.closed_at);
            const ocupada = aGuardar === `consulta:${c.id}`;
            return (
              <div key={c.id} style={{ ...cartao, opacity: fechada ? 0.65 : 1 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    flexWrap: "wrap",
                    marginBottom: "14px",
                  }}
                >
                  <div style={{ flex: 1, minWidth: "180px" }}>
                    <p
                      style={{
                        fontFamily: "Playfair Display, serif",
                        fontSize: "16px",
                        color: "var(--texto)",
                        margin: "0 0 4px",
                      }}
                    >
                      {c.title}
                      {fechada && (
                        <span
                          style={{
                            fontSize: "10.5px",
                            fontFamily: "inherit",
                            color: "var(--texto-suave)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            marginLeft: "8px",
                          }}
                        >
                          fechada
                        </span>
                      )}
                    </p>
                    <p
                      style={{
                        fontSize: "12px",
                        color: "var(--texto-suave)",
                        margin: 0,
                      }}
                    >
                      {c.eventos
                        .map((e) => {
                          const ev = eventos[e.submission_id];
                          return `${dataCurta(ev?.data_evento)}${
                            ev?.event_types?.nome ? ` · ${ev.event_types.nome}` : ""
                          }`;
                        })
                        .join("   ·   ")}
                    </p>
                  </div>
                  {podeGerir && !fechada && (
                    <button
                      className="acao acao--neutra"
                      disabled={ocupada}
                      onClick={() => setAFechar(c.id)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "999px",
                        fontSize: "11.5px",
                      }}
                    >
                      Fechar
                    </button>
                  )}
                </div>

                {aFechar === c.id && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      flexWrap: "wrap",
                      backgroundColor: "var(--perigo-fundo)",
                      border: "1px solid var(--perigo-borda)",
                      borderRadius: "10px",
                      padding: "10px 14px",
                      marginBottom: "14px",
                    }}
                  >
                    <span
                      style={{ fontSize: "12.5px", color: "var(--perigo-texto)", flex: 1 }}
                    >
                      Fechar a consulta faz todas as ligações deixarem de abrir.
                    </span>
                    <button
                      className="acao acao--neutra"
                      onClick={() => setAFechar(null)}
                      style={{ padding: "6px 12px", borderRadius: "999px", fontSize: "11.5px" }}
                    >
                      Não
                    </button>
                    <button
                      className="acao acao--perigo"
                      disabled={ocupada}
                      onClick={() => fechar(c)}
                      style={{ padding: "6px 12px", borderRadius: "999px", fontSize: "11.5px" }}
                    >
                      {ocupada ? "A fechar…" : "Fechar"}
                    </button>
                  </div>
                )}

                <p style={seccao}>
                  As ligações · {c.destinatarios.length}{" "}
                  {c.destinatarios.length === 1 ? "pessoa" : "pessoas"}
                </p>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: "8px" }}
                >
                  {c.destinatarios.map((d) => {
                    const endereco = enderecoDaConsulta(d.token);
                    const chave = `dest:${d.id}`;
                    const revogada = Boolean(d.revoked_at);
                    const ocupado = aGuardar === `destinatario:${d.id}`;
                    return (
                      <div
                        key={d.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          flexWrap: "wrap",
                          padding: "8px 12px",
                          border: "1px solid var(--borda)",
                          borderRadius: "10px",
                          opacity: revogada || ocupado ? 0.55 : 1,
                        }}
                      >
                        <span
                          style={{
                            fontSize: "13px",
                            color: "var(--texto)",
                            flex: "1 1 140px",
                          }}
                        >
                          {nomeDaPessoa(d.staff_member_id)}
                          {revogada && (
                            <span
                              style={{
                                fontSize: "10.5px",
                                color: "var(--texto-suave)",
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                marginLeft: "8px",
                              }}
                            >
                              revogada
                            </span>
                          )}
                        </span>
                        <code
                          title={endereco}
                          style={{
                            fontSize: "11.5px",
                            color: "var(--texto-suave)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: "220px",
                          }}
                        >
                          …/disponibilidade/{d.token.slice(0, 10)}…
                        </code>
                        {!revogada && !fechada && (
                          <button
                            className="acao acao--neutra"
                            onClick={() => copiar(chave, endereco)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "999px",
                              fontSize: "11.5px",
                            }}
                          >
                            {copiado === chave ? "✓ Copiado" : "Copiar ligação"}
                          </button>
                        )}
                        {podeGerir && !revogada && (
                          <button
                            className="acao acao--neutra"
                            disabled={ocupado}
                            onClick={() => revogar(d)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "999px",
                              fontSize: "11.5px",
                            }}
                          >
                            Revogar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {aCriar && (
        <ConsultaEditor
          organizationId={organizationId}
          onCriada={async () => {
            setACriar(false);
            await carregar();
            anunciar("Consulta criada. Copia as ligações e envia-as.");
          }}
          onFechar={() => setACriar(false)}
        />
      )}
    </motion.div>
  );
}
