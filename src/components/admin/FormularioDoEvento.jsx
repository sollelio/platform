import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import FormField from "../form/FormField";
import CampoSeletor from "./CampoSeletor";
import { createInvite } from "../../lib/invites";
import {
  dataDoRascunho,
  getAllFields,
  getCamposActivosInfo,
  getDefaultCampos,
  validarRascunho,
} from "../../lib/camposFormulario";
import {
  pontePedidoFormulario,
  ROTULO_NOTAS,
} from "../../lib/pontePedido";

// ============================================================
// FormularioDoEvento — a bancada da ponte: compor o formulário de UM
// evento, com o pedido à vista e o transporte feito pelo código.
//
// Substitui o painel inline que nascia debaixo da linha «Formulário» —
// e com ele o bloco de botões «Copiar», que era a app a pedir à Nádia
// o trabalho da ponte. Aqui os dados do pedido já chegam assentes nos
// campos (distintivo dourado a dizer de onde vieram) e o que não tem
// campo fica no cartão «O PEDIDO», à vista, sem uma única cópia à mão.
//
// Anatomia da casa (o irmão do ComunicadoEditor): sobreposição de ecrã
// inteiro em creme, cabeçalho fixo, corpo com scroll, rodapé fixo com a
// linha de verdade e o Criar. O CONTRATO de criação é o de sempre:
// validarRascunho → createInvite(dataEvento/eventTypeId/respostas/
// reservaId/submissionAlvoId) → onConviteCriado.
//
// props:
//   submissao        — o evento-alvo (o alvo é sempre este, fixo)
//   eventTypes       — os modelos (deles saem os campos)
//   reservaProvisoria— a reserva a confirmar quando a cliente submeter
//   onConviteCriado  — o convite criado sobe para a linha mudar de estado
//   onFechar         — fecha sem criar (✕, Cancelar)
// ============================================================

const OVERLINE = {
  fontSize: "9.5px",
  fontWeight: "700",
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  color: "var(--gold-dark)",
};

// A curva de luxo da casa — a mesma da gaveta do ComunicadoEditor.
const EASE_LUXO = [0.32, 0.72, 0, 1];

const vazio = (v) =>
  v === undefined ||
  v === null ||
  (typeof v === "string" && v.trim() === "") ||
  (Array.isArray(v) && v.length === 0);

// «28 de julho» — a data do pedido no overline do cartão.
const dataLonga = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("pt-PT", {
        day: "numeric",
        month: "long",
      })
    : null;

// O pontinho dourado do distintivo de proveniência (5px, como no mock).
function PontoDourado({ brilho }) {
  return (
    <motion.span
      // O brilho único da entrada: acende uma vez e apaga — nunca em
      // loop (um distintivo a piscar seria espetáculo, não ofício).
      animate={
        brilho
          ? {
              boxShadow: [
                "0 0 0 0 rgba(var(--ouro-rgb), 0)",
                "0 0 0 5px rgba(var(--ouro-rgb), 0.35)",
                "0 0 0 0 rgba(var(--ouro-rgb), 0)",
              ],
            }
          : undefined
      }
      transition={brilho ? { duration: 0.9, ease: "easeOut" } : undefined}
      style={{
        width: "5px",
        height: "5px",
        borderRadius: "50%",
        backgroundColor: "var(--gold)",
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

export default function FormularioDoEvento({
  submissao,
  eventTypes = [],
  reservaProvisoria = null,
  onConviteCriado,
  onFechar,
}) {
  const reduzido = useReducedMotion();

  // A ponte corre UMA vez por tipo — pura, sem rede. O tipo inicial é o
  // do evento (ou o primeiro modelo, como no painel antigo).
  const tipoInicialId = submissao?.event_type_id || eventTypes[0]?.id || "";

  const [rascunho, setRascunho] = useState(() => {
    const tipo = eventTypes.find((et) => et.id === tipoInicialId);
    const ponte = pontePedidoFormulario(submissao, tipo);
    return {
      eventTypeId: tipoInicialId,
      // getDefaultCampos é hoje vazio, mas o contrato mantém-se: os por
      // omissão do tipo + os que a ponte assentou.
      camposAtivos: [
        ...new Set([...getDefaultCampos(tipo), ...ponte.camposAtivos]),
      ],
      valores: ponte.valores,
      reservaId: reservaProvisoria?.id || null,
      submissionAlvoId: submissao?.id || null,
    };
  });
  // A proveniência é DO VALOR, não do campo: vive fora do rascunho e
  // apaga-se campo a campo quando ela escreve por cima.
  const [origem, setOrigem] = useState(() => {
    const tipo = eventTypes.find((et) => et.id === tipoInicialId);
    return pontePedidoFormulario(submissao, tipo).origem;
  });
  const [erros, setErros] = useState({});
  const [aCriar, setACriar] = useState(false);

  // A ponte do tipo ACTUAL — para o cartão «O PEDIDO» (referencia) e o
  // temPedido. Deriva-se sempre que o tipo muda; é barata e pura.
  const ponteActual = useMemo(() => {
    const tipo = eventTypes.find((et) => et.id === rascunho.eventTypeId);
    return pontePedidoFormulario(submissao, tipo);
  }, [submissao, eventTypes, rascunho.eventTypeId]);
  const { temPedido, referencia } = ponteActual;

  // ---- A ENTRADA — o momento, UMA vez por abertura -----------------
  // Os cartões assentes pela ponte entram em cascata e o distintivo
  // acende; depois disso o composer comporta-se como mobília parada
  // (mudar o tipo não repete o número).
  // Congelado na abertura (inicializador preguiçoso — nunca se
  // recalcula): o número da banda não muda quando ela edita ou troca o
  // tipo, porque conta o que a ponte fez NAQUELE momento.
  const [nAssentesNaAbertura] = useState(
    () => Object.keys(origem).filter((id) => origem[id] === "pedido").length,
  );
  const [entrada, setEntrada] = useState(true);
  useEffect(() => {
    const total = reduzido ? 0 : nAssentesNaAbertura * 80 + 480 + 900;
    const t = setTimeout(() => setEntrada(false), total);
    return () => clearTimeout(t);
  }, [reduzido, nAssentesNaAbertura]);

  // A banda fina: «A ponte assentou N dados do pedido.» — dissolve-se
  // sozinha aos ~2.5s. Só existe quando a ponte trabalhou de facto.
  const [banda, setBanda] = useState(temPedido && nAssentesNaAbertura > 0);
  useEffect(() => {
    if (!banda) return undefined;
    const t = setTimeout(() => setBanda(false), 2500);
    return () => clearTimeout(t);
  }, [banda]);

  // Fechar com Escape — a porta de saída de qualquer ecrã inteiro.
  useEffect(() => {
    const aoTeclar = (e) => {
      if (e.key === "Escape" && !aCriar) onFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar, aCriar]);

  // ---- As mutações do rascunho (o contrato do painel antigo) -------
  const mudarTipo = (novoId) => {
    if (novoId === rascunho.eventTypeId) return;
    const novoTipo = eventTypes.find((et) => et.id === novoId);
    const novaPonte = pontePedidoFormulario(submissao, novoTipo);
    const idsDoNovoTipo = new Set(getAllFields(novoTipo).map((f) => f.id));
    setRascunho((prev) => {
      const valores = { ...novaPonte.valores };
      const ativos = [
        ...new Set([...getDefaultCampos(novoTipo), ...novaPonte.camposAtivos]),
      ];
      // DECISÃO (04/08): mudar o tipo re-corre a ponte, mas o que ela
      // ESCREVEU À MÃO (valor sem proveniência) sobrevive quando o
      // campo existe no tipo novo — mudar de ideias não apaga trabalho.
      for (const [id, v] of Object.entries(prev.valores)) {
        const escritoAMao = !origem[id];
        if (escritoAMao && idsDoNovoTipo.has(id) && !vazio(v)) {
          valores[id] = v;
          if (!ativos.includes(id)) ativos.push(id);
        }
      }
      return { ...prev, eventTypeId: novoId, camposAtivos: ativos, valores };
    });
    // A proveniência recomeça na ponte nova — os valores à mão que
    // sobreviveram continuam sem distintivo (não estão na origem nova).
    setOrigem(novaPonte.origem);
    setErros({});
  };

  const adicionarCampo = (fieldId) => {
    setRascunho((prev) => ({
      ...prev,
      camposAtivos: [...prev.camposAtivos, fieldId],
    }));
  };

  // O gesto de remover é o de sempre («✕ remover», um clique) — o
  // padrão do painel antigo, mantido de propósito.
  const removerCampo = (fieldId) => {
    setRascunho((prev) => {
      const valoresSemEste = { ...prev.valores };
      delete valoresSemEste[fieldId];
      return {
        ...prev,
        camposAtivos: prev.camposAtivos.filter((id) => id !== fieldId),
        valores: valoresSemEste,
      };
    });
    setOrigem((prev) => {
      if (!prev[fieldId]) return prev;
      const n = { ...prev };
      delete n[fieldId];
      return n;
    });
    setErros((prev) => {
      if (!prev[fieldId]) return prev;
      const n = { ...prev };
      delete n[fieldId];
      return n;
    });
  };

  const mudarValor = (fieldId, valor) => {
    setRascunho((prev) => ({
      ...prev,
      valores: { ...prev.valores, [fieldId]: valor },
    }));
    // Ela escreveu por cima: o valor deixou de ser do pedido — o
    // distintivo sai, porque a proveniência é do valor, não do campo.
    setOrigem((prev) => {
      if (!prev[fieldId]) return prev;
      const n = { ...prev };
      delete n[fieldId];
      return n;
    });
    setErros((prev) => {
      if (!prev[fieldId]) return prev;
      const n = { ...prev };
      delete n[fieldId];
      return n;
    });
  };

  // ---- Criar — o MESMO contrato de hoje ----------------------------
  const criar = async () => {
    const errosDoRascunho = validarRascunho(rascunho, eventTypes);
    if (Object.keys(errosDoRascunho).length > 0) {
      setErros(errosDoRascunho);
      return;
    }
    if (!rascunho.eventTypeId) {
      setErros({
        geral: "Escolha o tipo de evento antes de criar o formulário.",
      });
      return;
    }
    setACriar(true);
    try {
      const convite = await createInvite({
        dataEvento: dataDoRascunho(rascunho, eventTypes),
        eventTypeId: rascunho.eventTypeId,
        respostas: rascunho.valores,
        reservaId: rascunho.reservaId || null,
        submissionAlvoId: submissao.id,
      });
      if (onConviteCriado) onConviteCriado(convite);
      onFechar();
      return;
    } catch (e) {
      console.error("Erro ao criar o formulário:", e);
      setErros({
        geral:
          "Não foi possível criar o formulário. Verifique a ligação e tente novamente.",
      });
    }
    setACriar(false);
  };

  // ---- O que se desenha --------------------------------------------
  const camposActivosInfo = getCamposActivosInfo(eventTypes, rascunho);
  const tipoActual = eventTypes.find((et) => et.id === rascunho.eventTypeId);
  const camposDisponiveis = getAllFields(tipoActual).filter(
    (f) => !rascunho.camposAtivos.includes(f.id),
  );

  // Os números do contador, DERIVADOS do estado — nunca contados à mão.
  const nAssentes = rascunho.camposAtivos.filter(
    (id) => origem[id] && !vazio(rascunho.valores[id]),
  ).length;
  const porPreencher = rascunho.camposAtivos.filter((id) =>
    vazio(rascunho.valores[id]),
  ).length;

  const r = submissao?.respostas || {};
  const nomeDoPedido = r.nomeDoCliente || r.nomeResponsavel || null;
  const paresReferencia = referencia.filter((p) => p.rotulo !== ROTULO_NOTAS);
  const notasDaConversa =
    referencia.find((p) => p.rotulo === ROTULO_NOTAS)?.valor || null;

  // A posição de cada cartão NA CASCATA da entrada (só os assentes pela
  // ponte entram desfasados; os outros já estão sentados).
  const idsAssentes = camposActivosInfo
    .filter((f) => origem[f.id])
    .map((f) => f.id);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Compor o formulário do evento"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        backgroundColor: "var(--cream)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* A grelha 1fr/340px empilha abaixo de ~880px com o cartão do
          pedido PRIMEIRO e compacto — a Nádia usa o telemóvel, e o
          contexto lê-se antes dos campos. Vive num <style> porque media
          queries não se escrevem em linha. */}
      <style>{`
        .fdev-scroll::-webkit-scrollbar { width: 6px; }
        .fdev-scroll::-webkit-scrollbar-thumb {
          background-color: var(--gold-light);
          border-radius: 999px;
        }
        .fdev-scroll::-webkit-scrollbar-track { background: transparent; }
        .fdev-grelha {
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 28px;
          align-items: start;
          max-width: 1080px;
          margin: 0 auto;
        }
        @media (max-width: 880px) {
          .fdev-grelha { grid-template-columns: 1fr; gap: 18px; }
          .fdev-lado { order: -1; }
          .fdev-cartao-pedido { padding: 12px 14px 14px !important; }
          .fdev-corpo { padding: 18px 16px 32px !important; }
        }
      `}</style>

      {/* ---- Cabeçalho fixo ---- */}
      <header
        style={{
          flex: "none",
          backgroundColor: "var(--superficie)",
          borderBottom: "1px solid var(--borda-leve)",
          padding: "18px 32px 16px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={OVERLINE}>Formulário do evento</div>
          <div
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "26px",
              fontWeight: "400",
              color: "var(--charcoal)",
              marginTop: "5px",
              lineHeight: 1.2,
            }}
          >
            Compor o formulário
          </div>
        </div>
        <button
          onClick={onFechar}
          aria-label="Fechar"
          className="icone-botao"
          style={{
            width: "34px",
            height: "34px",
            borderRadius: "9px",
            border: "1px solid var(--borda)",
            backgroundColor: "var(--superficie)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 16 16"
            fill="none"
            stroke="var(--gray-mid)"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </header>

      {/* ---- Corpo com scroll ---- */}
      <div
        className="fdev-scroll fdev-corpo"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "28px 32px 40px",
          scrollbarWidth: "thin",
          scrollbarColor: "var(--gold-light) transparent",
        }}
      >
        {/* A banda da ponte — diz o número uma vez e dissolve-se. Com
            movimento reduzido aparece e some sem transição nenhuma. */}
        <AnimatePresence>
          {banda && (
            <motion.div
              initial={false}
              exit={
                reduzido ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }
              }
              transition={reduzido ? { duration: 0 } : { duration: 0.4 }}
              style={{
                maxWidth: "1080px",
                margin: "0 auto 16px",
                backgroundColor: "var(--superficie-selo)",
                border: "1px solid var(--gold-light)",
                borderRadius: "10px",
                padding: "8px 14px",
                fontSize: "12px",
                color: "var(--gold-dark)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <PontoDourado brilho={false} />
              <span>
                A ponte assentou{" "}
                {nAssentesNaAbertura === 1
                  ? "1 dado"
                  : `${nAssentesNaAbertura} dados`}{" "}
                do pedido.
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="fdev-grelha">
          {/* ===== ESQUERDA · o composer ===== */}
          <div>
            {/* Tipo de evento — pastilhas da casa */}
            <div>
              <div style={OVERLINE}>Tipo de evento</div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "10px",
                  marginTop: "12px",
                }}
              >
                {eventTypes.map((et) => {
                  const activa = et.id === rascunho.eventTypeId;
                  return (
                    <button
                      key={et.id}
                      type="button"
                      onClick={() => mudarTipo(et.id)}
                      className={
                        activa
                          ? "pastilha-escolha pastilha-escolha--activa"
                          : "pastilha-escolha"
                      }
                      style={{
                        padding: "7px 18px",
                        borderRadius: "999px",
                        fontSize: "12.5px",
                        fontWeight: "600",
                      }}
                    >
                      {et.nome}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Os campos — cartões finos, distintivo de proveniência */}
            <div style={{ marginTop: "28px" }}>
              <div style={OVERLINE}>Os campos</div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  marginTop: "12px",
                }}
              >
                {camposActivosInfo.length === 0 && (
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--gray-mid)",
                      margin: 0,
                    }}
                  >
                    Ainda não há campos — usa a busca em baixo para
                    adicionar o que quiseres perguntar (ou preencher já).
                  </p>
                )}
                {camposActivosInfo.map((field) => {
                  const deOnde = origem[field.id] || null;
                  const posNaCascata = idsAssentes.indexOf(field.id);
                  // A cascata só existe na entrada, sem movimento
                  // reduzido, e só para os cartões que a ponte encheu.
                  const anima =
                    entrada && !reduzido && deOnde && posNaCascata >= 0;
                  return (
                    <motion.div
                      key={field.id}
                      initial={anima ? { opacity: 0, y: 8 } : false}
                      animate={{ opacity: 1, y: 0 }}
                      transition={
                        anima
                          ? {
                              duration: 0.48,
                              ease: EASE_LUXO,
                              delay: posNaCascata * 0.08,
                            }
                          : { duration: 0 }
                      }
                      style={{
                        backgroundColor: "var(--superficie)",
                        border: "1px solid var(--borda)",
                        borderRadius: "12px",
                        padding: "12px 16px 14px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: "8px",
                          marginBottom: "4px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "10px",
                            color: "var(--gray-mid)",
                          }}
                        >
                          {field.stepTitle}
                        </span>
                        {deOnde && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "9px",
                              fontStyle: "italic",
                              fontWeight: "600",
                              color: "var(--gold-dark)",
                            }}
                          >
                            <PontoDourado brilho={anima} />
                            {deOnde === "pedido" ? "do pedido" : "do evento"}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removerCampo(field.id)}
                          title="Remover campo"
                          className="toca"
                          style={{
                            marginLeft: "auto",
                            fontSize: "11px",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--gray-mid)",
                            padding: "2px 4px",
                          }}
                        >
                          ✕ remover
                        </button>
                      </div>
                      {/* O FormField é peça PÚBLICA embutida no admin (a
                          mesma do formulário da cliente) — as cores dele
                          são as da vitrina e não seguem o tema. A classe
                          .papel reancora os tokens ao claro dentro desta
                          ilha: no escuro, o cartão escurece e o campo
                          fica como papel em cima da mesa (no claro a
                          classe é um no-op, valores idênticos). */}
                      <div className="papel">
                        <FormField
                          field={{
                            ...field,
                            required: false,
                            placeholder:
                              field.placeholder || "— a cliente responde aqui",
                          }}
                          value={rascunho.valores[field.id]}
                          onChange={mudarValor}
                          error={erros[field.id]}
                          onClearError={(id) =>
                            setErros((prev) => {
                              if (!prev[id]) return prev;
                              const n = { ...prev };
                              delete n[id];
                              return n;
                            })
                          }
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* «+ Adicionar campo» — o tracejado com o CampoSeletor */}
              <div
                style={{
                  border: "1.5px dashed var(--gold-light)",
                  backgroundColor: "var(--superficie-espera)",
                  borderRadius: "12px",
                  padding: "14px 16px 16px",
                  marginTop: "12px",
                }}
              >
                <CampoSeletor
                  camposDisponiveis={camposDisponiveis}
                  onAdd={adicionarCampo}
                />
              </div>
            </div>
          </div>

          {/* ===== DIREITA · o pedido, à vista ===== */}
          <aside className="fdev-lado">
            {temPedido ? (
              <>
                <div
                  className="fdev-cartao-pedido"
                  style={{
                    backgroundColor: "var(--superficie)",
                    border: "1px solid var(--borda)",
                    borderRadius: "14px",
                    padding: "18px 20px 20px",
                  }}
                >
                  <div style={OVERLINE}>
                    O pedido
                    {submissao?.created_at
                      ? ` · ${dataLonga(submissao.created_at)}`
                      : ""}
                  </div>
                  {nomeDoPedido && (
                    <div
                      style={{
                        fontFamily: "'Playfair Display', serif",
                        fontSize: "18px",
                        fontWeight: "600",
                        color: "var(--charcoal)",
                        margin: "8px 0 12px",
                      }}
                    >
                      {nomeDoPedido}
                    </div>
                  )}
                  {paresReferencia.map((par) => (
                    <div
                      key={par.rotulo}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "112px 1fr",
                        gap: "10px",
                        padding: "7px 0",
                        borderTop: "1px solid var(--borda-leve)",
                        alignItems: "baseline",
                      }}
                    >
                      <span
                        style={{ fontSize: "11px", color: "var(--gray-mid)" }}
                      >
                        {par.rotulo}
                      </span>
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: "500",
                          color: "var(--charcoal)",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {par.valor}
                      </span>
                    </div>
                  ))}
                  {notasDaConversa && (
                    <div
                      style={{
                        backgroundColor: "var(--superficie-espera)",
                        border: "1px solid var(--borda-leve)",
                        borderRadius: "10px",
                        padding: "10px 12px",
                        marginTop: "12px",
                      }}
                    >
                      <div
                        style={{
                          ...OVERLINE,
                          fontSize: "9px",
                          letterSpacing: "0.12em",
                        }}
                      >
                        {ROTULO_NOTAS}
                      </div>
                      <p
                        style={{
                          fontSize: "12.5px",
                          fontStyle: "italic",
                          color: "var(--gray-mid)",
                          margin: "5px 0 0",
                          lineHeight: 1.5,
                        }}
                      >
                        «{notasDaConversa}»
                      </p>
                    </div>
                  )}
                </div>

                <p
                  style={{
                    fontSize: "11.5px",
                    fontStyle: "italic",
                    color: "var(--gray-mid)",
                    lineHeight: 1.6,
                    margin: "14px 4px 0",
                  }}
                >
                  O que tinha lugar no formulário já entrou nos campos —
                  está marcado a dourado. O resto fica aqui, à vista.
                </p>
              </>
            ) : (
              <div
                style={{
                  border: "1.5px dashed var(--gold-light)",
                  backgroundColor: "var(--superficie-espera)",
                  borderRadius: "14px",
                  padding: "26px 22px 28px",
                  textAlign: "center",
                }}
              >
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--gold)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ marginBottom: "12px" }}
                >
                  <path d="M6 3h8l4 4v14H6z" />
                  <path d="M14 3v4h4" />
                  <path d="M9 13h6M9 16h4" />
                </svg>
                <div style={OVERLINE}>Sem pedido de orçamento</div>
                <p
                  style={{
                    fontSize: "12.5px",
                    color: "var(--gray-mid)",
                    lineHeight: 1.65,
                    margin: "10px 0 0",
                    textAlign: "left",
                  }}
                >
                  Este evento nasceu na casa — não veio de um pedido. Os
                  campos preenchem-se à mão, ou seguem vazios para a
                  cliente responder.
                </p>
              </div>
            )}

            {/* O contador — números derivados, sempre certos */}
            <div
              style={{
                backgroundColor: "var(--superficie)",
                border: "1px solid var(--borda)",
                borderRadius: "12px",
                padding: "10px 14px",
                marginTop: "12px",
                fontSize: "11.5px",
                color: "var(--gray-mid)",
                display: "flex",
                alignItems: "center",
                gap: "7px",
              }}
            >
              <PontoDourado brilho={false} />
              <span>
                <strong
                  style={{ color: "var(--charcoal)", fontWeight: "600" }}
                >
                  {nAssentes === 1 ? "1 campo" : `${nAssentes} campos`}
                </strong>{" "}
                {nAssentes === 1 ? "preenchido" : "preenchidos"}{" "}
                {temPedido ? "pela ponte" : "pelo evento"} ·{" "}
                <strong
                  style={{ color: "var(--charcoal)", fontWeight: "600" }}
                >
                  {porPreencher}
                </strong>{" "}
                por preencher
              </span>
            </div>
          </aside>
        </div>
      </div>

      {/* ---- Rodapé fixo ---- */}
      <footer
        style={{
          flex: "none",
          backgroundColor: "var(--superficie)",
          borderTop: "1px solid var(--borda-leve)",
          padding: "14px 32px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
        }}
      >
        {/* A linha de verdade cede o lugar ao erro quando o há — um
            rodapé com as duas seria duas vozes ao mesmo tempo. */}
        {erros.geral ? (
          <span
            style={{
              fontSize: "12.5px",
              color: "var(--perigo-texto)",
              marginRight: "auto",
              lineHeight: 1.5,
            }}
          >
            ⚠ {erros.geral}
          </span>
        ) : (
          <span
            style={{
              fontSize: "12px",
              fontStyle: "italic",
              color: "var(--gray-mid)",
              marginRight: "auto",
            }}
          >
            A cliente recebe a ligação e responde ao ritmo dela.
          </span>
        )}
        <button
          onClick={onFechar}
          className="acao acao--neutra"
          style={{
            padding: "10px 22px",
            borderRadius: "10px",
            fontSize: "13.5px",
            fontWeight: "600",
          }}
        >
          Cancelar
        </button>
        <button
          onClick={criar}
          disabled={aCriar}
          className="acao acao--cheia"
          style={{
            padding: "10px 22px",
            borderRadius: "10px",
            fontSize: "13.5px",
            fontWeight: "600",
            boxShadow: "0 2px 10px rgba(var(--ouro-rgb), 0.38)",
          }}
        >
          {aCriar ? "A criar…" : "Criar formulário"}
        </button>
      </footer>
    </div>
  );
}
