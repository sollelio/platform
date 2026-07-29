import { useState } from "react";
import GerarOrcamento from "./GerarOrcamento";
import GerarContrato from "./GerarContrato";
import GerarProposta from "./GerarProposta";
import { DocumentoProvider } from "./DocumentoProvider";
import { formatarDataPT } from "./orcamentoConfig";
import AvisosBloqueantes from "../AvisosBloqueantes";

// ============================================================
// DocumentosTab — agrupa a geração de Orçamento e Contrato sob o
// separador "Documentos", com sub-navegação interna (sem inchar a
// barra de separadores principal).
//
// contexto (opcional) — dados de um evento para pré-preencher os
//   formulários (vem do botão 💰/📃 no SubmissionDrawer, via AdminPage).
//   Quando existe: abre na sub-aba certa (contexto.tipoDoc), mostra o
//   banner "Pré-preenchido do evento" e passa o prefill aos geradores.
//   NOTA: o AdminPage monta este componente com uma `key` derivada do
//   contexto — mudar de contexto remonta tudo, por isso os useState
//   iniciais chegam. Só é montado com um documento aberto (a entrada
//   da secção é a DocumentosLista); a criação de documentos acontece
//   exclusivamente via Evento → Drawer → botões de documento.
//
// Persistência: cada gerador vive dentro de um DocumentoProvider
// (tipo + evento), que carrega o documento da BD (migrando o rascunho
// local na primeira vez) ANTES de montar o gerador, e grava as
// alterações na BD com debounce. O localStorage continua a ser escrito
// como rede de segurança, mas a BD é a única fonte de verdade.
// ============================================================
export default function DocumentosTab({
  contexto = null,
  ativo = true,
  onDadosMudaram,
  onVoltarAoEvento,
  onTrocarTipo,
}) {
  // Com onTrocarTipo, o sub-separador é DERIVADO do contexto (que vem do
  // URL) em vez de ser estado local: trocar de Orçamento para Contrato
  // muda o endereço, e o endereço volta a descrever o que está no ecrã.
  // Sem ele — o documento "manual", sem evento — mantém-se o estado
  // local de sempre, porque não há URL para o representar.
  const [subLocal, setSubLocal] = useState(contexto?.tipoDoc || "orcamento");
  const sub = onTrocarTipo ? contexto?.tipoDoc || "orcamento" : subLocal;
  const setSub = onTrocarTipo || setSubLocal;
  const submissionId = contexto?.submissionId || null;

  return (
    <div>
      {/* Sub-navegação */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: contexto ? "16px" : "24px",
        }}
      >
        {[
          { id: "orcamento", label: "Orçamento" },
          { id: "contrato", label: "Contrato" },
          { id: "proposta", label: "Projecto" },
        ].map((t) => {
          const ativo = sub === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSub(t.id)}
              style={{
                padding: "9px 22px",
                borderRadius: "999px",
                fontSize: "13px",
                fontWeight: ativo ? "700" : "500",
                border: `1.5px solid ${ativo ? "var(--gold)" : "var(--gold-light)"}`,
                backgroundColor: ativo ? "var(--gold)" : "white",
                color: ativo ? "white" : "var(--charcoal)",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Banner de contexto — só quando se chega vindo de um evento */}
      {contexto && (
        <div
          className="no-print"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            backgroundColor: "#FBF7EF",
            border: "1px solid var(--gold-light)",
            borderRadius: "10px",
            padding: "12px 16px",
            marginBottom: "24px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                fontSize: "10px",
                color: "var(--gold-dark)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                margin: "0 0 2px 0",
              }}
            >
              Pré-preenchido do evento
            </p>
            <p
              style={{
                fontSize: "14px",
                fontWeight: "600",
                color: "var(--charcoal)",
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {contexto.titulo}
              {contexto.tipoEvento ? ` · ${contexto.tipoEvento}` : ""}
              {contexto.dataEvento
                ? ` · ${formatarDataPT(contexto.dataEvento)}`
                : ""}
            </p>
          </div>
            {onVoltarAoEvento && (
              <button
                onClick={onVoltarAoEvento}
                style={{
                  marginLeft: "8px",
                  padding: "6px 14px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  fontWeight: "600",
                  border: "1.5px solid var(--gold)",
                  backgroundColor: "white",
                  color: "var(--gold-dark)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                ← Voltar ao evento
              </button>
            )}
        </div>
      )}

      {/* Os TRÊS geradores ficam sempre montados (escondidos): o que
          se escreveu sobrevive a trocas de sub-aba E de separador.
          O `ativo` liga os estilos de impressão só ao visível.
          Cada um vive no seu DocumentoProvider (tipo + evento), que
          carrega/migra o documento antes de o montar. */}
      <div style={{ display: sub === "orcamento" ? "block" : "none" }}>
        <AvisosBloqueantes pagina="orcamento">
          <DocumentoProvider tipo="orcamento" submissionId={submissionId}>
            <GerarOrcamento
              prefill={contexto}
              ativo={ativo && sub === "orcamento"}
              onDadosMudaram={onDadosMudaram}
            />
          </DocumentoProvider>
        </AvisosBloqueantes>
      </div>
      <div style={{ display: sub === "contrato" ? "block" : "none" }}>
        <DocumentoProvider tipo="contrato" submissionId={submissionId}>
          <GerarContrato
            prefill={contexto}
            ativo={ativo && sub === "contrato"}
          />
        </DocumentoProvider>
      </div>
      <div style={{ display: sub === "proposta" ? "block" : "none" }}>
        <DocumentoProvider tipo="proposta" submissionId={submissionId}>
          <GerarProposta
            prefill={contexto}
            ativo={ativo && sub === "proposta"}
          />
        </DocumentoProvider>
      </div>
    </div>
  );
}