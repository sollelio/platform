import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../lib/supabase";
import {
  getValorAtual,
  getResumoSubmissao,
  seccoesDoModelo,
  FIELD_MAP_INVERSO,
} from "../../lib/submissionFields";
import { iniciarTour, tourJaVista } from "../../lib/tour";
import {
  getTipoEventoLivre,
  precisaClassificacao,
  encontrarModeloPorNome,
  associarModeloAoEvento,
  criarModeloEAssociar,
} from "../../lib/tipoEvento";
import SeletorPaleta from "./SeletorPaleta";
import MensagensSheet from "./MensagensSheet";
import { linkWhatsApp } from "../../lib/mensagens";
import { Icone } from "./Navegacao";
import PagamentosEvento from "./PagamentosEvento";
import Jornada from "./Jornada";
import VisaoGeralEvento from "./VisaoGeralEvento";
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

// Mapa campo (camelCase) -> coluna antiga (snake_case), para sabermos
// que campos têm coluna equivalente e gravar também lá (mantém
// Casamento/briefings a funcionar).
//
// É o mapa partilhado de submissionFields.js MAIS uma entrada que só a
// edição precisa: um modelo pode ter um campo com id "dataEvento" sem
// o papel "data", e nesse caso a coluna data_evento tem de ser escrita
// à mesma. Fora daqui, dataEvento não é um campo legado — por isso não
// entra no FIELD_MAP global, onde mudaria o getValorAtual de toda a
// gente.
const FIELD_MAP_EDICAO = { ...FIELD_MAP_INVERSO, dataEvento: "data_evento" };

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
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
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


  // Abre o modo edição, pré-carregando editData com o valor atual de
  // CADA campo do modelo (lido via getValorAtual — colunas ou respostas).
  const abrirEdicao = () => {
    const dados = {};
    for (const sec of seccoes) {
      for (const campo of sec.campos) {
        const v = getValorAtual(selected, campo.id);
        // arrays (checkbox) ficam array; resto fica string
        if (Array.isArray(v)) dados[campo.id] = v;
        else dados[campo.id] = v ?? "";
      }
    }
    setEditData(dados);
    setEditMode(true);
  };

  // Guarda: escreve no respostas (todos os campos) e também nas colunas
  // antigas que existirem (via FIELD_MAP_EDICAO).
  const guardar = async () => {
    setSaving(true);

    // 1) novo respostas = respostas atual + edições (por id de campo)
    const novoRespostas = { ...(selected.respostas || {}) };
    for (const [campoId, valor] of Object.entries(editData)) {
      novoRespostas[campoId] = valor;
    }

    // 2) montar o update: respostas + colunas antigas equivalentes
    const update = { respostas: novoRespostas };
    for (const [campoId, valor] of Object.entries(editData)) {
      const coluna = FIELD_MAP_EDICAO[campoId];
      if (coluna) update[coluna] = valor;
    }

    // 2b) o campo do modelo marcado com "papel: data" É a data do
    // evento, seja qual for o seu id (o modelo pode ter mais do que
    // uma data — entrega, ensaio, etc. — só essa conta).
    if (campoData && campoData.id in editData) {
      update.data_evento = editData[campoData.id] || null;
    }

    const { error } = await supabase
      .from("submissions")
      .update(update)
      .eq("id", selected.id);

    if (!error) {
      const atualizada = { ...selected, ...update };
      if (onSaved) onSaved(atualizada);
      setEditMode(false);
    } else {
      console.error(error);
      alert("Erro ao guardar. Tenta novamente.");
    }
    setSaving(false);
  };

  const fechar = () => {
    setEditMode(false);
    onClose();
  };

  // Estilo partilhado dos botões de documento (outline dourado)
  const btnDocumento = {
    flex: 1,
    padding: "9px 8px",
    borderRadius: "10px",
    fontSize: "12px",
    fontWeight: "500",
    cursor: "pointer",
    transition: "all 0.2s",
    backgroundColor: "white",
    color: "var(--gold)",
    border: "1.5px solid var(--gold)",
    whiteSpace: "nowrap",
  };

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
                {!editMode && (
                  <button
                    onClick={abrirEdicao}
                    style={{
                      padding: "7px 16px",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontWeight: "500",
                      cursor: "pointer",
                      border: "1.5px solid var(--gold)",
                      color: "var(--gold)",
                      backgroundColor: "white",
                      transition: "all 0.2s",
                    }}
                  >
                    ✏️ Editar
                  </button>
                )}
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
                key = id do evento: mudar de evento reinicia o estado */}
            {!editMode && precisaClassificacao(selected) && (
              <ClassificacaoTipo
                key={selected.id}
                submissao={selected}
                eventTypes={eventTypes}
                onSaved={onSaved}
                onModeloCriado={onModeloCriado}
              />
            )}

            {/* A saída: o drawer responde a perguntas, a página faz
                trabalho — daqui vai-se para onde o trabalho se faz. */}
            <button
              onClick={() => navigate(`/evento/${selected.id}`)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "11px",
                marginBottom: "14px",
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

            {/* Ações do evento: briefing em largura total (destaque) +
                grelha 2×2 de formulário e documentos (outline) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px",
              }}
            >
              <button
                onClick={() =>
                  window.open(`/briefing/${selected.id}`, "_blank")
                }
                style={{
                  gridColumn: "1 / -1",
                  padding: "9px 8px",
                  borderRadius: "10px",
                  fontSize: "12px",
                  fontWeight: "500",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  backgroundColor: "var(--gold)",
                  color: "white",
                  border: "none",
                  whiteSpace: "nowrap",
                }}
              >
                📄 Briefing
              </button>
              <button
                onClick={abrirFormulario}
                disabled={formularioSubmetido}
                title={
                  formularioSubmetido
                    ? "O formulário deste evento já foi preenchido"
                    : temConvitePendente
                      ? "Abrir o formulário para preencher"
                      : "Criar o formulário de onboarding deste evento"
                }
                style={
                  formularioSubmetido
                    ? { ...btnDocumento, opacity: 0.45, cursor: "not-allowed" }
                    : btnDocumento
                }
              >
                {formularioSubmetido
                  ? "✓ Formulário preenchido"
                  : temConvitePendente
                    ? "📋 Preencher formulário"
                    : "📋 Formulário"}
              </button>
              <button
                onClick={() =>
                  onGerarDocumento && onGerarDocumento(selected, "proposta")
                }
                style={btnDocumento}
              >
                🎨 Projecto
              </button>
              <button
                onClick={() =>
                  onGerarDocumento && onGerarDocumento(selected, "orcamento")
                }
                style={btnDocumento}
              >
                💰 Orçamento
              </button>
              <button
                onClick={() =>
                  onGerarDocumento && onGerarDocumento(selected, "contrato")
                }
                style={btnDocumento}
              >
                📃 Contrato
              </button>
              <button
                onClick={() => setFolhaMensagens(true)}
                title={
                  linkWhatsApp(numeroWhatsapp)
                    ? "Escolher uma mensagem e abrir no WhatsApp"
                    : "Mensagens-tipo (sem número de WhatsApp neste evento — só copiar)"
                }
                style={{
                  gridColumn: "1 / -1",
                  padding: "9px 8px",
                  borderRadius: "10px",
                  fontSize: "12px",
                  fontWeight: "500",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  backgroundColor: "#F0FDF4",
                  color: "#166534",
                  border: "1.5px solid #BBF7D0",
                  whiteSpace: "nowrap",
                }}
              >
                💬 Enviar por WhatsApp
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

          {/* Pagamentos — substitui o antigo botão único "Marcar pagamento
              final recebido": agora é o painel que regista o dinheiro a
              sério. Quando o remanescente fica completo (ou deixa de
              estar, se um pagamento for apagado), sincroniza sozinho a
              coluna pagamento_final — é ela que ainda alimenta o alerta
              do Início, por isso tem de continuar certa. */}
          <PagamentosEvento submissao={selected} onSaved={onSaved} />

          {/* MODO LEITURA — secções geradas do modelo, só campos
              preenchidos. O mesmo componente serve o separador Visão
              geral da página, lá em mosaico. */}
          {!editMode && (
            <VisaoGeralEvento submissao={selected} seccoes={seccoes} />
          )}

          {/* MODO EDIÇÃO — todos os campos do modelo, gravados no respostas */}
          {editMode && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "20px" }}
            >
              {seccoes.map((sec) => {
                if (sec.campos.length === 0) return null;
                return (
                  <div key={sec.titulo}>
                    <p
                      style={{
                        fontSize: "11px",
                        fontWeight: "600",
                        color: "var(--gold)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        borderBottom: "1px solid var(--gold-light)",
                        paddingBottom: "6px",
                        marginBottom: "12px",
                      }}
                    >
                      {sec.titulo}
                    </p>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                      }}
                    >
                      {sec.campos.map((campo) => (
                        <CampoEdicao
                          key={campo.id}
                          campo={campo}
                          valor={editData[campo.id]}
                          onChange={(v) =>
                            setEditData((prev) => ({ ...prev, [campo.id]: v }))
                          }
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              <div style={{ display: "flex", gap: "10px", paddingTop: "8px" }}>
                <button
                  onClick={() => setEditMode(false)}
                  style={{
                    flex: 1,
                    padding: "11px",
                    borderRadius: "10px",
                    fontSize: "13px",
                    border: "1.5px solid var(--gold-light)",
                    color: "var(--gray-mid)",
                    backgroundColor: "white",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={guardar}
                  disabled={saving}
                  style={{
                    flex: 2,
                    padding: "11px",
                    borderRadius: "10px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: saving ? "not-allowed" : "pointer",
                    backgroundColor: saving
                      ? "var(--gold-light)"
                      : "var(--gold)",
                    color: "white",
                    border: "none",
                    boxShadow: "0 4px 12px rgba(201,168,76,0.3)",
                  }}
                >
                  {saving ? "A guardar..." : "✓ Guardar alterações"}
                </button>
              </div>
            </div>
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
function CampoEdicao({ campo, valor, onChange }) {
  const label = (
    <label
      style={{
        fontSize: "11px",
        color: "var(--gray-mid)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        display: "block",
        marginBottom: "4px",
      }}
    >
      {campo.label}
    </label>
  );

  const inputStyle = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "8px",
    border: "1.5px solid var(--gold-light)",
    fontSize: "13px",
    outline: "none",
    fontFamily: "Inter, sans-serif",
    boxSizing: "border-box",
  };

  // Paleta de cores (catálogo visual clicável)
  if (campo.type === "paleta") {
    return (
      <div>
        {label}
        <SeletorPaleta value={valor} onChange={onChange} compact />
      </div>
    );
  }

  // Morada (endereço partido nas partes que o compõem — ver src/lib/morada.js)
  if (campo.type === "morada") {
    const v = valor && typeof valor === "object" ? valor : {};
    const atualizar = (parte, val) => onChange({ ...v, [parte]: val });
    return (
      <div>
        {label}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", gap: "6px" }}>
            <input
              placeholder="Rua"
              value={v.rua || ""}
              onChange={(e) => atualizar("rua", e.target.value)}
              style={{ ...inputStyle, flex: 2 }}
            />
            <input
              placeholder="Nº porta"
              value={v.numero || ""}
              onChange={(e) => atualizar("numero", e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
          <input
            placeholder="Andar / Fração (opcional)"
            value={v.andar || ""}
            onChange={(e) => atualizar("andar", e.target.value)}
            style={inputStyle}
          />
          <div style={{ display: "flex", gap: "6px" }}>
            <input
              placeholder="Código postal"
              value={v.codigoPostal || ""}
              onChange={(e) => atualizar("codigoPostal", e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <input
              placeholder="Localidade"
              value={v.localidade || ""}
              onChange={(e) => atualizar("localidade", e.target.value)}
              style={{ ...inputStyle, flex: 2 }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Campos de múltipla escolha (checkbox): lista de botões toggle
  if (campo.type === "checkbox" && Array.isArray(campo.options)) {
    const selecionados = Array.isArray(valor) ? valor : [];
    const toggle = (opt) => {
      if (selecionados.includes(opt)) {
        onChange(selecionados.filter((o) => o !== opt));
      } else {
        onChange([...selecionados, opt]);
      }
    };
    return (
      <div>
        {label}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {campo.options.map((opt) => {
            const ativo = selecionados.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  border: `1.5px solid ${ativo ? "var(--gold)" : "var(--gold-light)"}`,
                  backgroundColor: ativo ? "var(--gold)" : "white",
                  color: ativo ? "white" : "var(--gray-mid)",
                  cursor: "pointer",
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Escolha única (radio/select)
  if (
    (campo.type === "radio" || campo.type === "select") &&
    Array.isArray(campo.options)
  ) {
    return (
      <div>
        {label}
        <select
          value={valor || ""}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        >
          <option value="">—</option>
          {campo.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Texto longo
  if (campo.type === "textarea") {
    return (
      <div>
        {label}
        <textarea
          rows={2}
          value={valor || ""}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, resize: "none" }}
        />
      </div>
    );
  }

  // Input simples (text, tel, email, number, date, time...)
  return (
    <div>
      {label}
      <input
        type={campo.type || "text"}
        value={valor || ""}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </div>
  );
}
