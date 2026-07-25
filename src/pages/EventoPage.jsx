import { useCallback, useEffect, useMemo, useState } from "react";
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

  const irParaAba = (novaAba) =>
    navigate(`/evento/${id}/${novaAba}`, { replace: false });

  // O drawer manda para tabs do admin por callback; aqui a navegação é
  // mesmo navegação. O `state` diz ao AdminPage em que separador abrir
  // (ele não lê o tab do URL — ver o risco assumido no plano).
  const voltarAoAdmin = (tab = "clientes") =>
    navigate("/admin", { state: { tab } });

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
          abas={ABAS}
          activeAba={activeAba}
          onAba={irParaAba}
          onVoltar={() => voltarAoAdmin("clientes")}
          onImprimir={() => window.open(`/briefing/${id}`, "_blank")}
          onEditar={() => irParaAba("visao-geral")}
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
    </div>
  );
}
