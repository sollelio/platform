import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PACOTES_BUFFET,
  PACOTE_PERSONALIZADO,
  pacoteSugerido,
} from "./pacotesBuffet";

// ============================================================
// SeletorPacotes — a carta da casa dentro da captação.
//
// A referência da Nádia (09/09/2026) é uma página de preços com
// dois passos: nº de convidados → pacote. Aqui o formulário JÁ
// pergunta o nº de convidados lá em cima, por isso o passo 1 não
// se repete: lê-se esse número e marca-se o pacote "Sugerido para
// si" — com mais de 50, a sugestão passa a ser o personalizado.
//
// Dois gestos, dois significados (telemóvel primeiro):
//   • tocar no CARTÃO abre/fecha "o que está incluído" (consultar)
//   • tocar em ESCOLHER seleciona (decidir) — sem seleções
//     acidentais a meio da leitura
//
// O cartão "Mais de 50 convidados" pede o número exato no próprio
// cartão — é o MESMO estado do campo "Nº de convidados" de cima
// (uma verdade só), por isso escrever num escreve no outro.
// ============================================================

export default function SeletorPacotes({
  escolhido,
  onEscolher,
  numeroConvidados,
  onNumeroConvidados,
  erro,
}) {
  // Um cartão de detalhes aberto de cada vez — acordeão.
  const [aberto, setAberto] = useState(null);
  const sugerido = pacoteSugerido(numeroConvidados);
  const n = Number(numeroConvidados);

  return (
    <div
      style={{
        marginTop: "10px",
        padding: "16px 12px 12px",
        backgroundColor: "#FBF7EF",
        border: "1px solid var(--gold-light)",
        borderRadius: "12px",
      }}
    >
      <p
        style={{
          fontSize: "10px",
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "var(--gold-dark)",
          textAlign: "center",
          margin: "0 0 6px 0",
        }}
      >
        A carta da casa · Pacote de buffet *
      </p>
      <h3
        style={{
          fontSize: "19px",
          fontWeight: "600",
          color: "var(--charcoal)",
          textAlign: "center",
          margin: "0 0 6px 0",
          lineHeight: 1.3,
        }}
      >
        Escolha o pacote ideal para o seu evento
      </h3>
      <p
        style={{
          fontSize: "12px",
          color: "var(--gray-mid)",
          textAlign: "center",
          lineHeight: 1.55,
          margin: "0 0 14px 0",
        }}
      >
        {sugerido === PACOTE_PERSONALIZADO.nome
          ? `Com ${n} convidados, o ideal é um orçamento personalizado.`
          : sugerido
            ? `Para ${n} convidados sugerimos o ${sugerido} — mas a escolha é sua.`
            : "Toque num pacote para ver tudo o que está incluído. Indique o nº de convidados acima e sugerimos-lhe o ideal."}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {PACOTES_BUFFET.map((p) => (
          <CartaoPacote
            key={p.nome}
            pacote={p}
            selecionado={escolhido === p.nome}
            sugerido={sugerido === p.nome}
            aberto={aberto === p.nome}
            onAbrir={() => setAberto((a) => (a === p.nome ? null : p.nome))}
            onEscolher={() => onEscolher(p.nome)}
          />
        ))}
        <CartaoPersonalizado
          selecionado={escolhido === PACOTE_PERSONALIZADO.nome}
          sugerido={sugerido === PACOTE_PERSONALIZADO.nome}
          numeroConvidados={numeroConvidados}
          onNumeroConvidados={onNumeroConvidados}
          onEscolher={() => onEscolher(PACOTE_PERSONALIZADO.nome)}
        />
      </div>

      {erro && (
        <p style={{ fontSize: "12px", color: "#DC2626", margin: "8px 0 0 0" }}>
          {erro}
        </p>
      )}
    </div>
  );
}

function CartaoPacote({
  pacote: p,
  selecionado,
  sugerido,
  aberto,
  onAbrir,
  onEscolher,
}) {
  // "Sugerido para si" ganha ao "Mais escolhido" — o selo fala com
  // ESTE cliente antes de falar com a estatística da casa.
  const selo = sugerido
    ? "Sugerido para si"
    : p.maisEscolhido
      ? "Mais escolhido"
      : null;

  return (
    <div
      onClick={onAbrir}
      style={{
        position: "relative",
        backgroundColor: selecionado ? "#FFFDF4" : "white",
        border: `1.5px solid ${selecionado ? "var(--gold)" : "var(--gold-light)"}`,
        borderRadius: "14px",
        padding: "18px 14px 14px",
        textAlign: "center",
        cursor: "pointer",
        boxShadow: selecionado
          ? "0 6px 18px rgba(201,168,76,0.25)"
          : "0 1px 3px rgba(0,0,0,0.04)",
        transition: "all 0.2s",
      }}
    >
      {selo && <Selo texto={selo} />}

      <h3
        style={{
          fontSize: "22px",
          fontWeight: "600",
          color: "var(--charcoal)",
          margin: "2px 0 8px 0",
        }}
      >
        {p.nome}
      </h3>

      <p
        style={{
          fontSize: "10px",
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--gray-mid)",
          margin: "0 0 2px 0",
        }}
      >
        Desde
      </p>
      <p
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "27px",
          fontWeight: "600",
          color: "var(--gold-dark)",
          margin: "0 0 2px 0",
          lineHeight: 1.15,
        }}
      >
        {p.preco} €
      </p>
      <p
        style={{
          fontSize: "12px",
          color: "var(--gray-mid)",
          margin: "0 0 8px 0",
        }}
      >
        {capitalizar(p.detalhe)}
      </p>

      <p
        style={{
          fontSize: "12.5px",
          fontStyle: "italic",
          color: "var(--gray-mid)",
          lineHeight: 1.55,
          margin: "0 auto",
          maxWidth: "300px",
        }}
      >
        {p.tagline}
      </p>

      <div
        style={{
          width: "44px",
          borderTop: "1px solid var(--gold-light)",
          margin: "12px auto",
        }}
      />

      <button
        type="button"
        aria-expanded={aberto}
        onClick={(e) => {
          e.stopPropagation();
          onAbrir();
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          background: "none",
          border: "none",
          padding: "4px 8px",
          fontSize: "12px",
          fontWeight: "600",
          color: "var(--gold-dark)",
          cursor: "pointer",
        }}
      >
        Ver o que está incluído
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            transform: aberto ? "rotate(180deg)" : "none",
            transition: "transform 0.2s",
            fontSize: "10px",
          }}
        >
          ▼
        </span>
      </button>

      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div
            key="detalhes"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <p
              style={{
                fontSize: "11.5px",
                color: "var(--gray-mid)",
                margin: "10px 0",
              }}
            >
              {p.mesa} <span style={{ color: "var(--gold)" }}>·</span> {p.pecas}
            </p>
            <ul
              style={{
                listStyle: "none",
                margin: "0 0 12px 0",
                padding: "0",
                textAlign: "left",
              }}
            >
              {p.inclui.map((item) => (
                <li
                  key={item}
                  style={{
                    display: "flex",
                    gap: "8px",
                    fontSize: "12.5px",
                    color: "var(--charcoal)",
                    lineHeight: 1.5,
                    marginBottom: "6px",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      color: "var(--gold)",
                      fontWeight: "700",
                      flexShrink: 0,
                    }}
                  >
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <div
              style={{
                backgroundColor: "#FEF9EC",
                border: "1px solid var(--gold-light)",
                borderRadius: "10px",
                padding: "10px 12px",
                textAlign: "left",
              }}
            >
              <p
                style={{
                  fontSize: "10px",
                  fontWeight: "700",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--gold-dark)",
                  margin: "0 0 6px 0",
                }}
              >
                Oferta incluída
              </p>
              {p.oferta.map((item) => (
                <p
                  key={item}
                  style={{
                    display: "flex",
                    gap: "8px",
                    fontSize: "12px",
                    color: "var(--charcoal)",
                    lineHeight: 1.5,
                    margin: "0 0 4px 0",
                  }}
                >
                  <span aria-hidden="true" style={{ color: "var(--gold)" }}>
                    •
                  </span>
                  {item}
                </p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEscolher();
        }}
        style={botaoEscolher(selecionado)}
      >
        {selecionado ? "✓ Pacote escolhido" : `Escolher ${p.nome}`}
      </button>
    </div>
  );
}

function CartaoPersonalizado({
  selecionado,
  sugerido,
  numeroConvidados,
  onNumeroConvidados,
  onEscolher,
}) {
  return (
    <div
      onClick={onEscolher}
      style={{
        position: "relative",
        backgroundColor: selecionado ? "#FFFDF4" : "white",
        border: `1.5px ${selecionado ? "solid var(--gold)" : "dashed var(--gold-light)"}`,
        borderRadius: "14px",
        padding: "16px 14px 14px",
        textAlign: "center",
        cursor: "pointer",
        boxShadow: selecionado
          ? "0 6px 18px rgba(201,168,76,0.25)"
          : "0 1px 3px rgba(0,0,0,0.04)",
        transition: "all 0.2s",
      }}
    >
      {sugerido && <Selo texto="Sugerido para si" />}

      <h3
        style={{
          fontSize: "19px",
          fontWeight: "600",
          color: "var(--charcoal)",
          margin: "2px 0 6px 0",
        }}
      >
        Mais de 50 convidados
      </h3>
      <p
        style={{
          fontSize: "12.5px",
          color: "var(--gray-mid)",
          lineHeight: 1.55,
          margin: "0 auto",
          maxWidth: "300px",
        }}
      >
        Um evento maior merece uma proposta à medida — diga-nos quantos são e
        preparamos um orçamento personalizado.
      </p>

      <AnimatePresence initial={false}>
        {selecionado && (
          <motion.div
            key="convidados"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ padding: "12px 2px 2px", textAlign: "left" }}
            >
              <label
                style={{
                  fontSize: "11px",
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--charcoal)",
                  display: "block",
                  marginBottom: "5px",
                }}
              >
                Quantos convidados vai receber? *
              </label>
              <input
                type="number"
                min="1"
                value={numeroConvidados}
                onChange={(e) => onNumeroConvidados(e.target.value)}
                placeholder="ex: 80"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1.5px solid var(--gold-light)",
                  fontSize: "13px",
                  outline: "none",
                  fontFamily: "Inter, sans-serif",
                  boxSizing: "border-box",
                  backgroundColor: "white",
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEscolher();
        }}
        style={botaoEscolher(selecionado)}
      >
        {selecionado ? "✓ Orçamento personalizado" : "Pedir orçamento personalizado"}
      </button>
    </div>
  );
}

function Selo({ texto }) {
  return (
    <span
      style={{
        position: "absolute",
        top: "-9px",
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "var(--gold)",
        color: "white",
        fontSize: "9px",
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        padding: "3px 12px",
        borderRadius: "999px",
        whiteSpace: "nowrap",
        boxShadow: "0 2px 6px rgba(201,168,76,0.35)",
      }}
    >
      {texto}
    </span>
  );
}

const botaoEscolher = (selecionado) => ({
  width: "100%",
  marginTop: "12px",
  padding: "11px",
  borderRadius: "10px",
  fontSize: "12px",
  fontWeight: "700",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  border: `1.5px solid var(--gold)`,
  backgroundColor: selecionado ? "var(--gold)" : "white",
  color: selecionado ? "white" : "var(--gold-dark)",
  cursor: "pointer",
  transition: "all 0.15s",
});

const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);
