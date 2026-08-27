import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "../../lib/supabase";
import { ENGAGEMENT_LABELS } from "../../lib/staff";
import {
  createConsultation,
  listEligibleStaff,
  mensagemDaRecusa,
} from "../../lib/consultas";

// ============================================================
// CRIAR UMA CONSULTA DE DISPONIBILIDADE.
//
// Três passos numa folha só: nome, os eventos, e as pessoas.
//
// Três eventos de cada vez é o lote em que a casa trabalha — dito na
// folha como sugestão, nunca como trinco: escolher o quarto tem de ser
// possível sem pedir licença a ninguém.
//
// A lista de pessoas aparece assim que houver UM evento escolhido, e
// volta a ser calculada a cada mudança, porque quem é elegível DEPENDE
// do conjunto: uma pessoa só entra se tiver pelo menos uma tarefa
// compatível com o que sabe fazer. Oferecer antes seria oferecer gente
// que a base ia recusar.
//
// Quem não é consultável — a Nádia, por exemplo — nunca aparece:
// trabalha, mas não se pergunta.
// ============================================================

const caixaErro = {
  fontSize: "12.5px",
  color: "var(--perigo-texto)",
  backgroundColor: "var(--perigo-fundo)",
  border: "1px solid var(--perigo-borda)",
  borderRadius: "10px",
  padding: "10px 14px",
  margin: "0 0 14px",
};

const campo = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid var(--borda)",
  backgroundColor: "var(--superficie)",
  color: "var(--texto)",
  fontSize: "13px",
  boxSizing: "border-box",
};

const rotulo = {
  display: "block",
  fontSize: "11px",
  color: "var(--texto-suave)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: "5px",
};

const seccao = {
  fontSize: "11px",
  fontWeight: "600",
  color: "var(--texto-suave)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  margin: "22px 0 10px",
};

const dataCurta = (d) =>
  d
    ? new Date(`${d}T00:00:00`).toLocaleDateString("pt-PT", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "sem data";

export default function ConsultaEditor({ organizationId, onCriada, onFechar }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [eventos, setEventos] = useState([]);
  const [escolhidos, setEscolhidos] = useState([]);
  const [elegiveis, setElegiveis] = useState([]);
  const [pessoas, setPessoas] = useState([]);
  const [aCarregar, setACarregar] = useState(true);
  const [elegiveisPara, setElegiveisPara] = useState(null);
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState(null);

  // Os eventos com tarefas activas — só sobre esses faz sentido
  // perguntar disponibilidade. Sem data também contam: a tarefa tem
  // hora própria, e um evento por datar continua a precisar de gente.
  // Fora ficam só os que a casa já deu por concluídos.
  const buscarEventos = useCallback(async () => {
    const { data: tarefas, error: eT } = await supabase
      .from("event_tasks")
      .select("submission_id")
      .eq("organization_id", organizationId)
      .eq("is_active", true);
    if (eT) throw eT;
    const ids = [...new Set((tarefas ?? []).map((t) => t.submission_id))];
    if (ids.length === 0) return [];
    const { data, error } = await supabase
      .from("submissions")
      .select("id, data_evento, status, event_types ( nome )")
      .in("id", ids)
      // `neq` sozinho deixaria de fora quem tem status a null
      .or("status.is.null,status.neq.Concluído")
      .order("data_evento", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data ?? [];
  }, [organizationId]);

  useEffect(() => {
    let vivo = true;
    buscarEventos()
      .then((r) => {
        if (!vivo) return;
        setEventos(r);
        setACarregar(false);
      })
      .catch((e) => {
        if (!vivo) return;
        console.error(e);
        setErro("Não foi possível ler os eventos com tarefas.");
        setACarregar(false);
      });
    return () => {
      vivo = false;
    };
  }, [buscarEventos]);

  // Que escolha de eventos produziu a lista actual de elegíveis. Guardar
  // a chave em vez de um booleano «a procurar» deixa o estado de espera
  // ser DERIVADO — e um efeito que não escreve estado à cabeça não
  // provoca a segunda pintura.
  const chaveDaEscolha = escolhidos.join(",");
  const aProcurarPessoas =
    escolhidos.length > 0 && elegiveisPara !== chaveDaEscolha;

  // Assim que houver um evento, procura quem pode ser perguntado sobre
  // ele — e recalcula a cada evento que entra ou sai.
  useEffect(() => {
    // Limpar quando deixa de haver escolha é trabalho de quem carrega no
    // evento, não do efeito — ver alternarEvento.
    const ids = chaveDaEscolha ? chaveDaEscolha.split(",") : [];
    if (ids.length === 0) return;
    let vivo = true;
    listEligibleStaff(organizationId, ids)
      .then((r) => {
        if (!vivo) return;
        setElegiveis(r);
        setPessoas((antes) => antes.filter((id) => r.some((p) => p.id === id)));
        setElegiveisPara(chaveDaEscolha);
      })
      .catch((e) => {
        if (!vivo) return;
        console.error(e);
        setErro("Não foi possível ler quem pode ser consultado.");
        setElegiveisPara(chaveDaEscolha);
      });
    return () => {
      vivo = false;
    };
  }, [organizationId, chaveDaEscolha]);

  const alternarEvento = (id) => {
    setErro(null);
    const seguinte = escolhidos.includes(id)
      ? escolhidos.filter((x) => x !== id)
      : [...escolhidos, id];
    setEscolhidos(seguinte);
    // Mudar os eventos muda quem é elegível: o que estava escolhido
    // deixa de valer, e mostrá-lo enquanto se recalcula seria mentira.
    if (seguinte.length === 0) {
      setElegiveis([]);
      setPessoas([]);
      setElegiveisPara(null);
    }
  };

  const alternarPessoa = (id) => {
    setErro(null);
    setPessoas((antes) =>
      antes.includes(id) ? antes.filter((x) => x !== id) : [...antes, id],
    );
  };

  const submeter = async (e) => {
    e.preventDefault();
    if (!title.trim()) return setErro("Dá um nome à consulta.");
    if (escolhidos.length === 0) return setErro("Escolhe pelo menos um evento.");
    if (pessoas.length === 0) return setErro("Escolhe pelo menos uma pessoa.");

    setErro(null);
    setAGuardar(true);
    try {
      const id = await createConsultation({
        organizationId,
        title,
        notes,
        submissionIds: escolhidos,
        staffMemberIds: pessoas,
      });
      await onCriada(id);
    } catch (err) {
      console.error(err);
      setErro(mensagemDaRecusa(err));
      setAGuardar(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nova consulta de disponibilidade"
      onClick={onFechar}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "var(--cortina)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        zIndex: 150,
      }}
    >
      <motion.form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submeter}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          backgroundColor: "var(--superficie)",
          borderRadius: "16px",
          boxShadow: "var(--sombra-flutuante)",
          padding: "24px",
          width: "100%",
          maxWidth: "560px",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h3
          style={{
            fontFamily: "Playfair Display, serif",
            fontSize: "17px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--texto)",
            margin: "0 0 6px",
          }}
        >
          Nova consulta
        </h3>
        <p
          style={{
            fontSize: "12.5px",
            color: "var(--texto-suave)",
            margin: "0 0 18px",
            lineHeight: 1.55,
          }}
        >
          Escolhe os eventos e quem queres perguntar. Cada pessoa escolhida
          recebe uma ligação própria, para enviares por WhatsApp.
        </p>

        {erro && (
          <p role="alert" style={caixaErro}>
            ⚠ {erro}
          </p>
        )}

        <div>
          <label style={rotulo} htmlFor="consulta-title">
            Nome da consulta
          </label>
          <input
            id="consulta-title"
            autoFocus
            style={campo}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Fim de semana de Setembro"
          />
        </div>

        <p style={seccao}>
          Os eventos ·{" "}
          {escolhidos.length === 0
            ? "nenhum escolhido"
            : `${escolhidos.length} ${escolhidos.length === 1 ? "escolhido" : "escolhidos"}`}
        </p>
        <p
          style={{
            fontSize: "11.5px",
            color: "var(--texto-suave)",
            margin: "-4px 0 10px",
            lineHeight: 1.5,
          }}
        >
          Costumam ser três de cada vez, mas escolhe os que precisares.
        </p>
        {aCarregar ? (
          <p style={{ color: "var(--texto-suave)", fontSize: "13px" }}>
            A carregar…
          </p>
        ) : eventos.length === 0 ? (
          <p
            style={{
              fontSize: "12.5px",
              color: "var(--texto-suave)",
              lineHeight: 1.55,
            }}
          >
            Nenhum evento por concluir tem tarefas registadas. Abre um evento,
            escreve as tarefas dele, e a consulta passa a ser possível.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1px",
              backgroundColor: "var(--borda)",
              border: "1px solid var(--borda)",
              borderRadius: "12px",
              overflow: "hidden",
              maxHeight: "230px",
              overflowY: "auto",
            }}
          >
            {eventos.map((ev) => {
              const marcado = escolhidos.includes(ev.id);
              return (
                <button
                  key={ev.id}
                  type="button"
                  className="acao"
                  aria-pressed={marcado}
                  onClick={() => alternarEvento(ev.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 14px",
                    border: "none",
                    backgroundColor: marcado
                      ? "rgba(var(--ouro-rgb), 0.12)"
                      : "var(--superficie)",
                    fontSize: "12.5px",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: "16px",
                      height: "16px",
                      borderRadius: "50%",
                      border: `1.5px solid ${marcado ? "var(--ouro)" : "var(--borda)"}`,
                      backgroundColor: marcado ? "var(--ouro)" : "transparent",
                      color: "var(--texto-sobre-ouro)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "10px",
                      flexShrink: 0,
                    }}
                  >
                    {marcado ? "✓" : ""}
                  </span>
                  <span style={{ flex: 1, color: "var(--texto)" }}>
                    {dataCurta(ev.data_evento)}
                  </span>
                  <span style={{ color: "var(--texto-suave)" }}>
                    {ev.event_types?.nome ?? "—"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {escolhidos.length > 0 && (
          <>
            <p style={seccao}>Quem se vai perguntar</p>
            {aProcurarPessoas ? (
              <p style={{ color: "var(--texto-suave)", fontSize: "13px" }}>
                A ver quem pode…
              </p>
            ) : elegiveis.length === 0 ? (
              <p
                style={{
                  fontSize: "12.5px",
                  color: "var(--texto-suave)",
                  lineHeight: 1.55,
                }}
              >
                Ninguém da equipa tem funções compatíveis com as tarefas dos
                eventos escolhidos.
              </p>
            ) : (
              <>
                <div
                  style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}
                >
                  {elegiveis.map((p) => {
                    const marcada = pessoas.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={marcada}
                        onClick={() => alternarPessoa(p.id)}
                        style={{
                          fontSize: "11.5px",
                          padding: "6px 13px",
                          borderRadius: "999px",
                          cursor: "pointer",
                          border: `1px solid ${marcada ? "var(--ouro)" : "var(--borda)"}`,
                          backgroundColor: marcada
                            ? "rgba(var(--ouro-rgb), 0.12)"
                            : "transparent",
                          color: marcada ? "var(--ouro-texto)" : "var(--texto-suave)",
                        }}
                      >
                        {marcada ? "✓ " : "+ "}
                        {p.display_name}
                        <span style={{ opacity: 0.7 }}>
                          {" "}
                          · {ENGAGEMENT_LABELS[p.engagement] ?? p.engagement}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p
                  style={{
                    fontSize: "11.5px",
                    color: "var(--texto-suave)",
                    margin: "10px 0 0",
                    lineHeight: 1.5,
                  }}
                >
                  Só aparece quem é consultável e tem pelo menos uma tarefa
                  compatível nos eventos escolhidos. Cada pessoa vê apenas as
                  tarefas que sabe fazer.
                </p>
              </>
            )}
          </>
        )}

        <div style={{ marginTop: "18px" }}>
          <label style={rotulo} htmlFor="consulta-notas">
            Nota para a equipa (opcional)
          </label>
          <textarea
            id="consulta-notas"
            rows={2}
            style={{ ...campo, resize: "vertical" }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            marginTop: "22px",
          }}
        >
          <button
            type="button"
            className="acao acao--neutra"
            onClick={onFechar}
            style={{ padding: "9px 16px", borderRadius: "10px", fontSize: "12.5px" }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="acao acao--ouro"
            disabled={
              aGuardar || escolhidos.length === 0 || pessoas.length === 0
            }
            style={{
              padding: "9px 18px",
              borderRadius: "10px",
              fontSize: "12.5px",
              opacity:
                aGuardar || escolhidos.length === 0 || pessoas.length === 0
                  ? 0.6
                  : 1,
            }}
          >
            {aGuardar ? "A criar…" : "Criar consulta"}
          </button>
        </div>
      </motion.form>
    </div>
  );
}
