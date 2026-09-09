import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PACOTES_BUFFET,
  PACOTE_PERSONALIZADO,
  pacoteSugerido,
} from "./pacotesBuffet";

// ============================================================
// SeletorPacotes — a carta dos pacotes dentro da captação.
//
// A referência da Nádia (09/09/2026) é uma página de preços com
// dois passos: nº de convidados → pacote. Aqui o formulário JÁ
// pergunta o nº de convidados lá em cima, por isso o passo 1 não
// se repete: lê-se esse número e marca-se o pacote "Sugerido para
// si" — com mais de 50, a sugestão passa a ser o personalizado.
//
// Gestos (telemóvel primeiro, afinados nos testes de 09/09):
//   • os pacotes vivem num CARROSSEL horizontal (.h-scroll) com a
//     espreitadela do cartão seguinte + pontinhos — a secção fica
//     baixa e o "há mais" vê-se; escrever o nº de convidados faz o
//     carrossel deslizar até ao pacote sugerido
//   • tocar no CARTÃO abre/fecha "o que está incluído" (consultar)
//   • tocar em ESCOLHER seleciona (decidir)
//   • escolhido um, o carrossel dá lugar ao cartão sozinho, a toda
//     a largura; volta-se atrás só pelo botão "Mudar de pacote" —
//     o cartão escolhido mostra uma confirmação estática, nunca um
//     botão que desseleciona sem querer
//
// O cartão "Mais de 50 convidados" pede o número exato no próprio
// cartão — é o MESMO estado do campo "Nº de convidados" de cima
// (uma verdade só) — e confirma ali mesmo ("✓ Proposta à medida
// para 80 convidados"), sem obrigar a olhar para a barra de baixo.
// ============================================================

// A ordem dos cartões no carrossel — os pontinhos e o deslizar
// automático contam com ela.
const NOMES_CARTOES = [
  ...PACOTES_BUFFET.map((p) => p.nome),
  PACOTE_PERSONALIZADO.nome,
];

export default function SeletorPacotes({
  escolhido,
  onEscolher,
  numeroConvidados,
  onNumeroConvidados,
  erro,
}) {
  // Um cartão de detalhes aberto de cada vez — acordeão.
  const [aberto, setAberto] = useState(null);
  // O cartão visível no carrossel (alimenta os pontinhos).
  const [indice, setIndice] = useState(0);
  const refCarrossel = useRef(null);
  const sugerido = pacoteSugerido(numeroConvidados);
  const n = Number(numeroConvidados);

  const rolarPara = useCallback((i, comportamento = "smooth") => {
    const el = refCarrossel.current;
    const alvo = el?.children[i];
    if (!el || !alvo) return;
    el.scrollTo({
      left:
        alvo.offsetLeft - el.offsetLeft - (el.clientWidth - alvo.clientWidth) / 2,
      behavior: comportamento,
    });
  }, []);

  // Escrever o nº de convidados faz o carrossel deslizar até ao
  // pacote sugerido — a sugestão aponta-se, não se descreve. Também
  // corre ao voltar de uma escolha ("Mudar de pacote").
  useEffect(() => {
    if (escolhido || !sugerido) return;
    const idx = NOMES_CARTOES.indexOf(sugerido);
    if (idx >= 0) rolarPara(idx);
  }, [escolhido, sugerido, rolarPara]);

  const aoRolar = () => {
    const el = refCarrossel.current;
    const primeiro = el?.firstElementChild;
    if (!el || !primeiro) return;
    const passo = primeiro.clientWidth + 10; // largura do cartão + gap
    const idx = Math.round(el.scrollLeft / passo);
    setIndice(Math.max(0, Math.min(NOMES_CARTOES.length - 1, idx)));
  };

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
        Pacote de buffet *
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
        {escolhido
          ? "O pacote do seu evento"
          : "Escolha o pacote ideal para o seu evento"}
      </h3>
      {!escolhido && (
        <p
          style={{
            fontSize: "12px",
            color: "var(--gray-mid)",
            textAlign: "center",
            lineHeight: 1.55,
            margin: "0 0 8px 0",
          }}
        >
          {sugerido === PACOTE_PERSONALIZADO.nome
            ? `Com ${n} convidados, o ideal é um orçamento à medida.`
            : sugerido
              ? `Para ${n} convidados sugerimos o ${sugerido} — mas a escolha é sua.`
              : "Deslize para comparar os pacotes — e indique o nº de convidados acima para lhe sugerirmos o ideal."}
        </p>
      )}

      {escolhido ? (
        // O cartão escolhido, sozinho e a toda a largura — os outros
        // esperam atrás do "Mudar de pacote".
        <motion.div
          key="escolhido"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            marginTop: "6px",
          }}
        >
          {/* O paddingTop dá espaço ao selo que sobressai do bordo. */}
          <div style={{ padding: "9px 1px 1px" }}>
            {escolhido === PACOTE_PERSONALIZADO.nome ? (
              <CartaoPersonalizado
                selecionado
                sugerido={sugerido === PACOTE_PERSONALIZADO.nome}
                numeroConvidados={numeroConvidados}
                onNumeroConvidados={onNumeroConvidados}
                onEscolher={() => onEscolher(PACOTE_PERSONALIZADO.nome)}
              />
            ) : (
              <CartaoPacote
                pacote={PACOTES_BUFFET.find((p) => p.nome === escolhido)}
                selecionado
                sugerido={sugerido === escolhido}
                aberto={aberto === escolhido}
                onAbrir={() =>
                  setAberto((a) => (a === escolhido ? null : escolhido))
                }
                onEscolher={() => onEscolher(escolhido)}
              />
            )}
          </div>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            onClick={() => onEscolher(escolhido)}
            style={{
              margin: "4px auto 0",
              padding: "8px 18px",
              borderRadius: "999px",
              border: "1.5px solid var(--gold-light)",
              backgroundColor: "white",
              color: "var(--gold-dark)",
              fontSize: "12px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Mudar de pacote
          </motion.button>
        </motion.div>
      ) : (
        <motion.div
          key="carrossel"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          {/* O carrossel sangra até aos bordos do painel (margens
              negativas) para o cartão seguinte espreitar; o paddingTop
              dá espaço ao selo. Com um cartão de detalhes aberto, os
              outros deixam de esticar (flex-start) — só o aberto
              cresce. */}
          <div
            ref={refCarrossel}
            className="h-scroll"
            onScroll={aoRolar}
            style={{
              gap: "10px",
              margin: "6px -12px 0",
              padding: "9px 12px 4px",
              alignItems: aberto ? "flex-start" : "stretch",
            }}
          >
            {PACOTES_BUFFET.map((p) => (
              <div key={p.nome} style={{ width: "82%", display: "flex" }}>
                <CartaoPacote
                  pacote={p}
                  selecionado={false}
                  sugerido={sugerido === p.nome}
                  aberto={aberto === p.nome}
                  onAbrir={() =>
                    setAberto((a) => (a === p.nome ? null : p.nome))
                  }
                  onEscolher={() => onEscolher(p.nome)}
                />
              </div>
            ))}
            <div style={{ width: "82%", display: "flex" }}>
              <CartaoPersonalizado
                selecionado={false}
                sugerido={sugerido === PACOTE_PERSONALIZADO.nome}
                numeroConvidados={numeroConvidados}
                onNumeroConvidados={onNumeroConvidados}
                onEscolher={() => onEscolher(PACOTE_PERSONALIZADO.nome)}
              />
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "2px",
              marginTop: "6px",
            }}
          >
            {NOMES_CARTOES.map((nome, i) => (
              <button
                key={nome}
                type="button"
                aria-label={`Ver ${nome === PACOTE_PERSONALIZADO.nome ? "mais de 50 convidados" : nome}`}
                onClick={() => rolarPara(i)}
                style={{
                  padding: "6px 4px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                }}
              >
                <span
                  style={{
                    width: i === indice ? "18px" : "7px",
                    height: "7px",
                    borderRadius: "999px",
                    backgroundColor:
                      i === indice ? "var(--gold)" : "var(--gold-light)",
                    transition: "all 0.2s",
                  }}
                />
              </button>
            ))}
          </div>
        </motion.div>
      )}

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
        // Coluna flex + flex 1: no carrossel todos os cartões ficam
        // com a mesma altura, e o espaçador lá em baixo alinha os
        // botões pelo fundo.
        display: "flex",
        flexDirection: "column",
        flex: 1,
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

      <p
        style={{
          fontSize: "11.5px",
          color: "var(--gray-mid)",
          margin: "10px 0",
        }}
      >
        {p.mesa} <span style={{ color: "var(--gold)" }}>·</span> {p.pecas}
      </p>

      {/* Os 3 primeiros itens ficam SEMPRE à vista — uma lista que
          visivelmente continua é o convite a abrir; o link de texto
          sozinho passava despercebido (teste no móvel, 09/09). */}
      <ul
        style={{
          listStyle: "none",
          margin: "0",
          padding: "0",
          textAlign: "left",
        }}
      >
        {p.inclui.slice(0, 3).map((item) => (
          <ItemIncluido key={item} texto={item} />
        ))}
      </ul>

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
            <ul
              style={{
                listStyle: "none",
                margin: "0 0 12px 0",
                padding: "0",
                textAlign: "left",
              }}
            >
              {p.inclui.slice(3).map((item) => (
                <ItemIncluido key={item} texto={item} />
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

      <div style={{ flex: 1 }} />

      <button
        type="button"
        aria-expanded={aberto}
        onClick={(e) => {
          e.stopPropagation();
          onAbrir();
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          width: "100%",
          marginTop: aberto ? "12px" : "8px",
          padding: "9px",
          borderRadius: "10px",
          border: "1px solid var(--gold-light)",
          backgroundColor: "#FEF9EC",
          fontSize: "12px",
          fontWeight: "600",
          color: "var(--gold-dark)",
          cursor: "pointer",
          boxSizing: "border-box",
          transition: "all 0.15s",
        }}
      >
        {aberto
          ? "Mostrar menos"
          : `Ver mais ${p.inclui.length - 3} itens e as ofertas`}
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

      {selecionado ? (
        <div style={{ ...botaoEscolher(true), cursor: "default" }}>
          ✓ Pacote escolhido
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEscolher();
          }}
          style={botaoEscolher(false)}
        >
          Escolher {p.nome}
        </button>
      )}
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
  const n = Number(numeroConvidados);
  const temNumero =
    !!String(numeroConvidados ?? "").trim() && Number.isFinite(n) && n >= 1;

  return (
    <div
      onClick={() => {
        if (!selecionado) onEscolher();
      }}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        flex: 1,
        backgroundColor: selecionado ? "#FFFDF4" : "white",
        border: `1.5px ${selecionado ? "solid var(--gold)" : "dashed var(--gold-light)"}`,
        borderRadius: "14px",
        padding: "16px 14px 14px",
        textAlign: "center",
        cursor: selecionado ? "default" : "pointer",
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
        preparamos tudo consigo.
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
              {!temNumero && (
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--gray-mid)",
                    lineHeight: 1.5,
                    margin: "6px 0 0 0",
                  }}
                >
                  É este número que nos permite preparar a proposta.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ flex: 1 }} />

      {selecionado ? (
        <div style={{ ...botaoEscolher(true), cursor: "default" }}>
          {temNumero
            ? `✓ Proposta à medida para ${n} convidados`
            : "✓ Opção escolhida"}
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEscolher();
          }}
          style={botaoEscolher(false)}
        >
          Escolher esta opção
        </button>
      )}
    </div>
  );
}

function ItemIncluido({ texto }) {
  return (
    <li
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
      {texto}
    </li>
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

// Serve o botão "Escolher X" e, uma vez escolhido, a faixa de
// confirmação (um div — de propósito: um botão ali desselecionava
// com um toque distraído; mudar de ideias tem porta própria, o
// "Mudar de pacote").
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
  boxSizing: "border-box",
});

const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);
