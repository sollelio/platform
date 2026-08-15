import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Esqueleto } from "../admin/acabamento";
import { overline, playfair, diaEMes, diaMesAno } from "./base";
import { FileteComLosango, Assinatura, Medalhao } from "./pecas";
import { CapsulaVazada, LigacaoDiscreta } from "./documentos-pecas";
import {
  ListaDePartes, CartaoDePasso, LinhaDeResposta, CaixaAberta,
  FioDeGuardado, MarcaDeAutoria, BlocoDeFecho, PassoPorResponder,
  ValorDaResposta,
} from "./questionario-pecas";
import EditorDeCampo from "./EditorDeCampo";
import { useCasa } from "../CasaProvider";
import { nomeDaCasa } from "../../lib/casa";
import {
  verQuestionario, responder, pedirAlteracaoCampo, passoRespondido, passoOndeFicou,
  contagemPorExtenso, ondeFicouPorExtenso, emDe, diasAte,
} from "../../lib/questionarioPortal";
import { PARTES_MORADA, moradaValida } from "../../lib/morada";

// ============================================================
// QuestionarioVista — o formulário no acompanhamento (fase 5).
//
// /acompanhar/:token/questionario
//
// ESTE É O ECRÃ QUE MAIS VEZES VAI APARECER. Dos treze eventos, quatro têm
// formulário respondido — os outros nunca lá tocaram. Por isso o estado
// principal desta vista não é a revisão: é o CONVITE.
//
// E um convite não é uma cobrança. A pessoa não está atrasada, está no
// princípio. Daí não haver barra de progresso, percentagem, «pendente» nem
// «em falta» em ecrã nenhum desta vista — contam-se partes e perguntas, e
// diz-se quanto tempo leva.
//
// ⚠ Modelos com menos de 5 campos não têm formulário nenhum (063). A RPC
// devolve `mostrar: false` e esta vista manda a pessoa de volta ao
// acompanhamento — não há aqui um estado vazio a explicar-se, porque não
// há nada para explicar: aquele modelo ainda não tem perguntas.
// ============================================================

export default function QuestionarioVista({ token, sub }) {
  const navigate = useNavigate();
  const [dados, setDados] = useState(null);
  const [estado, setEstado] = useState("a-carregar");
  // Depois de gravar, pede-se a verdade ao servidor outra vez em vez de a
  // remendar à mão no estado local: é ele que sabe se o campo fechou entre
  // o carregar da página e o guardar.
  const [recarga, setRecarga] = useState(0);
  // Um refetch falhado DEPOIS de a lista já ter estado no ecrã não a pode
  // substituir pelo ecrã de erro: o que guardou ficou guardado. O ecrã de
  // erro inteiro fica reservado ao primeiro carregamento.
  const [recargaFalhou, setRecargaFalhou] = useState(false);
  const jaEstevePronto = useRef(false);

  // A vista remonta por key={sub} — cada troca de ecrã repõe o topo. Corre
  // ainda no esqueleto, antes de Respostas montar: o scroll da retoma corre
  // depois e ganha-lhe. Sem smooth — respeita prefers-reduced-motion.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    let cancelado = false;
    verQuestionario(token)
      .then((d) => {
        if (cancelado) return;
        setDados(d);
        const ok = d?.estado === "ok";
        setEstado(ok ? "pronto" : "erro");
        if (ok) jaEstevePronto.current = true;
        setRecargaFalhou(false);
      })
      .catch((e) => {
        console.error(e);
        if (cancelado) return;
        if (jaEstevePronto.current) setRecargaFalhou(true);
        else setEstado("erro");
      });
    return () => {
      cancelado = true;
    };
  }, [token, recarga]);

  if (estado === "a-carregar") {
    return (
      <div style={{ padding: "34px 26px 32px" }}>
        <Esqueleto w="45%" h={11} r={2} />
        <Esqueleto w="90%" h={26} r={2} style={{ marginTop: "14px" }} />
        <Esqueleto w="100%" h={60} r={2} style={{ marginTop: "14px" }} />
        <Esqueleto w="100%" h={220} r={2} style={{ marginTop: "26px" }} />
      </div>
    );
  }

  if (estado === "erro") {
    return (
      <div style={{ padding: "34px 26px 32px" }}>
        <p style={overline()}>O formulário</p>
        <p style={{ ...playfair, fontSize: "21px", lineHeight: 1.32, marginTop: "11px", textWrap: "balance" }}>
          Não conseguimos abrir as perguntas agora.
        </p>
        <p style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--gray-mid)", margin: "11px 0 0", textWrap: "pretty" }}>
          Nada do que respondeu se perdeu. Volte a tentar daqui a pouco — e se
          continuar assim, diga-nos, que tratamos disso.
        </p>
        <CapsulaVazada onClick={() => navigate(0)} style={{ marginTop: "22px" }}>
          Tentar outra vez
        </CapsulaVazada>
      </div>
    );
  }

  // Modelo sem perguntas que cheguem: não se inventa um ecrã para isso.
  if (!dados?.mostrar) return <Navigate to={`/acompanhar/${token}`} replace />;

  const passos = dados.passos || [];
  const ondeFicou = dados.comecado ? passoOndeFicou(passos) : null;

  // Responder e rever são o MESMO ecrã. Não há assistente à parte: as
  // respostas vivem agrupadas pelos passos do modelo e mudam-se onde
  // estão. Quem chega para responder de raiz vê a mesma grelha com os
  // valores por preencher — e é por isso que o gesto de responder pela
  // primeira vez e o de corrigir a dez dias do dia são o mesmo gesto.
  if (sub === "responder" || sub === "respostas" || dados.entregue_em) {
    return (
      <Respostas
        token={token}
        dados={dados}
        sub={sub}
        recargaFalhou={recargaFalhou}
        aoMudar={() => setRecarga((r) => r + 1)}
      />
    );
  }

  return dados.comecado ? (
    <ConviteAMeio token={token} passos={passos} ondeFicou={ondeFicou} navegar={navigate} />
  ) : (
    <Convite token={token} passos={passos} navegar={navigate} />
  );
}

// ---------- Ecrã 1 · O convite ----------
//
// O primeiro bloco é centrado, e a lista que vem a seguir é alinhada à
// esquerda: o convite fala primeiro, e só depois mostra o que há dentro.

function Convite({ token, passos, navegar }) {
  return (
    <div style={{ padding: "34px 26px 32px" }}>
      <div style={{ textAlign: "center" }}>
        <p style={overline()}>O formulário</p>
        <p style={{ ...playfair, fontSize: "23px", lineHeight: 1.28, marginTop: "12px", textWrap: "balance" }}>
          Conte-nos como imagina o dia.
        </p>
        <p style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--gray-mid)", margin: "12px 0 0", textWrap: "pretty" }}>
          São as perguntas que nos dizem como quer a mesa: as horas, as cores,
          o que vai estar escrito à entrada. É daqui que sai o trabalho da
          equipa.
        </p>
      </div>

      <FileteComLosango margem="24px 0" />

      <p style={{ ...overline("#9B9B9B", "0.22em", "9px"), textAlign: "center" }}>
        O que lhe vamos perguntar
      </p>

      <ListaDePartes
        partes={passos.map((p) => ({
          chave: p.ordem,
          nome: p.titulo,
          contagem: contagemPorExtenso(p.total),
          estado: "porVir",
        }))}
      />

      <p style={{ fontSize: "12px", lineHeight: 1.7, color: "var(--gray-mid)", margin: 0, textWrap: "pretty" }}>
        Leva cerca de dez minutos. Pode responder aos poucos — cada resposta
        fica guardada quando carrega em «Guardar», e volta quando quiser.
      </p>

      <CapsulaVazada
        onClick={() => navegar(`/acompanhar/${token}/questionario/responder`)}
        style={{ marginTop: "22px" }}
      >
        Começar o formulário
      </CapsulaVazada>

      <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: "15px 0 0", textAlign: "center", textWrap: "pretty" }}>
        Sem pressa nenhuma. As respostas podem mudar depois, até perto do dia.
      </p>

      <p style={{ textAlign: "center", margin: "26px 0 0" }}>
        <LigacaoDiscreta
          onClick={() => navegar(`/acompanhar/${token}`)}
          style={{ padding: "12px 10px 3px", margin: "-12px -10px 0" }}
        >
          Voltar ao acompanhamento
        </LigacaoDiscreta>
      </p>

      <Assinatura style={{ marginTop: "30px" }} />
    </div>
  );
}

// ---------- Ecrã 2 · A retoma ----------
//
// O título nomeia onde ela ficou — «Ficou nas cores» — em vez de dizer
// «formulário incompleto». É a mesma informação e é outra coisa: uma
// nomeia o sítio, a outra nomeia uma falta.
//
// Não há aqui o overline «O que lhe vamos perguntar»: ela já sabe o que lhe
// perguntam, já lá esteve. A lista entra logo a seguir ao filete.

function ConviteAMeio({ token, passos, ondeFicou, navegar }) {
  // Pode vir null — e nessa altura o ecrã não nomeia o sítio, em vez de o
  // nomear em português torto.
  const sitio = ondeFicouPorExtenso(ondeFicou?.titulo);

  return (
    <div style={{ padding: "34px 26px 32px" }}>
      <div style={{ textAlign: "center" }}>
        <p style={overline()}>O formulário</p>
        <p style={{ ...playfair, fontSize: "23px", lineHeight: 1.28, marginTop: "12px", textWrap: "balance" }}>
          {sitio ? `Ficou ${sitio}. Continuamos daí?` : "Continuamos de onde ficou?"}
        </p>
        <p style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--gray-mid)", margin: "12px 0 0", textWrap: "pretty" }}>
          O que respondeu está guardado. Não perdeu nada, e não precisa de
          voltar ao princípio.
        </p>
      </div>

      <FileteComLosango margem="24px 0" />

      <ListaDePartes
        style={{ marginTop: 0 }}
        partes={passos.map((p) => {
          const feita = passoRespondido(p);
          const actual = !feita && p.ordem === ondeFicou?.ordem;
          return {
            chave: p.ordem,
            nome: p.titulo,
            feita,
            actual,
            contagem: feita
              ? "respondida"
              : actual
                ? `${contagemPorExtenso(p.total)} · é aqui que ficou`
                : contagemPorExtenso(p.total),
          };
        })}
      />

      <CapsulaVazada
        onClick={() => navegar(`/acompanhar/${token}/questionario/responder`)}
        style={{ marginTop: "8px" }}
      >
        Continuar onde ficou
      </CapsulaVazada>

      <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: "15px 0 0", textAlign: "center", textWrap: "pretty" }}>
        Ou{" "}
        <LigacaoDiscreta
          onClick={() => navegar(`/acompanhar/${token}/questionario/respostas`)}
          style={{ fontSize: "11px", color: "var(--gold-dark)", paddingBottom: "2px" }}
        >
          rever o que já respondeu
        </LigacaoDiscreta>
        .
      </p>

      <p style={{ textAlign: "center", margin: "26px 0 0" }}>
        <LigacaoDiscreta
          onClick={() => navegar(`/acompanhar/${token}`)}
          style={{ padding: "12px 10px 3px", margin: "-12px -10px 0" }}
        >
          Voltar ao acompanhamento
        </LigacaoDiscreta>
      </p>

      <Assinatura style={{ marginTop: "30px" }} />
    </div>
  );
}

// ---------- Ecrãs 3 a 7 · As respostas ----------
//
// Um cartão por PASSO do modelo, nunca por resposta — e é a mesma página
// para responder de raiz e para rever a dez dias do dia.
//
// O que carrega a grelha inteira é a PAUTA: um traço dourado por baixo do
// valor quer dizer «muda-se aqui»; sem traço, «passa por nós». Não há
// cadeados nem cinzentos-desactivados. Quem usa a página uma vez aprende-o
// sem explicação e passa a ler quarenta respostas num relance.

// O que se diz por cima de um campo fechado. O motivo é MATERIAL — o que
// aconteceu no mundo — e não administrativo («prazo expirado»).
// A metade curta do mesmo motivo, para a linha por baixo do valor.
const SEGUIU_PARA = {
  compras: "seguiu para as compras",
  producao: "seguiu para impressão",
  palavras: "seguiu para a equipa",
};

const MOTIVO_DO_FECHO = {
  compras: "Já seguiu para as compras",
  producao: "Já seguiu para impressão",
  palavras: "Já seguiu para a equipa",
};

// Estes dois não se editam no portal: não há aqui selector de cor nem
// formulário de morada, e fingir que há era pior. Mudam-se pelo mesmo
// caminho de um campo fechado — que é, aliás, o que o desenho faz.
const SO_POR_PEDIDO = ["paleta", "morada"];

function Respostas({ token, dados, sub, recargaFalhou, aoMudar }) {
  const casa = useCasa();
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(null); // { campo, valor } | { campo, fecho: campo.id }
  const [aGuardar, setAGuardar] = useState(false);
  const [guardado, setGuardado] = useState(null); // id do campo
  const [erro, setErro] = useState(null);
  // Com alterações por guardar, nenhum toque fora fecha a edição — e, para
  // o toque bloqueado não ler como avaria, diz-se porquê dentro da caixa.
  const [avisoSujo, setAvisoSujo] = useState(false);
  // O pedido de alteração vive em ESTADO, não em rota: é um passo por cima
  // das respostas, como os actos são um passo por cima do documento. A rota
  // do acompanhamento só tem dois níveis, e inventar um terceiro para isto
  // punha o campo no endereço sem ganho nenhum.
  const [pedido, setPedido] = useState(null);       // { campo, passo }
  const [pedidoFeito, setPedidoFeito] = useState(null);
  // O valor que ela tinha escrito quando o campo fechou entretanto — para o
  // pedido de alteração não começar vazio. Leva o id do campo a que
  // pertence, para nunca pré-encher o pedido de OUTRA resposta.
  const [pedidoInicial, setPedidoInicial] = useState(null); // { campo, valor }
  // Os passos arrumados (sem cartão) que ela abriu com um toque. Quem chega
  // de raiz fica com todos abertos — senão não havia onde responder — e a
  // inicialização única impede o colapso no refetch da primeira gravação
  // (Respostas não remonta). Na retoma, o passo onde ficou já vem aberto,
  // pronto para o scroll.
  const [expandidos, setExpandidos] = useState(() => {
    const todos = dados.passos || [];
    if (!dados.comecado) return new Set(todos.map((p) => p.ordem));
    const s = new Set();
    if (sub === "responder") {
      const onde = passoOndeFicou(todos);
      if (onde) s.add(onde.ordem);
    }
    return s;
  });
  const refsPassos = useRef({});

  // Repõe o topo ao entrar e ao sair do pedido e do «pedido enviado».
  // Declarado ANTES do scroll da retoma: na montagem, o dela corre depois
  // e ganha. Sem smooth — respeita prefers-reduced-motion.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pedido, pedidoFeito]);

  // A retoma leva a pessoa ao passo onde ficou — o sítio que «Continuar
  // onde ficou» promete. Só na montagem, e só a quem vem responder: quem
  // vem rever começa no topo.
  useEffect(() => {
    if (sub !== "responder" || !dados.comecado) return;
    const onde = passoOndeFicou(dados.passos || []);
    if (onde) refsPassos.current[onde.ordem]?.scrollIntoView({ block: "start" });
    // Deliberadamente só na montagem: é o gesto de chegada, não um íman.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enquanto o pedido está aberto, o «voltar» do telefone fecha O PEDIDO,
  // não o formulário inteiro: o abrir empurra uma entrada ao histórico e
  // este listener consome-a. Comportamento de folha, sem rota nova.
  useEffect(() => {
    if (!pedido) return undefined;
    const aoRecuar = () => {
      setPedido(null);
      setErro(null);
      setPedidoInicial(null);
    };
    window.addEventListener("popstate", aoRecuar);
    return () => window.removeEventListener("popstate", aoRecuar);
  }, [pedido]);

  const passos = dados.passos || [];
  const haFechados = passos.some((p) => p.fechado);

  // Um passo por começar anuncia-se SEM cartão, no fim — não é uma secção
  // vazia a pedir preenchimento, é uma nota a dizer que ainda não faz
  // falta. Um toque na nota abre o cartão do passo no lugar; a quem chega
  // de raiz mostram-se todos, senão não havia onde responder.
  const arrumado = (p) => dados.comecado && p.respondidos === 0 && !expandidos.has(p.ordem);
  const comCartao = passos.filter((p) => !arrumado(p));
  const semCartao = passos.filter(arrumado);

  // Só há pedido de alteração ABERTO enquanto a Nádia não respondeu — e é
  // isso que a linha mostra, para ela não redigir tudo de novo só para
  // descobrir no fim que «já está connosco».
  const pedidosAbertos = new Map(
    (dados.pedidos || []).filter((q) => !q.respondido).map((q) => [q.campo, q]),
  );

  // O destino dos fechados deriva do conjunto real: um grupo só, o motivo
  // exacto; misto ou desconhecido, o colectivo neutro.
  const gruposFechados = [...new Set(passos.filter((p) => p.fechado).map((p) => p.grupo?.chave))];
  const destino = gruposFechados.length === 1
    ? ({ compras: "para as compras", producao: "para impressão", palavras: "para a equipa" }[gruposFechados[0]] || "para a equipa")
    : "para a equipa";

  const guardar = async (campo, valor) => {
    if (aGuardar) return;
    setAGuardar(true);
    setErro(null);
    setAvisoSujo(false);
    try {
      const r = await responder(token, campo.id, valor);
      if (r?.estado === "fechado") {
        // Fechou entre o abrir da página e o guardar. Não se finge que
        // guardou: diz-se o que aconteceu, com o motivo à frente — e o
        // BlocoDeFecho abre no próprio lugar, com a porta do pedido. O que
        // ela escreveu guarda-se, para o pedido não começar vazio.
        setPedidoInicial({
          campo: campo.id,
          valor: valor === null || valor === undefined || valor === ""
            ? ""
            : Array.isArray(valor) ? valor.join(", ") : String(valor),
        });
        setErro(`Esta resposta fechou entretanto — ${r.porque}. O que escreveu não se perdeu: peça a alteração e nós vemos o que se consegue.`);
        setAberto({ campo, fecho: campo.id });
        aoMudar();
        return;
      }
      if (r?.estado === "terminado") {
        // O formulário terminou entretanto: a raiz volta a pedir o portal
        // e a Cortina diz a frase certa — não um «tente outra vez» inútil.
        navigate(`/acompanhar/${token}`);
        return;
      }
      if (r?.estado === "campo_desconhecido" || r?.estado === "sem_questionario") {
        setErro("Esta pergunta mudou entretanto. Recarregue a página para ver a versão actual.");
        return;
      }
      if (r?.estado !== "ok") {
        setErro("Não foi possível guardar. Tente outra vez.");
        return;
      }
      setAberto(null);
      setGuardado(campo.id);
      setTimeout(() => setGuardado((g) => (g === campo.id ? null : g)), 6000);
      aoMudar();
    } catch (e) {
      console.error(e);
      setErro("Não foi possível guardar. Verifique a ligação e tente outra vez.");
    } finally {
      setAGuardar(false);
    }
  };

  // `dados` (074): o pedido estruturado — a morada nas cinco partes. Nos
  // campos de texto livre vai null e nada muda.
  const enviarPedido = async (texto, dados = null) => {
    if (aGuardar) return;
    if (dados && !moradaValida(dados)) {
      setErro("Diga-nos pelo menos a rua e a localidade — sem elas a morada não se encontra.");
      return;
    }
    if (!texto || texto.trim().length < 3) {
      setErro(`Escreva o que gostaria de mudar — é o que a ${nomeDaCasa(casa)} vai ler.`);
      return;
    }
    setAGuardar(true);
    setErro(null);
    try {
      const r = await pedirAlteracaoCampo(token, pedido.campo.id, texto.trim(), dados);
      if (r?.estado === "terminado") {
        navigate(`/acompanhar/${token}`);
        return;
      }
      if (r?.estado === "campo_desconhecido") {
        setErro("Esta pergunta mudou entretanto. Recarregue a página para ver a versão actual.");
        return;
      }
      if (r?.estado === "ja_pedido") {
        setErro("Já nos tinha pedido uma alteração a esta resposta — está connosco, e respondemos.");
        return;
      }
      if (r?.estado !== "ok") {
        setErro("Não foi possível enviar. Tente outra vez.");
        return;
      }
      // Consome a entrada que o abrir do pedido empurrou ao histórico — o
      // «voltar» do telefone volta a sair do formulário, como antes.
      window.history.back();
      setPedidoFeito({
        campo: pedido.campo,
        passo: pedido.passo,
        texto: texto.trim(),
        quando: agoraPorExtenso(),
      });
      setPedido(null);
      setPedidoInicial(null);
      aoMudar();
    } catch (e) {
      console.error(e);
      setErro("Não foi possível enviar. Verifique a ligação e tente outra vez.");
    } finally {
      setAGuardar(false);
    }
  };

  if (pedidoFeito) {
    return (
      <PedidoEnviado
        {...pedidoFeito}
        aoVoltar={() => {
          setPedidoFeito(null);
          setAberto(null);
        }}
      />
    );
  }

  if (pedido) {
    return (
      <PedidoDeAlteracao
        campo={pedido.campo}
        passo={pedido.passo}
        aTrabalhar={aGuardar}
        erro={erro}
        inicial={pedidoInicial?.campo === pedido.campo.id ? pedidoInicial.valor : ""}
        aoEnviar={enviarPedido}
        aoVoltar={() => window.history.back()}
      />
    );
  }

  return (
    <div style={{ padding: "34px 26px 32px" }}>
      <p style={overline()}>O formulário</p>
      <p style={{ ...playfair, fontSize: "22px", lineHeight: 1.3, marginTop: "11px", textWrap: "balance" }}>
        As suas respostas.
      </p>
      <p style={{ fontSize: "12px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "11px 0 0", textWrap: "pretty" }}>
        {dados.entregue_em ? `Respondeu a ${diaEMes(dados.entregue_em)}. ` : ""}
        As respostas com um traço dourado por baixo pode mudá-las aqui.
        {/* Só se diz que há outras quando há mesmo. Sem isto, a frase
            afirmava um fecho que ainda não tinha acontecido. */}
        {haFechados ? ` As outras já seguiram ${destino} — mudá-las passa por nós.` : ""}
      </p>

      {/* Só quando nenhuma caixa está aberta: com uma aberta, o erro
          pinta-se lá dentro, ao pé do gesto, e aqui seria um eco. */}
      {erro && !aberto && (
        <p style={{ fontSize: "12px", lineHeight: 1.7, color: "#9C5A3C", margin: "14px 0 0", textWrap: "pretty" }}>
          {erro}
        </p>
      )}

      {recargaFalhou && (
        <p style={{ fontSize: "12px", lineHeight: 1.7, color: "#9C5A3C", margin: "14px 0 0", textWrap: "pretty" }}>
          Não conseguimos actualizar a página agora — o que guardou ficou
          guardado. Recarregue quando puder.
        </p>
      )}

      {comCartao.map((passo, i) => (
        <div key={passo.ordem} ref={(el) => { refsPassos.current[passo.ordem] = el; }}>
        <CartaoDePasso
          titulo={passo.titulo}
          contagem={`${passo.respondidos} de ${passo.total}`}
          style={{ marginTop: i === 0 ? "22px" : "14px" }}
        >
          {passo.campos.map((campo, j) => {
            const soPorPedido = SO_POR_PEDIDO.includes(campo.tipo);
            const podeMudar = !passo.fechado && !soPorPedido;
            const aEditar = aberto?.campo?.id === campo.id && !aberto.fecho;
            const aExplicar = aberto?.fecho === campo.id;
            const dias = passo.fecha_em ? diasAte(passo.fecha_em) : null;
            const pedidoAberto = pedidosAbertos.get(campo.id);
            const abrirPedido = () => {
              setErro(null);
              // Uma entrada no histórico, para o «voltar» do telefone
              // fechar o pedido — não o formulário inteiro.
              window.history.pushState({ dlmPedido: true }, "");
              setPedido({ campo, passo });
            };

            return (
              <LinhaDeResposta
                key={campo.id}
                rotulo={campo.label}
                valor={campo.valor}
                tipo={campo.tipo}
                opcoes={campo.opcoes}
                podeMudar={podeMudar && !aEditar}
                primeira={j === 0}
                ultima={j === passo.campos.length - 1}
                aberta={aEditar || aExplicar}
                aoTocar={() => {
                  // Com alterações por guardar, nenhum toque fora fecha a
                  // edição: as saídas são «Guardar» e «Deixar como estava».
                  const sujo = aberto && !aberto.fecho &&
                    JSON.stringify(aberto.valor ?? null) !== JSON.stringify(aberto.campo.valor ?? null);
                  if (sujo) {
                    setAvisoSujo(true);
                    return;
                  }
                  setAvisoSujo(false);
                  setErro(null);
                  setAberto(
                    aEditar || aExplicar
                      ? null
                      : podeMudar
                        ? { campo, valor: campo.valor }
                        : { campo, fecho: campo.id },
                  );
                }}
                nota={
                  <>
                    {guardado === campo.id && <FioDeGuardado />}
                    {campo.por_equipa && !aEditar && (
                      <MarcaDeAutoria quando={diaEMes(campo.mudado_em)} />
                    )}
                    {/* No máximo UMA linha por resposta: o prazo só se diz
                        quando está perto, e nunca ao lado da marca de
                        autoria. */}
                    {!campo.por_equipa && podeMudar && dias !== null && dias >= 0 && dias <= 7 && (
                      <p style={{ fontSize: "10.5px", lineHeight: 1.6, color: "#A07830", margin: "7px 0 0" }}>
                        {dias === 0 ? "fecha hoje" : dias === 1 ? "fecha amanhã" : `fecha dentro de ${dias} dias`}
                      </p>
                    )}
                    {/* Um pedido em aberto diz-se na própria linha — senão
                        ela redige tudo de novo para descobrir no fim que
                        «já está connosco». */}
                    {pedidoAberto && !aEditar && !aExplicar && (
                      <p style={{ fontSize: "10.5px", lineHeight: 1.6, color: "#A07830", margin: "7px 0 0" }}>
                        pedido de alteração enviado a {diaEMes(pedidoAberto.quando)} · está com a {nomeDaCasa(casa)}
                      </p>
                    )}
                    {!podeMudar && passo.fechado && !aExplicar && !pedidoAberto && (
                      <p style={{ fontSize: "10.5px", lineHeight: 1.6, color: "#9B9B9B", margin: "7px 0 0" }}>
                        {/* O motivo é do GRUPO. Dizer «seguiu para as
                            compras» a um campo que fechou por causa da
                            impressão ou do briefing é dizer-lhe uma razão
                            que não é a dela. */}
                        fechou a {diaEMes(passo.fecha_em)} ·{" "}
                        {SEGUIU_PARA[passo.grupo?.chave] || "seguiu para a equipa"}
                      </p>
                    )}
                  </>
                }
              >
                {aEditar && (
                  <CaixaAberta>
                    <EditorDeCampo
                      campo={campo}
                      valor={aberto.valor}
                      aTrabalhar={aGuardar}
                      erro={erro}
                      aviso={avisoSujo ? "Tem alterações por guardar — guarde, ou deixe como estava." : null}
                      aoMudar={(v) => setAberto((a) => ({ ...a, valor: v }))}
                      aoGuardar={() => guardar(campo, aberto.valor)}
                      aoDesistir={() => {
                        setAberto(null);
                        setErro(null);
                        setAvisoSujo(false);
                      }}
                      consequencia={
                        campo.valor !== null && campo.valor !== undefined && campo.valor !== ""
                          ? `Era ${campo.tipo === "date" ? diaMesAno(String(campo.valor)) || campo.valor : campo.valor}.${passo.grupo && passo.fecha_em ? ` É com isto que ${passo.grupo.porque} — fecha a ${diaEMes(passo.fecha_em)}.` : ""}`
                          : null
                      }
                    />
                    {campo.por_equipa && (
                      <MarcaDeAutoria aberta quando={diaEMes(campo.mudado_em)} antes={campo.antes} />
                    )}
                  </CaixaAberta>
                )}

                {/* O erro do «fechou entretanto» pinta-se aqui, no lugar do
                    gesto — e fica à vista também enquanto o refetch não
                    chega e o BlocoDeFecho ainda não abriu. */}
                {aExplicar && erro && (
                  <p style={{ fontSize: "12px", lineHeight: 1.7, color: "#9C5A3C", margin: "12px 0 0", textWrap: "pretty" }}>
                    {erro}
                  </p>
                )}

                {aExplicar && passo.fechado && (
                  <BlocoDeFecho
                    motivo={MOTIVO_DO_FECHO[passo.grupo?.chave] || "Já seguiu para a equipa"}
                    quando={diaEMes(passo.fecha_em)}
                    porque={`${passo.grupo?.porque
                      ? passo.grupo.porque.charAt(0).toUpperCase() + passo.grupo.porque.slice(1)
                      : "O trabalho seguiu com este valor"}. É assim que garantimos que chega tudo a tempo.`}
                    aoPedir={
                      pedidoAberto ? (
                        <p style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--gray-mid)", margin: "18px 0 0", textWrap: "pretty" }}>
                          Já nos pediu uma alteração a {diaEMes(pedidoAberto.quando)} — está com a {nomeDaCasa(casa)}, e respondemos.
                        </p>
                      ) : (
                        <CapsulaVazada onClick={abrirPedido} style={{ marginTop: "18px" }}>
                          Pedir alteração
                        </CapsulaVazada>
                      )
                    }
                  />
                )}

                {/* A guarda soPorPedido evita que este bloco apareça no
                    intervalo entre o «fechou entretanto» e o refetch. */}
                {aExplicar && !passo.fechado && soPorPedido && (
                  <CaixaAberta>
                    <p style={overline()}>Esta muda-se connosco</p>
                    <p style={{ ...playfair, fontSize: "19px", lineHeight: 1.32, margin: "10px 0 0", textWrap: "balance" }}>
                      Diga-nos e nós tratamos.
                    </p>
                    <p style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--gray-mid)", margin: "10px 0 0", textWrap: "pretty" }}>
                      As cores e as moradas mexem com encomendas e com quem lá
                      vai ter — por isso passam por nós, mesmo antes de
                      fecharem.
                    </p>
                    {pedidoAberto ? (
                      <p style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--gray-mid)", margin: "18px 0 0", textWrap: "pretty" }}>
                        Já nos pediu uma alteração a {diaEMes(pedidoAberto.quando)} — está com a {nomeDaCasa(casa)}, e respondemos.
                      </p>
                    ) : (
                      <CapsulaVazada onClick={abrirPedido} style={{ marginTop: "18px" }}>
                        Pedir alteração
                      </CapsulaVazada>
                    )}
                  </CaixaAberta>
                )}
              </LinhaDeResposta>
            );
          })}
        </CartaoDePasso>
        </div>
      ))}

      {semCartao.map((passo) => (
        <PassoPorResponder
          key={passo.ordem}
          nome={passo.titulo}
          contagem={contagemPorExtenso(passo.total)}
          quando={passo.fecha_em ? `${diaEMes(passo.fecha_em)}` : null}
          aoTocar={() => setExpandidos((s) => {
            const n = new Set(s);
            n.add(passo.ordem);
            return n;
          })}
        />
      ))}

      <p style={{ textAlign: "center", margin: "26px 0 0" }}>
        <LigacaoDiscreta
          onClick={() => navigate(`/acompanhar/${token}`)}
          style={{ padding: "12px 10px 3px", margin: "-12px -10px 0" }}
        >
          Voltar ao acompanhamento
        </LigacaoDiscreta>
      </p>

      <Assinatura style={{ marginTop: "30px" }} />
    </div>
  );
}

// «8 de Novembro de 2026, às 21:04» — a hora fixa-se no momento do envio,
// e não se vai buscar ao servidor: o registo que ela lê é o do gesto que
// acabou de fazer.
function agoraPorExtenso() {
  const d = new Date();
  return `${diaMesAno(d.toISOString())}, às ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ---------- Ecrã 8 · O pedido de alteração ----------
//
// Não é uma reclamação nem um recurso: é a mesma conversa com outra porta.
// Por isso o ecrã mostra PRIMEIRO o que está lá agora — o valor fica sempre
// à vista, fechar uma resposta nunca a esconde — e só depois pede as
// palavras dela.
//
// A casa nomeia a pessoa: «A Nádia vê o pedido». Nunca «será enviado».
//
// Ecrã de acto, não página completa: leva tira de contexto em cima e não
// leva rodapé.
// A morada nova, composta para a frase do pedido: «Rua Nova, n.º 4,
// 2.º Esq, 2745-000 Queluz». É o texto humano que a Caixa cita; as cinco
// partes seguem à parte, em `dados`, para a folha aplicar num toque.
const comporPedidoMorada = (m) => {
  const linha2 = [m.codigoPostal, m.localidade].filter(Boolean).join(" ");
  return [m.rua, m.numero ? `n.º ${m.numero}` : "", m.andar, linha2]
    .filter(Boolean)
    .join(", ");
};

function PedidoDeAlteracao({ campo, passo, aoEnviar, aoVoltar, aTrabalhar, erro, inicial }) {
  const casa = useCasa();
  // Monta de fresco a cada pedido, por isso o useState inicial chega. Quando
  // o campo fechou com texto já escrito, o pedido não começa vazio — é o que
  // torna verdadeira a frase «o que escreveu não se perdeu».
  const [texto, setTexto] = useState(inicial ? `Gostaria de mudar para: ${inicial}` : "");

  // A morada pede-se ESTRUTURADA (074): as cinco partes de morada.js,
  // pré-preenchidas com o valor actual — mudar o andar não pode obrigar a
  // reescrever a rua. O texto humano compõe-se ao enviar.
  const ehMorada = campo.tipo === "morada";
  const [morada, setMorada] = useState(() => {
    const v = campo.valor && typeof campo.valor === "object" ? campo.valor : {};
    const m = {};
    PARTES_MORADA.forEach((p) => {
      m[p] = String(v[p] || "");
    });
    return m;
  });
  const mudarParte = (parte, v) => setMorada((m) => ({ ...m, [parte]: v }));
  const moradaAparada = () => {
    const m = {};
    PARTES_MORADA.forEach((p) => {
      m[p] = morada[p].trim();
    });
    return m;
  };
  const composta = comporPedidoMorada(moradaAparada());

  return (
    <div style={{ padding: "0 0 30px" }}>
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: "12px", padding: "15px 22px",
          backgroundColor: "#FDFBF5", borderBottom: "1px solid #F0E6D0",
        }}
      >
        <span style={{ font: "700 9px Inter, sans-serif", letterSpacing: "0.18em", textTransform: "uppercase", color: "#9B9B9B" }}>
          Formulário · {passo.titulo}
        </span>
        <LigacaoDiscreta onClick={aoVoltar} style={{ padding: "12px 10px 3px", margin: "-12px -10px 0" }}>
          voltar às respostas
        </LigacaoDiscreta>
      </div>

      <div style={{ padding: "30px 26px 0" }}>
        <p style={overline()}>Pedir alteração</p>
        <p style={{ ...playfair, fontSize: "21px", lineHeight: 1.32, margin: "11px 0 0", textWrap: "balance" }}>
          Diga-nos o que quer mudar {emDe(campo.label)}.
        </p>
        <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "11px 0 0", textWrap: "pretty" }}>
          A {nomeDaCasa(casa)} vê o pedido e responde a dizer o que se consegue — e o que já
          não dá, dá-lo com alternativa.
        </p>

        <div style={{ marginTop: "20px", backgroundColor: "white", border: "1.5px solid #F0E6D0", borderRadius: "14px", padding: "16px 18px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
          <p style={overline("#9B9B9B", "0.22em", "9px")}>O que está lá agora</p>
          <div style={{ marginTop: "11px" }}>
            <ValorDaResposta valor={campo.valor} tipo={campo.tipo} opcoes={campo.opcoes} comPauta={false} />
          </div>
        </div>

        {ehMorada ? (
          <div style={{ marginTop: "14px", backgroundColor: "white", border: "1.5px solid #F0E6D0", borderRadius: "14px", padding: "18px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
            <p style={overline("#9B9B9B", "0.22em", "9px")}>A morada nova</p>
            <ParteDeMorada rotulo="Rua" valor={morada.rua} aoMudar={(v) => mudarParte("rua", v)} autoFocus />
            <div style={{ display: "flex", gap: "16px" }}>
              <ParteDeMorada rotulo="Número" valor={morada.numero} aoMudar={(v) => mudarParte("numero", v)} flex={1} />
              <ParteDeMorada rotulo="Andar / fracção" valor={morada.andar} aoMudar={(v) => mudarParte("andar", v)} flex={1.5} />
            </div>
            <div style={{ display: "flex", gap: "16px" }}>
              <ParteDeMorada rotulo="Código postal" valor={morada.codigoPostal} aoMudar={(v) => mudarParte("codigoPostal", v)} flex={1} />
              <ParteDeMorada rotulo="Localidade" valor={morada.localidade} aoMudar={(v) => mudarParte("localidade", v)} flex={1.5} />
            </div>
            <p style={{ fontSize: "11px", lineHeight: 1.6, color: "#9B9B9B", margin: "14px 0 0", textWrap: "pretty" }}>
              {composta
                ? <>Segue escrita assim: «{composta}».</>
                : "A rua e a localidade chegam — o resto ajuda a dar com a porta certa."}
            </p>
          </div>
        ) : (
          <div style={{ marginTop: "14px", backgroundColor: "white", border: "1.5px solid #F0E6D0", borderRadius: "14px", padding: "18px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
            <p style={overline("#9B9B9B", "0.22em", "9px")}>Por palavras suas</p>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              autoFocus
              placeholder="O que gostaria de mudar, e porquê"
              style={{
                ...playfair, fontStyle: "italic", fontSize: "16px", lineHeight: 1.75,
                color: "var(--charcoal)", width: "100%", boxSizing: "border-box",
                minHeight: "76px", marginTop: "12px", padding: "0 0 10px",
                background: "transparent", border: "none",
                borderBottom: "1px solid #F0E6D0", outline: "none", resize: "vertical",
              }}
            />
            <p style={{ fontSize: "11px", lineHeight: 1.6, color: "#9B9B9B", margin: "10px 0 0" }}>
              Fica escrito aqui, e é assim que o guardamos.
            </p>
          </div>
        )}

        {erro && (
          <p style={{ fontSize: "12px", lineHeight: 1.7, color: "#9C5A3C", margin: "14px 0 0", textWrap: "pretty" }}>
            {erro}
          </p>
        )}

        <CapsulaVazada
          onClick={() => {
            if (ehMorada) {
              const m = moradaAparada();
              aoEnviar(comporPedidoMorada(m), m);
            } else {
              aoEnviar(texto);
            }
          }}
          aTrabalhar={aTrabalhar}
          style={{ marginTop: "20px" }}
        >
          {aTrabalhar ? "A enviar…" : "Enviar o pedido"}
        </CapsulaVazada>

        <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: "15px 0 0", textAlign: "center", textWrap: "pretty" }}>
          A resposta actual mantém-se até nós confirmarmos. Nada muda por
          enquanto.
        </p>
      </div>
    </div>
  );
}

// ---------- Ecrã 9 · O pedido enviado ----------
//
// Sem confetes, sem cápsula dourada, sem exclamação. O que se mostra é o
// REGISTO — o que ficou escrito, palavra a palavra — porque é isso que lhe
// dá confiança de que o pedido não se perdeu.
function PedidoEnviado({ campo, passo, texto, quando, aoVoltar }) {
  const casa = useCasa();
  return (
    <div style={{ padding: "34px 26px 32px" }}>
      <div
        style={{
          position: "relative", marginTop: "18px",
          backgroundColor: "white", border: "1.5px solid #F0E6D0",
          borderRadius: "14px", padding: "30px 20px 22px", textAlign: "center",
          boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
        }}
      >
        <Medalhao />
        <p style={overline()}>Pedido enviado</p>
        <p style={{ ...playfair, fontSize: "22px", lineHeight: 1.3, margin: "10px 0 0", textWrap: "balance" }}>
          O pedido está com a {nomeDaCasa(casa)}.
        </p>
        <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "11px 0 0", textWrap: "pretty" }}>
          Ela vê o que já foi encomendado e diz-lhe o que se consegue mudar a
          esta altura.
        </p>
      </div>

      <div style={{ marginTop: "26px" }}>
        <p style={overline("#9B9B9B", "0.22em", "9px")}>O que ficou registado</p>
        <div style={{ marginTop: "12px" }}>
          <LinhaDeRegisto rotulo="Resposta" valor={`${campo.label} · ${passo.titulo}`} />
          <LinhaDeRegisto rotulo="Pedido" valor={texto} />
          <LinhaDeRegisto rotulo="Enviado" valor={quando} />
        </div>
      </div>

      <div style={{ marginTop: "28px", paddingTop: "19px", borderTop: "1px solid #F0E6D0" }}>
        <p style={overline("#9B9B9B", "0.22em", "9px")}>O que vem a seguir</p>
        <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "12px 0 0", textWrap: "pretty" }}>
          A resposta chega aqui e ao WhatsApp. Enquanto não chegar, fica tudo
          como estava.
        </p>
      </div>

      <div style={{ textAlign: "center", marginTop: "22px" }}>
        <LigacaoDiscreta onClick={aoVoltar} style={{ padding: "12px 10px 3px", margin: "-12px -10px 0" }}>
          Voltar às respostas
        </LigacaoDiscreta>
      </div>

      <Assinatura style={{ marginTop: "30px" }} />
    </div>
  );
}

// Uma parte da morada no formulário do pedido: rótulo pequeno em cima,
// escrita na linha. 16px na escrita — abaixo disso o iOS Safari faz zoom
// ao focar (a mesma regra do EditorDeCampo).
function ParteDeMorada({ rotulo, valor, aoMudar, flex, autoFocus }) {
  return (
    <div style={{ flex: flex || "none", width: flex ? undefined : "100%", minWidth: 0, marginTop: "14px" }}>
      <p style={{ font: "700 9px Inter, sans-serif", letterSpacing: "0.16em", textTransform: "uppercase", color: "#9B9B9B", margin: 0 }}>
        {rotulo}
      </p>
      <input
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        autoFocus={autoFocus}
        aria-label={rotulo}
        style={{
          width: "100%", boxSizing: "border-box", padding: "6px 0 8px",
          fontSize: "16px", fontFamily: "Inter, sans-serif",
          color: "var(--charcoal)", background: "transparent",
          border: "none", borderBottom: "1.5px solid #E8DCC0", outline: "none",
        }}
      />
    </div>
  );
}

function LinhaDeRegisto({ rotulo, valor }) {
  return (
    <div
      style={{
        display: "grid", gridTemplateColumns: "92px 1fr", gap: "14px",
        padding: "12px 0", borderTop: "1px solid #F0E6D0",
      }}
    >
      <span style={{ font: "700 8.5px Inter, sans-serif", letterSpacing: "0.16em", textTransform: "uppercase", color: "#9B9B9B", lineHeight: 1.6, paddingTop: "2px" }}>
        {rotulo}
      </span>
      <span style={{ fontSize: "12px", lineHeight: 1.65, color: "var(--charcoal)", fontVariantNumeric: "tabular-nums", textWrap: "pretty" }}>
        {valor}
      </span>
    </div>
  );
}
