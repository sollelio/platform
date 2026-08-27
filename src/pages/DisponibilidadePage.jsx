import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { verConsultaPublica } from "../lib/consultas";
import RespostaTarefa from "../components/disponibilidade/RespostaTarefa";

// ============================================================
// DisponibilidadePage — /disponibilidade/:token.
//
// A porta de UMA pessoa da equipa para UMA consulta. Sem conta, sem
// palavra-passe: o token é a única credencial, e é opaco — 32 bytes
// gerados na base.
//
// 🔴 Nem o id da casa, nem o id do evento, nem o id da pessoa chegam
// aqui. O URL leva só o token, e a projecção da RPC não devolve
// nenhum desses identificadores: um id que escapasse abriria o
// registo completo por outra porta.
//
// Cada pessoa vê apenas os eventos que têm trabalho compatível com o
// que ELA sabe fazer, e dentro deles só essas tarefas. Um evento sem
// nada para ela não aparece de todo — não é escondido, não vem.
//
// Não se diz de quem é o casamento: quem serve à mesa não precisa do
// nome dos noivos para dizer se pode nesse dia.
//
// Três estados, como nas outras portas da casa: a espera, a cortina
// (token errado, revogado, consulta fechada, eventos todos concluídos —
// TODOS a mesma resposta, de propósito) e a folha.
//
// Cada tarefa é uma pergunta que se guarda sozinha, ao toque. Ninguém
// tem de chegar ao fim para a primeira resposta valer: pode fechar a
// página a meio, voltar dias depois pela mesma ligação e encontrar o
// que já disse, tal como o disse. Responder tudo mostra o fecho — mas
// não fecha a porta: enquanto a consulta for válida, muda-se de ideias.
// ============================================================

const pagina = {
  minHeight: "100vh",
  backgroundColor: "#FAF7F2",
  padding: "32px 20px 64px",
  fontFamily:
    "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  color: "#1A1A1A",
};

const folha = {
  maxWidth: "560px",
  margin: "0 auto",
};

const cartao = {
  backgroundColor: "#FFFFFF",
  border: "1px solid #EDE6DA",
  borderRadius: "16px",
  padding: "20px 22px",
  boxShadow: "0 6px 24px rgba(26, 26, 26, 0.06)",
};

const serif = "'Playfair Display', Georgia, serif";

const dataLonga = (d) =>
  d
    ? new Date(`${d}T00:00:00`).toLocaleDateString("pt-PT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

const horas = (inicio, fim) => {
  if (!inicio) return "";
  const i = new Date(inicio);
  const hi = i.toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const diaI = i.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
  });
  if (!fim) return `${diaI}, ${hi}`;
  const f = new Date(fim);
  const hf = f.toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (f.toDateString() === i.toDateString()) return `${diaI}, ${hi}–${hf}`;
  const diaF = f.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
  return `${diaI} ${hi} → ${diaF} ${hf}`;
};

function Cortina() {
  return (
    <div style={pagina}>
      <div style={{ ...folha, textAlign: "center", paddingTop: "64px" }}>
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: "40px",
            height: "1px",
            backgroundColor: "#C9A961",
            marginBottom: "20px",
          }}
        />
        <p style={{ fontFamily: serif, fontSize: "20px", margin: "0 0 10px" }}>
          Esta ligação já não está activa
        </p>
        <p
          style={{
            fontSize: "13.5px",
            color: "#6B6B6B",
            margin: 0,
            lineHeight: 1.65,
          }}
        >
          Pode ter sido substituída por outra, ou os eventos já passaram. Se
          precisares, pede uma nova à casa.
        </p>
      </div>
    </div>
  );
}

function Espera() {
  return (
    <div style={pagina}>
      <div style={folha}>
        {[0, 1].map((i) => (
          <div
            key={i}
            style={{
              ...cartao,
              marginBottom: "12px",
              height: i === 0 ? "92px" : "150px",
              backgroundColor: "#F3EEE6",
              border: "none",
              boxShadow: "none",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function DisponibilidadePage() {
  const { token } = useParams();
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    let cancelado = false;
    verConsultaPublica(token)
      .then((r) => {
        if (cancelado) return;
        // A resposta guarda-se com o token que a pediu: uma resposta
        // atrasada de outro token nunca pinta esta página.
        setResultado({ token, dados: r });
      })
      .catch((e) => {
        if (cancelado) return;
        console.error(e);
        setResultado({ token, dados: null });
      });
    return () => {
      cancelado = true;
    };
  }, [token]);

  // A espera é DERIVADA: enquanto a resposta guardada não for a deste
  // token, ainda não chegou — e uma resposta atrasada de um token
  // anterior nunca pinta esta página.
  const desteToken = resultado?.token === token;
  const dados = desteToken ? resultado.dados : null;

  // Uma resposta guardada repinta a folha a partir do que a base
  // devolveu, sem segunda ida ao servidor. O que se guarda é a resposta
  // COMPLETA que a RPC confirmou — nunca o que se tinha no ecrã antes
  // de ela responder.
  const registar = (tarefaId) => (resposta, portaFechada) => {
    if (portaFechada) {
      setResultado({ token, dados: { estado: "terminado" } });
      return;
    }
    setResultado((antes) => {
      if (!antes || antes.token !== token || antes.dados?.estado !== "aberta")
        return antes;
      const eventos = (antes.dados.eventos ?? []).map((ev) => {
        if (!ev.tarefas?.some((t) => t.id === tarefaId)) return ev;
        const tarefas = ev.tarefas.map((t) =>
          t.id === tarefaId ? { ...t, resposta } : t,
        );
        return {
          ...ev,
          tarefas,
          respondidas: tarefas.filter((t) => t.resposta).length,
          total: tarefas.length,
        };
      });
      return { token, dados: { ...antes.dados, eventos } };
    });
  };

  if (!desteToken) return <Espera />;
  if (!dados || dados.estado !== "aberta") return <Cortina />;

  const eventos = dados.eventos ?? [];
  const totalPerguntas = eventos.reduce((n, ev) => n + (ev.total ?? 0), 0);
  const totalRespondidas = eventos.reduce(
    (n, ev) => n + (ev.respondidas ?? 0),
    0,
  );
  const tudoRespondido =
    totalPerguntas > 0 && totalRespondidas === totalPerguntas;

  return (
    <div style={pagina}>
      <div style={folha}>
        <header style={{ textAlign: "center", marginBottom: "26px" }}>
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: "40px",
              height: "1px",
              backgroundColor: "#C9A961",
              marginBottom: "18px",
            }}
          />
          <h1
            style={{
              fontFamily: serif,
              fontSize: "24px",
              fontWeight: 400,
              margin: "0 0 8px",
              letterSpacing: "0.01em",
            }}
          >
            {dados.consulta?.titulo}
          </h1>
          <p
            style={{
              fontSize: "13.5px",
              color: "#6B6B6B",
              margin: 0,
              lineHeight: 1.65,
            }}
          >
            Olá, {dados.pessoa?.nome}. Estas são as datas em que há trabalho
            para ti. Responde a cada uma — fica guardado logo, e podes voltar
            aqui mais tarde para acabar ou mudar.
          </p>
          {dados.consulta?.nota && (
            <p
              style={{
                fontSize: "13px",
                color: "#1A1A1A",
                backgroundColor: "#FFFFFF",
                border: "1px solid #EDE6DA",
                borderRadius: "12px",
                padding: "12px 16px",
                margin: "16px 0 0",
                lineHeight: 1.6,
                textAlign: "left",
              }}
            >
              {dados.consulta.nota}
            </p>
          )}
        </header>

        {eventos.length === 0 ? (
          <div style={{ ...cartao, textAlign: "center" }}>
            <p
              style={{
                fontSize: "13.5px",
                color: "#6B6B6B",
                margin: 0,
                lineHeight: 1.65,
              }}
            >
              Neste momento não há tarefas compatíveis contigo nestas datas.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {eventos.map((ev) => (
              <section key={ev.ordem} style={cartao}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  <p
                    style={{
                      fontSize: "10.5px",
                      color: "#9A9A9A",
                      textTransform: "uppercase",
                      letterSpacing: "0.09em",
                      margin: "0 0 6px",
                      flex: 1,
                    }}
                  >
                    {ev.tipo || "Evento"}
                  </p>
                  {/* Quanto falta NESTE cartão. Um número por evento e não
                    um só no topo: responde-se por dia, não por folha. */}
                  <p
                    style={{
                      fontSize: "11px",
                      margin: 0,
                      color:
                        ev.respondidas === ev.total ? "#2E7D32" : "#9A9A9A",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {ev.respondidas === ev.total
                      ? "✓ respondido"
                      : `${ev.respondidas} de ${ev.total} respondidas`}
                  </p>
                </div>
                <h2
                  style={{
                    fontFamily: serif,
                    fontSize: "17px",
                    fontWeight: 400,
                    margin: "0 0 4px",
                    textTransform: "capitalize",
                  }}
                >
                  {dataLonga(ev.data)}
                </h2>

                <div>
                  {(ev.tarefas ?? []).map((t) => (
                    <RespostaTarefa
                      key={t.id}
                      token={token}
                      tarefa={t}
                      quando={horas(t.inicio, t.fim)}
                      onGuardada={registar(t.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {tudoRespondido && (
          <div
            style={{
              ...cartao,
              marginTop: "14px",
              textAlign: "center",
              borderColor: "#CFE3D0",
              backgroundColor: "#F5FAF5",
            }}
          >
            <p
              style={{
                fontFamily: serif,
                fontSize: "17px",
                margin: "0 0 6px",
                color: "#2E7D32",
              }}
            >
              Está tudo respondido. Obrigada.
            </p>
            <p
              style={{
                fontSize: "13px",
                color: "#4F6B50",
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              A casa já tem as tuas respostas. Se mudares de ideias, volta aqui
              pela mesma ligação e altera — fica válida.
            </p>
          </div>
        )}

        <p
          style={{
            fontSize: "12px",
            color: "#9A9A9A",
            textAlign: "center",
            margin: "28px 0 0",
            lineHeight: 1.6,
          }}
        >
          Esta ligação é só tua. Guarda-a: podes voltar sempre que precisares.
        </p>
      </div>
    </div>
  );
}
