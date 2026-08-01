import { useEffect, useRef } from "react";
import { playfair, overline, diaMesAno, ehCodigoDeCor, HACHURA } from "./base";
import { VistoDourado, Losango } from "./pecas";

// ============================================================
// questionario-pecas.jsx — as peças do questionário no acompanhamento.
//
// Estilos INLINE, como o resto. Ficheiro `.jsx` porque só tem componentes;
// as funções puras vivem em `lib/questionarioPortal.js`
// (react-refresh/only-export-components).
//
// ─── O SINAL QUE CARREGA TUDO ─────────────────────────────────────────────
//
// Uma resposta que se pode mudar tem uma PAUTA DOURADA por baixo do valor:
// border-bottom 1px #E8D5A3. Uma que já fechou não tem pauta nenhuma.
//
// É esse traço, sozinho, que sustenta a grelha inteira — não há cadeados,
// não há cinzento-desactivado, não há riscos. Quem já usou a página uma vez
// aprende-o sem ninguém lho explicar, e a partir daí lê o estado de
// quarenta respostas num relance.
// ============================================================

const PAUTA_REPOUSO = "1px solid #E8D5A3";
const FILETE_LINHA = "1px solid #F3EBDA";

// ---------- A lista das partes (ecrãs 1 e 2) ----------
//
// NÃO HÁ BARRA DE PROGRESSO, nem percentagem, nem a palavra «em falta».
// Contam-se partes e perguntas — «seis perguntas», «respondida» — porque
// uma barra a 40% diz a quem chega que está atrasado, e não está: está no
// princípio.
//
// O fio vertical nasce e morre em transparente. Um fio que acaba a direito
// parece cortado; este parece continuar para lá do que se vê.
export function ListaDePartes({ partes, style }) {
  return (
    <div style={{ position: "relative", marginTop: "18px", paddingLeft: "40px", ...style }}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute", left: "12.5px", top: 0, bottom: 0, width: "1px",
          background:
            "linear-gradient(180deg, rgba(239,227,203,0) 0, #EFE3CB 16px, #EFE3CB calc(100% - 34px), rgba(239,227,203,0) calc(100% - 14px))",
        }}
      />
      {partes.map((p, i) => (
        <ParteDoQuestionario key={p.chave ?? i} {...p} />
      ))}
    </div>
  );
}

function ParteDoQuestionario({ nome, estado, contagem, feita, actual }) {
  const ehFeita = feita ?? estado === "feita";
  const ehActual = actual ?? estado === "actual";
  return (
    <div style={{ position: "relative", paddingBottom: "19px" }}>
      <div
        style={{
          position: "absolute", left: "-40px", top: "-2px",
          width: "26px", height: "26px", borderRadius: "50%",
          backgroundColor: ehFeita ? "#FEF9EC" : "#FDFBF5",
          border: `1px solid ${ehFeita ? "#E8D5A3" : ehActual ? "var(--gold)" : "#E8DCC0"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {ehFeita && <VistoDourado tamanho={13} />}
      </div>
      <p style={{ ...playfair, fontSize: "17px", lineHeight: 1.25, color: ehFeita ? "#9B9B9B" : "var(--charcoal)", margin: 0 }}>
        {nome}
      </p>
      <p style={{ fontSize: "11px", lineHeight: 1.5, color: "#9B9B9B", margin: "4px 0 0" }}>
        {contagem}
      </p>
    </div>
  );
}

// ---------- O cartão de um passo (ecrã 3) ----------
//
// Um cartão por PASSO do modelo, nunca por resposta. `overflow: hidden`
// porque a caixa de edição sangra de bordo a bordo lá dentro.
export function CartaoDePasso({ titulo, contagem, children, style }) {
  return (
    <div
      style={{
        backgroundColor: "white",
        border: "1.5px solid #F0E6D0",
        borderRadius: "14px",
        padding: "18px",
        overflow: "hidden",
        boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
        <p style={overline("#A07830", "0.22em", "9px")}>{titulo}</p>
        <span style={{ fontSize: "10.5px", color: "#9B9B9B", flexShrink: 0 }}>{contagem}</span>
      </div>
      {children}
    </div>
  );
}

// ---------- Uma linha de resposta ----------
//
// `podeMudar` decide a pauta, e a pauta decide tudo o resto. A linha é
// clicável nos dois casos: com pauta abre a edição, sem pauta abre a
// explicação do fecho. Nunca é um botão morto — um campo fechado que não
// responde ao toque lê-se como avaria.
export function LinhaDeResposta({
  rotulo, valor, tipo, opcoes, podeMudar, primeira, ultima, aberta, aoTocar, children, nota,
}) {
  const botaoRef = useRef(null);
  const antesAberta = useRef(aberta);

  // Quando a caixa fecha, o foco caía para o body e o teclado perdia o
  // sítio. Devolve-se ao botão da própria linha — mas só se mais nada tiver
  // ficado com o foco, para abrir OUTRA linha não roubar o autoFocus dela.
  useEffect(() => {
    if (antesAberta.current && !aberta) {
      const f = document.activeElement;
      if (!f || f === document.body) botaoRef.current?.focus();
    }
    antesAberta.current = aberta;
  }, [aberta]);

  return (
    <div
      style={{
        borderTop: primeira ? "none" : FILETE_LINHA,
        padding: ultima ? "14px 0 2px" : "14px 0",
      }}
    >
      <button
        ref={botaoRef}
        onClick={aoTocar}
        aria-expanded={aberta}
        style={{
          display: "block", width: "100%", textAlign: "left",
          background: "none", border: "none", padding: 0, margin: 0,
          font: "inherit", color: "inherit", cursor: "pointer",
        }}
      >
        <p style={{ fontSize: "11px", lineHeight: 1.5, letterSpacing: "0.02em", color: "#9B9B9B", margin: 0 }}>
          {rotulo}
        </p>
        <div style={{ marginTop: "6px" }}>
          <ValorDaResposta valor={valor} tipo={tipo} opcoes={opcoes} comPauta={podeMudar} />
        </div>
      </button>
      {nota}
      {children}
    </div>
  );
}

// ---------- O valor, escrito conforme o que é ----------
//
// Cada tipo tem a sua voz. Uma hora e um número são factos e vêm em
// Playfair grande com algarismos tabulares; um texto longo é a VOZ DELA e
// vem em itálico, porque é uma citação do que ela escreveu. Um texto curto
// é informação e fica em Inter.
//
// A pauta assenta no PRÓPRIO valor (inline-block), não na largura da linha:
// sublinha o que se muda, não o sítio onde ele está.
export function ValorDaResposta({ valor, tipo, opcoes, comPauta }) {
  const pauta = comPauta
    ? { display: "inline-block", borderBottom: PAUTA_REPOUSO, paddingBottom: "3px" }
    : null;

  if (valor === null || valor === undefined || valor === "" ||
      (Array.isArray(valor) && valor.length === 0)) {
    return (
      <span style={{ fontSize: "12.5px", lineHeight: 1.55, color: "#9B9B9B", fontStyle: "italic", ...pauta }}>
        por responder
      </span>
    );
  }

  if (tipo === "paleta") return <Paleta cores={valor} />;

  if (tipo === "radio" || tipo === "checkbox" || tipo === "select") {
    const escolhidas = Array.isArray(valor) ? valor : [valor];
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
        {(opcoes && opcoes.length ? opcoes : escolhidas).map((o) => {
          const activa = escolhidas.includes(o);
          return (
            <span
              key={o}
              style={{
                fontSize: "11px", borderRadius: "999px", padding: "4px 11px",
                color: activa ? "#A07830" : "#9B9B9B",
                backgroundColor: activa ? "#FEF9EC" : "#FDFBF5",
                border: `1px solid ${activa ? "#E8D5A3" : "#E8DCC0"}`,
              }}
            >
              {o}
            </span>
          );
        })}
      </div>
    );
  }

  if (tipo === "textarea") {
    return (
      <p style={{ ...playfair, fontStyle: "italic", fontSize: "14.5px", lineHeight: 1.75, color: "var(--charcoal)", margin: 0, ...(comPauta ? { display: "block", borderBottom: PAUTA_REPOUSO, paddingBottom: "10px" } : null) }}>
        {String(valor)}
      </p>
    );
  }

  // Uma data ISO nunca se mostra crua: «2026-08-04» é «4 de Agosto de 2026».
  // Se não se conseguir ler, sai como veio — mais vale cru do que errado.
  if (tipo === "date") {
    return (
      <span style={{ fontSize: "13px", lineHeight: 1.5, ...pauta }}>
        {diaMesAno(String(valor)) || String(valor)}
      </span>
    );
  }

  if (tipo === "time" || tipo === "number") {
    return (
      <span style={{ ...playfair, fontSize: "20px", lineHeight: 1.2, fontVariantNumeric: "tabular-nums", ...pauta }}>
        {String(valor)}
      </span>
    );
  }

  if (tipo === "morada" && typeof valor === "object") {
    return (
      <span style={{ fontSize: "13px", lineHeight: 1.5, ...pauta }}>
        {Object.values(valor).filter(Boolean).join(", ")}
      </span>
    );
  }

  return (
    <span style={{ fontSize: "13px", lineHeight: 1.5, ...pauta }}>{String(valor)}</span>
  );
}

// A paleta nunca leva pauta: no portal mostra-se, e mudá-la passa por
// pedido — é o que o próprio desenho faz no ecrã do pedido de alteração.
function Paleta({ cores }) {
  const lista = Array.isArray(cores) ? cores : [cores];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "9px" }}>
      {lista.filter(Boolean).map((c, i) => {
        const codigo = typeof c === "string" ? c : c?.cor || c?.valor;
        const nome = typeof c === "string" ? c : c?.nome;
        const ehCor = ehCodigoDeCor(codigo);
        return (
          <span key={`${codigo}-${i}`} title={nome || codigo} style={{ display: "block" }}>
            <span
              style={{
                display: "block", width: "30px", height: "30px", borderRadius: "50%",
                background: ehCor ? codigo : HACHURA,
                border: "1px solid #E8DCC0",
                boxShadow: "inset 0 1px 3px rgba(45,33,10,0.10)",
              }}
            />
          </span>
        );
      })}
    </div>
  );
}

// ---------- A caixa que se abre no lugar (ecrãs 4, 6 e 7) ----------
//
// Sangra de bordo a bordo do cartão (margin 0 -18px) e assenta entre dois
// filetes dourados. NÃO É MODAL e não é página: as respostas vizinhas ficam
// à vista, porque mudar uma coisa não é sair do sítio.
export function CaixaAberta({ children, primeira, style }) {
  return (
    <div
      style={{
        margin: primeira ? "0 -18px" : "12px -18px 0",
        backgroundColor: "#FDFBF5",
        borderTop: PAUTA_REPOUSO,
        borderBottom: PAUTA_REPOUSO,
        padding: "20px 18px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ---------- O fio do guardado (ecrã 5) ----------
//
// A confirmação mais pequena da casa: sem cartão de aviso, sem página de
// sucesso, sem medalhão — esse fica para os actos com registo. Guardar uma
// resposta não vincula ninguém a nada, e a marca apaga-se sozinha.
export function FioDeGuardado({ texto = "Guardado agora mesmo · a equipa fica a saber" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "9px" }}>
      <span
        style={{
          width: "15px", height: "15px", borderRadius: "50%",
          backgroundColor: "#FEF9EC", border: "1px solid #E8D5A3",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}
      >
        <VistoDourado tamanho={9} />
      </span>
      <span style={{ fontSize: "10.5px", lineHeight: 1.6, color: "#A07830" }}>{texto}</span>
    </div>
  );
}

// ---------- A marca de autoria (ecrã 6) ----------
//
// «a equipa», no colectivo — nunca um nome. Nada desaparece em silêncio e
// nada acusa ninguém.
//
// E aparece SÓ quando a última escrita não foi dela. A maior parte das
// respostas é da própria pessoa e não leva marca nenhuma: o ecrã fica quase
// sempre limpo, que é o ponto.
export function MarcaDeAutoria({ quando, antes, aberta }) {
  if (!aberta) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "7px", marginTop: "7px" }}>
        <Losango tamanho={4} opacidade={1} style={{ marginTop: 0 }} />
        <span style={{ fontSize: "10.5px", lineHeight: 1.6, color: "#9B9B9B" }}>
          actualizado pela equipa a {quando}
        </span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: "10px", marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #F0E6D0" }}>
      <span style={{ marginTop: "6px", flexShrink: 0 }}><Losango tamanho={5} opacidade={1} style={{ marginTop: 0 }} /></span>
      <div>
        <p style={{ fontSize: "12px", lineHeight: 1.6, color: "var(--charcoal)", margin: 0, textWrap: "pretty" }}>
          Actualizado pela equipa a {quando}.
        </p>
        {antes !== null && antes !== undefined && antes !== "" && (
          <p style={{ fontSize: "11px", lineHeight: 1.65, color: "#9B9B9B", margin: "7px 0 0", textWrap: "pretty" }}>
            Antes dizia:{" "}
            <span style={{ textDecoration: "line-through", textDecorationColor: "#D8C6B8" }}>
              {typeof antes === "object" ? JSON.stringify(antes) : String(antes)}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

// ---------- O bloco do campo fechado (ecrã 7) ----------
//
// Usa EXACTAMENTE a mesma caixa do campo em edição — nunca a caixa de
// recusa. Nada de tijolo, nada de losango de aviso: isto não é erro dela, é
// protecção da montagem.
//
// A ordem é obrigatória e é o que faz a diferença entre explicação e porta
// na cara: primeiro o MOTIVO MATERIAL, depois a data, depois o que foi
// comprado com aquele valor, e só então a porta — que existe sempre.
export function BlocoDeFecho({ motivo, quando, porque, aoPedir, style }) {
  return (
    <CaixaAberta style={style}>
      <p style={overline()}>{motivo}</p>
      <p style={{ ...playfair, fontSize: "19px", lineHeight: 1.32, margin: "10px 0 0", textWrap: "balance" }}>
        Esta resposta fechou a {quando}.
      </p>
      <p style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--gray-mid)", margin: "10px 0 0", textWrap: "pretty" }}>
        {porque}
      </p>
      <p style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--gray-mid)", margin: "11px 0 0", textWrap: "pretty" }}>
        Mudar continua a ser possível — passa por nós, para vermos o que ainda
        se consegue.
      </p>
      {aoPedir}
    </CaixaAberta>
  );
}

// ---------- O passo que ainda não começou (fim do ecrã 3) ----------
//
// Anunciado SEM cartão: não é uma secção vazia a pedir preenchimento, é uma
// nota a dizer que aquilo ainda não faz falta.
export function PassoPorResponder({ nome, contagem, quando, aoTocar }) {
  return (
    <button
      onClick={aoTocar}
      style={{
        display: "flex", gap: "11px", alignItems: "flex-start",
        width: "100%", textAlign: "left", marginTop: "22px",
        background: "none", border: "none", padding: 0, cursor: "pointer",
      }}
    >
      <span
        style={{
          width: "26px", height: "26px", borderRadius: "50%", flexShrink: 0,
          backgroundColor: "#FDFBF5", border: "1px solid #E8DCC0",
        }}
      />
      <span>
        <span style={{ ...playfair, fontSize: "16px", lineHeight: 1.3, display: "block", color: "var(--charcoal)" }}>
          {nome}
        </span>
        <span style={{ fontSize: "11.5px", lineHeight: 1.6, color: "#9B9B9B", display: "block", marginTop: "3px" }}>
          {contagem} por responder{quando ? ` — mas só nos fazem falta a ${quando}.` : "."}
        </span>
      </span>
    </button>
  );
}
