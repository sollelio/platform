import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import LogoDourado from "../components/LogoDourado";
import { MarcaVisto } from "../components/admin/marcas";
import { Esqueleto } from "../components/admin/acabamento";
import {
  getPortal,
  ROTULO_ETAPA,
  ETAPA_POR_ACONTECER,
  ETAPA_FEITA_DATADA,
} from "../lib/portal";

// ============================================================
// PortalPage — /portal/:token, a vitrina do evento para quem o organiza.
//
// ⚠ ESTA É A CANALIZAÇÃO, NÃO O DESENHO. Os tubos estão ligados e todos
// os estados são honestos, em linguagem da casa — mas o tratamento de
// joalharia da vitrina (halo, poeira de ouro, raio cónico, a peça central
// emocional) NÃO está aqui de propósito: a regra da casa é mockup antes
// de UI nova, e esta é uma superfície de deslumbre.
//
// Tudo o que esta página sabe vem da RPC dlm_portal_ver (049, afinada
// pela 051 e 052). A tabela está fechada ao público.
//
// 🔴 O id do evento NUNCA chega aqui. O URL leva um token opaco de 24
// bytes, sem relação derivável com o id, e a projecção da RPC não o
// contém. Não acrescentes um caminho que o traga.
//
// A ESCRITA DA CASA (identidade-visual, secção 6): terceira pessoa em
// todo o texto — «o seu evento», «receberá», «se precisar». Nunca «o
// teu».
// ============================================================

const eyebrow = {
  fontSize: "10px",
  fontWeight: "700",
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: "var(--gold-dark)",
  margin: "0 0 10px",
};

const serif = {
  fontFamily: "'Playfair Display', serif",
  fontWeight: "400",
  color: "var(--charcoal)",
};

// ---------- Datas ----------
//
// Corta a parte de calendário da string ISO em vez de a fazer passar por
// um Date local. Motivo concreto: `pagamentos.data` e `data_evento` são
// DATE convertidos para timestamptz pela RPC, e um Date local desloca-os
// um dia para quem esteja a oeste de Greenwich. Com a linguagem da casa a
// servir todo o espaço lusófono, uma cliente no Brasil veria o dia
// anterior no marco mais importante da vida dela. Cortar a string mostra
// sempre o dia de calendário que a base guardou.
const soData = (iso) => (iso ? String(iso).slice(0, 10) : null);

const dataLonga = (iso) => {
  const d = soData(iso);
  return d
    ? new Date(`${d}T00:00:00`).toLocaleDateString("pt-PT", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;
};

const dataCurta = (iso) => {
  const d = soData(iso);
  return d
    ? new Date(`${d}T00:00:00`).toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : null;
};

const contagem = (dias) => {
  if (dias === null || dias === undefined) return null;
  if (dias > 1) return `Faltam ${dias} dias`;
  if (dias === 1) return "Falta 1 dia";
  if (dias === 0) return "É hoje";
  return null; // já passou — a Jornada conta essa história melhor
};

// ---------- Uma etapa da Jornada ----------

function Etapa({ etapa, ultima }) {
  const rotulo = ROTULO_ETAPA[etapa.etapa];

  // Uma etapa que não sabemos nomear não se mostra a uma cliente — mas
  // também não desaparece em silêncio: o aviso apanha-a em
  // desenvolvimento se uma migração futura acrescentar uma etapa e este
  // mapa ficar atrás.
  if (!rotulo) {
    console.warn(`[portal] etapa sem rótulo no mapa do front end: ${etapa.etapa}`);
    return null;
  }

  const feito = etapa.estado !== ETAPA_POR_ACONTECER;
  const data = etapa.estado === ETAPA_FEITA_DATADA ? dataCurta(etapa.quando) : null;

  return (
    <div style={{ display: "flex", gap: "14px", textAlign: "left" }}>
      {/* A coluna do trilho: a marca e a linha que liga à etapa seguinte */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "22px",
            height: "22px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: feito ? "var(--gold)" : "transparent",
            border: feito ? "none" : "1.5px solid var(--trilho, #E5DCC3)",
            color: "white",
          }}
        >
          {feito && <MarcaVisto t={11} cor="white" />}
        </div>
        {!ultima && (
          <div
            style={{
              width: "1.5px",
              flex: 1,
              minHeight: "26px",
              backgroundColor: feito ? "var(--gold-light)" : "var(--trilho, #E5DCC3)",
            }}
          />
        )}
      </div>

      {/* O texto */}
      <div style={{ paddingBottom: ultima ? 0 : "18px", paddingTop: "1px" }}>
        <p
          style={{
            margin: 0,
            fontSize: "14px",
            fontWeight: feito ? "600" : "400",
            // #9B9B9B é permitido aqui: não é clicável. A regra da casa
            // proíbe-o só em coisas que se clicam (contraste mínimo).
            color: feito ? "var(--charcoal)" : "#9B9B9B",
          }}
        >
          {rotulo}
        </p>
        {/* Uma etapa feita SEM data não ganha texto nenhum. Dizer «sem
            data registada» a uma cliente é falar-lhe da nossa
            contabilidade; o silêncio é honesto e não inventa um dia. */}
        {data && (
          <p
            style={{
              margin: "2px 0 0",
              fontSize: "12px",
              color: "var(--gray-mid)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {data}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------- A página ----------

export default function PortalPage() {
  const { token } = useParams();
  // A resposta guarda o TOKEN a que pertence. Ver a derivação abaixo.
  const [resultado, setResultado] = useState(null);
  const reduzir = useReducedMotion();

  useEffect(() => {
    let cancelado = false;
    getPortal(token)
      .then((d) => {
        if (cancelado) return;
        // A RPC devolve sempre um objecto. 'terminado' cobre inexistente,
        // revogado e expirado — os três indistinguíveis de propósito.
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
  // razão — é a família do bug de produção do documento).
  //
  // E é mais correcto do que a reposição: se o token do URL mudar, ou se
  // uma resposta lenta chegar depois de já estarmos noutro token, esta
  // página volta a «a carregar» em vez de pintar o evento de um token com
  // o endereço de outro. É a guarda de sequência da casa, em forma
  // declarativa.
  const desteToken = resultado?.token === token;
  const estado = desteToken ? resultado.estado : "a-carregar";
  const dados = desteToken ? resultado.dados : null;

  const ev = dados?.evento;
  const jornada = Array.isArray(dados?.jornada) ? dados.jornada : [];
  const falta = contagem(ev?.dias_para);

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--cream)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "40px 24px 32px",
        textAlign: "center",
      }}
    >
      <LogoDourado size={150} />

      <div style={{ width: "100%", maxWidth: "480px", marginTop: "28px" }}>
        {estado === "a-carregar" && (
          <>
            <Esqueleto w={150} h={12} style={{ margin: "0 auto 14px" }} />
            <Esqueleto w={260} h={26} style={{ margin: "0 auto 20px" }} />
            <Esqueleto w={180} h={13} style={{ margin: "0 auto 30px" }} />
            <Esqueleto w="100%" h={210} r={16} style={{ margin: "0 auto" }} />
          </>
        )}

        {estado === "terminado" && (
          <>
            <p style={eyebrow}>Portal do evento</p>
            <p style={{ ...serif, fontSize: "22px", margin: "0 0 10px" }}>
              Este link já não está ativo.
            </p>
            <p style={{ fontSize: "13px", color: "var(--gray-mid)", margin: 0 }}>
              Peça um link novo a quem lho partilhou.
            </p>
          </>
        )}

        {estado === "erro" && (
          <>
            <p style={eyebrow}>Portal do evento</p>
            <p style={{ ...serif, fontSize: "20px", margin: "0 0 10px" }}>
              Não foi possível abrir o portal.
            </p>
            <p style={{ fontSize: "13px", color: "var(--gray-mid)", margin: 0 }}>
              Verifique a ligação à internet e recarregue a página.
            </p>
          </>
        )}

        {estado === "pronto" && (
          <motion.div
            initial={reduzir ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <p style={eyebrow}>O seu evento</p>

            <p style={{ ...serif, fontSize: "24px", margin: "0 0 8px" }}>
              {ev?.titulo || "O seu evento"}
            </p>

            <p
              style={{
                fontSize: "13px",
                color: "var(--gray-mid)",
                margin: "0 0 4px",
              }}
            >
              {[ev?.modelo, dataLonga(ev?.data)].filter(Boolean).join(" · ") ||
                "Data por combinar"}
            </p>

            {falta && (
              <p
                style={{
                  fontSize: "12.5px",
                  color: "var(--gold-dark)",
                  fontWeight: "600",
                  margin: "0 0 4px",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {falta}
              </p>
            )}

            {/* O ecrã do princípio é o mais comum de todos: um evento em
                «interessado» tem uma etapa acesa em sete. Em vez de o
                deixar parecer um percurso interrompido, diz-se o que ele
                é — e o resto da página fica igual, sem esconder nada. */}
            {ev?.principio && (
              <p
                style={{
                  ...serif,
                  fontStyle: "italic",
                  fontSize: "15px",
                  color: "var(--gold-dark)",
                  margin: "18px 0 0",
                  lineHeight: 1.6,
                }}
              >
                Estamos no início do seu evento. Cada passo aparece aqui à
                medida que acontece.
              </p>
            )}

            <div
              style={{
                marginTop: "26px",
                backgroundColor: "white",
                border: "1px solid var(--hairline, #F0E6D0)",
                borderRadius: "14px",
                padding: "22px 20px",
              }}
            >
              {jornada.length === 0 ? (
                // Nunca chega a acontecer com a RPC actual (devolve sempre
                // as sete etapas), mas uma lista vazia silenciosa é a
                // classe de bug que este projecto já corrigiu em vários
                // ecrãs. Se acontecer, diz-se.
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--gray-mid)",
                    margin: 0,
                  }}
                >
                  O percurso do seu evento ainda não está disponível.
                </p>
              ) : (
                jornada.map((et, i) => (
                  <Etapa
                    key={et.etapa || i}
                    etapa={et}
                    ultima={i === jornada.length - 1}
                  />
                ))
              )}
            </div>

            <p
              style={{
                fontSize: "12px",
                color: "var(--gray-mid)",
                margin: "22px 0 0",
                lineHeight: 1.6,
              }}
            >
              Se precisar de falar connosco, responda à mensagem por onde
              recebeu este link.
            </p>
          </motion.div>
        )}
      </div>

      <p
        style={{
          ...eyebrow,
          color: "var(--gold-dark)",
          marginTop: "36px",
          marginBottom: 0,
          opacity: 0.75,
        }}
      >
        Do Luxo à Mesa
      </p>
    </div>
  );
}
