import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../lib/supabase";
import { getValorAtual, getResumoSubmissao } from "../../lib/submissionFields";
import { iniciarTour, tourJaVista } from "../../lib/tour";
import { formatarMorada } from "../../lib/morada";
import {
  getTipoEventoLivre,
  precisaClassificacao,
  encontrarModeloPorNome,
  associarModeloAoEvento,
  criarModeloEAssociar,
} from "../../lib/tipoEvento";
import { FASES_POS_SINAL } from "./faseConfig";
import { formatarEuros } from "./orcamentos/orcamentoConfig";
import SeletorPaleta, { AmostraPaleta } from "./SeletorPaleta";
import MensagensSheet from "./MensagensSheet";
import { linkWhatsApp } from "../../lib/mensagens";
import { Icone } from "./Navegacao";
import PagamentosEvento from "./PagamentosEvento";

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

const STATUS_OPTIONS = ["Recebido", "Em Preparação", "Confirmado", "Concluído"];

const STATUS_COLORS = {
  Recebido: { bg: "#FEF9EC", color: "#C9A84C", border: "#E8D5A3" },
  "Em Preparação": { bg: "#EFF6FF", color: "#3B82F6", border: "#BFDBFE" },
  Confirmado: { bg: "#F0FDF4", color: "#22C55E", border: "#BBF7D0" },
  Concluído: { bg: "#F9FAFB", color: "#6B7280", border: "#E5E7EB" },
};

// Mapa campo (camelCase) -> coluna antiga (snake_case). Igual ao de
// submissionFields.js, para sabermos que campos têm coluna equivalente
// e gravar também lá (mantém Casamento/briefings a funcionar).
const FIELD_MAP_INVERSO = {
  nomeNoivo: "nome_noivo",
  nomeNoiva: "nome_noiva",
  contactoPrincipal: "contacto_principal",
  email: "email",
  morada: "morada",
  localEvento: "local_evento",
  numeroConvidados: "numero_convidados",
  horaInicio: "hora_inicio",
  horaTermino: "hora_termino",
  horaMontagem: "hora_montagem",
  horaLimiteMontagem: "hora_limite_montagem",
  horaRecolha: "hora_recolha",
  recolhaDiaSeguinte: "recolha_dia_seguinte",
  nomeResponsavel: "nome_responsavel",
  contactoResponsavel: "contacto_responsavel",
  relacaoResponsavel: "relacao_responsavel",
  estiloEvento: "estilo_evento",
  estiloOutro: "estilo_outro",
  paletaCores: "paleta_cores",
  paletaObservacoes: "paleta_observacoes",
  mesaNoivos: "mesa_noivos",
  cartoesPratos: "cartoes_pratos",
  observacoesCartoes: "observacoes_cartoes",
  descricaoMesaNoivos: "descricao_mesa_noivos",
  cenarioPalco: "cenario_palco",
  descricaoCenario: "descricao_cenario",
  medidasEspaco: "medidas_espaco",
  centrosMesa: "centros_mesa",
  tipoFlores: "tipo_flores",
  numeroMesas: "numero_mesas",
  formatoMesas: "formato_mesas",
  lugaresporMesa: "lugares_por_mesa",
  observacoesMesas: "observacoes_mesas",
  textoPrincipalPlaca: "texto_principal_placa",
  textoSecundarioPlaca: "texto_secundario_placa",
  estiloPlaca: "estilo_placa",
  notasPlaca: "notas_placa",
  moradaExacta: "morada_exacta",
  pessoaAbreEspaco: "pessoa_abre_espaco",
  contactoPessoaAbre: "contacto_pessoa_abre",
  acessoLocal: "acesso_local",
  notasAcesso: "notas_acesso",
  observacoesGerais: "observacoes_gerais",
  dataEvento: "data_evento",
};

// Junta os campos de um modelo, agrupados pelo título do passo.
function seccoesDoModelo(tipo) {
  if (!tipo || !tipo.steps) return [];
  return tipo.steps.map((step) => ({
    titulo: step.title || "Detalhes",
    campos: step.fields || [],
  }));
}

// Formata um valor para leitura (arrays viram lista separada por vírgulas;
// objectos — hoje só a morada — viram a morada composta numa linha).
function formatarValor(v) {
  if (Array.isArray(v)) return v.join(", ");
  if (v && typeof v === "object") return formatarMorada(v);
  return v;
}

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

  if (!selected) return <AnimatePresence />;

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
  // antigas que existirem (via FIELD_MAP_INVERSO).
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
      const coluna = FIELD_MAP_INVERSO[campoId];
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

            {/* ===== A JORNADA — a linha de vida do evento ===== */}
            <Jornada
              submissao={selected}
              invites={invites}
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

          {/* Estado do evento */}
          <div style={{ marginBottom: "28px" }}>
            <p
              style={{
                fontSize: "11px",
                fontWeight: "600",
                color: "var(--gray-mid)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: "10px",
              }}
            >
              Estado do Evento
            </p>
            <div className="filter-wrap">
              <div
                className="h-scroll"
                style={{ gap: "8px", paddingRight: "32px" }}
              >
                {STATUS_OPTIONS.map((status) => {
                  const colors = STATUS_COLORS[status];
                  const isActive = selected.status === status;
                  return (
                    <button
                      key={status}
                      onClick={() => onStatusChange(selected.id, status)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        whiteSpace: "nowrap",
                        border: `1px solid ${colors.border}`,
                        backgroundColor: isActive ? colors.color : colors.bg,
                        color: isActive ? "white" : colors.color,
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                    >
                      {status}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Pagamentos — substitui o antigo botão único "Marcar pagamento
              final recebido": agora é o painel que regista o dinheiro a
              sério. Quando o remanescente fica completo (ou deixa de
              estar, se um pagamento for apagado), sincroniza sozinho a
              coluna pagamento_final — é ela que ainda alimenta o alerta
              do Início, por isso tem de continuar certa. */}
          <PagamentosEvento submissao={selected} onSaved={onSaved} />

          {/* MODO LEITURA — secções geradas do modelo, só campos preenchidos */}
          {!editMode && (
            <>
              {seccoes.map((sec) => {
                // filtra campos com valor
                const camposComValor = sec.campos
                  .map((campo) => ({
                    campo,
                    valor: formatarValor(getValorAtual(selected, campo.id)),
                  }))
                  .filter(
                    ({ valor }) =>
                      valor !== undefined &&
                      valor !== null &&
                      valor !== "" &&
                      !(Array.isArray(valor) && valor.length === 0),
                  );

                if (camposComValor.length === 0) return null;

                return (
                  <div key={sec.titulo} style={{ marginBottom: "24px" }}>
                    <p
                      style={{
                        fontSize: "11px",
                        fontWeight: "600",
                        color: "var(--gold)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        borderBottom: "1px solid var(--gold-light)",
                        paddingBottom: "6px",
                        margin: "0 0 12px 0",
                      }}
                    >
                      {sec.titulo}
                    </p>
                    {camposComValor.map(({ campo, valor }) => (
                      <div key={campo.id} style={{ marginBottom: "10px" }}>
                        <p
                          style={{
                            fontSize: "11px",
                            color: "var(--gray-mid)",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            margin: "0 0 2px 0",
                          }}
                        >
                          {campo.label}
                        </p>
                        {campo.type === "paleta" ? (
                          <AmostraPaleta
                            value={getValorAtual(selected, campo.id)}
                          />
                        ) : (
                          <p
                            style={{
                              fontSize: "14px",
                              color: "var(--charcoal)",
                              margin: 0,
                            }}
                          >
                            {valor}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* Se o modelo não tem secções com dados nenhuns */}
              {seccoes.every((sec) =>
                sec.campos.every((campo) => {
                  const v = getValorAtual(selected, campo.id);
                  return (
                    v === undefined ||
                    v === null ||
                    v === "" ||
                    (Array.isArray(v) && v.length === 0)
                  );
                }),
              ) && (
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--gray-mid)",
                    fontStyle: "italic",
                    textAlign: "center",
                    padding: "20px",
                  }}
                >
                  Este evento ainda não tem detalhes preenchidos.
                </p>
              )}
            </>
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

// ============================================================
// A JORNADA — a linha de vida do evento, do primeiro "olá" ao
// grande dia. Oito etapas derivadas da fase comercial, do estado
// operacional e dos formulários — zero queries novas.
// Três estados: feito (dourado, ✓) · atual (anel dourado) ·
// futuro (cinza). O Formulário é independente da ordem (acende
// quando o cliente responde, seja quando for): ✓ preenchido,
// ◐ criado por preencher, ○ nem criado.
// ============================================================
const FASE_ORDEM_JORNADA = [
  "interessado",
  "orcamento",
  "sinal",
  "cliente",
  "projecto",
  "contrato",
];

function Jornada({ submissao, invites = [], onEtapa }) {
  const s = submissao;
  if (!s) return null;

  // Percurso terminado — sem jornada, só a lápide discreta
  if (s.fase === "perdido") {
    return (
      <div
        style={{
          backgroundColor: "#F9FAFB",
          border: "1px solid #E5E7EB",
          borderRadius: "12px",
          padding: "10px 14px",
          marginBottom: "14px",
          fontSize: "12px",
          color: "var(--gray-mid)",
        }}
      >
        Percurso terminado (perdido) — pode ser recuperado no funil.
      </div>
    );
  }

  const idxFase = FASE_ORDEM_JORNADA.indexOf(s.fase);
  const posSinal = FASES_POS_SINAL.includes(s.fase);
  const valor = Number(s.valor_acordado) || 0;
  const concluido = s.status === "Concluído";
  const emPreparacao =
    ["Em Preparação", "Confirmado"].includes(s.status) || concluido;

  // Formulário: ✓ preenchido · ◐ criado por preencher · ○ nem criado
  const invitesDoEvento = (invites || []).filter(
    (i) => i.submission_id === s.id || i.submission_alvo_id === s.id,
  );
  const formularioFeito = invitesDoEvento.some((i) => i.submission_id);
  const formularioAMeio = !formularioFeito && invitesDoEvento.length > 0;

  const dataCurta = (d) =>
    d
      ? new Date(d).toLocaleDateString("pt-PT", {
          day: "numeric",
          month: "short",
        })
      : null;

  const etapas = [
    {
      id: "interessado",
      rotulo: "Interessada",
      feito: true,
      sub: dataCurta(s.created_at),
    },
    {
      id: "orcamento",
      rotulo: "Orçamento",
      feito: idxFase >= 1,
      sub: valor > 0 ? formatarEuros(valor) : null,
      clicavel: true,
    },
    {
      id: "sinal",
      rotulo: "Sinal",
      feito: posSinal,
      sub:
        !posSinal && s.fase === "sinal" && valor > 0
          ? `${formatarEuros(valor / 2)} por receber`
          : posSinal && valor > 0
            ? formatarEuros(valor / 2)
            : null,
    },
    {
      id: "formulario",
      rotulo: "Formulário",
      feito: formularioFeito,
      aMeio: formularioAMeio,
      // Submetido (✓) = morto; pendente (◐) preenche; ausente (○) cria
      clicavel: !formularioFeito,
    },
    {
      id: "projecto",
      rotulo: "Projecto",
      feito: idxFase >= 4,
      clicavel: true,
    },
    {
      id: "contrato",
      rotulo: "Contrato",
      feito: idxFase >= 5,
      clicavel: true,
    },
    {
      id: "preparacao",
      rotulo: "Preparação",
      feito: emPreparacao,
      clicavel: true,
    },
    {
      id: "grandeDia",
      rotulo: "O grande dia",
      feito: concluido,
      emoji: "🥂",
      sub: dataCurta(s.data_evento),
    },
  ];

  // A etapa ATUAL: a primeira por fazer na cadeia (o Formulário fica
  // de fora — é independente da ordem)
  const atual = etapas.find((e) => e.id !== "formulario" && !e.feito);

  // A frase "→ A seguir" — a app a apontar o próximo gesto
  const proximoGesto = (() => {
    if (!atual) return null;
    if (atual.id === "orcamento") return "enviar o orçamento";
    if (atual.id === "sinal")
      return valor > 0
        ? `registar o sinal (${formatarEuros(valor / 2)})`
        : "registar o sinal";
    if (atual.id === "projecto") return "criar o projecto";
    if (atual.id === "contrato") return "preparar o contrato";
    if (atual.id === "preparacao") return "preparar o evento (Logística)";
    if (atual.id === "grandeDia") return "está tudo pronto — falta o grande dia 🥂";
    return null;
  })();

  return (
    <div
      style={{
        backgroundColor: "#FBF7EF",
        border: "1px solid var(--gold-light)",
        borderRadius: "12px",
        padding: "14px 10px 10px",
        marginBottom: "14px",
      }}
    >
      <p
        style={{
          fontSize: "9px",
          fontWeight: "700",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--gold-dark)",
          margin: "0 4px 12px",
        }}
      >
        A Jornada
      </p>
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        {etapas.map((e, i) => {
          const ehAtual = atual && atual.id === e.id;
          const corBola = e.feito
            ? "var(--gold)"
            : e.aMeio
              ? "#EAD9AC"
              : "#F1EBDD";
          return (
            <div
              key={e.id}
              onClick={e.clicavel && onEtapa ? () => onEtapa(e.id) : undefined}
              title={e.clicavel ? "Abrir" : undefined}
              style={{
                flex: 1,
                textAlign: "center",
                position: "relative",
                cursor: e.clicavel ? "pointer" : "default",
                minWidth: 0,
              }}
            >
              {i < etapas.length - 1 && (
                <div
                  style={{
                    position: "absolute",
                    top: "10px",
                    left: "50%",
                    right: "-50%",
                    height: "2px",
                    backgroundColor: e.feito ? "var(--gold)" : "#E5DCC3",
                  }}
                />
              )}
              <div
                style={{
                  position: "relative",
                  width: ehAtual ? "24px" : "21px",
                  height: ehAtual ? "24px" : "21px",
                  borderRadius: "50%",
                  backgroundColor: ehAtual ? "white" : corBola,
                  border: ehAtual ? "2.5px solid var(--gold)" : "none",
                  boxShadow: ehAtual
                    ? "0 0 0 4px rgba(201,168,76,0.22)"
                    : "none",
                  margin: `${ehAtual ? "-1px" : "0"} auto 5px`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: e.emoji ? "11px" : "10px",
                  color: e.feito ? "white" : "var(--gray-mid)",
                  fontWeight: "700",
                }}
              >
                {e.emoji ? e.emoji : e.feito ? "✓" : ehAtual ? "●" : "○"}
              </div>
              <p
                style={{
                  fontSize: "8.5px",
                  fontWeight: e.feito || ehAtual ? "600" : "400",
                  color: ehAtual
                    ? "var(--gold-dark)"
                    : e.feito
                      ? "var(--charcoal)"
                      : "var(--gray-mid)",
                  margin: "0 2px",
                  lineHeight: 1.25,
                  overflowWrap: "break-word",
                }}
              >
                {e.rotulo}
              </p>
              {e.sub && (
                <p
                  style={{
                    fontSize: "8.5px",
                    color: ehAtual ? "#B45309" : "var(--gray-mid)",
                    fontWeight: ehAtual ? "600" : "400",
                    margin: 0,
                    lineHeight: 1.3,
                  }}
                >
                  {e.sub}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {proximoGesto && (
        <p
          style={{
            fontSize: "11px",
            fontStyle: "italic",
            color: "var(--gold-dark)",
            margin: "10px 4px 0",
          }}
        >
          → A seguir: {proximoGesto}
        </p>
      )}
    </div>
  );
}