import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { supabase } from "../../lib/supabase";
import {
  getCampanha,
  ativarCampanha,
  actualizarMeta,
  actualizarComoContribuir,
  fecharCampanha,
  reabrirCampanha,
  concluirCampanha,
  regenerarToken,
  registarContribuicao,
  apagarContribuicao,
  agruparContribuicoes,
  getIntencoesPendentes,
  anularIntencao,
  INTENCAO_JA_RESOLVIDA,
  INTENCAO_CARIMBADA_SEM_DINHEIRO,
} from "../../lib/campanhas";
import { METODOS_SUGERIDOS } from "../../lib/pagamentos";
import { formatarEuros, formatarDataPT } from "./orcamentos/orcamentoConfig";
import { Esqueleto, useContagemAnimada } from "./acabamento";
import { Icone } from "./Navegacao";

// ============================================================
// ContribuicaoColetiva — o módulo que faz a casa GANHAR dinheiro:
// um evento que a cliente não consegue pagar sozinha é oferecido por
// muitos — família e amigos completam o valor — e a campanha vê-se a
// encher AQUI.
//
// É o único sítio do backoffice onde o registo emocional é apropriado,
// porque é onde ela vê dinheiro a entrar. Por isso o símbolo é uma
// TAÇA DE CHAMPANHE a encher-se de dourado — a imagem da casa (à mesa,
// o brinde, o 🥂 que fecha a Jornada) — e não uma barra de progresso.
// Comedimento na mesma: nada mexe num ecrã parado; o nível sobe com
// mola quando entra dinheiro, e a celebração acontece UMA vez
// (celebrada_em carimba-a).
//
// O dinheiro vive em `pagamentos` (origem='contribuicao'), imputado
// por ordem ao plano — ver lib/campanhas.js. Aqui só se desenha.
// A frase da conclusão é HONESTA: "a meta foi atingida" só vira "está
// oferecido" quando o evento inteiro fica pago.
// ============================================================

const rotuloMini = {
  fontSize: "10px",
  fontWeight: "600",
  color: "#9B9B9B",
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  margin: "0 0 4px",
};

const caixaTexto = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1.5px solid var(--gold-light)",
  fontSize: "13px",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

// ---------- A taça ----------
// Linha fina como os ícones da casa (stroke dourado); o líquido é um
// rectângulo recortado pelo interior do copo, e o nível sobe com mola.
// `faisca` (contador) faz subir três brilhos a cada contribuição;
// `brinde` é a celebração — poeira dourada a subir do bordo.
// Exportada: a página pública /contribuir/:token bebe da mesma taça.
export function Taca({ pct, faisca, brinde, reduzir }) {
  // y do topo do líquido: 74 (vazia) → 34 (ao bordo)
  const nivel = 74 - 40 * Math.max(0, Math.min(1, pct));
  const particulas = brinde ? 10 : 3;

  return (
    <svg width="112" height="140" viewBox="0 0 120 150" aria-hidden>
      <defs>
        <clipPath id="taca-interior">
          <path d="M17 32 C17 59 37 75 60 75 C83 75 103 59 103 32 Z" />
        </clipPath>
        <linearGradient id="taca-ouro" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E8D29A" />
          <stop offset="1" stopColor="#C9A84C" />
        </linearGradient>
      </defs>

      <g clipPath="url(#taca-interior)">
        <motion.rect
          x="15"
          width="90"
          height="90"
          fill="url(#taca-ouro)"
          initial={false}
          animate={{ y: nivel }}
          transition={
            reduzir
              ? { duration: 0 }
              : { type: "spring", stiffness: 55, damping: 15 }
          }
        />
        {/* o reflexo da superfície */}
        <motion.rect
          x="15"
          width="90"
          height="2.5"
          fill="#F3E5BB"
          initial={false}
          animate={{ y: nivel }}
          transition={
            reduzir
              ? { duration: 0 }
              : { type: "spring", stiffness: 55, damping: 15 }
          }
        />
      </g>

      {/* brilhos que sobem quando entra dinheiro (e na celebração) */}
      {faisca > 0 && !reduzir && (
        <g key={faisca}>
          {Array.from({ length: particulas }).map((_, i) => (
            <motion.circle
              key={i}
              cx={30 + ((i * 37) % 60)}
              r={brinde ? 1.5 + (i % 3) * 0.7 : 1.6}
              fill="#E3C878"
              initial={{ cy: Math.max(36, nivel), opacity: 0.9 }}
              animate={{ cy: brinde ? 6 : 18, opacity: 0 }}
              transition={{
                duration: brinde ? 1.6 : 1.1,
                delay: i * 0.07,
                ease: "easeOut",
              }}
            />
          ))}
        </g>
      )}

      {/* o copo: taça larga, pé, base — linha fina dourada */}
      <path
        d="M15 30 C15 60 36 77 60 77 C84 77 105 60 105 30"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M60 77 L60 120"
        stroke="var(--gold)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M40 122 Q60 118 80 122"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------- O módulo ----------
export default function ContribuicaoColetiva({
  submissao,
  previstos = [],
  pagamentos = [],
  faltaEvento = 0,
  onPagamentos,
}) {
  const [campanha, setCampanha] = useState(null);
  const [carregada, setCarregada] = useState(false);
  const [erro, setErro] = useState(null);

  // activação
  const [formAtivar, setFormAtivar] = useState(false);
  const [metaTexto, setMetaTexto] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [comoContribuir, setComoContribuir] = useState("");
  const [aAtivar, setAAtivar] = useState(false);

  // o link
  const [copiado, setCopiado] = useState(false);
  const [aRegenerar, setARegenerar] = useState(false);
  const [editandoComo, setEditandoComo] = useState(false);
  const [comoEdit, setComoEdit] = useState("");

  // registo rápido
  const [formAberto, setFormAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [valor, setValor] = useState("");
  const [metodo, setMetodo] = useState("");
  const [dataContrib, setDataContrib] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [aRegistar, setARegistar] = useState(false);

  // gestão
  const [editandoMeta, setEditandoMeta] = useState(false);
  const [metaEdit, setMetaEdit] = useState("");
  const [aFechar, setAFechar] = useState(false);
  const [grupoParaApagar, setGrupoParaApagar] = useState(null); // chave

  // vida
  const [novoGrupo, setNovoGrupo] = useState(null); // chave com brilho
  const [faisca, setFaisca] = useState(0);
  const [brinde, setBrinde] = useState(false);
  const reduzir = useReducedMotion();

  // intenções (F3): promessas da página pública, à espera dela
  const [intencoes, setIntencoes] = useState([]);
  const [novaIntencao, setNovaIntencao] = useState(null); // id com brilho
  const [confirmando, setConfirmando] = useState(null); // id com o formulário aberto
  const [valorConf, setValorConf] = useState("");
  const [metodoConf, setMetodoConf] = useState("");
  const [dataConf, setDataConf] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [aConfirmar, setAConfirmar] = useState(false);
  const [anulando, setAnulando] = useState(null); // id em confirmação de anular

  useEffect(() => {
    let cancelado = false;
    setCarregada(false);
    setErro(null);
    getCampanha(submissao.id)
      .then((c) => {
        if (cancelado) return;
        setCampanha(c);
        setCarregada(true);
      })
      .catch((e) => {
        if (cancelado) return;
        console.error(e);
        setErro("Não foi possível ler a campanha (a migração 033 já correu?).");
        setCarregada(true);
      });
    return () => {
      cancelado = true;
    };
  }, [submissao.id]);

  // As intenções pendentes — e a chegada em TEMPO REAL: uma promessa
  // que entra enquanto ela está no separador aparece na hora, com o
  // brilho da casa. Cada contribuinte que chega é um acontecimento.
  useEffect(() => {
    const idCampanha = campanha?.id;
    if (!idCampanha || campanha.estado === "fechada") {
      setIntencoes([]);
      return;
    }
    let cancelado = false;
    // Funde em vez de substituir: uma promessa que chegue pelo canal
    // enquanto esta lista vem a caminho seria varrida por ela — e uma
    // promessa perdida é dinheiro que a casa não vai confirmar.
    getIntencoesPendentes(idCampanha)
      .then((lista) => {
        if (cancelado) return;
        setIntencoes((atuais) => {
          const jaVem = new Set(lista.map((i) => i.id));
          const chegadasEntretanto = atuais.filter((i) => !jaVem.has(i.id));
          return [...chegadasEntretanto, ...lista];
        });
      })
      .catch(console.error);

    const canal = supabase
      .channel(`intencoes-${idCampanha}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "campanha_intencoes",
          filter: `campanha_id=eq.${idCampanha}`,
        },
        (payload) => {
          if (payload.new?.estado !== "pendente") return;
          setIntencoes((atuais) =>
            atuais.some((i) => i.id === payload.new.id)
              ? atuais
              : [payload.new, ...atuais],
          );
          setNovaIntencao(payload.new.id);
          setTimeout(() => setNovaIntencao(null), 1300);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "campanha_intencoes",
          filter: `campanha_id=eq.${idCampanha}`,
        },
        (payload) => {
          // Resolvida noutro separador/dispositivo: sai da lista aqui
          // também — era esta cegueira que deixava confirmar a mesma
          // promessa duas vezes.
          if (payload.new?.estado === "pendente") return;
          setIntencoes((atuais) =>
            atuais.filter((i) => i.id !== payload.new?.id),
          );
        },
      )
      .subscribe();

    return () => {
      cancelado = true;
      supabase.removeChannel(canal);
    };
  }, [campanha?.id, campanha?.estado]);

  // Só as contribuições DESTA campanha (042) — a soma por evento fazia
  // uma campanha nova nascer cheia com o dinheiro da anterior.
  const grupos = useMemo(
    () => agruparContribuicoes(pagamentos, campanha?.id || null),
    [pagamentos, campanha?.id],
  );
  const contribuido = useMemo(
    () => Math.round(grupos.reduce((acc, g) => acc + g.total, 0) * 100) / 100,
    [grupos],
  );
  const pessoas = useMemo(() => {
    const nomes = new Set();
    let anonimas = 0;
    for (const g of grupos)
      g.contribuinte ? nomes.add(g.contribuinte.trim().toLowerCase()) : anonimas++;
    return nomes.size + anonimas;
  }, [grupos]);

  const objetivo = campanha ? Number(campanha.objetivo) : 0;
  const pct = objetivo > 0 ? contribuido / objetivo : 0;
  const faltaMeta = Math.max(0, Math.round((objetivo - contribuido) * 100) / 100);
  const contribuidoAnim = useContagemAnimada(contribuido);
  const eventoPago = faltaEvento <= 0;

  // A CONCLUSÃO — quando a meta desta campanha se atinge (as somas já
  // são por campanha, 042 — a herança da campanha anterior morreu).
  // A ANIMAÇÃO só acontece na primeira vez (celebrada_em); a escrita
  // do estado acontece sempre que uma ativa cruza a meta — incluindo
  // uma campanha reaberta que volte a lá chegar.
  useEffect(() => {
    if (!campanha || campanha.estado !== "ativa") return;
    if (objetivo > 0 && contribuido >= objetivo) {
      let cancelado = false;
      let temporizador = null;
      if (!campanha.celebrada_em) {
        setBrinde(true);
        setFaisca((n) => n + 1);
        temporizador = setTimeout(() => setBrinde(false), 2600);
      }
      // O carimbo da PRIMEIRA celebração preserva-se numa reaberta; e
      // a resposta só assenta se este ainda for o evento aberto (a
      // página não remonta ao trocar de :id).
      concluirCampanha(campanha.id, campanha.celebrada_em)
        .then((atualizada) => {
          if (!cancelado) setCampanha(atualizada);
        })
        .catch(console.error);
      return () => {
        cancelado = true;
        if (temporizador) clearTimeout(temporizador);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contribuido, objetivo, campanha?.id, campanha?.estado]);

  // O sinal coberto é facto; avançar a fase é juízo dela — sugere-se,
  // nunca se executa (decisão de 26/07/2026).
  const sinalCoberto = useMemo(() => {
    const sinal = previstos.find((p) => p.ordem === 1);
    if (!sinal) return false;
    const pago = pagamentos
      .filter((p) => p.previsto_id === sinal.id)
      .reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
    return pago >= Number(sinal.valor) - 0.005;
  }, [previstos, pagamentos]);
  const sugerirAvanco =
    sinalCoberto &&
    ["interessado", "orcamento", "contrato", "sinal"].includes(submissao.fase);

  const registar = async () => {
    setErro(null);
    setARegistar(true);
    try {
      const inseridos = await registarContribuicao(
        submissao.id,
        previstos,
        pagamentos,
        { valor, contribuinte: nome, metodo, data: dataContrib },
        null,
        campanha?.id || null,
      );
      if (onPagamentos) onPagamentos([...pagamentos, ...inseridos]);
      const primeira = inseridos[0];
      setNovoGrupo(
        `${primeira.contribuinte || ""}|${primeira.metodo || ""}|${primeira.created_at}`,
      );
      setFaisca((n) => n + 1);
      setTimeout(() => setNovoGrupo(null), 1300);
      setFormAberto(false);
      setNome("");
      setValor("");
      setMetodo("");
    } catch (e) {
      setErro(e.message || "Não foi possível registar. Tenta novamente.");
    }
    setARegistar(false);
  };

  const apagar = async (grupo) => {
    setErro(null);
    try {
      await apagarContribuicao(grupo.ids);
      if (onPagamentos)
        onPagamentos(pagamentos.filter((p) => !grupo.ids.includes(p.id)));
      setGrupoParaApagar(null);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível apagar. Tenta novamente.");
    }
  };

  // Confirmar uma promessa é UM gesto transacional (RPC da 039): a
  // intenção é reclamada com guarda de estado e o dinheiro nasce na
  // mesma transação — dois separadores a confirmar a mesma promessa já
  // não duplicam nada: o segundo apanha INTENCAO_JA_RESOLVIDA e a
  // lista dele atualiza-se.
  const confirmarPromessa = async (intencao) => {
    setErro(null);
    setAConfirmar(true);
    try {
      const inseridos = await registarContribuicao(
        submissao.id,
        previstos,
        pagamentos,
        {
          valor: valorConf,
          contribuinte: intencao.nome,
          metodo: metodoConf,
          data: dataConf,
          notas: intencao.mensagem,
        },
        intencao.id,
        campanha?.id || null,
      );
      if (onPagamentos) onPagamentos([...pagamentos, ...inseridos]);
      const primeira = inseridos[0];
      setNovoGrupo(
        `${primeira.contribuinte || ""}|${primeira.metodo || ""}|${primeira.created_at}`,
      );
      setFaisca((n) => n + 1);
      setTimeout(() => setNovoGrupo(null), 1300);
      setIntencoes((atuais) => atuais.filter((i) => i.id !== intencao.id));
      setConfirmando(null);
      setMetodoConf("");
    } catch (e) {
      if (e.message === INTENCAO_JA_RESOLVIDA) {
        setIntencoes((atuais) => atuais.filter((i) => i.id !== intencao.id));
        setConfirmando(null);
        setErro(
          "Esta promessa já tinha sido confirmada ou anulada noutro separador — nada foi registado em dobro.",
        );
      } else if (e.message === INTENCAO_CARIMBADA_SEM_DINHEIRO) {
        // Meio-estado do fallback pré-039: a promessa ficou carimbada,
        // o dinheiro não — sai da lista (voltar a confirmar daria
        // "já resolvida") e diz-se o que falta fazer.
        setIntencoes((atuais) => atuais.filter((i) => i.id !== intencao.id));
        setConfirmando(null);
        setErro(
          "A promessa ficou carimbada, mas o dinheiro NÃO ficou registado — regista esta contribuição manualmente em «Registar contribuição».",
        );
      } else {
        setErro(e.message || "Não foi possível confirmar. Tenta novamente.");
      }
    }
    setAConfirmar(false);
  };

  const anularPromessa = async (intencao) => {
    setErro(null);
    try {
      await anularIntencao(intencao.id);
      setIntencoes((atuais) => atuais.filter((i) => i.id !== intencao.id));
      setAnulando(null);
    } catch (e) {
      if (e.message === INTENCAO_JA_RESOLVIDA) {
        // Confirmada (ou anulada) noutro separador — sair da lista sem
        // tocar em nada: anular por cima de confirmada punha o
        // histórico a mentir (anulada com confirmada_em preenchido).
        setIntencoes((atuais) => atuais.filter((i) => i.id !== intencao.id));
        setAnulando(null);
        setErro(
          "Esta promessa já tinha sido resolvida noutro separador — nada foi alterado.",
        );
      } else {
        console.error(e);
        setErro("Não foi possível anular. Tenta novamente.");
      }
    }
  };

  const seccao = (conteudo) => (
    <div
      style={{ borderTop: "1px solid #F0E6D0", marginTop: "22px", paddingTop: "20px" }}
    >
      <p
        style={{
          fontSize: "11px",
          fontWeight: "600",
          color: "var(--gray-mid)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          margin: "0 0 12px",
        }}
      >
        Contribuição coletiva
      </p>
      {erro && (
        <p
          style={{
            fontSize: "12.5px",
            color: "#B91C1C",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "10px",
            padding: "10px 14px",
            margin: "0 0 14px",
          }}
        >
          {erro}
        </p>
      )}
      {conteudo}
    </div>
  );

  if (!carregada) return seccao(<Esqueleto h={120} r={14} />);

  // ---------- Adormecida (nunca ativada, ou fechada) ----------
  if (!campanha || campanha.estado === "fechada") {
    const historial = campanha?.estado === "fechada" && contribuido > 0;
    return seccao(
      <div
        style={{
          backgroundColor: "white",
          border: "1px solid #F0E6D0",
          borderRadius: "14px",
          padding: "20px 24px",
        }}
      >
        {!formAtivar ? (
          <div
            style={{ display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap" }}
          >
            <div style={{ flex: "1 1 320px", minWidth: 0 }}>
              <p
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: "16px",
                  margin: "0 0 4px",
                }}
              >
                Quando o evento é um presente de muitos.
              </p>
              <p
                style={{
                  fontSize: "12.5px",
                  color: "var(--gray-mid)",
                  margin: 0,
                  lineHeight: 1.6,
                  textWrap: "pretty",
                }}
              >
                Família e amigos completam o valor, contribuição a
                contribuição — e a campanha vê-se a encher aqui.
                {historial &&
                  ` A última campanha fechou com ${formatarEuros(contribuido)} de ${pessoas} ${pessoas === 1 ? "pessoa" : "pessoas"}.`}
              </p>
            </div>
            <button
              onClick={() => {
                setMetaTexto(
                  String(faltaEvento > 0 ? faltaEvento : Number(submissao.valor_acordado) || ""),
                );
                setFormAtivar(true);
              }}
              className="acao acao--cheia"
              style={{
                padding: "10px 18px",
                borderRadius: "999px",
                fontSize: "13px",
                fontWeight: "600",
                boxShadow: "0 4px 12px rgba(201,168,76,0.30)",
              }}
            >
              Ativar a contribuição coletiva
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: "0 1 160px" }}>
                <label style={rotuloMini}>Meta (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={metaTexto}
                  onChange={(e) => setMetaTexto(e.target.value)}
                  className="caixa-texto"
                  style={caixaTexto}
                  autoFocus
                />
              </div>
              <div style={{ flex: "1 1 260px" }}>
                <label style={rotuloMini}>
                  Mensagem aos convidados (opcional, para a página do link)
                </label>
                <input
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  placeholder="Ex.: Ajudem-nos a oferecer este dia à Ana…"
                  className="caixa-texto"
                  style={caixaTexto}
                />
              </div>
              <div style={{ flex: "1 1 220px" }}>
                <label style={rotuloMini}>
                  Como contribuir (aparece na página)
                </label>
                <input
                  value={comoContribuir}
                  onChange={(e) => setComoContribuir(e.target.value)}
                  placeholder="Ex.: MB Way 912 345 678"
                  className="caixa-texto"
                  style={caixaTexto}
                />
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setFormAtivar(false)}
                  disabled={aAtivar}
                  className="acao acao--neutra"
                  style={{ padding: "8px 14px", borderRadius: "999px", fontSize: "12.5px" }}
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    setErro(null);
                    setAAtivar(true);
                    try {
                      const nova = await ativarCampanha(submissao.id, {
                        objetivo: metaTexto,
                        mensagem,
                        comoContribuir,
                      });
                      setCampanha(nova);
                      setFormAtivar(false);
                      setMensagem("");
                      setComoContribuir("");
                    } catch (e) {
                      setErro(e.message || "Não foi possível ativar.");
                    }
                    setAAtivar(false);
                  }}
                  disabled={aAtivar}
                  className="acao acao--cheia"
                  style={{
                    padding: "8px 16px",
                    borderRadius: "999px",
                    fontSize: "12.5px",
                    fontWeight: "600",
                  }}
                >
                  {aAtivar ? "A ativar…" : "Ativar campanha"}
                </button>
              </div>
            </div>
            <p style={{ fontSize: "11px", color: "#9B9B9B", margin: "10px 0 0" }}>
              A meta vem pré-preenchida com o que falta receber do evento —
              ajusta-a se a campanha for só uma parte. O link partilhável
              nasce com a campanha, pronto a enviar.
            </p>
          </div>
        )}
      </div>,
    );
  }

  // ---------- Viva (ativa ou concluída) ----------
  const concluida = campanha.estado === "concluida";

  return seccao(
    <div
      style={{
        backgroundColor: "white",
        border: `1.5px solid ${concluida ? "var(--gold)" : "#F0E6D0"}`,
        borderRadius: "14px",
        padding: "20px 24px",
      }}
    >
      {/* partilhado pelo registo rápido E pela confirmação de promessas
          — vive ao nível do cartão para existir sempre no DOM */}
      <datalist id="metodos-contribuicao">
        {METODOS_SUGERIDOS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      {/* A frase da conclusão — honesta: meta atingida só é "oferecido"
          quando o evento inteiro ficou pago. */}
      {concluida && (
        <motion.p
          initial={reduzir ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "16px",
            color: "var(--gold-dark)",
            margin: "0 0 16px",
          }}
        >
          {eventoPago
            ? `Está oferecido — ${pessoas} ${pessoas === 1 ? "pessoa fez" : "pessoas fizeram"} este evento. 🥂`
            : `A meta foi atingida — ${pessoas} ${pessoas === 1 ? "pessoa juntou" : "pessoas juntaram"} ${formatarEuros(contribuido)}. Ao evento faltam ainda ${formatarEuros(faltaEvento)}.`}
        </motion.p>
      )}

      <div
        style={{
          display: "flex",
          gap: "28px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {/* a taça */}
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <Taca pct={pct} faisca={faisca} brinde={brinde} reduzir={reduzir} />
          <p
            style={{
              fontSize: "12px",
              fontWeight: "600",
              color: "var(--gold-dark)",
              fontVariantNumeric: "tabular-nums",
              margin: "2px 0 0",
            }}
          >
            {Math.min(100, Math.round(pct * 100))}%
          </p>
        </div>

        {/* os números */}
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <p style={rotuloMini}>Contribuído</p>
          <p
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "30px",
              fontWeight: "400",
              lineHeight: 1,
              color: "var(--gold-dark)",
              fontVariantNumeric: "tabular-nums",
              margin: "0 0 6px",
            }}
          >
            {formatarEuros(contribuidoAnim)}
          </p>
          {editandoMeta ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <input
                type="number"
                step="0.01"
                value={metaEdit}
                onChange={(e) => setMetaEdit(e.target.value)}
                autoFocus
                className="caixa-texto"
                style={{ ...caixaTexto, width: "110px", padding: "4px 8px", fontSize: "12px" }}
              />
              <button
                onClick={async () => {
                  setErro(null);
                  try {
                    let atualizada = await actualizarMeta(
                      campanha.id,
                      metaEdit,
                    );
                    // Subir a meta acima do contribuído numa campanha
                    // CONCLUÍDA reabre-a — é o gesto explícito de
                    // "ainda não acabou" (decisão da Fase 1). A
                    // celebração não repete (celebrada_em fica), e o
                    // índice "uma ativa por evento" protege contra
                    // reabrir com outra campanha ativa ao lado.
                    if (
                      atualizada.estado === "concluida" &&
                      Number(atualizada.objetivo) > contribuido
                    ) {
                      atualizada = await reabrirCampanha(campanha.id);
                    }
                    setCampanha(atualizada);
                    setEditandoMeta(false);
                  } catch (e) {
                    console.error(e);
                    if (e?.code === "23505") {
                      // A reabertura falhou (há outra ativa) mas a meta
                      // JÁ tinha subido — repõe-se, senão a concluída
                      // ficava a afirmar uma meta que não atingiu.
                      try {
                        await actualizarMeta(campanha.id, campanha.objetivo);
                      } catch (e2) {
                        console.error("Reversão da meta falhou:", e2);
                      }
                      setErro(
                        "Já existe outra campanha ativa deste evento — fecha essa primeiro. A meta voltou ao valor anterior.",
                      );
                    } else {
                      setErro(e.message || "Meta inválida.");
                    }
                  }
                }}
                title="Guardar meta"
                className="icone-botao"
                style={{ color: "#16A34A", fontSize: "13px", padding: "2px 5px" }}
              >
                ✓
              </button>
              <button
                onClick={() => setEditandoMeta(false)}
                title="Cancelar"
                className="icone-botao"
                style={{ color: "var(--gray-mid)", fontSize: "13px", padding: "2px 5px" }}
              >
                ✕
              </button>
            </span>
          ) : (
            <button
              onClick={() => {
                setMetaEdit(String(objetivo));
                setEditandoMeta(true);
              }}
              title="Ajustar a meta"
              className="campo-editavel"
              style={{ fontSize: "12.5px", color: "var(--gray-mid)", font: "inherit" }}
            >
              da meta de{" "}
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatarEuros(objetivo)}
              </span>
            </button>
          )}
          <p style={{ fontSize: "12.5px", color: "var(--gray-mid)", margin: "6px 0 0" }}>
            {pessoas === 0
              ? "ainda ninguém contribuiu"
              : `${pessoas} ${pessoas === 1 ? "pessoa" : "pessoas"}`}
            {!concluida &&
              faltaMeta > 0 &&
              ` · faltam ${formatarEuros(faltaMeta)} para a meta`}
          </p>
          {sugerirAvanco && (
            <p
              style={{
                fontSize: "11.5px",
                fontStyle: "italic",
                color: "var(--gold-dark)",
                margin: "8px 0 0",
              }}
            >
              O sinal está coberto — a sugestão de avanço, aqui em cima
              na página, avança a fase quando confirmares.
            </p>
          )}
        </div>

        {/* as acções */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "10px",
            flexShrink: 0,
          }}
        >
          {!concluida && !formAberto && (
            <button
              onClick={() => setFormAberto(true)}
              className="acao acao--cheia"
              style={{
                padding: "9px 16px",
                borderRadius: "999px",
                fontSize: "12.5px",
                fontWeight: "600",
                boxShadow: "0 4px 12px rgba(201,168,76,0.30)",
              }}
            >
              ＋ Registar contribuição
            </button>
          )}
          {aFechar ? (
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "11.5px", color: "var(--gray-mid)" }}>
                {intencoes.length > 0
                  ? intencoes.length === 1
                    ? "Fechar? A promessa por confirmar será anulada."
                    : `Fechar? As ${intencoes.length} promessas por confirmar serão anuladas.`
                  : "Fechar a campanha?"}
              </span>
              <button
                onClick={() => setAFechar(false)}
                className="ligacao"
                style={{ fontSize: "11.5px", color: "var(--gray-mid)" }}
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  setErro(null);
                  try {
                    setCampanha(await fecharCampanha(campanha.id));
                    // fecharCampanha anulou as pendentes em lote — a
                    // lista local acompanha.
                    setIntencoes([]);
                    setAFechar(false);
                  } catch (e) {
                    console.error(e);
                    setErro("Não foi possível fechar. Tenta novamente.");
                  }
                }}
                className="ligacao"
                style={{ fontSize: "11.5px", color: "#B91C1C" }}
              >
                Fechar
              </button>
            </span>
          ) : (
            <button
              onClick={() => setAFechar(true)}
              className="ligacao"
              style={{ fontSize: "11.5px", color: "#9B9B9B" }}
            >
              {concluida ? "Arquivar campanha" : "Fechar campanha"}
            </button>
          )}
        </div>
      </div>

      {/* O LINK — nasceu com a campanha (F1); agora tem destino. Copiar,
          enviar por WhatsApp, e revogar: gerar novo mata o antigo. */}
      <div
        style={{
          marginTop: "16px",
          padding: "12px 14px",
          backgroundColor: "#FBF7EF",
          border: "1px solid var(--gold-light)",
          borderRadius: "10px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <span style={{ ...rotuloMini, margin: 0, color: "var(--gold-dark)" }}>
            Link para partilhar
          </span>
          <span
            style={{
              fontSize: "12px",
              color: "var(--gray-mid)",
              fontVariantNumeric: "tabular-nums",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
              flex: "1 1 140px",
            }}
            title={`${window.location.origin}/contribuir/${campanha.token}`}
          >
            {`${window.location.host}/contribuir/${campanha.token.slice(0, 10)}…`}
          </span>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  `${window.location.origin}/contribuir/${campanha.token}`,
                );
                setCopiado(true);
                setTimeout(() => setCopiado(false), 1600);
              } catch (e) {
                console.error(e);
                setErro("Não foi possível copiar. Tenta novamente.");
              }
            }}
            className="acao acao--ouro"
            style={{ padding: "6px 12px", borderRadius: "999px", fontSize: "11.5px", fontWeight: "600" }}
          >
            {copiado ? "✓ Copiado" : "Copiar"}
          </button>
          <button
            onClick={() => {
              const url = `${window.location.origin}/contribuir/${campanha.token}`;
              const texto = campanha.mensagem
                ? `${campanha.mensagem}\n${url}`
                : url;
              window.open(
                `https://wa.me/?text=${encodeURIComponent(texto)}`,
                "_blank",
              );
            }}
            className="acao acao--verde"
            style={{ padding: "6px 12px", borderRadius: "999px", fontSize: "11.5px", fontWeight: "600" }}
          >
            WhatsApp
          </button>
          {aRegenerar ? (
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "11.5px", color: "var(--gray-mid)" }}>
                O link antigo deixa de funcionar.
              </span>
              <button
                onClick={() => setARegenerar(false)}
                className="ligacao"
                style={{ fontSize: "11.5px", color: "var(--gray-mid)" }}
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  setErro(null);
                  try {
                    setCampanha(await regenerarToken(campanha.id));
                    setARegenerar(false);
                  } catch (e) {
                    console.error(e);
                    setErro("Não foi possível gerar novo link.");
                  }
                }}
                className="ligacao"
                style={{ fontSize: "11.5px", color: "#B91C1C" }}
              >
                Gerar novo
              </button>
            </span>
          ) : (
            <button
              onClick={() => setARegenerar(true)}
              title="Revogar o link atual e gerar outro"
              className="ligacao"
              style={{ fontSize: "11.5px", color: "#9B9B9B" }}
            >
              Gerar novo link
            </button>
          )}
        </div>

        {/* como contribuir — a instrução prática da página pública */}
        <div style={{ marginTop: "8px" }}>
          {editandoComo ? (
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                value={comoEdit}
                onChange={(e) => setComoEdit(e.target.value)}
                placeholder="Ex.: MB Way 912 345 678 · IBAN PT50…"
                autoFocus
                className="caixa-texto"
                style={{ ...caixaTexto, flex: 1, padding: "5px 8px", fontSize: "12px" }}
              />
              <button
                onClick={async () => {
                  setErro(null);
                  try {
                    setCampanha(
                      await actualizarComoContribuir(campanha.id, comoEdit),
                    );
                    setEditandoComo(false);
                  } catch (e) {
                    console.error(e);
                    setErro("Não foi possível guardar.");
                  }
                }}
                title="Guardar"
                className="icone-botao"
                style={{ color: "#16A34A", fontSize: "13px", padding: "2px 5px" }}
              >
                ✓
              </button>
              <button
                onClick={() => setEditandoComo(false)}
                title="Cancelar"
                className="icone-botao"
                style={{ color: "var(--gray-mid)", fontSize: "13px", padding: "2px 5px" }}
              >
                ✕
              </button>
            </span>
          ) : (
            <button
              onClick={() => {
                setComoEdit(campanha.como_contribuir || "");
                setEditandoComo(true);
              }}
              title="Editar — aparece na página do link"
              className="campo-editavel"
              style={{ fontSize: "12px", color: "var(--gray-mid)", font: "inherit", textAlign: "left" }}
            >
              {campanha.como_contribuir
                ? `Como contribuir · ${campanha.como_contribuir}`
                : "Definir como contribuir (MB Way, IBAN — aparece na página)"}
            </button>
          )}
        </div>
      </div>

      {/* À ESPERA DE CONFIRMAÇÃO — as promessas da página pública.
          Chegam em tempo real (canal da 035) e cada confirmação é o
          pequeno acontecimento: vira dinheiro, sobe a taça, senta-se
          à mesa. */}
      {intencoes.length > 0 && (
        <div style={{ marginTop: "16px" }}>
          <p style={{ ...rotuloMini, margin: "0 0 6px", color: "var(--gold-dark)" }}>
            À espera de confirmação · {intencoes.length}
          </p>
          {intencoes.map((intencao) => (
            <div
              key={intencao.id}
              className={intencao.id === novaIntencao ? "linha-nova" : undefined}
              style={{ borderTop: "1px solid #F1EAD6", padding: "8px 4px" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontWeight: "600", color: "var(--charcoal)", fontSize: "12.5px" }}>
                    {intencao.nome}
                  </span>{" "}
                  <span style={{ color: "var(--gray-mid)", fontSize: "11.5px" }}>
                    · prometeu{" "}
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatarEuros(intencao.valor)}
                    </span>
                    {intencao.created_at
                      ? ` · ${formatarDataPT(intencao.created_at.slice(0, 10))}`
                      : ""}
                  </span>
                  {intencao.mensagem && (
                    <p
                      style={{
                        fontSize: "11.5px",
                        fontStyle: "italic",
                        color: "var(--gray-mid)",
                        margin: "2px 0 0",
                        textWrap: "pretty",
                      }}
                    >
                      «{intencao.mensagem}»
                    </p>
                  )}
                </div>
                {confirmando !== intencao.id &&
                  (anulando === intencao.id ? (
                    <span style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                      <span style={{ fontSize: "11.5px", color: "var(--gray-mid)" }}>
                        Anular?
                      </span>
                      <button
                        onClick={() => setAnulando(null)}
                        className="ligacao"
                        style={{ fontSize: "11.5px", color: "var(--gray-mid)" }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => anularPromessa(intencao)}
                        className="ligacao"
                        style={{ fontSize: "11.5px", color: "#B91C1C" }}
                      >
                        Anular
                      </button>
                    </span>
                  ) : (
                    <span style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                      <button
                        onClick={() => {
                          setConfirmando(intencao.id);
                          setValorConf(String(intencao.valor));
                          setMetodoConf("");
                          setDataConf(new Date().toISOString().slice(0, 10));
                        }}
                        className="acao acao--ouro"
                        style={{
                          padding: "5px 12px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: "600",
                        }}
                      >
                        Chegou — confirmar
                      </button>
                      <button
                        onClick={() => setAnulando(intencao.id)}
                        className="ligacao"
                        style={{ fontSize: "11.5px", color: "#9B9B9B" }}
                      >
                        Anular
                      </button>
                    </span>
                  ))}
              </div>

              {confirmando === intencao.id && (
                <div
                  style={{
                    backgroundColor: "#FBF7EF",
                    border: "1px solid var(--gold-light)",
                    borderRadius: "10px",
                    padding: "12px",
                    marginTop: "8px",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: "10px",
                    alignItems: "end",
                  }}
                >
                  <div>
                    <label style={rotuloMini}>Valor que chegou (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={valorConf}
                      onChange={(e) => setValorConf(e.target.value)}
                      autoFocus
                      className="caixa-texto"
                      style={caixaTexto}
                    />
                  </div>
                  <div>
                    <label style={rotuloMini}>Método</label>
                    <input
                      list="metodos-contribuicao"
                      value={metodoConf}
                      onChange={(e) => setMetodoConf(e.target.value)}
                      placeholder="MB Way, Transferência…"
                      className="caixa-texto"
                      style={caixaTexto}
                    />
                  </div>
                  <div>
                    <label style={rotuloMini}>Data</label>
                    <input
                      type="date"
                      value={dataConf}
                      onChange={(e) => setDataConf(e.target.value)}
                      className="caixa-texto"
                      style={caixaTexto}
                    />
                  </div>
                  <div
                    style={{
                      gridColumn: "1 / -1",
                      display: "flex",
                      gap: "8px",
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      onClick={() => setConfirmando(null)}
                      disabled={aConfirmar}
                      className="acao acao--neutra"
                      style={{ padding: "6px 12px", borderRadius: "999px", fontSize: "12px" }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => confirmarPromessa(intencao)}
                      disabled={aConfirmar}
                      className="acao acao--cheia"
                      style={{
                        padding: "6px 12px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: "600",
                      }}
                    >
                      {aConfirmar ? "A confirmar…" : "Confirmar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* registo rápido */}
      {formAberto && !concluida && (
        <div
          style={{
            backgroundColor: "#FBF7EF",
            border: "1px solid var(--gold-light)",
            borderRadius: "10px",
            padding: "14px",
            marginTop: "16px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "10px",
            alignItems: "end",
          }}
        >
          <div>
            <label style={rotuloMini}>Quem contribuiu (opcional)</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Tia Manuela"
              autoFocus
              className="caixa-texto"
              style={caixaTexto}
            />
          </div>
          <div>
            <label style={rotuloMini}>Valor (€)</label>
            <input
              type="number"
              step="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="caixa-texto"
              style={caixaTexto}
            />
          </div>
          <div>
            <label style={rotuloMini}>Método</label>
            <input
              list="metodos-contribuicao"
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
              placeholder="MB Way, Transferência…"
              className="caixa-texto"
              style={caixaTexto}
            />
          </div>
          <div>
            <label style={rotuloMini}>Data</label>
            <input
              type="date"
              value={dataContrib}
              onChange={(e) => setDataContrib(e.target.value)}
              className="caixa-texto"
              style={caixaTexto}
            />
          </div>
          <div
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              gap: "8px",
              justifyContent: "flex-end",
            }}
          >
            <button
              onClick={() => setFormAberto(false)}
              disabled={aRegistar}
              className="acao acao--neutra"
              style={{ padding: "7px 14px", borderRadius: "999px", fontSize: "12px" }}
            >
              Cancelar
            </button>
            <button
              onClick={registar}
              disabled={aRegistar}
              className="acao acao--cheia"
              style={{
                padding: "7px 14px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: "600",
              }}
            >
              {aRegistar ? "A registar…" : "Registar"}
            </button>
          </div>
        </div>
      )}

      {/* a mesa — quem já contribuiu */}
      {grupos.length > 0 && (
        <div style={{ marginTop: "16px" }}>
          <p style={{ ...rotuloMini, margin: "0 0 6px" }}>A mesa</p>
          {grupos.map((g) => (
            <div
              key={g.chave}
              className={g.chave === novoGrupo ? "linha-nova" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 4px",
                borderTop: "1px solid #F1EAD6",
                fontSize: "12.5px",
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <span style={{ fontWeight: "600", color: "var(--charcoal)" }}>
                  {g.contribuinte || "Anónimo"}
                </span>{" "}
                <span style={{ color: "var(--gray-mid)", fontSize: "11.5px" }}>
                  · {g.metodo}
                  {g.data ? ` · ${formatarDataPT(g.data)}` : ""}
                </span>
              </div>
              <span
                style={{
                  fontWeight: "600",
                  color: "var(--gold-dark)",
                  fontVariantNumeric: "tabular-nums",
                  flexShrink: 0,
                }}
              >
                {formatarEuros(g.total)}
              </span>
              {grupoParaApagar === g.chave ? (
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: "11.5px", color: "var(--gray-mid)" }}>
                    Apagar?
                  </span>
                  <button
                    onClick={() => setGrupoParaApagar(null)}
                    className="ligacao"
                    style={{ fontSize: "11.5px", color: "var(--gray-mid)" }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => apagar(g)}
                    className="ligacao"
                    style={{ fontSize: "11.5px", color: "#B91C1C" }}
                  >
                    Apagar
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setGrupoParaApagar(g.chave)}
                  title="Apagar esta contribuição"
                  className="icone-botao icone-botao--perigo"
                  style={{ color: "#B91C1C", padding: "4px 6px", flexShrink: 0 }}
                >
                  <Icone nome="lixo" tamanho={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {grupos.length === 0 && !formAberto && !concluida && (
        <p
          style={{
            fontSize: "12px",
            color: "#9B9B9B",
            fontStyle: "italic",
            margin: "14px 0 0",
          }}
        >
          Ainda ninguém contribuiu — regista a primeira quando chegar, e vê a
          taça começar a encher.
        </p>
      )}
    </div>,
  );
}
