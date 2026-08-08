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
import { TITULO_BACKOFFICE } from "../lib/casa";
import { caminhoDoContacto, caminhoDoSeparador } from "../lib/rotasAdmin";
import {
  extrairDadosCliente,
  getEventoCompleto,
  updateStatus,
} from "../lib/clientes";
import {
  guardarPrazoDia,
  irmaosDoDia,
  prazoWhatsApp,
} from "../lib/disputaDia";
import {
  apontarConviteAoEvento,
  getEventTypes,
  getFormulariosOrfaos,
} from "../lib/invites";
import { getPagamentosEvento, resumoPagamentos } from "../lib/pagamentos";
import { getReservaProvisoriaDoEvento } from "../lib/reservas";
import {
  getResumoSubmissao,
  getValorAtual,
  seccoesDoModelo,
  normalizeSubmission,
} from "../lib/submissionFields";
import { contarAlteracoes } from "../lib/briefingEdicao";
import { getNomeTipoEvento } from "../lib/tipoEvento";
import { linkWhatsApp } from "../lib/mensagens";
import PortalDoClienteSheet from "../components/admin/PortalDoClienteSheet";
import PainelNotificacoes, { ToastNotificacao } from "../components/admin/CentroNotificacoes";
import { documentosDoEvento } from "../lib/documentos";
import { useNotificacoes } from "../lib/notificacoes";
import { FASE_LABEL, FASES_POS_SINAL } from "../components/admin/faseConfig";
import { SidebarNav } from "../components/admin/Navegacao";
import { Esqueleto } from "../components/admin/acabamento";
import CabecalhoEvento from "../components/admin/CabecalhoEvento";
import VisaoGeralEvento from "../components/admin/VisaoGeralEvento";
import FotografiasEvento from "../components/admin/FotografiasEvento";
import PagamentosEvento from "../components/admin/PagamentosEvento";
import NotasEvento from "../components/admin/NotasEvento";
import DocumentosEvento from "../components/admin/DocumentosEvento";
import FichaEvento from "../components/admin/FichaEvento";

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
  // As fotografias do dia. Aba própria e não secção na Visão geral: aquela
  // é o briefing e imprime-se, e o gesto de carregar acontece no espaço, ao
  // telemóvel — quer-se chegar a um sítio e largar as fotografias.
  { id: "fotografias", label: "Fotografias" },
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

// ============================================================
// O BANNER DA DISPUTA DO DIA — o lado da Nádia (mockup 2c).
//
// Quando a data deste evento tem outro pedido vivo (ou uma reserva
// provisória na Agenda), o banner conta a história inteira no lugar:
// quem é o rival, em que fase vai, há quanto tempo, se já confirmou
// «já paguei» — e dá o gesto do prazo («guardado para si até DD/MM»),
// que é o que o portal da preferida passa a mostrar e o que fecha o
// ecrã do sinal aos rivais. NADA aqui bloqueia: informa e oferece.
//
// A confirmação de um rival SÓ SE MOSTRA — limpa-se na folha do
// próprio evento que confirmou, onde a conta se confere. Um botão de
// limpar aqui seria anular a promessa de OUTRO evento sem lhe abrir a
// ficha, e é exactamente o tipo de gesto cego que a casa recusa.
//
// Veste o padrão âmbar de FormulariosOrfaos (#FEF3E2/#F0D9B5/#92400E,
// linha do ⚠ a 13px/700): atenção sem alarme — a disputa não é um
// erro, é o negócio a acontecer.
// ============================================================

// Os meses à mão, como disputaDia.js e base.js (a cópia é deliberada,
// padrão da casa): grafia pré-acordo com maiúscula, que o
// toLocaleDateString não garante — num browser sem ICU pt-PT cai em
// inglês sem erro nenhum.
const MESES_LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio",
  "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// «25 de Agosto» a partir de 'YYYY-MM-DD', partido à mão — um parse ISO
// por Date cai em UTC e num fuso atrás recuava um dia (padrão
// partesDaData/base.js).
const diaPorExtenso = (iso) => {
  const [, m, d] = String(iso || "").slice(0, 10).split("-").map(Number);
  if (!m || !d || !MESES_LONGOS[m - 1]) return "";
  return `${d} de ${MESES_LONGOS[m - 1]}`;
};

// «15/08» — a medida curta, para o prazo dentro de uma frase.
const diaCurto = (iso) => {
  const [, m, d] = String(iso || "").slice(0, 10).split("-").map(Number);
  if (!m || !d) return "";
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
};

// «há 12 dias» a partir de um timestamp. Floor e não round: à noite,
// um pedido de ontem de manhã ainda é «há 1 dia» — arredondar para
// cima envelhecia a disputa e apressava a conversa.
const haQuantoTempo = (iso) => {
  if (!iso) return "";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "há 1 dia";
  return `há ${dias} dias`;
};

// Os botões do banner, no registo ofício (12.5px/600, raio 10) — o
// dourado para o gesto da preferência, o âmbar para os restantes.
const botaoAmbar = {
  fontSize: "12.5px",
  fontWeight: "600",
  padding: "8px 14px",
  borderRadius: "10px",
  border: "1.5px solid #F0D9B5",
  backgroundColor: "white",
  color: "#92400E",
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};
const botaoOuroClaro = {
  ...botaoAmbar,
  border: "1.5px solid var(--gold-light)",
  color: "var(--gold-dark)",
};

function BannerDisputaDia({
  irmaos,
  dataEvento,
  hojeISO,
  submissionId,
  prazoAtual,
  nomeCliente,
  numeroWhatsapp,
  onPrazoGuardado,
  onAbrirRival,
}) {
  // O gesto do prazo a meio — estado local, não é estado de negócio.
  const [aDarPrazo, setADarPrazo] = useState(false);
  const [prazoEscolhido, setPrazoEscolhido] = useState("");
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState(null);
  const [copiado, setCopiado] = useState(false);

  // Um irmão com sinal = o dia já é dele; a conversa muda de tom.
  const tomadoPor = irmaos.find((i) => i.temSinal) || null;

  // O prazo expira sozinho em leitura (o padrão do caducou): um
  // dia_guardado_ate no passado é como se não existisse.
  const prazoAtivo = prazoAtual && prazoAtual >= hojeISO ? prazoAtual : null;

  // «Um prazo por dia, no máximo» (decisão de 08/08) — a lib delega a
  // guarda na UI, e a UI é AQUI, onde a promessa se faz: com o dia já
  // guardado a um rival, oferecer o botão era a mesma promessa a duas
  // clientes. O gesto ausenta-se e a linha do rival diz o facto.
  const rivalComPrazo = irmaos.some(
    (i) => i.guardadoAte && i.guardadoAte >= hojeISO,
  );

  // A oferta do WhatsApp nasce do prazo ACTIVO (e sobrevive a reloads,
  // por isso deriva da BD e não de um «acabei de guardar»). O texto é o
  // MESMO do copiar e do abrir — vem da lib, uma vez. Com o dia TOMADO
  // por um rival (sinal registado por cima do prazo, com aviso), a
  // promessa já não se pode enviar — «guardámos o dia para si» seria
  // mentira, e a caixa cala-se.
  const mensagem =
    prazoAtivo && !tomadoPor
      ? prazoWhatsApp(nomeCliente, dataEvento, prazoAtivo)
      : null;
  const ligacao =
    mensagem && numeroWhatsapp ? linkWhatsApp(numeroWhatsapp, mensagem) : null;

  const guardar = async () => {
    if (!prazoEscolhido || aGuardar) return;
    setAGuardar(true);
    setErro(null);
    let resposta = null;
    try {
      resposta = await guardarPrazoDia(submissionId, prazoEscolhido);
    } catch (e) {
      console.error("Erro ao guardar o prazo do dia:", e);
    }
    setAGuardar(false);
    if (!resposta) {
      // A recusa responde AQUI, no banner — nunca num diálogo do browser.
      setErro("Não foi possível guardar o prazo. Tente outra vez.");
      return;
    }
    onPrazoGuardado(resposta);
    setADarPrazo(false);
    setPrazoEscolhido("");
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(mensagem);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem clipboard (http, permissões): a mensagem está escrita ao
      // lado — diz-se isso em vez de fingir que copiou.
      setErro("Não foi possível copiar — a mensagem está escrita acima.");
    }
  };

  return (
    <div
      style={{
        backgroundColor: "#FEF3E2",
        border: "1px solid #F0D9B5",
        borderRadius: "12px",
        padding: "12px 14px",
        marginBottom: "20px",
      }}
    >
      <p
        style={{
          margin: "0 0 6px",
          fontSize: "13px",
          fontWeight: "700",
          color: "#92400E",
          lineHeight: 1.5,
        }}
      >
        ⚠{" "}
        {tomadoPor
          ? `O dia ${diaPorExtenso(dataEvento)} está reservado por ${tomadoPor.nome} — este evento precisa de nova data`
          : `${diaPorExtenso(dataEvento)} tem ${
              irmaos.length === 1
                ? "outro pedido vivo"
                : `mais ${irmaos.length} pedidos vivos`
            }`}
      </p>

      {irmaos.map((irmao) => (
        <p
          key={irmao.id}
          style={{
            margin: "0 0 4px",
            fontSize: "12.5px",
            color: "#92400E",
            lineHeight: 1.55,
          }}
        >
          <b>{irmao.nome}</b>
          {" — "}
          {irmao.ehReserva
            ? "reserva provisória na Agenda"
            : `${(FASE_LABEL[irmao.fase] || irmao.fase || "sem fase").toLowerCase()}${
                irmao.temSinal ? ", com sinal registado" : ", sem sinal"
              }`}
          {irmao.criadoEm ? `, ${haQuantoTempo(irmao.criadoEm)}.` : "."}
          {/* O prazo do RIVAL mostra-se onde a promessa se faria — é ele
              que explica porque o botão de guardar o dia não aparece.
              Gere-se (altera-se, limpa-se) na folha desse evento. */}
          {irmao.guardadoAte && irmao.guardadoAte >= hojeISO && (
            <>
              {" "}
              <b>
                O dia está guardado para essa cliente até{" "}
                {diaCurto(irmao.guardadoAte)}
              </b>{" "}
              (o prazo gere-se na folha desse evento).
            </>
          )}
          {irmao.confirmacao && (
            <>
              {" "}
              <b>
                Em confirmação {haQuantoTempo(irmao.confirmacao.criadoEm)}
              </b>{" "}
              (disse que enviou o sinal — confere-se e limpa-se na folha
              desse evento).
            </>
          )}
        </p>
      ))}

      {!tomadoPor && (
        <p
          style={{
            margin: "2px 0 10px",
            fontSize: "12.5px",
            color: "#92400E",
            lineHeight: 1.55,
          }}
        >
          Só o primeiro sinal registado reserva o dia.
          {prazoAtivo && (
            <>
              {" "}
              <b>Dia guardado para esta cliente até {diaCurto(prazoAtivo)}.</b>
            </>
          )}
        </p>
      )}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
          alignItems: "center",
          marginTop: tomadoPor ? "10px" : 0,
        }}
      >
        {/* O prazo é uma promessa a ESTA cliente — num dia já tomado não
            há promessa para fazer, e com o dia guardado a um RIVAL não
            se promete duas vezes (um prazo por dia, no máximo): nos
            dois casos o botão ausenta-se. */}
        {!tomadoPor && !rivalComPrazo && !aDarPrazo && (
          <button
            onClick={() => {
              setADarPrazo(true);
              setPrazoEscolhido(prazoAtivo || "");
              setErro(null);
            }}
            style={botaoOuroClaro}
          >
            {prazoAtivo
              ? "Alterar o prazo…"
              : "Guardar o dia para esta cliente até…"}
          </button>
        )}
        {!tomadoPor && !rivalComPrazo && aDarPrazo && (
          <>
            <input
              type="date"
              value={prazoEscolhido}
              // Entre hoje e a data do evento: um prazo no passado já
              // nascia expirado, e um depois do evento não guarda nada.
              min={hojeISO}
              max={dataEvento}
              onChange={(e) => setPrazoEscolhido(e.target.value)}
              style={{
                border: "1px solid var(--gold-light)",
                borderRadius: "10px",
                padding: "6px 10px",
                fontSize: "12.5px",
                fontFamily: "inherit",
                backgroundColor: "white",
                color: "var(--charcoal)",
              }}
            />
            <button
              onClick={guardar}
              disabled={!prazoEscolhido || aGuardar}
              style={{
                ...botaoOuroClaro,
                opacity: !prazoEscolhido || aGuardar ? 0.6 : 1,
                cursor: !prazoEscolhido || aGuardar ? "default" : "pointer",
              }}
            >
              {aGuardar ? "A guardar…" : "Guardar o dia"}
            </button>
            <button
              onClick={() => {
                setADarPrazo(false);
                setErro(null);
              }}
              style={botaoAmbar}
            >
              Cancelar
            </button>
          </>
        )}
        {/* Só os rivais que SÃO eventos têm ficha para abrir; uma
            reserva provisória resolve-se na Agenda, e a linha dela
            di-lo em vez de aparecer um botão que recusaria. */}
        {irmaos
          .filter((i) => !i.ehReserva)
          .map((i) => (
            <button
              key={i.id}
              onClick={() => onAbrirRival(i.id)}
              style={botaoAmbar}
            >
              Abrir o evento de{" "}
              {String(i.nome || "").trim().split(/\s+/)[0] || "rival"}
            </button>
          ))}
      </div>

      {/* O WhatsApp pré-escrito da promessa — oferece-se, nunca se
          envia sozinho (decisão de 09/08). */}
      {mensagem && (
        <div
          style={{
            marginTop: "10px",
            backgroundColor: "white",
            border: "1px solid #F0D9B5",
            borderRadius: "9px",
            padding: "10px 12px",
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              fontSize: "12px",
              fontStyle: "italic",
              color: "var(--charcoal)",
              lineHeight: 1.55,
            }}
          >
            «{mensagem}»
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "6px",
              alignItems: "center",
            }}
          >
            {ligacao && (
              <button
                onClick={() => window.open(ligacao, "_blank")}
                style={botaoOuroClaro}
              >
                Enviar por WhatsApp
              </button>
            )}
            <button onClick={copiar} style={botaoAmbar}>
              {copiado ? "Copiado ✓" : "Copiar a mensagem"}
            </button>
            <span
              style={{
                fontSize: "11.5px",
                color: "#92400E",
                fontStyle: "italic",
              }}
            >
              o aviso é seu de enviar — o sistema nunca escreve sozinho
            </span>
          </div>
        </div>
      )}

      {erro && (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: "12px",
            fontWeight: "600",
            color: "#B91C1C",
          }}
        >
          {erro}
        </p>
      )}
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
  // Os formulários ÓRFÃOS (sem evento nenhum). Leitura PRÓPRIA e à parte:
  // a carga principal lê só os convites DESTE evento, e um órfão é, por
  // definição, de nenhum. É a metade que apanha o erro no instante em que
  // ele nasce — quando ela ia criar um segundo formulário para alguém que
  // já tem um solto.
  const [orfaos, setOrfaos] = useState([]);
  // A reserva provisória deste evento, se houver.
  const [reservaProvisoria, setReservaProvisoria] = useState(null);
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
  // A folha do acompanhamento (a porta do portal da cliente).
  const [portalAberto, setPortalAberto] = useState(false);
  // Hoje em ISO, para comparar com `data_evento` (que é DATE, sem hora):
  // comparar strings YYYY-MM-DD não depende de fuso nenhum.
  const hojeISO = new Date().toISOString().slice(0, 10);
  useEffect(() => {
    const r = location.state?.realce;
    if (!r) return;
    setRealce(r);
    navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  // O separador do browser reafirma o título INTERNO no arranque: quem
  // chega directo a /evento/:id (favorito, link colado) não pode ficar
  // com o título público que o portal tenha deixado. O AdminPage já o
  // repõe via notificacoes.js; esta é a outra porta de entrada.
  useEffect(() => {
    document.title = TITULO_BACKOFFICE;
  }, []);

  // O aviso da Caixa de Entrada manda «trate na folha do Acompanhamento»
  // — este state, consumido UMA vez (o padrão do realce), cumpre a
  // promessa abrindo a folha assim que o evento pousa. Respeita o
  // portalIndisponivel: num evento perdido ou caducado a folha não abre.
  const [pedidoAcompanhamento, setPedidoAcompanhamento] = useState(false);
  // O consumo faz-se DURANTE o render (estado preso ao location.state);
  // só a limpeza do histórico fica no efeito — é ela o sistema externo.
  if (location.state?.abrirAcompanhamento && !pedidoAcompanhamento) {
    setPedidoAcompanhamento(true);
  }
  useEffect(() => {
    if (!location.state?.abrirAcompanhamento) return;
    navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);
  if (pedidoAcompanhamento && estado === "pronto" && submissao) {
    const passou =
      !!submissao.data_evento && submissao.data_evento < hojeISO;
    const fechou = FASES_POS_SINAL.includes(submissao.fase);
    const indisponivel = submissao.fase === "perdido" || (passou && !fechou);
    if (!indisponivel) setPortalAberto(true);
    setPedidoAcompanhamento(false);
  }

  const activeAba = ABAS.some((a) => a.id === aba) ? aba : ABA_PREDEFINIDA;

  // MONTAGEM PERSISTENTE: um separador visitado fica montado (escondido,
  // não desmontado). É o que torna a troca instantânea — sem refetch a
  // piscar — e o que preserva o estado interno de cada um (selecções da
  // ficha, filtros das notas, formulários a meio). Mudar de EVENTO
  // limpa tudo: outra entidade, outra vida.
  //
  // ESTADO, e não `ref`. Era um `ref` mutado e LIDO durante o render, seis
  // vezes — um por separador. O React avisa disso com razão: um valor lido
  // no render tem de fazer o componente voltar a desenhar quando muda, e um
  // `ref` não faz. Aqui nunca deu problema por acaso — `activeAba` mudava
  // sempre no mesmo render em que o conjunto crescia —, mas era acaso.
  //
  // O ajuste faz-se DURANTE o render (o padrão que o React documenta para
  // estado derivado de props): quando se detecta a mudança, marca-se o
  // estado novo e usa-se JÁ o valor novo nesta passagem. O React redesenha
  // antes de tocar no ecrã — sem efeito, sem render em cascata, e sem o
  // separador aparecer vazio por um instante.
  //
  // O evento viaja DENTRO do estado: assim uma mudança de `:id` não pode
  // deixar para trás as visitas do evento anterior.
  const [visitas, setVisitas] = useState(() => ({
    evento: id,
    abas: new Set([activeAba]),
  }));

  let visitadas = visitas.abas;
  if (visitas.evento !== id) {
    visitadas = new Set([activeAba]);
    setVisitas({ evento: id, abas: visitadas });
  } else if (!visitas.abas.has(activeAba)) {
    visitadas = new Set(visitas.abas).add(activeAba);
    setVisitas({ evento: id, abas: visitadas });
  }

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
        const [evento, modelos, { data: convites }, pagamentos, fotos] =
          await Promise.all([
            getEventoCompleto(id),
            getEventTypes(),
            supabase
              .from("invites")
              .select("*")
              .or(`submission_id.eq.${id},submission_alvo_id.eq.${id}`)
              .throwOnError(),
            getPagamentosEvento(id),
            // Só a CONTAGEM (head) — é ela que dá a etiqueta da aba
            // Fotografias sem esperar que a aba seja visitada, o mesmo
            // padrão dos pagamentos. A aba continua a reportar ao
            // montar, e fica certa depois de carregar/apagar.
            supabase
              .from("evento_fotografias")
              .select("id", { count: "exact", head: true })
              .eq("submission_id", id),
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
        // Sem afirmar «0» quando a contagem em si falhou.
        if (fotos && !fotos.error) {
          reportarContagem("fotografias", fotos.count || 0);
        }
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
  }, [id, reportarContagem]);

  // Os ÓRFÃOS, à parte do Promise.all da carga principal e de propósito:
  // um órfão que não se leia é um aviso que não aparece, não uma página
  // partida. Se falhar, cala-se — nunca afirma «não há órfãos».
  useEffect(() => {
    let cancelado = false;
    getFormulariosOrfaos()
      .then((lista) => !cancelado && setOrfaos(lista))
      .catch((e) => console.error("Erro ao ler formulários órfãos:", e));
    getReservaProvisoriaDoEvento(id)
      .then((r) => !cancelado && setReservaProvisoria(r))
      .catch((e) => console.error("Erro ao ler a reserva do evento:", e));
    return () => {
      cancelado = true;
    };
    // `id` nas dependências: mudar de evento SEM remontar a página
    // (é o mesmo componente com outro :id) tem de reler a reserva —
    // senão ficava a do evento anterior, e o convite nascia ligado à
    // reserva errada.
  }, [id]);

  // Os IRMÃOS do dia — a matéria-prima do selo e do banner da disputa.
  //
  // Vive num efeito PRÓPRIO, preso à data, e não no Promise.all da
  // carga: a data_evento só se conhece quando o evento pousa, e prender
  // o efeito a ela dá as duas coisas de uma vez — a primeira leitura
  // (logo a seguir à carga) e a releitura quando a data muda (edição do
  // briefing ou UPDATE em directo). Mudar a data dissolve a disputa
  // sozinha, como manda o padrão do caducou.
  //
  // Só se pergunta quando este evento COMPETE: vivo (fase ≠ perdido) e
  // com a data ainda por vir — um evento perdido não disputa nada, e
  // numa data passada a corrida já não existe (a definição de «vivo»
  // da decisão de 08/08). Se a 083 ainda não correu, a lib devolve []
  // em silêncio e a UI cala-se.
  //
  // A resposta viaja COM a chave do dia (o padrão das `visitas`, um
  // andar acima): mudar de data ou de evento invalida a lista velha no
  // próprio render — sem um setState síncrono no efeito a limpá-la, e
  // sem a disputa do dia anterior aparecer um instante na data nova.
  const [respostaIrmaos, setRespostaIrmaos] = useState({
    chave: null,
    lista: [],
  });
  const dataEvento = submissao?.data_evento || null;
  const eventoCompete =
    !!dataEvento && dataEvento >= hojeISO && submissao?.fase !== "perdido";
  const chaveDia = eventoCompete ? `${id}|${dataEvento}` : null;
  useEffect(() => {
    if (!chaveDia) return undefined;
    let cancelado = false;
    irmaosDoDia(dataEvento, id)
      .then(
        (lista) =>
          !cancelado &&
          setRespostaIrmaos({ chave: chaveDia, lista: lista || [] }),
      )
      // Falhar cala-se — nunca se afirma «sem disputa» por um erro de
      // leitura (a chave não bate e a lista não se mostra).
      .catch((e) => console.error("Erro ao ler os irmãos do dia:", e));
    return () => {
      cancelado = true;
    };
  }, [chaveDia, dataEvento, id]);
  const irmaos =
    chaveDia && respostaIrmaos.chave === chaveDia ? respostaIrmaos.lista : [];

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

  // Os documentos do evento — a régua da Jornada precisa da evidência
  // da assinatura (o contrato acende pelo documento, não só pela fase).
  // Falhar deixa a régua decidir pela fase, como sempre decidiu.
  const [documentosEvidencia, setDocumentosEvidencia] = useState([]);
  useEffect(() => {
    let cancelado = false;
    documentosDoEvento(id)
      .then((docs) => !cancelado && setDocumentosEvidencia(docs || []))
      .catch((e) => {
        console.warn("Documentos indisponíveis para a régua:", e?.message || e);
        if (!cancelado) setDocumentosEvidencia([]);
      });
    return () => {
      cancelado = true;
    };
  }, [id]);

  // Os avisos tocam também aqui — a subscrição realtime + o toast eram
  // do AdminPage, e a ficha do evento ficava surda. O hook vive ANTES
  // dos retornos do esqueleto (regra dos hooks); o toast pinta-se no
  // fim da página, e a Caixa de Entrada da sidebar abre o mesmo painel
  // que no resto do backoffice.
  const notificacoes = useNotificacoes();
  const [caixaAberta, setCaixaAberta] = useState(false);
  const [caixaDestaque, setCaixaDestaque] = useState(null);

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
    return <Centrado>Não foi possível abrir o evento. Tente recarregar.</Centrado>;

  const numeroWhatsapp =
    getValorAtual(submissao, "numeroWhatsapp") ||
    getValorAtual(submissao, "contactoPrincipal") ||
    null;
  const ligacaoWhatsApp = numeroWhatsapp ? linkWhatsApp(numeroWhatsapp) : null;

  // CADUCADO: a data pedida passou e o negócio nunca fechou. Usa a lista
  // canónica FASES_POS_SINAL — a mesma da conferência da Logística, das
  // lacunas de formulário e da etapa 7 da Jornada. Não é lista nova.
  const dataPassou =
    !!submissao?.data_evento && submissao.data_evento < hojeISO;
  const negocioFechou = FASES_POS_SINAL.includes(submissao?.fase);
  const portalIndisponivel =
    submissao?.fase === "perdido" || (dataPassou && !negocioFechou);

  // A DISPUTA vista deste evento: disputado = há irmãos vivos ainda sem
  // sinal (ou reservas provisórias) — a corrida está aberta; tomado =
  // um irmão já registou sinal — o dia é dele e este evento precisa de
  // nova data. O selo do cabeçalho acende em QUALQUER dos casos (um dia
  // tomado disputa-se ainda mais); a diferença de gravidade conta-a o
  // banner.
  const diaDisputado = irmaos.some((i) => !i.temSinal);
  const diaTomadoPorRival = irmaos.some((i) => i.temSinal);

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
  // continua a levar só o pedido pontual que ainda existe (verPerdidos),
  // consumido uma vez pela AdminPage. O gerarDoc desapareceu (o documento
  // tem endereço próprio) e o formularioDe também (a criação e o
  // «Preencher» resolvem-se dentro do evento).
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

  // «Abrir ficha completa» de um aviso da Caixa, visto DAQUI — o mesmo
  // contrato do AdminPage, com um atalho: os avisos do acompanhamento
  // DESTE evento abrem a folha aqui mesmo, sem viagem.
  const abrirAvisoDaCaixa = (submissionId, tipo) => {
    if (!submissionId) return;
    const doAcompanhamento = [
      "codigo_pedido",
      "pedido_alteracao",
      "contrato_papel",
      "questionario_pedido",
      "orcamento_aceite",
      "projecto_aprovado",
      "contrato_assinado",
    ].includes(tipo);
    setCaixaAberta(false);
    if (doAcompanhamento) {
      if (submissionId === id) setPedidoAcompanhamento(true);
      else
        navigate(`/evento/${submissionId}`, {
          state: { abrirAcompanhamento: true },
        });
      return;
    }
    if (tipo === "questionario_entregue") {
      if (submissionId !== id) navigate(`/evento/${submissionId}`);
      return;
    }
    if (tipo === "avaliacao_recebida") {
      navigate(caminhoDoSeparador("avaliacoes"));
      return;
    }
    // Captação e restantes: a ficha deles vive no drawer dos Contactos.
    navigate(caminhoDoSeparador("clientes"));
  };

  // Abrir do toast leva ao sítio que o próprio aviso promete.
  const abrirDeToast = (n) => {
    notificacoes.limparNova();
    const doAcompanhamento = [
      "codigo_pedido",
      "pedido_alteracao",
      "contrato_papel",
      "questionario_pedido",
      "orcamento_aceite",
      "projecto_aprovado",
      "contrato_assinado",
    ].includes(n.tipo);
    const mesmoEvento = n.submission_id === id;
    if (doAcompanhamento) {
      // Deste evento: abre a folha aqui mesmo, pela porta guardada de
      // sempre (o consumo respeita o portalIndisponivel). De outro:
      // viaja com a mesma promessa que a Caixa de Entrada faz.
      if (mesmoEvento) setPedidoAcompanhamento(true);
      else
        navigate(`/evento/${n.submission_id}`, {
          state: { abrirAcompanhamento: true },
        });
      return;
    }
    if (n.tipo === "questionario_entregue") {
      if (!mesmoEvento && n.submission_id)
        navigate(`/evento/${n.submission_id}`);
      return;
    }
    if (n.tipo === "avaliacao_recebida") {
      navigate(caminhoDoSeparador("avaliacoes"));
      return;
    }
    // Captação e restantes: a casa deles é a Caixa de Entrada.
    navigate(caminhoDoSeparador("inicio"), {
      state: { notifDestaque: n.id },
    });
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
        naoLidas={notificacoes.naoLidas}
        onAbrirNotificacoes={() => {
          setCaixaDestaque(null);
          setCaixaAberta(true);
        }}
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
          diaDisputado={diaDisputado || diaTomadoPorRival}
          invites={invites}
          previstos={plano.previstos}
          pagamentos={plano.pagamentos}
          documentos={documentosEvidencia}
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
          onPortal={
            // O botão ausenta-se em dois casos, e a decisão vive aqui e não
            // na moldura — é regra de negócio, e a moldura só sabe desenhar.
            // É o mesmo mecanismo do WhatsApp, que também se ausenta quando
            // não há número.
            //
            // 1 · PERDIDO — não há acompanhamento a propor a quem já não é
            //     cliente. Recuperar o evento traz o botão de volta.
            //
            // 2 · CADUCADO — a data pedida passou e o negócio nunca fechou.
            //     Um portal aqui aponta para a frente num assunto que
            //     morreu, e a página teria de se desdizer.
            //
            // ⚠ A CONJUNÇÃO É QUE IMPORTA no segundo caso. Um evento que
            //    JÁ ACONTECEU (data passada COM sinal pago) mantém o botão
            //    de propósito: «O grande dia · foi um gosto pôr a sua mesa»
            //    é uma boa última página, e ela pode querer partilhá-la
            //    depois da festa.
            portalIndisponivel ? undefined : () => setPortalAberto(true)
          }
          onEtapa={irComGesto}
          onProximoGesto={irComGesto}
          onStatusChange={aoMudarEstado}
        />

        <div key={id} style={{ padding: "24px 40px 60px" }}>
          {/* O banner da disputa vive ACIMA dos painéis e fora deles:
              é da página, não de um separador — a Nádia tem de o ver
              esteja onde estiver, e nada aqui bloqueia o trabalho. */}
          {(diaDisputado || diaTomadoPorRival) && (
            <BannerDisputaDia
              irmaos={irmaos}
              dataEvento={dataEvento}
              hojeISO={hojeISO}
              submissionId={id}
              prazoAtual={submissao.dia_guardado_ate || null}
              nomeCliente={
                submissao.cliente?.nome ||
                extrairDadosCliente(submissao.respostas || {}).nome
              }
              numeroWhatsapp={numeroWhatsapp}
              onPrazoGuardado={(atualizado) =>
                // O prazo volta da BD já gravado; o retrato local
                // acompanha-o sem reler a página inteira.
                setSubmissao((s) =>
                  s
                    ? { ...s, dia_guardado_ate: atualizado.dia_guardado_ate }
                    : s,
                )
              }
              onAbrirRival={(rivalId) => navigate(`/evento/${rivalId}`)}
            />
          )}
          {visitadas.has("visao-geral") && (
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

          {visitadas.has("fotografias") && (
            <Painel visivel={activeAba === "fotografias"}>
              <FotografiasEvento
                submissao={submissao}
                reportarContagem={reportarContagem}
              />
            </Painel>
          )}

          {visitadas.has("documentos") && (
            <Painel visivel={activeAba === "documentos"}>
              <DocumentosEvento
                submissao={submissao}
                invites={invites}
                eventTypes={eventTypes}
                onConviteCriado={(convite) =>
                  setInvites((lista) => [convite, ...lista])
                }
                orfaos={orfaos}
                reservaProvisoria={reservaProvisoria}
                onNavegar={(destino) => navigate(destino)}
                onAvisar={(m) => setErroAccao(m)}
                onAdoptarOrfao={async (orfao) => {
                  const atualizado = await apontarConviteAoEvento(
                    orfao.id,
                    id,
                  );
                  // Passa a ser o formulário DESTE evento e sai da lista
                  // dos soltos — as duas metades no mesmo gesto, senão a
                  // linha muda de estado e o aviso fica lá a oferecer o
                  // mesmo órfão outra vez.
                  setInvites((lista) => [atualizado, ...lista]);
                  setOrfaos((lista) =>
                    lista.filter((o) => o.id !== atualizado.id),
                  );
                }}
                realce={realce}
                onRealceConsumido={() => setRealce(null)}
                onContagem={(n) => reportarContagem("documentos", n)}
                onGerarDocumento={(evento, tipoDoc) =>
                  navigate(
                    `${caminhoDoSeparador("orcamentos")}/${evento.id}/${tipoDoc}`,
                  )
                }
                onVerFormulario={() => {
                  // "Ver respostas" lê-se na Visão Geral, sem sair da
                  // página (o destino antigo — a lista de convites do
                  // admin — era um beco: o modal do convite preenchido
                  // não mostra respostas). O caso PENDENTE já não passa
                  // por aqui: o «Preencher» resolve-se na própria aba.
                  irParaAba("visao-geral");
                }}

              />
            </Painel>
          )}

          {visitadas.has("materiais") && (
            <Painel visivel={activeAba === "materiais"}>
              <FichaEvento
                submissions={[submissao]}
                eventTypes={eventTypes}
                submissionIdFixo={id}
                onContagem={(n) => reportarContagem("materiais", n)}
              />
            </Painel>
          )}

          {visitadas.has("pagamentos") && (
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

          {visitadas.has("notas") && (
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
            Tem {porGuardar}{" "}
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

      <PortalDoClienteSheet
        evento={submissao}
        aberto={portalAberto}
        onFechar={() => setPortalAberto(false)}
      />

      {/* A Caixa de Entrada — o mesmo painel do resto do backoffice. */}
      <PainelNotificacoes
        aberto={caixaAberta}
        destaqueId={caixaDestaque}
        lista={notificacoes.lista}
        naoLidas={notificacoes.naoLidas}
        eventTypes={[]}
        onFechar={() => setCaixaAberta(false)}
        onMarcarLida={notificacoes.marcarLida}
        onMarcarTodas={notificacoes.marcarTodas}
        onApagarVarias={notificacoes.apagarVarias}
        onAbrirEvento={abrirAvisoDaCaixa}
      />

      {/* O toast dos avisos toca ONDE ELA ESTÁ — antes, o sistema de
          notificações vivia só no AdminPage e um pedido de código chegado
          com a ficha do evento aberta ficava mudo até se mudar de página.
          Abrir leva ao sítio que o próprio aviso promete: os do portal
          deste evento abrem a folha do Acompanhamento aqui mesmo. */}
      <ToastNotificacao
        nova={notificacoes.nova}
        eventTypes={[]}
        onAbrir={abrirDeToast}
        onFechar={notificacoes.limparNova}
      />
    </div>
  );
}
