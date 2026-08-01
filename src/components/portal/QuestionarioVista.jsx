import { useEffect, useState } from "react";
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
import {
  verQuestionario, responder, pedirAlteracaoCampo, passoRespondido, passoOndeFicou,
  contagemPorExtenso, ondeFicouPorExtenso, diasAte,
} from "../../lib/questionarioPortal";

// ============================================================
// QuestionarioVista — o questionário no acompanhamento (fase 5).
//
// /acompanhar/:token/questionario
//
// ESTE É O ECRÃ QUE MAIS VEZES VAI APARECER. Dos treze eventos, quatro têm
// questionário respondido — os outros nunca lá tocaram. Por isso o estado
// principal desta vista não é a revisão: é o CONVITE.
//
// E um convite não é uma cobrança. A pessoa não está atrasada, está no
// princípio. Daí não haver barra de progresso, percentagem, «pendente» nem
// «em falta» em ecrã nenhum desta vista — contam-se partes e perguntas, e
// diz-se quanto tempo leva.
//
// ⚠ Modelos com menos de 5 campos não têm questionário nenhum (063). A RPC
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

  useEffect(() => {
    let cancelado = false;
    verQuestionario(token)
      .then((d) => {
        if (cancelado) return;
        setDados(d);
        setEstado(d?.estado === "ok" ? "pronto" : "erro");
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado) setEstado("erro");
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
        <p style={overline()}>O questionário</p>
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
        <p style={overline()}>O questionário</p>
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
        Leva cerca de dez minutos. Pode responder aos poucos — fica guardado à
        medida que escreve, e volta quando quiser.
      </p>

      <CapsulaVazada
        onClick={() => navegar(`/acompanhar/${token}/questionario/responder`)}
        style={{ marginTop: "22px" }}
      >
        Começar o questionário
      </CapsulaVazada>

      <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: "15px 0 0", textAlign: "center", textWrap: "pretty" }}>
        Sem pressa nenhuma. As respostas podem mudar depois, até perto do dia.
      </p>

      <Assinatura style={{ marginTop: "30px" }} />
    </div>
  );
}

// ---------- Ecrã 2 · A retoma ----------
//
// O título nomeia onde ela ficou — «Ficou nas cores» — em vez de dizer
// «questionário incompleto». É a mesma informação e é outra coisa: uma
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
        <p style={overline()}>O questionário</p>
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
const MOTIVO_DO_FECHO = {
  compras: "Já seguiu para as compras",
  producao: "Já seguiu para impressão",
  palavras: "Já seguiu para a equipa",
};

// Estes dois não se editam no portal: não há aqui selector de cor nem
// formulário de morada, e fingir que há era pior. Mudam-se pelo mesmo
// caminho de um campo fechado — que é, aliás, o que o desenho faz.
const SO_POR_PEDIDO = ["paleta", "morada"];

function Respostas({ token, dados, aoMudar }) {
  const [aberto, setAberto] = useState(null); // { campo, valor } | { fecho: campo }
  const [aGuardar, setAGuardar] = useState(false);
  const [guardado, setGuardado] = useState(null); // id do campo
  const [erro, setErro] = useState(null);
  // O pedido de alteração vive em ESTADO, não em rota: é um passo por cima
  // das respostas, como os actos são um passo por cima do documento. A rota
  // do acompanhamento só tem dois níveis, e inventar um terceiro para isto
  // punha o campo no endereço sem ganho nenhum.
  const [pedido, setPedido] = useState(null);       // { campo, passo }
  const [pedidoFeito, setPedidoFeito] = useState(null);

  const passos = dados.passos || [];
  const algumRespondido = passos.some((p) => p.respondidos > 0);
  const haFechados = passos.some((p) => p.fechado);

  // Um passo por começar anuncia-se SEM cartão, no fim — não é uma secção
  // vazia a pedir preenchimento, é uma nota a dizer que ainda não faz
  // falta. Só quando já há outros respondidos: a quem chega de raiz
  // mostram-se todos os cartões, senão não havia onde responder.
  const comCartao = passos.filter((p) => !algumRespondido || p.respondidos > 0);
  const semCartao = passos.filter((p) => algumRespondido && p.respondidos === 0);

  const guardar = async (campo, valor) => {
    if (aGuardar) return;
    setAGuardar(true);
    setErro(null);
    try {
      const r = await responder(token, campo.id, valor);
      if (r?.estado === "fechado") {
        // Fechou entre o abrir da página e o guardar. Não se finge que
        // guardou: diz-se o que aconteceu, com o motivo à frente.
        setErro(`Esta resposta fechou entretanto — ${r.porque}. O que escreveu não se perdeu: peça a alteração e nós vemos o que se consegue.`);
        setAberto(null);
        aoMudar();
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

  const enviarPedido = async (texto) => {
    if (aGuardar) return;
    if (!texto || texto.trim().length < 3) {
      setErro("Escreva o que gostaria de mudar — é o que a Nádia vai ler.");
      return;
    }
    setAGuardar(true);
    setErro(null);
    try {
      const r = await pedirAlteracaoCampo(token, pedido.campo.id, texto.trim());
      if (r?.estado === "ja_pedido") {
        setErro("Já nos tinha pedido uma alteração a esta resposta — está connosco, e respondemos.");
        return;
      }
      if (r?.estado !== "ok") {
        setErro("Não foi possível enviar. Tente outra vez.");
        return;
      }
      setPedidoFeito({
        campo: pedido.campo,
        passo: pedido.passo,
        texto: texto.trim(),
        quando: agoraPorExtenso(),
      });
      setPedido(null);
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
        aoEnviar={enviarPedido}
        aoVoltar={() => {
          setPedido(null);
          setErro(null);
        }}
      />
    );
  }

  return (
    <div style={{ padding: "34px 26px 32px" }}>
      <p style={overline()}>O questionário</p>
      <p style={{ ...playfair, fontSize: "22px", lineHeight: 1.3, marginTop: "11px", textWrap: "balance" }}>
        As suas respostas.
      </p>
      <p style={{ fontSize: "12px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "11px 0 0", textWrap: "pretty" }}>
        {dados.entregue_em ? `Respondeu a ${diaEMes(dados.entregue_em)}. ` : ""}
        As respostas com um traço dourado por baixo pode mudá-las aqui.
        {/* Só se diz que há outras quando há mesmo. Sem isto, a frase
            afirmava um fecho que ainda não tinha acontecido. */}
        {haFechados ? " As outras já seguiram para as compras — mudá-las passa por nós." : ""}
      </p>

      {erro && (
        <p style={{ fontSize: "12px", lineHeight: 1.7, color: "#9C5A3C", margin: "14px 0 0", textWrap: "pretty" }}>
          {erro}
        </p>
      )}

      {comCartao.map((passo, i) => (
        <CartaoDePasso
          key={passo.ordem}
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
                aoTocar={() =>
                  setAberto(
                    aEditar || aExplicar
                      ? null
                      : podeMudar
                        ? { campo, valor: campo.valor }
                        : { campo, fecho: campo.id },
                  )
                }
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
                    {!podeMudar && passo.fechado && !aExplicar && (
                      <p style={{ fontSize: "10.5px", lineHeight: 1.6, color: "#9B9B9B", margin: "7px 0 0" }}>
                        fechou {diaEMes(passo.fecha_em)} · seguiu para as compras
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
                      aoMudar={(v) => setAberto((a) => ({ ...a, valor: v }))}
                      aoGuardar={() => guardar(campo, aberto.valor)}
                      aoDesistir={() => setAberto(null)}
                      consequencia={
                        campo.valor !== null && campo.valor !== undefined && campo.valor !== ""
                          ? `Era ${campo.valor}.${passo.grupo && passo.fecha_em ? ` É com isto que ${passo.grupo.porque} — fecha ${diaEMes(passo.fecha_em)}.` : ""}`
                          : null
                      }
                    />
                    {campo.por_equipa && (
                      <MarcaDeAutoria aberta quando={diaEMes(campo.mudado_em)} antes={campo.antes} />
                    )}
                  </CaixaAberta>
                )}

                {aExplicar && passo.fechado && (
                  <BlocoDeFecho
                    motivo={MOTIVO_DO_FECHO[passo.grupo?.chave] || "Já seguiu para a equipa"}
                    quando={diaEMes(passo.fecha_em)}
                    porque={`Fizemos as encomendas com este valor, ${passo.grupo?.porque}. É assim que garantimos que chega tudo a tempo.`}
                    aoPedir={
                      <CapsulaVazada
                        onClick={() => setPedido({ campo, passo })}
                        style={{ marginTop: "18px" }}
                      >
                        Pedir alteração
                      </CapsulaVazada>
                    }
                  />
                )}

                {aExplicar && !passo.fechado && (
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
                    <CapsulaVazada
                      onClick={() => setPedido({ campo, passo })}
                      style={{ marginTop: "18px" }}
                    >
                      Pedir alteração
                    </CapsulaVazada>
                  </CaixaAberta>
                )}
              </LinhaDeResposta>
            );
          })}
        </CartaoDePasso>
      ))}

      {semCartao.map((passo) => (
        <PassoPorResponder
          key={passo.ordem}
          nome={passo.titulo}
          contagem={contagemPorExtenso(passo.total)}
          quando={passo.fecha_em ? `${diaEMes(passo.fecha_em)}` : null}
          aoTocar={() => {}}
        />
      ))}

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
function PedidoDeAlteracao({ campo, passo, aoEnviar, aoVoltar, aTrabalhar, erro }) {
  const [texto, setTexto] = useState("");

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
          Questionário · {passo.titulo}
        </span>
        <LigacaoDiscreta onClick={aoVoltar} apagada style={{ fontSize: "10.5px", paddingBottom: "2px" }}>
          voltar às respostas
        </LigacaoDiscreta>
      </div>

      <div style={{ padding: "30px 26px 0" }}>
        <p style={overline()}>Pedir alteração</p>
        <p style={{ ...playfair, fontSize: "21px", lineHeight: 1.32, margin: "11px 0 0", textWrap: "balance" }}>
          Diga-nos o que quer mudar {emDe(campo.label)}.
        </p>
        <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "11px 0 0", textWrap: "pretty" }}>
          A Nádia vê o pedido e responde a dizer o que se consegue — e o que já
          não dá, dá-lo com alternativa.
        </p>

        <div style={{ marginTop: "20px", backgroundColor: "white", border: "1.5px solid #F0E6D0", borderRadius: "14px", padding: "16px 18px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
          <p style={overline("#9B9B9B", "0.22em", "9px")}>O que está lá agora</p>
          <div style={{ marginTop: "11px" }}>
            <ValorDaResposta valor={campo.valor} tipo={campo.tipo} opcoes={campo.opcoes} comPauta={false} />
          </div>
        </div>

        <div style={{ marginTop: "14px", backgroundColor: "white", border: "1.5px solid #F0E6D0", borderRadius: "14px", padding: "18px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
          <p style={overline("#9B9B9B", "0.22em", "9px")}>Por palavras suas</p>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            autoFocus
            placeholder="O que gostaria de mudar, e porquê"
            style={{
              ...playfair, fontStyle: "italic", fontSize: "15.5px", lineHeight: 1.75,
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

        {erro && (
          <p style={{ fontSize: "12px", lineHeight: 1.7, color: "#9C5A3C", margin: "14px 0 0", textWrap: "pretty" }}>
            {erro}
          </p>
        )}

        <CapsulaVazada
          onClick={() => aoEnviar(texto)}
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

// «na paleta», «no texto da placa» — a mesma regra do ecrã da retoma:
// deriva-se do artigo, nunca se adivinha. Sem artigo, cai-se numa frase
// que não precisa dele.
function emDe(rotulo) {
  const t = String(rotulo || "").trim();
  const espaco = t.indexOf(" ");
  const arts = { o: "no", a: "na", os: "nos", as: "nas" };
  if (espaco > 0) {
    const c = arts[t.slice(0, espaco).toLowerCase()];
    if (c) return `${c} ${t.slice(espaco + 1).toLowerCase()}`;
  }
  return `em ${t.toLowerCase()}`;
}

// ---------- Ecrã 9 · O pedido enviado ----------
//
// Sem confetes, sem cápsula dourada, sem exclamação. O que se mostra é o
// REGISTO — o que ficou escrito, palavra a palavra — porque é isso que lhe
// dá confiança de que o pedido não se perdeu.
function PedidoEnviado({ campo, passo, texto, quando, aoVoltar }) {
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
          O pedido está com a Nádia.
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
          A resposta chega aqui e ao WhatsApp. Enquanto não chegar,{" "}
          {emDe(campo.label).replace(/^n[ao]s? /, "a ").replace(/^em /, "")} continua a
          ser a que escolheu.
        </p>
      </div>

      <div style={{ textAlign: "center", marginTop: "22px" }}>
        <LigacaoDiscreta onClick={aoVoltar} apagada>
          Voltar às respostas
        </LigacaoDiscreta>
      </div>

      <Assinatura style={{ marginTop: "30px" }} />
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
