import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getEventoCompleto, updateStatus } from "../lib/clientes";
import { getEventTypes } from "../lib/invites";
import { getPagamentosEvento, resumoPagamentos } from "../lib/pagamentos";
import {
  getResumoSubmissao,
  getValorAtual,
  seccoesDoModelo,
} from "../lib/submissionFields";
import { contarAlteracoes } from "../lib/briefingEdicao";
import { getNomeTipoEvento } from "../lib/tipoEvento";
import { linkWhatsApp } from "../lib/mensagens";
import { SidebarNav } from "../components/admin/Navegacao";
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

const botaoSaida = (perigo) => ({
  padding: "9px 16px",
  borderRadius: "10px",
  border: `1.5px solid ${perigo ? "#FECACA" : "var(--gold)"}`,
  backgroundColor: perigo ? "white" : "var(--gold)",
  color: perigo ? "#B91C1C" : "white",
  fontSize: "12.5px",
  fontWeight: "500",
  cursor: "pointer",
  whiteSpace: "nowrap",
});

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

  const activeAba = ABAS.some((a) => a.id === aba) ? aba : ABA_PREDEFINIDA;

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
        const [evento, modelos, { data: convites }, pagamentos] =
          await Promise.all([
            getEventoCompleto(id),
            getEventTypes(),
            supabase
              .from("invites")
              .select("*")
              .or(`submission_id.eq.${id},submission_alvo_id.eq.${id}`),
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

  // Só o plano volta a ser lido quando se regista um pagamento — o
  // resto da página não mudou.
  const recarregarPlano = useCallback(async () => {
    try {
      setPlano(await getPagamentosEvento(id));
    } catch (erro) {
      console.error(erro);
    }
  }, [id]);

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
      porGuardar > 0
        ? ABAS.map((a) => (a.id === "visao-geral" ? { ...a, porGuardar } : a))
        : ABAS,
    [porGuardar],
  );

  if (estado === "a-carregar") return <Centrado>A abrir o evento…</Centrado>;
  if (estado === "nao-encontrado")
    return (
      <Centrado>
        <div>
          <p style={{ margin: "0 0 10px" }}>Este evento já não existe.</p>
          <button
            onClick={() => navigate("/admin")}
            style={{
              border: "none",
              background: "none",
              color: "var(--gold-dark)",
              cursor: "pointer",
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
  const voltarAoAdmin = (tab = "clientes") => {
    if (porGuardar > 0) {
      setSaidaPendente(tab);
      return;
    }
    navigate("/admin", { state: { tab } });
  };

  const aoMudarEstado = async (submissionId, novoStatus, fase) => {
    try {
      const atualizada = await updateStatus(submissionId, novoStatus, fase);
      setSubmissao((s) => ({ ...s, ...atualizada }));
    } catch (erro) {
      console.error(erro);
      alert(erro.message || "Não foi possível mudar o estado.");
    }
  };

  return (
    <div style={{ display: "flex", backgroundColor: "var(--cream)" }}>
      <SidebarNav
        activeTab="clientes"
        onNavegar={(tab) => voltarAoAdmin(tab)}
        onSair={async () => {
          await supabase.auth.signOut();
          navigate("/admin/login");
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
          onImprimir={() => window.open(`/briefing/${id}`, "_blank")}
          onEditar={alternarEdicao}
          editando={aEditar}
          edicaoNoutroSeparador={aEditar && activeAba !== "visao-geral"}
          onWhatsApp={
            ligacaoWhatsApp
              ? () => window.open(ligacaoWhatsApp, "_blank")
              : undefined
          }
          onEtapa={(etapa) => {
            // A frase "→ A seguir" aponta, não age: leva ao separador
            // onde o gesto se faz.
            if (etapa === "orcamento" || etapa === "projecto" || etapa === "contrato")
              irParaAba("documentos");
            else if (etapa === "formulario") irParaAba("documentos");
            else if (etapa === "preparacao") irParaAba("materiais");
          }}
          onStatusChange={aoMudarEstado}
        />

        <div style={{ padding: "24px 40px 60px" }}>
          {activeAba === "visao-geral" && (
            <VisaoGeralEvento
              submissao={submissao}
              seccoes={seccoes}
              mosaico
              editando={aEditar}
              rascunhos={edicao?.rascunhos ?? null}
              onRascunhos={(novos) =>
                setEdicao((atual) => (atual ? { ...atual, rascunhos: novos } : atual))
              }
              controloEdicaoRef={controloEdicaoRef}
              onFecharEdicao={() => setEdicao(null)}
              onSaved={(atualizada) =>
                setSubmissao((s) => ({ ...s, ...atualizada }))
              }
              onImprimir={() => window.open(`/briefing/${id}`, "_blank")}
            />
          )}

          {activeAba === "documentos" && (
            <DocumentosEvento
              submissao={submissao}
              invites={invites}
              onGerarDocumento={(evento, tipoDoc) =>
                navigate("/admin", {
                  state: {
                    tab: "orcamentos",
                    gerarDoc: { submissionId: evento.id, tipoDoc },
                  },
                })
              }
              onVerFormulario={() =>
                navigate("/admin", { state: { tab: "convites" } })
              }
              onCriarFormulario={() =>
                navigate("/admin", { state: { tab: "convites" } })
              }
            />
          )}

          {activeAba === "materiais" && (
            <FichaMateriais submissionId={id} submissao={submissao} />
          )}

          {activeAba === "pagamentos" && (
            <PagamentosEvento
              submissao={submissao}
              largo
              onSaved={(atualizada) => {
                if (atualizada) setSubmissao((s) => ({ ...s, ...atualizada }));
                recarregarPlano();
              }}
            />
          )}

          {activeAba === "notas" && (
            <NotasEvento
              submissao={submissao}
              pagamentos={plano.pagamentos}
              previstos={plano.previstos}
              invites={invites}
            />
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
            style={{
              ...botaoSaida(false),
              backgroundColor: "white",
              borderColor: "var(--gold-light)",
              color: "var(--gray-mid)",
            }}
          >
            Continuar a editar
          </button>
          <button
            onClick={() => {
              const destino = saidaPendente;
              setSaidaPendente(null);
              setEdicao(null);
              navigate("/admin", { state: { tab: destino } });
            }}
            style={botaoSaida(true)}
          >
            Sair sem guardar
          </button>
        </div>
      )}
    </div>
  );
}
