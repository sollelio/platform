import { useEffect, useMemo, useState } from "react";
import { documentosDoEvento, marcarPassoDocumento } from "../../lib/documentos";
import { formatarEuros } from "./orcamentos/orcamentoConfig";
import { Icone } from "./Navegacao";

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
function Passo({ rotulo, feito, aSeguir, data, onClick }) {
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
        }}
      >
        {feito && (
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
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        border: "none",
        background: "none",
        padding: 0,
        cursor: "pointer",
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

const botao = (variante) => ({
  padding: variante === "principal" ? "9px 16px" : "8px 14px",
  borderRadius: "10px",
  fontSize: variante === "principal" ? "12.5px" : "12px",
  fontWeight: variante === "principal" ? "600" : "500",
  cursor: "pointer",
  whiteSpace: "nowrap",
  ...(variante === "principal"
    ? {
        border: "none",
        backgroundColor: "var(--gold)",
        color: "white",
        boxShadow: "0 4px 12px rgba(201,168,76,0.30)",
      }
    : variante === "ouro"
      ? {
          border: "1.5px solid var(--gold)",
          backgroundColor: "white",
          color: "var(--gold)",
        }
      : {
          border: "1.5px solid var(--gold-light)",
          backgroundColor: "white",
          color: "var(--gray-mid)",
        }),
});

export default function DocumentosEvento({
  submissao,
  invites = [],
  onGerarDocumento,
  onVerFormulario,
  onCriarFormulario,
}) {
  const [documentos, setDocumentos] = useState([]);
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState(null);

  const submissionId = submissao?.id;

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

  const convite = invites.find(
    (i) => i.submission_id === submissionId || i.submission_alvo_id === submissionId,
  );
  const formularioFeito = !!(convite && convite.submission_id);

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
      <p style={{ fontSize: "13px", color: "var(--gray-mid)" }}>
        A ler os documentos…
      </p>
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
            style={botao("ouro")}
          >
            Abrir folha →
          </button>
        }
      />

      {/* Formulário — o percurso vive nos convites, não em `documentos` */}
      <Linha
        icone="formularios"
        titulo="Formulário"
        descricao={
          !convite
            ? "Ainda não foi enviado à cliente"
            : formularioFeito
              ? `Enviado ${dataCurta(convite.created_at)} · respondido pela cliente`
              : `Enviado ${dataCurta(convite.created_at)} · à espera de resposta`
        }
        tom={!convite ? "adormecido" : undefined}
        passos={
          <>
            <Passo
              rotulo="enviado"
              data={convite ? dataCurta(convite.created_at) : null}
              feito={!!convite}
              aSeguir={!convite}
            />
            <Passo rotulo="preenchido" feito={formularioFeito} />
          </>
        }
        accoes={
          !convite ? (
            <button
              onClick={() => onCriarFormulario && onCriarFormulario(submissao)}
              style={botao("ouro")}
            >
              Enviar formulário
            </button>
          ) : (
            <button
              onClick={() => onVerFormulario && onVerFormulario(submissao)}
              style={botao("ouro")}
            >
              {formularioFeito ? "Ver respostas" : "Preencher"}
            </button>
          )
        }
      />

      {Object.entries(TIPOS).map(([tipo, cfg]) => {
        const doc = porTipo[tipo];
        const eProximo = proximoDoc === tipo && !doc;
        const tom = eProximo ? "destaque" : !doc ? "adormecido" : undefined;

        return (
          <Linha
            key={tipo}
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
                style={botao(eProximo ? "principal" : doc ? "ouro" : "neutro")}
              >
                {doc ? "Abrir" : `Preparar ${cfg.nome.toLowerCase()}`}
              </button>
            }
          />
        );
      })}
    </div>
  );
}
