import { useEffect, useRef, useState } from "react";

// ============================================================
// acabamento — as três peças transversais do acabamento da casa:
//
//   Convite   — o estado VAZIO como convite, nunca como beco: filete
//               dourado, uma linha serif, a explicação curta e UMA
//               acção concreta que aponta o gesto seguinte.
//   Esqueleto — o estado de CARREGAMENTO com a forma do que vem:
//               blocos creme com ondulação calma, nas cores da casa.
//   useContagemAnimada — um número que muda à frente dos olhos conta
//               até lá (~480ms); na primeira pintura mostra logo o
//               final. O tabular-nums de quem o usa segura a largura.
//
// Vivem juntas porque são o mesmo critério aplicado a três estados:
// o vazio, o a-caminho e o a-mudar merecem o cuidado do estado normal.
// ============================================================

export function Convite({ titulo, texto, accao, onAccao }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px" }}>
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: "40px",
          height: "1px",
          backgroundColor: "var(--gold)",
          marginBottom: "16px",
        }}
      />
      <p
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "17px",
          color: "var(--charcoal)",
          margin: "0 0 6px",
        }}
      >
        {titulo}
      </p>
      <p
        style={{
          fontSize: "12.5px",
          color: "var(--gray-mid)",
          margin: onAccao ? "0 0 18px" : 0,
          lineHeight: 1.6,
          textWrap: "pretty",
        }}
      >
        {texto}
      </p>
      {onAccao && (
        <button
          onClick={onAccao}
          className="acao acao--ouro"
          style={{
            padding: "8px 16px",
            borderRadius: "999px",
            fontSize: "12.5px",
            fontWeight: "500",
          }}
        >
          {accao}
        </button>
      )}
    </div>
  );
}

export function Esqueleto({ w = "100%", h = 14, r = 8, style }) {
  return (
    <div
      aria-hidden
      className="esqueleto"
      style={{ width: w, height: h, borderRadius: r, ...style }}
    />
  );
}

export function useContagemAnimada(valor) {
  const alvo = Number(valor) || 0;
  const [mostrado, setMostrado] = useState(alvo);
  const anterior = useRef(alvo);

  useEffect(() => {
    const de = anterior.current;
    if (de === alvo) return;
    anterior.current = alvo;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      setMostrado(alvo);
      return;
    }
    const inicio = performance.now();
    const duracao = 480;
    let raf;
    const passo = (t) => {
      const p = Math.min(1, (t - inicio) / duracao);
      const suave = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setMostrado(de + (alvo - de) * suave);
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo]);

  return mostrado;
}
