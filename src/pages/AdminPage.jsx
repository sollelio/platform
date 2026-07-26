import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { createInvite, getEventTypes } from "../lib/invites";
import { validateField } from "../lib/validation";
import {
  normalizeSubmission,
  getValorAtual,
  getResumoSubmissao,
} from "../lib/submissionFields";
import { getDadosParaDocumento, updateStatus } from "../lib/clientes";
import EventTypesTab from "../components/admin/EventTypesTab";
import CampoSeletor from "../components/admin/CampoSeletor";
import SubmissionDrawer from "../components/admin/SubmissionDrawer";
import DashboardTab from "../components/admin/DashboardTab";
import ClientesLista from "../components/admin/ClientesLista";
import AvisosBloqueantes from "../components/admin/AvisosBloqueantes";
import DeleteInviteModal from "../components/admin/DeleteInviteModal";
import ShareSheet from "../components/admin/ShareSheet";
import CalendarioTab from "../components/admin/CalendarioTab";
import OperacionalTab from "../components/admin/OperacionalTab";
import DocumentosTab from "../components/admin/orcamentos/DocumentosTab";
import DocumentosLista from "../components/admin/DocumentosLista";
import InviteDetailModal from "../components/admin/InviteDetailModal";
import InviteCreatedModal from "../components/admin/InviteCreatedModal";
import InvitesList from "../components/admin/InvitesList";
import InicioTab from "../components/admin/InicioTab";
import MensagensTab from "../components/admin/MensagensTab";
import ImportarTab from "../components/admin/ImportarTab";
import {
  SidebarNav,
  BottomNavMovel,
  SheetMais,
  Icone,
  BadgeNaoLidas,
} from "../components/admin/Navegacao";
import PainelNotificacoes, {
  ToastNotificacao,
} from "../components/admin/CentroNotificacoes";
import { useNotificacoes } from "../lib/notificacoes";
import { getReservas } from "../lib/reservas";
import FormField from "../components/form/FormField";
import { motion, AnimatePresence } from "framer-motion";

// Gera um título legível para um formulário (ex: "André & Andreia").
// Delega no getResumoSubmissao (a lógica genérica com papéis), construindo
// uma "fonte" a partir da submissão real (se o convite já foi preenchido)
// ou do que a irmã pré-preencheu no convite. Só acrescenta o código do
// convite quando não há título real, para o card ter sempre um id útil.
// Os dados que a captação já recolheu sobre o evento-alvo — para a
// Nádia consultar e COPIAR enquanto compõe o formulário (em vez de
// o cliente ver um cartão na página pública, que ela dispensou).
function DadosCaptacao({ submissao }) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(null);
  if (!submissao) return null;
  const r = submissao.respostas || {};
  const linhas = [
    ["Nome", r.nomeDoCliente || r.nomeResponsavel],
    ["Tipo de evento (outro)", r.tipoEventoOutro],
    ["WhatsApp", r.numeroWhatsapp],
    ["Contacto", r.contactoPrincipal],
    ["Data do evento", submissao.data_evento || r.dataEvento],
    [
      "Nº convidados",
      submissao.numero_convidados ?? r.numeroConvidados ?? null,
    ],
    ["Local", r.localEvento],
    ["Espaço", r.tipoLocal],
    [
      "Serviços",
      [
        ...(Array.isArray(r.servicos) ? r.servicos : []),
        ...(Array.isArray(r.servicosBuffet) ? r.servicosBuffet : []),
        ...(Array.isArray(r.servicosBalcao) ? r.servicosBalcao : []),
      ].join(", ") || null,
    ],
    ["Notas da conversa", r.mensagemInicial || r.maisDetalhes || null],
  ].filter(([, v]) => v !== null && v !== undefined && `${v}`.trim() !== "");
  if (linhas.length === 0) return null;

  const copiar = async (rotulo, valor) => {
    try {
      await navigator.clipboard.writeText(`${valor}`);
      setCopiado(rotulo);
      setTimeout(() => setCopiado(null), 1600);
    } catch {
      /* clipboard indisponível — sem drama */
    }
  };

  return (
    <div style={{ marginTop: "10px" }}>
      <button
        onClick={() => setAberto(!aberto)}
        style={{
          border: "none",
          background: "none",
          cursor: "pointer",
          fontSize: "11px",
          fontWeight: "600",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--gold-dark)",
          padding: 0,
        }}
      >
        {aberto ? "▾" : "▸"} Dados da captação ({linhas.length})
      </button>
      {aberto && (
        <div
          style={{
            marginTop: "8px",
            borderTop: "1px solid var(--gold-light)",
            paddingTop: "8px",
          }}
        >
          {linhas.map(([rotulo, valor]) => (
            <div
              key={rotulo}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                padding: "4px 0",
              }}
            >
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--charcoal)",
                  minWidth: 0,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: "var(--gray-mid)" }}>{rotulo}: </span>
                {`${valor}`}
              </span>
              <button
                onClick={() => copiar(rotulo, valor)}
                style={{
                  flexShrink: 0,
                  border: "1px solid var(--gold-light)",
                  backgroundColor: "white",
                  borderRadius: "999px",
                  padding: "3px 10px",
                  fontSize: "11px",
                  color:
                    copiado === rotulo ? "#166534" : "var(--gold-dark)",
                  cursor: "pointer",
                }}
              >
                {copiado === rotulo ? "✓ Copiado" : "Copiar"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getTituloConvite(invite, submissions, eventTypes) {
  let fonte = null;
  if (invite?.submission_id && submissions) {
    fonte = submissions.find((s) => s.id === invite.submission_id) || null;
  }
  // Convite AINDA por preencher mas apontado a um evento (onboarding):
  // o nome vem do evento-alvo — senão o cartão fica "Casamento · CÓDIGO"
  // e ninguém sabe de quem é o formulário.
  if (!fonte && invite?.submission_alvo_id && submissions) {
    fonte =
      submissions.find((s) => s.id === invite.submission_alvo_id) || null;
  }
  if (!fonte) {
    fonte = {
      event_type_id: invite?.event_type_id,
      respostas: invite?.respostas || {},
    };
  }

  const resumo = getResumoSubmissao(fonte, eventTypes);
  const tipo = eventTypes?.find((et) => et.id === invite?.event_type_id);

  // Se caiu no genérico (título === nome do tipo, ou "Evento" sem tipo),
  // usa nome do tipo + código do convite como identificador.
  const caiuNoGenerico = tipo && resumo.titulo === tipo.nome;
  const semTitulo = !tipo && resumo.titulo === "Evento";
  if (caiuNoGenerico || semTitulo) {
    return tipo
      ? `${tipo.nome} · ${invite.code}`
      : invite?.code || "Formulário sem nome";
  }
  return resumo.titulo;
}

// Junta os campos de todos os passos de um tipo de evento numa única
// lista, guardando também o título do passo a que cada um pertence
// (usado no Painel de Novo Formulário, para a irmã escolher campos)
function getAllFields(tipo) {
  if (!tipo || !tipo.steps) return [];
  return tipo.steps.flatMap((step) =>
    (step.fields || []).map((f) => ({ ...f, stepTitle: step.title })),
  );
}

// Todos os tipos de evento arrancam vazios no Painel de Novo Formulário,
// sem excepções — nem o Casamento tem campos por defeito. A irmã
// escolhe sempre o que quer pelo campo de busca.
function getDefaultCampos(tipo) {
  return [];
}

// A partir do estado do painel, devolve a informação completa (label,
// tipo, validações...) de cada campo activo — partilhado entre o render
// e a validação ao criar o formulário
function getCamposActivosInfo(eventTypes, newInvite) {
  const tipo = eventTypes.find((et) => et.id === newInvite.eventTypeId);
  const todosOsCampos = getAllFields(tipo);
  return newInvite.camposAtivos
    .map((id) => todosOsCampos.find((f) => f.id === id))
    .filter(Boolean);
}

export default function AdminPage() {
  const location = useLocation();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  // A app abre no Início — o assistente do dia (bloco 12b) — excepto
  // ao voltar de /evento/:id, que diz por onde se entrou (o separador
  // não vive no URL, por isso viaja no state da navegação).
  const [activeTab, setActiveTab] = useState(
    () => location.state?.tab || "inicio",
  );
  const [invites, setInvites] = useState([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [showNewInvite, setShowNewInvite] = useState(false);
  const [newInvite, setNewInvite] = useState({
    eventTypeId: "",
    camposAtivos: [],
    valores: {},
    reservaId: null,
    submissionAlvoId: null,
  });
  const [reservaContexto, setReservaContexto] = useState(null);
  // Evento-alvo do formulário (onboarding): quando presente, o convite
  // criado aponta a esse evento e as respostas ATUALIZAM-no.
  const [eventoContexto, setEventoContexto] = useState(null);
  const [newInviteErrors, setNewInviteErrors] = useState({});
  const [createdInvite, setCreatedInvite] = useState(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [selectedInvite, setSelectedInvite] = useState(null);
  const [shareTarget, setShareTarget] = useState(null);
  const [inviteToDelete, setInviteToDelete] = useState(null);
  const [eventTypes, setEventTypes] = useState([]);
  const [loadingEventTypes, setLoadingEventTypes] = useState(true);
  const [reservas, setReservas] = useState([]);
  // Contexto de documento pré-preenchido (vem dos botões 💰/📃 do drawer
  // de um evento). Quando existe, o separador Documentos abre com os
  // formulários já preenchidos com os dados desse evento.
  const [documentoContexto, setDocumentoContexto] = useState(null);
  // Bump para o FunilBoard recarregar quando o drawer altera um evento
  // (estado, valor, dados) — o funil tem fetch próprio e o drawer abre
  // POR CIMA dele; sem isto, o cartão só mudava de coluna após reload.
  const [funilVersao, setFunilVersao] = useState(0);
  // Casca de navegação: desktop = sidebar; telemóvel = barra inferior.
  const [larguraJanela, setLarguraJanela] = useState(window.innerWidth);
  const [maisAberto, setMaisAberto] = useState(false);
  const ehDesktop = larguraJanela >= 900;
  const navigate = useNavigate();

  // Caixa de Entrada — as notificações da captação (migração 022):
  // lista viva via realtime, badge de não lidas, toast + sino quando
  // um pedido chega com a app aberta.
  const notificacoes = useNotificacoes();
  const [notifAberto, setNotifAberto] = useState(false);
  // Notificação a abrir já expandida (quando se vem do toast)
  const [notifDestaque, setNotifDestaque] = useState(null);

  // "Abrir ficha completa" de uma notificação → o drawer do evento.
  // O evento pode ainda não estar em memória (acabou de chegar):
  // procura primeiro no estado, senão vai buscá-lo à BD.
  const handleAbrirEventoDeNotificacao = async (submissionId) => {
    if (!submissionId) return;
    let ev = submissions.find((s) => s.id === submissionId);
    if (!ev) {
      const { data } = await supabase
        .from("submissions")
        .select("*")
        .eq("id", submissionId)
        .maybeSingle();
      if (data) ev = normalizeSubmission(data);
    }
    if (ev) {
      setNotifAberto(false);
      setSelected(ev);
    } else {
      alert("Não foi possível abrir este evento. Tenta recarregar a página.");
    }
  };

  useEffect(() => {
    const aoRedimensionar = () => setLarguraJanela(window.innerWidth);
    window.addEventListener("resize", aoRedimensionar);
    return () => window.removeEventListener("resize", aoRedimensionar);
  }, []);

  // Navegação GLOBAL (menu lateral / barra inferior / atalhos): chegar
  // a Documentos pelo menu abre SEMPRE a Lista de Documentos — nunca o
  // último documento visitado nem o último cliente aberto.
  const handleNavegar = (tab) => {
    if (tab === "orcamentos") {
      setDocumentoContexto(null);
    }
    setActiveTab(tab);
  };

  // Abre o formulário para a irmã preencher ela própria —
  // compõe o objecto de formulário completo (com event_types) a partir
  // do que já está em memória, e navega para o formulário como
  // se fosse o casal/família a abri-lo
  const handlePreencherFormulario = (invite) => {
    const tipo = eventTypes.find((et) => et.id === invite.event_type_id);
    if (!tipo) {
      alert("Tipo de evento não encontrado. Tenta recarregar a página.");
      return;
    }
    const inviteCompleto = {
      ...invite,
      event_types: { nome: tipo.nome, steps: tipo.steps, icone: tipo.icone },
    };
    sessionStorage.setItem("dlm_invite", JSON.stringify(inviteCompleto));
    navigate("/formulario");
  };

  // Chamado pelos botões 💰 Orçamento / 📃 Contrato do drawer do evento:
  // junta os dados do cliente + evento (dupla fonte: colunas + respostas),
  // fecha o drawer e abre o separador Documentos já pré-preenchido.
  // Este é o fluxo CONTEXTUAL: abre o documento DIRECTAMENTE, sem
  // passar pela Lista de Documentos.
  const handleGerarDocumento = async (submissao, tipoDoc) => {
    try {
      const dados = await getDadosParaDocumento(submissao, eventTypes);
      setDocumentoContexto({ ...dados, tipoDoc });
      setSelected(null);
      setActiveTab("orcamentos");
    } catch (e) {
      console.error("Erro ao preparar o documento:", e);
      alert("Não foi possível preparar o documento. Tenta novamente.");
    }
  };

  // A página do evento não tem o editor de documentos dentro dela —
  // vive neste separador. Ao carregar em "Preparar orçamento" lá, a
  // navegação traz o pedido no state e é aqui que ele se cumpre,
  // quando as submissions já estão carregadas (o handler precisa da
  // linha completa e dos eventTypes).
  const pedidoDeDocumento = location.state?.gerarDoc;
  useEffect(() => {
    if (!pedidoDeDocumento || submissions.length === 0 || eventTypes.length === 0)
      return;
    const evento = submissions.find(
      (s) => s.id === pedidoDeDocumento.submissionId,
    );
    if (!evento) return;
    let cancelado = false;
    (async () => {
      try {
        const dados = await getDadosParaDocumento(evento, eventTypes);
        if (cancelado) return;
        // Consome o pedido para não voltar a disparar ao recarregar.
        window.history.replaceState({ tab: "orcamentos" }, "");
        setDocumentoContexto({ ...dados, tipoDoc: pedidoDeDocumento.tipoDoc });
        setActiveTab("orcamentos");
      } catch (e) {
        console.error("Erro ao preparar o documento:", e);
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoDeDocumento, submissions.length, eventTypes.length]);

  // Chamado pela Lista de Documentos ao clicar num documento: o mesmo
  // caminho do drawer (contexto pré-preenchido do evento). A lista só
  // mostra documentos de eventos — no domínio, um documento nunca
  // existe isolado.
  const handleAbrirDocumentoDaLista = (doc) => {
    const ev = submissions.find((s) => s.id === doc.submission_id);
    if (ev) {
      handleGerarDocumento(ev, doc.tipo);
      return;
    }
    alert(
      "Não foi possível encontrar o evento deste documento. Tenta recarregar a página.",
    );
  };

  // Chamado pelo botão 📋 Formulário do drawer: abre o painel Novo
  // Formulário JÁ APONTADO àquele evento (submission_alvo_id, migração
  // 013). Ao submeter, as respostas atualizam o evento existente em vez
  // de criar cliente + evento novos. Segue o padrão da reserva: o tipo
  // vem pré-selecionado do evento e a data pré-preenchida se o modelo
  // tiver campo de data.
  // Abrir o formulário PENDENTE de um evento para PREENCHER — o mesmo
  // destino do botão "✏ Preencher" do cartão. É para onde vão o botão
  // do drawer e a etapa da Jornada quando o convite existe por
  // preencher (nunca há caminho para duplicados).
  const handleVerFormularioDoEvento = (submissao) => {
    const convite = invites.find(
      (i) =>
        i.submission_alvo_id === submissao.id ||
        i.submission_id === submissao.id,
    );
    if (convite && !convite.submission_id) {
      handlePreencherFormulario(convite);
    } else {
      // rede de segurança: sem convite legível, ao menos a lista
      setActiveTab("convites");
      setShowNewInvite(false);
    }
  };

  const handleFormularioDoEvento = (submissao) => {
    const tipoId = submissao.event_type_id || eventTypes[0]?.id || "";
    const tipo = eventTypes.find((et) => et.id === tipoId);
    const campoData = getAllFields(tipo).find((f) => f.type === "date");

    const valores = {};
    const camposAtivos = [];
    if (campoData && submissao.data_evento) {
      valores[campoData.id] = submissao.data_evento;
      camposAtivos.push(campoData.id);
    }

    const resumo = getResumoSubmissao(submissao, eventTypes);
    setSelected(null); // fecha o drawer
    setActiveTab("convites");
    setReservaContexto(null);
    setEventoContexto({
      id: submissao.id,
      titulo: resumo.titulo,
      tipoNome: tipo?.nome || "",
      data: submissao.data_evento || null,
    });
    setNewInvite({
      eventTypeId: tipoId,
      camposAtivos,
      valores,
      reservaId: null,
      submissionAlvoId: submissao.id,
    });
    setShowNewInvite(true);
    setCreatedInvite(null);
  };

  // Chamado pela Agenda quando a irmã clica "Tornar cliente" numa reserva.
  // Muda para a tab Formulários, abre o painel pré-preenchido e carimba
  // o convite com o id da reserva.
  //
  // O nome da cliente NÃO é pré-preenchido num campo (não sabemos para que
  // campo do modelo iria) — aparece só como referência na nota do topo.
  // A data é pré-preenchida SE o modelo tiver um campo do tipo "date":
  // procuramos esse campo pelo seu type e usamos o id REAL dele (os ids
  // são gerados a partir do label, ex: "Data do Evento" -> "dataDoEvento",
  // por isso não podem ser adivinhados).
  const handleCriarQuestionarioDeReserva = (reserva) => {
    const tipoId = reserva.event_type_id || eventTypes[0]?.id || "";
    const tipo = eventTypes.find((et) => et.id === tipoId);

    // procurar o primeiro campo de data no modelo escolhido
    const campoData = getAllFields(tipo).find((f) => f.type === "date");

    const valores = {};
    const camposAtivos = [];
    if (campoData && reserva.data_evento) {
      valores[campoData.id] = reserva.data_evento;
      camposAtivos.push(campoData.id); // sem isto, o campo não aparece no painel
    }

    setActiveTab("convites");
    setReservaContexto(reserva);
    setEventoContexto(null);
    setNewInvite({
      eventTypeId: tipoId,
      camposAtivos,
      valores,
      reservaId: reserva.id,
      // Reservas novas trazem o evento ligado (submission_id): o
      // formulário ATUALIZA esse evento (bloco 6) em vez de criar
      // cliente + evento novos. Reservas antigas (sem ligação) caem
      // no caminho antigo — retrocompatível.
      submissionAlvoId: reserva.submission_id || null,
    });
    setShowNewInvite(true);
    setCreatedInvite(null);
  };

  useEffect(() => {
    fetchSubmissions();
    fetchReservas();
    fetchInvites();
    fetchEventTypes();

    const channel = supabase
      .channel("db-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "submissions" },
        (payload) => {
          console.log("Nova submissão:", payload);
          fetchSubmissions();
          setFunilVersao((v) => v + 1); // acorda a Lista/Funil de Clientes
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "invites" },
        (payload) => {
          console.log("Convite actualizado:", payload);
          fetchInvites();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "event_types" },
        (payload) => {
          console.log("Novo tipo de evento:", payload);
          fetchEventTypes();
        },
      )
      .subscribe((status) => {
        console.log("Realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchEventTypes = async () => {
    setLoadingEventTypes(true);
    try {
      const types = await getEventTypes();
      setEventTypes(types);
      setNewInvite((prev) => {
        if (prev.eventTypeId) return prev; // já inicializado, não interferir
        const tipoDefault = types[0];
        return {
          ...prev,
          eventTypeId: tipoDefault?.id || "",
          camposAtivos: tipoDefault ? getDefaultCampos(tipoDefault) : [],
        };
      });
    } catch (e) {
      console.error("Erro ao ir buscar tipos de evento:", e);
    }
    setLoadingEventTypes(false);
  };

  const fetchReservas = async () => {
    try {
      const data = await getReservas();
      setReservas(data);
    } catch (e) {
      console.error("Erro ao ir buscar reservas:", e);
    }
  };

  // Quando a irmã muda o tipo de evento no painel, os campos activos
  // recomeçam do zero (os campos de um tipo não fazem sentido noutro)
  const handleChangeEventType = (novoId) => {
    const tipo = eventTypes.find((et) => et.id === novoId);
    setNewInvite((prev) => ({
      ...prev,
      eventTypeId: novoId,
      camposAtivos: getDefaultCampos(tipo),
      valores: {},
    }));
    setNewInviteErrors({});
  };

  const handleAddCampo = (fieldId) => {
    setNewInvite((prev) => ({
      ...prev,
      camposAtivos: [...prev.camposAtivos, fieldId],
    }));
  };

  const handleRemoveCampo = (fieldId) => {
    setNewInvite((prev) => {
      const valoresSemEste = { ...prev.valores };
      delete valoresSemEste[fieldId];
      return {
        ...prev,
        camposAtivos: prev.camposAtivos.filter((id) => id !== fieldId),
        valores: valoresSemEste,
      };
    });
    setNewInviteErrors((prev) => {
      const n = { ...prev };
      delete n[fieldId];
      return n;
    });
  };

  const handleChangeValorCampo = (fieldId, valor) => {
    setNewInvite((prev) => ({
      ...prev,
      valores: { ...prev.valores, [fieldId]: valor },
    }));
    setNewInviteErrors((prev) => {
      if (!prev[fieldId]) return prev;
      const n = { ...prev };
      delete n[fieldId];
      return n;
    });
  };

  const handleCreateInvite = async () => {
    // Valida o FORMATO dos campos que ela preencheu (ex: email inválido,
    // data no passado) — mas nunca a obrigatoriedade, já que qualquer
    // campo pode estar ausente do painel
    const camposActivosInfo = getCamposActivosInfo(eventTypes, newInvite);
    const errors = {};
    camposActivosInfo.forEach((field) => {
      const valor = newInvite.valores[field.id];
      const erro = validateField({ ...field, required: false }, valor);
      if (erro) errors[field.id] = erro;
    });
    if (Object.keys(errors).length > 0) {
      setNewInviteErrors(errors);
      return;
    }

    // Usa o tipo de evento escolhido no formulário (com mais de um tipo,
    // a irmã escolhe; com só um, já vem pré-seleccionado)
    const eventTypeId = newInvite.eventTypeId;
    if (!eventTypeId) {
      console.error(
        "Nenhum tipo de evento disponível para associar ao convite.",
      );
      setNewInviteErrors({
        geral: "Não foi possível criar o formulário. Tenta novamente.",
      });
      return;
    }

    setCreatingInvite(true);
    try {
      const invite = await createInvite({
        dataEvento: newInvite.valores.dataEvento || null,
        eventTypeId,
        respostas: newInvite.valores,
        reservaId: newInvite.reservaId || null,
        submissionAlvoId: newInvite.submissionAlvoId || null,
      });
      setCreatedInvite(invite);
      setInvites((prev) => [invite, ...prev]);
      const tipoActual = eventTypes.find((et) => et.id === eventTypeId);
      setNewInvite({
        eventTypeId,
        camposAtivos: getDefaultCampos(tipoActual),
        valores: {},
        reservaId: null,
        submissionAlvoId: null,
      });
      setReservaContexto(null);
      setEventoContexto(null);
      setShowNewInvite(false);
    } catch (e) {
      console.error(e);
    }
    setCreatingInvite(false);
  };

  const handleDeleteInvite = async () => {
    const { error } = await supabase
      .from("invites")
      .delete()
      .eq("id", inviteToDelete.id);
    if (error) {
      console.error("Erro ao remover convite:", error);
      alert("Não foi possível remover o formulário. Tenta novamente.");
      return;
    }
    setInvites((prev) => prev.filter((i) => i.id !== inviteToDelete.id));
    if (selectedInvite?.id === inviteToDelete.id) setSelectedInvite(null);
    setInviteToDelete(null);
  };

  const getShareMessage = (invite) => {
    const url = `${window.location.origin}/?codigo=${invite.code}`;
    const tipo = eventTypes.find((et) => et.id === invite.event_type_id);
    const emoji = tipo?.icone === "couple" ? "💍" : "✨";
    return `Olá ${getTituloConvite(invite, submissions, eventTypes)}! ${emoji}\n\nO vosso formulário *Do Luxo à Mesa* está pronto.\n\nÉ só clicar aqui para começar: ${url}\n\n(O vosso código de acesso é: *${invite.code}*)\n\nPlaneamos cada detalhe. Criamos memórias inesquecíveis. ✨`;
  };

  const fetchSubmissions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .order("data_evento", { ascending: true });
    if (!error) setSubmissions(data.map(normalizeSubmission));
    setLoading(false);
  };

  const fetchInvites = async () => {
    setLoadingInvites(true);
    const { data, error } = await supabase
      .from("invites")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setInvites(data);
    setLoadingInvites(false);
  };

  const handleStatusChange = async (id, newStatus, fase) => {
    try {
      const atualizado = await updateStatus(id, newStatus, fase);
      setSubmissions((prev) =>
        prev.map((s) => (s.id === id ? atualizado : s)),
      );
      if (selected?.id === id) setSelected(atualizado);
      setFunilVersao((v) => v + 1);
    } catch (e) {
      console.error(e);
      alert(e.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

  // A secção Documentos tem DOIS modos: documento aberto (chega-se cá
  // pelo drawer do evento ou pela Lista) ou a Lista de Documentos —
  // o modo por omissão e a entrada principal da secção.
  const documentoAberto = !!documentoContexto;

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--cream)",
        fontFamily: "Inter, sans-serif",
        display: ehDesktop ? "flex" : "block",
      }}
    >
      {/* ===== CASCA DE NAVEGAÇÃO (bloco 12a) =====
          Desktop: sidebar lateral com tudo visível.
          Telemóvel: cabeçalho fino + barra inferior (+ folha Mais). */}
      {ehDesktop ? (
        <SidebarNav
          activeTab={activeTab}
          onNavegar={handleNavegar}
          onSair={handleLogout}
          naoLidas={notificacoes.naoLidas}
          onAbrirNotificacoes={() => {
            setNotifDestaque(null);
            setNotifAberto(true);
          }}
        />
      ) : (
        <div
          style={{
            backgroundColor: "white",
            borderBottom: "1px solid var(--gold-light)",
            padding: "12px 16px",
            textAlign: "center",
            position: "relative",
          }}
        >
          {/* Sino da Caixa de Entrada (telemóvel) */}
          <button
            onClick={() => {
              setNotifDestaque(null);
              setNotifAberto(true);
            }}
            aria-label="Caixa de Entrada"
            style={{
              position: "absolute",
              right: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "8px",
              border: "none",
              background: "none",
              cursor: "pointer",
              color:
                notificacoes.naoLidas > 0
                  ? "var(--gold-dark)"
                  : "var(--gray-mid)",
            }}
          >
            <Icone nome="sino" tamanho={20} />
            <BadgeNaoLidas quantos={notificacoes.naoLidas} tamanho={16} />
          </button>
          <h1
            style={{
              fontSize: "15px",
              color: "var(--gold)",
              fontFamily: "Playfair Display, serif",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              margin: "0 0 1px 0",
              lineHeight: 1.1,
            }}
          >
            Do Luxo à Mesa
          </h1>
          <p
            style={{
              fontSize: "8px",
              color: "var(--gold)",
              textTransform: "uppercase",
              letterSpacing: "0.25em",
              margin: 0,
            }}
          >
            by Luxury Events
          </p>
        </div>
      )}

      {/* Conteúdo */}
      <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          // O Início é um PAINEL de 3 colunas: merece a largura toda
          // (com uma moldura simétrica em ecrãs gigantes). Os outros
          // ecrãs são listas/formulários: leem-se melhor contidos.
          maxWidth: activeTab === "inicio" ? "1480px" : "960px",
          margin: "0 auto",
          padding: ehDesktop
            ? activeTab === "inicio"
              ? "36px 40px"
              : "32px 24px"
            : "24px 16px 96px",
        }}
      >
        {/* ---- TAB INÍCIO (a porta de entrada) ---- */}
        {activeTab === "inicio" && (
          <InicioTab
            submissions={submissions}
            invites={invites}
            eventTypes={eventTypes}
            loading={loading || loadingEventTypes}
            onAbrirEvento={(ev) => setSelected(ev)}
            onNavegar={handleNavegar}
            onDadosMudaram={fetchSubmissions}
          />
        )}

        {/* ---- TAB MENSAGENS (biblioteca de mensagens-tipo) ---- */}
        {activeTab === "mensagens" && <MensagensTab />}

        {/* ---- TAB CLIENTES ---- */}
        {activeTab === "clientes" && (
          <AvisosBloqueantes pagina="clientes">
            <ClientesLista
              eventTypes={eventTypes}
              onAbrirEvento={(ev) => setSelected(ev)}
              onDadosMudaram={fetchSubmissions}
              refrescarEm={funilVersao}
            />
          </AvisosBloqueantes>
        )}

        {/* ---- TAB CONVITES (label Formulários) ---- */}
        {activeTab === "convites" && (
          <motion.div
            key="tab-convites"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {/* Notificação de convite criado */}
            <InviteCreatedModal
              invite={createdInvite}
              eventTypes={eventTypes}
              onClose={() => setCreatedInvite(null)}
              onShare={() => setShareTarget(createdInvite)}
              getShareMessage={getShareMessage}
              getTitulo={(invite) =>
                getTituloConvite(invite, submissions, eventTypes)
              }
            />

            {/* Botão novo Formulário */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: "20px",
              }}
            >
              <button
                onClick={() => {
                  setShowNewInvite(true);
                  setCreatedInvite(null);
                }}
                style={{
                  padding: "10px 22px",
                  borderRadius: "10px",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                  backgroundColor: "var(--gold)",
                  color: "white",
                  border: "none",
                  boxShadow: "0 4px 12px rgba(201,168,76,0.3)",
                }}
              >
                + Novo Formulário
              </button>
            </div>

            {/* Formulário novo Formulário */}
            <style>{`
              .painel-convite-scroll::-webkit-scrollbar { width: 6px; }
              .painel-convite-scroll::-webkit-scrollbar-thumb {
                background-color: var(--gold-light);
                border-radius: 999px;
              }
              .painel-convite-scroll::-webkit-scrollbar-track { background: transparent; }
            `}</style>

            {showNewInvite &&
              (() => {
                const tipoActual = eventTypes.find(
                  (et) => et.id === newInvite.eventTypeId,
                );
                const todosOsCampos = getAllFields(tipoActual);
                const camposActivosInfo = getCamposActivosInfo(
                  eventTypes,
                  newInvite,
                );
                const camposDisponiveis = todosOsCampos.filter(
                  (f) => !newInvite.camposAtivos.includes(f.id),
                );

                return (
                  <div
                    style={{
                      backgroundColor: "white",
                      borderRadius: "16px",
                      boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
                      marginBottom: "20px",
                      border: "1px solid var(--gold-light)",
                      display: "flex",
                      flexDirection: "column",
                      maxHeight: "min(640px, 80vh)",
                    }}
                  >
                    {/* Corpo — ganha scroll próprio quando há muitos campos.
                        A barra de scroll é estilizada (mais fina, dourada)
                        para ficar claro que esta zona desliza */}
                    <div
                      className="painel-convite-scroll"
                      style={{
                        padding: "24px",
                        overflowY: "auto",
                        flex: 1,
                        scrollbarWidth: "thin",
                        scrollbarColor: "var(--gold-light) transparent",
                      }}
                    >
                      <h3
                        style={{
                          fontSize: "14px",
                          color: "var(--charcoal)",
                          margin: "0 0 20px 0",
                          fontFamily: "Playfair Display, serif",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        Novo Formulário
                      </h3>

                      {reservaContexto && (
                        <div
                          style={{
                            backgroundColor: "#FBF7EF",
                            border: "1px solid var(--gold-light)",
                            borderRadius: "10px",
                            padding: "12px 14px",
                            marginBottom: "16px",
                          }}
                        >
                          <p
                            style={{
                              fontSize: "10px",
                              color: "var(--gray-mid)",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              margin: "0 0 4px 0",
                            }}
                          >
                            A criar para a reserva de
                          </p>
                          <p
                            style={{
                              fontSize: "14px",
                              fontWeight: "600",
                              color: "var(--charcoal)",
                              margin: 0,
                            }}
                          >
                            {reservaContexto.nome_cliente}
                            {reservaContexto.contacto
                              ? ` · ${reservaContexto.contacto}`
                              : ""}
                          </p>
                        </div>
                      )}

                      {eventoContexto && (
                        <div
                          style={{
                            backgroundColor: "#FBF7EF",
                            border: "1px solid var(--gold-light)",
                            borderRadius: "10px",
                            padding: "12px 14px",
                            marginBottom: "16px",
                          }}
                        >
                          <p
                            style={{
                              fontSize: "10px",
                              color: "var(--gold-dark)",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              margin: "0 0 4px 0",
                            }}
                          >
                            Vai atualizar o evento de
                          </p>
                          <p
                            style={{
                              fontSize: "14px",
                              fontWeight: "600",
                              color: "var(--charcoal)",
                              margin: 0,
                            }}
                          >
                            {eventoContexto.titulo}
                            {eventoContexto.tipoNome
                              ? ` · ${eventoContexto.tipoNome}`
                              : ""}
                          </p>
                          <DadosCaptacao
                            submissao={submissions.find(
                              (x) => x.id === newInvite.submissionAlvoId,
                            )}
                          />
                        </div>
                      )}

                      {eventTypes.length > 1 && (
                        <div
                          id="tour-novo-convite-tipo"
                          style={{ marginBottom: "14px" }}
                        >
                          <label
                            style={{
                              fontSize: "11px",
                              fontWeight: "600",
                              textTransform: "uppercase",
                              letterSpacing: "0.07em",
                              color: "var(--charcoal)",
                              display: "block",
                              marginBottom: "6px",
                            }}
                          >
                            Tipo de Evento
                          </label>
                          <select
                            value={newInvite.eventTypeId}
                            onChange={(e) =>
                              handleChangeEventType(e.target.value)
                            }
                            style={{
                              width: "100%",
                              padding: "10px 14px",
                              borderRadius: "8px",
                              border: "1.5px solid var(--gold-light)",
                              fontSize: "13px",
                              outline: "none",
                              fontFamily: "Inter, sans-serif",
                              boxSizing: "border-box",
                            }}
                          >
                            {eventTypes.map((et) => (
                              <option key={et.id} value={et.id}>
                                {et.nome}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Campos escolhidos pela irmã para este convite —
                          variam por tipo de evento, e até de convite para
                          convite. Não há nenhum campo fixo: tudo o que
                          aparece aqui (incluindo a Data do Evento, quando
                          o tipo de evento a tiver definida) pode ser
                          removido. */}
                      {camposActivosInfo.length > 0 ? (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "16px",
                          }}
                        >
                          {camposActivosInfo.map((field) => (
                            <div
                              key={field.id}
                              style={{ position: "relative" }}
                            >
                              <p
                                style={{
                                  fontSize: "10px",
                                  color: "var(--gray-mid)",
                                  margin: "0 0 2px 0",
                                }}
                              >
                                {field.stepTitle}
                              </p>
                              <button
                                type="button"
                                onClick={() => handleRemoveCampo(field.id)}
                                title="Remover campo"
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  right: 0,
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
                              <FormField
                                field={{ ...field, required: false }}
                                value={newInvite.valores[field.id]}
                                onChange={(id, val) =>
                                  handleChangeValorCampo(id, val)
                                }
                                error={newInviteErrors[field.id]}
                                onClearError={(id) =>
                                  setNewInviteErrors((prev) => {
                                    const n = { ...prev };
                                    delete n[id];
                                    return n;
                                  })
                                }
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p
                          style={{
                            fontSize: "12px",
                            color: "var(--gray-mid)",
                            margin: 0,
                          }}
                        >
                          Ainda não escolheste nenhum campo — usa a busca em
                          baixo para adicionar o que quiseres preencher já.
                        </p>
                      )}
                    </div>

                    {/* Rodapé — fica sempre visível, mesmo que o corpo
                        acima tenha scroll */}
                    <div
                      style={{
                        padding: "16px 24px",
                        borderTop: "1px solid var(--gold-light)",
                        backgroundColor: "#FBF7EF",
                        borderRadius: "0 0 16px 16px",
                        flexShrink: 0,
                      }}
                    >
                      <div
                        id="tour-campo-seletor"
                        style={{ marginBottom: "14px" }}
                      >
                        <CampoSeletor
                          camposDisponiveis={camposDisponiveis}
                          onAdd={handleAddCampo}
                        />
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          onClick={() => {
                            setShowNewInvite(false);
                            setNewInviteErrors({});
                            setEventoContexto(null);
                            setNewInvite((prev) => ({
                              ...prev,
                              submissionAlvoId: null,
                            }));
                          }}
                          style={{
                            padding: "10px 20px",
                            borderRadius: "8px",
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
                          id="tour-criar-convite"
                          onClick={handleCreateInvite}
                          disabled={creatingInvite}
                          style={{
                            padding: "10px 24px",
                            borderRadius: "8px",
                            fontSize: "13px",
                            fontWeight: "600",
                            cursor: "pointer",
                            backgroundColor: creatingInvite
                              ? "var(--gold-light)"
                              : "var(--gold)",
                            color: "white",
                            border: "none",
                          }}
                        >
                          {creatingInvite ? "A criar..." : "Criar Formulário"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

            {/* Lista de convites */}
            <InvitesList
              invites={invites}
              loading={loadingInvites}
              eventTypes={eventTypes}
              onSelect={(invite) => setSelectedInvite(invite)}
              onPreencher={handlePreencherFormulario}
              onDelete={(invite) => setInviteToDelete(invite)}
              getTitulo={(invite) =>
                getTituloConvite(invite, submissions, eventTypes)
              }
            />

            {/* Confirmação de remoção */}
            <DeleteInviteModal
              invite={inviteToDelete}
              onCancel={() => setInviteToDelete(null)}
              onConfirm={handleDeleteInvite}
              getTitulo={(invite) =>
                getTituloConvite(invite, submissions, eventTypes)
              }
            />

            {/* Drawer do convite seleccionado */}
            <InviteDetailModal
              invite={selectedInvite}
              eventTypes={eventTypes}
              onClose={() => setSelectedInvite(null)}
              onShare={() => setShareTarget(selectedInvite)}
              getShareMessage={getShareMessage}
              getTitulo={(invite) =>
                getTituloConvite(invite, submissions, eventTypes)
              }
            />
          </motion.div>
        )}

        {/* ---- TAB DASHBOARD ---- */}
        {activeTab === "dashboard" && (
          <DashboardTab
            submissions={submissions}
            invites={invites}
            eventTypes={eventTypes}
            onSelectSubmission={(s) => setSelected(s)}
          />
        )}

        {/* ---- TAB TIPOS DE EVENTO ---- */}
        {activeTab === "calendario" && (
          <CalendarioTab
            submissions={submissions}
            eventTypes={eventTypes}
            reservas={reservas}
            onSelectSubmission={(s) => setSelected(s)}
            onReservasChange={fetchReservas}
            onCriarQuestionario={handleCriarQuestionarioDeReserva}
            onDadosMudaram={fetchSubmissions}
          />
        )}

        {activeTab === "tiposEvento" && (
          <EventTypesTab
            eventTypes={eventTypes}
            loading={loadingEventTypes}
            onRefetch={fetchEventTypes}
          />
        )}
        {activeTab === "operacional" && (
          <OperacionalTab submissions={submissions} eventTypes={eventTypes} />
        )}
        {activeTab === "importar" && (
          <ImportarTab
            eventTypes={eventTypes}
            onModelosCriados={fetchEventTypes}
          />
        )}

        {/* ---- SECÇÃO DOCUMENTOS ----
            Dois modos, dois conceitos separados:
            · LISTA (navegação global) — a entrada principal: índice,
              pesquisa e consulta de TODOS os documentos existentes.
              Aqui não se criam documentos: no domínio, todo o documento
              pertence a um evento de um cliente.
            · DOCUMENTO ABERTO (navegação contextual) — os editores.
              Chega-se cá pelos botões do drawer do evento ou pela Lista.
            O DocumentosTab só é montado quando há um documento aberto:
            a persistência na BD (Fase 1) garante que nada se perde ao
            navegar — o "sempre montado" deixou de ser necessário. */}
        {activeTab === "orcamentos" && !documentoAberto && (
          <DocumentosLista
            submissions={submissions}
            eventTypes={eventTypes}
            onAbrirDocumento={handleAbrirDocumentoDaLista}
          />
        )}

        {activeTab === "orcamentos" && documentoAberto && (
          <div>
            {/* Voltar à Lista de Documentos */}
            <button
              className="no-print"
              onClick={() => setDocumentoContexto(null)}
              style={{
                marginBottom: "16px",
                padding: "7px 14px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: "600",
                border: "1px solid var(--gold-light)",
                color: "var(--gold-dark)",
                backgroundColor: "white",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              ← Todos os documentos
            </button>
            <DocumentosTab
              key={`doc-${documentoContexto.submissionId}-${documentoContexto.tipoDoc}`}
              contexto={documentoContexto}
              onDadosMudaram={fetchSubmissions}
              onVoltarAoEvento={
                documentoContexto?.submissionId
                  ? () => {
                      const ev = submissions.find(
                        (x) => x.id === documentoContexto.submissionId,
                      );
                      setActiveTab("clientes");
                      if (ev) setSelected(ev);
                    }
                  : null
              }
            />
          </div>
        )}
      </div>

      </div>

      {/* Barra inferior + folha Mais (só telemóvel) */}
      {!ehDesktop && (
        <BottomNavMovel
          activeTab={activeTab}
          onNavegar={handleNavegar}
          onAbrirMais={() => setMaisAberto(true)}
        />
      )}
      {!ehDesktop && maisAberto && (
        <SheetMais
          activeTab={activeTab}
          onNavegar={handleNavegar}
          onSair={handleLogout}
          onFechar={() => setMaisAberto(false)}
        />
      )}

      <SubmissionDrawer
        selected={selected}
        eventTypes={eventTypes}
        onClose={() => setSelected(null)}
        onStatusChange={handleStatusChange}
        onSaved={(atualizada) => {
          setSubmissions((prev) =>
            prev.map((s) => (s.id === atualizada.id ? atualizada : s)),
          );
          setSelected(atualizada);
          setFunilVersao((v) => v + 1);
        }}
        onGerarDocumento={handleGerarDocumento}
        onFormulario={handleFormularioDoEvento}
        onVerFormulario={handleVerFormularioDoEvento}
        onModeloCriado={fetchEventTypes}
        invites={invites}
      />

      {/* Modal de partilha */}
      <ShareSheet
        shareTarget={shareTarget}
        onClose={() => setShareTarget(null)}
        getShareMessage={getShareMessage}
        getTitulo={(invite) =>
          getTituloConvite(invite, submissions, eventTypes)
        }
      />

      {/* Caixa de Entrada — o painel das notificações */}
      <PainelNotificacoes
        aberto={notifAberto}
        destaqueId={notifDestaque}
        lista={notificacoes.lista}
        naoLidas={notificacoes.naoLidas}
        eventTypes={eventTypes}
        onFechar={() => setNotifAberto(false)}
        onMarcarLida={notificacoes.marcarLida}
        onMarcarTodas={notificacoes.marcarTodas}
        onApagarVarias={notificacoes.apagarVarias}
        onAbrirEvento={handleAbrirEventoDeNotificacao}
      />

      {/* O momento WOW: pedido novo chega → cartão dourado + sino */}
      <ToastNotificacao
        nova={notificacoes.nova}
        eventTypes={eventTypes}
        onAbrir={(n) => {
          notificacoes.limparNova();
          setNotifDestaque(n.id);
          setNotifAberto(true);
        }}
        onFechar={notificacoes.limparNova}
      />
    </div>
  );
}