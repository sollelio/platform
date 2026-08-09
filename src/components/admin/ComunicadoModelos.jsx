import { useEffect, useState } from "react";
import {
  listarModelos,
  apagarModelo,
  historiaDoModelo,
  rotuloDaRegra,
} from "../../lib/comunicados";
import { getEventTypes } from "../../lib/invites";
import { Esqueleto } from "./acabamento";

// ============================================================
// ComunicadoModelos — a biblioteca de modelos de comunicado (fase 3).
//
// Um modelo de comunicado guarda TRÊS coisas — a folha, a mensagem e
// a regra de quem recebe — e é isso que cada cartão mostra. Nunca
// guarda os nomes, o endereço ou as leituras: esses nascem com cada
// comunicado.
//
// O ESTADO VAZIO é o ecrã principal do desenho: explica o que um
// modelo guarda ANTES de existir o primeiro, porque é aí que a
// explicação faz falta. A história de cada modelo («Usado 2 vezes ·
// o último em agosto») vem já derivada do listarModelos — contador
// guardado é contador que deriva.
// ============================================================

const OVERLINE = {
  fontSize: "9.5px",
  fontWeight: "700",
  letterSpacing: "0.15em",
  color: "var(--gold-dark)",
};

const MINI_OVERLINE = {
  fontSize: "9px",
  fontWeight: "700",
  letterSpacing: "0.14em",
  color: "#9B9B9B",
};

// O que o estado vazio promete que cada linha vai mostrar — as notas
// são as do desenho, palavra a palavra.
const O_QUE_GUARDA = [
  { num: "I", nome: "A folha", nota: "O título, os blocos e o aspecto — sóbrio ou convidativo." },
  { num: "II", nome: "A mensagem", nota: "O texto que acompanha o endereço na conversa." },
  {
    num: "III",
    nome: "Quem recebe",
    nota: "Não os nomes: a regra. «Casamentos por vir» conta-se de novo de cada vez.",
  },
];

// A linha «A FOLHA» de um modelo expandido: título · N blocos, e a
// menção a fotografia/chamada quando os blocos tipados existem.
const folhaDe = (m) => {
  const blocos = Array.isArray(m.blocos) ? m.blocos : [];
  const foto = blocos.some((b) => b.tipo === "imagem");
  const chamada = blocos.some((b) => b.tipo === "chamada");
  const extras =
    foto && chamada
      ? ", com fotografia e chamada"
      : foto
        ? ", com fotografia"
        : chamada
          ? ", com chamada"
          : "";
  const n = blocos.length;
  return `${(m.titulo || "").trim() || "Sem título"} · ${n === 1 ? "1 bloco" : `${n} blocos`}${extras}.`;
};

// As primeiras ~8 palavras da mensagem — o suficiente para a
// reconhecer, sem despejar o texto todo no cartão. O {NOME} aparece
// tal e qual está guardado: é a gramática da casa, não um defeito.
const previaMensagem = (t) => {
  const palavras = String(t || "").trim().split(/\s+/).filter(Boolean);
  if (!palavras.length) return null;
  const corte = palavras.slice(0, 8).join(" ");
  return palavras.length > 8 ? `${corte}…` : corte;
};

// O ícone de pessoas do desenho — uma à frente, outra atrás.
function IconePessoas() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="var(--gold-dark)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="6" cy="5.6" r="2.3" />
      <path d="M2.2 12.8c0-2.1 1.7-3.4 3.8-3.4s3.8 1.3 3.8 3.4" />
      <path d="M11 4.2a2.1 2.1 0 0 1 0 4" />
      <path d="M12.1 9.7c1.1.5 1.8 1.5 1.8 3.1" />
    </svg>
  );
}

export default function ComunicadoModelos({ onUsar, onIrAosFeitos }) {
  const [lista, setLista] = useState(null); // null = ainda a caminho
  const [tipos, setTipos] = useState([]);
  const [erro, setErro] = useState("");
  const [abertoId, setAbertoId] = useState(null); // «Ver o que guarda»
  const [armadoId, setArmadoId] = useState(null); // o apagar em duas fases
  const [ocupadoId, setOcupadoId] = useState(null); // usar ou apagar em curso
  const [erroCartao, setErroCartao] = useState(null); // {id, texto}

  const carregar = () =>
    listarModelos()
      .then((l) => {
        setLista(l);
        setErro("");
      })
      .catch((e) => {
        console.error(e);
        setErro("Não foi possível carregar os modelos.");
        setLista((prev) => prev || []);
      });

  useEffect(() => {
    carregar();
    // Os tipos servem só ao rótulo da regra («Casamentos por vir»);
    // sem eles o rótulo degrada para «Eventos» — degrada, não parte.
    getEventTypes()
      .then((t) => setTipos(t || []))
      .catch(() => {});
  }, []);

  // O apagar armado desarma sozinho aos 4s — a regra da casa.
  useEffect(() => {
    if (!armadoId) return undefined;
    const t = setTimeout(() => setArmadoId(null), 4000);
    return () => clearTimeout(t);
  }, [armadoId]);

  const usar = async (m) => {
    if (ocupadoId) return;
    setOcupadoId(m.id);
    setErroCartao(null);
    try {
      // O nascimento vive no ComunicadosTab (é ele que muda de vista);
      // aqui só se espera — e se falhar, o erro fica NESTE cartão.
      await onUsar(m);
    } catch (e) {
      console.error(e);
      setErroCartao({ id: m.id, texto: "Não foi possível criar um comunicado deste modelo. Tente outra vez." });
    } finally {
      setOcupadoId(null);
    }
  };

  const apagar = async (m) => {
    if (ocupadoId) return;
    if (armadoId !== m.id) {
      setArmadoId(m.id);
      return;
    }
    setArmadoId(null);
    setOcupadoId(m.id);
    setErroCartao(null);
    try {
      await apagarModelo(m.id);
      setLista((prev) => (prev || []).filter((x) => x.id !== m.id));
    } catch (e) {
      console.error(e);
      setErroCartao({ id: m.id, texto: "Não foi possível apagar o modelo. Tente outra vez." });
    } finally {
      setOcupadoId(null);
    }
  };

  return (
    <div style={{ maxWidth: "640px" }}>
      {/* Os hovers que os estilos em linha não dão (regra da camada
          de interacção): o X que só mostra o vermelho quando se paira,
          e o «Ver o que guarda» que escurece. */}
      <style>{`
        .dlm-molde-x {
          border: none;
          background-color: transparent;
          color: #C4C4C4;
        }
        .dlm-molde-x:hover:not(:disabled) {
          color: #DC2626;
          background-color: #FEF2F2;
        }
        .dlm-molde-ver:hover:not(:disabled) {
          border-color: var(--gold-light);
          color: var(--charcoal);
        }
      `}</style>

      <h1
        style={{
          margin: 0,
          fontFamily: "'Playfair Display', serif",
          fontSize: "24px",
          fontWeight: "400",
          lineHeight: 1.3,
        }}
      >
        Modelos de comunicado
      </h1>
      <p
        style={{
          margin: "7px 0 0",
          fontSize: "12.5px",
          lineHeight: 1.6,
          color: "var(--gray-mid)",
          textWrap: "pretty",
          maxWidth: "480px",
        }}
      >
        O que se guarda de um comunicado para voltar a usar: a folha, a
        mensagem e a regra de quem recebe. Como os modelos de evento, mas para o
        que se diz a muita gente ao mesmo tempo.
      </p>

      {erro && (
        <p role="alert" style={{ margin: "16px 0 0", fontSize: "12.5px", color: "#DC2626" }}>
          {erro}{" "}
          <button
            onClick={carregar}
            className="ligacao"
            style={{ fontSize: "12.5px", color: "var(--gold-dark)", textDecoration: "underline" }}
          >
            Tentar de novo
          </button>
        </p>
      )}

      {lista === null && (
        <div style={{ marginTop: "24px" }}>
          {[0, 1].map((i) => (
            <Esqueleto key={i} h={132} r={14} style={{ marginBottom: "12px" }} />
          ))}
        </div>
      )}

      {/* O ESTADO VAZIO — o ecrã principal do desenho: o que um modelo
          guarda, dito antes de existir o primeiro. */}
      {lista !== null && lista.length === 0 && !erro && (
        <div
          style={{
            marginTop: "24px",
            border: "1.5px dashed #E8DCC0",
            borderRadius: "16px",
            backgroundColor: "#FDFBF5",
            padding: "24px 20px 22px",
          }}
        >
          <div style={OVERLINE}>AINDA NÃO HÁ MODELOS</div>
          <div
            style={{
              margin: "10px 0 0",
              fontFamily: "'Playfair Display', serif",
              fontSize: "20px",
              lineHeight: 1.4,
              textWrap: "balance",
            }}
          >
            O primeiro modelo nasce de um comunicado que já saiu.
          </div>
          <p
            style={{
              margin: "11px 0 0",
              fontSize: "12.5px",
              lineHeight: 1.7,
              color: "var(--gray-mid)",
              textWrap: "pretty",
            }}
          >
            No fim de um envio, «Guardar como modelo» fica com três coisas
            — e é o que verá aqui em cada linha:
          </p>
          <div
            style={{
              marginTop: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "1px",
              backgroundColor: "#F0E6D0",
              border: "1px solid #F0E6D0",
              borderRadius: "12px",
              overflow: "hidden",
            }}
          >
            {O_QUE_GUARDA.map((g) => (
              <div
                key={g.num}
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "baseline",
                  backgroundColor: "#FFFFFF",
                  padding: "13px 15px",
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: "18px",
                    textAlign: "center",
                    fontFamily: "'Playfair Display', serif",
                    fontSize: "14px",
                    color: "var(--gold)",
                  }}
                >
                  {g.num}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: "600" }}>{g.nome}</div>
                  <div style={{ fontSize: "11.5px", lineHeight: 1.55, color: "var(--gray-mid)", marginTop: "2px" }}>
                    {g.nota}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p
            style={{
              margin: "14px 0 0",
              fontSize: "11.5px",
              fontStyle: "italic",
              lineHeight: 1.65,
              color: "var(--gray-mid)",
              textWrap: "pretty",
            }}
          >
            Não guarda os nomes, nem o endereço, nem as leituras: cada
            comunicado que nasce de um modelo é novo, e ganha endereço próprio.
          </p>
          <button
            onClick={onIrAosFeitos}
            className="acao acao--ouro"
            style={{
              marginTop: "18px",
              padding: "12px 20px",
              borderRadius: "10px",
              fontSize: "12.5px",
              fontWeight: "600",
            }}
          >
            Ir ao comunicado que já saiu
          </button>
        </div>
      )}

      {lista !== null && lista.length > 0 && (
        <>
          {lista.map((m) => {
            const eOferta = m.registo === "oferta";
            const aberto = abertoId === m.id;
            const armado = armadoId === m.id;
            const ocupado = ocupadoId === m.id;
            const rotulo = rotuloDaRegra(m.publico, tipos);
            const mensagem = previaMensagem(m.mensagem);
            return (
              <div
                key={m.id}
                style={{
                  marginTop: "12px",
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #F0E6D0",
                  borderRadius: "14px",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                  padding: "15px 16px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "14px", fontWeight: "600", lineHeight: 1.35 }}>{m.nome}</div>
                  {/* A pastilha do aspecto: o convidativo veste-se de
                      dourado, o sóbrio fica quieto — como na folha. */}
                  <div
                    style={{
                      flexShrink: 0,
                      padding: "3px 9px",
                      borderRadius: "999px",
                      backgroundColor: eOferta ? "#FEF9EC" : "#FFFFFF",
                      border: `1px solid ${eOferta ? "var(--gold-light)" : "#F0E6D0"}`,
                      fontSize: "9px",
                      fontWeight: "700",
                      letterSpacing: "0.12em",
                      color: eOferta ? "var(--gold-dark)" : "var(--gray-mid)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {eOferta ? "CONVIDATIVO" : "SÓBRIO"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "7px", marginTop: "8px" }}>
                  <IconePessoas />
                  <div style={{ fontSize: "12px", color: "var(--gray-mid)" }}>
                    {rotulo || "Ainda sem regra de quem recebe"}
                  </div>
                </div>
                <div style={{ fontSize: "11.5px", color: "#9B9B9B", marginTop: "5px" }}>
                  {historiaDoModelo(m.usos, m.ultimoUso)}
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginTop: "13px",
                    borderTop: "1px solid #F5ECD7",
                    paddingTop: "12px",
                  }}
                >
                  <button
                    onClick={() => usar(m)}
                    disabled={Boolean(ocupadoId)}
                    className="acao acao--cheia"
                    style={{
                      flexShrink: 0,
                      padding: "10px 15px",
                      borderRadius: "10px",
                      fontSize: "12.5px",
                      fontWeight: "600",
                      boxShadow: "0 4px 12px rgba(201,168,76,0.30)",
                    }}
                  >
                    Usar este modelo
                  </button>
                  <button
                    onClick={() => setAbertoId(aberto ? null : m.id)}
                    aria-expanded={aberto}
                    className="acao acao--neutra dlm-molde-ver"
                    style={{
                      flexShrink: 0,
                      padding: "10px 14px",
                      borderRadius: "10px",
                      fontSize: "12.5px",
                      fontWeight: "600",
                    }}
                  >
                    Ver o que guarda
                  </button>
                  <div style={{ flex: 1 }} />
                  {armado ? (
                    <button
                      onClick={() => apagar(m)}
                      disabled={ocupado}
                      className="acao"
                      style={{
                        flexShrink: 0,
                        padding: "8px 12px",
                        border: "1px solid #FECACA",
                        borderRadius: "999px",
                        backgroundColor: "#FEF2F2",
                        color: "#DC2626",
                        fontSize: "11.5px",
                        fontWeight: "600",
                      }}
                    >
                      {/* A verdade dita ANTES de confirmar: apagar o modelo
                          não leva atrás os comunicados que dele nasceram. */}
                      Confirmar? Os comunicados feitos ficam.
                    </button>
                  ) : (
                    <button
                      onClick={() => apagar(m)}
                      disabled={ocupado}
                      aria-label="Apagar o modelo"
                      title="Apagar o modelo"
                      className="acao dlm-molde-x"
                      style={{
                        flexShrink: 0,
                        width: "32px",
                        height: "32px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "8px",
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="M4 4l8 8M12 4l-8 8" />
                      </svg>
                    </button>
                  )}
                </div>

                {erroCartao?.id === m.id && (
                  <p role="alert" style={{ margin: "10px 0 0", fontSize: "12px", color: "#DC2626" }}>
                    {erroCartao.texto}
                  </p>
                )}

                {aberto && (
                  <div
                    style={{
                      marginTop: "12px",
                      borderTop: "1px solid #F5ECD7",
                      paddingTop: "13px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "11px",
                    }}
                  >
                    <div>
                      <div style={MINI_OVERLINE}>A FOLHA</div>
                      <div style={{ fontSize: "12.5px", lineHeight: 1.6, marginTop: "4px" }}>{folhaDe(m)}</div>
                    </div>
                    <div>
                      <div style={MINI_OVERLINE}>A MENSAGEM</div>
                      <div
                        style={{
                          fontSize: "12.5px",
                          lineHeight: 1.6,
                          marginTop: "4px",
                          color: "var(--gray-mid)",
                          fontStyle: mensagem ? "normal" : "italic",
                        }}
                      >
                        {mensagem || "— ainda sem mensagem —"}
                      </div>
                    </div>
                    <div>
                      <div style={MINI_OVERLINE}>QUEM RECEBE</div>
                      <div style={{ fontSize: "12.5px", lineHeight: 1.6, marginTop: "4px", color: "var(--gray-mid)" }}>
                        {rotulo
                          ? `${rotulo} — os nomes contam-se de novo de cada vez.`
                          : "Ainda sem regra — escolhe-se em cada comunicado que nascer daqui."}
                      </div>
                    </div>
                    {/* A linha de doutrina: o modelo de comunicado é
                        CÓPIA, ao contrário do modelo de evento. */}
                    <div
                      style={{
                        fontSize: "11.5px",
                        fontStyle: "italic",
                        lineHeight: 1.55,
                        color: "var(--gray-mid)",
                      }}
                    >
                      Alterações só valem para envios novos.
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <p
            style={{
              margin: "20px 0 0",
              fontSize: "11.5px",
              fontStyle: "italic",
              lineHeight: 1.65,
              color: "var(--gray-mid)",
              textWrap: "pretty",
            }}
          >
            Um modelo de comunicado guarda o que se diz e a quem — nunca os nomes, o endereço
            ou as leituras. Esses nascem com cada comunicado.
          </p>
        </>
      )}
    </div>
  );
}
