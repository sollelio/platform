import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import LogoDourado from "../components/LogoDourado";
import { Esqueleto } from "../components/admin/acabamento";
import {
  getPortal,
  ROTULO_ETAPA,
  TEXTO_AGORA,
  TEXTO_SEGUIR,
  TEXTO_GRANDE_DIA_PASSADO,
  FRASE_DE_CERIMONIA,
  FRASE_DE_CERIMONIA_SEM_DATA,
  ETAPA_POR_ACONTECER,
  ETAPA_FEITA_DATADA,
} from "../lib/portal";
import {
  OQueFaltaDeSi,
  AsNovidades,
  ComoComecou,
  AsSuasCores,
  HoraAHora,
  APlaca,
  ASuaVisao,
} from "../components/portal/divisoes";
import {
  comporNovidades,
  comporPendencias,
} from "../components/portal/conteudo";
import DocumentosVista from "../components/portal/DocumentosVista";
import QuestionarioVista from "../components/portal/QuestionarioVista";
import AsFotografias from "../components/portal/AsFotografias";
import AvaliacaoVista from "../components/portal/AvaliacaoVista";
import {
  WHATSAPP_URL, SITE_URL, overline, playfair, diaEMes, diaMesAno, semanaEAno,
} from "../components/portal/base";
import { CapsulaVazada } from "../components/portal/documentos-pecas";
import {
  CartaoBranco, Medalhao, EngasteVazio,
  FileteComLosango, Assinatura,
} from "../components/portal/pecas";

// ============================================================
// PortalPage — /acompanhar/:token, a vitrina do evento para quem o organiza.
//
// Dois ecrãs, um componente: a JORNADA e a CORTINA.
//
// A jornada NÃO é uma lista de sete passos com vistos. É três planos, e a
// razão é de desenho: uma lista de sete com uma acesa lê-se como um
// percurso interrompido, e o ecrã mais comum é justamente esse.
//   · a ÂNCORA   — a data do evento e a contagem, no lugar da barra de
//                  progresso. Uma promessa, não um registo: nunca leva
//                  medalhão nem visto.
//   · «AGORA»    — cartão branco com medalhão a assentar na borda.
//   · «A SEGUIR» — engaste vazio, fio que se dissolve, overline cinzenta:
//                  só o presente é dourado.
//   · «e depois» — os nomes restantes, numa linha só.
//
// 🔴 O id do evento NUNCA chega aqui. O URL leva um token opaco de 24
// bytes, e a projecção da RPC (049, afinada pela 051 e 052) não o contém.
//
// LÍNGUA (identidade-visual §6): terceira pessoa em todo o texto — «o seu
// evento», «receberá», «se precisar». Grafia portuguesa, sem
// regionalismos. Os rótulos das sete etapas vivem no `lib/portal.js` e a
// fonte única deles é o `docs/glossario.md`.
//
// MOVIMENTO: nada anima ao abrir. Nem entradas, nem contagens a subir — o
// número está logo escrito. Os únicos laços são os do cabeçalho, e com
// `prefers-reduced-motion` também esses param.
// ============================================================

// ---------- Peças reutilizáveis ----------
// Vivem em components/portal/{base,pecas}. As funções puras da fase 1
// morreram aqui na consolidação da Parte 2; as PEÇAS só morreram na
// revisão do conjunto, no fim da fase 7 — até lá esta página continuava a
// desenhar à mão o cartão, o medalhão e o engaste, e este comentário
// dizia que não. Um comentário que mente é pior do que a duplicação que
// descreve, porque quem o lê não vai verificar.
//
// Ficam locais, e só estas duas: a Cortina e a pastilha «por definir».
// Nenhuma outra página as usa.

// Pastilha «por definir» — qualquer campo vazio no público. Vem sempre em
// par: overline do campo à esquerda, pastilha à direita, e uma linha a
// dizer o que fazer.
function CampoPorDefinir({ campo, ajuda }) {
  return (
    <>
      <div
        style={{
          marginTop: "30px",
          paddingTop: "17px",
          borderTop: "1px solid #F0E6D0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <p style={overline("#9B9B9B", "0.16em")}>{campo}</p>
        <span
          style={{
            fontSize: "11px",
            color: "#9B9B9B",
            backgroundColor: "#FDFBF5",
            border: "1px solid #E8DCC0",
            borderRadius: "999px",
            padding: "4px 11px",
            whiteSpace: "nowrap",
          }}
        >
          ainda por definir
        </span>
      </div>
      <p style={{ fontSize: "11px", lineHeight: 1.6, color: "#9B9B9B", margin: "9px 0 0", textWrap: "pretty" }}>
        {ajuda}
      </p>
    </>
  );
}

// ---------- A cortina ----------
//
// Serve o link morto E o erro de rede: a mesma peça, palavras diferentes.
// Inexistente, revogado e expirado são indistinguíveis de propósito — não
// se confirma nem se desmente a existência de um token.
function Cortina({ titulo, corpo, sobretitulo, comSaidas, reduzir }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--cream)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "44px 30px",
        position: "relative",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* O véu: só neste ecrã. Puxa a luz para o topo e deixa o resto
          da página assentar. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "280px",
          background:
            "linear-gradient(180deg, rgba(232,213,163,0.26) 0%, rgba(232,213,163,0.07) 55%, rgba(232,213,163,0) 100%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ opacity: 0.9, position: "relative" }}>
        <LogoDourado size={118} raio={false} animar={!reduzir} />
      </div>

      <div style={{ position: "relative", textAlign: "center", marginTop: "34px", maxWidth: "330px" }}>
        <p style={overline()}>{sobretitulo}</p>
        <p style={{ ...playfair, fontSize: "24px", lineHeight: 1.42, marginTop: "16px", textWrap: "balance" }}>
          {titulo}
        </p>

        <FileteComLosango margem="22px 0" />

        <p style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--gray-mid)", margin: 0, textWrap: "pretty" }}>
          {corpo}
        </p>

        {comSaidas && (
          <div style={{ marginTop: "28px", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
            {WHATSAPP_URL && (
              <a
                href={WHATSAPP_URL}
                style={{
                  display: "block",
                  font: "600 11px Inter, sans-serif",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--gold-dark)",
                  backgroundColor: "white",
                  border: "1px solid var(--gold)",
                  borderRadius: "999px",
                  padding: "13px 26px",
                  textDecoration: "none",
                  transition: "background-color 140ms ease, color 140ms ease",
                }}
              >
                Falar pelo WhatsApp
              </a>
            )}
            <a
              href={SITE_URL}
              style={{
                display: "inline-block",
                fontSize: "11.5px",
                letterSpacing: "0.03em",
                // #6B6B6B e não #9B9B9B: isto clica-se, e o cinzento
                // apagado não chega ao contraste mínimo.
                color: "var(--gray-mid)",
                borderBottom: "1px solid #E8D5A3",
                paddingBottom: "3px",
                textDecoration: "none",
                transition: "color 140ms ease",
              }}
            >
              doluxoamesa.pt
            </a>
          </div>
        )}
      </div>

      <Assinatura style={{ position: "absolute", bottom: "38px", left: 0, right: 0 }} />
    </div>
  );
}

// ---------- A página ----------

export default function PortalPage() {
  const { token, vista, sub } = useParams();
  const [resultado, setResultado] = useState(null);
  const reduzir = useReducedMotion();

  useEffect(() => {
    let cancelado = false;
    getPortal(token)
      .then((d) => {
        if (cancelado) return;
        const activo = d?.estado === "activo";
        setResultado({
          token,
          estado: activo ? "pronto" : "terminado",
          dados: activo ? d : null,
        });
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado) setResultado({ token, estado: "erro", dados: null });
      });
    return () => {
      cancelado = true;
    };
  }, [token]);

  // O estado DERIVA de a resposta guardada ser deste token, em vez de ser
  // reposto por um setState no corpo do efeito (que o linter proíbe, com
  // razão — é a família do bug de produção do documento). E é mais
  // correcto: se uma resposta lenta chegar depois de já estarmos noutro
  // token, volta-se a «a carregar» em vez de pintar o evento de um token
  // com o endereço de outro.
  const desteToken = resultado?.token === token;
  const estado = desteToken ? resultado.estado : "a-carregar";
  const dados = desteToken ? resultado.dados : null;

  if (estado === "a-carregar") {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "var(--cream)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "44px 26px 34px",
          boxSizing: "border-box",
        }}
      >
        <LogoDourado size={150} animar={!reduzir} />
        <div style={{ width: "100%", maxWidth: "338px", marginTop: "24px", textAlign: "center" }}>
          <Esqueleto w={110} h={10} style={{ margin: "0 auto 12px" }} />
          <Esqueleto w={220} h={28} style={{ margin: "0 auto 10px" }} />
          <Esqueleto w={150} h={12} style={{ margin: "0 auto 34px" }} />
          <Esqueleto w={230} h={40} style={{ margin: "0 auto 12px" }} />
          <Esqueleto w={120} h={12} style={{ margin: "0 auto 36px" }} />
          <Esqueleto w="100%" h={150} r={14} style={{ margin: "0 auto" }} />
        </div>
      </div>
    );
  }

  if (estado === "terminado") {
    return (
      <Cortina
        reduzir={reduzir}
        sobretitulo="Até à próxima mesa"
        titulo="Esta ligação não abre nenhum evento."
        corpo={
          WHATSAPP_URL
            ? "Pode ter terminado o acompanhamento, ou a ligação ter sido substituída por outra. Se precisar de voltar ao seu evento, fale connosco pelo WhatsApp — a porta reabre-se."
            : "Pode ter terminado o acompanhamento, ou a ligação ter sido substituída por outra. Se precisar de voltar ao seu evento, responda à mensagem por onde recebeu esta ligação — a porta reabre-se."
        }
        comSaidas
      />
    );
  }

  if (estado === "erro") {
    return (
      <Cortina
        reduzir={reduzir}
        sobretitulo="Um momento"
        titulo="Não foi possível abrir o acompanhamento."
        corpo="Verifique a ligação à internet e recarregue a página. A sua ligação continua válida."
      />
    );
  }

  // ---------- A avaliação (fase 7) ----------
  // Vista à parte: os três gestos são ecrãs inteiros, não divisões. A
  // própria vista devolve ao acompanhamento se ainda não passaram os três
  // dias ou se o negócio não fechou.
  if (vista === "avaliar") {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "var(--cream)" }}>
        <div style={{ maxWidth: "480px", margin: "0 auto" }}>
          <AvaliacaoVista token={token} />
        </div>
      </div>
    );
  }

  // ---------- O questionário (fase 5) ----------
  // Vista à parte, com cabeçalho próprio como a dos documentos. A própria
  // vista decide entre o convite, a retoma e a revisão — e manda de volta
  // para aqui se este modelo não tiver perguntas que cheguem.
  if (vista === "questionario") {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "var(--cream)" }}>
        <div style={{ maxWidth: "480px", margin: "0 auto" }}>
          {/* key POR SUB, pela mesma razão dos documentos: sem remontar, o
              estado de um passo pintava-se no seguinte. */}
          <QuestionarioVista
            key={sub || "convite"}
            token={token}
            sub={sub}
            reduzir={reduzir}
          />
        </div>
      </div>
    );
  }

  // ---------- A área dos documentos (fases 3 e 4) ----------
  // A cortina do terminado já respondeu acima; aqui o token está vivo.
  // A área tem cabeçalho próprio (o timbre da folha) — sem logo grande.
  if (vista === "documentos") {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "var(--cream)" }}>
        <div style={{ maxWidth: "480px", margin: "0 auto" }}>
          {/* key POR DOCUMENTO: sem isto o componente não desmonta ao
              mudar de :sub, e o estado do documento anterior (passo,
              acto feito, nome escrito, versão antiga aberta) pintava-se
              no seguinte — «O contrato está aceite» logo a seguir a
              aceitar o orçamento. Remontar é a cura da classe inteira. */}
          <DocumentosVista
            key={sub || "lista"}
            token={token}
            tipo={sub}
            reduzir={reduzir}
          />
        </div>
      </div>
    );
  }

  // ---------- A jornada ----------

  const ev = dados?.evento;
  const jornada = Array.isArray(dados?.jornada) ? dados.jornada : [];

  // A etapa ACTUAL é a última que já aconteceu. A seguinte é a que se
  // avizinha, e o resto encolhe para uma linha só.
  let iActual = 0;
  jornada.forEach((et, i) => {
    if (et.estado !== ETAPA_POR_ACONTECER) iActual = i;
  });
  const actual = jornada[iActual] || null;
  const proxima = jornada[iActual + 1] || null;
  const resto = jornada.slice(iActual + 2).filter((e) => ROTULO_ETAPA[e.etapa]);

  const dias = ev?.dias_para;
  const passou = typeof dias === "number" && dias < 0;

  // CADUCOU — a data pedida passou e o negócio nunca fechou.
  //
  // Não é o mesmo que «o evento já foi»: é um pedido que não vingou. A
  // migração 055 já tira a mentira («foi um gosto pôr a sua mesa» numa festa
  // que nunca houve), mas sem isto a página continuava a apontar para a
  // frente — a anunciar «O GRANDE DIA» numa data que passou e a prometer um
  // orçamento cinco meses depois. Prometer o que não se vai cumprir é pior
  // do que calar.
  //
  // Sai tudo da Jornada que a RPC já devolve: nenhum campo novo.
  const fechou = jornada.some(
    (e) => e.etapa === "sinal" && e.estado !== ETAPA_POR_ACONTECER,
  );
  const caducou = passou && !fechou;

  // NO PRÓPRIO DIA a jornada fica presa em «A preparação»: a etapa 7 só
  // acende com a data JÁ passada (055), e bem — de manhã a festa ainda não
  // aconteceu. Mas isso tornava «É hoje.» inalcançável, e deixava a página
  // a falar de compras e listas no dia em que a âncora diz «é hoje».
  //
  // Aqui só muda a PALAVRA, não a jornada: a etapa continua por acontecer,
  // e é o cartão do «agora» que reconhece o dia.
  const ehHoje = dias === 0 && fechou;
  const etapaActual = ehHoje ? "grande_dia" : actual?.etapa;

  const textoActual =
    etapaActual === "grande_dia" && passou
      ? TEXTO_GRANDE_DIA_PASSADO
      : TEXTO_AGORA[etapaActual];

  // ── B5 · «O local — ainda por definir» ────────────────────────────────
  // Depois do dia não se pede o local: o evento aconteceu, e onde foi já
  // ninguém precisa de dizer. É a mesma regra das outras duas travagens da
  // página, que este bloco escapava.
  const pedirLocal = !ev?.local && !passou;

  // O CONTEÚDO das novidades e das pendências vive ao lado das divisões que
  // o consomem (components/portal/divisoes.jsx) — é regra de conteúdo, não
  // de desenho, e a página não tem que a conhecer.
  const novidades = comporNovidades(dados);
  const pendenciasBase = comporPendencias(dados, caducou);
  // A ligação constrói-se aqui porque só a página conhece o token: o
  // orçamento pendente passa a levar à área dos documentos.
  const pendencias = {
    ...pendenciasBase,
    pendencias: pendenciasBase.pendencias.map((p) =>
      p.chave === "orcamento"
        ? { ...p, href: `/acompanhar/${token}/documentos/orcamento`, hrefRotulo: "Ver o orçamento" }
        : p.chave === "questionario"
          ? { ...p, href: `/acompanhar/${token}/questionario`, hrefRotulo: "Responder às perguntas" }
          : p,
    ),
  };
  // Há área de documentos para mostrar quando o envio já aconteceu — o
  // publicar carimba o enviado_em, por isso este marco chega.
  const temDocumentos = !!dados?.marcos_datados?.orcamento;

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--cream)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "44px 26px 34px",
        boxSizing: "border-box",
      }}
    >
      <LogoDourado size={150} animar={!reduzir} />

      <div style={{ width: "100%", maxWidth: "338px" }}>
        {/* Cabeçalho */}
        <div style={{ marginTop: "24px", textAlign: "center" }}>
          <p style={overline()}>O seu evento</p>
          <p style={{ ...playfair, fontSize: "27px", lineHeight: 1.2, letterSpacing: "-0.01em", marginTop: "11px", textWrap: "balance" }}>
            {ev?.titulo || "O seu evento"}
          </p>
          {(ev?.modelo || ev?.convidados) && (
            <p style={{ fontSize: "12px", color: "#9B9B9B", marginTop: "7px", letterSpacing: "0.01em", marginBottom: 0 }}>
              {[ev?.modelo, ev?.convidados ? `${ev.convidados} convidados` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>

        {/* A âncora: a data no lugar da barra de progresso. É promessa,
            não registo — por isso nunca leva medalhão nem visto. */}
        {ev?.data ? (
          <div style={{ position: "relative", marginTop: "30px", textAlign: "center" }}>
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "50%",
                top: "52%",
                transform: "translate(-50%, -50%)",
                width: "300px",
                height: "190px",
                maxWidth: "100%",
                borderRadius: "50%",
                background:
                  "radial-gradient(ellipse at center, rgba(232,213,163,0.34) 0%, rgba(232,213,163,0.13) 42%, rgba(232,213,163,0) 72%)",
                pointerEvents: "none",
              }}
            />
            <div style={{ position: "relative" }}>
              {/* Caducado, a âncora deixa de anunciar «o grande dia»: essa
                  promessa já não se pode fazer. Passa a nomear o que a data
                  é de facto — o dia que ela nos pediu. */}
              <p style={overline()}>
                {caducou ? "A data que nos pediu" : "O grande dia"}
              </p>
              <p style={{ ...playfair, fontSize: "36px", lineHeight: 1.15, marginTop: "12px", fontVariantNumeric: "tabular-nums" }}>
                {diaEMes(ev.data)}
              </p>
              <p style={{ fontSize: "11.5px", color: "#9B9B9B", marginTop: "8px", letterSpacing: "0.02em", fontVariantNumeric: "tabular-nums", marginBottom: 0 }}>
                {semanaEAno(ev.data)}
              </p>

              {caducou && (
                <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "16px 0 0", textWrap: "pretty" }}>
                  Esta data já passou. Se ainda quiser fazer alguma coisa
                  connosco, responda à mensagem por onde recebeu esta ligação —
                  ficamos à espera de si.
                </p>
              )}

              {!passou && (
                <>
                  <FileteComLosango />
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: "8px" }}>
                    {dias > 0 && (
                      <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "31px", lineHeight: 1, color: "var(--gold)", fontVariantNumeric: "tabular-nums" }}>
                        {dias}
                      </span>
                    )}
                    <span style={overline()}>
                      {dias === 0 ? "é hoje" : dias === 1 ? "dia até lá" : "dias até lá"}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: "30px", textAlign: "center" }}>
            <p style={overline()}>O grande dia</p>
            <p style={{ ...playfair, fontSize: "20px", lineHeight: 1.3, marginTop: "12px", color: "#9B9B9B" }}>
              ainda por marcar
            </p>
            <p style={{ fontSize: "11.5px", lineHeight: 1.6, color: "#9B9B9B", marginTop: "9px", textWrap: "pretty", marginBottom: 0 }}>
              Assim que a data ficar decidida, aparece aqui.
            </p>
          </div>
        )}

        {/* A frase de cerimónia: Playfair redondo, sem aspas — é voz da
            casa, e o itálico com «» fica reservado para a fala de uma
            pessoa com nome. */}
        {!passou && (
          <p style={{ marginTop: "26px", textAlign: "center", fontFamily: "'Playfair Display', serif", fontSize: "16px", lineHeight: 1.62, color: "var(--gold-dark)", textWrap: "pretty", padding: "0 6px", marginBottom: 0 }}>
            {ev?.data ? FRASE_DE_CERIMONIA : FRASE_DE_CERIMONIA_SEM_DATA}
          </p>
        )}

        {/* ── AS FOTOGRAFIAS (fase 6) ─────────────────────────────────
            Entra LOGO A SEGUIR À ÂNCORA DO DIA, que é quem manda no dia da
            montagem — e empurra o «Onde estamos agora» para baixo.

            Sem fotografias devolve null e a âncora encosta directamente ao
            cartão, sem buraco, sem rótulo e sem frase a explicar a falta. A
            maior parte do tempo é assim.

            Caducado não mostra nada: um pedido que não vingou não tem dia
            para fotografar. */}
        {!caducou && (
          <AsFotografias
            fotografias={dados?.fotografias}
            dataEvento={ev?.data}
            horas={dados?.questionario?.horas || []}
            jaAvaliou={!!dados?.avaliacao?.feita_em}
          />
        )}

        {/* ── O CONVITE A AVALIAR (fase 7) ────────────────────────────
            A ÚNICA divisão dourada de uma página que passou a ser toda
            memória: o dourado não é do presente, é do que pede resposta.

            Aparece três dias depois do evento e desaparece assim que ela
            avalia — como qualquer divisão sem matéria. Quem não avalia
            nunca vê nada de diferente: não há prazo à vista, não há «por
            responder», não há sinal de que faltou alguma coisa. */}
        {!caducou
          && dados?.avaliacao?.convidada
          && !dados?.avaliacao?.feita_em && (
          <div style={{ marginTop: "36px", textAlign: "center" }}>
            <p style={overline()}>Depois do dia</p>
            <p style={{ ...playfair, fontSize: "23px", lineHeight: 1.28, marginTop: "12px", textWrap: "balance" }}>
              Gostávamos de saber como lhe correu.
            </p>
            <p style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--gray-mid)", margin: "11px 0 0", textWrap: "pretty" }}>
              São três coisas curtas: uma frase, algumas linhas para puxar, e
              a fotografia de que mais gostou. Leva dois minutos.
            </p>
            <div style={{ marginTop: "22px" }}>
              <CapsulaVazada
                to={`/acompanhar/${token}/avaliar`}
                style={{ width: "auto", display: "inline-block", padding: "13px 26px" }}
              >
                Contar como correu
              </CapsulaVazada>
            </div>
            <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: "14px 0 0", textWrap: "pretty" }}>
              Pode ser hoje, ou daqui a duas semanas. O convite fica aqui.
            </p>
          </div>
        )}

        {/* ── A DESPEDIDA (fase 7) ────────────────────────────────────
            Depois de avaliar, o portal não fecha — entra em despedida e
            vive até o prazo acabar. Nenhuma cápsula: como o contrato
            assinado, é assim que se lê que está fechado sem o dizer. */}
        {!caducou && dados?.avaliacao?.feita_em && (
          <div style={{ marginTop: "36px", textAlign: "center" }}>
            {dados.avaliacao.frase && (
              <>
                <p style={overline("#9B9B9B", "0.22em", "9px")}>as suas palavras</p>
                <p style={{ ...playfair, fontStyle: "italic", fontSize: "15.5px", lineHeight: 1.75, color: "var(--charcoal)", margin: "12px 0 0", textWrap: "pretty" }}>
                  {dados.avaliacao.frase}
                </p>
                {dados.avaliacao.palavras_no_site && (
                  <p style={{ fontSize: "11px", lineHeight: 1.6, color: "#9B9B9B", margin: "9px 0 0" }}>
                    {dados.avaliacao.nome_publicado
                      ? `${dados.avaliacao.nome_publicado} · no nosso site`
                      : "no nosso site, sem nome"}
                  </p>
                )}
              </>
            )}
            <p style={{ ...playfair, fontSize: "16px", lineHeight: 1.62, color: "var(--gold-dark)", margin: "26px 0 0" }}>
              Até à próxima mesa.
            </p>
            {dados.ligacao_ate && (
              <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: "10px 0 0" }}>
                Esta ligação fica aberta até {diaMesAno(dados.ligacao_ate)}.
              </p>
            )}
          </div>
        )}

        {/* Onde estamos agora */}
        {actual && ROTULO_ETAPA[actual.etapa] && (
          <CartaoBranco
            padding="30px 20px 21px"
            style={{ marginTop: "36px", position: "relative", textAlign: "center" }}
          >
            <Medalhao />
            <p style={overline()}>Onde estamos agora</p>
            <p style={{ ...playfair, fontSize: "23px", lineHeight: 1.25, marginTop: "10px", textWrap: "balance" }}>
              {ROTULO_ETAPA[etapaActual]}
            </p>
            {/* Sem carimbo, a linha da data NÃO EXISTE: não há «?», não
                há data inventada — o cartão fecha-se sem ela. */}
            {actual.estado === ETAPA_FEITA_DATADA && diaEMes(actual.quando) && (
              <p style={{ fontSize: "11.5px", color: "#9B9B9B", marginTop: "7px", letterSpacing: "0.02em", fontVariantNumeric: "tabular-nums", marginBottom: 0 }}>
                {diaEMes(actual.quando)}
              </p>
            )}
            {textoActual && (
              <p style={{ fontSize: "12.5px", lineHeight: 1.65, color: "var(--gray-mid)", marginTop: "12px", textWrap: "pretty", marginBottom: 0 }}>
                {textoActual}
              </p>
            )}
          </CartaoBranco>
        )}

        {/* A seguir: engaste vazio e fio que se dissolve para baixo, para
            não ler como trilho de progresso. Overline cinzenta — só o
            presente é dourado. */}
        {/* CADUCADO: «a seguir» e «e depois» calam-se. Prometer um
            orçamento, um projecto e um grande dia a quem já viu a data
            passar sem negócio é prometer o que não se vai cumprir. */}
        {!caducou && proxima && ROTULO_ETAPA[proxima.etapa] && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div aria-hidden="true" style={{ width: "1px", height: "22px", background: "linear-gradient(180deg, #E8D5A3, rgba(232,213,163,0.25))" }} />
            <EngasteVazio />
            <div style={{ textAlign: "center", marginTop: "13px" }}>
              <p style={overline("#9B9B9B")}>A seguir</p>
              <p style={{ ...playfair, fontSize: "18px", lineHeight: 1.3, marginTop: "8px" }}>
                {ROTULO_ETAPA[proxima.etapa]}
              </p>
              {TEXTO_SEGUIR[proxima.etapa] && (
                <p style={{ fontSize: "12.5px", lineHeight: 1.65, color: "var(--gray-mid)", marginTop: "9px", textWrap: "pretty", padding: "0 10px", marginBottom: 0 }}>
                  {TEXTO_SEGUIR[proxima.etapa]}
                </p>
              )}
            </div>
          </div>
        )}

        {/* e depois — … : desaparece quando não sobra nada. */}
        {!caducou && resto.length > 0 && (
          <p style={{ marginTop: "26px", textAlign: "center", fontSize: "11.5px", lineHeight: 1.9, color: "#9B9B9B", letterSpacing: "0.02em", textWrap: "pretty", padding: "0 12px", marginBottom: 0 }}>
            e depois —{" "}
            <span style={{ color: "var(--gray-mid)" }}>
              {resto.map((e) => ROTULO_ETAPA[e.etapa].replace(/ /g, " ")).join(" · ")}
            </span>
          </p>
        )}

        {/* ── AS DIVISÕES DA FASE 2 ──────────────────────────────────
            A ordem é fixa (folha de decisões): o que falta de si · as
            novidades · como começou · as suas cores · hora a hora · a
            placa · a sua visão. O que varia é QUANTAS aparecem — cada
            uma devolve null quando não tem matéria, sem deixar espaço
            nem rótulo. Num evento só com o pedido respondido — o caso
            comum, 8 em 13 — só as três primeiras se pintam. */}
        {/* CADUCADO: nem sequer o estado vazio. «Nada, está tudo
            entregue» é uma boa notícia, e aqui não há boa notícia — não se
            entregou nada, o pedido é que não vingou. */}
        {!caducou && <OQueFaltaDeSi {...pendencias} />}

        {/* A porta discreta da área dos documentos — só quando há alguma
            coisa publicada do outro lado. */}
        {!caducou && temDocumentos && (
          <p style={{ textAlign: "center", margin: "18px 0 0" }}>
            <Link
              to={`/acompanhar/${token}/documentos`}
              style={{
                fontSize: "12px",
                letterSpacing: "0.03em",
                color: "var(--gray-mid)",
                borderBottom: "1px solid #E8D5A3",
                paddingBottom: "3px",
                textDecoration: "none",
              }}
            >
              Os seus documentos
            </Link>
          </p>
        )}

        <AsNovidades
          visitaAnterior={dados?.visita_anterior}
          novidades={novidades.novidades}
          jaCaEstava={novidades.jaCaEstava}
          reduzir={reduzir}
        />

        <ComoComecou
          imagens={dados?.pedido?.imagens || []}
          mensagem={dados?.pedido?.mensagem}
          assinatura={[ev?.titulo, diaEMes(dados?.pedido?.quando)]
            .filter(Boolean)
            .join(" · ")}
        />

        <AsSuasCores paleta={dados?.questionario?.paleta || []} />

        <HoraAHora horas={dados?.questionario?.horas || []} />

        <APlaca
          principal={dados?.questionario?.placa?.principal}
          secundario={dados?.questionario?.placa?.secundario}
          deCasal={!!ev?.de_casal}
          titulo={ev?.titulo}
          data={ev?.data}
        />

        <ASuaVisao
          visao={dados?.questionario?.visao || []}
          entregueEm={dados?.questionario?.entregue_em}
        />

        {pedirLocal && (
          <CampoPorDefinir
            campo="O local"
            ajuda="Diga-nos assim que souber — não há pressa nenhuma."
          />
        )}

        {ev?.local && (
          <div style={{ marginTop: "30px", paddingTop: "17px", borderTop: "1px solid #F0E6D0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <p style={overline("#9B9B9B", "0.16em")}>O local</p>
            <p style={{ fontSize: "12px", color: "var(--gray-mid)", margin: 0, textAlign: "right" }}>{ev.local}</p>
          </div>
        )}

        <p style={{ fontSize: "11px", lineHeight: 1.6, color: "#9B9B9B", marginTop: "26px", textAlign: "center", textWrap: "pretty", marginBottom: 0 }}>
          Se precisar de falar connosco, responda à mensagem por onde recebeu
          esta ligação.
        </p>

        <Assinatura style={{ marginTop: "34px" }} />
      </div>
    </div>
  );
}
