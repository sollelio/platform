import { useCallback, useEffect, useRef, useState } from "react";
import {
  getFotografias, carregarFotografia, apagarFotografia,
  mudarFotografia, reordenarFotografias, momentoPorOmissao,
} from "../../lib/fotografias";

// ============================================================
// FotografiasEvento — a aba das fotografias do dia (fase 6).
//
// ABA PRÓPRIA, e não secção na Visão geral, por quatro razões:
//   · a Visão geral é o BRIEFING e imprime-se — fotografias da montagem não
//     são briefing, são registo produzido durante;
//   · o gesto acontece no espaço, ao telemóvel: quem carrega quer chegar a
//     um sítio e largar as fotografias, não descer uma folha de 900 linhas;
//   · a aba dá contagem na etiqueta, e isso diz num relance se o dia ficou
//     registado;
//   · a montagem das abas é persistente e com memória de scroll, que é o
//     que um carregamento a meio precisa.
//
// ⚠ TUDO O QUE AQUI SE CARREGA É PARA A CLIENTE VER. Não há interruptor de
// visibilidade por fotografia — uma opção que se decide a cada carregamento
// é uma opção que vai ser ignorada ou enganada. Se um dia fizerem falta
// fotografias internas, é outra funcionalidade e outra conversa.
//
// A COMPRESSÃO não é opcional e acontece antes de sair do telemóvel: 3 a 5
// MB de origem, vistos a 390px de largura, muitas vezes na rua.
// ============================================================

const overline = {
  fontSize: "10px",
  fontWeight: "700",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--gold-dark)",
  margin: 0,
};

const botao = {
  padding: "9px 16px",
  borderRadius: "10px",
  fontSize: "12.5px",
  fontWeight: "600",
  fontFamily: "inherit",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const MOMENTOS = [
  { valor: "montagem", label: "Montagem" },
  { valor: "evento", label: "Do evento" },
];

export default function FotografiasEvento({ submissao, reportarContagem }) {
  const eventoId = submissao?.id;
  const dataEvento = submissao?.data_evento || null;

  const [fotos, setFotos] = useState([]);
  const [estado, setEstado] = useState("a-carregar");
  const [aCarregar, setACarregar] = useState(0); // quantas faltam subir
  const [erro, setErro] = useState(null);
  const [aConfirmarApagar, setAConfirmarApagar] = useState(null);
  const inputRef = useRef(null);

  // Recarga por contador, e não por chamada directa dentro do efeito: o
  // linter proíbe setState no corpo de um efeito, e com razão — é a família
  // do bug que chegou a produção. Aqui o efeito só arranca o pedido; quem
  // escreve estado é a resposta.
  const [recarga, setRecarga] = useState(0);
  const recarregar = useCallback(() => setRecarga((r) => r + 1), []);

  useEffect(() => {
    let cancelado = false;
    getFotografias(eventoId)
      .then((lista) => {
        if (cancelado) return;
        setFotos(lista);
        setEstado("pronto");
        reportarContagem?.("fotografias", lista.length);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado) setEstado("erro");
      });
    return () => {
      cancelado = true;
    };
  }, [eventoId, recarga, reportarContagem]);

  const escolher = async (e) => {
    const ficheiros = [...(e.target.files || [])].filter((f) =>
      f.type.startsWith("image/"),
    );
    e.target.value = "";
    if (ficheiros.length === 0) return;

    setErro(null);
    setACarregar(ficheiros.length);
    const momento = momentoPorOmissao(dataEvento);
    let ordem = fotos.length;

    // UMA A UMA, de propósito: no espaço a rede é o que é, e um lote de
    // doze em paralelo falha inteiro. Assim, o que subiu fica.
    for (const f of ficheiros) {
      try {
        await carregarFotografia(eventoId, f, { momento, ordem });
        ordem += 1;
      } catch (err) {
        console.error(err);
        setErro(
          `Não foi possível carregar «${f.name}». As que já subiram ficaram guardadas — tente outra vez só essa.`,
        );
      } finally {
        setACarregar((n) => Math.max(0, n - 1));
      }
    }
    recarregar();
  };

  const mover = async (indice, direccao) => {
    const destino = indice + direccao;
    if (destino < 0 || destino >= fotos.length) return;
    const nova = [...fotos];
    [nova[indice], nova[destino]] = [nova[destino], nova[indice]];
    setFotos(nova); // move já no ecrã; a base segue
    try {
      await reordenarFotografias(nova.map((f) => f.id));
    } catch (e) {
      console.error(e);
      setErro("Não foi possível guardar a ordem. Recarregue a página.");
      recarregar();
    }
  };

  const trocarMomento = async (foto, momento) => {
    setFotos((l) => l.map((f) => (f.id === foto.id ? { ...f, momento } : f)));
    try {
      await mudarFotografia(foto.id, { momento });
    } catch (e) {
      console.error(e);
      setErro("Não foi possível guardar. Tente novamente.");
      recarregar();
    }
  };

  const apagar = async (foto) => {
    setAConfirmarApagar(null);
    try {
      await apagarFotografia(foto);
      recarregar();
    } catch (e) {
      console.error(e);
      setErro("Não foi possível apagar. Tente novamente.");
    }
  };

  if (estado === "a-carregar") {
    return <p style={{ fontSize: "13px", color: "var(--gray-mid)" }}>A carregar…</p>;
  }

  return (
    <div style={{ maxWidth: "980px" }}>
      <p style={overline}>Fotografias do dia</p>
      <p
        style={{
          fontSize: "13px",
          lineHeight: 1.7,
          color: "var(--gray-mid)",
          margin: "8px 0 0",
          maxWidth: "62ch",
        }}
      >
        Tudo o que carregar aqui <strong style={{ fontWeight: 600 }}>a cliente vê</strong>,
        na página de acompanhamento. A primeira é a capa — arraste-a para cima
        com as setas, e ponha lá a mais adiantada: o trabalho a meio aparece
        por baixo.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginTop: "16px" }}>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={aCarregar > 0}
          style={{
            ...botao,
            border: "none",
            backgroundColor: "var(--gold)",
            color: "white",
            opacity: aCarregar > 0 ? 0.6 : 1,
            cursor: aCarregar > 0 ? "wait" : "pointer",
          }}
        >
          {aCarregar > 0
            ? `A carregar… faltam ${aCarregar}`
            : "Carregar fotografias"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={escolher}
          style={{ display: "none" }}
        />
        <span style={{ fontSize: "12px", color: "var(--gray-mid)" }}>
          {fotos.length === 0
            ? "Nenhuma ainda — a divisão não aparece no acompanhamento."
            : `${fotos.length} ${fotos.length === 1 ? "fotografia" : "fotografias"}`}
        </span>
      </div>

      {erro && (
        <p style={{ fontSize: "12.5px", lineHeight: 1.6, color: "#B91C1C", margin: "12px 0 0" }}>
          {erro}
        </p>
      )}

      {fotos.length === 0 ? (
        <p
          style={{
            fontSize: "12.5px",
            lineHeight: 1.7,
            color: "var(--gray-mid)",
            margin: "22px 0 0",
            padding: "16px 18px",
            backgroundColor: "#FBF9F4",
            border: "1px solid var(--hairline, #F0E6D0)",
            borderRadius: "10px",
            maxWidth: "62ch",
          }}
        >
          Enquanto não houver nenhuma, o acompanhamento não mostra secção
          nenhuma de fotografias — nem título, nem lugar reservado. É de
          propósito: um espaço à espera transforma uma surpresa numa promessa
          por cumprir.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "16px",
            marginTop: "22px",
          }}
        >
          {fotos.map((f, i) => (
            <div
              key={f.id}
              style={{
                border: `1.5px solid ${i === 0 ? "var(--gold)" : "var(--hairline, #F0E6D0)"}`,
                borderRadius: "12px",
                overflow: "hidden",
                backgroundColor: "white",
              }}
            >
              <div style={{ position: "relative", aspectRatio: "4 / 3", backgroundColor: "#F5F1E8" }}>
                <img
                  src={f.url_pequena}
                  alt={f.assunto || "Fotografia do dia"}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
                {i === 0 && (
                  <span
                    style={{
                      position: "absolute", top: "8px", left: "8px",
                      fontSize: "9.5px", fontWeight: "700", letterSpacing: "0.14em",
                      textTransform: "uppercase", color: "var(--gold-dark)",
                      backgroundColor: "rgba(255,253,246,0.94)",
                      border: "1px solid var(--gold-light)",
                      borderRadius: "999px", padding: "3px 9px",
                    }}
                  >
                    Capa
                  </span>
                )}
              </div>

              <div style={{ padding: "10px 12px 12px" }}>
                <input
                  type="text"
                  defaultValue={f.assunto || ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (f.assunto || "")) mudarFotografia(f.id, { assunto: v || null }).catch(console.error);
                  }}
                  placeholder="Assunto (ex.: A mesa principal)"
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "6px 8px", fontSize: "12px", fontFamily: "inherit",
                    color: "var(--charcoal)", border: "1px solid var(--hairline, #F0E6D0)",
                    borderRadius: "7px", outline: "none",
                  }}
                />
                <p style={{ fontSize: "10.5px", lineHeight: 1.5, color: "var(--gray-mid)", margin: "5px 0 0" }}>
                  Só aparece à cliente antes do evento. Depois, as legendas caem.
                </p>

                <div style={{ display: "flex", gap: "6px", marginTop: "9px" }}>
                  {MOMENTOS.map((m) => (
                    <button
                      key={m.valor}
                      onClick={() => trocarMomento(f, m.valor)}
                      style={{
                        flex: 1, padding: "5px 6px", fontSize: "11px",
                        fontFamily: "inherit", borderRadius: "999px", cursor: "pointer",
                        color: f.momento === m.valor ? "var(--gold-dark)" : "var(--gray-mid)",
                        backgroundColor: f.momento === m.valor ? "#FEF9EC" : "white",
                        border: `1px solid ${f.momento === m.valor ? "var(--gold)" : "#E8DCC0"}`,
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "10px" }}>
                  <button onClick={() => mover(i, -1)} disabled={i === 0} title="Subir"
                    style={{ ...botao, padding: "5px 10px", fontSize: "12px", border: "1px solid var(--hairline, #F0E6D0)", backgroundColor: "white", color: "var(--charcoal)", opacity: i === 0 ? 0.35 : 1 }}>
                    ↑
                  </button>
                  <button onClick={() => mover(i, 1)} disabled={i === fotos.length - 1} title="Descer"
                    style={{ ...botao, padding: "5px 10px", fontSize: "12px", border: "1px solid var(--hairline, #F0E6D0)", backgroundColor: "white", color: "var(--charcoal)", opacity: i === fotos.length - 1 ? 0.35 : 1 }}>
                    ↓
                  </button>
                  <span style={{ flex: 1 }} />
                  {aConfirmarApagar === f.id ? (
                    <>
                      <button onClick={() => apagar(f)}
                        style={{ ...botao, padding: "5px 10px", fontSize: "11.5px", border: "none", backgroundColor: "#B91C1C", color: "white" }}>
                        Apagar
                      </button>
                      <button onClick={() => setAConfirmarApagar(null)}
                        style={{ ...botao, padding: "5px 10px", fontSize: "11.5px", border: "1px solid var(--hairline, #F0E6D0)", backgroundColor: "white", color: "var(--charcoal)" }}>
                        Não
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setAConfirmarApagar(f.id)}
                      style={{ ...botao, padding: "5px 10px", fontSize: "11.5px", border: "1px solid #FECACA", backgroundColor: "white", color: "#B91C1C" }}>
                      Apagar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
