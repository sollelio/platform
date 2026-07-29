import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { caminhoDoSeparador } from "../../lib/rotasAdmin";
import { motion } from "framer-motion";
import { getMateriais } from "../../lib/materiais";
import {
  getTodasFichas,
  getAppConfig,
  getBuffer,
  calcularAlertas,
  calcularAlertasReposicao,
} from "../../lib/stock";
import ConferenciaPeriodo from "./ConferenciaPeriodo";
import AlertasTab from "./AlertasTab";
import MateriaisInventario from "./MateriaisInventario";
import { FASES_POS_SINAL } from "./faseConfig";

// ============================================================
// OperacionalTab — Logística.
// Sub-navegação interna:
//   • Materiais  → o catálogo e o stock (CRUD)
//   • O que sai  → a conferência do período, somando todos os eventos
//   • Alertas    → onde é que o stock vai rebentar
//
// O separador "Fichas" saiu: a ficha de materiais passou para dentro do
// evento (/evento/:id → Materiais), e deixava de fazer sentido haver um
// sítio onde se volta a PROCURAR o evento que já estava aberto. No lugar
// dele entra a vista que faltava — transversal, não por evento: «tenho
// material para tudo o que sai este fim de semana?».
//
// Este componente é o dono dos dados (materiais, fichas, buffer): carrega
// uma vez e partilha pelos três.
// ============================================================
// As três vistas desta secção vivem no URL, como os separadores:
// /admin/logistica/materiais | /conferencia | /alertas. Sem isto, a
// Nádia não conseguia mandar a ninguém — nem a si própria — o link de
// «o que sai este fim-de-semana», que é precisamente a vista mais
// partilhável de todo o backoffice.
//
// «conferencia» é vocabulário da casa (a folha impressa chama-se assim),
// não um id escondido — por isso pode ir no endereço tal e qual.
const SUB_VISTAS = ["materiais", "conferencia", "alertas"];
const SUB_VISTA_POR_OMISSAO = "materiais";

export default function OperacionalTab({
  submissions = [],
  eventTypes = [],
  // As três vistas somam sobre `submissions`, que vem por prop — mas o
  // `loadingAlertas` local só sabe dos SEUS três pedidos (materiais,
  // fichas, configuração). Sem este sinal, a Conferência anunciava
  // «Nada sai de casa neste período · 0 eventos» e os Alertas «Sem
  // conflitos de stock» com os eventos ainda a caminho — uma afirmação
  // falsa num ecrã de decisão operacional.
  eventosPorChegar = false,
}) {
  const { p1 } = useParams();
  const navigate = useNavigate();
  const subTab = SUB_VISTAS.includes(p1) ? p1 : SUB_VISTA_POR_OMISSAO;

  // Endereço sem vista (o link do menu) ou com uma vista que não existe:
  // corrige-se para a vista por omissão, sem deixar rasto no histórico.
  useEffect(() => {
    if (p1 !== subTab) {
      navigate(`${caminhoDoSeparador("operacional")}/${subTab}`, {
        replace: true,
      });
    }
  }, [p1, subTab, navigate]);

  // replace, como o toggle Lista/Funil: as três vistas são LADOS desta
  // secção, não passos de uma viagem — o «voltar» não deve ter de
  // desfazer três cliques antes de sair da Logística.
  const setSubTab = (v) =>
    navigate(`${caminhoDoSeparador("operacional")}/${v}`, { replace: true });

  // Dados para os alertas — carregados AQUI (uma vez) e partilhados entre
  // o badge da sub-navegação e a vista AlertasTab, para não duplicar
  // trabalho nem queries.
  const [materiais, setMateriais] = useState([]);
  const [todasFichas, setTodasFichas] = useState([]);
  const [buffer, setBuffer] = useState({ antes: 2, depois: 2 });
  const [loadingAlertas, setLoadingAlertas] = useState(true);

  // Recarrega os dados que alimentam os alertas (stock, fichas, buffer).
  // Chamada uma vez ao montar, E sempre que um filho grava algo que afeta
  // os alertas (quantidade numa ficha, stock de um material) — assim o
  // badge e a lista atualizam sem refrescar a página.
  // O erro de carga ganha voz (Lote 4B): sem isto, materiais/fichas
  // ficavam [] e a conferência dizia "Nada sai de casa" — uma mentira
  // tranquilizadora em cima de uma falha de rede.
  const [erroDados, setErroDados] = useState(null);
  // Erro de GRAVAÇÃO vindo dos filhos (ex.: o flush do stepper depois
  // de trocar de sub-separador) — vive aqui porque este componente
  // sobrevive à troca; a barra local do filho já teria desmontado.
  const [erroGravacao, setErroGravacao] = useState(null);
  const recarregarDados = useCallback(async () => {
    // O erro só limpa quando um pedido NOVO resolve — limpá-lo à
    // partida fazia o retry mostrar "Nada sai de casa" durante o
    // pedido em curso (a mentira de volta, no pior momento).
    try {
      const [mats, fichas, config] = await Promise.all([
        getMateriais({ incluirInativos: true }),
        getTodasFichas(),
        getAppConfig(),
      ]);
      setMateriais(mats);
      setTodasFichas(fichas);
      setBuffer(await getBuffer(config));
      setErroDados(null);
    } catch (e) {
      console.error("Erro ao carregar alertas:", e);
      setErroDados(
        "Não foi possível carregar os dados de stock e fichas — o que vês pode estar incompleto.",
      );
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setLoadingAlertas(true);
      await recarregarDados();
      if (vivo) setLoadingAlertas(false);
    })();
    return () => {
      vivo = false;
    };
  }, [recarregarDados]);

  const alertas = useMemo(
    () =>
      calcularAlertas({
        materiais,
        submissions,
        todasFichas,
        buffer,
        fasesPosSinal: FASES_POS_SINAL,
      }),
    [materiais, submissions, todasFichas, buffer],
  );

  // Alertas de reposição (stock abaixo do ideal) — planeamento, não urgência.
  const alertasReposicao = useMemo(
    () => calcularAlertasReposicao({ materiais }),
    [materiais],
  );

  // O badge conta só as RUTURAS REAIS: stock definido mas insuficiente
  // ENTRE EVENTOS CONFIRMADOS. Nem os "sem stock definido" (setup por
  // fazer) nem os condicionais (só rebentam se um orçamento fechar) —
  // um badge que grita por hipóteses é um badge que se deixa de ler.
  const numRuturasReais = useMemo(
    () => alertas.filter((a) => !a.semStock && !a.condicional).length,
    [alertas],
  );

  return (
    <motion.div
      key="tab-operacional"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Sub-navegação */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "24px",
          flexWrap: "wrap",
        }}
      >
        {[
          { id: "materiais", label: "Materiais" },
          { id: "conferencia", label: "O que sai" },
          { id: "alertas", label: "Alertas" },
        ].map((st) => {
          const ativo = subTab === st.id;
          // Badge só no botão Alertas, e só quando há ruturas reais
          const mostrarBadge = st.id === "alertas" && numRuturasReais > 0;
          return (
            <button
              key={st.id}
              onClick={() => setSubTab(st.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 18px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: "600",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                border: `1.5px solid ${ativo ? "var(--gold)" : "var(--gold-light)"}`,
                backgroundColor: ativo ? "var(--gold)" : "white",
                color: ativo ? "white" : "var(--gray-mid)",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {st.label}
              {mostrarBadge && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "18px",
                    height: "18px",
                    padding: "0 5px",
                    borderRadius: "999px",
                    fontSize: "10px",
                    fontWeight: "700",
                    lineHeight: 1,
                    // No botão ativo (fundo dourado) o badge fica branco com
                    // texto dourado; no inativo, vermelho cheio.
                    backgroundColor: ativo ? "white" : "#DC2626",
                    color: ativo ? "#DC2626" : "white",
                  }}
                >
                  {numRuturasReais}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {erroGravacao && (
        <p
          style={{
            fontSize: "12.5px",
            color: "#B91C1C",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "10px",
            padding: "10px 14px",
            marginBottom: "16px",
          }}
        >
          ⚠ {erroGravacao}
        </p>
      )}

      {subTab === "materiais" && (
        <MateriaisInventario
          onStockAlterado={recarregarDados}
          onErroGravacao={setErroGravacao}
        />
      )}
      {subTab === "conferencia" && (
        <ConferenciaPeriodo
          materiais={materiais}
          submissions={submissions}
          todasFichas={todasFichas}
          eventTypes={eventTypes}
          buffer={buffer}
          loading={loadingAlertas || eventosPorChegar}
          erro={erroDados}
          onTentarNovamente={recarregarDados}
        />
      )}
      {subTab === "alertas" && (
        <AlertasTab
          alertas={alertas}
          alertasReposicao={alertasReposicao}
          loading={loadingAlertas || eventosPorChegar}
          submissions={submissions}
          eventTypes={eventTypes}
        />
      )}
    </motion.div>
  );
}
