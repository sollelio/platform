import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { caminhoDoContacto, caminhoDoSeparador } from "../lib/rotasAdmin";
import { getEventoCompleto, updateStatus } from "../lib/clientes";
import { getEventTypes, estadoFormularioDoEvento } from "../lib/invites";
import { getPagamentosEvento, resumoPagamentos } from "../lib/pagamentos";
import {
  getResumoSubmissao,
  getValorAtual,
  seccoesDoModelo,
  normalizeSubmission,
} from "../lib/submissionFields";
import { contarAlteracoes } from "../lib/briefingEdicao";
import { getNomeTipoEvento } from "../lib/tipoEvento";
import { linkWhatsApp } from "../lib/mensagens";
import { SidebarNav } from "../components/admin/Navegacao";
import { Esqueleto } from "../components/admin/acabamento";
import CabecalhoEvento from "../components/admin/CabecalhoEvento";
import VisaoGeralEvento from "../components/admin/VisaoGeralEvento";
import PagamentosEvento from "../components/admin/PagamentosEvento";
import NotasEvento from "../components/admin/NotasEvento";
import DocumentosEvento from "../components/admin/DocumentosEvento";
import FichaMateriais from "../components/admin/FichaMateriais";

// ============================================================
// EventoPage — /evento/:id/:aba?
//
// A casa própria do evento, a entidade mais rica do sistema e a única
// que até aqui vivia emprestada num painel lateral de 400 px.
//
// A regra que decide o que entra: o drawer responde a perguntas, a
// página faz trabalho. Se a acção exige escrever, escolher, gerar ou
// conferir, é daqui.
//
// Cada separador tem endereço próprio (e por isso posição de scroll
// própria, link directo e o botão "voltar" do browser a funcionar) —
// era metade da razão para serem separadores e não secções empilhadas.
// ============================================================

const ABAS = [
  { id: "visao-geral", label: "Visão geral" },
  { id: "documentos", label: "Documentos" },
  { id: "materiais", label: "Materiais" },
  { id: "pagamentos", label: "Pagamentos" },
  { id: "notas", label: "Notas" },
];

const ABA_PREDEFINIDA = "visao-geral";

const medidaBotaoSaida = {
  padding: "9px 16px",
  borderRadius: "10px",
  fontSize: "12.5px",
  fontWeight: "500",
  whiteSpace: "nowrap",
};

// Um painel de separador: visitado uma vez, fica montado — esconder é
// display:none, nunca desmontar. O reaparecer reencena a entrada (a
// animação CSS reinicia quando o display volta a block).
function Painel({ visivel, children }) {
  return (
    <div
      className="painel-aba"
      style={{ display: visivel ? undefined : "none" }}
    >
      {children}
    </div>
  );
}

function Centrado({ children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px",
        fontSize: "14px",
        color: "var(--gray-mid)",
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

export default function EventoPage() {
  const { id, aba } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [submissao, setSubmissao] = useState(null);
  const [eventTypes, setEventTypes] = useState([]);
  const [invites, setInvites] = useState([]);
  const [plano, setPlano] = useState({ previstos: [], pagamentos: [] });
  const [estado, setEstado] = useState("a-carregar");

  // A EDIÇÃO DO BRIEFING vive aqui inteira — o modo E os rascunhos —
  // porque é aqui que sobrevive a tudo o que a página faz. Dentro da
  // Visão geral, ir a Documentos e voltar deitava fora o que estivesse
  // escrito: mudar de separador desmonta-a. Um andar acima, os
  // separadores deixam de ser uma fronteira.
  //
  // Guarda-se o ID do evento em edição, e não um sim/não: trocar de
  // evento não remonta a página, e assim o modo fecha-se sozinho ao
  // mudar de :id, sem efeito nenhum pelo meio. Os rascunhos ficam a
  // `null` até alguém escrever a primeira letra — quem os desenha sabe
  // ler os valores guardados sozinho.
  //
  // O ref é o fio por onde o "Concluir edição" do cabeçalho guarda pela
  // mão da Visão geral (é ela que fala com a base de dados).
  const [edicao, setEdicao] = useState(null);
  const controloEdicaoRef = useRef(null);
  const aEditar = edicao?.id === id;

  // Uma saída da página com trabalho por guardar pede confirmação. Guarda
  // o separador do painel a que se ia, para o levar lá depois.
  const [saidaPendente, setSaidaPendente] = useState(null);

  // Um erro de acção responde no ecrã, nunca num diálogo do browser —
  // a mesma regra da confirmação de saída.
  const [erroAccao, setErroAccao] = useState(null);

  // A pílula do próximo gesto (e o botão do drawer) navegam COM a
  // intenção: o separador de destino recebe este realce e cumpre a
  // promessa — a parcela/linha em causa acende, ou a acção abre já.
  // Consome-se UMA vez: o state da rota é logo substituído por vazio,
  // para o back/forward não repetirem o acontecimento.
  const [realce, setRealce] = useState(null);
  useEffect(() => {
    const r = location.state?.realce;
    if (!r) return;
    setRealce(r);
    navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  const activeAba = ABAS.some((a) => a.id === aba) ? aba : ABA_PREDEFINIDA;

  // MONTAGEM PERSISTENTE: um separador visitado fica montado (escondido,
  // não desmontado). É o que torna a troca instantânea — sem refetch a
  // piscar — e o que preserva o estado interno de cada um (selecções da
  // ficha, filtros das notas, formulários a meio). Mudar de EVENTO
  // limpa tudo: outra entidade, outra vida.
  const visitadas = useRef(new Set());
  const eventoDasVisitas = useRef(id);
  if (eventoDasVisitas.current !== id) {
    eventoDasVisitas.current = id;
    visitadas.current = new Set();
  }
  visitadas.current.add(activeAba);

  // MEMÓRIA DE SCROLL por separador: cada um lembra onde estava — a
  // promessa do comentário lá em cima passa a ser verdade. O listener
  // grava a posição do separador activo; ao trocar, repõe-se a do que
  // entra (ou o topo, na primeira visita).
  const scrollPorAba = useRef({});
  useEffect(() => {
    scrollPorAba.current = {};
  }, [id]);
  useEffect(() => {
    const guardar = () => {
      scrollPorAba.current[activeAba] = window.scrollY;
    };
    window.addEventListener("scroll", guardar, { passive: true });
    return () => window.removeEventListener("scroll", guardar);
  }, [activeAba]);
  useLayoutEffect(() => {
    window.scrollTo(0, scrollPorAba.current[activeAba] ?? 0);
  }, [activeAba]);

  // As contagens dos separadores — cada separador reporta a sua quando
  // monta e quando muda (documentos gerados, linhas da ficha, notas
  // escritas); a de pagamentos sai do plano que já vive aqui.
  const [contagens, setContagens] = useState({});
  const reportarContagem = useCallback((abaId, n) => {
    setContagens((c) => (c[abaId] === n ? c : { ...c, [abaId]: n }));
  }, []);
  useEffect(() => {
    setContagens({});
  }, [id]);

  // Tudo o que a página precisa, de uma vez: o evento com o cliente, os
  // modelos (o getResumoSubmissao e o getNomeTipoEvento precisam da
  // lista toda), os convites deste evento (para a Jornada saber o passo
  // do Formulário) e o plano de pagamento (para os três números).
  //
  // A guarda `cancelado` importa porque mudar de evento não remonta a
  // página (é o mesmo componente com outro :id) — sem ela, uma resposta
  // atrasada do evento anterior escrevia por cima do actual.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        // .throwOnError() nos convites: os três irmãos deste Promise.all
        // atiram quando falham, este devolvia { data: null, error } e o
        // erro era descartado. A página declarava-se «pronta» com a
        // lista de convites vazia, e a Jornada concluía «formulário por
        // criar» num evento que já tinha um respondido. Uma leitura que
        // falhou tem de parecer uma falha, não uma ausência.
        const [evento, modelos, { data: convites }, pagamentos] =
          await Promise.all([
            getEventoCompleto(id),
            getEventTypes(),
            supabase
              .from("invites")
              .select("*")
              .or(`submission_id.eq.${id},submission_alvo_id.eq.${id}`)
              .throwOnError(),
            getPagamentosEvento(id),
          ]);
        if (cancelado) return;
        if (!evento) {
          setEstado("nao-encontrado");
          return;
        }
        setSubmissao(evento);
        setEventTypes(modelos || []);
        setInvites(convites || []);
        setPlano(pagamentos);
        setEstado("pronto");
      } catch (erro) {
        if (cancelado) return;
        console.error(erro);
        setEstado("erro");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [id]);

  // O canal DESTE evento (Lote 4A): a página é onde vive a edição do
  // briefing — o sítio mais perigoso para uma base velha. A submissão
  // do formulário do cliente (um UPDATE) chega cá em direto e a base
  // fica fresca.
  //
  // SUSPENSO durante a edição do briefing (decisão do Hélio, e com
  // razão técnica verificada): os rascunhos são semeados da base no
  // INÍCIO da edição e o "o que mudou" compara rascunho vs base — se a
  // base mudasse por baixo a meio, um campo que a cliente alterou e a
  // Nádia nunca tocou passava a contar como "alterado por ela" e o
  // guardar reescrevia o valor VELHO por cima da resposta fresca (o
  // 1B ressuscitado pela comparação). O último UPDATE recebido fica em
  // espera num ref e aplica-se quando a edição fecha.
  const aEditarRef = useRef(false);
  aEditarRef.current = aEditar;
  const temSubmissao = !!submissao;
  const updatePendenteRef = useRef(null);
  useEffect(() => {
    const canal = supabase
      .channel(`evento-${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "submissions",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          if (!payload.new) return;
          if (aEditarRef.current) {
            updatePendenteRef.current = payload.new;
            return;
          }
          setSubmissao((s) => {
            // ARQUIVA quando o evento ainda não pousou. O canal
            // subscreve antes de a carga inicial terminar, e um UPDATE
            // que chegasse nessa janela caía no `s ? … : s` e era
            // deitado fora sem rasto — a página ficava a mostrar um
            // retrato já desactualizado até alguém recarregar. A
            // decisão vive aqui dentro porque é aqui que se tem o
            // estado FRESCO em mão, sem depender de um fecho antigo.
            if (!s) {
              updatePendenteRef.current = payload.new;
              return s;
            }
            return { ...s, ...normalizeSubmission(payload.new) };
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [id]);

  // A retoma: a edição fechou (guardada ou abandonada) e algo chegou
  // entretanto — relê-se a linha FRESCA em vez de aplicar o payload
  // arquivado, que já pode ser mais velho do que a gravação dela
  // (aplicá-lo reescreveria as chaves acabadas de guardar).
  useEffect(() => {
    if (aEditar || !temSubmissao || !updatePendenteRef.current) return;
    updatePendenteRef.current = null;
    let cancelado = false;
    (async () => {
      const { data } = await supabase
        .from("submissions")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!cancelado && data) {
        setSubmissao((s) => (s ? { ...s, ...normalizeSubmission(data) } : s));
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [aEditar, id, temSubmissao]);

  // Só o plano volta a ser lido quando se regista um pagamento — o
  // resto da página não mudou.
  const recarregarPlano = useCallback(async () => {
    try {
      setPlano(await getPagamentosEvento(id));
    } catch (erro) {
      console.error(erro);
    }
  }, [id]);

  // A contagem de Pagamentos sai do plano que já vive aqui — sem
  // esperar que o separador seja visitado.
  useEffect(() => {
    reportarContagem("pagamentos", plano.pagamentos.length);
  }, [plano.pagamentos.length, reportarContagem]);

  const resumoEvento = useMemo(
    () => getResumoSubmissao(submissao, eventTypes),
    [submissao, eventTypes],
  );
  const resumoDinheiro = useMemo(
    () => resumoPagamentos(submissao?.valor_acordado, plano.pagamentos),
    [submissao?.valor_acordado, plano.pagamentos],
  );
  const seccoes = useMemo(() => {
    const tipo = eventTypes.find((et) => et.id === submissao?.event_type_id);
    return seccoesDoModelo(tipo);
  }, [eventTypes, submissao?.event_type_id]);

  // Quanto está por guardar, visto de fora da Visão geral: é o que põe o
  // ponto dourado no separador (de qualquer outro se vê que ficou
  // trabalho a meio) e o que faz a saída da página perguntar antes.
  const porGuardar = useMemo(
    () => (aEditar ? contarAlteracoes(submissao, seccoes, edicao.rascunhos) : 0),
    [aEditar, edicao, submissao, seccoes],
  );

  const abasComAviso = useMemo(
    () =>
      ABAS.map((a) => ({
        ...a,
        porGuardar:
          a.id === "visao-geral" && porGuardar > 0 ? porGuardar : undefined,
        // 0 não é etiqueta — só se mostra contagem quando há o que contar
        contagem: contagens[a.id] > 0 ? contagens[a.id] : undefined,
      })),
    [porGuardar, contagens],
  );

  // A entrada da página mais importante do sistema não é uma frase
  // nua: é a forma do que vem, em blocos calmos — cabeçalho, Jornada,
  // separadores, conteúdo.
  if (estado === "a-carregar")
    return (
      <div style={{ display: "flex", backgroundColor: "var(--cream)", minHeight: "100vh" }}>
        <SidebarNav
          activeTab="clientes"
          onNavegar={(tab) => navigate(caminhoDoSeparador(tab))}
          onSair={async () => {
            await supabase.auth.signOut();
            navigate("/admin/login", { replace: true });
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              backgroundColor: "white",
              borderBottom: "1px solid #F0E6D0",
              padding: "18px 40px 0",
            }}
          >
            <Esqueleto w={92} h={10} style={{ marginBottom: 14 }} />
            <Esqueleto w={320} h={26} style={{ marginBottom: 12 }} />
            <Esqueleto w={250} h={12} style={{ marginBottom: 18 }} />
            <Esqueleto h={88} r={12} style={{ marginBottom: 14 }} />
            <div style={{ display: "flex", gap: 8 }}>
              {[78, 96, 82, 100, 62].map((w, i) => (
                <Esqueleto key={i} w={w} h={34} r="10px 10px 0 0" />
              ))}
            </div>
          </div>
          <div style={{ padding: "24px 40px" }}>
            <Esqueleto h={110} r={14} style={{ marginBottom: 16 }} />
            <Esqueleto h={230} r={14} />
          </div>
        </div>
      </div>
    );
  if (estado === "nao-encontrado")
    return (
      <Centrado>
        <div>
          <p style={{ margin: "0 0 10px" }}>Este evento já não existe.</p>
          <button
            onClick={() => navigate(caminhoDoSeparador("clientes"))}
            className="ligacao"
            style={{
              color: "var(--gold-dark)",
              textDecoration: "underline",
            }}
          >
            ← Voltar ao painel
          </button>
        </div>
      </Centrado>
    );
  if (estado === "erro")
    return <Centrado>Não foi possível abrir o evento. Tenta recarregar.</Centrado>;

  const numeroWhatsapp =
    getValorAtual(submissao, "numeroWhatsapp") ||
    getValorAtual(submissao, "contactoPrincipal") ||
    null;
  const ligacaoWhatsApp = numeroWhatsapp ? linkWhatsApp(numeroWhatsapp) : null;

  // Mudar de separador não mexe na edição: ela fica onde estava, e a
  // Visão geral encontra-a intacta quando se voltar.
  const irParaAba = (novaAba) => {
    navigate(`/evento/${id}/${novaAba}`, { replace: false });
  };

  // "Editar" abre o briefing todo em campos de escrita; o mesmo botão,
  // já aberto, é "Concluir edição" e guarda o que estiver por guardar.
  const alternarEdicao = () => {
    // Noutro separador o botão é o caminho de volta: retoma a edição que
    // ficou a meio (ou abre uma nova) e leva ao sítio onde ela se vê.
    if (activeAba !== "visao-geral") {
      if (!aEditar) setEdicao({ id, rascunhos: null });
      irParaAba("visao-geral");
      return;
    }
    if (!aEditar) {
      setEdicao({ id, rascunhos: null });
      return;
    }
    // Sem nada montado do outro lado (um evento sem modelo associado
    // não tem campos para editar), "Concluir" é só fechar.
    const controlo = controloEdicaoRef.current;
    if (controlo?.guardar) controlo.guardar();
    else setEdicao(null);
  };

  // O drawer manda para tabs do admin por callback; aqui a navegação é
  // mesmo navegação. O `state` diz ao AdminPage em que separador abrir
  // (ele não lê o tab do URL — ver o risco assumido no plano).
  //
  // Sair da página é a única saída que ainda deita rascunhos fora (a ida
  // a outro separador já não), por isso é a única que pergunta — e
  // pergunta aqui no ecrã, nunca num diálogo do browser.
  // `extra` viaja no state (ex.: verPerdidos, da pílula «Recuperar no
  // funil») — e a saidaPendente guarda o STATE COMPLETO, para a
  // confirmação inline não perder a intenção pelo caminho.
  // O separador deixou de viajar no state: vai no CAMINHO. O state
  // continua a levar só os pedidos pontuais que ainda existem
  // (verPerdidos, formularioDe), consumidos uma vez pela AdminPage.
  // O gerarDoc desapareceu: o documento tem endereço próprio.
  const voltarAoAdmin = (tab = "clientes", extra) => {
    // Se se veio da ficha de uma cliente, volta-se para lá — só nesse
    // caso. Nos outros pontos de entrada (Início, Agenda, funil, link
    // directo) «Clientes» deve mesmo levar à lista, e leva.
    const origemCliente = location.state?.origemCliente;
    const caminho =
      tab === "clientes" && origemCliente
        ? caminhoDoContacto(origemCliente)
        : caminhoDoSeparador(tab);
    const destino = { caminho, state: extra || null };
    if (porGuardar > 0) {
      setSaidaPendente(destino);
      return;
    }
    navigate(destino.caminho, { state: destino.state });
  };

  // OPTIMISTA: o estado novo pinta-se no gesto (o ✓ da Jornada salta
  // já); o servidor confirma a seguir. Se recusar, volta-se ao que
  // era e o erro responde na barra — nunca se fica a olhar para um
  // estado que não existe.
  const aoMudarEstado = async (submissionId, novoStatus, fase) => {
    const anterior = submissao;
    setSubmissao((s) => ({ ...s, status: novoStatus }));
    try {
      const atualizada = await updateStatus(submissionId, novoStatus, fase);
      // A linha crua da BD traz as colunas antigas a null; o
      // normalizeSubmission repõe-nas a partir do respostas — sem ele,
      // o "X convidados" do cabeçalho desaparecia até recarregar
      // (família merge-linha-crua, Lote 4A).
      setSubmissao((s) => ({ ...s, ...normalizeSubmission(atualizada) }));
      setErroAccao(null);
    } catch (erro) {
      console.error(erro);
      setSubmissao(anterior);
      setErroAccao(erro.message || "Não foi possível mudar o estado.");
    }
  };

  // O clique numa etapa da Jornada ou na pílula do próximo gesto leva
  // ao separador onde o gesto se faz — e leva a intenção consigo.
  const irComGesto = (etapaId) => {
    const destino = {
      orcamento: { aba: "documentos", alvo: "orcamento" },
      formulario: { aba: "documentos", alvo: "formulario" },
      projecto: { aba: "documentos", alvo: "proposta" },
      contrato: { aba: "documentos", alvo: "contrato" },
      sinal: { aba: "pagamentos", alvo: "sinal" },
      preparacao: { aba: "materiais", alvo: "ficha" },
    }[etapaId];
    if (!destino) return;
    navigate(`/evento/${id}/${destino.aba}`, {
      state: { realce: { alvo: destino.alvo, n: Date.now() } },
    });
  };

  return (
    <div style={{ display: "flex", backgroundColor: "var(--cream)" }}>
      <SidebarNav
        activeTab="clientes"
        // Os itens do menu são LIGAÇÕES a sério, e uma ligação navega
        // sozinha: se houver briefing por guardar, tem de se travar o
        // clique com preventDefault ANTES de o browser ir — senão o
        // voltarAoAdmin guarda a saída pendente para uma confirmação
        // que já não chega a pintar, e o que ela escreveu perde-se em
        // silêncio. Era exactamente isto que a confirmação existia
        // para impedir.
        onNavegar={(tab, ev) => {
          if (porGuardar > 0) ev?.preventDefault();
          voltarAoAdmin(tab);
        }}
        onSair={async () => {
          await supabase.auth.signOut();
          navigate("/admin/login", { replace: true });
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <CabecalhoEvento
          submissao={submissao}
          resumoEvento={resumoEvento}
          nomeTipo={getNomeTipoEvento(submissao, eventTypes)}
          invites={invites}
          previstos={plano.previstos}
          pagamentos={plano.pagamentos}
          resumoDinheiro={resumoDinheiro}
          abas={abasComAviso}
          activeAba={activeAba}
          onAba={irParaAba}
          onVoltar={() => voltarAoAdmin("clientes")}
          onRecuperar={() => voltarAoAdmin("clientes", { verPerdidos: id })}
          onImprimir={() => window.open(`/briefing/${id}`, "_blank")}
          onEditar={alternarEdicao}
          editando={aEditar}
          edicaoNoutroSeparador={aEditar && activeAba !== "visao-geral"}
          onWhatsApp={
            ligacaoWhatsApp
              ? () => window.open(ligacaoWhatsApp, "_blank")
              : undefined
          }
          onEtapa={irComGesto}
          onProximoGesto={irComGesto}
          onStatusChange={aoMudarEstado}
        />

        <div key={id} style={{ padding: "24px 40px 60px" }}>
          {visitadas.current.has("visao-geral") && (
            <Painel visivel={activeAba === "visao-geral"}>
              <VisaoGeralEvento
                submissao={submissao}
                seccoes={seccoes}
                editando={aEditar}
                rascunhos={edicao?.rascunhos ?? null}
                onRascunhos={(novos) =>
                  setEdicao((atual) => (atual ? { ...atual, rascunhos: novos } : atual))
                }
                controloEdicaoRef={controloEdicaoRef}
                onFecharEdicao={() => setEdicao(null)}
                onAbrirEdicao={() => setEdicao({ id, rascunhos: null })}
                onSaved={(atualizada) =>
                  setSubmissao((s) => ({
                    ...s,
                    ...normalizeSubmission(atualizada),
                  }))
                }
                onImprimir={() => window.open(`/briefing/${id}`, "_blank")}
              />
            </Painel>
          )}

          {visitadas.current.has("documentos") && (
            <Painel visivel={activeAba === "documentos"}>
              <DocumentosEvento
                submissao={submissao}
                invites={invites}
                realce={realce}
                onRealceConsumido={() => setRealce(null)}
                onContagem={(n) => reportarContagem("documentos", n)}
                onGerarDocumento={(evento, tipoDoc) =>
                  navigate(
                    `${caminhoDoSeparador("orcamentos")}/${evento.id}/${tipoDoc}`,
                  )
                }
                onVerFormulario={() => {
                  // "Ver respostas" de um formulário respondido não
                  // precisa de sair da página: as respostas leem-se na
                  // Visão Geral (o destino antigo, a lista de convites
                  // do admin, era um beco — o modal do convite
                  // preenchido não mostra respostas). Pendente segue
                  // para o admin, onde se preenche/partilha.
                  const { estado } = estadoFormularioDoEvento(invites, id);
                  if (estado === "preenchido") {
                    irParaAba("visao-geral");
                    return;
                  }
                  navigate(caminhoDoSeparador("convites"), {
                    state: { formularioDe: id },
                  });
                }}
                onCriarFormulario={() =>
                  navigate(caminhoDoSeparador("convites"), {
                    state: { formularioDe: id },
                  })
                }
              />
            </Painel>
          )}

          {visitadas.current.has("materiais") && (
            <Painel visivel={activeAba === "materiais"}>
              <FichaMateriais
                submissionId={id}
                submissao={submissao}
                realce={realce}
                onRealceConsumido={() => setRealce(null)}
                onContagem={(n) => reportarContagem("materiais", n)}
              />
            </Painel>
          )}

          {visitadas.current.has("pagamentos") && (
            <Painel visivel={activeAba === "pagamentos"}>
              {/* O plano desce por props — o separador deixou de repetir
                  a query que a página já fez (era o refetch que fazia a
                  troca piscar). Registar/apagar sobe pela mesma mão, e o
                  cabeçalho vê o dinheiro mudar no instante. */}
              <PagamentosEvento
                submissao={submissao}
                previstos={plano.previstos}
                pagamentos={plano.pagamentos}
                onPagamentos={(lista) =>
                  setPlano((p) => ({ ...p, pagamentos: lista }))
                }
                onRecarregar={recarregarPlano}
                realce={realce}
                onRealceConsumido={() => setRealce(null)}
                onIrParaOrcamento={() => irComGesto("orcamento")}
                onSaved={(atualizada) => {
                  if (atualizada)
                    setSubmissao((s) => ({
                      ...s,
                      ...normalizeSubmission(atualizada),
                    }));
                }}
              />
            </Painel>
          )}

          {visitadas.current.has("notas") && (
            <Painel visivel={activeAba === "notas"}>
              <NotasEvento
                submissao={submissao}
                pagamentos={plano.pagamentos}
                previstos={plano.previstos}
                invites={invites}
                onContagem={(n) => reportarContagem("notas", n)}
              />
            </Painel>
          )}
        </div>
      </div>

      {/* Sair da página com o briefing a meio: pergunta-se no lugar,
          como na remoção em lote. Não há "guardar e sair" aqui de
          propósito — a barra da edição, a dois passos, é que guarda, e
          duas maneiras de guardar são uma a mais. */}
      {/* O `porGuardar > 0` também é o desfazer: se entretanto guardares
          pela barra da edição, a pergunta deixa de fazer sentido e sai
          do ecrã sozinha. */}
      {saidaPendente && porGuardar > 0 && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            // Acima da barra da edição, não em cima dela: as duas falam
            // do mesmo trabalho e sobrepostas liam-se mal.
            bottom: "96px",
            transform: "translateX(-50%)",
            zIndex: 40,
            display: "flex",
            alignItems: "center",
            gap: "14px",
            flexWrap: "wrap",
            width: "min(680px, calc(100vw - 48px))",
            backgroundColor: "white",
            border: "1.5px solid var(--gold)",
            borderRadius: "14px",
            padding: "12px 16px",
            boxShadow: "0 14px 36px rgba(26,26,26,0.18)",
          }}
        >
          <span style={{ fontSize: "13px", color: "var(--charcoal)" }}>
            Tens {porGuardar}{" "}
            {porGuardar === 1 ? "alteração" : "alterações"} por guardar no
            briefing.
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => {
              setSaidaPendente(null);
              if (activeAba !== "visao-geral") irParaAba("visao-geral");
            }}
            className="acao acao--neutra"
            style={medidaBotaoSaida}
          >
            Continuar a editar
          </button>
          <button
            onClick={() => {
              const destino = saidaPendente;
              setSaidaPendente(null);
              setEdicao(null);
              navigate(destino.caminho, { state: destino.state });
            }}
            className="acao acao--perigo"
            style={medidaBotaoSaida}
          >
            Sair sem guardar
          </button>
        </div>
      )}

      {/* O erro de uma acção do cabeçalho (mudar o estado na Jornada)
          mostra-se aqui em baixo, no mesmo registo da confirmação de
          saída — e sai do ecrã à mão, quando ela o tiver lido. */}
      {erroAccao && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: "24px",
            transform: "translateX(-50%)",
            zIndex: 40,
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
            {erroAccao}
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setErroAccao(null)}
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
