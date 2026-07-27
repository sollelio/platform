import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Jornada from "./Jornada";
import { Icone } from "./Navegacao";
import { formatarEuros } from "./orcamentos/orcamentoConfig";
import { useContagemAnimada } from "./acabamento";

// ============================================================
// CabecalhoEvento — a moldura da página /evento/:id, em DUAS peças:
//
//   A parte que se DESPEDE — breadcrumb, título grande, meta, os três
//     números do dinheiro e a Jornada completa. Nunca é sticky: rola
//     para fora com a página, como qualquer conteúdo.
//   A MOLDURA PERMANENTE — a linha compacta (nome, régua sem rótulos,
//     o que falta, os botões) + os separadores. É sticky, tem altura
//     CONSTANTE, e a linha compacta só acorda (opacidade) quando a
//     moldura prega ao topo.
//
// Porquê assim, e não um cabeçalho que encolhe: encolher mudava a
// altura do documento a meio de um scroll — o browser puxava o scroll
// para compensar, o limiar disparava ao contrário, e o cabeçalho
// oscilava aberto↔fechado (o "salta e volta" que esta arquitectura
// substituiu). Aqui, fixar/desafixar muda SÓ opacidade e sombra —
// nunca layout — e o próprio "condensar" é o scroll a acontecer: o
// grande despede-se, a linha compacta acorda no lugar.
//
// O sinal "está pregada?" vem de um SENTINELA de 1px observado por
// IntersectionObserver — geometria pura, sem limiares nem histerese.
// A moldura sobrepõe-se à cauda da parte grande (margem negativa,
// transparente até ser precisa) para os separadores ficarem, em
// repouso, exactamente onde sempre estiveram — sem ar novo.
//
// O dinheiro aqui são TRÊS NÚMEROS e mais nada — as parcelas e o
// registo vivem no separador Pagamentos. E a frase «→ A seguir» da
// Jornada aponta, não age: leva ao separador onde o gesto se faz.
// ============================================================

// A altura da linha compacta — e também a sobreposição da moldura
// sobre a parte que se despede (ver a marginTop negativa no uso).
const ALTURA_LINHA_COMPACTA = 42;

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
        <span
          style={{
            fontWeight: "600",
            color: "var(--gold-dark)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatarEuros(faltaAnim)}
        </span>
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
        <span
          style={{
            fontSize: "17px",
            fontWeight: "600",
            color: "var(--gold-dark)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatarEuros(valor)}
        </span>
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
  onRecuperar,
  onImprimir,
  onWhatsApp,
  onEditar,
  editando = false,
  edicaoNoutroSeparador = false,
  onEtapa,
  onProximoGesto,
  onStatusChange,
}) {
  // FIXADO = a moldura está pregada ao topo. Deriva do sentinela —
  // e como fixar/desafixar só muda opacidade e sombra (nunca layout),
  // não há mecanismo para saltos nem oscilações.
  const [fixado, setFixado] = useState(false);
  const sentinelaRef = useRef(null);
  useEffect(() => {
    const sentinela = sentinelaRef.current;
    if (!sentinela) return;
    const observador = new IntersectionObserver(
      ([entrada]) => setFixado(!entrada.isIntersecting),
      { threshold: 0 },
    );
    observador.observe(sentinela);
    return () => observador.disconnect();
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

  // Na linha compacta E a editar, três botões não cabem em ecrãs
  // estreitos — a saída da edição é a que não pode faltar, as outras
  // duas voltam mal se pare de rolar (ou se conclua).
  const soEdicao = fixado && editando;

  // As acções nas duas medidas: completas na parte que se despede,
  // curtas na linha compacta. Montam-se as duas em simultâneo — quem
  // decide qual se vê é a opacidade da moldura, nunca o layout.
  const acoes = (compacto) => (
    <div style={{ display: "flex", gap: "8px" }}>
      {!(compacto && soEdicao) && (
        <button
          onClick={onImprimir}
          className={CLASSE_BOTAO.ouro}
          style={medidaBotao}
        >
          {compacto ? "Imprimir" : "Imprimir / Guardar PDF"}
        </button>
      )}
      {onWhatsApp && !(compacto && soEdicao) && (
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
          Fica na linha compacta quando se está a editar, senão a saída
          desaparecia ao rolar. */}
      {onEditar && (!compacto || editando) && (
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
              ? compacto
                ? "Voltar"
                : "Voltar ao briefing"
              : compacto
                ? "Concluir"
                : "Concluir edição"}
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* A PARTE QUE SE DESPEDE — nunca sticky; rola para fora com a
          página. É isto a "condensação": o grande despede-se. */}
      <div style={{ backgroundColor: "white", padding: "18px 40px 0" }}>
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
            <h2
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
            </h2>
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
              abrir — e só depois os botões. */}
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
            {acoes(false)}
          </div>
        </div>

        <div style={{ marginTop: "16px" }}>
          <Jornada
            // key: trocar de evento remonta a régua — a guarda de
            // primeira pintura renasce e nada "acontece" em cascata.
            key={submissao.id}
            submissao={submissao}
            invites={invites}
            previstos={previstos}
            pagamentos={pagamentos}
            onEtapa={onEtapa}
            onProximoGesto={onProximoGesto}
            onStatusChange={onStatusChange}
            onRecuperar={onRecuperar}
          />
        </div>
      </div>

      {/* O SENTINELA: 1px branco que responde "a moldura está
          pregada?" — visível = não; fora do ecrã = sim. */}
      <div
        ref={sentinelaRef}
        aria-hidden
        style={{ height: "1px", backgroundColor: "white" }}
      />

      {/* A MOLDURA PERMANENTE — altura constante, sempre. Sobrepõe-se
          (margem negativa) à cauda da parte grande: em repouso a linha
          compacta é invisível e deixa passar cliques, e os separadores
          ficam exactamente onde sempre estiveram. Fixar muda só
          opacidade e sombra. */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          marginTop: `-${ALTURA_LINHA_COMPACTA + 1}px`,
          boxShadow: fixado ? "0 2px 10px rgba(26,26,26,0.06)" : "none",
          transition: "box-shadow 180ms ease",
        }}
      >
        <div
          aria-hidden={!fixado}
          style={{
            height: `${ALTURA_LINHA_COMPACTA}px`,
            display: "flex",
            alignItems: "center",
            gap: "22px",
            padding: "0 40px",
            backgroundColor: "white",
            opacity: fixado ? 1 : 0,
            transform: fixado ? "none" : "translateY(-4px)",
            visibility: fixado ? "visible" : "hidden",
            pointerEvents: fixado ? "auto" : "none",
            transition: "opacity 180ms ease, transform 180ms ease",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "10px",
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: "17px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {resumoEvento.titulo}
            </span>
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
            {acoes(true)}
          </div>
        </div>

        <div
          style={{
            backgroundColor: "white",
            borderBottom: "1px solid #F0E6D0",
            padding: "0 40px",
          }}
        >
          <Separadores abas={abas} activeAba={activeAba} onAba={onAba} />
        </div>
      </div>
    </>
  );
}
