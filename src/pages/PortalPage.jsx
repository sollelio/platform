import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
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

// ⚠ POR PREENCHER PELA CASA. Enquanto estiver vazio, a cortina não mostra
// a cápsula e o texto adapta-se — não fica um ecrã com uma promessa de
// botão que não existe.
const WHATSAPP_URL = "";
const SITE_URL = "https://doluxoamesa.pt";

// Meses e dias em português, escritos à mão em vez de toLocaleDateString:
// a casa usa grafia pré-acordo («projecto», «acção») e nessa grafia os
// meses levam maiúscula, que o locale do browser não dá. De caminho,
// tira-se qualquer dependência do fuso do visitante.
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira",
  "quinta-feira", "sexta-feira", "sábado"];

// Lê o dia de calendário directamente da string, sem passar por um Date
// local. `data_evento` e `pagamentos.data` são DATE convertidos para
// timestamptz pela RPC; um Date local desloca-os um dia para quem esteja a
// oeste de Greenwich, e a linguagem da casa serve todo o espaço lusófono —
// uma cliente no Brasil veria o dia anterior no marco mais importante da
// vida dela.
const partesDaData = (iso) => {
  if (!iso) return null;
  const [a, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return null;
  return { a, m, d, semana: new Date(Date.UTC(a, m - 1, d)).getUTCDay() };
};

const diaEMes = (iso) => {
  const p = partesDaData(iso);
  return p ? `${p.d} de ${MESES[p.m - 1]}` : null;
};

const semanaEAno = (iso) => {
  const p = partesDaData(iso);
  return p ? `${SEMANA[p.semana]}, ${p.a}` : null;
};

// ---------- Peças reutilizáveis da casa ----------

const overline = (cor = "#A07830", tracking = "0.22em") => ({
  font: "700 9.5px Inter, sans-serif",
  letterSpacing: tracking,
  textTransform: "uppercase",
  color: cor,
  margin: 0,
});

const playfair = {
  fontFamily: "'Playfair Display', serif",
  fontWeight: 400,
  color: "var(--charcoal)",
  margin: 0,
};

// Divisor de cerimónia: dois filetes que se dissolvem e um losango ao
// centro. Nunca uma linha inteira de ponta a ponta.
function FileteComLosango({ margem = "18px 0 16px" }) {
  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
        margin: margem,
      }}
    >
      <div style={{ height: "1px", width: "52px", background: "linear-gradient(90deg, rgba(232,213,163,0), #E8D5A3)" }} />
      <div style={{ width: "5px", height: "5px", backgroundColor: "var(--gold)", transform: "rotate(45deg)" }} />
      <div style={{ height: "1px", width: "52px", background: "linear-gradient(90deg, #E8D5A3, rgba(232,213,163,0))" }} />
    </div>
  );
}

// O visto da casa, desenhado à mão: stroke 1.9, pontas e uniões redondas.
// Nada de glifos de texto como marca.
const VistoDourado = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path
      d="M3 7.4 L5.9 10.2 L11.2 3.9"
      stroke="var(--gold)"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

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

function Assinatura({ style }) {
  return (
    <p
      style={{
        font: "700 9px Inter, sans-serif",
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: "var(--gold-dark)",
        opacity: 0.62,
        textAlign: "center",
        margin: 0,
        ...style,
      }}
    >
      Do Luxo à Mesa · by Luxury Events
    </p>
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
  const { token } = useParams();
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

  const textoActual =
    actual?.etapa === "grande_dia" && passou
      ? TEXTO_GRANDE_DIA_PASSADO
      : TEXTO_AGORA[actual?.etapa];

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
              <p style={overline()}>O grande dia</p>
              <p style={{ ...playfair, fontSize: "36px", lineHeight: 1.15, marginTop: "12px", fontVariantNumeric: "tabular-nums" }}>
                {diaEMes(ev.data)}
              </p>
              <p style={{ fontSize: "11.5px", color: "#9B9B9B", marginTop: "8px", letterSpacing: "0.02em", fontVariantNumeric: "tabular-nums", marginBottom: 0 }}>
                {semanaEAno(ev.data)}
              </p>

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

        {/* Onde estamos agora */}
        {actual && ROTULO_ETAPA[actual.etapa] && (
          <div
            style={{
              marginTop: "36px",
              position: "relative",
              backgroundColor: "white",
              border: "1.5px solid #F0E6D0",
              borderRadius: "14px",
              padding: "30px 20px 21px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "-18px",
                left: "50%",
                transform: "translateX(-50%)",
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                backgroundColor: "#FEF9EC",
                border: "1px solid #E8D5A3",
                boxShadow: "0 0 0 5px var(--cream), 0 4px 12px rgba(201,168,76,0.22)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <VistoDourado />
            </div>
            <p style={overline()}>Onde estamos agora</p>
            <p style={{ ...playfair, fontSize: "23px", lineHeight: 1.25, marginTop: "10px", textWrap: "balance" }}>
              {ROTULO_ETAPA[actual.etapa]}
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
          </div>
        )}

        {/* A seguir: engaste vazio e fio que se dissolve para baixo, para
            não ler como trilho de progresso. Overline cinzenta — só o
            presente é dourado. */}
        {proxima && ROTULO_ETAPA[proxima.etapa] && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div aria-hidden="true" style={{ width: "1px", height: "22px", background: "linear-gradient(180deg, #E8D5A3, rgba(232,213,163,0.25))" }} />
            <div aria-hidden="true" style={{ width: "26px", height: "26px", borderRadius: "50%", backgroundColor: "#FDFBF5", border: "1px solid #E8DCC0" }} />
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
        {resto.length > 0 && (
          <p style={{ marginTop: "26px", textAlign: "center", fontSize: "11.5px", lineHeight: 1.9, color: "#9B9B9B", letterSpacing: "0.02em", textWrap: "pretty", padding: "0 12px", marginBottom: 0 }}>
            e depois —{" "}
            <span style={{ color: "var(--gray-mid)" }}>
              {resto.map((e) => ROTULO_ETAPA[e.etapa].replace(/ /g, " ")).join(" · ")}
            </span>
          </p>
        )}

        {!ev?.local && (
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
