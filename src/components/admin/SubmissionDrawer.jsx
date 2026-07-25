import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../lib/supabase";
import {
  getValorAtual,
  getResumoSubmissao,
  seccoesDoModelo,
} from "../../lib/submissionFields";
import { iniciarTour, tourJaVista } from "../../lib/tour";
import {
  getTipoEventoLivre,
  precisaClassificacao,
  encontrarModeloPorNome,
  associarModeloAoEvento,
  criarModeloEAssociar,
} from "../../lib/tipoEvento";
import MensagensSheet from "./MensagensSheet";
import { Icone } from "./Navegacao";
import Jornada from "./Jornada";
import { construirEtapas } from "./jornadaEtapas";
import { getPagamentosEvento } from "../../lib/pagamentos";

// ============================================================
// SubmissionDrawer — painel lateral de detalhes de um evento.
// GENÉRICO: gera as secções a partir dos steps do modelo de evento,
// funcionando para Casamento, Aniversário, ou qualquer modelo futuro.
//
// Leitura: mostra só os campos preenchidos, agrupados pelo título do
//   passo (step) a que pertencem. Lê via getValorAtual (colunas antigas
//   OU respostas).
// Edição: mostra todos os campos do modelo; ao guardar, escreve no
//   respostas (JSONB) E, quando o campo tem coluna antiga equivalente,
//   também na coluna — para não partir o Casamento nem os briefings.
//
// Classificação do tipo "Outro": quando o evento não tem modelo mas o
//   cliente escreveu um tipo na captação (respostas.tipoEventoOutro),
//   aparece um banner para associar a um modelo existente ou criar um
//   novo com um clique (ver lib/tipoEvento.js).
//
// Props:
//   selected       — a submissão selecionada (ou null)
//   eventTypes     — lista de modelos de evento
//   onClose()      — fechar o drawer
//   onStatusChange(id, novoStatus)
//   onSaved(submissaoAtualizada) — após guardar edição
//   onGerarDocumento(submissao, "orcamento"|"contrato") — abre o
//     separador Documentos com o documento pré-preenchido deste evento
//   onFormulario(submissao) — abre o painel Novo Formulário apontado
//     a este evento (as respostas atualizam-no, não criam duplicados)
//   onModeloCriado() — após criar um modelo novo via classificação
//     (o AdminPage recarrega os eventTypes)
// ============================================================

const formatData = (d) => {
  if (!d) return "Sem data";
  return new Date(d).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};


export default function SubmissionDrawer({
  selected,
  eventTypes,
  onClose,
  onStatusChange,
  onSaved,
  onGerarDocumento,
  onFormulario,
  onVerFormulario,
  invites = [],
  onNavegar,
  onModeloCriado,
}) {
  const [folhaMensagens, setFolhaMensagens] = useState(false);
  const [pagamentosDoEvento, setPagamentosDoEvento] = useState(null);
  const navigate = useNavigate();

  // Guia interativo — a dica visual (sublinhado + hover) sozinha não
  // estava a ser óbvia o suficiente; isto aponta mesmo para o campo, uma
  // única vez por browser, na primeira vez que a Nádia abre um evento.
  // Dispara depois do slide-in da drawer assentar (mesmo temporizador
  // que o FormPage.jsx usa para a tour do formulário público).
  useEffect(() => {
    if (!selected || tourJaVista("data-evento")) return;
    const temporizador = setTimeout(() => {
      iniciarTour("data-evento", [
        {
          element: "#tour-data-evento",
          popover: {
            title: "A data é editável",
            description:
              "Clica aqui a qualquer momento para corrigir a data deste evento.",
          },
        },
      ]);
    }, 500);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // O plano (pagamentos_previstos) e o que já entrou — só para a
  // Jornada poder dizer a verdade no passo "Sinal": previsto menos
  // recebido, em vez de metade do valor acordado. Guarda o id junto
  // dos dados para se saber de quem eles são; se falhar, fica sem
  // plano e a Jornada cai na estimativa de sempre — nunca vale a pena
  // estragar o drawer por causa disto.
  useEffect(() => {
    const id = selected?.id;
    if (!id) return;
    let cancelado = false;
    getPagamentosEvento(id)
      .then((dados) => !cancelado && setPagamentosDoEvento({ id, ...dados }))
      .catch(() => !cancelado && setPagamentosDoEvento({ id }));
    return () => {
      cancelado = true;
    };
  }, [selected?.id]);

  if (!selected) return <AnimatePresence />;

  // Ao saltar de um evento para outro o pedido novo ainda vem a
  // caminho — os números do anterior não valem para este.
  const planoDoEvento =
    pagamentosDoEvento?.id === selected.id ? pagamentosDoEvento : null;

  const tipo = eventTypes?.find((et) => et.id === selected.event_type_id);
  const seccoes = seccoesDoModelo(tipo);
  // O campo do modelo marcado como "a data do evento" (papel: "data") —
  // se existir, é aqui que o briefing e o formulário completo vão ler a
  // data (via respostas), por isso qualquer edição da data tem de
  // escrever também neste campo, não só na coluna data_evento. Mesmo
  // critério da leitura em getResumoSubmissao: o primeiro encontrado.
  const campoData = seccoes.flatMap((sec) => sec.campos).find((c) => c.papel === "data");
  const resumo = getResumoSubmissao(selected, eventTypes);
  // O tipo "Outro" que o cliente escreveu na captação (fallback de
  // exibição enquanto não é associado a um modelo).
  const tipoLivre = getTipoEventoLivre(selected);

  // O WhatsApp do evento (captação) — a última milha das mensagens:
  // escolher a mensagem-tipo → abre a conversa certa com o texto pronto.
  const numeroWhatsapp =
    getValorAtual(selected, "numeroWhatsapp") ||
    getValorAtual(selected, "contactoPrincipal") ||
    null;
  // Os TRÊS estados do formulário deste evento:
  //   sem convite  → criar (painel Novo Formulário)
  //   pendente     → abrir para PREENCHER (como o ✏ do cartão)
  //   submetido    → nada a abrir (botão desativado, etapa morta)
  const conviteDoEvento = (invites || []).find(
    (i) =>
      i.submission_id === selected.id ||
      i.submission_alvo_id === selected.id,
  );
  const formularioSubmetido = !!(
    conviteDoEvento &&
    (conviteDoEvento.submission_id === selected.id ||
      conviteDoEvento.submission_id)
  );
  const temConvitePendente = !!conviteDoEvento && !formularioSubmetido;
  const abrirFormulario = () => {
    if (formularioSubmetido) return;
    if (temConvitePendente) {
      if (onVerFormulario) onVerFormulario(selected);
    } else if (onFormulario) {
      onFormulario(selected);
    }
  };

  const dadosMensagens = {
    nomeCliente: resumo.titulo,
    tipoEvento:
      (eventTypes?.find((et) => et.id === selected.event_type_id) || {})
        .nome ||
      tipoLivre ||
      "",
    dataEvento: selected.data_evento || resumo.data || "",
    valor: selected.valor_acordado,
  };

  // 3 · O GESTO. Um só, com o nome do que vem a seguir — o mesmo
  // cálculo que alimenta a frase "→ A seguir" da Jornada, para as duas
  // peças nunca discordarem.
  //
  // A excepção que a arquitectura abre: se o próximo passo É o sinal,
  // o botão vive aqui. Os outros levam ao separador da página onde o
  // gesto se faz de verdade — o drawer aponta, não trabalha.
  const gesto = (() => {
    if (selected.fase === "perdido") return null;
    const { atual } = construirEtapas({
      s: selected,
      invites,
      previstos: planoDoEvento?.previstos,
      pagamentos: planoDoEvento?.pagamentos,
    });
    if (!atual) return null;
    const ir = (aba) => () => navigate(`/evento/${selected.id}/${aba}`);
    const porMapa = {
      orcamento: { rotulo: "Preparar orçamento", aba: "documentos" },
      sinal: {
        rotulo: atual.sub
          ? `Registar sinal · ${atual.sub.replace(" por receber", "")}`
          : "Registar sinal",
        aba: "pagamentos",
      },
      projecto: { rotulo: "Criar projecto", aba: "documentos" },
      contrato: { rotulo: "Preparar contrato", aba: "documentos" },
      preparacao: { rotulo: "Preparar o evento", aba: "materiais" },
    }[atual.id];
    if (!porMapa) return null;
    return { rotulo: porMapa.rotulo, accao: ir(porMapa.aba) };
  })();

  const fechar = () => onClose();


  return (
    <AnimatePresence>
      <motion.div
        onClick={fechar}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          backgroundColor: "rgba(0,0,0,0.35)",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
          style={{
            backgroundColor: "white",
            width: "100%",
            maxWidth: "560px", // largo o suficiente para a Jornada respirar
            height: "100%",
            overflowY: "auto",
            padding: "28px 24px",
            boxShadow: "-4px 0 24px rgba(0,0,0,0.1)",
          }}
        >
          {/* Cabeçalho */}
          <div style={{ marginBottom: "24px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "24px",
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: "20px",
                    color: "var(--charcoal)",
                    margin: "0 0 4px 0",
                    fontFamily: "Playfair Display, serif",
                  }}
                >
                  {resumo.titulo}
                </h2>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--gray-mid)",
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <DataEventoEditor
                    key={selected.id}
                    submissao={selected}
                    campoData={campoData}
                    onSaved={onSaved}
                  />
                  {tipo
                    ? ` · ${tipo.nome}`
                    : tipoLivre
                      ? ` · ${tipoLivre} ✳`
                      : ""}
                </p>
              </div>
              <div
                style={{ display: "flex", gap: "8px", alignItems: "center" }}
              >
                <button
                  onClick={fechar}
                  style={{
                    fontSize: "20px",
                    color: "var(--gray-mid)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* ===== A JORNADA — a linha de vida do evento =====
                Também é aqui que o estado (Recebido/Em Preparação/
                Confirmado/Concluído) se edita — nos passos "Preparação"
                e "Grande dia", em vez de num bloco à parte sem ligação
                visual. Vive em Jornada.jsx desde que passou a aparecer
                também no cabeçalho da página do evento. */}
            <Jornada
              submissao={selected}
              invites={invites}
              previstos={planoDoEvento?.previstos}
              pagamentos={planoDoEvento?.pagamentos}
              onStatusChange={onStatusChange}
              onEtapa={(id) => {
                if (id === "orcamento")
                  onGerarDocumento && onGerarDocumento(selected, "orcamento");
                else if (id === "projecto")
                  onGerarDocumento && onGerarDocumento(selected, "proposta");
                else if (id === "contrato")
                  onGerarDocumento && onGerarDocumento(selected, "contrato");
                else if (id === "formulario") abrirFormulario();
                else if (id === "preparacao" && onNavegar) {
                  onClose();
                  onNavegar("operacional");
                }
              }}
            />

            {/* ===== Classificação do tipo "Outro" (quando aplicável) =====
                A única coisa fora dos quatro blocos, e de propósito: um
                evento sem modelo não tem Jornada que se leia nem folha
                que se imprima. Não é trabalho — é uma pergunta que
                bloqueia a leitura, e o drawer é onde se lê.
                key = id do evento: mudar de evento reinicia o estado */}
            {precisaClassificacao(selected) && (
              <ClassificacaoTipo
                key={selected.id}
                submissao={selected}
                eventTypes={eventTypes}
                onSaved={onSaved}
                onModeloCriado={onModeloCriado}
              />
            )}

            {/* 3 · O GESTO — um só, com o nome do que vem a seguir.
                O gesto muda de nome, a estrutura não. */}
            {gesto && (
              <button
                onClick={gesto.accao}
                style={{
                  width: "100%",
                  padding: "13px",
                  marginBottom: "10px",
                  borderRadius: "12px",
                  border: "none",
                  backgroundColor: "var(--gold)",
                  color: "white",
                  fontSize: "13.5px",
                  fontWeight: "600",
                  letterSpacing: "0.01em",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(201,168,76,0.30)",
                }}
              >
                {gesto.rotulo}
              </button>
            )}

            {/* 4 · A SAÍDA — o drawer responde a perguntas, a página faz
                trabalho: daqui vai-se para onde o trabalho se faz. */}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => navigate(`/evento/${selected.id}`)}
                style={{
                  flex: 1,
                  padding: "11px",
                  borderRadius: "12px",
                  border: "1.5px solid var(--gold)",
                  backgroundColor: "white",
                  color: "var(--gold)",
                  fontSize: "13px",
                  fontWeight: "500",
                  cursor: "pointer",
                }}
              >
                Abrir evento →
              </button>
              <button
                onClick={() => setFolhaMensagens(true)}
                title={
                  numeroWhatsapp
                    ? "Escolher uma mensagem e abrir a conversa"
                    : "Sem número de WhatsApp neste evento"
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "11px 14px",
                  borderRadius: "12px",
                  border: "1.5px solid #BBF7D0",
                  backgroundColor: "#F0FDF4",
                  color: "#166534",
                  fontSize: "13px",
                  fontWeight: "500",
                  cursor: "pointer",
                }}
              >
                <Icone nome="mensagens" tamanho={16} />
                WhatsApp
              </button>
            </div>
          </div>


          {/* Folha de mensagens do evento — cada mensagem com Copiar e,
              havendo número, o botão que abre a conversa já escrita */}
          {folhaMensagens && (
            <MensagensSheet
              dados={dadosMensagens}
              whatsapp={numeroWhatsapp}
              onFechar={() => setFolhaMensagens(false)}
            />
          )}

        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ============================================================
// DataEventoEditor — a data do evento no cabeçalho, sempre editável
// aqui, MESMO quando o modelo do tipo de evento não tem um campo de
// data nos seus steps (o modo Editar geral, mais abaixo, só edita
// campos do modelo — ver comentário no topo do ficheiro). Grava
// directo na coluna data_evento, sem depender do modelo.
// key={submissao.id} no local de uso: remonta (e limpa o estado) ao
// trocar de evento.
// ============================================================
function DataEventoEditor({ submissao, campoData, onSaved }) {
  const [aEditar, setAEditar] = useState(false);
  const [valor, setValor] = useState(submissao.data_evento || "");
  const [aGuardar, setAGuardar] = useState(false);

  const guardar = async () => {
    setAGuardar(true);
    // Além da coluna, escreve também no campo do modelo marcado como
    // "papel: data" (se existir) — é dali que o briefing e o
    // formulário completo leem a data; sem isto, ficam presos no
    // valor antigo mesmo depois de corrigida aqui.
    const update = { data_evento: valor || null };
    if (campoData) {
      update.respostas = {
        ...(submissao.respostas || {}),
        [campoData.id]: valor || null,
      };
    }
    const { data, error } = await supabase
      .from("submissions")
      .update(update)
      .eq("id", submissao.id)
      .select()
      .single();
    setAGuardar(false);
    if (error) {
      console.error(error);
      alert("Não foi possível guardar a data. Tenta novamente.");
      return;
    }
    if (onSaved) onSaved({ ...submissao, ...data });
    setAEditar(false);
  };

  if (aEditar) {
    return (
      <span
        style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
      >
        <input
          type="date"
          value={valor || ""}
          onChange={(e) => setValor(e.target.value)}
          disabled={aGuardar}
          autoFocus
          style={{
            fontSize: "12px",
            padding: "3px 6px",
            borderRadius: "6px",
            border: "1.5px solid var(--gold)",
            outline: "none",
            fontFamily: "Inter, sans-serif",
          }}
        />
        <button
          onClick={guardar}
          disabled={aGuardar}
          title="Guardar"
          style={{
            fontSize: "13px",
            color: "#16A34A",
            background: "none",
            border: "none",
            cursor: aGuardar ? "wait" : "pointer",
            padding: "2px",
            lineHeight: 1,
          }}
        >
          ✓
        </button>
        <button
          onClick={() => {
            setValor(submissao.data_evento || "");
            setAEditar(false);
          }}
          disabled={aGuardar}
          title="Cancelar"
          style={{
            fontSize: "13px",
            color: "var(--gray-mid)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px",
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    // O sublinhado pontilhado é o sinal de "isto edita-se" mesmo sem
    // rato por perto (não dá para a Nádia adivinhar só pela cor herdada
    // do texto à volta); o dourado + o lápis a aparecer no hover
    // confirmam a intenção assim que ela se aproxima.
    <motion.button
      id="tour-data-evento"
      onClick={() => setAEditar(true)}
      title="Editar a data do evento"
      initial="rest"
      whileHover="hover"
      whileTap={{ scale: 0.97 }}
      variants={{
        rest: { backgroundColor: "rgba(201,168,76,0)", color: "#6b6b6b" },
        hover: { backgroundColor: "rgba(201,168,76,0.14)", color: "#A07830" },
      }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      style={{
        fontSize: "13px",
        font: "inherit",
        border: "none",
        borderRadius: "6px",
        padding: "2px 6px",
        margin: "-2px 0 -2px -6px",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
      }}
    >
      <span
        style={{
          textDecoration: "underline",
          textDecorationStyle: "dotted",
          textUnderlineOffset: "3px",
        }}
      >
        {formatData(submissao.data_evento)}
      </span>
      <motion.span
        variants={{
          rest: { opacity: 0.5, scale: 0.85 },
          hover: { opacity: 1, scale: 1 },
        }}
        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        style={{ display: "inline-flex" }}
      >
        <Icone nome="lapis" tamanho={12} />
      </motion.span>
    </motion.button>
  );
}

// ============================================================
// ClassificacaoTipo — o banner "Tipo indicado pelo cliente".
// Aparece quando o evento não tem modelo mas o cliente escreveu um
// tipo no "Outro" da captação. Duas saídas:
//   • associar a um modelo existente (dropdown)
//   • criar um modelo novo com esse nome (0 passos) e associar
// Dedup: se já existir um modelo com o mesmo nome (normalizado), o
// dropdown vem pré-seleccionado com ele — nunca se criam duplicados.
// O texto do cliente fica nas respostas como histórico.
// ============================================================
function ClassificacaoTipo({ submissao, eventTypes, onSaved, onModeloCriado }) {
  const texto = getTipoEventoLivre(submissao);
  const match = encontrarModeloPorNome(texto, eventTypes);
  const [modeloId, setModeloId] = useState(match?.id || "");
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState(null);

  if (!texto) return null;

  const guardar = async () => {
    setAGuardar(true);
    setErro(null);
    try {
      let idFinal;
      if (modeloId) {
        await associarModeloAoEvento(submissao.id, modeloId);
        idFinal = modeloId;
      } else {
        const { modelo, jaExistia } = await criarModeloEAssociar(
          texto,
          submissao.id,
          eventTypes,
        );
        idFinal = modelo.id;
        if (!jaExistia && onModeloCriado) onModeloCriado();
      }
      // Merge mínimo no objeto normalizado que o AdminPage já tem
      if (onSaved) onSaved({ ...submissao, event_type_id: idFinal });
    } catch (e) {
      console.error(e);
      setErro("Não foi possível associar. Verifica a ligação e tenta novamente.");
    }
    setAGuardar(false);
  };

  const textoCurto = texto.length > 26 ? `${texto.slice(0, 26)}…` : texto;

  return (
    <div
      style={{
        backgroundColor: "#FBF7EF",
        border: "1px solid var(--gold-light)",
        borderRadius: "12px",
        padding: "12px 14px",
        marginBottom: "14px",
      }}
    >
      <p
        style={{
          fontSize: "10px",
          fontWeight: "600",
          color: "var(--gold-dark)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          margin: "0 0 2px 0",
        }}
      >
        Tipo indicado pelo cliente
      </p>
      <p
        style={{
          fontSize: "14px",
          fontWeight: "600",
          color: "var(--charcoal)",
          margin: "0 0 10px 0",
        }}
      >
        "{texto}"
      </p>
      <div
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <select
          value={modeloId}
          onChange={(e) => setModeloId(e.target.value)}
          style={{
            flex: "1 1 180px",
            minWidth: 0,
            padding: "8px 12px",
            borderRadius: "8px",
            border: "1.5px solid var(--gold-light)",
            fontSize: "12px",
            outline: "none",
            fontFamily: "Inter, sans-serif",
            backgroundColor: "white",
          }}
        >
          <option value="">Associar a um modelo…</option>
          {(eventTypes || []).map((et) => (
            <option key={et.id} value={et.id}>
              {et.nome}
            </option>
          ))}
        </select>
        <button
          onClick={guardar}
          disabled={aGuardar}
          style={{
            flexShrink: 0,
            padding: "8px 14px",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: "600",
            border: "1.5px solid var(--gold)",
            backgroundColor: modeloId ? "var(--gold)" : "white",
            color: modeloId ? "white" : "var(--gold-dark)",
            cursor: aGuardar ? "wait" : "pointer",
            whiteSpace: "nowrap",
            transition: "all 0.15s",
          }}
        >
          {aGuardar
            ? "A associar..."
            : modeloId
              ? "✓ Associar"
              : `＋ Criar modelo "${textoCurto}"`}
        </button>
      </div>
      <p
        style={{
          fontSize: "10px",
          color: "var(--gray-mid)",
          margin: "8px 0 0 0",
        }}
      >
        O modelo novo nasce com 0 passos — completa-o em Modelos de Evento
        quando quiseres.
      </p>
      {erro && (
        <p
          style={{
            fontSize: "11px",
            color: "#DC2626",
            margin: "8px 0 0 0",
          }}
        >
          {erro}
        </p>
      )}
    </div>
  );
}

// Campo de edição genérico — adapta o input ao type do campo.
