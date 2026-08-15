import { Link } from "react-router-dom";
import {
  overline, playfair, HACHURA, formatarEuroPT, diaMesAno,
} from "./base";
import { logoDe } from "../../lib/casa";
import { useCasa } from "../CasaProvider";

// ============================================================
// documentos-pecas.jsx — as doze peças dos documentos e dos actos
// (folha de decisões da fase 3, com os valores exactos).
//
// A regra que atravessa tudo: TODO O ACTO SE REFERE A UMA VERSÃO. A versão
// aparece no timbre, na tira, no registo — «um documento sem versão visível
// é um erro de desenho».
//
// Cantos vivos SÓ na folha e na placa: são objectos impressos, não cartões
// do ecrã. O tijolo #9C5A3C só existe em marcas de 6 px e em traços de
// «tirar» — nunca em fundos, texto corrido ou botões. A casa não tem
// vermelho.
// ============================================================

// ---------- Selo de versão ----------
// «Versão 2 · de 11 de Agosto». Nunca dourado — a versão informa, não pede.
export function SeloVersao({ versao, quando, comDe = true, style }) {
  return (
    <p style={{ ...overline("#9B9B9B", "0.22em", "9px"), fontVariantNumeric: "tabular-nums", ...style }}>
      Versão {versao}
      {quando ? ` · ${comDe ? "de " : ""}${diaMesAno(quando)}` : ""}
    </p>
  );
}

// ---------- A folha ----------
// Papel numa secretária, não um cartão: cantos vivos, sombra de papel,
// 16 px de margem em relação à página (dados pelo contentor).
export function Folha({ children, selada = false }) {
  return (
    <div
      style={{
        backgroundColor: "white",
        border: `1px solid ${selada ? "#E8DCC0" : "#F0E6D0"}`,
        boxShadow: selada
          ? "0 1px 0 #F3EBDA"
          : "0 1px 0 #F6EFE0, 0 12px 30px -16px rgba(45,33,10,0.26)",
      }}
    >
      {children}
    </div>
  );
}

// O timbre: logo pequeno, o nome do documento, o selo de versão.
// O logo deixou de vir por prop: é identidade, e identidade lê-se do
// Provider onde se usa — quatro chamadores a passar o mesmo logótipo
// eram quatro sítios por onde ele podia vir errado.
export function Timbre({ nome, versao, quando }) {
  const casa = useCasa();
  return (
    <div style={{ padding: "24px 22px 18px", textAlign: "center", borderBottom: "1px solid #F3EBDA" }}>
      <img src={logoDe(casa)} alt={casa.nome} style={{ width: "92px", height: "auto", display: "block", margin: "0 auto" }} />
      <p style={{ ...overline(), marginTop: "16px" }}>{nome}</p>
      <SeloVersao versao={versao} quando={quando} comDe={false} style={{ marginTop: "8px" }} />
    </div>
  );
}

// ---------- Véu de valor ----------
// O rectângulo de hachura no LUGAR EXACTO onde o número vai estar.
export function VeuValor({ largura = 78, altura = 14 }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: `${largura}px`, height: `${altura}px`,
        background: HACHURA, border: "1px solid #EFE7D6",
      }}
    />
  );
}

// ---------- Linha de serviço ----------
// O A4 recomposto para o telefone: cada serviço é um bloco, nunca uma
// tabela de três colunas a 390 px. `velado` troca a conta e o valor pelos
// rectângulos de hachura.
export function LinhaServico({ nome, nota, qtd, valor, velado = false }) {
  const total = (Number(qtd) || 0) * (Number(valor) || 0);
  return (
    <div style={{ padding: "15px 0", borderTop: "1px solid #F3EBDA" }}>
      <p style={{ fontSize: "13.5px", fontWeight: 500, lineHeight: 1.4, margin: 0, color: "var(--charcoal)" }}>
        {nome}
      </p>
      {nota && (
        <p style={{ fontSize: "11.5px", lineHeight: 1.65, color: "#9B9B9B", margin: "5px 0 0", textWrap: "pretty" }}>
          {nota}
        </p>
      )}
      <div style={{ display: "flex", alignItems: velado ? "center" : "baseline", justifyContent: "space-between", gap: "12px", marginTop: "10px" }}>
        {velado ? (
          <>
            <VeuValor largura={64} altura={11} />
            <VeuValor largura={78} altura={14} />
          </>
        ) : (
          <>
            <p style={{ fontSize: "11px", letterSpacing: "0.02em", color: "#9B9B9B", fontVariantNumeric: "tabular-nums", margin: 0 }}>
              {qtd} × {formatarEuroPT(valor)}
            </p>
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: "15px", fontVariantNumeric: "tabular-nums", margin: 0, color: "var(--charcoal)" }}>
              {formatarEuroPT(total)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Totais ----------
// O gerador do orçamento NÃO calcula IVA (só o total das linhas), por isso
// esta peça mostra UMA linha de total — as duas linhas de IVA do desenho
// ficam à espera de uma decisão da casa sobre facturação. Não se inventa
// imposto.
export function TotalOrcamento({ total, velado = false }) {
  return (
    <div style={{ margin: "18px 22px 0", backgroundColor: "#FDFBF5", borderTop: "1px solid #E8D5A3", padding: "16px 0 0" }}>
      <div style={{ display: "flex", alignItems: velado ? "center" : "baseline", justifyContent: "space-between", gap: "12px", paddingBottom: "14px" }}>
        <p style={overline()}>Total</p>
        {velado ? (
          <VeuValor largura={110} altura={20} />
        ) : (
          <p style={{ fontFamily: "'Playfair Display', serif", fontSize: "27px", lineHeight: 1, fontVariantNumeric: "tabular-nums", margin: 0, color: "var(--charcoal)" }}>
            {formatarEuroPT(total)}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------- Tira de contexto ----------
// O documento presente sem ser redesenhado. Todos os ecrãs de código e de
// pedido de alteração a levam.
export function TiraContexto({ titulo, direita }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: "12px", padding: "15px 22px", borderBottom: "1px solid #F0E6D0",
        backgroundColor: "#FDFBF5",
      }}
    >
      <p style={{ ...overline("#9B9B9B", "0.18em", "9px"), fontVariantNumeric: "tabular-nums" }}>
        {titulo}
      </p>
      {direita}
    </div>
  );
}

// ---------- A dupla ----------
// Mesma altura, mesmo raio, mesma tipografia — só a temperatura muda. A
// cheia é SÓ para o acto que vincula, uma por página. A linha por baixo
// normaliza o pedido de alteração por palavras, não só pelo peso.
const baseCapsula = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  textAlign: "center",
  font: "600 10.5px Inter, sans-serif",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  borderRadius: "999px",
  padding: "14px 8px",
  cursor: "pointer",
  transition: "background-color 140ms ease, color 140ms ease",
  fontFamily: "Inter, sans-serif",
};

// ---------- A cápsula CHEIA ----------
//
// O sinal mais carregado do portal inteiro: «isto vincula». Aceitar,
// aprovar, assinar, publicar.
//
// Existia escrita à mão em TRÊS sítios, e os três discordavam — dois
// dourados diferentes (#A07830 e #C9A84C), três enchimentos, duas
// tipografias. Quem assinasse um contrato e depois publicasse uma
// avaliação via o mesmo gesto em dois amarelos. A vazada, que pesa menos,
// tinha peça desde a fase 3; esta, que pesa mais, era a única sem.
//
// `inerte` é o estado de «ainda não escolheu»: visível, para se saber o que
// vem, e intocável. Não é `disabled` cinzento — é a mesma cápsula à espera.
export function CapsulaCheia({
  children, onClick, inerte = false, aTrabalhar = false, style,
}) {
  return (
    <button
      onClick={inerte ? undefined : onClick}
      disabled={inerte || aTrabalhar}
      className="foco"
      style={{
        ...baseCapsula,
        font: "600 11px Inter, sans-serif",
        letterSpacing: "0.14em",
        padding: "14px 20px",
        color: inerte ? "#C6BEAE" : "#FFFDF7",
        backgroundColor: inerte ? "white" : "#A07830",
        border: `1px solid ${inerte ? "#EFE7D6" : "#A07830"}`,
        cursor: inerte ? "default" : aTrabalhar ? "wait" : "pointer",
        opacity: aTrabalhar ? 0.6 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Dupla({ rotuloPrimario, rotuloSecundario, onPrimario, onSecundario, aTrabalhar = false, linhaDeBaixo }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "18px" }}>
        <button
          onClick={onPrimario}
          disabled={aTrabalhar}
          className="foco"
          style={{
            ...baseCapsula,
            color: "#FFFDF7",
            backgroundColor: "#A07830",
            border: "1px solid #A07830",
            opacity: aTrabalhar ? 0.6 : 1,
            cursor: aTrabalhar ? "wait" : "pointer",
          }}
        >
          {rotuloPrimario}
        </button>
        <button
          onClick={onSecundario}
          disabled={aTrabalhar}
          className="foco"
          style={{
            ...baseCapsula,
            color: "var(--gold-dark)",
            backgroundColor: "white",
            border: "1px solid var(--gold)",
            opacity: aTrabalhar ? 0.6 : 1,
          }}
        >
          {rotuloSecundario}
        </button>
      </div>
      {linhaDeBaixo && (
        <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: "14px 0 0", textAlign: "center", textWrap: "pretty" }}>
          {linhaDeBaixo}
        </p>
      )}
    </>
  );
}

// A cápsula vazada sozinha — pedir o código, abrir valores, enviar pedido.
// `to` faz dela uma LIGAÇÃO em vez de botão. Sem isso, as três acções da
// casa que são navegação tiveram de a copiar à mão — e uma delas ficou com
// outro enchimento.
export function CapsulaVazada({ children, onClick, to, aTrabalhar = false, style }) {
  const Elemento = to ? Link : "button";
  const proprios = to
    ? { to }
    : { onClick, disabled: aTrabalhar };
  return (
    <Elemento
      {...proprios}
      className="foco"
      style={{
        textDecoration: to ? "none" : undefined,
        display: "block",
        width: "100%",
        boxSizing: "border-box",
        textAlign: "center",
        font: "600 11px Inter, sans-serif",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--gold-dark)",
        backgroundColor: "white",
        border: "1px solid var(--gold)",
        borderRadius: "999px",
        padding: "15px 20px",
        cursor: aTrabalhar ? "wait" : "pointer",
        opacity: aTrabalhar ? 0.6 : 1,
        transition: "background-color 140ms ease, color 140ms ease",
        fontFamily: "Inter, sans-serif",
        ...style,
      }}
    >
      {children}
    </Elemento>
  );
}

// A ligação sublinhada — a acção secundária de sempre.
// #9B9B9B fica reservado a texto que não se toca: a variante apagada usa o
// cinzento pleno (var(--gray-mid), ≈5,1:1) e distingue-se pelos tamanhos que
// os chamadores já passam; a plena sobe a charcoal, coerente com as ligações
// inline da Lista.
export function LigacaoDiscreta({ children, onClick, href, apagada = false, style }) {
  const estilo = {
    display: "inline-block",
    fontSize: "11.5px",
    letterSpacing: "0.03em",
    color: apagada ? "var(--gray-mid)" : "var(--charcoal)",
    border: "none",
    borderBottom: "1px solid #E8D5A3",
    borderRadius: 0,
    padding: "0 0 3px",
    background: "none",
    cursor: "pointer",
    transition: "color 140ms ease",
    textDecoration: "none",
    fontFamily: "Inter, sans-serif",
    ...style,
  };
  if (href) {
    return (
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="foco" style={estilo}>
        {children}
      </a>
    );
  }
  return (
    <button onClick={onClick} className="foco" style={estilo}>
      {children}
    </button>
  );
}

// ---------- Células do código ----------
// Seis células acima dos 44 px de alvo. Sem contagem decrescente à vista:
// o prazo diz-se por palavras.
export function CelulasCodigo({ valor, onValor, onSubmeter, aVerificar = false }) {
  const digitos = (valor || "").padEnd(6, " ").slice(0, 6).split("");
  const activa = Math.min((valor || "").length, 5);
  return (
    <div style={{ position: "relative", display: "flex", justifyContent: "center", gap: "8px" }}>
      {digitos.map((d, i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{
            width: "48px", height: "56px", borderRadius: "8px",
            backgroundColor: "white",
            border: `1px solid ${i === activa && !aVerificar ? "var(--gold)" : "#E8DCC0"}`,
            boxShadow: i === activa && !aVerificar ? "0 0 0 3px rgba(201,168,76,0.14)" : "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Playfair Display', serif", fontSize: "23px",
            lineHeight: 1, color: "var(--charcoal)", fontVariantNumeric: "tabular-nums",
          }}
        >
          {d.trim()}
        </div>
      ))}
      {/* O input verdadeiro, invisível por cima: um campo só, para o
          teclado numérico do telefone e a colagem funcionarem sem
          coreografia de foco entre seis inputs. */}
      <input
        value={valor}
        onChange={(e) => onValor(e.target.value.replace(/\D/g, "").slice(0, 6))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onSubmeter) onSubmeter();
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="O código de seis dígitos"
        className="foco"
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          opacity: 0, cursor: "text", fontSize: "16px",
        }}
      />
    </div>
  );
}

// ---------- Bloco de recusa ----------
// Três linhas obrigatórias: o que aconteceu (calmo), o facto, a saída.
export function BlocoRecusa({ facto, saida }) {
  return (
    <div
      style={{
        display: "flex", gap: "11px", alignItems: "flex-start", textAlign: "left",
        marginTop: "20px", backgroundColor: "#FDFBF5", border: "1px solid #EFE3CB",
        borderRadius: "14px", padding: "15px 16px",
      }}
    >
      <div aria-hidden="true" style={{ width: "6px", height: "6px", backgroundColor: "#9C5A3C", transform: "rotate(45deg)", flex: "none", marginTop: "6px" }} />
      <div>
        <p style={{ fontSize: "12.5px", fontWeight: 500, lineHeight: 1.5, color: "var(--charcoal)", margin: 0, textWrap: "pretty" }}>
          {facto}
        </p>
        <p style={{ fontSize: "11.5px", lineHeight: 1.7, color: "#9B9B9B", margin: "6px 0 0", textWrap: "pretty" }}>
          {saida}
        </p>
      </div>
    </div>
  );
}

// ---------- Bloco de registo ----------
// Depois de cada acto: rótulo à esquerda, valor à direita. Sobriedade.
export function BlocoRegisto({ linhas }) {
  return (
    <div style={{ marginTop: "12px" }}>
      {linhas.map(([rotulo, valor], i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "92px 1fr", gap: "14px", padding: "12px 0", borderTop: "1px solid #F0E6D0" }}>
          <p style={{ ...overline("#9B9B9B", "0.16em", "8.5px"), lineHeight: 1.6, paddingTop: "2px" }}>{rotulo}</p>
          <p style={{ fontSize: "12px", lineHeight: 1.65, color: "var(--charcoal)", fontVariantNumeric: "tabular-nums", margin: 0, textWrap: "pretty" }}>
            {valor}
          </p>
        </div>
      ))}
    </div>
  );
}

// ---------- Faixa de selo ----------
// O contrato assinado, em repouso. Um dos cinco sinais de «fechado».
export function FaixaSelo({ visto, quem, quando }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "13px", backgroundColor: "#FDFBF5", borderBottom: "1px solid #E8D5A3", padding: "17px 20px" }}>
      <div style={{ width: "34px", height: "34px", borderRadius: "50%", backgroundColor: "#FEF9EC", border: "1px solid #E8D5A3", flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {visto}
      </div>
      <div>
        <p style={overline()}>Assinado</p>
        <p style={{ fontSize: "12px", lineHeight: 1.55, color: "var(--charcoal)", margin: "5px 0 0", fontVariantNumeric: "tabular-nums", textWrap: "pretty" }}>
          Por {quem}, a {quando}.
        </p>
      </div>
    </div>
  );
}

// ---------- Faixa da espera ----------
// O espelho da FaixaSelo, para o documento POR responder: o engaste
// vazio no lugar onde o visto vai ficar, e a frase do que se espera.
// É a primeira coisa da folha — a Nádia demorou a perceber que devia
// assinar porque o acto vive no pé, vários ecrãs abaixo, e nada em
// cima o anunciava. Informa, não pede: sem botão — o acto continua no
// pé, com o fim da leitura à vista. Ao assinar, esta faixa dá lugar à
// FaixaSelo: o mesmo engaste, agora com o visto.
export function FaixaEspera({ rotulo, frase }) {
  return (
    <div
      className="acomp-nao-imprime"
      style={{ display: "flex", alignItems: "center", gap: "13px", backgroundColor: "#FDFBF5", borderBottom: "1px solid #E8D5A3", padding: "15px 20px" }}
    >
      <div aria-hidden="true" style={{ width: "34px", height: "34px", borderRadius: "50%", backgroundColor: "#FDFBF5", border: "1px solid #E8DCC0", flex: "none" }} />
      <div>
        <p style={overline()}>{rotulo}</p>
        <p style={{ fontSize: "12px", lineHeight: 1.55, color: "var(--charcoal)", margin: "5px 0 0", textWrap: "pretty" }}>
          {frase}
        </p>
      </div>
    </div>
  );
}

// ---------- Campo de assinatura ----------
// Escrever o nome É assinar. Pauta, não input; o filete dourado atravessa
// em 2 500 ms e só então a cápsula acende — tempo para reler, sem contagem.
// O CSS da animação vive no index.css (`portal-filete`), respeitando o
// prefers-reduced-motion global; com movimento reduzido o filete aparece
// logo cheio e a espera não existe.
export function CampoAssinatura({ nome, onNome, completo }) {
  return (
    <div style={{ marginTop: "26px" }}>
      <label htmlFor="assinatura-nome" style={{ ...overline("#9B9B9B", "0.22em", "9px"), display: "block", textAlign: "center" }}>
        Escreva o seu nome completo
      </label>
      <input
        id="assinatura-nome"
        type="text"
        value={nome}
        onChange={(e) => onNome(e.target.value)}
        placeholder="o seu nome completo"
        autoComplete="name"
        style={{
          display: "block", width: "100%", boxSizing: "border-box",
          marginTop: "14px", padding: "0 0 12px",
          border: "none", background: "transparent", outline: "none",
          textAlign: "center",
          fontFamily: "'Playfair Display', serif", fontStyle: "italic",
          fontSize: "24px", lineHeight: 1.3, color: "var(--charcoal)",
        }}
      />
      <div style={{ position: "relative", height: "1.5px", backgroundColor: "#E8DCC0" }}>
        {completo && (
          <div
            className="portal-filete"
            style={{
              position: "absolute", inset: 0,
              backgroundColor: "var(--gold)",
              transformOrigin: "left center",
            }}
          />
        )}
      </div>
      <p style={{ fontSize: "10.5px", lineHeight: 1.6, color: "#9B9B9B", margin: "11px 0 0", textAlign: "center", textWrap: "pretty" }}>
        Como está no seu documento de identificação. É este acto que assina o
        contrato.
      </p>
    </div>
  );
}

// ---------- Campo de recado ----------
// A mesma peça da citação dela — porque é isso que vai ser.
export function CampoRecado({ valor, onValor }) {
  return (
    <div style={{ marginTop: "14px", backgroundColor: "white", border: "1.5px solid #F0E6D0", borderRadius: "14px", padding: "18px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
      <p style={overline("#9B9B9B", "0.22em", "9px")}>Por palavras suas</p>
      <textarea
        value={valor}
        onChange={(e) => onValor(e.target.value)}
        placeholder="Escreva aqui o que gostaria de mudar…"
        rows={4}
        style={{
          display: "block", width: "100%", boxSizing: "border-box",
          marginTop: "12px", minHeight: "88px",
          border: "none", outline: "none", resize: "vertical",
          fontFamily: "'Playfair Display', serif", fontStyle: "italic",
          fontSize: "15.5px", lineHeight: 1.75,
          color: "var(--charcoal)", background: "transparent",
        }}
      />
      <div aria-hidden="true" style={{ height: "1px", backgroundColor: "#F0E6D0" }} />
      <p style={{ fontSize: "11px", lineHeight: 1.6, color: "#9B9B9B", margin: "10px 0 0" }}>
        Fica escrito aqui, e é assim que o guardamos.
      </p>
    </div>
  );
}

// O traço de «tirar» — o único outro lugar do tijolo.
// O botão passou a ter 44×44 de área de toque; o círculo de `tamanho` px é
// só o desenho, num <span> interior. A margem negativa devolve o espaço que
// o alvo maior ocuparia — o layout não mexe. O stopPropagation deixa a
// linha inteira alternar por fora sem o toque no engaste contar duas vezes.
export function EngasteTirar({ marcado, onToggle, tamanho = 26 }) {
  const margem = -((44 - tamanho) / 2);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={marcado}
      className="foco"
      style={{
        width: "44px", height: "44px", margin: `${margem}px`,
        background: "transparent", border: "none",
        flex: "none", cursor: "pointer", padding: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <span
        style={{
          width: `${tamanho}px`, height: `${tamanho}px`, borderRadius: "50%",
          backgroundColor: "#FDFBF5",
          border: `1px solid ${marcado ? "#9C5A3C" : "#E8DCC0"}`,
          boxSizing: "border-box",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {marcado && (
          <span aria-hidden="true" style={{ display: "block", width: "9px", height: "1.5px", backgroundColor: "#9C5A3C" }} />
        )}
      </span>
    </button>
  );
}

// ---------- Estilo de impressão ----------
// O truque do GerarContrato, partilhado pelos três ramos que imprimem
// (documento em mãos, «assinar em papel», contrato em repouso): só a
// árvore .acomp-imprimivel fica visível; o display:block !important
// acorda as cópias imprimíveis montadas com display:none (e o bloco
// .acomp-so-imprime dentro delas); .acomp-nao-imprime tira do papel os
// botões e as ligações que só fazem sentido no ecrã.
export function EstiloImpressao() {
  return (
    <style>{`
      @media print {
        body * { visibility: hidden; }
        .acomp-imprimivel, .acomp-imprimivel * { visibility: visible; }
        .acomp-imprimivel { position: absolute; left: 0; top: 0; width: 100%; display: block !important; }
        .acomp-so-imprime { display: block !important; }
        .acomp-nao-imprime { display: none !important; }
      }
    `}</style>
  );
}

// O título em Playfair da frase do documento.
export function TituloDocumento({ children, meta }) {
  return (
    <div style={{ padding: "20px 22px 0" }}>
      <p style={{ ...playfair, fontSize: "20px", lineHeight: 1.3, textWrap: "balance" }}>{children}</p>
      {meta && (
        <p style={{ fontSize: "11.5px", lineHeight: 1.7, color: "#9B9B9B", margin: "6px 0 0", fontVariantNumeric: "tabular-nums" }}>
          {meta}
        </p>
      )}
    </div>
  );
}
