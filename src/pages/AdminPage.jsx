import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams, Navigate } from "react-router-dom";
import {
  SEPARADOR_POR_OMISSAO,
  caminhoDoSeparador,
  idDoSlug,
} from "../lib/rotasAdmin";
import { supabase } from "../lib/supabase";
import {
  createInvite,
  getEventTypes,
  estadoFormularioDoEvento,
  apontarConviteAoEvento,
} from "../lib/invites";
import { validateField } from "../lib/validation";
import {
  normalizeSubmission,
  getValorAtual,
  getResumoSubmissao,
} from "../lib/submissionFields";
import {
  getDadosParaDocumento,
  getEventoCompleto,
  updateStatus,
} from "../lib/clientes";
import EventTypesTab from "../components/admin/EventTypesTab";
import CampoSeletor from "../components/admin/CampoSeletor";
import SubmissionDrawer from "../components/admin/SubmissionDrawer";
import DashboardTab from "../components/admin/DashboardTab";
import ClientesLista from "../components/admin/ClientesLista";
import ClienteVista from "../components/admin/ClienteVista";
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
  // ------------------------------------------------------------
  // «POR CHEGAR» — a distinção que faltava em todo o backoffice.
  //
  // Uma vista que recebe uma lista VAZIA não sabe se ela está vazia
  // porque não há nada, se ainda vem a caminho, ou se a busca falhou.
  // Sem essa distinção, os ecrãs AFIRMAM: «Nada sai de casa neste
  // período», «Sem conflitos de stock», «formulário por preencher» —
  // e uma delas leva mesmo a criar cliente e evento DUPLICADOS.
  //
  // A partir daqui cada lista tem, além do seu «a carregar», uma marca
  // de FALHA. Uma busca que falha deixa de ficar disfarçada de «não há
  // nada»: as duas juntas formam «por chegar», e é isso que desce às
  // vistas, que passam a calar-se em vez de mentir.
  // ------------------------------------------------------------
  const [falhaSubmissions, setFalhaSubmissions] = useState(false);
  const [falhaEventTypes, setFalhaEventTypes] = useState(false);
  const [falhaReservas, setFalhaReservas] = useState(false);
  const [loadingReservas, setLoadingReservas] = useState(true);
  const [selected, setSelected] = useState(null);
  // O SEPARADOR VIVE NO URL. Deixou de ser estado: é o parâmetro da
  // rota, traduzido de slug (o que a Nádia lê na barra de endereço)
  // para id interno (o que o código sempre usou) pelo mapa único em
  // lib/rotasAdmin.js.
  //
  // Consequências que valem a mudança: F5 recarrega o mesmo ecrã, o
  // «voltar» do browser funciona, e cada separador tem endereço para
  // partilhar ou abrir noutro separador do browser.
  //
  // Um slug desconhecido (URL antigo, link mal colado, erro de escrita)
  // devolve null e cai no Início — a navegação nunca deve ser o sítio
  // onde um erro de escrita se manifesta como ecrã em branco.
  const { separador, p1, p2 } = useParams();
  const idDoSeparador = idDoSlug(separador);
  const activeTab = idDoSeparador || SEPARADOR_POR_OMISSAO;
  // Pedido "mostra-me os perdidos do funil" — vem da pílula «Recuperar
  // no funil» da Jornada (página do evento via location.state, drawer
  // via handler direto). Consome-se uma vez: o FunilBoard liga o "Ver
  // perdidos" e avisa que consumiu.
  const [pedidoVerPerdidos, setPedidoVerPerdidos] = useState(
    () => location.state?.verPerdidos || null,
  );
  // Consome o pedido do HISTÓRICO (padrão do gerarDoc/formularioDe no
  // mesmo ficheiro): o initializer já o guardou no estado React; sem
  // isto, F5 ou Back reliam o verPerdidos e roubavam a vista escolhida.
  useEffect(() => {
    if (location.state?.verPerdidos) {
      // Consome o pedido: limpa o state SEM mexer no URL (o separador
      // já vive no caminho, posto lá por quem navegou para cá).
      // Preserva a query VIVA (window.location, não o `location` do
      // hook, que está congelado no mount): a ClientesLista pode já ter
      // escrito o ?vista=funil neste mesmo instante, e limpar o state
      // não pode apagá-lo.
      navigate(location.pathname + window.location.search, {
        replace: true,
        state: null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [invites, setInvites] = useState([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  // O fetch dos convites deixou de falhar em silêncio: sem a lista, o
  // fluxo "Criar formulário" (formularioDe) não pode decidir com
  // segurança — criar às cegas era arriscar um convite duplicado.
  const [erroInvites, setErroInvites] = useState(null);
  // Avisos do fluxo de convites (evento não encontrado, apontar falhou):
  // respondem no ecrã, na tab Formulários, nunca num diálogo do browser.
  const [avisoConvites, setAvisoConvites] = useState(null);
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
      setErroEstado(
        "Não foi possível abrir este evento — recarrega a página e tenta outra vez.",
      );
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
  // O menu lateral (e a barra do telemóvel) navegam SOZINHOS: cada item
  // é uma ligação de verdade que substitui a entrada do histórico. Este
  // handler deixou de navegar — faz só o efeito que a navegação global
  // sempre teve, e que continua a valer.
  // Já não faz nada, e é isso que se quer: chegar a Documentos pelo
  // menu abre a Lista porque o endereço do menu não tem documento
  // nenhum — a regra deixou de precisar de um gesto para se cumprir.
  // Mantém-se como ponto único caso volte a haver efeito de navegação
  // global (é o que os quatro sítios do menu chamam).
  const handleNavegar = () => {};

  // Navegação CONTEXTUAL, feita por código: a Jornada que manda para
  // Documentos, a Agenda que manda para Formulários, o Início que manda
  // para a Agenda. Ao contrário do menu, EMPURRA histórico — isto é um
  // passo de uma viagem, e o «voltar» deve desfazê-lo.
  const navegarPara = (tab) => {
    handleNavegar(tab);
    navigate(caminhoDoSeparador(tab));
  };

  // Abre o formulário para a irmã preencher ela própria —
  // compõe o objecto de formulário completo (com event_types) a partir
  // do que já está em memória, e navega para o formulário como
  // se fosse o casal/família a abri-lo
  const handlePreencherFormulario = (invite) => {
    // «Não carregou» não é «não existe»: sem os modelos em mão, a
    // mensagem certa não é «o tipo de evento já não existe».
    if (modelosPorChegar) {
      navegarPara("convites");
      setAvisoConvites(
        "Ainda não foi possível ler os tipos de evento. Recarrega a página e tenta outra vez.",
      );
      return;
    }
    const tipo = eventTypes.find((et) => et.id === invite.event_type_id);
    if (!tipo) {
      navegarPara("convites");
      setAvisoConvites(
        "O tipo de evento deste formulário já não existe. Recarrega a página; se o aviso persistir, verifica o modelo no editor de Tipos de Evento.",
      );
      return;
    }
    // Um modelo sem passos partia o formulário do cliente (ecrã em
    // branco) — diz-se aqui, onde há quem leia, e não lá.
    if (!Array.isArray(tipo.steps) || tipo.steps.length === 0) {
      navegarPara("convites");
      setAvisoConvites(
        `O modelo "${tipo.nome}" não tem passos — o formulário abriria em branco. Abre o editor de Tipos de Evento e compõe os passos desse modelo antes de partilhar o convite.`,
      );
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
  // Abrir um documento é navegar para o endereço dele. Quem o compõe é
  // o efeito acima — aqui não se prepara nada, para não haver dois
  // sítios a fazer a mesma coisa por caminhos diferentes.
  const handleGerarDocumento = (submissao, tipoDoc) => {
    setSelected(null);
    navigate(`${caminhoDoSeparador("orcamentos")}/${submissao.id}/${tipoDoc}`);
  };

  // ------------------------------------------------------------
  // O DOCUMENTO ABERTO VIVE NO URL: /admin/documentos/:evento/:tipo
  //
  // Isto substitui o handshake que trazia o pedido no `state` da
  // navegação — um mecanismo de USO ÚNICO que tinha de ser consumido
  // com um navigate(replace) e guardado por um ref para não se repetir
  // a cada refetch (o comentário antigo contava que já tinha
  // "sequestrado a Nádia de volta ao editor" uma vez). Com o endereço a
  // mandar, o pedido é o próprio URL: não se gasta, não se repete, e um
  // F5 volta ao mesmo documento em vez de cair na lista.
  //
  // O contexto do documento continua a ser um objecto COMPOSTO (o
  // evento, o cliente, os dados todos resolvidos por
  // getDadosParaDocumento) — o que muda é que agora se reconstrói à
  // chegada, a partir dos dois ids do caminho, em vez de viajar em
  // memória.
  // ------------------------------------------------------------
  // Vocabulário fechado: um tipo inventado no endereço não deve chegar
  // ao editor a fingir que é um documento.
  const TIPOS_DOC = ["orcamento", "contrato", "proposta"];
  const docEventoId = activeTab === "orcamentos" ? p1 : null;
  const docTipo =
    activeTab === "orcamentos" && TIPOS_DOC.includes(p2) ? p2 : null;

  useEffect(() => {
    // Sem documento no endereço, a secção é a lista.
    if (!docEventoId || !docTipo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (documentoContexto) setDocumentoContexto(null);
      // Endereço com evento mas sem tipo legível (/admin/documentos/<id>
      // ou um tipo mal escrito) é um link truncado, não a lista: o ecrã
      // cai na lista, e o URL tem de cair com ele — senão a barra de
      // endereço fica a anunciar um documento que não está aberto.
      if (docEventoId && !docTipo) {
        navigate(caminhoDoSeparador("orcamentos"), { replace: true });
      }
      return;
    }
    // Já é este o documento montado — nada a refazer (é este guarda que
    // impede o efeito de se re-disparar a cada refetch das submissões).
    if (
      documentoContexto?.submissionId === docEventoId &&
      documentoContexto?.tipoDoc === docTipo
    ) {
      return;
    }
    // Mesmo evento, só mudou o TIPO (ela carregou em Contrato dentro do
    // editor): os dados compostos são os mesmos — troca-se a etiqueta em
    // memória em vez de pagar outra ida à base.
    if (documentoContexto?.submissionId === docEventoId) {
      setDocumentoContexto({ ...documentoContexto, tipoDoc: docTipo });
      return;
    }

    // Espera pelo LOADING, não pelo length: uma lista carregada vazia
    // deixava o pedido pendurado para sempre, em silêncio.
    if (loading || loadingEventTypes) return;

    let cancelado = false;
    (async () => {
      try {
        // A lista já carregada é o caminho rápido. Mas um endereço de
        // documento tem de valer por si — é essa a razão de ele existir:
        // um link guardado nos favoritos, aberto num separador novo,
        // não pode depender de a lista INTEIRA estar em memória. Se o
        // evento não estiver lá, vai-se buscar SÓ esse.
        const evento =
          submissions.find((s) => s.id === docEventoId) ||
          (await getEventoCompleto(docEventoId));
        if (cancelado) return;
        if (!evento) {
          setErroEstado(
            "Não foi possível encontrar o evento deste documento. Recarrega a página e volta a tentar a partir da ficha do evento.",
          );
          // Volta à lista em vez de deixar o ecrã eternamente "a
          // preparar": ela fica com o aviso à vista E com um sítio onde
          // continuar.
          navigate(caminhoDoSeparador("orcamentos"), { replace: true });
          return;
        }
        const dados = await getDadosParaDocumento(evento, eventTypes);
        if (!cancelado) setDocumentoContexto({ ...dados, tipoDoc: docTipo });
      } catch (e) {
        console.error("Erro ao preparar o documento:", e);
        if (!cancelado) {
          setErroEstado(
            "Não foi possível preparar o documento. Volta à ficha do evento e tenta outra vez.",
          );
        }
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docEventoId, docTipo, loading, loadingEventTypes, submissions, eventTypes]);

  // Chamado pela Lista de Documentos ao clicar num documento: o mesmo
  // caminho do drawer (contexto pré-preenchido do evento). A lista só
  // mostra documentos de eventos — no domínio, um documento nunca
  // existe isolado.
  const handleAbrirDocumentoDaLista = (doc) => {
    navigate(
      `${caminhoDoSeparador("orcamentos")}/${doc.submission_id}/${doc.tipo}`,
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
    const { convite, estado } = estadoFormularioDoEvento(
      invites,
      submissao.id,
    );
    if (estado === "pendente") {
      handlePreencherFormulario(convite);
    } else {
      // rede de segurança: sem convite legível, ao menos a lista
      navegarPara("convites");
      setShowNewInvite(false);
    }
  };

  const handleFormularioDoEvento = (submissao) => {
    // A guarda que impede o pior desta família: sem saber que convites
    // existem, este caminho concluiria «este evento não tem formulário»
    // e criaria um NOVO — que, ao ser preenchido, faz nascer um cliente
    // e um evento DUPLICADOS em vez de actualizar os que já existem.
    // Perante o desconhecido, não se adivinha: diz-se e pára-se.
    if (convitesPorChegar) {
      navegarPara("convites");
      setAvisoConvites(
        "Ainda não foi possível ler os formulários que já existem. Recarrega a página antes de criar um novo — criá-lo às cegas pode duplicar o cliente e o evento.",
      );
      return;
    }
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
    navegarPara("convites");
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

  // O botão "Criar formulário" da página do evento chega cá com o id
  // no state (o padrão do gerarDoc acima) e cumpre-se quando eventos,
  // convites e modelos já estão carregados. A decisão vem da fonte
  // única (estadoFormularioDoEvento): sem convite, abre o painel Novo
  // Formulário JÁ APONTADO ao evento (submission_alvo_id) — as
  // respostas atualizam o evento existente em vez de criar cliente +
  // evento duplicados. Pendente, abre-o para preencher; preenchido,
  // mostra as respostas. Duas frestas fechadas: se os convites não
  // carregaram, NÃO se cria nada (criar às cegas era arriscar um
  // duplicado); e o evento em falta responde com um aviso no ecrã em
  // vez de um no-op silencioso.
  const pedidoDeFormulario = location.state?.formularioDe;
  const pedidoDeFormularioConsumido = useRef(false);
  useEffect(() => {
    if (!pedidoDeFormulario || pedidoDeFormularioConsumido.current) return;
    if (loading || loadingInvites || loadingEventTypes) return;
    pedidoDeFormularioConsumido.current = true;
    // consome o pedido do histórico — voltar atrás não o repete
    navigate(caminhoDoSeparador("convites"), { replace: true, state: null });
    if (erroInvites) {
      setAvisoConvites(
        "Não foi possível ler os formulários existentes — para não criar um duplicado, recarrega a página e volta a tentar a partir da ficha do evento.",
      );
      return;
    }
    const evento = submissions.find((s) => s.id === pedidoDeFormulario);
    if (!evento) {
      setAvisoConvites(
        "Não foi possível encontrar o evento deste formulário. Recarrega a página e volta a tentar a partir da ficha do evento.",
      );
      return;
    }
    const { convite, estado } = estadoFormularioDoEvento(invites, evento.id);
    if (estado === "pendente") {
      handlePreencherFormulario(convite);
    } else if (estado === "preenchido") {
      setSelectedInvite(convite);
    } else {
      // "nenhum" — e também "preenchido-noutro": o evento continua sem
      // respostas próprias, por isso o caminho honesto é criar um
      // formulário novo já apontado (o painel avisa do convite
      // desviado no bloco "estado do alvo").
      handleFormularioDoEvento(evento);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoDeFormulario, loading, loadingInvites, loadingEventTypes]);

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

    navegarPara("convites");
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

  // Os ecos do realtime chegam em rajadas (INSERT+UPDATE do formulário,
  // o eco da própria gravação) — coalescem num só refetch SILENCIOSO
  // (sem esqueletos) 300ms depois do último evento.
  const realtimeTimerRef = useRef(null);
  const aoMudarSubmissoesRealtime = () => {
    if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
    realtimeTimerRef.current = setTimeout(() => {
      fetchSubmissions(true);
      setFunilVersao((v) => v + 1); // acorda a Lista/Funil de Clientes
    }, 300);
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
          aoMudarSubmissoesRealtime();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "submissions" },
        (payload) => {
          // A peça que faltava (família realtime-só-INSERT, Lote 4A):
          // a submissão do formulário do cliente é um UPDATE — sem
          // isto, o drawer mostrava a etapa Formulário ✓ ao lado de
          // título/data/respostas VELHOS, e era essa cópia velha que
          // armava as escritas destrutivas que o 1B fechou no servidor.
          console.log("Submissão atualizada:", payload);
          aoMudarSubmissoesRealtime();
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
      // ⚠ CORRECÇÃO DE BUG — independente do routing, assinalada à parte
      // para poder ser revista isolada da mudança estrutural.
      // O cleanup removia o canal mas NÃO limpava o temporizador de
      // 300ms que coalesce as rajadas do realtime. Um eco que chegasse
      // nos últimos 300ms antes do desmonte disparava um fetchSubmissions
      // + setFunilVersao já sem componente montado: refetch fantasma e
      // aviso de setState depois do desmonte.
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
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
      setFalhaEventTypes(false);
    } catch (e) {
      console.error("Erro ao ir buscar tipos de evento:", e);
      setFalhaEventTypes(true);
    }
    setLoadingEventTypes(false);
  };

  const fetchReservas = async () => {
    setLoadingReservas(true);
    try {
      const data = await getReservas();
      setReservas(data);
      setFalhaReservas(false);
    } catch (e) {
      console.error("Erro ao ir buscar reservas:", e);
      setFalhaReservas(true);
    }
    setLoadingReservas(false);
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
      setAvisoConvites(null);
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

  // "É deste evento" no aviso de pendentes órfãos do painel: em vez de
  // criar um SEGUNDO convite, aponta o antigo ao evento escolhido. A
  // guarda (só convites por preencher) vive no servidor, em
  // apontarConviteAoEvento.
  const handleApontarConvite = async (convite) => {
    if (!newInvite.submissionAlvoId) return;
    try {
      const atualizado = await apontarConviteAoEvento(
        convite.id,
        newInvite.submissionAlvoId,
      );
      setInvites((prev) =>
        prev.map((i) => (i.id === atualizado.id ? atualizado : i)),
      );
      setShowNewInvite(false);
      setEventoContexto(null);
      setNewInvite((prev) => ({ ...prev, submissionAlvoId: null }));
      setAvisoConvites(null);
      setSelectedInvite(atualizado);
    } catch (e) {
      console.error("Erro ao apontar o convite ao evento:", e);
      setAvisoConvites(
        "Não foi possível apontar o formulário ao evento (pode ter sido preenchido entretanto). Recarrega a página e tenta outra vez.",
      );
    }
  };

  const handleDeleteInvite = async () => {
    const { error } = await supabase
      .from("invites")
      .delete()
      .eq("id", inviteToDelete.id);
    if (error) {
      console.error("Erro ao remover convite:", error);
      // Fecha o modal ANTES de avisar — o véu escuro dele tapava a barra.
      setInviteToDelete(null);
      setAvisoConvites("Não foi possível remover o formulário. Tenta novamente.");
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

  // `silencioso`: os refetches do realtime não mostram esqueletos — o
  // Início piscava a cada gravação. O contador de sequência descarta
  // respostas fora de ordem (dois UPDATEs seguidos podiam deixar a
  // lista presa no snapshot mais velho).
  const fetchSeqRef = useRef(0);
  const fetchSubmissions = async (silencioso = false) => {
    const seq = ++fetchSeqRef.current;
    if (!silencioso) setLoading(true);
    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .order("data_evento", { ascending: true });
    // ⚠ CORRECÇÃO DE BUG (anterior a este trabalho, exposta por ele):
    // uma chamada OBSOLETA não pode tocar em NADA — nem sequer no
    // `loading`. Antes, o guarda de sequência só protegia os dados, mas
    // o setLoading(false) do fim corria na mesma: com duas buscas em voo
    // (o StrictMode dispara o efeito de arranque duas vezes), a primeira
    // a resolver anunciava "já não estou a carregar" com a lista ainda
    // VAZIA. Quem lesse `submissions` nessa janela concluía que o evento
    // não existia — foi assim que abrir um documento a partir da ficha
    // do evento passou a dar "não foi possível encontrar o evento".
    if (seq !== fetchSeqRef.current) return;
    setFalhaSubmissions(!!error);
    if (error) {
      // Antes: o erro era engolido sem console e sem estado, e a lista
      // ficava vazia para SEMPRE — a janela transitória virava mentira
      // permanente.
      console.error("Erro ao ir buscar eventos:", error);
    }
    if (!error) {
      const normalizadas = data.map(normalizeSubmission);
      setSubmissions(normalizadas);
      // O drawer aberto acompanha: a prop selected era uma cópia que
      // nenhum refetch tocava — ficava velha mesmo com a lista fresca.
      // O merge preserva chaves extra (ex.: clientes, do funil).
      setSelected((prev) => {
        if (!prev) return prev;
        const fresca = normalizadas.find((s) => s.id === prev.id);
        return fresca ? { ...prev, ...fresca } : prev;
      });
    }
    if (!silencioso) setLoading(false);
  };

  const invitesSeqRef = useRef(0);
  const fetchInvites = async () => {
    // Guarda de sequência, como a das submissões: uma resposta obsoleta
    // não pode tocar em nada — nem nos dados, nem no erro, nem no
    // indicador de carga.
    const seq = ++invitesSeqRef.current;
    setLoadingInvites(true);
    const { data, error } = await supabase
      .from("invites")
      .select("*")
      .order("created_at", { ascending: false });
    if (seq !== invitesSeqRef.current) return;
    if (!error) {
      setInvites(data);
      setErroInvites(null);
    } else {
      console.error("Erro ao ir buscar convites:", error);
      setErroInvites(
        "Não foi possível carregar os formulários. Recarrega a página.",
      );
    }
    setLoadingInvites(false);
  };

  // Um erro de mudança de estado (a Jornada do drawer chama isto)
  // responde no ecrã, nunca num diálogo do browser — o mesmo registo
  // da página de evento.
  const [erroEstado, setErroEstado] = useState(null);

  const handleStatusChange = async (id, newStatus, fase) => {
    try {
      const atualizado = await updateStatus(id, newStatus, fase);
      // Merge normalizado, nunca substituição pela linha crua: a linha
      // da BD traz as colunas antigas a null e perderia chaves extra
      // (ex.: clientes, quando o drawer veio do funil).
      const fresca = normalizeSubmission(atualizado);
      setSubmissions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...fresca } : s)),
      );
      if (selected?.id === id) setSelected((prev) => ({ ...prev, ...fresca }));
      setFunilVersao((v) => v + 1);
      setErroEstado(null);
    } catch (e) {
      console.error(e);
      setErroEstado(e.message || "Não foi possível mudar o estado.");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // replace: depois de sair, o «voltar» não deve reentrar no
    // backoffice (que só mostraria o ecrã de sessão a expirar).
    navigate("/admin/login", { replace: true });
  };

  // A secção Documentos tem DOIS modos: documento aberto (chega-se cá
  // pelo drawer do evento ou pela Lista) ou a Lista de Documentos —
  // o modo por omissão e a entrada principal da secção.
  // Decide-se pelo ENDEREÇO, não pelo contexto já composto: enquanto o
  // contexto se prepara, a secção tem de continuar a ser "o documento" —
  // senão piscava a lista no meio.
  const documentoAberto = !!(docEventoId && docTipo);

  // «Por chegar» = ainda a carregar OU falhou. Nos dois casos a vista
  // não SABE, e não saber nunca deve ser dito como «não há nada».
  const eventosPorChegar = loading || falhaSubmissions;
  const convitesPorChegar = loadingInvites || !!erroInvites;
  const modelosPorChegar = loadingEventTypes || falhaEventTypes;
  const reservasPorChegar = loadingReservas || falhaReservas;

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--cream)",
        fontFamily: "Inter, sans-serif",
        display: ehDesktop ? "flex" : "block",
      }}
    >
      {/* Slug desconhecido: corrige o URL para o Início, sem deixar a
          entrada errada no histórico. Vai aqui, e não num return
          antecipado, porque este componente tem dezenas de hooks e um
          return a meio partia a ordem deles. Enquanto o redireccionamento
          não acontece, o ecrã já mostra o Início — não pisca nada. */}
      {!idDoSeparador && (
        <Navigate to={caminhoDoSeparador(SEPARADOR_POR_OMISSAO)} replace />
      )}

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
            loading={eventosPorChegar || modelosPorChegar || convitesPorChegar}
            onAbrirEvento={(ev) => setSelected(ev)}
            onNavegar={navegarPara}
            onDadosMudaram={fetchSubmissions}
          />
        )}

        {/* ---- TAB MENSAGENS (biblioteca de mensagens-tipo) ---- */}
        {activeTab === "mensagens" && <MensagensTab />}

        {/* ---- TAB CLIENTES ----
             Com um id no caminho (/admin/clientes/:clienteId) mostra-se
             a casa dessa cliente; sem ele, a lista/funil de sempre. É a
             mesma secção do menu — por isso o item «Clientes» continua
             aceso nos dois casos. */}
        {activeTab === "clientes" && p1 && (
          <AvisosBloqueantes pagina="clientes">
            <ClienteVista
              key={p1}
              eventTypes={eventTypes}
              onDadosMudaram={fetchSubmissions}
              refrescarEm={funilVersao}
            />
          </AvisosBloqueantes>
        )}
        {activeTab === "clientes" && !p1 && (
          <AvisosBloqueantes pagina="clientes">
            <ClientesLista
              eventTypes={eventTypes}
              onAbrirEvento={(ev) => setSelected(ev)}
              onDadosMudaram={fetchSubmissions}
              refrescarEm={funilVersao}
              verPerdidos={pedidoVerPerdidos}
              aoConsumirVerPerdidos={() => setPedidoVerPerdidos(null)}
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

            {/* Avisos do fluxo de convites — a resposta no ecrã que
                substitui os antigos silêncios (evento não encontrado,
                convites por carregar, apontar falhado) */}
            {(avisoConvites || erroInvites) && (
              <div
                style={{
                  fontSize: "12.5px",
                  color: "#B91C1C",
                  backgroundColor: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  margin: "0 0 16px 0",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                }}
              >
                <span style={{ flex: 1 }}>⚠ {avisoConvites || erroInvites}</span>
                {avisoConvites && (
                  <button
                    onClick={() => setAvisoConvites(null)}
                    aria-label="Fechar aviso"
                    style={{
                      border: "none",
                      background: "none",
                      color: "#B91C1C",
                      cursor: "pointer",
                      fontSize: "14px",
                      lineHeight: 1,
                      padding: "0 2px",
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

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
                  setCreatedInvite(null);
                  setAvisoConvites(null);
                  // Com o painel JÁ aberto (por uma reserva ou por um
                  // evento), o clique não desliga nada — limpar o
                  // contexto a meio abortava a conversão da reserva em
                  // silêncio.
                  if (showNewInvite) return;
                  // ABRIR pelo botão genérico limpa QUALQUER alvo que
                  // tenha ficado de um fluxo anterior (drawer/Jornada/
                  // página do evento) — um alvo obsoleto esquecido fazia
                  // as respostas de um cliente novo caírem no evento
                  // errado. O seletor "Formulário para" dentro do painel
                  // volta a apontar quando for essa a intenção.
                  setReservaContexto(null);
                  setEventoContexto(null);
                  setNewInvite((prev) => ({
                    ...prev,
                    reservaId: null,
                    submissionAlvoId: null,
                  }));
                  setShowNewInvite(true);
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
                // Convites pendentes ÓRFÃOS (sem alvo e por preencher):
                // cada um é uma porta aberta à duplicação — se for de um
                // cliente que já existe, o preenchimento cria cliente +
                // evento novos. O aviso mostra-os antes de se criar mais
                // um; com um evento-alvo escolhido, "É deste evento"
                // adota o antigo em vez de criar um segundo.
                const pendentesSemAlvo = invites.filter(
                  (i) =>
                    i.status !== "Preenchido" &&
                    !i.submission_id &&
                    !i.submission_alvo_id,
                );
                // O evento-alvo escolhido e o estado do formulário
                // DELE — para avisar quando já existe um convite
                // (pendente, respondido, ou desviado para um duplicado)
                // antes de se criar mais um.
                const alvoSelecionado = newInvite.submissionAlvoId
                  ? submissions.find(
                      (s) => s.id === newInvite.submissionAlvoId,
                    ) || null
                  : null;
                const estadoDoAlvo = alvoSelecionado
                  ? estadoFormularioDoEvento(invites, alvoSelecionado.id)
                  : null;

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

                      {/* O ALVO do formulário — a diferença entre
                          ATUALIZAR um evento existente e criar cliente +
                          evento novos. Antes só se chegava a um convite
                          apontado por caminhos programáticos (drawer,
                          Jornada, página do evento); criado à mão, o
                          convite nascia sempre órfão — a porta da
                          duplicação. Escolher "nenhum" limpa o alvo. */}
                      {!reservaContexto && (
                        <div style={{ marginBottom: "14px" }}>
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
                            Formulário para
                          </label>
                          <select
                            value={newInvite.submissionAlvoId || ""}
                            onChange={(e) => {
                              const alvoId = e.target.value;
                              if (!alvoId) {
                                setEventoContexto(null);
                                setNewInvite((prev) => ({
                                  ...prev,
                                  submissionAlvoId: null,
                                }));
                                return;
                              }
                              const submissao = submissions.find(
                                (s) => s.id === alvoId,
                              );
                              if (!submissao) return;
                              // Só muda o ALVO — o tipo, os campos e o
                              // que já está escrito no painel ficam
                              // como estão (mudar de ideias não pode
                              // apagar trabalho).
                              const tipoDoAlvo = eventTypes.find(
                                (et) => et.id === submissao.event_type_id,
                              );
                              const resumoDoAlvo = getResumoSubmissao(
                                submissao,
                                eventTypes,
                              );
                              setEventoContexto({
                                id: submissao.id,
                                titulo: resumoDoAlvo.titulo,
                                tipoNome: tipoDoAlvo?.nome || "",
                                data: submissao.data_evento || null,
                              });
                              setNewInvite((prev) => ({
                                ...prev,
                                submissionAlvoId: submissao.id,
                              }));
                            }}
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
                            <option value="">
                              Cliente novo — cria cliente e evento
                            </option>
                            {submissions.map((s) => {
                              const r = getResumoSubmissao(s, eventTypes);
                              return (
                                <option key={s.id} value={s.id}>
                                  {r.titulo}
                                  {s.data_evento ? ` · ${s.data_evento}` : ""}
                                  {" — atualiza este evento"}
                                </option>
                              );
                            })}
                          </select>
                          {/* Decisão de 27/07 (docs/decisoes-de-produto.md):
                              a RPC NÃO recusa convite sem alvo — recusaria
                              no ecrã da cliente, que não tem como corrigir.
                              O aviso vive AQUI, na criação, não-bloqueante. */}
                          {/* Quando há convites órfãos, o bloco deles
                              (abaixo) já pede exatamente esta ação —
                              dois blocos âmbar iguais diluíam-se. */}
                          {!newInvite.submissionAlvoId &&
                            pendentesSemAlvo.length === 0 && (
                              <p
                                style={{
                                  fontSize: "11.5px",
                                  color: "#92400E",
                                  backgroundColor: "#FEF3E2",
                                  border: "1px solid #F0D9B5",
                                  borderRadius: "8px",
                                  padding: "8px 12px",
                                  margin: "8px 0 0 0",
                                  lineHeight: 1.6,
                                }}
                              >
                                Sem evento escolhido, quando ela submeter
                                nasce sempre um <strong>evento novo</strong>.
                                O cartão de cliente só é reaproveitado se o
                                telefone que ela preencher coincidir com o já
                                registado — com um número novo, em falta ou
                                incompleto, nasce também um cartão em
                                duplicado. Se este formulário é para alguém
                                que já está no funil, escolhe o evento dela
                                aqui em cima.
                              </p>
                            )}
                        </div>
                      )}

                      {/* O estado do formulário do ALVO escolhido — já
                          tem convite pendente? respondido? desviado
                          para um duplicado? Diz-se ANTES de se criar
                          mais um. */}
                      {estadoDoAlvo && estadoDoAlvo.estado !== "nenhum" && (
                        <p
                          style={{
                            fontSize: "12px",
                            color: "#92400E",
                            backgroundColor: "#FEF3E2",
                            border: "1px solid #F0D9B5",
                            borderRadius: "10px",
                            padding: "10px 14px",
                            margin: "0 0 16px 0",
                            lineHeight: "1.6",
                          }}
                        >
                          {estadoDoAlvo.estado === "pendente"
                            ? `⚠ Este evento já tem um formulário por preencher (código ${estadoDoAlvo.convite.code}). Partilha ou preenche esse — criar um segundo deixa dois códigos vivos para a mesma cliente.`
                            : estadoDoAlvo.estado === "preenchido"
                              ? `ℹ Este evento já tem um formulário respondido (código ${estadoDoAlvo.convite.code}). Um novo formulário volta a atualizar o evento por cima das respostas existentes.`
                              : `⚠ O convite ${estadoDoAlvo.convite.code} apontado a este evento foi preenchido, mas as respostas ficaram noutro evento (o rasto de um duplicado por reparar). Criar aqui um formulário novo apontado é o caminho certo.`}
                        </p>
                      )}

                      {!reservaContexto && pendentesSemAlvo.length > 0 && (
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#92400E",
                            backgroundColor: "#FEF3E2",
                            border: "1px solid #F0D9B5",
                            borderRadius: "10px",
                            padding: "12px 14px",
                            marginBottom: "16px",
                            lineHeight: "1.6",
                          }}
                        >
                          <p style={{ margin: "0 0 6px 0", fontWeight: "700" }}>
                            ⚠{" "}
                            {pendentesSemAlvo.length === 1
                              ? "Há um formulário pendente sem evento associado"
                              : `Há ${pendentesSemAlvo.length} formulários pendentes sem evento associado`}
                          </p>
                          <p style={{ margin: "0 0 8px 0" }}>
                            Se algum for desta cliente, não cries um segundo —
                            {newInvite.submissionAlvoId
                              ? " usa «É deste evento» para o apontar ao evento escolhido."
                              : " escolhe primeiro o evento em «Formulário para» e aponta-o."}
                          </p>
                          <ul style={{ margin: 0, paddingLeft: "18px" }}>
                            {pendentesSemAlvo.slice(0, 4).map((c) => {
                              const tipoDoConvite = eventTypes.find(
                                (et) => et.id === c.event_type_id,
                              );
                              // Apontar só quando é seguro: sem reserva
                              // pendurada e com o MESMO tipo de evento
                              // do alvo (um convite de Batizado adotado
                              // por um Casamento reescreveria o tipo e
                              // faria merge de respostas de outro
                              // modelo).
                              const podeApontar =
                                !!alvoSelecionado &&
                                !c.reserva_id &&
                                (!c.event_type_id ||
                                  c.event_type_id ===
                                    alvoSelecionado.event_type_id);
                              return (
                                <li key={c.id} style={{ marginBottom: "4px" }}>
                                  {getTituloConvite(c, submissions, eventTypes)}{" "}
                                  · {c.code}
                                  {tipoDoConvite
                                    ? ` · ${tipoDoConvite.nome}`
                                    : ""}
                                  {podeApontar && (
                                    <button
                                      onClick={() => handleApontarConvite(c)}
                                      style={{
                                        marginLeft: "8px",
                                        padding: "3px 10px",
                                        borderRadius: "999px",
                                        fontSize: "11px",
                                        fontWeight: "600",
                                        border: "1px solid #F0D9B5",
                                        backgroundColor: "white",
                                        color: "#92400E",
                                        cursor: "pointer",
                                      }}
                                    >
                                      É deste evento
                                    </button>
                                  )}
                                </li>
                              );
                            })}
                            {pendentesSemAlvo.length > 4 && (
                              <li>
                                … e mais {pendentesSemAlvo.length - 4} na lista
                                abaixo.
                              </li>
                            )}
                          </ul>
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
              loading={loadingInvites || eventosPorChegar}
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
            dadosPorChegar={eventosPorChegar || reservasPorChegar}
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
          <OperacionalTab
            submissions={submissions}
            eventTypes={eventTypes}
            eventosPorChegar={eventosPorChegar}
          />
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
            eventosPorChegar={eventosPorChegar || modelosPorChegar}
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
              onClick={() =>
                navigate(caminhoDoSeparador("orcamentos"), { replace: true })
              }
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
            {!documentoContexto ? (
              <p style={{ fontSize: "13px", color: "var(--gray-mid)" }}>
                A preparar o documento…
              </p>
            ) : (
            <DocumentosTab
              key={`doc-${documentoContexto.submissionId}`}
              contexto={documentoContexto}
              onTrocarTipo={(t) =>
                navigate(
                  `${caminhoDoSeparador("orcamentos")}/${docEventoId}/${t}`,
                  { replace: true },
                )
              }
              onDadosMudaram={fetchSubmissions}
              onVoltarAoEvento={
                documentoContexto?.submissionId
                  ? () => {
                      const ev = submissions.find(
                        (x) => x.id === documentoContexto.submissionId,
                      );
                      navegarPara("clientes");
                      if (ev) setSelected(ev);
                    }
                  : null
              }
            />
            )}
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
        convitesPorChegar={convitesPorChegar}
        selected={selected}
        eventTypes={eventTypes}
        onClose={() => setSelected(null)}
        onRecuperarPerdido={(id) => {
          // A recuperação informada vive no funil — a pílula leva lá,
          // nunca recupera por conta própria.
          setSelected(null);
          navegarPara("clientes");
          setPedidoVerPerdidos(id);
        }}
        onStatusChange={handleStatusChange}
        onSaved={(atualizada) => {
          // O mesmo padrão do handleStatusChange: merge NORMALIZADO,
          // nunca a linha crua a substituir (as colunas antigas a null
          // esmagavam as preenchidas e o drawer piscava dados a menos).
          const fresca = normalizeSubmission(atualizada);
          setSubmissions((prev) =>
            prev.map((s) =>
              s.id === atualizada.id ? { ...s, ...fresca } : s,
            ),
          );
          setSelected((prev) =>
            prev && prev.id === atualizada.id ? { ...prev, ...fresca } : prev,
          );
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

      {/* Erro de mudança de estado — acima do drawer (z 50), no mesmo
          registo da barra de erro da página de evento. */}
      {erroEstado && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: "24px",
            transform: "translateX(-50%)",
            zIndex: 120,
            display: "flex",
            alignItems: "center",
            gap: "14px",
            width: "min(560px, calc(100vw - 48px))",
            backgroundColor: "white",
            border: "1.5px solid #FECACA",
            borderRadius: "14px",
            padding: "12px 16px",
            boxShadow: "0 14px 36px rgba(26,26,26,0.18)",
          }}
        >
          <span style={{ fontSize: "13px", color: "#B91C1C" }}>
            {erroEstado}
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setErroEstado(null)}
            className="ligacao"
            style={{ fontSize: "12.5px", color: "var(--gray-mid)" }}
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}