// ============================================================
// pecas.jsx — as peças reutilizáveis da vitrina do acompanhamento.
//
// Saíram da folha de decisões do Design com os valores exactos. Vivem aqui,
// e não dentro da PortalPage, porque a fase 2 acrescentou sete divisões que
// as usam todas.
//
// A dívida das cópias locais na PortalPage (fase 1) fechou na consolidação
// do fim da fase 7: hoje a página importa tudo daqui e de base.js, e só a
// Cortina e a pastilha «por definir» ficam locais a ela.
//
// Estilos INLINE, como o resto da aplicação. Nada de Tailwind, nada de CSS
// externo.
// ============================================================

import {
  overline, playfair,
} from "./base";

// As datas e os estilos vivem em `base.js` — ficheiro `.js` porque o
// linter da casa não deixa misturar funções puras com componentes.

// ---------- Divisor de cerimónia ----------
// Dois filetes que se dissolvem e um losango ao centro. Nunca uma linha de
// ponta a ponta.
export function FileteComLosango({ margem = "18px 0 16px", largura = 52, ponto = 5 }) {
  return (
    <div
      aria-hidden="true"
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", margin: margem }}
    >
      <div style={{ height: "1px", width: `${largura}px`, background: "linear-gradient(90deg, rgba(232,213,163,0), #E8D5A3)" }} />
      <div style={{ width: `${ponto}px`, height: `${ponto}px`, backgroundColor: "var(--gold)", transform: "rotate(45deg)" }} />
      <div style={{ height: "1px", width: `${largura}px`, background: "linear-gradient(90deg, #E8D5A3, rgba(232,213,163,0))" }} />
    </div>
  );
}

// Versão curta, com rótulo ao centro — abre a citação dela.
export function FileteComRotulo({ children, margem = "0 0 15px" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", margin: margem }}>
      <div aria-hidden="true" style={{ height: "1px", width: "34px", background: "linear-gradient(90deg, rgba(232,213,163,0), #E8D5A3)" }} />
      <p style={overline("#9B9B9B", "0.22em", "9px")}>{children}</p>
      <div aria-hidden="true" style={{ height: "1px", width: "34px", background: "linear-gradient(90deg, #E8D5A3, rgba(232,213,163,0))" }} />
    </div>
  );
}

// ---------- Marcas ----------
// Desenhadas à mão, stroke 1.9, pontas e uniões redondas. Nada de glifos.
// O `tamanho` é opcional e a predefinição é a de sempre (14): as três
// chamadas da fase 1 e das fases 3/4 não mudam de aspecto por causa disto.
export const VistoDourado = ({ tamanho = 14 }) => (
  <svg width={tamanho} height={tamanho} viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M3 7.4 L5.9 10.2 L11.2 3.9" stroke="var(--gold)" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// O losango das listas — o que não pede acção.
// Havia dois componentes com este nome — este e outro em
// questionario-pecas.jsx — que diferiam só na margem e na opacidade. Um
// nome repetido é pior do que código repetido: quem lê um ficheiro julga
// conhecer o outro. Agora é um, e o que variava passou a parâmetro.
export function Losango({ opacidade = 0.55, tamanho = 5, style }) {
  return (
    <div aria-hidden="true" style={{
      width: `${tamanho}px`, height: `${tamanho}px`, backgroundColor: "var(--gold)",
      transform: "rotate(45deg)", flex: "none", marginTop: "6px", opacity: opacidade,
      ...style,
    }} />
  );
}

// O engaste vazio: o que ainda não aconteceu.
export function EngasteVazio({ tamanho = 26 }) {
  return (
    <div aria-hidden="true" style={{
      width: `${tamanho}px`, height: `${tamanho}px`, borderRadius: "50%",
      backgroundColor: "#FDFBF5", border: "1px solid #E8DCC0", flex: "none",
    }} />
  );
}

// ---------- Superfícies ----------

export function CartaoBranco({ children, padding = "22px 20px", style }) {
  return (
    <div style={{
      backgroundColor: "white",
      border: "1.5px solid #F0E6D0",
      borderRadius: "14px",
      padding,
      boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
      ...style,
    }}>
      {children}
    </div>
  );
}

// O medalhão que assenta a meio da borda do cartão. Só para o que está
// FEITO — nunca para uma promessa.
export function Medalhao() {
  return (
    <div style={{
      position: "absolute", top: "-18px", left: "50%", transform: "translateX(-50%)",
      width: "36px", height: "36px", borderRadius: "50%",
      backgroundColor: "#FEF9EC", border: "1px solid #E8D5A3",
      boxShadow: "0 0 0 5px var(--cream), 0 4px 12px rgba(201,168,76,0.22)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <VistoDourado />
    </div>
  );
}

// ---------- Cabeçalho de divisão ----------
// O título é uma FRASE, não um rótulo: «O que vai estar à entrada.», não
// «Placa». O rótulo vive no overline.
export function CabecalhoDivisao({ rotulo, frase, meta }) {
  return (
    <div style={{ textAlign: "center" }}>
      <h2 style={overline()}>{rotulo}</h2>
      {frase && (
        <p style={{ ...playfair, fontSize: "21px", lineHeight: 1.3, marginTop: "11px", textWrap: "balance" }}>
          {frase}
        </p>
      )}
      {meta && (
        <p style={{ fontSize: "11.5px", color: "#9B9B9B", marginTop: "9px", letterSpacing: "0.02em", marginBottom: 0 }}>
          {meta}
        </p>
      )}
    </div>
  );
}

// ---------- Citação dela ----------
// Distingue-se da voz da casa por TRÊS sinais ao mesmo tempo: itálico, preto
// (a casa é dourada) e assinatura. Sem aspas angulares — as «» só entram se
// a frase for atribuída a alguém dentro de um texto nosso.
export function CitacaoDela({ texto, assinatura, tamanho = "16px", alturaLinha = 1.72 }) {
  return (
    <>
      <p style={{
        fontFamily: "'Playfair Display', serif", fontStyle: "italic",
        fontSize: tamanho, lineHeight: alturaLinha, color: "var(--charcoal)",
        margin: 0, textWrap: "pretty",
      }}>
        {texto}
      </p>
      {assinatura && (
        <p style={{ ...overline("#9B9B9B", "0.22em", "9px"), marginTop: "16px" }}>
          {assinatura}
        </p>
      )}
    </>
  );
}

// ---------- Lista do lado da casa ----------
// Sem cartão, de propósito: o que não pede acção não se veste de cartão.
// A 40% de opacidade e texto apagado, a mesma peça serve «o que já cá estava».
export function ListaDaCasa({ rotulo, itens, apagada = false }) {
  if (!itens || itens.length === 0) return null;
  return (
    <div style={{ marginTop: "28px", paddingTop: "19px", borderTop: "1px solid #F0E6D0" }}>
      <p style={{ ...overline("#9B9B9B", "0.22em", "9px"), textAlign: apagada ? "left" : "center" }}>
        {rotulo}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: apagada ? "11px" : "13px", marginTop: apagada ? "14px" : "16px" }}>
        {itens.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: "11px", alignItems: "flex-start" }}>
            <Losango opacidade={apagada ? 0.4 : 0.55} />
            <p style={{
              fontSize: "12.5px", lineHeight: apagada ? 1.6 : 1.65,
              color: apagada ? "#9B9B9B" : "var(--gray-mid)", margin: 0,
            }}>
              {t}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Frase de fecho ----------
// A ÚNICA ausência que se escreve: a divisão que existe mas está vazia por
// boa razão. Playfair 21 e filete.
export function FraseDeFecho({ frase, corpo }) {
  return (
    <div style={{ textAlign: "center" }}>
      <p style={{ ...playfair, fontSize: "21px", lineHeight: 1.32, marginTop: "14px", textWrap: "balance" }}>
        {frase}
      </p>
      <FileteComLosango margem="20px 0" />
      <p style={{ fontSize: "12.5px", lineHeight: 1.72, color: "var(--gray-mid)", margin: 0, textWrap: "pretty", padding: "0 6px" }}>
        {corpo}
      </p>
    </div>
  );
}

// O rodapé-assinatura da casa, nas páginas públicas.
export function Assinatura({ style }) {
  return (
    <p
      style={{
        font: "700 9px Inter, sans-serif",
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: "var(--gold-dark)",
        opacity: 0.62,
        textAlign: "center",
        margin: 0,
        ...style,
      }}
    >
      Do Luxo à Mesa · by Luxury Events
    </p>
  );
}

// A moldura de uma divisão: o espaço que a separa da anterior.
export function Divisao({ children, style }) {
  return <div style={{ marginTop: "38px", ...style }}>{children}</div>;
}
