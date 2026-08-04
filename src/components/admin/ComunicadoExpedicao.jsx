import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  listarDestinatarios,
  marcarAberto,
  marcarEnviado,
  limparAberto,
  guardarMensagemDestinatario,
  marcarTodosEnviados,
  enderecoDoComunicado,
  textoParaDestinatario,
  textoDifusao,
  primeiroNome,
  linhasActivas,
  candidatosPosteriores,
  acrescentarDestinatario,
  dispensarCandidato,
  desfazerDispensa,
  rotuloDaRegra,
} from "../../lib/comunicados";
import { getEventTypes } from "../../lib/invites";
import { linkWhatsApp } from "../../lib/mensagens";
import { Esqueleto } from "./acabamento";
import { dataDita, diaDito, quandoDita, quandoAs } from "./comunicadoTempo";
import GuardarComoMolde from "./GuardarComoMolde";

// ============================================================
// ComunicadoExpedicao — fazer a folha chegar à lista congelada,
// conversa a conversa.
//
// A IDA E VOLTA EM DOIS CARIMBOS, e é o coração do ecrã: «Enviar»
// carimba `aberto_em` e abre a conversa; quando ela volta à app, a
// linha pergunta «a mensagem saiu?» e só a resposta dela carimba
// `enviado_em`. NADA se marca sozinho — o WhatsApp não nos diz se a
// mensagem saiu, e inventá-lo era pôr o ecrã a mentir.
//
// O estado vive na TABELA, não no componente: ela pode fechar a app a
// meio, voltar amanhã, e a lista sabe onde ia. O regresso detecta-se
// por `visibilitychange` — a mesma aba que foi ao WhatsApp e voltou.
//
// A HONESTIDADE É PARTE DO ECRÃ (não é rodapé decorativo): «enviado»
// quer dizer que a conversa se abriu e a mensagem saiu; as leituras da
// folha contam-se no total, nunca por pessoa.
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

const VistoDourado = ({ tamanho = 14 }) => (
  <svg
    width={tamanho}
    height={tamanho}
    viewBox="0 0 16 16"
    fill="none"
    stroke="var(--gold)"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ flex: "none" }}
  >
    <path d="M3 8.6l3.2 3.2L13 5" />
  </svg>
);

const Medalha = ({ tamanho = 18 }) => (
  <svg width={tamanho} height={tamanho} viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
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

// «Acrescentada» DERIVA-SE, não se guarda (081): é a linha criada depois
// do congelamento. Datas comparadas como datas — o formato do Postgres
// («+00:00») e o do toISOString («Z») não se comparam como texto.
const eAcrescentada = (l, congeladoEm) =>
  Boolean(congeladoEm) && new Date(l.created_at) > new Date(congeladoEm);

const PastilhaAcrescentada = () => (
  <span
    style={{
      flex: "none",
      padding: "2px 8px",
      borderRadius: "999px",
      backgroundColor: "#FEF9EC",
      border: "1px solid var(--gold-light)",
      fontSize: "8.5px",
      fontWeight: "700",
      letterSpacing: "0.12em",
      color: "var(--gold-dark)",
      whiteSpace: "nowrap",
    }}
  >
    ACRESCENTADA
  </span>
);

// Números por extenso até dez — as frases do fecho dizem «quatro saíram»,
// não «4 saíram». Dois géneros porque mensagens e linhas são femininas e
// nomes são masculinos; acima de dez, o algarismo é mais honesto que uma
// tabela infinita.
const EXTENSO_F = ["zero", "uma", "duas", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];
const EXTENSO_M = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];
const extensoF = (n) => EXTENSO_F[n] || String(n);
const extensoM = (n) => EXTENSO_M[n] || String(n);
const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const minusculaInicial = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

// O género de um tipo de evento, para «um casamento» / «uma festinha» /
// «uma comunhão» — a mesma família de heurística do pluralDeTipo (lib):
// serve os tipos da casa, e um tipo exótico sai no masculino sem drama.
const tipoFeminino = (tipo) => /(a|ã|ão)$/i.test((tipo || "").trim());

const IconeInformacao = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="var(--gold-dark)"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flex: "none", marginTop: "2px" }}
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r="6.3" />
    <path d="M8 7.4v3.4" />
    <path d="M8 5.2v.1" />
  </svg>
);

const IconeEnviar = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2.2 8L14 2.6 9.4 14l-2-4.4L2.2 8Z" />
    <path d="M7.4 9.6l3-3" />
  </svg>
);

// A régua do progresso: um traço que enche. Não é barra de percentagem
// com número — o número já está escrito na retoma, por palavras.
function Regua({ feitos, total, reduzido }) {
  const pct = total > 0 ? Math.round((100 * feitos) / total) : 0;
  return (
    <div
      style={{
        marginTop: "10px",
        height: "3px",
        backgroundColor: "#E5DCC3",
        borderRadius: "999px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          backgroundColor: "var(--gold)",
          borderRadius: "999px",
          transition: reduzido ? "none" : "width 480ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------
// O FIM — o fecho sereno, quando já não há ninguém à espera. E é ao
// fecho que a pergunta de «quem entrou depois» está ancorada (desenho
// «O evento que entrou depois»): a lista congelada não se vigia em
// contínuo — é aqui, ao fechar, que a casa olha uma vez e decide.
// ------------------------------------------------------------
function OFim({
  comunicado,
  linhas,
  ocupado,
  erro,
  reduzido,
  onAbrirConversa,
  onResponder,
  onRecarregar,
  onVoltarExpedicao,
  onVoltarDetalhe,
}) {
  const enviadas = linhas
    .filter((l) => l.enviado_em)
    .sort((a, b) => new Date(a.enviado_em) - new Date(b.enviado_em));
  const comNumero = linhas.filter((l) => l.telefone);
  const semNumero = linhas.filter((l) => !l.telefone && !l.enviado_em);
  const esperas = comNumero.filter((l) => l.aberto_em && !l.enviado_em);
  const porAbrir = comNumero.filter((l) => !l.aberto_em && !l.enviado_em);
  const porSair = comNumero.filter((l) => !l.enviado_em);
  const tudoSaido = porSair.length === 0;
  const primeira = enviadas[0];
  const ultima = enviadas[enviadas.length - 1];
  const n = enviadas.length;
  const leituras = comunicado.n_acessos || 0;
  const eAcr = (l) => eAcrescentada(l, comunicado.congelado_em);

  // Quem entrou depois de a lista fechar — corre ao montar o fecho.
  // null = a caminho; cada candidato carrega o seu estado local
  // (pergunta → dispensado) e o id da linha de dispensa, para o Desfazer.
  const [candidatos, setCandidatos] = useState(null);
  const [tipos, setTipos] = useState([]);
  const [armado, setArmado] = useState(null);
  const [ocupadoFim, setOcupadoFim] = useState(false);
  const [erroFim, setErroFim] = useState("");
  const timerArmar = useRef(null);

  // O convite do molde: estado da VISITA, de propósito — «agora não» é
  // adiar a conversa, não uma decisão a guardar; na próxima visita o
  // convite volta (decisão registada).
  const [convite, setConvite] = useState("inicial"); // inicial | adiado | guardado
  const [gaveta, setGaveta] = useState(false);
  const [nomeMoldeGuardado, setNomeMoldeGuardado] = useState("");

  useEffect(() => {
    let vivo = true;
    Promise.all([candidatosPosteriores(comunicado), getEventTypes().catch(() => [])])
      .then(([cs, ts]) => {
        if (!vivo) return;
        setCandidatos(cs.map((c) => ({ ...c, estado: "pergunta", dispensaId: null })));
        setTipos(ts || []);
      })
      .catch((e) => {
        // A pergunta de quem entrou depois é um extra do fecho: se a
        // consulta falhar, o fecho continua de pé, sem cartões.
        console.error(e);
        if (vivo) setCandidatos([]);
      });
    return () => {
      vivo = false;
    };
  }, [comunicado]);

  useEffect(() => () => clearTimeout(timerArmar.current), []);

  // Acrescentar reabre uma lista congelada — por isso é em DUAS FASES no
  // próprio botão, e a segunda fase diz o que vai acontecer.
  const armarOuAcrescentar = async (c, i) => {
    if (ocupadoFim || ocupado) return;
    if (armado !== i) {
      clearTimeout(timerArmar.current);
      setArmado(i);
      timerArmar.current = setTimeout(() => setArmado(null), 4000);
      return;
    }
    clearTimeout(timerArmar.current);
    setArmado(null);
    setOcupadoFim(true);
    setErroFim("");
    try {
      await acrescentarDestinatario(comunicado.id, c);
      setCandidatos((prev) => (prev || []).filter((x) => x !== c));
      await onRecarregar();
    } catch (e) {
      console.error(e);
      setErroFim("Não foi possível acrescentar a linha. Tente outra vez.");
    } finally {
      setOcupadoFim(false);
    }
  };

  // Dispensar GRAVA (linha com dispensado_em): a pergunta não volta a
  // aparecer por esta pessoa — nem amanhã, nem noutro ecrã.
  const dispensar = async (c) => {
    if (ocupadoFim || ocupado) return;
    clearTimeout(timerArmar.current);
    setArmado(null);
    setOcupadoFim(true);
    setErroFim("");
    try {
      const linha = await dispensarCandidato(comunicado.id, c);
      setCandidatos((prev) =>
        (prev || []).map((x) =>
          x === c ? { ...x, estado: "dispensado", dispensaId: linha.id } : x,
        ),
      );
      await onRecarregar();
    } catch (e) {
      console.error(e);
      setErroFim("Não foi possível registar a decisão. Tente outra vez.");
    } finally {
      setOcupadoFim(false);
    }
  };

  // Desfazer limpa a coluna e a linha entra na lista como acrescentada —
  // a letra do dono. (O protótipo voltava à pergunta; desvio registado.)
  const desfazer = async (c) => {
    if (ocupadoFim || ocupado) return;
    setOcupadoFim(true);
    setErroFim("");
    try {
      await desfazerDispensa(c.dispensaId);
      setCandidatos((prev) => (prev || []).filter((x) => x !== c));
      await onRecarregar();
    } catch (e) {
      console.error(e);
      setErroFim("Não foi possível desfazer. Tente outra vez.");
    } finally {
      setOcupadoFim(false);
    }
  };

  const pub = comunicado.publico || {};
  const rotuloMin = minusculaInicial(rotuloDaRegra(comunicado.publico, tipos) || "");
  const pendentes = (candidatos || []).filter((c) => c.estado === "pergunta");

  // O convite do molde só com a expedição arrumada e sem pergunta de
  // candidato por decidir — e nunca num comunicado que JÁ nasceu de um
  // molde: voltar a guardar o que veio de um molde é ruído (decisão
  // registada).
  const mostrarConvite =
    tudoSaido && !comunicado.modelo_id && candidatos !== null && pendentes.length === 0;

  // O título e o sub DERIVAM do estado real — com linhas entradas depois
  // por enviar, o fecho não finge que acabou. Com uma só enviada, a
  // frase não se põe no plural a fingir.
  let titulo;
  let frase;
  if (tudoSaido) {
    titulo = "Todos enviados.";
    if (n === 0) frase = "Não saiu nenhuma mensagem por aqui.";
    else if (eAcr(ultima))
      // A última a sair foi a linha que entrou depois — o fecho di-lo.
      frase =
        n === 1
          ? `A mensagem saiu ${quandoAs(ultima.enviado_em)}, para a linha que entrou depois.`
          : `${maiuscula(extensoF(n))} mensagens ao todo — a última ${quandoAs(ultima.enviado_em)}, para a linha que entrou depois.`;
    else
      frase =
        n === 1
          ? `A mensagem saiu ${quandoAs(ultima.enviado_em)}.`
          : `As ${n} mensagens saíram — a primeira ${diaDito(primeira.enviado_em)}, a última ${quandoAs(ultima.enviado_em)}.`;
  } else {
    const k = porSair.length;
    titulo = k === 1 ? "Falta uma." : `Faltam ${extensoF(k)}.`;
    const dias = new Set(enviadas.map((l) => new Date(l.enviado_em).toDateString()));
    const saiu =
      n === 0
        ? "Ainda não saiu nenhuma."
        : dias.size === 1
          ? `${maiuscula(extensoF(n))} ${n === 1 ? "saiu" : "saíram"} ${diaDito(ultima.enviado_em)}.`
          : `${maiuscula(extensoF(n))} saíram — a última ${quandoAs(ultima.enviado_em)}.`;
    const entrou = porSair.every(eAcr)
      ? k === 1
        ? "A linha que entrou depois ainda não saiu."
        : `As ${extensoF(k)} linhas que entraram depois ainda não saíram.`
      : k === 1
        ? "Uma linha ainda não saiu."
        : `${maiuscula(extensoF(k))} linhas ainda não saíram.`;
    frase = `${saiu} ${entrou}`;
  }

  // A lista fechada, em filas: enviadas primeiro, depois o que ainda vai
  // sair (o que entrou depois), por fim quem não tem número.
  const filas = [
    ...enviadas.map((l) => ({ l, tipo: "enviada" })),
    ...esperas.map((l) => ({ l, tipo: "espera" })),
    ...porAbrir.map((l) => ({ l, tipo: "porabrir" })),
    ...semNumero.map((l) => ({ l, tipo: "semnumero" })),
  ];

  return (
    <div style={{ maxWidth: "560px" }}>
      <button
        onClick={onVoltarExpedicao}
        className="ligacao"
        style={{ fontSize: "12.5px", color: "var(--gray-mid)" }}
      >
        ← A expedição
      </button>

      <div style={{ ...OVERLINE, marginTop: "14px", textTransform: "uppercase" }}>
        EXPEDIÇÃO{comunicado.titulo?.trim() ? ` · ${comunicado.titulo.trim()}` : ""}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "18px" }}>
        <Medalha tamanho={26} />
        <h1
          style={{
            margin: 0,
            fontFamily: "'Playfair Display', serif",
            fontSize: "26px",
            fontWeight: "400",
            lineHeight: 1.25,
          }}
        >
          {titulo}
        </h1>
      </div>
      <p style={{ margin: "10px 0 0", fontSize: "13px", lineHeight: 1.65, color: "var(--gray-mid)" }}>
        {frase}
        {tudoSaido ? " A lista fica guardada tal como acabou." : ""}
      </p>
      {/* A régua do fecho enche só com tudo saído — com uma linha
          entrada depois por enviar, mostra o que falta, sem fingir. */}
      <Regua feitos={n} total={comNumero.length} reduzido={reduzido} />

      {(erro || erroFim) && (
        <p role="alert" style={{ margin: "14px 0 0", fontSize: "12.5px", color: "#DC2626" }}>
          {erro || erroFim}
        </p>
      )}

      <div style={{ ...OVERLINE, marginTop: "26px" }}>A LISTA, FECHADA</div>
      <div style={{ ...CARTAO, marginTop: "10px", padding: "4px 16px" }}>
        {/* Dispensadas nunca aparecem (a prop já vem por linhasActivas);
            quem não tinha número fica, sem visto e sem hora — esteve cá,
            e o fecho não finge que lhe chegou. Uma linha entrada depois
            do congelamento leva a pastilha e, por enviar, o MESMO fluxo
            dos dois carimbos: nada se marca sozinho, nem no fecho. */}
        {filas.map(({ l, tipo }, i) => (
          <div
            key={l.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "11px",
              padding: "12px 0",
              borderBottom:
                i === filas.length - 1 ? "1px solid transparent" : "1px solid #F5ECD7",
            }}
          >
            {tipo === "enviada" ? (
              <VistoDourado />
            ) : (
              <span
                aria-hidden
                style={{
                  flex: "none",
                  width: "14px",
                  height: "14px",
                  borderRadius: "50%",
                  border: tipo === "semnumero" ? "1.5px dashed #E8DCC0" : "1.5px solid var(--gold-light)",
                  boxSizing: "border-box",
                }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: tipo === "semnumero" ? "var(--gray-mid)" : undefined,
                  }}
                >
                  {l.nome}
                </div>
                {eAcr(l) && <PastilhaAcrescentada />}
              </div>
              <div style={{ fontSize: "11.5px", color: "var(--gray-mid)", marginTop: "1px" }}>{l.ancora}</div>
            </div>
            {tipo === "enviada" ? (
              <div
                style={{
                  flex: "none",
                  fontSize: "11.5px",
                  color: "#9B9B9B",
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {quandoDita(l.enviado_em)}
              </div>
            ) : tipo === "espera" ? (
              <div style={{ flex: "none", fontSize: "11.5px", color: "#9B9B9B", whiteSpace: "nowrap" }}>
                à espera de resposta
              </div>
            ) : tipo === "porabrir" ? (
              <button
                onClick={() => onAbrirConversa(l)}
                disabled={ocupado || ocupadoFim}
                className="acao acao--ouro"
                style={{
                  flex: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "9px 14px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  fontWeight: "600",
                  whiteSpace: "nowrap",
                }}
              >
                <IconeEnviar />
                Enviar
              </button>
            ) : (
              <div style={{ flex: "none", fontSize: "11.5px", color: "#9B9B9B", whiteSpace: "nowrap" }}>
                sem número
              </div>
            )}
          </div>
        ))}
      </div>

      {/* A PERGUNTA DA VOLTA, também no fecho — o «Enviar» de uma linha
          entrada depois abre a conversa e carimba o aberto_em; só a
          resposta dela carimba o enviado_em. */}
      {esperas.map((l) => (
        <div
          key={`volta-${l.id}`}
          style={{
            marginTop: "14px",
            backgroundColor: "#FFFDF6",
            border: "1px solid #F0D9B5",
            borderRadius: "12px",
            padding: "13px 14px",
          }}
        >
          <div style={{ fontSize: "13px", lineHeight: 1.55 }}>
            A conversa da <span style={{ fontWeight: "600" }}>{primeiroNome(l.nome) || l.nome}</span>{" "}
            abriu-se. A mensagem saiu?
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "11px" }}>
            <button
              onClick={() => onResponder(l, true)}
              disabled={ocupado || ocupadoFim}
              className="acao acao--cheia"
              style={{ padding: "10px 16px", borderRadius: "10px", fontSize: "12.5px", fontWeight: "600" }}
            >
              Saiu — enviei
            </button>
            <button
              onClick={() => onResponder(l, false)}
              disabled={ocupado || ocupadoFim}
              className="acao acao--ouro"
              style={{ padding: "10px 16px", borderRadius: "10px", fontSize: "12.5px", fontWeight: "600" }}
            >
              Não saiu
            </button>
          </div>
        </div>
      ))}

      {/* O EVENTO QUE ENTROU DEPOIS — um cartão por candidato. A lista
          está fechada e assim fica, a não ser que ela decida o contrário. */}
      {(candidatos || []).map((c, i) => {
        if (c.estado === "dispensado") {
          const alvo =
            pub.origem === "eventos"
              ? (() => {
                  const t = ((c.ancora || "").split(" · ")[0] || "evento").trim();
                  return `por ${tipoFeminino(t) ? "esta" : "este"} ${t.toLowerCase()}`;
                })()
              : "por esta pessoa";
          return (
            <p
              key={`disp-${i}`}
              style={{ margin: "16px 0 0", fontSize: "12px", lineHeight: 1.6, color: "var(--gray-mid)", textWrap: "pretty" }}
            >
              A lista fica como acabou. Não se volta a perguntar {alvo}.{" "}
              <button
                onClick={() => desfazer(c)}
                disabled={ocupadoFim}
                className="ligacao"
                style={{
                  fontSize: "12px",
                  color: "var(--gray-mid)",
                  textDecoration: "underline",
                  textUnderlineOffset: "3px",
                }}
              >
                Desfazer
              </button>
            </p>
          );
        }
        const entrada =
          pub.origem === "eventos"
            ? (() => {
                const [tipoParte, dataParte] = (c.ancora || "").split(" · ");
                const t = (tipoParte || "evento").trim();
                return {
                  cabeca: `Entrou ${tipoFeminino(t) ? "uma" : "um"} ${t.toLowerCase()} depois de esta lista ter sido congelada: `,
                  quando:
                    dataParte && dataParte !== "sem data marcada"
                      ? `, ${dataParte}`
                      : ", ainda sem data marcada",
                };
              })()
            : {
                cabeca: "Entrou um contacto depois de esta lista ter sido congelada: ",
                quando: "",
              };
        const estaArmado = armado === i;
        return (
          <div key={`cand-${i}`} style={{ ...CARTAO, borderRadius: "14px", marginTop: "16px", padding: "15px 16px" }}>
            <div style={{ display: "flex", gap: "11px" }}>
              <IconeInformacao />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", lineHeight: 1.65, textWrap: "pretty" }}>
                  {entrada.cabeca}
                  <span style={{ fontWeight: "600" }}>{c.nome}</span>
                  {entrada.quando}. Pela regra deste comunicado
                  {rotuloMin ? ` — ${rotuloMin} — ` : " "}
                  teria recebido.
                </div>
                <div style={{ fontSize: "11.5px", lineHeight: 1.6, color: "var(--gray-mid)", marginTop: "7px" }}>
                  A lista está fechada e assim fica, a não ser que decida o contrário.
                </div>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "10px",
                marginTop: "13px",
                borderTop: "1px solid #F5ECD7",
                paddingTop: "12px",
              }}
            >
              <button
                onClick={() => armarOuAcrescentar(c, i)}
                disabled={ocupadoFim}
                className={`acao ${estaArmado ? "acao--cheia" : "acao--ouro"}`}
                style={{ padding: "11px 16px", borderRadius: "10px", fontSize: "12.5px", fontWeight: "600" }}
              >
                {estaArmado ? "Confirmar? A lista reabre para uma linha." : "Acrescentar à lista"}
              </button>
              <button
                onClick={() => dispensar(c)}
                disabled={ocupadoFim}
                className="acao"
                style={{
                  padding: "11px 14px",
                  border: "none",
                  borderRadius: "10px",
                  background: "transparent",
                  color: "var(--gray-mid)",
                  fontSize: "12.5px",
                  fontWeight: "600",
                }}
              >
                Deixar como está
              </button>
            </div>
            {estaArmado && (
              <p
                style={{
                  margin: "10px 0 0",
                  fontSize: "11.5px",
                  fontStyle: "italic",
                  lineHeight: 1.6,
                  color: "var(--gray-mid)",
                  textWrap: "pretty",
                }}
              >
                Entra uma linha só, e o envio continua a ser seu: a lista passa a ter{" "}
                {extensoM(linhas.length + 1)} nomes,{" "}
                {n === 0
                  ? "nenhum deles ainda enviado"
                  : n === 1
                    ? "um deles já enviado"
                    : `${extensoM(n)} deles já enviados`}
                .
              </p>
            )}
          </div>
        );
      })}

      <div
        style={{
          marginTop: "22px",
          backgroundColor: "#FBF7EF",
          border: "1px solid var(--gold-light)",
          borderRadius: "14px",
          padding: "15px 16px",
        }}
      >
        <div style={{ fontSize: "13px" }}>
          A folha foi aberta{" "}
          <span style={{ fontWeight: "600", fontVariantNumeric: "tabular-nums" }}>{leituras}</span>{" "}
          {leituras === 1 ? "vez" : "vezes"} até agora.
        </div>
        <p
          style={{
            margin: "7px 0 0",
            fontSize: "11.5px",
            fontStyle: "italic",
            lineHeight: 1.6,
            color: "var(--gray-mid)",
            textWrap: "pretty",
          }}
        >
          No total, sem nomes: a folha é pública e reencaminhável, e «enviado» diz
          que a mensagem saiu — não que foi recebida ou lida. Mais leituras do que
          envios é bom sinal: alguém partilhou.
        </p>
      </div>

      {/* O CONVITE DO MOLDE — ancorado no fecho: é com tudo enviado que
          se sabe se isto vai repetir-se. */}
      {mostrarConvite && convite === "inicial" && (
        <div style={{ ...CARTAO, borderRadius: "14px", marginTop: "16px", padding: "15px 16px" }}>
          <div style={{ fontSize: "13px", lineHeight: 1.65, textWrap: "pretty" }}>
            Isto vai repetir-se em cada casamento novo. Quer guardar como molde?
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", marginTop: "12px" }}>
            <button
              onClick={() => setGaveta(true)}
              className="acao acao--ouro"
              style={{ padding: "11px 16px", borderRadius: "10px", fontSize: "12.5px", fontWeight: "600" }}
            >
              Guardar como molde
            </button>
            <button
              onClick={() => setConvite("adiado")}
              className="acao"
              style={{
                padding: "11px 14px",
                border: "none",
                borderRadius: "10px",
                background: "transparent",
                color: "var(--gray-mid)",
                fontSize: "12.5px",
                fontWeight: "600",
              }}
            >
              Agora não
            </button>
          </div>
        </div>
      )}
      {mostrarConvite && convite === "adiado" && (
        <p style={{ margin: "16px 0 0", fontSize: "12px", lineHeight: 1.6, color: "var(--gray-mid)", textWrap: "pretty" }}>
          Fica como está. Pode guardar como molde a partir do próprio comunicado,
          quando quiser.{" "}
          <button
            onClick={() => setGaveta(true)}
            className="ligacao"
            style={{
              fontSize: "12px",
              color: "var(--gold-dark)",
              textDecoration: "underline",
              textDecorationColor: "var(--gold-light)",
              textUnderlineOffset: "3px",
            }}
          >
            Guardar agora
          </button>
        </p>
      )}
      {convite === "guardado" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "11px",
            marginTop: "16px",
            backgroundColor: "#FEF9EC",
            border: "1px solid var(--gold-light)",
            borderRadius: "12px",
            padding: "13px 14px",
          }}
        >
          <VistoDourado />
          <div style={{ flex: 1, minWidth: 0, fontSize: "12.5px", lineHeight: 1.6 }}>
            Molde guardado: <span style={{ fontWeight: "600" }}>{nomeMoldeGuardado}</span> ·
            Fica em Comunicados · Moldes.
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "24px" }}>
        {comunicado.token && (
          <a
            href={enderecoDoComunicado(comunicado.token)}
            target="_blank"
            rel="noreferrer"
            className="acao acao--ouro"
            style={{
              padding: "11px 16px",
              borderRadius: "10px",
              fontSize: "12.5px",
              fontWeight: "600",
              textDecoration: "none",
            }}
          >
            Ver a folha
          </a>
        )}
        <button
          onClick={onVoltarDetalhe}
          className="acao acao--ouro"
          style={{ padding: "11px 16px", borderRadius: "10px", fontSize: "12.5px", fontWeight: "600" }}
        >
          O comunicado e as leituras
        </button>
      </div>

      {/* A gaveta de guardar como molde é da frente irmã — aqui só se
          monta e se recebe o molde guardado. */}
      <GuardarComoMolde
        comunicado={comunicado}
        aberta={gaveta}
        onFechar={() => setGaveta(false)}
        onGuardado={(modelo) => {
          setGaveta(false);
          setNomeMoldeGuardado(modelo?.nome || "");
          setConvite("guardado");
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------
// A EXPEDIÇÃO
// ------------------------------------------------------------
export default function ComunicadoExpedicao({ comunicado, onVoltar, onMensagem }) {
  const reduzido = useReducedMotion();
  const endereco = comunicado.token ? enderecoDoComunicado(comunicado.token) : "";

  const [linhas, setLinhas] = useState(null); // null = a caminho
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [fichaId, setFichaId] = useState(null);
  const [fichaAberta, setFichaAberta] = useState(false);
  const [rascunhoFicha, setRascunhoFicha] = useState("");
  const [difusao, setDifusao] = useState(false);
  const [difArmado, setDifArmado] = useState(false);
  const [copiadoDif, setCopiadoDif] = useState(false);
  const [copiadoId, setCopiadoId] = useState(null);
  const [noFim, setNoFim] = useState(false);
  const timers = useRef({});

  const recarregar = useCallback(
    () =>
      listarDestinatarios(comunicado.id)
        .then((ls) => {
          setLinhas(ls);
          setErro("");
        })
        .catch((e) => {
          console.error(e);
          setErro("Não foi possível carregar a lista. Tente outra vez.");
          setLinhas((prev) => prev || []);
        }),
    [comunicado.id],
  );

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  // O REGRESSO. Ela foi ao WhatsApp e voltou: a lista relê-se da tabela,
  // porque o carimbo do «abriu-se» ficou lá e não aqui. Vale para o
  // regresso de outra aba e para reabrir a app noutro dia.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible") recarregar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [recarregar]);

  useEffect(() => {
    const guardados = timers.current;
    return () => Object.values(guardados).forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!difArmado) return undefined;
    const t = setTimeout(() => setDifArmado(false), 4000);
    return () => clearTimeout(t);
  }, [difArmado]);

  const ls = linhas || [];
  // Dispensadas ficam FORA de tudo o que este ecrã conta e mostra —
  // total, feitos, retoma e difusão só vêem linhas activas (fase 3; a
  // lib exclui-as da difusão, e aqui exclui-se da vista).
  const activas = linhasActivas(ls);
  const comNumero = activas.filter((l) => l.telefone);
  const semNumero = activas.filter((l) => !l.telefone);
  const esperas = comNumero.filter((l) => l.aberto_em && !l.enviado_em);
  const porEnviar = comNumero.filter((l) => !l.aberto_em && !l.enviado_em);
  const enviados = activas.filter((l) => l.enviado_em);
  const feitos = enviados.length;
  const total = comNumero.length;
  const acabou = total > 0 && feitos === total;
  const semMensagem = !comunicado.mensagem?.trim();

  const ficha = ls.find((l) => l.id === fichaId) || null;

  const textoDe = (l) => textoParaDestinatario(comunicado, l, endereco);

  // «Faltam 3 de 4 — a seguir, a Marta.» Uma indicação, não uma
  // contagem: o ecrã diz por onde se pega, não quanto falta apenas.
  const retoma = (() => {
    const faltam = total - feitos;
    const cabeca = `Faltam ${faltam} de ${total}`;
    if (esperas.length) return `${cabeca} — uma resposta à espera, acima.`;
    const prox = porEnviar[0];
    if (prox) return `${cabeca} — a seguir, a ${primeiroNome(prox.nome) || prox.nome}.`;
    return `${cabeca}.`;
  })();

  const copiarTexto = (texto, chave) => {
    try {
      navigator.clipboard?.writeText(texto).catch(() => {});
    } catch {
      /* sem clipboard, o ecrã não parte — o texto continua à vista na ficha */
    }
    clearTimeout(timers.current[chave]);
    if (chave === "difusao") setCopiadoDif(true);
    else setCopiadoId(chave);
    timers.current[chave] = setTimeout(() => {
      if (chave === "difusao") setCopiadoDif(false);
      else setCopiadoId((v) => (v === chave ? null : v));
    }, 2200);
  };

  // O primeiro carimbo: a conversa abre-se, e a linha fica à espera de
  // resposta. Se o carimbo falhar, a conversa NÃO se abre — senão a
  // lista perdia o rasto de um envio que aconteceu.
  const abrirConversa = async (l) => {
    if (ocupado) return;
    setOcupado(true);
    setErro("");
    try {
      await marcarAberto(l.id);
      const url = linkWhatsApp(l.telefone, textoDe(l));
      if (url) window.open(url, "_blank", "noopener");
      await recarregar();
    } catch (e) {
      console.error(e);
      setErro("Não foi possível abrir a conversa. Tente outra vez.");
    } finally {
      setOcupado(false);
    }
  };

  const responder = async (l, saiu) => {
    if (ocupado) return;
    setOcupado(true);
    setErro("");
    try {
      await (saiu ? marcarEnviado(l.id) : limparAberto(l.id));
      await recarregar();
    } catch (e) {
      console.error(e);
      setErro("Não foi possível registar a resposta. Tente outra vez.");
    } finally {
      setOcupado(false);
    }
  };

  const abrirFicha = (l) => {
    setFichaId(l.id);
    setRascunhoFicha(textoDe(l));
    setFichaAberta(true);
  };

  const fecharFicha = () => setFichaAberta(false);

  // A ficha grava o texto próprio ANTES de abrir a conversa: o que ela
  // acabou de escrever é o que tem de sair.
  const enviarDaFicha = async () => {
    if (!ficha || ocupado) return;
    setOcupado(true);
    setErro("");
    try {
      const base = textoParaDestinatario(comunicado, { ...ficha, mensagem: null }, endereco);
      const proprio = rascunhoFicha.trim() === base.trim() ? null : rascunhoFicha;
      const guardada = await guardarMensagemDestinatario(ficha.id, proprio);
      await marcarAberto(ficha.id);
      const url = linkWhatsApp(ficha.telefone, textoDe({ ...ficha, ...guardada }));
      if (url) window.open(url, "_blank", "noopener");
      setFichaAberta(false);
      await recarregar();
    } catch (e) {
      console.error(e);
      setErro("Não foi possível guardar a mensagem desta pessoa.");
    } finally {
      setOcupado(false);
    }
  };

  const marcarTodos = async () => {
    if (ocupado) return;
    if (!difArmado) {
      setDifArmado(true);
      return;
    }
    setOcupado(true);
    setErro("");
    try {
      await marcarTodosEnviados(comunicado.id);
      setDifArmado(false);
      setDifusao(false);
      await recarregar();
    } catch (e) {
      console.error(e);
      setErro("Não foi possível marcar a lista. Tente outra vez.");
    } finally {
      setOcupado(false);
    }
  };

  if (linhas === null) {
    return (
      <div style={{ maxWidth: "560px" }}>
        <Esqueleto w={120} h={14} />
        <div style={{ marginTop: "18px" }}>
          <Esqueleto w={320} h={26} />
        </div>
        <div style={{ marginTop: "22px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {[0, 1, 2].map((i) => (
            <Esqueleto key={i} w="100%" h={62} r={12} />
          ))}
        </div>
      </div>
    );
  }

  if (noFim) {
    return (
      <OFim
        comunicado={comunicado}
        linhas={activas}
        ocupado={ocupado}
        erro={erro}
        reduzido={reduzido}
        onAbrirConversa={abrirConversa}
        onResponder={responder}
        onRecarregar={recarregar}
        onVoltarExpedicao={() => setNoFim(false)}
        onVoltarDetalhe={onVoltar}
      />
    );
  }

  return (
    <div style={{ maxWidth: "560px" }}>
      <button
        onClick={onVoltar}
        className="ligacao"
        style={{ fontSize: "12.5px", color: "var(--gray-mid)" }}
      >
        ← O comunicado
      </button>

      <div style={{ ...OVERLINE, marginTop: "14px" }}>EXPEDIÇÃO</div>
      <h1
        style={{
          margin: "6px 0 0",
          fontFamily: "'Playfair Display', serif",
          fontSize: "24px",
          fontWeight: "400",
          lineHeight: 1.3,
          textWrap: "balance",
        }}
      >
        {comunicado.titulo?.trim() || "Sem título, por enquanto"}
      </h1>
      <p style={{ margin: "7px 0 0", fontSize: "12px", color: "var(--gray-mid)" }}>
        Lista congelada {comunicado.congelado_em ? `a ${dataDita(comunicado.congelado_em)}` : ""} ·{" "}
        {activas.length} {activas.length === 1 ? "nome" : "nomes"} ·{" "}
        <button
          onClick={onMensagem}
          className="ligacao"
          style={{
            fontSize: "12px",
            color: "var(--gold-dark)",
            textDecoration: "underline",
            textDecorationColor: "var(--gold-light)",
            textUnderlineOffset: "3px",
          }}
        >
          A mensagem
        </button>
      </p>

      {/* Sem mensagem base não se expede: o que a conversa levaria era
          um endereço nu. Não se bloqueia com um aviso — dá-se o caminho. */}
      {semMensagem && (
        <div
          style={{
            marginTop: "20px",
            backgroundColor: "#FFFDF6",
            border: "1px solid #F0D9B5",
            borderRadius: "14px",
            padding: "16px 18px",
          }}
        >
          <div style={{ fontSize: "13.5px", fontWeight: "600" }}>
            Falta a mensagem que acompanha o endereço.
          </div>
          <p style={{ margin: "7px 0 0", fontSize: "12.5px", lineHeight: 1.6, color: "var(--gray-mid)" }}>
            Escreve-se uma vez e sai em todas as conversas, com o nome de cada
            pessoa. Sem ela, a folha chegava como um endereço sozinho.
          </p>
          <button
            onClick={onMensagem}
            className="acao acao--cheia"
            style={{ marginTop: "12px", padding: "11px 20px", borderRadius: "10px", fontSize: "12.5px", fontWeight: "600" }}
          >
            Escrever a mensagem
          </button>
        </div>
      )}

      {!semMensagem && !acabou && total > 0 && (
        <div style={{ marginTop: "22px" }}>
          <div style={{ fontSize: "15px", fontWeight: "600" }}>{retoma}</div>
          <Regua feitos={feitos} total={total} reduzido={reduzido} />
        </div>
      )}

      {acabou && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginTop: "22px",
            backgroundColor: "#FEF9EC",
            border: "1px solid var(--gold-light)",
            borderRadius: "14px",
            padding: "15px 16px",
          }}
        >
          <Medalha />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "13.5px", fontWeight: "600" }}>Todos enviados.</div>
            <div style={{ fontSize: "11.5px", color: "var(--gray-mid)", marginTop: "2px" }}>
              A última mensagem saiu {quandoAs(enviados[enviados.length - 1]?.enviado_em)}.
            </div>
          </div>
          <button
            onClick={() => setNoFim(true)}
            className="ligacao"
            style={{ flex: "none", fontSize: "12.5px", color: "var(--gold-dark)", whiteSpace: "nowrap" }}
          >
            Ver o fecho →
          </button>
        </div>
      )}

      {erro && (
        <p role="alert" style={{ margin: "16px 0 0", fontSize: "12.5px", color: "#DC2626" }}>
          {erro}
        </p>
      )}

      {!difusao && (
        <>
          {/* A PERGUNTA DA VOLTA — só ela carimba o «enviado». */}
          {esperas.map((l) => (
            <div
              key={l.id}
              style={{
                marginTop: "14px",
                backgroundColor: "#FFFDF6",
                border: "1px solid #F0D9B5",
                borderRadius: "12px",
                padding: "13px 14px",
              }}
            >
              <div style={{ fontSize: "13px", lineHeight: 1.55 }}>
                A conversa da <span style={{ fontWeight: "600" }}>{primeiroNome(l.nome) || l.nome}</span>{" "}
                abriu-se. A mensagem saiu?
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "11px" }}>
                <button
                  onClick={() => responder(l, true)}
                  disabled={ocupado}
                  className="acao acao--cheia"
                  style={{ padding: "10px 16px", borderRadius: "10px", fontSize: "12.5px", fontWeight: "600" }}
                >
                  Saiu — enviei
                </button>
                <button
                  onClick={() => responder(l, false)}
                  disabled={ocupado}
                  className="acao acao--ouro"
                  style={{ padding: "10px 16px", borderRadius: "10px", fontSize: "12.5px", fontWeight: "600" }}
                >
                  Não saiu
                </button>
              </div>
            </div>
          ))}

          {/* A sugestão da difusão aparece quando o caminho uma-a-uma
              começa a ser trabalho a sério (dez ou mais por enviar). */}
          {!acabou && porEnviar.length >= 10 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginTop: "16px",
                backgroundColor: "#FBF7EF",
                border: "1px solid var(--gold-light)",
                borderRadius: "12px",
                padding: "12px 14px",
              }}
            >
              <div style={{ flex: 1, fontSize: "12.5px", lineHeight: 1.55, color: "var(--gray-mid)" }}>
                São {porEnviar.length} conversas com a mesma mensagem. Há um caminho mais curto.
              </div>
              <button
                onClick={() => setDifusao(true)}
                className="acao acao--ouro"
                style={{
                  flex: "none",
                  padding: "9px 14px",
                  borderRadius: "999px",
                  fontSize: "11.5px",
                  fontWeight: "600",
                  whiteSpace: "nowrap",
                }}
              >
                Lista de difusão
              </button>
            </div>
          )}

          {porEnviar.length > 0 && (
            <>
              <div style={{ ...OVERLINE, marginTop: "22px" }}>POR ENVIAR · {porEnviar.length}</div>
              {porEnviar.map((l) => (
                <div
                  key={l.id}
                  style={{ ...CARTAO, display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", marginTop: "8px" }}
                >
                  <button
                    onClick={() => abrirFicha(l)}
                    className="acao"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      border: "none",
                      background: "none",
                      padding: 0,
                      textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <div style={{ fontSize: "13.5px", fontWeight: "600" }}>{l.nome}</div>
                      {eAcrescentada(l, comunicado.congelado_em) && <PastilhaAcrescentada />}
                    </div>
                    <div style={{ fontSize: "11.5px", color: "var(--gray-mid)", marginTop: "2px" }}>{l.ancora}</div>
                    {l.mensagem && (
                      <div style={{ fontSize: "11px", fontStyle: "italic", color: "var(--gray-mid)", marginTop: "2px" }}>
                        com mensagem própria
                      </div>
                    )}
                  </button>
                  <button
                    onClick={() => abrirConversa(l)}
                    disabled={ocupado || semMensagem}
                    className="acao acao--ouro"
                    style={{
                      flex: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "7px",
                      padding: "10px 15px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: "600",
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M2.2 8L14 2.6 9.4 14l-2-4.4L2.2 8Z" />
                      <path d="M7.4 9.6l3-3" />
                    </svg>
                    Enviar
                  </button>
                </div>
              ))}
              <p style={{ margin: "10px 0 0", fontSize: "11px", fontStyle: "italic", color: "var(--gray-mid)" }}>
                Tocar no nome ajusta a mensagem dessa pessoa antes de sair.
              </p>
            </>
          )}

          {/* Sem número não é erro nem castigo: fica na lista, contado,
              com a mensagem à mão para seguir por onde houver caminho. */}
          {semNumero.length > 0 && (
            <>
              <div style={{ ...OVERLINE, marginTop: "22px", color: "#9B9B9B" }}>
                SEM NÚMERO UTILIZÁVEL · {semNumero.length}
              </div>
              {semNumero.map((l) => (
                <div
                  key={l.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    backgroundColor: "white",
                    border: "1px dashed #E8DCC0",
                    borderRadius: "12px",
                    padding: "12px 14px",
                    marginTop: "8px",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <div style={{ fontSize: "13.5px", fontWeight: "600", color: "var(--gray-mid)" }}>{l.nome}</div>
                      {eAcrescentada(l, comunicado.congelado_em) && <PastilhaAcrescentada />}
                    </div>
                    <div style={{ fontSize: "11.5px", color: "var(--gray-mid)", marginTop: "2px" }}>
                      {l.ancora} — sem número na ficha nem nas respostas
                    </div>
                  </div>
                  <button
                    onClick={() => copiarTexto(textoDe(l), l.id)}
                    className="acao acao--ouro"
                    style={{
                      flex: "none",
                      padding: "9px 13px",
                      borderRadius: "999px",
                      fontSize: "11.5px",
                      fontWeight: "600",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {copiadoId === l.id ? "Copiada" : "Copiar a mensagem"}
                  </button>
                </div>
              ))}
              <p style={{ margin: "8px 0 0", fontSize: "11px", fontStyle: "italic", color: "var(--gray-mid)" }}>
                Ficam na lista, contados — a mensagem copia-se e segue por onde houver caminho.
              </p>
            </>
          )}

          {enviados.length > 0 && (
            <>
              <div style={{ ...OVERLINE, marginTop: "22px" }}>ENVIADOS · {enviados.length}</div>
              {enviados.map((l) => (
                <div
                  key={l.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "11px",
                    backgroundColor: "white",
                    border: "1px solid #F5ECD7",
                    borderRadius: "12px",
                    padding: "11px 14px",
                    marginTop: "8px",
                  }}
                >
                  <VistoDourado />
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--gray-mid)" }}>{l.nome}</div>
                    {eAcrescentada(l, comunicado.congelado_em) && <PastilhaAcrescentada />}
                  </div>
                  <div
                    style={{
                      flex: "none",
                      fontSize: "11.5px",
                      color: "#9B9B9B",
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {quandoDita(l.enviado_em)}
                  </div>
                </div>
              ))}
            </>
          )}

          {!acabou && porEnviar.length > 0 && porEnviar.length < 10 && (
            <div style={{ marginTop: "24px", textAlign: "center" }}>
              <button
                onClick={() => setDifusao(true)}
                className="ligacao"
                style={{ fontSize: "12px", color: "var(--gray-mid)" }}
              >
                Muitas pessoas de uma vez? Há a lista de difusão
              </button>
            </div>
          )}

          <p
            style={{
              margin: "26px 0 0",
              fontSize: "11px",
              fontStyle: "italic",
              lineHeight: 1.65,
              color: "var(--gray-mid)",
              textWrap: "pretty",
            }}
          >
            «Enviado» quer dizer: a conversa abriu-se e a mensagem saiu. Não diz
            que foi recebida, nem que foi lida. E as leituras da folha contam-se
            no total, nunca por pessoa — a folha é pública e reencaminhável.
          </p>
        </>
      )}

      {/* A DIFUSÃO — três passos e a verdade sobre o que ela entrega. */}
      {difusao && (
        <>
          <div style={{ marginTop: "20px" }}>
            <button
              onClick={() => {
                setDifusao(false);
                setDifArmado(false);
              }}
              className="ligacao"
              style={{ fontSize: "12px", color: "var(--gold-dark)" }}
            >
              ← Uma a uma
            </button>
          </div>
          <div style={{ ...OVERLINE, marginTop: "16px" }}>LISTA DE DIFUSÃO</div>
          <div style={{ margin: "8px 0 0", fontFamily: "'Playfair Display', serif", fontSize: "20px", lineHeight: 1.35 }}>
            Uma mensagem, todos de uma vez.
          </div>

          <div style={{ ...CARTAO, marginTop: "16px", borderRadius: "14px", padding: "16px" }}>
            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ flex: "none", width: "20px", textAlign: "center", fontFamily: "'Playfair Display', serif", fontSize: "14px", color: "var(--gold)" }}>
                1
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", lineHeight: 1.6 }}>
                  Copie a mensagem — sai sem nome, igual para todos.
                </div>
                <button
                  onClick={() => copiarTexto(textoDifusao(comunicado, endereco), "difusao")}
                  className="acao acao--ouro"
                  style={{
                    marginTop: "9px",
                    padding: "10px 16px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: "600",
                  }}
                >
                  {copiadoDif ? "Copiada" : "Copiar a mensagem"}
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: "12px", marginTop: "16px", borderTop: "1px solid #F5ECD7", paddingTop: "14px" }}>
              <div style={{ flex: "none", width: "20px", textAlign: "center", fontFamily: "'Playfair Display', serif", fontSize: "14px", color: "var(--gold)" }}>
                2
              </div>
              <div style={{ flex: 1, fontSize: "13px", lineHeight: 1.6 }}>
                No WhatsApp, crie — ou abra — uma lista de difusão com estas pessoas.
              </div>
            </div>
            <div style={{ display: "flex", gap: "12px", marginTop: "14px", borderTop: "1px solid #F5ECD7", paddingTop: "14px" }}>
              <div style={{ flex: "none", width: "20px", textAlign: "center", fontFamily: "'Playfair Display', serif", fontSize: "14px", color: "var(--gold)" }}>
                3
              </div>
              <div style={{ flex: 1, fontSize: "13px", lineHeight: 1.6 }}>
                Cole, envie, e volte aqui para deixar a lista em dia.
              </div>
            </div>
          </div>

          <p
            style={{
              margin: "12px 0 0",
              fontSize: "11px",
              fontStyle: "italic",
              lineHeight: 1.65,
              color: "var(--gray-mid)",
              textWrap: "pretty",
            }}
          >
            A difusão só entrega a quem tem o número da casa guardado nos
            contactos. Quem não tiver, não recebe — e não há aviso: na dúvida,
            essa pessoa vai melhor uma a uma.
          </p>

          <div style={{ ...OVERLINE, marginTop: "18px" }}>QUEM ENTRA · {porEnviar.length}</div>
          <div
            style={{
              ...CARTAO,
              marginTop: "8px",
              maxHeight: "150px",
              overflowY: "auto",
              padding: "12px 14px",
              fontSize: "12px",
              lineHeight: 1.8,
              color: "var(--gray-mid)",
            }}
          >
            {porEnviar.map((l) => l.nome).join(" · ") || "Ninguém por enviar."}
          </div>

          {porEnviar.length > 0 &&
            (difArmado ? (
              <button
                onClick={marcarTodos}
                disabled={ocupado}
                className="acao"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  marginTop: "16px",
                  padding: "13px",
                  border: "1px solid #FECACA",
                  borderRadius: "12px",
                  backgroundColor: "#FEF2F2",
                  color: "#DC2626",
                  fontSize: "13px",
                  fontWeight: "600",
                }}
              >
                Confirmar? Marca os {porEnviar.length} de uma vez.
              </button>
            ) : (
              <button
                onClick={marcarTodos}
                disabled={ocupado}
                className="acao acao--ouro"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  marginTop: "16px",
                  padding: "13px",
                  borderRadius: "12px",
                  fontSize: "13px",
                  fontWeight: "600",
                }}
              >
                Marcar os {porEnviar.length} como enviados
              </button>
            ))}
        </>
      )}

      {/* A FICHA — a gaveta de baixo, para ajustar o texto de uma pessoa. */}
      <div
        onClick={fecharFicha}
        aria-hidden={!fichaAberta}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(26,26,26,0.28)",
          opacity: fichaAberta ? 1 : 0,
          pointerEvents: fichaAberta ? "auto" : "none",
          transition: reduzido ? "none" : "opacity 200ms ease",
          zIndex: 90,
        }}
      />
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 95,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={ficha ? `Mensagem para ${ficha.nome}` : "Mensagem"}
          style={{
            width: "100%",
            maxWidth: "560px",
            boxSizing: "border-box",
            backgroundColor: "var(--cream)",
            border: "1px solid #F0E6D0",
            borderBottom: "none",
            borderRadius: "18px 18px 0 0",
            boxShadow: "0 -12px 48px rgba(0,0,0,0.12)",
            padding: "10px 20px 24px",
            transform: fichaAberta ? "translateY(0)" : "translateY(105%)",
            transition: reduzido ? "none" : "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)",
            pointerEvents: fichaAberta ? "auto" : "none",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ width: "36px", height: "4px", borderRadius: "999px", backgroundColor: "#E8DCC0" }} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginTop: "14px" }}>
            <div style={{ fontSize: "15px", fontWeight: "600" }}>{ficha?.nome}</div>
            <div style={{ fontSize: "11.5px", color: "var(--gray-mid)" }}>{ficha?.ancora}</div>
          </div>
          <textarea
            value={rascunhoFicha}
            onChange={(e) => setRascunhoFicha(e.target.value)}
            rows={4}
            className="caixa-texto"
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginTop: "12px",
              padding: "12px 13px",
              fontFamily: "Inter, sans-serif",
              fontSize: "13px",
              lineHeight: 1.6,
              borderRadius: "12px",
              resize: "none",
              minHeight: "104px",
            }}
          />
          <p style={{ margin: "9px 0 0", fontSize: "11px", fontStyle: "italic", color: "var(--gray-mid)" }}>
            A conversa abre com esta mensagem já escrita — falta só, lá, o toque de enviar.
          </p>
          <button
            onClick={enviarDaFicha}
            disabled={ocupado}
            className="acao acao--cheia"
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginTop: "12px",
              padding: "14px",
              borderRadius: "12px",
              fontSize: "13.5px",
              fontWeight: "600",
            }}
          >
            Abrir a conversa e enviar
          </button>
          <button
            onClick={fecharFicha}
            className="acao"
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginTop: "8px",
              padding: "11px",
              border: "none",
              borderRadius: "10px",
              background: "transparent",
              color: "var(--gray-mid)",
              fontSize: "12.5px",
              fontWeight: "600",
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
