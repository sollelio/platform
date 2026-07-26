import { useEffect, useState } from "react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import Jornada from "./Jornada";
import { Icone } from "./Navegacao";
import { formatarEuros } from "./orcamentos/orcamentoConfig";
import { useContagemAnimada } from "./acabamento";

// ============================================================
// CabecalhoEvento — a moldura da página /evento/:id, que nunca
// desaparece: identidade, A Jornada, o dinheiro em três números, as
// acções que valem em qualquer separador, e os separadores.
//
// Dois estados:
//   repouso    — ~283 px, tudo aberto, o cabeçalho respira
//   condensado — 92 px a partir de 120 px de scroll: nome, régua sem
//                rótulos, o que falta, imprimir, e os separadores
// Nunca se perde o contexto nem a navegação.
//
// A passagem entre os dois é uma MORFOSE, não uma troca: o título, o
// "Falta" e os botões são os mesmos elementos nos dois estados
// (layoutId) e viajam para o novo lugar; o resto desvanece em 180 ms.
// O utilizador vê o título encolher para o canto — nunca vê outro
// título aparecer.
//
// O dinheiro aqui são TRÊS NÚMEROS e mais nada — as parcelas e o
// registo vivem no separador Pagamentos. E a frase «→ A seguir» da
// Jornada aponta, não age: leva ao separador onde o gesto se faz.
// ============================================================

const ALTURA_CONDENSA = 120;

const formatarDataLonga = (iso) => {
  if (!iso) return null;
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

// "faltam 3 dias" / "é hoje" / "há 2 meses" — a mesma contagem que a
// Nádia faz de cabeça ao olhar para a agenda.
const contagem = (iso) => {
  if (!iso) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dia = new Date(`${iso}T00:00:00`);
  const dias = Math.round((dia - hoje) / (24 * 60 * 60 * 1000));
  if (dias === 0) return "é hoje";
  if (dias === 1) return "é amanhã";
  if (dias > 0 && dias <= 60) return `faltam ${dias} dias`;
  if (dias < 0) return "já passou";
  return null;
};

const pastilha = {
  fontSize: "9.5px",
  fontWeight: "700",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--gold-dark)",
  backgroundColor: "#FEF9EC",
  border: "1px solid var(--gold-light)",
  borderRadius: "999px",
  padding: "4px 9px",
  whiteSpace: "nowrap",
};

// A identidade (cor, borda, hover) vive nas classes .acao--* do
// index.css; aqui fica só a medida, que é desta moldura.
const medidaBotao = {
  display: "flex",
  alignItems: "center",
  gap: "7px",
  padding: "8px 14px",
  borderRadius: "10px",
  fontSize: "12px",
  fontWeight: "500",
  whiteSpace: "nowrap",
};

const CLASSE_BOTAO = {
  ouro: "acao acao--ouro",
  ouroCheio: "acao acao--cheia",
  verde: "acao acao--verde",
  neutro: "acao acao--neutra",
};

// Total · Recebido · Falta. Três números, sem parcelas. O valor do
// "Falta" — o número operativo do negócio — é o MESMO elemento nos
// dois estados do cabeçalho (layoutId): ao condensar não desaparece,
// viaja para o seu lugar na linha.
function LinhaDinheiro({ resumo, compacta = false }) {
  // Os números contam quando mudam à frente dos olhos (registar um
  // pagamento no separador vê-se aqui no mesmo instante, a contar).
  const totalAnim = useContagemAnimada(resumo.total);
  const pagoAnim = useContagemAnimada(resumo.pago);
  const faltaAnim = useContagemAnimada(resumo.falta);

  if (compacta) {
    return (
      <span
        style={{
          fontSize: "12px",
          color: "var(--gray-mid)",
          whiteSpace: "nowrap",
        }}
      >
        Falta{" "}
        <motion.span
          layoutId="cab-falta"
          style={{
            display: "inline-block",
            fontWeight: "600",
            color: "var(--gold-dark)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatarEuros(faltaAnim)}
        </motion.span>
      </span>
    );
  }

  const par = (rotulo, valor, destaque) => (
    <>
      <span
        style={{
          fontSize: "9px",
          fontWeight: "600",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: destaque ? "#B08A3C" : "#9B9B9B",
        }}
      >
        {rotulo}
      </span>
      {destaque ? (
        <motion.span
          layoutId="cab-falta"
          style={{
            display: "inline-block",
            fontSize: "17px",
            fontWeight: "600",
            color: "var(--gold-dark)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatarEuros(valor)}
        </motion.span>
      ) : (
        <span
          style={{
            fontSize: "15px",
            fontWeight: "500",
            color: "var(--charcoal)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatarEuros(valor)}
        </span>
      )}
    </>
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: "12px",
        flexWrap: "wrap",
      }}
    >
      {par("Total", totalAnim, false)}
      <span style={{ fontSize: "12px", color: "#E4DCCB" }}>·</span>
      {par("Recebido", pagoAnim, false)}
      <span style={{ fontSize: "12px", color: "#E4DCCB" }}>·</span>
      {par("Falta", faltaAnim, true)}
    </div>
  );
}

function Separadores({ abas, activeAba, onAba }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "4px" }}>
      {abas.map((aba) => {
        const ativo = aba.id === activeAba;
        return (
          <button
            key={aba.id}
            onClick={() => onAba(aba.id)}
            className={`separador-aba${ativo ? " separador-aba--activa" : ""}`}
            style={{
              position: "relative",
              padding: "9px 16px",
              borderRadius: "10px 10px 0 0",
              fontSize: "12.5px",
              fontWeight: ativo ? "500" : "400",
              letterSpacing: "0.02em",
              whiteSpace: "nowrap",
            }}
          >
            {/* A pastilha dourada é UMA só, que desliza de separador
                em separador (layoutId) — a troca vê-se acontecer, em
                vez de uma pastilha apagar-se e outra acender-se. */}
            {ativo && (
              <motion.span
                layoutId="separadores-pastilha"
                transition={{ type: "spring", stiffness: 600, damping: 42 }}
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "10px 10px 0 0",
                  backgroundColor: "var(--gold)",
                }}
              />
            )}
            <span
              style={{
                position: "relative",
                zIndex: 1,
                display: "flex",
                alignItems: "center",
                gap: "7px",
              }}
            >
              {aba.label}
              {aba.contagem != null && (
                <span
                  style={{
                    fontSize: "10px",
                    color: ativo ? "rgba(255,255,255,0.75)" : "#B0A88F",
                  }}
                >
                  {aba.contagem}
                </span>
              )}
              {/* O mesmo ponto dourado que marca um campo por guardar,
                  aqui a dizer o mesmo de outro separador: ficou trabalho
                  à espera na Visão geral. */}
              {aba.porGuardar > 0 && (
                <span
                  title={`${aba.porGuardar} ${
                    aba.porGuardar === 1 ? "alteração" : "alterações"
                  } por guardar`}
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    backgroundColor: ativo ? "white" : "var(--gold)",
                    flexShrink: 0,
                  }}
                />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function CabecalhoEvento({
  submissao,
  resumoEvento,
  nomeTipo,
  invites = [],
  previstos,
  pagamentos,
  resumoDinheiro,
  abas,
  activeAba,
  onAba,
  onVoltar,
  onImprimir,
  onWhatsApp,
  onEditar,
  editando = false,
  edicaoNoutroSeparador = false,
  onEtapa,
  onProximoGesto,
  onStatusChange,
}) {
  const [condensado, setCondensado] = useState(false);

  // A partir de 120 px de scroll o cabeçalho encolhe para 92 px. O
  // limiar tem histerese (volta a abrir só abaixo de 60 px) para não
  // tremer quando o scroll fica preso na fronteira.
  useEffect(() => {
    const aoRolar = () => {
      const y = window.scrollY;
      setCondensado((atual) => (atual ? y > ALTURA_CONDENSA / 2 : y > ALTURA_CONDENSA));
    };
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  const meta = [
    formatarDataLonga(resumoEvento.data),
    nomeTipo,
    resumoEvento.local,
    submissao.numero_convidados
      ? `${submissao.numero_convidados} convidados`
      : null,
  ].filter(Boolean);

  const quantoFalta = contagem(resumoEvento.data);

  // Condensado E a editar, a régua fica curta e três botões não cabem em
  // ecrãs estreitos — a saída da edição é a que não pode faltar, as
  // outras duas voltam mal se pare de rolar (ou se conclua).
  const soEdicao = condensado && editando;

  // layoutId: os botões são os mesmos nos dois estados do cabeçalho —
  // ao condensar, viajam para a linha em vez de piscar.
  const acoes = (
    <motion.div layoutId="cab-acoes" style={{ display: "flex", gap: "8px" }}>
      {!soEdicao && (
        <button
          onClick={onImprimir}
          className={CLASSE_BOTAO.ouro}
          style={medidaBotao}
        >
          {condensado ? "Imprimir" : "Imprimir / Guardar PDF"}
        </button>
      )}
      {onWhatsApp && !soEdicao && (
        <button
          onClick={onWhatsApp}
          className={CLASSE_BOTAO.verde}
          style={medidaBotao}
        >
          <Icone nome="mensagens" tamanho={15} />
          WhatsApp
        </button>
      )}
      {/* Editar BRIEFING — o nome não é enfeite. Este botão vive na
          moldura, ao lado de acções que valem em qualquer separador, e
          dizia só "Editar": em Materiais lia-se como se editasse as
          linhas da ficha (que aliás já se editam no lugar, cada uma na
          sua célula). Um botão da moldura que só mexe numa das partes
          tem de dizer em qual.

          Três estados, porque a edição sobrevive a uma ida a outro
          separador:
            fechado  — "Editar briefing", e abre;
            a editar — "Concluir edição", e guarda;
            noutro separador — "Voltar à edição", e traz de volta ao
              sítio onde os rascunhos estão à espera (guardar daqui era
              impossível: os campos nem sequer estão montados).
          Fica visível mesmo com o cabeçalho condensado, senão a saída
          desaparecia ao rolar. */}
      {onEditar && (!condensado || editando) && (
        <button
          onClick={onEditar}
          title={
            !editando
              ? "Editar os dados do briefing, na Visão geral"
              : edicaoNoutroSeparador
                ? "Voltar à Visão geral, onde ficou a edição a meio"
                : "Guardar as alterações e voltar à leitura"
          }
          className={
            CLASSE_BOTAO[
              !editando
                ? "neutro"
                : edicaoNoutroSeparador
                  ? "ouro"
                  : "ouroCheio"
            ]
          }
          style={medidaBotao}
        >
          {editando && !edicaoNoutroSeparador ? (
            <span style={{ display: "flex", fontSize: "13px", lineHeight: 1 }}>
              ✓
            </span>
          ) : (
            <span style={{ color: "var(--gold)", display: "flex" }}>
              <Icone nome="lapis" tamanho={14} />
            </span>
          )}
          {!editando
            ? "Editar briefing"
            : edicaoNoutroSeparador
              ? condensado
                ? "Voltar"
                : "Voltar ao briefing"
              : condensado
                ? "Concluir"
                : "Concluir edição"}
        </button>
      )}
    </motion.div>
  );

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        backgroundColor: "white",
        borderBottom: "1px solid #F0E6D0",
        boxShadow: condensado
          ? "0 2px 10px rgba(26,26,26,0.06)"
          : "0 1px 0 rgba(240,230,208,0.6)",
        padding: condensado ? "12px 40px 0" : "18px 40px 0",
        transition: "padding 180ms ease, box-shadow 180ms ease",
      }}
    >
      <MotionConfig
        reducedMotion="user"
        transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {condensado ? (
            <motion.div
              key="condensado"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ display: "flex", alignItems: "center", gap: "22px" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "10px",
                  minWidth: 0,
                }}
              >
                <motion.span
                  layoutId="cab-titulo"
                  style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: "17px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {resumoEvento.titulo}
                </motion.span>
                {quantoFalta && (
                  <span
                    style={{
                      fontSize: "11.5px",
                      color: "var(--gray-mid)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {quantoFalta}
                  </span>
                )}
              </div>
              <div style={{ flexShrink: 0 }}>
                <Jornada
                  submissao={submissao}
                  invites={invites}
                  previstos={previstos}
                  pagamentos={pagamentos}
                  compacta
                />
              </div>
              <div style={{ flex: 1 }} />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  flexShrink: 0,
                }}
              >
                <LinhaDinheiro resumo={resumoDinheiro} compacta />
                {acoes}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="repouso"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "40px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      marginBottom: "7px",
                    }}
                  >
                    <button
                      onClick={onVoltar}
                      className="ligacao"
                      style={{
                        fontSize: "11px",
                        color: "var(--gold-dark)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      ← Clientes
                    </button>
                    <span style={{ fontSize: "11px", color: "#C4C4C4" }}>/</span>
                    <span style={{ fontSize: "11px", color: "#9B9B9B" }}>
                      Evento
                    </span>
                  </div>
                  <motion.h2
                    layoutId="cab-titulo"
                    style={{
                      fontFamily: "'Playfair Display', serif",
                      fontSize: "28px",
                      fontWeight: "400",
                      margin: "0 0 7px",
                      letterSpacing: "-0.01em",
                      lineHeight: 1.1,
                    }}
                  >
                    {resumoEvento.titulo}
                  </motion.h2>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "9px",
                      flexWrap: "wrap",
                    }}
                  >
                    {meta.map((m, i) => (
                      <span
                        key={m}
                        style={{ display: "flex", alignItems: "center", gap: "9px" }}
                      >
                        {i > 0 && (
                          <span style={{ fontSize: "13px", color: "#DCD3C0" }}>
                            ·
                          </span>
                        )}
                        <span
                          style={{ fontSize: "13px", color: "var(--gray-mid)" }}
                        >
                          {m}
                        </span>
                      </span>
                    ))}
                    {quantoFalta && <span style={pastilha}>{quantoFalta}</span>}
                  </div>
                </div>

                {/* O dinheiro ANCORADO: primeiro os três números — o
                    contrapeso do título, a resposta que ela procura ao
                    abrir — e só depois os botões. Antes era ao
                    contrário, e o "Falta" lia-se como rodapé. */}
                <div
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: "12px",
                  }}
                >
                  <LinhaDinheiro resumo={resumoDinheiro} />
                  {acoes}
                </div>
              </div>

              <div style={{ marginTop: "16px" }}>
                <Jornada
                  submissao={submissao}
                  invites={invites}
                  previstos={previstos}
                  pagamentos={pagamentos}
                  onEtapa={onEtapa}
                  onProximoGesto={onProximoGesto}
                  onStatusChange={onStatusChange}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ marginTop: condensado ? "10px" : "0" }}>
          <Separadores abas={abas} activeAba={activeAba} onAba={onAba} />
        </div>
      </MotionConfig>
    </div>
  );
}
