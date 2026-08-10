import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate, useParams, Navigate } from "react-router-dom";
import {
  SEPARADOR_POR_OMISSAO,
  caminhoDeSlugAntigo,
  caminhoDoSeparador,
  idDoSlug,
} from "../lib/rotasAdmin";
import { supabase } from "../lib/supabase";
import { EMPRESA, LINHA_BY_LUXURY, SLOGAN_CASA } from "../lib/casa";
import {
  createInvite,
  ehFormularioOrfao,
  getEventTypes,
  apontarConviteAoEvento,
} from "../lib/invites";
import {
  abrirQuestionarioComoCliente,
  dataDoRascunho,
  getDefaultCampos,
  getTituloConvite,
  validarRascunho,
} from "../lib/camposFormulario";
import {
  normalizeSubmission,
  getValorAtual,
} from "../lib/submissionFields";
import {
  getDadosParaDocumento,
  getEventoCompleto,
  updateStatus,
} from "../lib/clientes";
import EventTypesTab from "../components/admin/EventTypesTab";
import SubmissionDrawer from "../components/admin/SubmissionDrawer";
import DashboardTab from "../components/admin/DashboardTab";
import ClientesLista from "../components/admin/ClientesLista";
import ClienteVista from "../components/admin/ClienteVista";
import PainelNovoFormulario from "../components/admin/PainelNovoFormulario";
import FormulariosOrfaos from "../components/admin/FormulariosOrfaos";
import LacunasFormulario from "../components/admin/LacunasFormulario";
import { ehLacunaDeFormulario } from "../components/admin/faseConfig";
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
import AvaliacoesTab from "../components/admin/AvaliacoesTab";
import MensagensTab from "../components/admin/MensagensTab";
import ComunicadosTab from "../components/admin/ComunicadosTab";
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
import { useNotificacoes, TIPOS_DO_ACOMPANHAMENTO } from "../lib/notificacoes";
import { getReservas } from "../lib/reservas";
import { motion, AnimatePresence } from "framer-motion";

// Gera um título legível para um formulário (ex: "André & Andreia").
// Delega no getResumoSubmissao (a lógica genérica com papéis), construindo
// uma "fonte" a partir da submissão real (se o convite já foi preenchido)
// ou do que a irmã pré-preencheu no convite. Só acrescenta o código do
// convite quando não há título real, para o card ter sempre um id útil.
// Os dados que a captação já recolheu sobre o evento-alvo — para a
// Nádia consultar e COPIAR enquanto compõe o formulário (em vez de
// o cliente ver um cartão na página pública, que ela dispensou).
// O DadosCaptacao mudou-se para components/admin/PainelNovoFormulario.jsx
// (único consumidor). As funções de campos e o título de um convite
// mudaram-se para lib/camposFormulario.js, porque passaram a ter dois
// donos: esta página e o painel extraído.

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

  // O toast da FICHA DO EVENTO também promete «ver o pedido»: chega cá
  // por state e a Caixa abre já expandida. Consumo DURANTE o render
  // (estado preso ao location.state, o padrão do realce); só a limpeza
  // do histórico fica no efeito.
  const destaqueDoState = location.state?.notifDestaque;
  if (destaqueDoState && notifDestaque !== destaqueDoState) {
    setNotifDestaque(destaqueDoState);
    setNotifAberto(true);
  }
  useEffect(() => {
    if (!location.state?.notifDestaque) return;
    navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  // "Abrir ficha completa" de uma notificação → o sítio onde o PRÓPRIO
  // aviso manda ir. Um pedido de código diz «emita o código na folha do
  // evento» — abrir o drawer da captação era prometer uma coisa e
  // entregar outra. Só a captação fica no drawer.
  // Datas com mais do que um evento vivo — a marca âmbar «dia disputado»
  // dos avisos da Caixa (decisão de 09/08). Deriva em leitura, como toda
  // a disputa; dias passados já não disputam nada. Comparações por string
  // YYYY-MM-DD com a data LOCAL, a regra da casa.
  const datasDisputadas = useMemo(() => {
    const agora = new Date();
    const hojeISO = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
    const porData = new Map();
    (submissions || []).forEach((s) => {
      const dia = String(s.data_evento || "").slice(0, 10);
      if (!dia || s.fase === "perdido" || dia < hojeISO) return;
      porData.set(dia, (porData.get(dia) || 0) + 1);
    });
    return new Set(
      [...porData].filter(([, n]) => n > 1).map(([dia]) => dia),
    );
  }, [submissions]);

  const handleAbrirEventoDeNotificacao = async (submissionId, tipo) => {
    if (!submissionId) return;
    // Os avisos cuja casa é a folha do Acompanhamento — a lista única
    // vive em notificacoes.js, com o porquê de cada tipo.
    if (TIPOS_DO_ACOMPANHAMENTO.includes(tipo)) {
      setNotifAberto(false);
      navigate(`/evento/${submissionId}`, {
        state: { abrirAcompanhamento: true },
      });
      return;
    }
    // As respostas lêem-se na própria página do evento.
    if (tipo === "questionario_entregue") {
      setNotifAberto(false);
      navigate(`/evento/${submissionId}`);
      return;
    }
    // A avaliação vive no separador Avaliações.
    if (tipo === "avaliacao_recebida") {
      setNotifAberto(false);
      navigate(caminhoDoSeparador("avaliacoes"));
      return;
    }
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
        "Não foi possível abrir este evento — recarregue a página e tente novamente.",
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
    if (
      !abrirQuestionarioComoCliente(invite, eventTypes, {
        modelosPorChegar,
        avisar: setAvisoConvites,
        navegar: navigate,
      })
    ) {
      // Travou: o aviso tem de ser visto, e a barra dele vive nesta secção.
      navegarPara("convites");
    }
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
            "Não foi possível encontrar o evento deste documento. Recarregue a página e volte a tentar a partir da ficha do evento.",
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
            "Não foi possível preparar o documento. Volte à ficha do evento e tente novamente.",
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



  // O handshake «formularioDe» DESAPARECEU. Trazia no state da navegação
  // o pedido «abre o formulário deste evento», vindo da página do evento
  // — um mecanismo de uso único, consumido com replace e guardado por um
  // ref para não se repetir. Já não é preciso: a criação e o «Preencher»
  // resolvem-se DENTRO do evento, e uma intenção que não muda de página
  // não precisa de viajar por rota nenhuma.

  // ------------------------------------------------------------
  // A QUARTA PORTA, fechada (30/07/2026).
  //
  // «✓ Tornar cliente» numa reserva abria o painel de criação AQUI, no
  // separador Formulários. Deixou de o fazer: navega para a aba
  // Documentos do evento da reserva, onde a criação passou a viver.
  //
  // Podia fazê-lo porque a contagem em produção deu ZERO reservas sem
  // evento ligado — o Hélio correu-a. As reservas nascem todas com
  // evento (ver lib/reservas), portanto o caminho legado que abria o
  // painel sem alvo não tem utilizadores, e o ramo retrocompatível
  // morre com ele. Se algum dia reaparecer uma reserva sem evento, o
  // ramo de guarda abaixo di-lo em vez de abrir um painel a meio.
  //
  // Nada viaja no state a não ser o realce: o vínculo à reserva está
  // nos DADOS (reservas.submission_id) e a aba lê-o de lá. Foi assim
  // que este gesto deixou de precisar de handshake.
  // ------------------------------------------------------------
  const handleCriarQuestionarioDeReserva = (reserva) => {
    if (!reserva?.submission_id) {
      setErroEstado(
        "Esta reserva não tem evento associado, por isso não há onde criar o formulário. Converte-a primeiro em evento na Agenda.",
      );
      return;
    }
    navigate(`/evento/${reserva.submission_id}/documentos`, {
      state: { realce: { alvo: "formulario", n: Date.now() } },
    });
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




  const handleCreateInvite = async () => {
    // Valida o FORMATO dos campos que ela preencheu (ex: email inválido,
    // data no passado) — mas nunca a obrigatoriedade, já que qualquer
    // campo pode estar ausente do painel
    const errors = validarRascunho(newInvite, eventTypes);
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
        geral: "Não foi possível criar o formulário. Tente novamente.",
      });
      return;
    }

    setCreatingInvite(true);
    try {
      // ⚠ CORRECÇÃO DE BUG 1/3 — assinalada à parte da extracção.
      // Lia-se a chave LITERAL "dataEvento", mas o pré-preenchimento
      // escreve pelo id REAL do campo do modelo (gerado da etiqueta:
      // «Data do Evento» -> "dataDoEvento"). Resultado: invites.data_evento
      // ficava a NULL mesmo em eventos COM data, e os cartões da
      // supervisão diziam «Sem data» — precisamente a coluna por que uma
      // lista de lacunas se quer ordenar.
      // Mesmo padrão que o formulário público já usa (ver valorPorTipo em
      // FormPage.jsx): procura-se o primeiro campo do tipo "date" e lê-se
      // pelo id dele, com a chave literal como último recurso.
      const invite = await createInvite({
        dataEvento: dataDoRascunho(newInvite, eventTypes),
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
      setEventoContexto(null);
      setShowNewInvite(false);
    } catch (e) {
      // ⚠ CORRECÇÃO DE BUG 2/3 — assinalada à parte da extracção.
      // O catch só fazia console.error: a Nádia carregava em «Criar
      // Formulário», o botão voltava de «A criar...» ao normal, e NADA
      // acontecia nem se explicava.
      //
      // E havia um segundo silêncio, mais antigo: o `geral` que o ramo do
      // tipo em falta já escrevia NUNCA era desenhado — o painel só lia
      // newInviteErrors[campo.id], por campo. Agora há uma linha para ele
      // (ver o rodapé do painel), e é por lá que ambos falam.
      console.error("Erro ao criar o formulário:", e);
      setNewInviteErrors({
        geral:
          "Não foi possível criar o formulário. Verifique a ligação e tente novamente.",
      });
    }
    setCreatingInvite(false);
  };

  // "É deste evento" no aviso de pendentes órfãos do painel: em vez de
  // criar um SEGUNDO convite, aponta o antigo ao evento escolhido. A
  // guarda (só convites por preencher) vive no servidor, em
  // apontarConviteAoEvento.
  // O alvo passa a vir POR ARGUMENTO: a adopção deixou de ser um efeito
  // secundário de estar a criar outro formulário (onde o alvo era o do
  // painel) e passou a acto próprio, na secção dos órfãos, com uma
  // escolha por linha.
  const handleApontarConvite = async (convite, eventoId) => {
    if (!eventoId) return;
    try {
      const atualizado = await apontarConviteAoEvento(convite.id, eventoId);
      setInvites((prev) =>
        prev.map((i) => (i.id === atualizado.id ? atualizado : i)),
      );
      setAvisoConvites(null);
      setSelectedInvite(atualizado);
    } catch (e) {
      console.error("Erro ao apontar o convite ao evento:", e);
      setAvisoConvites(
        "Não foi possível apontar o formulário ao evento (pode ter sido preenchido entretanto). Recarregue a página e tente novamente.",
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
      setAvisoConvites("Não foi possível remover o formulário. Tente novamente.");
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
    return `Olá ${getTituloConvite(invite, submissions, eventTypes)}! ${emoji}\n\nO vosso questionário *Do Luxo à Mesa* está pronto.\n\nÉ só clicar aqui para começar: ${url}\n\n(O vosso código de acesso é: *${invite.code}*)\n\n${SLOGAN_CASA} ✨`;
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
        "Não foi possível carregar os formulários. Recarregue a página.",
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
  // Os formulários pendentes SEM evento associado — cada um é uma porta
  // aberta à duplicação. O cálculo vive aqui porque exige a lista GLOBAL
  // de convites, que só esta página tem.
  const orfaosPendentes = invites.filter(ehFormularioOrfao);

  // As LACUNAS: eventos que são trabalho a sério (pós-sinal), ainda por
  // acontecer, e sem formulário nenhum. Zero idas novas à base — as duas
  // listas já estão em memória. Ordenadas pela data mais próxima: é a
  // que primeiro deixa de se poder resolver.
  const hojeISO = new Date().toISOString().slice(0, 10);
  const lacunasDeFormulario = submissions
    .filter((ev) => ehLacunaDeFormulario(ev, invites, hojeISO))
    .sort((a, b) =>
      (a.data_evento || "9999").localeCompare(b.data_evento || "9999"),
    );

  // A contagem ao lado de «Formulários» no menu. É o que impede a secção
  // dos órfãos de ser uma secção silenciosa: o propósito dela é o
  // esquecimento, e uma secção que ela nunca abre não resolve
  // esquecimento nenhum. Não pulsa — só está lá.
  const contagensDoMenu = { convites: orfaosPendentes.length };

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
      {/* Slug que a app não conhece. Duas hipóteses, por esta ordem:
          1. É um slug que JÁ FOI válido (/admin/clientes, renomeado para
             /admin/contactos). Traduz-se, PRESERVANDO o resto do caminho
             — um favorito da ficha de um contacto abre a ficha certa, não
             o Início.
          2. Não é nada que a app reconheça: cai no Início.
          Vai aqui, e não num return antecipado, porque este componente
          tem dezenas de hooks e um return a meio partia a ordem deles.
          Enquanto o redireccionamento não acontece, o ecrã já mostra o
          Início — não pisca nada. */}
      {!idDoSeparador && (
        <Navigate
          to={
            caminhoDeSlugAntigo(separador, p1, p2) ||
            caminhoDoSeparador(SEPARADOR_POR_OMISSAO)
          }
          replace
        />
      )}

      {/* ===== CASCA DE NAVEGAÇÃO (bloco 12a) =====
          Desktop: sidebar lateral com tudo visível.
          Telemóvel: cabeçalho fino + barra inferior (+ folha Mais). */}
      {ehDesktop ? (
        <SidebarNav
          contagens={contagensDoMenu}
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
            {EMPRESA.designacao}
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
            {LINHA_BY_LUXURY}
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

        {/* ---- TAB COMUNICADOS (slug visível: envios) ----
            O estado da secção vive no URL, pelo precedente dos
            Documentos: /admin/envios/:p1/:p2. É o tab que traduz —
            p1='modelos' abre a bancada, p1=UUID abre o percurso desse
            comunicado, p2 ∈ {'quem-recebe','enviar'} abre o passo; um
            id inválido devolve à lista. Esta página só entrega os
            segmentos e o gesto de navegar (push: cada passo é uma
            viagem que o «voltar» deve desfazer; as CORRECÇÕES de URL
            passam opts {replace:true} — o precedente dos Documentos —
            para o «voltar» não regressar ao URL partido). */}
        {activeTab === "comunicados" && (
          <ComunicadosTab
            rotaP1={p1}
            rotaP2={p2}
            aoNavegarRota={(sub, opts) =>
              navigate(
                sub
                  ? `${caminhoDoSeparador("comunicados")}/${sub}`
                  : caminhoDoSeparador("comunicados"),
                opts,
              )
            }
          />
        )}

        {activeTab === "avaliacoes" && <AvaliacoesTab />}

        {/* ---- TAB CLIENTES ----
             Com um id no caminho (/admin/contactos/:clienteId) mostra-se
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

            {/* Botão novo Formulário — agora com a linha que diz onde é
                o resto. Sem aviso bloqueante (decisão do Hélio): o botão
                mudou de nome e traz a explicação ao lado, o que basta.
                Um portão que ela tem de reconhecer para uma mudança que
                se explica numa linha era desproporcionado. */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: "14px",
                marginBottom: "20px",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "12px",
                  color: "var(--gray-mid)",
                  textAlign: "right",
                  maxWidth: "330px",
                  lineHeight: 1.5,
                }}
              >
                Para um evento que já existe, o formulário cria-se{" "}
                <strong>no próprio evento</strong>.
              </p>
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
                + Formulário para cliente novo
              </button>
            </div>

            {/* O painel de criação — extraído para componente próprio
                (Passo 1). O estado continua a viver AQUI: este passo é
                mudança de sítio, não de comportamento. */}
            <PainelNovoFormulario
              showNewInvite={showNewInvite}
              setShowNewInvite={setShowNewInvite}
              newInvite={newInvite}
              setNewInvite={setNewInvite}
              newInviteErrors={newInviteErrors}
              setNewInviteErrors={setNewInviteErrors}
              creatingInvite={creatingInvite}
              eventTypes={eventTypes}
              submissions={submissions}
              invites={invites}
              eventoContexto={eventoContexto}
              setEventoContexto={setEventoContexto}
              /* NULL: em Formulários já não se escolhe evento. A regra da
                 casa é «o que não tem evento vive aqui; o que tem vive no
                 evento» — e um selector de eventos aqui era a segunda
                 porta para o mesmo acto. */
              eventosParaEscolher={null}
              handleCreateInvite={handleCreateInvite}
            />

            {/* Os órfãos ANTES da lista, de propósito: é o primeiro que
                ela vê ao abrir Formulários. O propósito desta secção é o
                esquecimento — pô-la no fim era garantir que não se lê. */}
            <FormulariosOrfaos
              orfaos={orfaosPendentes}
              submissions={submissions}
              eventTypes={eventTypes}
              onAdoptar={handleApontarConvite}
            />

            {/* As lacunas ANTES da lista: primeiro o que falta, depois o
                estado do que existe. Gradiente de urgência a descer. */}
            <LacunasFormulario
              lacunas={lacunasDeFormulario}
              eventTypes={eventTypes}
              invites={invites}
              aCarregar={eventosPorChegar || convitesPorChegar}
              onAbrirEvento={(ev) => navigate(`/evento/${ev.id}/documentos`)}
            />

            {/* Lista de convites — o estado do que EXISTE. Um formulário
                já criado nunca desaparece daqui, mesmo que o evento dele
                esteja numa fase que não entra nas lacunas: o critério
                decide que FALTAS se mostram, não que formulários. */}
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
                  ? // A casa própria do evento — não o drawer: o botão é
                    // anterior à EventoPage e ficou a apontar ao painel
                    // lateral quando o evento ganhou página a sério.
                    () => navigate(`/evento/${documentoContexto.submissionId}`)
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
          contagens={contagensDoMenu}
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
        datasDisputadas={datasDisputadas}
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