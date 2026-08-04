import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  contarRecorte,
  rotuloDaRegra,
  guardarComunicado,
  marcarBlocoRevisto,
  publicarComunicado,
  getComunicado,
} from "../../lib/comunicados";
import { getEventTypes } from "../../lib/invites";
import { Esqueleto } from "./acabamento";

// ============================================================
// ComunicadoDeMolde — a folha acabada de nascer de um molde, antes de
// ganhar endereço (desenho «Nascer de um molde», fase 3).
//
// O que este ecrã afirma, e porquê:
//   · é uma folha NOVA — ganha endereço próprio ao publicar; o comunicado
//     anterior do mesmo molde continua no ar, intacto;
//   · a lista conta-se AGORA, de novo — a contagem é viva (contarRecorte
//     sobre a regra pré-carregada), nunca a do comunicado anterior;
//   · o que vinha de trás e envelhece chega ASSINALADO (rever/pergunta,
//     marcados quando o molde se guardou) e fecha-se aqui, bloco a bloco
//     — «Está certo» limpa a marca NESTE comunicado e o molde fica
//     intacto (marcarBlocoRevisto).
//
// A pastilha «REVISTO» é da VISITA: marcarBlocoRevisto apaga as chaves
// rever/pergunta (081 — um bloco revisto fica igual a um que nunca teve
// marca), por isso ao reabrir o ecrã um bloco já revisto aparece fixo,
// sem pastilha nenhuma. É consequência do modelo de dados, não descuido.
//
// A ida directa ao supabase (o comunicado anterior deste molde) vive
// aqui e não em lib/ porque esta frente não mexe em lib/comunicados.js;
// há precedente na casa (SubmissionDrawer, PortalDoClienteSheet).
// ============================================================

const OVERLINE = {
  fontSize: "9.5px",
  fontWeight: "700",
  letterSpacing: "0.15em",
  color: "var(--gold-dark)",
};

const CARTAO = {
  backgroundColor: "white",
  border: "1px solid #F0E6D0",
  borderRadius: "12px",
};

const VistoPequeno = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 16 16"
    fill="none"
    stroke="var(--gold)"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 8.6l3.2 3.2L13 5" />
  </svg>
);

const Relogio = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 16 16"
    fill="none"
    stroke="var(--gold-dark)"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flex: "none", marginTop: "1px" }}
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r="6.3" />
    <path d="M8 5.2v3.2l2 1.4" />
  </svg>
);

const Alerta = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="var(--gold-dark)"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flex: "none", marginTop: "1px" }}
    aria-hidden="true"
  >
    <path d="M8 2.2l6 10.6H2L8 2.2Z" />
    <path d="M8 6.4v3" />
    <path d="M8 11.1v.1" />
  </svg>
);

const MedalhaPequena = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
    <circle cx="8" cy="8" r="7" fill="var(--gold)" />
    <path
      d="M4.6 8.4l2.4 2.4 4.4-5"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// O rótulo do cartão de um bloco. Um bloco com rótulo usa-o; sem rótulo
// deriva-se do tipo — a regra do desenho. A chamada deriva SEMPRE
// («Chamada»): o rotulo dela é o texto do botão, não uma etiqueta, e
// usá-lo como título do cartão duplicava o conteúdo (o protótipo mostra
// exactamente «Chamada» + o texto do botão em baixo).
const rotuloDoBloco = (b) => {
  if (b.tipo === "chamada") return "Chamada";
  if ((b.rotulo || "").trim()) return b.rotulo.trim();
  if (b.tipo === "imagem") return "Fotografia";
  return "Texto";
};

// O campo que o cartão mostra (e que a revisão edita): o texto nos
// blocos deriváveis, o texto do botão na chamada, a legenda na imagem —
// é onde uma data ou um prazo podem viver em cada tipo.
const campoDoBloco = (b) =>
  b.tipo === "imagem" ? "legenda" : b.tipo === "chamada" ? "rotulo" : "texto";

const textoDoBloco = (b) =>
  b.tipo === "imagem"
    ? (b.legenda || "").trim() || "Imagem da folha, sem legenda."
    : b.tipo === "chamada"
      ? (b.rotulo || "").trim()
      : b.texto || "";

// Um bloco sem nada não ganha cartão — não há o que rever nem mostrar.
const temConteudo = (b) =>
  b.tipo === "imagem"
    ? Boolean(b.url || (b.legenda || "").trim())
    : b.tipo === "chamada"
      ? Boolean((b.rotulo || "").trim())
      : Boolean((b.rotulo || "").trim() || (b.texto || "").trim());

// «abril» / «abril de 2025» — o mês do comunicado anterior, com o ano só
// quando não é o corrente (a mesma economia do comunicadoTempo).
const mesDito = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const mes = d.toLocaleDateString("pt-PT", { month: "long" });
  return d.getFullYear() === new Date().getFullYear() ? mes : `${mes} de ${d.getFullYear()}`;
};

export default function ComunicadoDeMolde({
  comunicado,
  nomeMolde,
  onVoltar,
  onMudou,
  onAbrirEditor,
  onAbrirMensagem,
  onAbrirPublico,
  onIrAoDetalhe,
}) {
  // Os blocos vivem em estado local (as textareas da revisão escrevem
  // aqui); cada gravação sincroniza com a resposta fresca da BD.
  const [blocos, setBlocos] = useState(() => comunicado.blocos || []);
  // O que já foi gravado — para o blur só ir à BD quando algo mudou.
  const guardadosRef = useRef(comunicado.blocos || []);
  // Os blocos revistos NESTA visita (a marca some da BD; a pastilha fica
  // no ecrã até se sair).
  const [revistos, setRevistos] = useState(() => new Set());

  // undefined = a caminho · null = não há anterior publicado · {id, publicado_em}.
  // Sem modelo_id não há o que procurar — nasce já resolvido, para o
  // efeito não ter de escrever estado em seco (regra de lint da casa).
  const [anterior, setAnterior] = useState(() => (comunicado.modelo_id ? undefined : null));
  // A contagem e a regra a que pertence: o «a caminho» DERIVA-SE de a
  // regra actual ainda não ter contagem — em vez de um reset síncrono
  // no efeito. pessoas null = a contagem falhou.
  const [contagemInfo, setContagemInfo] = useState({ para: null, pessoas: null });
  const [tipos, setTipos] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  // O comunicado anterior deste molde que CONTINUA NO AR (publicado e
  // não retirado) — é dele que a linha do relógio fala. Sem um, a linha
  // omite-se: não se inventa história.
  useEffect(() => {
    if (!comunicado.modelo_id) return undefined;
    let vivo = true;
    supabase
      .from("comunicados")
      .select("id, publicado_em")
      .eq("modelo_id", comunicado.modelo_id)
      .neq("id", comunicado.id)
      .not("publicado_em", "is", null)
      .is("retirado_em", null)
      .order("publicado_em", { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) {
          console.error(error);
          setAnterior(null); // sem a linha; o resto do ecrã não depende dela
          return;
        }
        setAnterior(data && data.length ? data[0] : null);
      });
    return () => {
      vivo = false;
    };
  }, [comunicado.id, comunicado.modelo_id]);

  // Os tipos de evento, para o rótulo da regra — uma ida, ao montar.
  useEffect(() => {
    let vivo = true;
    getEventTypes()
      .then((ts) => {
        if (vivo) setTipos(ts || []);
      })
      .catch((e) => console.error(e));
    return () => {
      vivo = false;
    };
  }, []);

  // A contagem VIVA da regra pré-carregada — a lista conta-se agora, de
  // novo. A dependência é a regra em texto, não o objecto comunicado:
  // gravar um bloco não é razão para recontar pessoas.
  const publicoJson = JSON.stringify(comunicado.publico ?? null);
  useEffect(() => {
    const pub = JSON.parse(publicoJson);
    // Sem regra não há o que contar — o ecrã mostra «por escolher».
    if (!pub || !pub.origem) return undefined;
    let vivo = true;
    contarRecorte({
      origem: pub.origem,
      eventTypeId: pub.event_type_id || undefined,
      janela: pub.janela || undefined,
      quem: pub.quem || undefined,
    })
      .then((c) => {
        if (vivo) setContagemInfo({ para: publicoJson, pessoas: c.pessoas });
      })
      .catch((e) => {
        console.error(e);
        if (vivo) setContagemInfo({ para: publicoJson, pessoas: null });
      });
    return () => {
      vivo = false;
    };
  }, [comunicado.id, publicoJson]);

  // undefined = a contar (a contagem que há é de outra regra, ou ainda
  // não veio) · null = falhou · número = pessoas.
  const contagem = contagemInfo.para === publicoJson ? contagemInfo.pessoas : undefined;

  const porRever = blocos.filter((b) => b.rever).length;
  const houveRevisao = revistos.size > 0;
  const rotulo = rotuloDaRegra(comunicado.publico, tipos);

  const mudarBloco = (id, valor) => {
    setBlocos((prev) =>
      prev.map((b) => (b.id === id ? { ...b, [campoDoBloco(b)]: valor } : b)),
    );
  };

  // Grava os blocos se algo mudou desde a última gravação — chamado no
  // blur das textareas e antes de publicar (o que está no ecrã é o que
  // tem de sair).
  const gravarSeMudou = async () => {
    if (JSON.stringify(blocos) === JSON.stringify(guardadosRef.current)) return;
    const fresco = await guardarComunicado(comunicado.id, { blocos });
    guardadosRef.current = fresco.blocos || blocos;
    setBlocos(fresco.blocos || blocos);
    onMudou?.(fresco);
  };

  const gravarNoBlur = async () => {
    try {
      await gravarSeMudou();
    } catch (e) {
      console.error(e);
      setErro("Não foi possível guardar a alteração do bloco. Tente outra vez.");
    }
  };

  // «Está certo» fecha a revisão DESTE bloco NESTE comunicado — leva os
  // blocos do ecrã (com o texto que ela acabou de acertar) e o
  // marcarBlocoRevisto grava tudo numa ida só. O molde fica intacto.
  const marcarCerto = async (b) => {
    if (ocupado) return;
    setOcupado(true);
    setErro("");
    try {
      const fresco = await marcarBlocoRevisto(comunicado.id, blocos, b.id);
      guardadosRef.current = fresco.blocos || [];
      setBlocos(fresco.blocos || []);
      setRevistos((prev) => new Set(prev).add(b.id));
      onMudou?.(fresco);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível fechar a revisão. Tente outra vez.");
    } finally {
      setOcupado(false);
    }
  };

  // Publicar dá o endereço a ESTA folha. Não bloqueia por haver blocos
  // por rever — a nota honesta do rodapé já disse o que acontece.
  const publicar = async () => {
    if (ocupado) return;
    setOcupado(true);
    setErro("");
    try {
      await gravarSeMudou();
      await publicarComunicado(comunicado.id);
      const fresco = await getComunicado(comunicado.id);
      onMudou?.(fresco);
      onIrAoDetalhe?.(fresco.id);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível publicar. Tente outra vez.");
    } finally {
      setOcupado(false);
    }
  };

  const visiveis = blocos.filter(temConteudo);

  const notaRodape =
    porRever === 1
      ? "Pode publicar mesmo assim — mas a data acima fica como está."
      : porRever > 1
        ? "Pode publicar mesmo assim — mas as datas acima ficam como estão."
        : anterior
          ? "O endereço nasce aqui. O comunicado anterior continua no ar, intacto."
          : "O endereço nasce aqui.";

  return (
    <div style={{ maxWidth: "560px" }}>
      <button
        onClick={onVoltar}
        className="ligacao"
        style={{ fontSize: "12.5px", color: "var(--gray-mid)" }}
      >
        ← Moldes
      </button>

      {/* O cartão de cima: o que esta folha É — nova, sem endereço, com
          o anterior no ar e fora do alcance do que se fizer aqui. */}
      <div style={{ ...CARTAO, borderRadius: "14px", marginTop: "16px", padding: "15px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
          <div
            style={{
              padding: "3px 10px",
              borderRadius: "999px",
              backgroundColor: "#FEF9EC",
              border: "1px solid var(--gold-light)",
              fontSize: "9px",
              fontWeight: "700",
              letterSpacing: "0.12em",
              color: "var(--gold-dark)",
              whiteSpace: "nowrap",
            }}
          >
            COMUNICADO NOVO
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--gray-mid)" }}>
            {comunicado.token ? "com endereço próprio" : "ainda sem endereço"}
          </div>
        </div>
        <div style={{ fontSize: "13px", lineHeight: 1.65, marginTop: "11px", textWrap: "pretty" }}>
          Nasceu do molde <span style={{ fontWeight: "600" }}>{nomeMolde}</span>. É uma
          folha nova: ganha endereço próprio quando a publicar.
        </div>
        {anterior && (
          <div
            style={{
              display: "flex",
              gap: "10px",
              marginTop: "11px",
              borderTop: "1px solid #F5ECD7",
              paddingTop: "11px",
            }}
          >
            <Relogio />
            <div
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: "12px",
                lineHeight: 1.6,
                color: "var(--gray-mid)",
                textWrap: "pretty",
              }}
            >
              O comunicado de{" "}
              <span style={{ fontWeight: "600", color: "var(--charcoal, #1A1A1A)" }}>
                {mesDito(anterior.publicado_em)}
              </span>{" "}
              continua no ar, no endereço que já circulou. Nada do que fizer aqui lhe
              toca.{" "}
              <button
                onClick={() => onIrAoDetalhe?.(anterior.id)}
                className="ligacao"
                style={{
                  fontSize: "12px",
                  color: "var(--gold-dark)",
                  textDecoration: "underline",
                  textDecorationColor: "var(--gold-light)",
                  textUnderlineOffset: "3px",
                }}
              >
                Ver esse
              </button>
              .
            </div>
          </div>
        )}
      </div>

      <h1
        style={{
          margin: "24px 0 0",
          fontFamily: "'Playfair Display', serif",
          fontSize: "24px",
          fontWeight: "400",
          lineHeight: 1.3,
          textWrap: "balance",
        }}
      >
        {comunicado.titulo?.trim() || "Sem título, por enquanto"}
      </h1>
      {/* div e não p: o esqueleto da contagem é um div, e um p não pode
          conter um div — o browser parte a árvore em silêncio. */}
      <div style={{ margin: "8px 0 0", fontSize: "12.5px", lineHeight: 1.6, color: "var(--gray-mid)" }}>
        {rotulo ? (
          <>
            Público: {rotulo} ·{" "}
            {contagem === undefined ? (
              <Esqueleto w={54} h={10} style={{ display: "inline-block", verticalAlign: "middle" }} />
            ) : contagem === null ? (
              "a contagem não veio"
            ) : (
              `${contagem} ${contagem === 1 ? "pessoa" : "pessoas"}`
            )}{" "}
            — a lista conta-se agora, de novo.
          </>
        ) : (
          <>Público: por escolher — a lista conta-se ao congelar, de novo.</>
        )}
      </div>

      {/* A banda do que vinha de trás: âmbar enquanto há marcas, dourada
          quando a revisão desta visita as fechou todas. Sem marcas e sem
          revisão, nada — não se celebra o que não aconteceu. */}
      {porRever > 0 ? (
        <div
          style={{
            display: "flex",
            gap: "11px",
            marginTop: "20px",
            backgroundColor: "#FFFDF6",
            border: "1px solid #F0D9B5",
            borderRadius: "12px",
            padding: "13px 14px",
          }}
        >
          <Alerta />
          <div style={{ flex: 1, minWidth: 0, fontSize: "12.5px", lineHeight: 1.6, textWrap: "pretty" }}>
            {porRever === 1
              ? "Uma linha traz uma data ou um prazo que veio de trás. Confirme-a antes de publicar — o resto vem do molde tal como estava."
              : `${porRever} linhas trazem datas ou prazos que vieram de trás. Confirme-as antes de publicar.`}
          </div>
        </div>
      ) : houveRevisao ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "11px",
            marginTop: "20px",
            backgroundColor: "#FEF9EC",
            border: "1px solid var(--gold-light)",
            borderRadius: "12px",
            padding: "13px 14px",
          }}
        >
          <MedalhaPequena />
          <div style={{ flex: 1, minWidth: 0, fontSize: "12.5px", lineHeight: 1.6 }}>
            Revisto o que vinha de trás. A folha está pronta a publicar.
          </div>
        </div>
      ) : null}

      {erro && (
        <p role="alert" style={{ margin: "16px 0 0", fontSize: "12.5px", color: "#DC2626" }}>
          {erro}
        </p>
      )}

      <div style={{ ...OVERLINE, marginTop: "22px" }}>A FOLHA</div>

      {visiveis.map((b) => {
        const aRever = Boolean(b.rever);
        const jaRevisto = revistos.has(b.id);
        return (
          <div
            key={b.id}
            style={{
              marginTop: "10px",
              backgroundColor: "white",
              border: `1px solid ${aRever ? "#F0D9B5" : "#F0E6D0"}`,
              borderRadius: "12px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
              padding: "13px 14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: "9px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: "12.5px", fontWeight: "600" }}>
                {rotuloDoBloco(b)}
              </div>
              {aRever && (
                <div
                  style={{
                    flex: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "3px 9px",
                    borderRadius: "999px",
                    backgroundColor: "#FFFDF6",
                    border: "1px solid #F0D9B5",
                    fontSize: "9px",
                    fontWeight: "700",
                    letterSpacing: "0.12em",
                    color: "var(--gold-dark)",
                    whiteSpace: "nowrap",
                  }}
                >
                  <div style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: "var(--gold)" }} />
                  A REVER
                </div>
              )}
              {jaRevisto && (
                <div
                  style={{
                    flex: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "9px",
                    fontWeight: "700",
                    letterSpacing: "0.12em",
                    color: "#9B9B9B",
                    whiteSpace: "nowrap",
                  }}
                >
                  <VistoPequeno />
                  REVISTO
                </div>
              )}
            </div>
            {aRever ? (
              <>
                <textarea
                  value={textoDoBloco(b)}
                  onChange={(e) => mudarBloco(b.id, e.target.value)}
                  onBlur={gravarNoBlur}
                  rows={2}
                  className="caixa-texto"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    marginTop: "8px",
                    padding: "10px 12px",
                    fontFamily: "Inter, sans-serif",
                    fontSize: "12.5px",
                    lineHeight: 1.65,
                    borderRadius: "8px",
                    resize: "none",
                    minHeight: "44px",
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "9px" }}>
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: "11.5px",
                      fontStyle: "italic",
                      lineHeight: 1.55,
                      color: "var(--gray-mid)",
                    }}
                  >
                    {b.pergunta || ""}
                  </div>
                  <button
                    onClick={() => marcarCerto(b)}
                    disabled={ocupado}
                    className="acao acao--ouro"
                    style={{
                      flex: "none",
                      padding: "8px 14px",
                      borderRadius: "999px",
                      fontSize: "11.5px",
                      fontWeight: "600",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Está certo
                  </button>
                </div>
              </>
            ) : (
              <p
                style={{
                  margin: "7px 0 0",
                  fontSize: "12.5px",
                  lineHeight: 1.7,
                  color: "var(--gray-mid)",
                  textWrap: "pretty",
                  whiteSpace: "pre-wrap",
                }}
              >
                {textoDoBloco(b)}
              </p>
            )}
          </div>
        );
      })}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "16px" }}>
        <button
          onClick={onAbrirEditor}
          className="acao acao--ouro"
          style={{ padding: "11px 16px", borderRadius: "10px", fontSize: "12.5px", fontWeight: "600" }}
        >
          Abrir o editor
        </button>
        <button
          onClick={onAbrirMensagem}
          className="acao acao--ouro"
          style={{ padding: "11px 16px", borderRadius: "10px", fontSize: "12.5px", fontWeight: "600" }}
        >
          Ver a mensagem
        </button>
        <button
          onClick={onAbrirPublico}
          className="acao acao--ouro"
          style={{ padding: "11px 16px", borderRadius: "10px", fontSize: "12.5px", fontWeight: "600" }}
        >
          Ver o público
        </button>
      </div>

      {/* O rodapé que segue a folha: publicar não bloqueia — a nota por
          baixo diz a verdade do estado, e a decisão é dela. */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          marginTop: "28px",
          backgroundColor: "var(--cream)",
          borderTop: "1px solid #F0E6D0",
          padding: "12px 0 16px",
        }}
      >
        <button
          onClick={publicar}
          disabled={ocupado}
          className="acao acao--cheia"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "14px",
            borderRadius: "12px",
            fontSize: "13.5px",
            fontWeight: "600",
          }}
        >
          Publicar — dar endereço a esta folha
        </button>
        <p
          style={{
            margin: "9px 0 0",
            textAlign: "center",
            fontSize: "11.5px",
            fontStyle: "italic",
            lineHeight: 1.55,
            color: "var(--gray-mid)",
            textWrap: "pretty",
          }}
        >
          {notaRodape}
        </p>
      </div>
    </div>
  );
}
