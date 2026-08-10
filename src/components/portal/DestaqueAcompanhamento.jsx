import { useEffect, useRef, useState } from "react";
import { overline, playfair } from "./base";
import { FileteComLosango } from "./pecas";
import { LINHAS_DO_SINAL } from "./conteudo";

// ============================================================
// DestaqueAcompanhamento — o destaque escuro do que o sinal abre.
//
// O padrão é o do pórtico das condições (o mesmo escuro quase opaco,
// sem blur — vê-se que a página existe, não se lê), mas com um papel
// inverso: o pórtico tranca até se confirmar; este INFORMA e sai por
// onde entrou. Abre por um gesto do cliente («Ver melhor o que se
// abre», na divisão da jornada — o teaser da SinalVista caiu por
// redundante, correcção do dono de 10/08), por
// isso — ao contrário do pórtico, que aparece de um golpe — entra em
// fade; a saída dissolve como lá. Decisão de 08/08/2026: SEM código
// novo — a ligação que a cliente tem nas mãos é a chave, o sinal
// abre-a; e este destaque é a versão expandida da divisão «O que o
// sinal abre», nunca uma segunda história.
// ============================================================

// As quatro linhas são AS MESMAS da divisão «O que o sinal abre» — uma
// lista só, que vive em conteudo.js (é conteúdo, não desenho) e se
// importa nas duas superfícies, para nunca divergirem uma palavra.

export default function DestaqueAcompanhamento({ reduzir, aoFechar }) {
  const [aEntrar, setAEntrar] = useState(!reduzir);
  const [aDissolver, setADissolver] = useState(false);
  const tituloRef = useRef(null);
  const timerRef = useRef(null);

  const fechar = () => {
    if (aDissolver) return;
    if (reduzir) {
      aoFechar();
      return;
    }
    setADissolver(true);
    timerRef.current = setTimeout(aoFechar, 480);
  };
  // O Esc é a mesma porta que o «Voltar» — este escuro informa, não
  // tranca. A ref evita re-subscrever o teclado a cada render; e
  // actualiza-se num efeito, nunca durante o render (regra do linter).
  const fecharRef = useRef(fechar);
  useEffect(() => {
    fecharRef.current = fechar;
  });

  useEffect(() => {
    // O foco entra pelo título — o leitor de ecrã ouve primeiro o
    // porquê do escuro. O corpo da página prende-se: o scroll é do
    // destaque, não da folha que ficou por baixo. E o fade de entrada
    // arranca no primeiro frame pintado. Ao contrário do pórtico, este
    // escuro devolve à MESMA página — por isso guarda-se quem o abriu,
    // para o foco voltar ao teaser quando o destaque sair.
    const origem = document.activeElement;
    tituloRef.current?.focus({ preventScroll: true });
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => setAEntrar(false));
    const aoTecla = (e) => {
      if (e.key === "Escape") fecharRef.current();
    };
    window.addEventListener("keydown", aoTecla);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", aoTecla);
      document.body.style.overflow = anterior;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (origem instanceof HTMLElement) origem.focus({ preventScroll: true });
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
        // Quase opaco de propósito, como o pórtico: a única leitura
        // possível é esta.
        backgroundColor: "rgba(26,24,20,0.94)",
        overflowY: "auto",
        display: "flex",
        justifyContent: "center",
        opacity: aEntrar || aDissolver ? 0 : 1,
        transition: reduzir ? "none" : "opacity 450ms ease",
        pointerEvents: aDissolver ? "none" : "auto",
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

        {/* A saída vive DENTRO do véu, como no pórtico — os caminhos de
            regresso da página ficam todos debaixo dele. */}
        <p style={{ margin: "26px 0 0" }}>
          <button
            type="button"
            onClick={fechar}
            className="foco"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "inline-block",
              fontSize: "12px",
              letterSpacing: "0.03em",
              fontFamily: "inherit",
              color: "rgba(250,250,248,0.55)",
              padding: "12px 10px",
              margin: "-12px -10px",
            }}
          >
            <span style={{ borderBottom: "1px solid rgba(232,213,163,0.45)", paddingBottom: "3px" }}>Voltar</span>
          </button>
        </p>
      </div>
    </div>
  );
}
