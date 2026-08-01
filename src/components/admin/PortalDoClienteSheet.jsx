import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Esqueleto } from "./acabamento";
import { FASES_POS_SINAL } from "./faseConfig";
import {
  getAcessoDoEvento,
  abrirPortal,
  revogarPortal,
  enderecoDoPortal,
  getPublicacoes,
  getPedidosCodigo,
  publicarDocumento,
  emitirCodigo,
  getPapelPorConfirmar,
  getPedidosDoQuestionario,
  marcarPedidoTratado,
  urlDoContratoPapel,
  confirmarContratoPapel,
  ROTULO_DOCUMENTO,
} from "../../lib/portal";
import { documentosDoEvento } from "../../lib/documentos";
import { CONTRATO_INTRO, CLAUSULAS } from "./orcamentos/contratoConfig";
import {
  CONDICOES_ORCAMENTO,
  NOTA_RODAPE_ORCAMENTO,
  VALIDADE_ORCAMENTO_DIAS,
} from "./orcamentos/orcamentoConfig";

// O que se CONGELA junto com os dados ao publicar: o texto fixo que os
// rodeia. Sem isto, mudar uma cláusula no código mudava um contrato já
// publicado — o instantâneo tem de apanhar tudo o que a cliente lê.
const EXTRA_POR_TIPO = {
  contrato: { __contrato: { intro: CONTRATO_INTRO, clausulas: CLAUSULAS } },
  orcamento: {
    __condicoes: CONDICOES_ORCAMENTO,
    __nota: NOTA_RODAPE_ORCAMENTO,
    __validadeDias: VALIDADE_ORCAMENTO_DIAS,
  },
  proposta: null,
};

// ============================================================
// PortalDoClienteSheet — a porta do acompanhamento, do lado da Nádia.
//
// Fecha a fase 1: até aqui a ligação só se obtinha por SQL, ou seja, ela
// não conseguia usá-la. Aqui gera-se, copia-se, vê-se se a cliente lá foi,
// e fecha-se.
//
// A CASA É AO LADO DO BOTÃO DE WHATSAPP, na moldura do evento: gerar e
// enviar são o mesmo momento, e é aí que ela está quando pensa na cliente.
//
// ⚠ NÃO pré-visualizar chamando `dlm_portal_ver`: essa função incrementa
// `n_acessos` e carimba `ultimo_acesso_em`. Uma espreitadela daqui passava
// a contar como visita da cliente e estragava o único sinal que lhe diz se
// vale a pena insistir. Por isso a linha do «o que ela vai ver» sai da
// FASE do evento, não da RPC.
//
// O CONTEÚDO é componente à parte, montado só quando a folha abre. Assim o
// estado nasce limpo a cada abertura sem ser reposto dentro de um efeito —
// que é a família do bug de produção do documento, e que o linter proíbe
// com razão.
//
// Registo de OFÍCIO, não de montra: sem cerimónia, sem Playfair, sem
// movimento além do que a folha faz ao entrar. Terceira pessoa e
// vocabulário sem regionalismos, como no resto — mesmo sendo ecrã interno.
// ============================================================

const overline = {
  fontSize: "10px",
  fontWeight: "700",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--gold-dark)",
  margin: 0,
};

const botao = {
  padding: "9px 16px",
  borderRadius: "10px",
  fontSize: "12.5px",
  fontWeight: "600",
  fontFamily: "inherit",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const dataHora = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })} às ${d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`;
};

// O que a cliente vai encontrar, dito pela FASE do evento — a única fonte
// disponível sem gastar uma visita. Usa a lista canónica FASES_POS_SINAL,
// a mesma da conferência da Logística e das lacunas de formulário, em vez
// de uma lista nova.
//
// É informação, nunca travão: não bloqueia nada, só lhe permite decidir
// com conhecimento se é cedo de mais para enviar.
const oQueElaVaiVer = (fase) => {
  if (fase === "perdido") return null;
  if (FASES_POS_SINAL.includes(fase)) {
    return "O evento já vai adiantado: ela vai encontrar boa parte do percurso feito.";
  }
  return "O evento ainda está no princípio: ela vai encontrar quase tudo por acontecer. Não é defeito da página — é onde o evento está —, mas talvez prefira esperar por ter mais para lhe mostrar.";
};

function Conteudo({ evento, onFechar }) {
  // { estado: 'a-carregar' | 'pronto' | 'erro', acesso, docs, pubs, pedidos }
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const [aTrabalhar, setATrabalhar] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [aConfirmarFecho, setAConfirmarFecho] = useState(false);
  // Depois de publicar ou emitir, pede-se a verdade à base outra vez em
  // vez de a remendar à mão no estado local.
  const [recarga, setRecarga] = useState(0);
  // O id do pedido cujo código acabou de ser copiado (feedback do botão).
  const [copiadoCodigo, setCopiadoCodigo] = useState(null);
  // O nome tal como está escrito no papel — é ele que fica no trilho.
  const [nomeNoPapel, setNomeNoPapel] = useState("");
  // Bandeira PRÓPRIA: com a partilhada, confirmar o papel punha o botão de
  // emitir código a dizer «A emitir…» sem nada estar a ser emitido.
  const [aConfirmarPapel, setAConfirmarPapel] = useState(false);

  const eventoId = evento.id;

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      getAcessoDoEvento(eventoId),
      documentosDoEvento(eventoId),
      getPublicacoes(eventoId),
      getPedidosCodigo(eventoId),
      getPapelPorConfirmar(eventoId),
      getPedidosDoQuestionario(eventoId),
    ])
      .then(([a, docs, pubs, pedidos, papeis, pedidosQ]) => {
        if (!cancelado)
          setResultado({ estado: "pronto", acesso: a, docs, pubs, pedidos, papeis, pedidosQ });
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado)
          setResultado({ estado: "erro", acesso: null, docs: [], pubs: [], pedidos: [], papeis: [], pedidosQ: [] });
      });
    return () => {
      cancelado = true;
    };
  }, [eventoId, recarga]);

  const estado = resultado?.estado ?? "a-carregar";
  const acesso = resultado?.acesso ?? null;
  const docs = resultado?.docs ?? [];
  const pubs = resultado?.pubs ?? [];
  const pedidos = resultado?.pedidos ?? [];
  const papeis = resultado?.papeis ?? [];
  const pedidosQ = resultado?.pedidosQ ?? [];
  // Quem manda a secção do papel embora é a ASSINATURA existir — não o
  // aviso ter sido lido. Lê-se nos actos da publicação do contrato.
  const contratoAssinado = pubs.some(
    (p) =>
      p.tipo === "contrato" &&
      (p.portal_actos || []).some((x) => x.acto === "assinou"),
  );
  const papelPorConfirmar = contratoAssinado ? null : papeis[0] || null;
  const endereco = acesso ? enderecoDoPortal(acesso.token) : null;

  const copiar = () => {
    if (!endereco) return;
    navigator.clipboard.writeText(endereco);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const abrir = async () => {
    setATrabalhar(true);
    setErro(null);
    try {
      // Idempotente na base: carregar duas vezes devolve o MESMO token
      // (há um índice único parcial a garanti-lo), nunca cria um segundo.
      await abrirPortal(eventoId);
      // Recarga em vez de substituir o objecto: escrever só `acesso`
      // deitava fora docs/pubs/pedidos, e as secções dos documentos e dos
      // códigos desapareciam até fechar e reabrir a folha.
      setRecarga((r) => r + 1);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível abrir o acompanhamento. Tente novamente.");
    } finally {
      setATrabalhar(false);
    }
  };

  const revogar = async () => {
    setATrabalhar(true);
    setErro(null);
    try {
      await revogarPortal(eventoId, "manual");
      setRecarga((r) => r + 1);
      setAConfirmarFecho(false);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível fechar o acompanhamento. Tente novamente.");
    } finally {
      setATrabalhar(false);
    }
  };

  const publicar = async (tipo) => {
    setATrabalhar(true);
    setErro(null);
    try {
      await publicarDocumento(eventoId, tipo, EXTRA_POR_TIPO[tipo] || null);
      setRecarga((r) => r + 1);
    } catch (e) {
      console.error(e);
      setErro(
        /CONTRATO_TRANCADO/.test(e?.message || "")
          ? "Este contrato está assinado e trancado — não há versões novas. Para corrigir, faz-se um contrato novo."
          : "Não foi possível publicar. Tente novamente.",
      );
    } finally {
      setATrabalhar(false);
    }
  };

  const emitir = async (verificacaoId) => {
    setATrabalhar(true);
    setErro(null);
    try {
      await emitirCodigo(verificacaoId);
      setRecarga((r) => r + 1);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível emitir o código. Tente novamente.");
    } finally {
      setATrabalhar(false);
    }
  };

  // O papel: ver a fotografia (URL assinado, 5 minutos) e confirmar com o
  // nome que lá está escrito.
  const verPapel = async (caminho) => {
    setErro(null);
    try {
      const url = await urlDoContratoPapel(caminho);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error(e);
      setErro("Não foi possível abrir a fotografia. Tente novamente.");
    }
  };

  const confirmarPapel = async (notificacaoId) => {
    if (aConfirmarPapel) return;
    if (!nomeNoPapel.trim() || nomeNoPapel.trim().length < 3) {
      setErro("Escreva o nome tal como está no papel — é ele que fica no registo.");
      return;
    }
    setAConfirmarPapel(true);
    setErro(null);
    try {
      const r = await confirmarContratoPapel(notificacaoId, nomeNoPapel.trim());
      if (r?.estado === "ja_assinado") {
        setErro("Este contrato já estava assinado — nada mudou.");
      }
      setNomeNoPapel("");
      setRecarga((x) => x + 1);
    } catch (e) {
      console.error(e);
      const m = e?.message || "";
      setErro(
        /SEM_CONTRATO_PUBLICADO/.test(m)
          ? "Não há contrato publicado neste evento — publique-o antes de confirmar."
          : /FICHEIRO_NAO_ENCONTRADO/.test(m)
            ? "A fotografia já não está no arquivo. Peça-lhe que a carregue outra vez."
            : "Não foi possível confirmar. Tente novamente.",
      );
    } finally {
      setAConfirmarPapel(false);
    }
  };

  const tratarPedido = async (id) => {
    if (aTrabalhar) return;
    setATrabalhar(true);
    setErro(null);
    try {
      await marcarPedidoTratado(id);
      setRecarga((x) => x + 1);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível marcar como tratado. Tente novamente.");
    } finally {
      setATrabalhar(false);
    }
  };

  const copiarCodigo = (id, codigo) => {
    navigator.clipboard.writeText(codigo);
    setCopiadoCodigo(id);
    setTimeout(() => setCopiadoCodigo(null), 2500);
  };

  // Os pedidos que precisam dela: por emitir, ou emitidos por usar (o
  // código fica à vista para reenviar). Os já usados são trilho, não fila.
  const pedidosVivos = pedidos.filter(
    (p) =>
      !p.usado_em &&
      (!p.emitido_em || (p.expira_em && new Date(p.expira_em) > new Date())),
  );

  const aviso = oQueElaVaiVer(evento.fase);

  return (
    <>
      <p style={overline}>Acompanhamento</p>
      <p
        style={{
          fontSize: "16px",
          fontWeight: "600",
          color: "var(--charcoal)",
          margin: "8px 0 0",
        }}
      >
        A página que a cliente pode acompanhar
      </p>
      <p
        style={{
          fontSize: "12.5px",
          lineHeight: 1.6,
          color: "var(--gray-mid)",
          margin: "6px 0 0",
        }}
      >
        Mostra o percurso do evento — o que já aconteceu e o que vem a seguir.
        Só mostra valores num documento que publicar, e apenas depois do
        código que lhe enviar. Nunca mostra moradas exactas nem notas
        internas.
      </p>

      {estado === "a-carregar" && (
        <div style={{ marginTop: "20px" }}>
          <Esqueleto w="100%" h={44} r={10} style={{ marginBottom: "10px" }} />
          <Esqueleto w={220} h={12} />
        </div>
      )}

      {estado === "erro" && (
        <p
          style={{
            marginTop: "20px",
            fontSize: "12.5px",
            lineHeight: 1.6,
            color: "#B91C1C",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "10px",
            padding: "12px 14px",
          }}
        >
          Não foi possível saber se este evento já tem acompanhamento aberto.
          Verifique a ligação, feche e volte a abrir esta janela.
        </p>
      )}

      {estado === "pronto" && !acesso && (
        <>
          {aviso && (
            <p
              style={{
                marginTop: "18px",
                fontSize: "12px",
                lineHeight: 1.65,
                color: "#92400E",
                backgroundColor: "#FEF3E2",
                border: "1px solid #F0D9B5",
                borderRadius: "10px",
                padding: "12px 14px",
              }}
            >
              {aviso}
            </p>
          )}
          <button
            onClick={abrir}
            disabled={aTrabalhar}
            style={{
              ...botao,
              marginTop: "18px",
              width: "100%",
              border: "none",
              backgroundColor: "var(--gold)",
              color: "white",
              opacity: aTrabalhar ? 0.6 : 1,
              cursor: aTrabalhar ? "wait" : "pointer",
            }}
          >
            {aTrabalhar ? "A abrir…" : "Abrir o acompanhamento"}
          </button>
          <p
            style={{
              fontSize: "11.5px",
              lineHeight: 1.6,
              color: "var(--gray-mid)",
              margin: "10px 0 0",
            }}
          >
            Gera uma ligação só deste evento, para lhe enviar. Pode fechá-la a
            qualquer momento.
          </p>
        </>
      )}

      {estado === "pronto" && acesso && (
        <>
          <div
            style={{
              marginTop: "18px",
              display: "flex",
              gap: "8px",
              alignItems: "stretch",
            }}
          >
            <input
              readOnly
              value={endereco || ""}
              onFocus={(e) => e.target.select()}
              style={{
                flex: 1,
                minWidth: 0,
                border: "1.5px solid var(--gold-light)",
                borderRadius: "10px",
                padding: "10px 12px",
                fontSize: "12.5px",
                fontFamily: "inherit",
                color: "var(--charcoal)",
                backgroundColor: "var(--branco-quente, #FDFBF5)",
                boxSizing: "border-box",
              }}
            />
            <button
              onClick={copiar}
              style={{
                ...botao,
                border: "none",
                backgroundColor: copiado ? "#166534" : "var(--gold)",
                color: "white",
                transition: "background-color 140ms ease",
              }}
            >
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>

          {/* O SINAL DE VIDA. É o que lhe diz se vale a pena insistir com a
              cliente ou se ela já lá esteve. */}
          <p
            style={{
              fontSize: "12px",
              lineHeight: 1.7,
              color: "var(--gray-mid)",
              margin: "14px 0 0",
            }}
          >
            {!acesso.n_acessos ? (
              <>
                <strong style={{ color: "var(--charcoal)", fontWeight: 600 }}>
                  Ainda não foi aberta.
                </strong>{" "}
                Depois de a enviar, aparece aqui quando ela lá for.
              </>
            ) : (
              <>
                <strong style={{ color: "var(--charcoal)", fontWeight: 600 }}>
                  Aberta {acesso.n_acessos}{" "}
                  {acesso.n_acessos === 1 ? "vez" : "vezes"}.
                </strong>
                {acesso.ultimo_acesso_em && (
                  <> A última foi a {dataHora(acesso.ultimo_acesso_em)}.</>
                )}
              </>
            )}
          </p>

          {acesso.expira_em && (
            <p
              style={{
                fontSize: "11.5px",
                color: "var(--gray-mid)",
                margin: "6px 0 0",
              }}
            >
              A ligação deixa de abrir a partir de {dataHora(acesso.expira_em)}.
            </p>
          )}

          {/* ── OS DOCUMENTOS NO ACOMPANHAMENTO ──────────────────────────
              Publicar é o acto que substituiu a caixa «enviado»: congela um
              instantâneo, mostra-o à cliente e carimba o envio. O que ela
              vê é o que foi publicado — nunca o documento vivo. */}
          {docs.length > 0 && (
            <div
              style={{
                marginTop: "20px",
                paddingTop: "16px",
                borderTop: "1px solid var(--hairline, #F0E6D0)",
              }}
            >
              <p style={{ ...overline, marginBottom: "10px" }}>
                Documentos no acompanhamento
              </p>
              {["orcamento", "proposta", "contrato"].map((tipo) => {
                const doc = docs.find((d) => d.tipo === tipo);
                if (!doc) return null;
                const pub = pubs.find((p) => p.tipo === tipo) || null;
                const actos = (pub?.portal_actos || [])
                  .slice()
                  .sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1));
                const acto = actos[0] || null;
                const trancado = !!doc.trancado_em;

                return (
                  <div
                    key={tipo}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      flexWrap: "wrap",
                      padding: "9px 0",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p
                        style={{
                          fontSize: "13px",
                          fontWeight: "600",
                          color: "var(--charcoal)",
                          margin: 0,
                        }}
                      >
                        {ROTULO_DOCUMENTO[tipo]}
                      </p>
                      <p
                        style={{
                          fontSize: "11.5px",
                          lineHeight: 1.55,
                          color: trancado ? "#166534" : "var(--gray-mid)",
                          margin: "2px 0 0",
                        }}
                      >
                        {trancado
                          ? `Assinado e trancado a ${dataHora(doc.trancado_em)} — não se altera; um erro resolve-se com contrato novo.`
                          : !pub
                            ? "Ainda não publicado — a cliente não o vê."
                            : acto?.acto === "assinou"
                              ? `Assinado por ${acto.nome_escrito} a ${dataHora(acto.criado_em)}.`
                              : acto?.acto === "aceitou"
                                ? `${tipo === "proposta" ? "Aprovado" : "Aceite"} por ${acto.nome_escrito} a ${dataHora(acto.criado_em)}.`
                                : acto?.acto === "pediu_alteracao"
                                  ? `Pediu uma alteração a ${dataHora(acto.criado_em)} — versão ${pub.versao} à espera de resposta.`
                                  : `Publicado a ${dataHora(pub.publicado_em)} · versão ${pub.versao}.`}
                      </p>
                      {/* As palavras DELA têm de chegar aqui inteiras —
                          um pedido de alteração que ninguém lê é um acto
                          surdo. Itálico porque é citação dela. */}
                      {acto?.acto === "pediu_alteracao" && acto.mensagem && (
                        <p
                          style={{
                            fontSize: "12px",
                            lineHeight: 1.6,
                            fontStyle: "italic",
                            color: "var(--charcoal)",
                            margin: "6px 0 0",
                            whiteSpace: "pre-line",
                          }}
                        >
                          {acto.mensagem}
                        </p>
                      )}
                    </div>
                    {!trancado && (
                      <button
                        onClick={() => publicar(tipo)}
                        disabled={aTrabalhar}
                        style={{
                          ...botao,
                          padding: "7px 13px",
                          fontSize: "11.5px",
                          border: "1px solid var(--gold)",
                          backgroundColor: "white",
                          color: "var(--gold-dark)",
                          opacity: aTrabalhar ? 0.6 : 1,
                          cursor: aTrabalhar ? "wait" : "pointer",
                          flexShrink: 0,
                        }}
                      >
                        {pub ? "Publicar versão nova" : "Publicar no acompanhamento"}
                      </button>
                    )}
                  </div>
                );
              })}
              <p
                style={{
                  fontSize: "11px",
                  lineHeight: 1.6,
                  color: "#9B9B9B",
                  margin: "6px 0 0",
                }}
              >
                Publicar uma versão nova reabre a resposta da cliente: o
                aceite vale para a versão que ela viu, não para o documento.
              </p>
            </div>
          )}

          {/* ── OS PEDIDOS DE CÓDIGO ─────────────────────────────────────
              A cliente pediu para ver os valores (ou para assinar). Emitir
              gera o código; o envio é dela para ela — pelo WhatsApp da
              conversa que já existe. A emissão fica no trilho de prova. */}
          {pedidosVivos.length > 0 && (
            <div
              style={{
                marginTop: "18px",
                backgroundColor: "#FEF3E2",
                border: "1px solid #F0D9B5",
                borderRadius: "10px",
                padding: "13px 14px",
              }}
            >
              <p style={{ ...overline, color: "#92400E", marginBottom: "8px" }}>
                {pedidosVivos.length === 1
                  ? "Pedido de código"
                  : `${pedidosVivos.length} pedidos de código`}
              </p>
              {pedidosVivos.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    flexWrap: "wrap",
                    padding: "5px 0",
                  }}
                >
                  <p
                    style={{
                      fontSize: "12px",
                      lineHeight: 1.5,
                      color: "#92400E",
                      margin: 0,
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    {p.contexto && ROTULO_DOCUMENTO[p.contexto]
                      ? `Para abrir o ${ROTULO_DOCUMENTO[p.contexto].toLowerCase()}`
                      : "Para ver os valores"}{" "}
                    · {dataHora(p.pedido_em)}
                  </p>
                  {p.codigo && p.emitido_em ? (
                    <button
                      onClick={() => copiarCodigo(p.id, p.codigo)}
                      style={{
                        ...botao,
                        padding: "7px 13px",
                        fontSize: "13px",
                        letterSpacing: "0.12em",
                        fontVariantNumeric: "tabular-nums",
                        border: "none",
                        backgroundColor:
                          copiadoCodigo === p.id ? "#166534" : "var(--gold)",
                        color: "white",
                        flexShrink: 0,
                      }}
                      title="Copiar, para enviar pela conversa de WhatsApp"
                    >
                      {copiadoCodigo === p.id ? "Copiado" : p.codigo}
                    </button>
                  ) : (
                    <button
                      onClick={() => emitir(p.id)}
                      disabled={aTrabalhar}
                      style={{
                        ...botao,
                        padding: "7px 13px",
                        fontSize: "11.5px",
                        border: "none",
                        backgroundColor: "var(--gold)",
                        color: "white",
                        opacity: aTrabalhar ? 0.6 : 1,
                        cursor: aTrabalhar ? "wait" : "pointer",
                        flexShrink: 0,
                      }}
                    >
                      {aTrabalhar ? "A emitir…" : "Emitir código"}
                    </button>
                  )}
                </div>
              ))}
              <p
                style={{
                  fontSize: "11px",
                  lineHeight: 1.6,
                  color: "#92400E",
                  margin: "8px 0 0",
                }}
              >
                Envie o código pela conversa de WhatsApp que já tem com a
                cliente — é esse passo que confirma que é mesmo ela. Vale 24
                horas.
              </p>
            </div>
          )}

          {/* ── OS PEDIDOS DE ALTERAÇÃO AO QUESTIONÁRIO ─────────────────
              Uma resposta que já tinha fechado, e que ela quer mudar. Nada
              mudou sozinho — o valor está como estava.

              «Tratado» não muda a resposta: mudar a resposta é o briefing,
              e é outro gesto. Isto fecha o pedido e reabre a porta a um
              pedido novo ao mesmo campo — sem isto, a cliente ficava sem
              caminho depois do primeiro. */}
          {pedidosQ.length > 0 && (
            <div
              style={{
                marginTop: "18px",
                backgroundColor: "#FEF3E2",
                border: "1px solid #F0D9B5",
                borderRadius: "10px",
                padding: "13px 14px",
              }}
            >
              <p style={{ ...overline, color: "#92400E", marginBottom: "8px" }}>
                {pedidosQ.length === 1
                  ? "Pedido de alteração ao questionário"
                  : `${pedidosQ.length} pedidos de alteração ao questionário`}
              </p>
              {pedidosQ.map((p) => (
                <div key={p.id} style={{ padding: "7px 0" }}>
                  <p style={{ fontSize: "11px", fontWeight: "600", letterSpacing: "0.04em", textTransform: "uppercase", color: "#92400E", margin: 0 }}>
                    {p.campo_label}
                  </p>
                  <p style={{ fontSize: "12.5px", lineHeight: 1.65, color: "var(--charcoal)", margin: "5px 0 0", whiteSpace: "pre-wrap" }}>
                    {p.pedido}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "7px" }}>
                    <span style={{ fontSize: "11px", color: "#92400E" }}>
                      {dataHora(p.pedido_em)}
                    </span>
                    <button
                      onClick={() => tratarPedido(p.id)}
                      disabled={aTrabalhar}
                      style={{
                        ...botao,
                        padding: "6px 12px",
                        fontSize: "11.5px",
                        border: "1px solid #D9A441",
                        backgroundColor: "white",
                        color: "#92400E",
                        opacity: aTrabalhar ? 0.6 : 1,
                        cursor: aTrabalhar ? "wait" : "pointer",
                      }}
                    >
                      Marcar como tratado
                    </button>
                  </div>
                </div>
              ))}
              <p style={{ fontSize: "11px", lineHeight: 1.6, color: "#92400E", margin: "9px 0 0" }}>
                Marcar como tratado não muda a resposta — muda-se no briefing,
                se ficar acordado. Só fecha o pedido e deixa a cliente voltar a
                pedir se precisar.
              </p>
            </div>
          )}

          {/* ── O CONTRATO ASSINADO EM PAPEL ─────────────────────────────
              A cliente descarregou, assinou à mão, fotografou e carregou.
              O portal prometeu-lhe «confirmamos e avisamos aqui» — é este
              o ecrã que cumpre a promessa. Confirmar deixa acto a sério no
              trilho (o nome que está no papel, quem confirmou, e a
              fotografia) e tranca o contrato, tal como o digital. */}
          {papelPorConfirmar && (
            <div
              style={{
                marginTop: "18px",
                backgroundColor: "#FEF3E2",
                border: "1px solid #F0D9B5",
                borderRadius: "10px",
                padding: "13px 14px",
              }}
            >
              <p style={{ ...overline, color: "#92400E", marginBottom: "8px" }}>
                Contrato assinado em papel
              </p>
              <p
                style={{
                  fontSize: "12px",
                  lineHeight: 1.6,
                  color: "#92400E",
                  margin: "0 0 10px",
                }}
              >
                Carregado a {dataHora(papelPorConfirmar.created_at)}. Veja a
                fotografia, escreva o nome tal como está assinado no papel, e
                confirme.
              </p>

              <button
                onClick={() => verPapel(papelPorConfirmar.dados?.caminho)}
                disabled={!papelPorConfirmar.dados?.caminho}
                style={{
                  ...botao,
                  padding: "7px 13px",
                  fontSize: "12px",
                  border: "1px solid #D9A441",
                  backgroundColor: "white",
                  color: "#92400E",
                  marginBottom: "10px",
                }}
              >
                Ver a fotografia
              </button>

              <input
                type="text"
                value={nomeNoPapel}
                onChange={(e) => setNomeNoPapel(e.target.value)}
                placeholder="Nome tal como está no papel"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "9px 11px",
                  fontSize: "13.5px",
                  fontFamily: "inherit",
                  color: "var(--charcoal, #1A1A1A)",
                  border: "1px solid #F0D9B5",
                  borderRadius: "8px",
                  backgroundColor: "white",
                  outline: "none",
                }}
              />

              <button
                onClick={() => confirmarPapel(papelPorConfirmar.id)}
                disabled={aConfirmarPapel}
                style={{
                  ...botao,
                  marginTop: "9px",
                  border: "none",
                  backgroundColor: "var(--gold)",
                  color: "white",
                  opacity: aConfirmarPapel ? 0.6 : 1,
                  cursor: aConfirmarPapel ? "wait" : "pointer",
                }}
              >
                {aConfirmarPapel ? "A confirmar…" : "Confirmar a assinatura"}
              </button>

              <p
                style={{
                  fontSize: "11px",
                  lineHeight: 1.6,
                  color: "#92400E",
                  margin: "9px 0 0",
                }}
              >
                Depois de confirmar, o contrato fica trancado — nem aqui se
                muda. Se houver um erro, faz-se contrato novo.
              </p>
            </div>
          )}

          <div
            style={{
              marginTop: "20px",
              paddingTop: "16px",
              borderTop: "1px solid var(--hairline, #F0E6D0)",
            }}
          >
            {!aConfirmarFecho ? (
              <button
                onClick={() => setAConfirmarFecho(true)}
                style={{
                  ...botao,
                  border: "1px solid #FECACA",
                  backgroundColor: "white",
                  color: "#B91C1C",
                }}
              >
                Fechar o acompanhamento
              </button>
            ) : (
              // Confirmação NO PRÓPRIO ECRÃ, e a nomear o que fica de pé —
              // nunca window.confirm, e nunca um «tem a certeza?» que não
              // diz o que se perde.
              <div
                style={{
                  backgroundColor: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: "10px",
                  padding: "14px 16px",
                }}
              >
                <p
                  style={{
                    fontSize: "12.5px",
                    lineHeight: 1.65,
                    color: "#B91C1C",
                    margin: 0,
                  }}
                >
                  A ligação que enviou deixa de abrir, e ela passa a ver uma página
                  a dizer que já não está activa. O evento, os documentos e os
                  pagamentos ficam todos — não se apaga nada. Pode voltar a
                  abrir depois, mas a ligação nova é outra e terá de lha enviar
                  de novo.
                </p>
                <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                  <button
                    onClick={revogar}
                    disabled={aTrabalhar}
                    style={{
                      ...botao,
                      border: "none",
                      backgroundColor: "#B91C1C",
                      color: "white",
                      opacity: aTrabalhar ? 0.6 : 1,
                      cursor: aTrabalhar ? "wait" : "pointer",
                    }}
                  >
                    {aTrabalhar ? "A fechar…" : "Fechar mesmo"}
                  </button>
                  <button
                    onClick={() => setAConfirmarFecho(false)}
                    style={{
                      ...botao,
                      border: "1px solid var(--hairline, #F0E6D0)",
                      backgroundColor: "white",
                      color: "var(--gray-mid)",
                    }}
                  >
                    Manter aberto
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {erro && (
        <p
          style={{
            fontSize: "12.5px",
            color: "#B91C1C",
            margin: "14px 0 0",
          }}
        >
          {erro}
        </p>
      )}

      <button
        onClick={onFechar}
        style={{
          ...botao,
          marginTop: "22px",
          width: "100%",
          border: "1px solid var(--hairline, #F0E6D0)",
          backgroundColor: "white",
          color: "var(--gray-mid)",
        }}
      >
        Fechar
      </button>
    </>
  );
}

export default function PortalDoClienteSheet({ evento, aberto, onFechar }) {
  return (
    <AnimatePresence>
      {aberto && evento && (
        <motion.div
          onClick={onFechar}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(26,26,26,0.32)",
            zIndex: 1000,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
            style={{
              backgroundColor: "white",
              width: "100%",
              maxWidth: "520px",
              borderRadius: "16px 16px 0 0",
              padding: "24px 24px 28px",
              boxShadow: "0 -8px 40px rgba(0,0,0,0.15)",
              maxHeight: "88vh",
              overflowY: "auto",
              boxSizing: "border-box",
            }}
          >
            <Conteudo evento={evento} onFechar={onFechar} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
