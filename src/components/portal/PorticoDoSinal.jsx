import { useEffect, useRef } from "react";
import { overline, playfair } from "./base";
import { FileteComLosango } from "./pecas";
import { LINHAS_DO_SINAL } from "./conteudo";

// ============================================================
// PorticoDoSinal — o portão escuro da página raiz, entre o aceite
// do orçamento e o sinal confirmado.
//
// Nasceu DestaqueAcompanhamento — um escuro informativo que abria por
// gesto («Ver melhor o que se abre») e saía por onde entrou — e virou
// pórtico por correcção do dono (10/08/2026): com o orçamento aceite,
// o acompanhamento em tempo real não se espreita — desbloqueia-se,
// com o sinal pago e confirmado pelo código. Quem volta à raiz (pelo
// botão, pelo gesto de voltar, pelo endereço) bate aqui: vê-se que a
// página existe, não se lê nada dela — e é isso que desperta a
// vontade de pagar o sinal já.
//
// O padrão é o do pórtico das condições: aparece de um golpe, o foco
// entra pelo título, o corpo prende o scroll. Sem Esc e sem «Voltar»,
// porque não há para onde — a raiz é isto até o sinal entrar. A única
// porta é a que interessa: pagar o sinal.
//
// As quatro linhas são AS MESMAS da divisão «O que o sinal abre» —
// uma lista só, em conteudo.js, para nunca divergirem uma palavra.
// ============================================================

export default function PorticoDoSinal({ reduzir, aoPagar }) {
  const tituloRef = useRef(null);

  useEffect(() => {
    // O foco entra pelo título — o leitor de ecrã ouve primeiro o
    // porquê do escuro. E o corpo da página prende-se: o scroll é do
    // pórtico, não da folha que ficou por baixo.
    tituloRef.current?.focus({ preventScroll: true });
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, []);

  return (
    <div
      className="acomp-nao-imprime"
      role="dialog"
      aria-modal="true"
      aria-label="O que o sinal abre"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        // Quase opaco de propósito, como o pórtico das condições: a
        // única leitura possível é esta.
        backgroundColor: "rgba(26,24,20,0.94)",
        overflowY: "auto",
        display: "flex",
        justifyContent: "center",
      }}
    >
      {/* margin auto no filho de um flex com scroll: centrado quando
          cabe, a rolar de cima quando não cabe — sem cortar o topo. */}
      <div style={{ width: "100%", maxWidth: "340px", margin: "auto", padding: "44px 22px", textAlign: "center" }}>
        <p style={overline("var(--gold-light)")}>Depois do sinal</p>
        <p
          ref={tituloRef}
          tabIndex={-1}
          style={{ ...playfair, color: "#FAF7EF", fontSize: "22px", lineHeight: 1.3, marginTop: "12px", textWrap: "balance", outline: "none" }}
        >
          O seu evento, em tempo real.
        </p>
        <FileteComLosango margem="18px 0 22px" largura={40} />

        {/* As linhas da divisão, com os engastes apagados dela — são
            coisas que ainda não aconteceram, e antes do sinal nem ao
            meio-tom do engaste normal têm direito. */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", margin: "0 auto", maxWidth: "260px" }}>
          {LINHAS_DO_SINAL.map((t) => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: "12px", textAlign: "left" }}>
              <span
                aria-hidden="true"
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  flexShrink: 0,
                  border: "1px solid rgba(232,213,163,0.45)",
                  opacity: 0.55,
                }}
              />
              <p style={{ ...playfair, color: "#FAF7EF", fontSize: "17px", lineHeight: 1.3, margin: 0 }}>{t}</p>
            </div>
          ))}
        </div>

        <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "rgba(250,250,248,0.62)", margin: "20px auto 0", maxWidth: "280px", textWrap: "pretty" }}>
          Com o sinal confirmado, esta mesma página acorda por inteiro —
          e acompanha o seu evento connosco, do primeiro esboço ao dia
          da montagem.
        </p>

        {/* O fecho fala como a frase de cerimónia — mas aqui em claro
            sobre escuro, nunca em dourado: o dourado do escuro é dos
            overlines. */}
        <p style={{ ...playfair, color: "#FAF7EF", fontSize: "16px", lineHeight: 1.62, margin: "22px 0 0", textWrap: "pretty" }}>
          A ligação que tem nas mãos é a chave.
          <br />
          O sinal abre-a.
        </p>

        {/* A cápsula da casa, pintada para o escuro — o desenho do
            pórtico das condições, aqui sempre viva: é a única porta. */}
        <button
          type="button"
          onClick={aoPagar}
          className="foco"
          style={{
            display: "block", width: "100%", boxSizing: "border-box", textAlign: "center",
            font: "600 11px Inter, sans-serif", letterSpacing: "0.14em", textTransform: "uppercase",
            borderRadius: "999px", padding: "15px 20px", marginTop: "26px",
            color: "var(--gold-dark)",
            backgroundColor: "white",
            border: "1px solid var(--gold)",
            cursor: "pointer",
            transition: reduzir ? "none" : "background-color 300ms ease",
          }}
        >
          Pagar o sinal
        </button>
      </div>
    </div>
  );
}
