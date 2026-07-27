import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { documentosDoEvento, marcarPassoDocumento } from "../../lib/documentos";
import { estadoFormularioDoEvento } from "../../lib/invites";
import { formatarEuros } from "./orcamentos/orcamentoConfig";
import { Icone } from "./Navegacao";
import { Esqueleto } from "./acabamento";

// ============================================================
// DocumentosEvento — o separador Documentos da página do evento.
//
// Cinco botões com o mesmo peso não diziam qual era o próximo. Aqui
// são cinco LINHAS com peso diferente: o próximo gesto em destaque
// dourado, o que já está feito em verde discreto, o que ainda não tem
// vez em cinzento.
//
// O estado de cada documento é o percurso gerar → enviar → assinar,
// com data. "Gerado" deduz-se (a linha existe em `documentos`);
// enviado e assinado são carimbos explícitos (migração 030) — a app
// não tem como saber que ela carregou em enviar no WhatsApp dela.
// ============================================================

const TIPOS = {
  orcamento: { nome: "Orçamento", icone: "orcamento", ultimo: "aceite" },
  proposta: { nome: "Projecto", icone: "proposta", ultimo: "assinado" },
  contrato: { nome: "Contrato", icone: "contrato", ultimo: "assinado" },
};

// O passo por fazer diz o VERBO ("assinar"), o já feito diz o estado
// ("assinado"). Cortar o "o" final e colar "ar" dava "assinadar" — o
// português não se conjuga por aritmética de sufixos, por isso o par
// vem escrito.
const POR_FAZER = { assinado: "assinar", aceite: "aceitar" };

// Que documento é o próximo gesto, a partir da fase do funil — o mesmo
// eixo que a Jornada mostra, para as duas peças nunca discordarem.
const DOC_DA_FASE = {
  interessado: "orcamento",
  orcamento: "orcamento",
  sinal: "orcamento",
  cliente: "proposta",
  projecto: "contrato",
};

const dataCurta = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "2-digit",
      })
    : null;

const desdeQuando = (iso) => {
  if (!iso) return null;
  const horas = Math.round((Date.now() - new Date(iso)) / 3600000);
  if (horas < 1) return "actualizada agora mesmo";
  if (horas < 24) return `actualizada há ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? "actualizada ontem" : `actualizada há ${dias} dias`;
};

// Uma bolinha do percurso: cheia (feito), anel (a seguir), vazia.
// O visto salta com mola quando se marca À FRENTE DOS OLHOS — marcar
// "assinado" é um marco do negócio, merece confirmação à altura.
function Passo({ rotulo, feito, aSeguir, data, onClick }) {
  const primeiraPintura = useRef(true);
  useEffect(() => {
    primeiraPintura.current = false;
  }, []);
  const reduzirMovimento = useReducedMotion();

  const conteudo = (
    <>
      <span
        style={{
          width: "14px",
          height: "14px",
          borderRadius: "50%",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          backgroundColor: feito ? "var(--gold)" : aSeguir ? "white" : "#F1EBDD",
          border: aSeguir ? "2px solid var(--gold)" : "none",
          transition: "background-color 300ms ease",
        }}
      >
        {feito && (
          <motion.span
            initial={
              primeiraPintura.current || reduzirMovimento
                ? false
                : { scale: 0, opacity: 0 }
            }
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 520, damping: 26 }}
            style={{ display: "inline-flex" }}
          >
            <svg width="8" height="8" viewBox="0 0 24 24">
              <path
                d="M4.5 12.5l5 5 10-10"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.span>
        )}
      </span>
      <span
        style={{
          fontSize: "11px",
          color: feito
            ? "var(--gray-mid)"
            : aSeguir
              ? "var(--gold-dark)"
              : "#B0A88F",
          fontWeight: aSeguir ? "600" : "400",
          whiteSpace: "nowrap",
        }}
      >
        {rotulo}
        {data ? ` ${data}` : ""}
      </span>
    </>
  );

  if (!onClick) {
    return (
      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {conteudo}
      </span>
    );
  }
  return (
    <button
      onClick={onClick}
      title={feito ? "Desmarcar" : `Marcar como ${rotulo}`}
      className="toca"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        border: "none",
        background: "none",
        padding: 0,
      }}
    >
      {conteudo}
    </button>
  );
}

function Linha({ icone, titulo, sufixo, descricao, passos, accoes, tom }) {
  const destaque = tom === "destaque";
  const adormecido = tom === "adormecido";

  return (
    <div
      style={{
        backgroundColor: destaque ? "#FFFDF6" : "white",
        border: destaque
          ? "1.5px solid var(--gold)"
          : "1px solid #F0E6D0",
        borderRadius: "14px",
        padding: "16px 20px",
        display: "grid",
        gridTemplateColumns: "34px minmax(220px, 1fr) auto auto",
        gap: "18px",
        alignItems: "center",
        boxShadow: destaque ? "0 4px 14px rgba(201,168,76,0.14)" : "none",
      }}
    >
      <span style={{ color: adormecido ? "#DCD3C0" : "var(--gold)" }}>
        <Icone nome={icone} tamanho={22} />
      </span>
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            fontSize: "15px",
            margin: "0 0 3px",
            color: adormecido ? "var(--gray-mid)" : "var(--charcoal)",
          }}
        >
          {titulo}
          {sufixo && (
            <span style={{ fontSize: "12px", color: "#9B9B9B" }}> {sufixo}</span>
          )}
        </p>
        <p
          style={{
            fontSize: "12px",
            margin: 0,
            color: destaque
              ? "var(--gold-dark)"
              : adormecido
                ? "#9B9B9B"
                : "var(--gray-mid)",
          }}
        >
          {descricao}
        </p>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          flexWrap: "wrap",
        }}
      >
        {passos}
      </div>
      <div
        style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}
      >
        {accoes}
      </div>
    </div>
  );
}

// A identidade (cor, hover, foco) vive nas classes .acao--* do
// index.css; aqui fica a medida — e o realce do botão principal.
const classeBotao = (variante) =>
  variante === "principal"
    ? "acao acao--cheia"
    : variante === "ouro"
      ? "acao acao--ouro"
      : "acao acao--neutra";

const medidaBotao = (variante) => ({
  padding: variante === "principal" ? "9px 16px" : "8px 14px",
  borderRadius: "10px",
  fontSize: variante === "principal" ? "12.5px" : "12px",
  fontWeight: variante === "principal" ? "600" : "500",
  whiteSpace: "nowrap",
  ...(variante === "principal"
    ? { boxShadow: "0 4px 12px rgba(201,168,76,0.30)" }
    : {}),
});

export default function DocumentosEvento({
  submissao,
  invites = [],
  onGerarDocumento,
  onVerFormulario,
  onCriarFormulario,
  realce = null,
  onRealceConsumido,
  onContagem,
}) {
  const [documentos, setDocumentos] = useState([]);
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState(null);
  // A aterragem da pílula/etapa da Jornada: a linha em causa acende —
  // gerada ou por gerar, é a mesma linha (a afordância de criação é o
  // caso normal: o próximo gesto é quase sempre criar o que falta).
  const [pulsando, setPulsando] = useState(null); // "orcamento"|"proposta"|"contrato"|"formulario"
  const linhaRefs = useRef({});

  const submissionId = submissao?.id;

  useEffect(() => {
    if (!realce || !carregado) return;
    // Um realce de OUTRO separador não se consome aqui — com os
    // separadores todos montados em simultâneo, roubá-lo era apagar a
    // aterragem antes de o destino certo a fazer.
    const alvo = ["orcamento", "proposta", "contrato", "formulario"].includes(
      realce.alvo,
    )
      ? realce.alvo
      : null;
    if (!alvo) return;
    setPulsando(alvo);
    linhaRefs.current[alvo]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    setTimeout(() => setPulsando(null), 2600);
    if (onRealceConsumido) onRealceConsumido();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realce, carregado]);

  // A contagem do separador: quantos documentos já foram gerados.
  useEffect(() => {
    if (carregado && onContagem) onContagem(documentos.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregado, documentos]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const docs = await documentosDoEvento(submissionId);
        if (cancelado) return;
        setDocumentos(docs);
        setCarregado(true);
      } catch (e) {
        if (cancelado) return;
        console.error(e);
        setErro(
          "Não foi possível ler o estado dos documentos (a migração 030 já correu?).",
        );
        setCarregado(true);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [submissionId]);

  const porTipo = useMemo(() => {
    const mapa = {};
    for (const d of documentos) mapa[d.tipo] = d;
    return mapa;
  }, [documentos]);

  const proximoDoc = DOC_DA_FASE[submissao?.fase] || null;

  // O estado da linha Formulário vem da fonte única (lib/invites) — a
  // mesma conta da Jornada e do drawer. "preenchido-noutro" é o rasto
  // de um convite que duplicou: apontado cá, respostas noutro evento.
  const { convite, estado: estadoFormulario } = estadoFormularioDoEvento(
    invites,
    submissionId,
  );
  const formularioFeito = estadoFormulario === "preenchido";

  const alternarPasso = async (doc, passo) => {
    const coluna = passo === "enviado" ? "enviado_em" : "assinado_em";
    try {
      const atualizado = await marcarPassoDocumento(
        doc.id,
        passo,
        doc[coluna] ? null : new Date(),
      );
      setDocumentos((atuais) =>
        atuais.map((d) => (d.id === atualizado.id ? { ...d, ...atualizado } : d)),
      );
    } catch (e) {
      console.error(e);
      setErro("Não foi possível guardar o estado. Tenta outra vez.");
    }
  };

  if (!carregado) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Esqueleto key={i} h={74} r={14} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {erro && (
        <p
          style={{
            fontSize: "12.5px",
            color: "#B91C1C",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "10px",
            padding: "10px 14px",
            margin: 0,
          }}
        >
          {erro}
        </p>
      )}

      {/* Briefing — sempre disponível, sem percurso: é a folha do
          evento, não um documento que se gera e envia. */}
      <Linha
        icone="documentos"
        titulo="Briefing"
        descricao={`A folha do evento · ${
          desdeQuando(submissao?.updated_at) || "sempre a par do evento"
        } · /briefing/:id em favoritos`}
        passos={
          <span
            style={{
              fontSize: "11px",
              padding: "4px 11px",
              borderRadius: "999px",
              backgroundColor: "#FEF9EC",
              color: "var(--gold-dark)",
              border: "1px solid var(--gold-light)",
              fontWeight: "500",
              whiteSpace: "nowrap",
            }}
          >
            Sempre disponível
          </span>
        }
        accoes={
          <button
            onClick={() => window.open(`/briefing/${submissionId}`, "_blank")}
            className={classeBotao("ouro")}
            style={medidaBotao("ouro")}
          >
            Abrir folha →
          </button>
        }
      />

      {/* Formulário — o percurso vive nos convites, não em `documentos` */}
      <div
        ref={(el) => (linhaRefs.current.formulario = el)}
        className={pulsando === "formulario" ? "realce-pulso" : undefined}
        style={{ borderRadius: "14px" }}
      >
      <Linha
        icone="formularios"
        titulo="Formulário"
        descricao={
          estadoFormulario === "nenhum"
            ? "Ainda não foi criado"
            : estadoFormulario === "preenchido"
              ? `Criado ${dataCurta(convite.created_at)} · respondido pela cliente`
              : estadoFormulario === "preenchido-noutro"
                ? "As respostas ficaram noutro evento (convite antigo sem alvo) — cria um formulário novo apontado a este evento"
                : `Criado ${dataCurta(convite.created_at)} · à espera de resposta`
        }
        tom={estadoFormulario === "nenhum" ? "adormecido" : undefined}
        passos={
          <>
            <Passo
              rotulo="criado"
              data={convite ? dataCurta(convite.created_at) : null}
              feito={!!convite}
              aSeguir={estadoFormulario === "nenhum"}
            />
            <Passo rotulo="preenchido" feito={formularioFeito} />
          </>
        }
        accoes={
          estadoFormulario === "pendente" || estadoFormulario === "preenchido" ? (
            <button
              onClick={() => onVerFormulario && onVerFormulario(submissao)}
              className={classeBotao("ouro")}
              style={medidaBotao("ouro")}
            >
              {formularioFeito ? "Ver respostas" : "Preencher"}
            </button>
          ) : (
            <button
              onClick={() => onCriarFormulario && onCriarFormulario(submissao)}
              className={classeBotao("ouro")}
              style={medidaBotao("ouro")}
            >
              Criar formulário
            </button>
          )
        }
      />
      </div>

      {Object.entries(TIPOS).map(([tipo, cfg]) => {
        const doc = porTipo[tipo];
        const eProximo = proximoDoc === tipo && !doc;
        const tom = eProximo ? "destaque" : !doc ? "adormecido" : undefined;

        return (
          <div
            key={tipo}
            ref={(el) => (linhaRefs.current[tipo] = el)}
            className={pulsando === tipo ? "realce-pulso" : undefined}
            style={{ borderRadius: "14px" }}
          >
          <Linha
            icone={cfg.icone}
            titulo={cfg.nome}
            descricao={
              doc
                ? [
                    tipo === "orcamento" && submissao?.valor_acordado
                      ? formatarEuros(submissao.valor_acordado)
                      : null,
                    doc.assinado_em
                      ? `${cfg.ultimo} em ${dataCurta(doc.assinado_em)}`
                      : doc.enviado_em
                        ? `enviado em ${dataCurta(doc.enviado_em)}`
                        : "gerado, por enviar",
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : eProximo
                  ? "É o gesto a seguir."
                  : "Ainda não tem vez"
            }
            tom={tom}
            passos={
              <>
                <Passo
                  rotulo={doc ? `gerado ${dataCurta(doc.created_at)}` : "gerar"}
                  feito={!!doc}
                  aSeguir={eProximo}
                />
                <Passo
                  rotulo={doc?.enviado_em ? "enviado" : "enviar"}
                  data={doc?.enviado_em ? dataCurta(doc.enviado_em) : null}
                  feito={!!doc?.enviado_em}
                  onClick={doc ? () => alternarPasso(doc, "enviado") : undefined}
                />
                <Passo
                  rotulo={
                    doc?.assinado_em
                      ? cfg.ultimo
                      : POR_FAZER[cfg.ultimo] || cfg.ultimo
                  }
                  data={doc?.assinado_em ? dataCurta(doc.assinado_em) : null}
                  feito={!!doc?.assinado_em}
                  onClick={
                    doc ? () => alternarPasso(doc, "assinado") : undefined
                  }
                />
              </>
            }
            accoes={
              <button
                onClick={() =>
                  onGerarDocumento && onGerarDocumento(submissao, tipo)
                }
                className={classeBotao(
                  eProximo ? "principal" : doc ? "ouro" : "neutro",
                )}
                style={medidaBotao(
                  eProximo ? "principal" : doc ? "ouro" : "neutro",
                )}
              >
                {doc ? "Abrir" : `Preparar ${cfg.nome.toLowerCase()}`}
              </button>
            }
          />
          </div>
        );
      })}
    </div>
  );
}
