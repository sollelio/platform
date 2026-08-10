import { useEffect, useMemo, useState } from "react";
import { useCampoDocumento as useRascunho } from "./DocumentoProvider";
import { obterDocumento, assinarPelaCasa } from "../../../lib/documentos";
import { getPublicacoes } from "../../../lib/portal";
import { LOGO_CASA as logoUrl, FONTE_ASSINATURA_CASA } from "../../../lib/casa";
import {
  EMPRESA,
  CONTRATO_INTRO,
  CLAUSULAS,
  COMPOSICAO_LUGAR_SUGERIDA,
  dataPorExtenso,
  valorPorExtensoPT,
} from "./contratoConfig";
import { formatarEuros, parsearValor } from "./orcamentoConfig";

// ============================================================
// GerarContrato — formulário dos dados variáveis + pré-visualização
// fiel ao contrato da Do Luxo à Mesa, imprimível (window.print()).
// Suporta 1 ou 2 contraentes (cliente único ou casal).
//
// prefill (opcional) — dados do evento vindos do getDadosParaDocumento
// (botão 📃 no drawer do evento). Alimenta só os useState iniciais:
// o componente é remontado pelo AdminPage (via key) quando o contexto
// muda, por isso não precisa de useEffect. Tudo continua editável.
// Nos casais, o NIF do cliente pré-preenche o 1.º contraente; o 2.º
// fica para a Nádia completar.
//
// O valor por extenso é gerado automaticamente (valorPorExtensoPT)
// sempre que o valor muda — mas o campo continua editável, para a
// Nádia poder afinar a redação se quiser.
// ============================================================

let seq = 0;
const novoContraente = (base = {}) => ({
  uid: `c_${Date.now()}_${seq++}`,
  nome: "",
  nif: "",
  ...base,
});

// Secção de serviços adicionais: descrição + itens (repetível)
const novaSeccaoExtra = (base = {}) => ({
  uid: `se_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  titulo: "",
  itens: "",
  ...base,
});

// O dia de calendário LOCAL de um timestamptz — o slice UTC da string ISO
// datava a assinatura da véspera a oeste de Greenwich (a mesma lição do
// diaLocalISO do portal).
const diaLocal = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function GerarContrato({ prefill = null, ativo = true }) {
  // Rascunho persistente: cada documento (evento ou manual) tem o seu
  const rid = `contrato:${prefill?.submissionId || "manual"}`;
  const submissionId = prefill?.submissionId || null;

  // ── As assinaturas na folha (074) ──────────────────────────────────
  // A linha do documento (assinado_em, assinado_casa_em/por) e o acto da
  // cliente (portal_actos, acto 'assinou' — o digital com código, ou o
  // papel confirmado, distinguidos pelo `ficheiro`). Leitura própria,
  // fora do provider: o provider carrega os DADOS do documento; isto é
  // o percurso, e falhar aqui não pode travar o formulário.
  const [docMeta, setDocMeta] = useState(null);
  const [actoCliente, setActoCliente] = useState(null);
  // Mudou o evento sem remontar: o que era de um não fala pelo outro.
  // Reset DURANTE o render (o padrão da casa para estado preso a uma
  // prop) — num efeito, o percurso antigo pintava um quadro no novo.
  const [idVisto, setIdVisto] = useState(submissionId);
  if (idVisto !== submissionId) {
    setIdVisto(submissionId);
    setDocMeta(null);
    setActoCliente(null);
  }

  useEffect(() => {
    let cancelado = false;
    obterDocumento("contrato", submissionId)
      .then((d) => {
        if (!cancelado) setDocMeta(d);
      })
      .catch((e) => {
        console.error("contrato: falha a ler o percurso do documento", e);
      });
    if (submissionId) {
      getPublicacoes(submissionId)
        .then((pubs) => {
          if (cancelado) return;
          const assinaturas = (pubs || [])
            .filter((p) => p.tipo === "contrato")
            .flatMap((p) => p.portal_actos || [])
            .filter((a) => a.acto === "assinou")
            .sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1));
          const acto = assinaturas[0] || null;
          if (acto)
            setActoCliente({
              nome: acto.nome_escrito,
              quando: acto.criado_em,
              papel: !!acto.ficheiro,
            });
        })
        .catch((e) => {
          console.error("contrato: falha a ler os actos da publicação", e);
        });
    }
    return () => {
      cancelado = true;
    };
  }, [submissionId]);

  // 1.º contraente: só com o carimbo NO documento e o nome NO acto — sem
  // acto não há nome, e inventá-lo não é registo.
  const assinaturaCliente =
    docMeta?.assinado_em && actoCliente
      ? {
          nome: actoCliente.nome,
          dia: diaLocal(docMeta.assinado_em),
          papel: actoCliente.papel,
        }
      : null;
  const assinaturaCasa = docMeta?.assinado_casa_em
    ? {
        nome: docMeta.assinado_casa_por,
        dia: diaLocal(docMeta.assinado_casa_em),
      }
    : null;

  // Assinar pela casa. Se o documento ainda não tinha linha na BD quando
  // a folha abriu (provider criou-a entretanto), tenta relê-la antes de
  // desistir — e sem linha nenhuma não há onde pousar a assinatura.
  const assinarCasa = async (nome) => {
    let d = docMeta;
    if (!d) {
      d = await obterDocumento("contrato", submissionId);
      if (!d) throw new Error("SEM_DOCUMENTO");
    }
    const actualizado = await assinarPelaCasa(d.id, nome);
    setDocMeta(actualizado);
  };
  // 1.ª Contraente — cliente(s). Com prefill, os contraentes vêm já
  // resolvidos (casal = 2, restantes eventos = 1).
  // O 3.º elemento é o tranco do documento (ver DocumentoProvider): um
  // contrato assinado no acompanhamento não se edita mais.
  const [contraentes, setContraentes, trancado] = useRascunho(`${rid}:contraentes`, () =>
    prefill?.contraentes?.length
      ? prefill.contraentes.map((c) => novoContraente(c))
      : [novoContraente()],
  );
  const [morada, setMorada] = useRascunho(
    `${rid}:morada`,
    prefill?.morada || "",
  );
  const [contacto, setContacto] = useRascunho(
    `${rid}:contacto`,
    prefill?.contacto || "",
  );

  // Objeto
  const [tipoEvento, setTipoEvento] = useRascunho(
    `${rid}:tipoEvento`,
    prefill ? prefill.tipoEvento || "" : "Casamento",
  );
  const [dataEvento, setDataEvento] = useRascunho(
    `${rid}:dataEvento`,
    prefill?.dataEvento || "",
  );
  const [horaInicio, setHoraInicio] = useRascunho(
    `${rid}:horaInicio`,
    prefill?.horaInicio || "",
  );
  const [horaFim, setHoraFim] = useRascunho(
    `${rid}:horaFim`,
    prefill?.horaFim || "",
  );
  const [local, setLocal] = useRascunho(
    `${rid}:local`,
    prefill?.localCompleto || "",
  );

  // Serviços (texto livre multilinha, pré-preenchido com a composição habitual)
  const [lugares, setLugares] = useRascunho(
    `${rid}:lugares`,
    prefill?.lugares || "",
  );
  const [composicao, setComposicao] = useRascunho(
    `${rid}:composicao`,
    COMPOSICAO_LUGAR_SUGERIDA.join("\n"),
  );
  // Secções de serviços adicionais (descrição + itens, repetíveis).
  // As chaves antigas continuam a ser LIDAS para migrar contratos já
  // gravados no formato de campo único — nada se perde.
  const [servicosExtraLegado] = useRascunho(`${rid}:servicosExtra`, "");
  const [servicosExtraTituloLegado] = useRascunho(
    `${rid}:servicosExtraTitulo`,
    "",
  );
  const [seccoesExtra, setSeccoesExtra] = useRascunho(
    `${rid}:seccoesExtra`,
    () => {
      const titulo = (servicosExtraTituloLegado || "").trim();
      const itens = (servicosExtraLegado || "").trim();
      if (titulo || itens)
        return [novaSeccaoExtra({ titulo, itens: servicosExtraLegado })];
      return [novaSeccaoExtra()];
    },
  );

  // Valor — o extenso deriva automaticamente do valor, mas fica editável
  // O arredondamento a cêntimos limpa valores acordados antigos gravados
  // com ruído de vírgula flutuante (ex: 649.99999999999994 → "650").
  const [valor, setValor] = useRascunho(
    `${rid}:valor`,
    prefill?.valor !== undefined && prefill?.valor !== null
      ? String(Math.round(parsearValor(prefill.valor) * 100) / 100)
      : "",
  );
  const [valorExtenso, setValorExtenso] = useRascunho(
    `${rid}:valorExtenso`,
    prefill?.valor ? valorPorExtensoPT(prefill.valor) : "",
  );

  // Assinatura (local + data)
  const [localAssinatura, setLocalAssinatura] = useRascunho(
    `${rid}:localAssinatura`,
    "Ericeira",
  );
  // Data LOCAL, não UTC: `toISOString()` datava o contrato da véspera
  // entre a meia-noite e a 1h do horário de verão.
  const [dataAssinatura, setDataAssinatura] = useRascunho(
    `${rid}:dataAssinatura`,
    (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })(),
  );

  const atualizarContraente = (uid, campos) =>
    setContraentes((prev) =>
      prev.map((c) => (c.uid === uid ? { ...c, ...campos } : c)),
    );

  // Mudar o valor regenera o extenso (a Nádia pode depois afiná-lo à mão).
  // parsearValor aceita vírgula decimal ("1250,50"), que o Number não lê.
  const atualizarValor = (v) => {
    setValor(v);
    setValorExtenso(valorPorExtensoPT(parsearValor(v)));
  };

  // Troca temporária do <title> durante a impressão (o browser usa-o
  // nos cabeçalhos; o @page margin 0 no CSS já os elimina de qualquer
  // forma — cinto e suspensórios).
  const imprimir = () => {
    const tituloAnterior = document.title;
    const nomePrimeiro = contraentes[0]?.nome;
    document.title = `Contrato — ${nomePrimeiro || EMPRESA.designacao}`;
    window.print();
    document.title = tituloAnterior;
  };

  return (
    <div>
      {/* O TRANCO (fase 3): assinado no acompanhamento, o contrato ficou
          prova. A base recusa alterações (gatilho da 057) e o provider nem
          as escreve — este aviso diz-o antes de ela perder trabalho a
          escrever num formulário que já não guarda. Imprimir continua a
          funcionar: o que se imprime é o que foi assinado. */}
      {trancado && (
        <div
          style={{
            backgroundColor: "#F0FDF4",
            border: "1px solid #BBF7D0",
            borderRadius: "12px",
            padding: "13px 16px",
            marginBottom: "16px",
            fontSize: "12.5px",
            lineHeight: 1.65,
            color: "#166534",
          }}
        >
          <strong style={{ fontWeight: 600 }}>
            Este contrato foi assinado no acompanhamento e está trancado.
          </strong>{" "}
          As alterações aqui deixam de ser guardadas. Se houver um erro,
          faz-se um contrato novo; este fica como prova do que foi assinado.
        </div>
      )}
      {/* O contrato é multi-página: mantém @page margin 2cm (margens
          bonitas em TODAS as páginas). Os cabeçalhos do browser
          resolvem-se com o swap do título + desligar "Headers and
          footers" uma vez no diálogo de impressão (fica memorizado). */}
      {ativo && (
        <style>{`
        @media print {
          body * { visibility: hidden; }
          .contrato-doc, .contrato-doc * { visibility: visible; }
          .contrato-doc {
            position: absolute; left: 0; top: 0; width: 100%;
            box-shadow: none !important; max-width: none !important;
            margin: 0 !important; padding: 0 !important;
          }
          .no-print { display: none !important; }
          @page { size: A4; margin: 2cm; }
        }
      `}</style>
      )}

      <div
        className="no-print"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "24px",
          marginBottom: "24px",
        }}
      >
        {/* ===== FORMULÁRIO ===== */}
        <div>
          <h3 style={h3Style}>Contraente(s) — Cliente</h3>
          {/* O aviso do contraente em falta.
              Um contrato de casal com um contraente só NÃO parece partido:
              o documento muda para a redacção do singular e lê-se como um
              contrato completo. Já saíram três assim. Sem nada no papel a
              assinalar a falta, o aviso tem de estar aqui, antes de imprimir.
              Desaparece sozinho ao acrescentar o 2.º — depende do estado
              vivo, não do prefill. Avisa, não bloqueia. */}
          {prefill?.modeloDeCasal && contraentes.length < 2 && (
            <div
              style={{
                backgroundColor: "#FEF3E2",
                border: "1px solid #F0D9B5",
                borderRadius: "10px",
                padding: "12px 14px",
                marginBottom: "12px",
                fontSize: "12.5px",
                lineHeight: 1.6,
                color: "#92400E",
              }}
            >
              Este é um evento de casal e o contrato vai sair com{" "}
              <strong>um contraente só</strong> — no singular, sem nada a
              assinalar que falta uma parte. Se são dois, acrescente o 2.º
              cliente aqui abaixo antes de imprimir.
            </div>
          )}
          {contraentes.map((c, i) => (
            <div
              key={c.uid}
              style={{
                backgroundColor: "#FBF7EF",
                borderRadius: "12px",
                padding: "14px",
                marginBottom: "10px",
                border: "1px solid #F0E6D0",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                }}
              >
                <span style={miniLabelGold}>
                  {contraentes.length > 1 ? `Cliente ${i + 1}` : "Cliente"}
                </span>
                {contraentes.length > 1 && (
                  <button
                    onClick={() =>
                      setContraentes((prev) =>
                        prev.filter((x) => x.uid !== c.uid),
                      )
                    }
                    style={linkRemover}
                  >
                    remover
                  </button>
                )}
              </div>
              <Campo label="Nome completo">
                <input
                  style={inputStyle}
                  value={c.nome}
                  onChange={(e) =>
                    atualizarContraente(c.uid, { nome: e.target.value })
                  }
                  placeholder="ex: Brenda Lorrana Lima da Silva"
                />
              </Campo>
              <Campo label="NIF">
                <input
                  style={inputStyle}
                  value={c.nif}
                  onChange={(e) =>
                    atualizarContraente(c.uid, { nif: e.target.value })
                  }
                  placeholder="ex: 299 217 833"
                />
              </Campo>
            </div>
          ))}
          {contraentes.length < 2 && (
            <button
              onClick={() =>
                setContraentes((prev) => [...prev, novoContraente()])
              }
              style={btnAdd}
            >
              + Adicionar 2.º cliente
            </button>
          )}

          <Campo label="Morada (do cliente)">
            <input
              style={inputStyle}
              value={morada}
              onChange={(e) => setMorada(e.target.value)}
              placeholder="ex: Rua Maria Telles Mendes 14, 8º C"
            />
          </Campo>
          <Campo label="Contacto">
            <input
              style={inputStyle}
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
              placeholder="ex: 926 687 792"
            />
          </Campo>

          <h3 style={h3Style}>Objeto do contrato</h3>
          <Campo label="Tipo de evento">
            <input
              style={inputStyle}
              value={tipoEvento}
              onChange={(e) => setTipoEvento(e.target.value)}
              placeholder="ex: Casamento, Batizado, Aniversário..."
            />
          </Campo>
          <Campo label="Data do evento">
            <input
              type="date"
              style={inputStyle}
              value={dataEvento}
              onChange={(e) => setDataEvento(e.target.value)}
            />
          </Campo>
          <div style={{ display: "flex", gap: "12px" }}>
            <Campo label="Hora início" flex={1}>
              <input
                type="time"
                style={inputStyle}
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
              />
            </Campo>
            <Campo label="Hora fim" flex={1}>
              <input
                type="time"
                style={inputStyle}
                value={horaFim}
                onChange={(e) => setHoraFim(e.target.value)}
              />
            </Campo>
          </div>
          <Campo label="Local (completo)">
            <input
              style={inputStyle}
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="ex: Av. Nossa Senhora do Cabo 101, 2750-374 Cascais"
            />
          </Campo>

          <h3 style={h3Style}>Serviços</h3>
          <Campo label="Nº de lugares">
            <input
              type="text"
              inputMode="numeric"
              style={inputStyle}
              value={lugares}
              onChange={(e) => setLugares(e.target.value)}
              placeholder="ex: 60"
            />
          </Campo>
          <Campo label="Composição por lugar (um item por linha)">
            <textarea
              style={{ ...inputStyle, minHeight: "120px", resize: "vertical" }}
              value={composicao}
              onChange={(e) => setComposicao(e.target.value)}
            />
          </Campo>
          {seccoesExtra.map((sec, i) => (
            <div
              key={sec.uid}
              style={{
                backgroundColor: "#FBF7EF",
                borderRadius: "12px",
                padding: "14px",
                marginBottom: "10px",
                border: "1px solid #F0E6D0",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                }}
              >
                <span style={miniLabelGold}>
                  Serviços adicionais
                  {seccoesExtra.length > 1 ? ` ${i + 1}` : ""}
                </span>
                {seccoesExtra.length > 1 && (
                  <button
                    onClick={() =>
                      setSeccoesExtra((prev) =>
                        prev.filter((x) => x.uid !== sec.uid),
                      )
                    }
                    style={linkRemover}
                  >
                    remover
                  </button>
                )}
              </div>
              <Campo label="Descrição da linha (opcional)">
                <input
                  style={inputStyle}
                  value={sec.titulo}
                  onChange={(e) =>
                    setSeccoesExtra((prev) =>
                      prev.map((x) =>
                        x.uid === sec.uid
                          ? { ...x, titulo: e.target.value }
                          : x,
                      ),
                    )
                  }
                  placeholder="ex: Serviços Adicionais"
                />
              </Campo>
              <Campo label="Um item por linha (opcional)">
                <textarea
                  style={{
                    ...inputStyle,
                    minHeight: "70px",
                    resize: "vertical",
                  }}
                  value={sec.itens}
                  onChange={(e) =>
                    setSeccoesExtra((prev) =>
                      prev.map((x) =>
                        x.uid === sec.uid ? { ...x, itens: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="ex: Espaço Fotografável dos Noivos&#10;Painéis decorativos"
                />
              </Campo>
            </div>
          ))}
          <button
            onClick={() =>
              setSeccoesExtra((prev) => [...prev, novaSeccaoExtra()])
            }
            style={btnAdd}
          >
            + Adicionar serviços adicionais
          </button>

          <h3 style={h3Style}>Valor e assinatura</h3>
          <div style={{ display: "flex", gap: "12px" }}>
            <Campo label="Valor (€)" flex={1}>
              <input
                type="text"
                inputMode="decimal"
                style={inputStyle}
                value={valor}
                onChange={(e) => atualizarValor(e.target.value)}
                placeholder="650"
              />
            </Campo>
            <Campo label="Valor por extenso (automático, editável)" flex={2}>
              <input
                style={inputStyle}
                value={valorExtenso}
                onChange={(e) => setValorExtenso(e.target.value)}
                placeholder="seiscentos e cinquenta euros"
              />
            </Campo>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <Campo label="Local de assinatura" flex={1}>
              <input
                style={inputStyle}
                value={localAssinatura}
                onChange={(e) => setLocalAssinatura(e.target.value)}
              />
            </Campo>
            <Campo label="Data de assinatura" flex={1}>
              <input
                type="date"
                style={inputStyle}
                value={dataAssinatura}
                onChange={(e) => setDataAssinatura(e.target.value)}
              />
            </Campo>
          </div>
        </div>

        {/* ===== AÇÕES ===== */}
        <div>
          <div
            style={{
              backgroundColor: "#FBF7EF",
              borderRadius: "12px",
              padding: "18px",
              border: "1px solid var(--gold-light)",
              position: "sticky",
              top: "16px",
            }}
          >
            <p
              style={{
                fontSize: "13px",
                color: "var(--gray-mid)",
                margin: "0 0 16px 0",
                lineHeight: 1.5,
              }}
            >
              A pré-visualização abaixo é o contrato tal como sai impresso.
              Confere e carrega em imprimir para guardar como PDF.
            </p>
            <button onClick={imprimir} style={btnImprimir}>
              🖨 Imprimir / Guardar PDF
            </button>
          </div>
        </div>
      </div>

      {/* ===== DOCUMENTO ===== */}
      <ContratoDocumento
        contraentes={contraentes}
        morada={morada}
        contacto={contacto}
        tipoEvento={tipoEvento}
        dataEvento={dataEvento}
        horaInicio={horaInicio}
        horaFim={horaFim}
        local={local}
        lugares={lugares}
        composicao={composicao}
        seccoesExtra={seccoesExtra}
        valor={valor}
        valorExtenso={valorExtenso}
        localAssinatura={localAssinatura}
        dataAssinatura={dataAssinatura}
        assinaturaCliente={assinaturaCliente}
        assinaturaCasa={assinaturaCasa}
        onAssinarCasa={assinarCasa}
      />
    </div>
  );
}

// ------------------------------------------------------------
// O DOCUMENTO — replica o contrato da Do Luxo à Mesa
// ------------------------------------------------------------
function ContratoDocumento({
  contraentes,
  morada,
  contacto,
  tipoEvento,
  dataEvento,
  horaInicio,
  horaFim,
  local,
  lugares,
  composicao,
  seccoesExtra,
  valor,
  valorExtenso,
  localAssinatura,
  dataAssinatura,
  assinaturaCliente = null,
  assinaturaCasa = null,
  onAssinarCasa = null,
}) {
  // Monta o corpo dos serviços (cláusula 2.ª) a partir dos campos
  const servicosTexto = useMemo(() => {
    const linhas = [];
    const n = lugares || "___";
    linhas.push(`Decoração de Mesas - ${n} Lugares Completos`);
    linhas.push("");
    linhas.push("Composição por Lugar");
    composicao
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((l) => linhas.push(`• ${l}`));
    (seccoesExtra || []).forEach((sec) => {
      const titulo = (sec.titulo || "").trim();
      const itens = (sec.itens || "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (!titulo && itens.length === 0) return;
      linhas.push("");
      if (titulo) linhas.push(titulo);
      itens.forEach((l) => linhas.push(`• ${l}`));
    });
    return linhas.join("\n");
  }, [lugares, composicao, seccoesExtra]);

  const substituir = (texto) =>
    texto
      .replace("{TIPO_EVENTO}", tipoEvento || "___")
      .replace("{DATA_EXTENSO}", dataPorExtenso(dataEvento))
      .replace("{LOCAL}", local || "___")
      .replace("{HORA_INICIO}", horaInicio ? `${horaInicio}h` : "___")
      .replace("{HORA_FIM}", horaFim ? `${horaFim}h` : "___")
      .replace("{VALOR}", valor ? formatarEuros(valor) : "___")
      .replace("{VALOR_EXTENSO}", valorExtenso ? valorExtenso : "___");

  return (
    <div
      className="contrato-doc"
      style={{
        backgroundColor: "white",
        maxWidth: "760px",
        margin: "0 auto",
        padding: "56px 64px",
        boxShadow: "0 2px 24px rgba(0,0,0,0.08)",
        fontFamily: "'Times New Roman', Times, serif",
        color: "#1A1A1A",
        fontSize: "13px",
        lineHeight: 1.7,
      }}
    >
      {/* Logo + título */}
      <div style={{ textAlign: "center", marginBottom: "24px" }}>
        <img
          src={logoUrl}
          alt={EMPRESA.designacao}
          style={{ width: "90px", height: "auto", margin: "0 auto 16px" }}
        />
        <h1
          style={{
            fontSize: "16px",
            fontWeight: "700",
            letterSpacing: "0.05em",
            margin: "0 0 4px 0",
          }}
        >
          CONTRATO DE PRESTAÇÃO DE SERVIÇOS
        </h1>
        <p style={{ fontStyle: "italic", margin: 0, color: "#444" }}>
          {EMPRESA.designacao}
        </p>
      </div>

      {/* Partes */}
      <p style={{ fontWeight: "700", margin: "24px 0 12px 0" }}>DAS PARTES</p>

      <p style={{ fontWeight: "700", margin: "0 0 8px 0" }}>1.ª CONTRAENTE</p>
      {contraentes.length > 1 ? (
        <>
          <p style={{ margin: "0 0 4px 0", fontWeight: "600" }}>Clientes:</p>
          {contraentes.map((c) => (
            <p key={c.uid} style={{ margin: "0 0 4px 0" }}>
              {c.nome || "___"}, <strong>NIF:</strong> {c.nif || "___"}
            </p>
          ))}
        </>
      ) : (
        <p style={{ margin: "0 0 4px 0" }}>
          <strong>Nome do Cliente:</strong> {contraentes[0]?.nome || "___"}
        </p>
      )}
      {contraentes.length === 1 && (
        <p style={{ margin: "0 0 4px 0" }}>
          <strong>NIF:</strong> {contraentes[0]?.nif || "___"}
        </p>
      )}
      <p style={{ margin: "0 0 4px 0" }}>
        <strong>Morada:</strong> {morada || "___"}
      </p>
      <p style={{ margin: "0 0 16px 0" }}>
        <strong>Contacto:</strong> {contacto || "___"}
      </p>

      <p style={{ fontWeight: "700", margin: "0 0 8px 0" }}>2.ª CONTRAENTE</p>
      <p style={{ margin: "0 0 4px 0" }}>
        <strong>Nome:</strong> {EMPRESA.nome}
      </p>
      <p style={{ margin: "0 0 4px 0" }}>
        <strong>Morada:</strong> {EMPRESA.morada}
      </p>
      <p style={{ margin: "0 0 16px 0" }}>
        <strong>NIF:</strong> {EMPRESA.nif}
      </p>

      {/* Intro */}
      {CONTRATO_INTRO.split("\n\n").map((par, i) => (
        <p key={i} style={{ margin: "0 0 12px 0", textAlign: "justify" }}>
          {par}
        </p>
      ))}

      {/* Cláusulas */}
      {CLAUSULAS.map((cl) => (
        <div key={cl.n} style={{ marginTop: "20px" }}>
          <p style={{ fontWeight: "700", margin: "0 0 2px 0" }}>
            CLÁUSULA {cl.n}
          </p>
          <p style={{ fontWeight: "700", margin: "0 0 8px 0" }}>{cl.titulo}</p>
          {cl.ehServicos
            ? servicosTexto.split("\n").map((linha, i) => (
                <p
                  key={i}
                  style={{
                    margin: linha === "" ? "8px 0" : "0 0 2px 0",
                    fontWeight:
                      linha !== "" && !linha.startsWith("•") ? "600" : "400",
                  }}
                >
                  {linha}
                </p>
              ))
            : substituir(cl.corpo)
                .split("\n\n")
                .map((par, i) => (
                  <p
                    key={i}
                    style={{ margin: "0 0 8px 0", textAlign: "justify" }}
                  >
                    {par.split("\n").map((linha, j) => (
                      <span key={j}>
                        {linha}
                        {j < par.split("\n").length - 1 && <br />}
                      </span>
                    ))}
                  </p>
                ))}
        </div>
      ))}

      {/* Assinaturas */}
      <p style={{ margin: "32px 0 40px 0" }}>
        {localAssinatura || "___"}, {dataPorExtenso(dataAssinatura)}
      </p>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "40px",
          marginTop: "20px",
        }}
      >
        {/* As assinaturas na folha (074): quando existem, o nome pousa em
            cima da linha — como uma assinatura pousa — e a prova diz-se
            numa linha pequena por baixo. Quando não existem, a linha fica
            em branco, como sempre esteve. A IMPRESSÃO sai igual: é o
            mesmo render (só o gesto de assinar pela casa é no-print). */}
        <div style={{ flex: 1, textAlign: "center" }}>
          {/* A faixa do nome reserva-se SEMPRE, assinada ou não: sem isto,
              a coluna assinada crescia e empurrava a sua linha para baixo
              da outra — duas linhas de assinatura a alturas diferentes. */}
          {/* Altura FIXA, não mínima: o itálico do nome media mais do que
              a faixa e a coluna assinada continuava a crescer uns pixéis.
              Com altura igual dos dois lados, as linhas nivelam sempre. */}
          <div style={{ height: "28px", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: "5px", boxSizing: "border-box" }}>
            {assinaturaCliente && (
              <p style={{ margin: 0, fontStyle: "italic", lineHeight: 1 }}>
                {assinaturaCliente.nome}
              </p>
            )}
          </div>
          <div style={{ borderTop: "1px solid #1A1A1A", paddingTop: "6px" }}>
            1.º Contraente
          </div>
          {assinaturaCliente && (
            <p style={{ margin: "5px 0 0", fontSize: "10.5px", color: "#444" }}>
              {dataPorExtenso(assinaturaCliente.dia)} ·{" "}
              {assinaturaCliente.papel
                ? "assinatura em papel confirmada pela casa"
                : "assinado digitalmente no acompanhamento · código verificado"}
            </p>
          )}
        </div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ height: "28px", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: "5px", boxSizing: "border-box" }}>
            {/* A letra caligráfica é SÓ da assinatura da casa (a do
                cliente fica em itálico, como está). Os ascendentes
                podem passar da faixa — uma assinatura real também
                passa; a altura fixa continua a nivelar as linhas. */}
            {assinaturaCasa && (
              <p style={{ margin: 0, fontFamily: FONTE_ASSINATURA_CASA, fontSize: "22px", lineHeight: 1 }}>
                {assinaturaCasa.nome}
              </p>
            )}
          </div>
          <div style={{ borderTop: "1px solid #1A1A1A", paddingTop: "6px" }}>
            2.ª Contraente
          </div>
          {assinaturaCasa ? (
            <p style={{ margin: "5px 0 0", fontSize: "10.5px", color: "#444" }}>
              {dataPorExtenso(assinaturaCasa.dia)} · assinado pela casa, com
              sessão autenticada
            </p>
          ) : (
            onAssinarCasa && <AssinarPelaCasa onAssinar={onAssinarCasa} />
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// AssinarPelaCasa — o gesto discreto por baixo da linha da 2.ª
// contraente. Confirmação inline (nunca window.confirm), com o nome do
// 2.º contraente do próprio documento pré-preenchido e editável. Todo o
// bloco é no-print: no papel só saem as assinaturas, nunca botões.
// ------------------------------------------------------------
function AssinarPelaCasa({ onAssinar }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(EMPRESA.nome);
  const [aAssinar, setAAssinar] = useState(false);
  const [erro, setErro] = useState(null);

  const confirmar = async () => {
    if (aAssinar) return;
    if (nome.trim().length < 3) {
      setErro("Escreva o nome de quem assina pela casa.");
      return;
    }
    setAAssinar(true);
    setErro(null);
    try {
      await onAssinar(nome.trim());
      // Assinado: o pai re-renderiza com a assinatura e este bloco sai.
    } catch (e) {
      console.error(e);
      setErro(
        /SEM_DOCUMENTO/.test(e?.message || "")
          ? "O contrato ainda não está guardado na base — escreva primeiro os dados."
          : "Não foi possível assinar. Verifique a ligação e tente novamente.",
      );
      setAAssinar(false);
    }
  };

  if (!aberto) {
    return (
      <div className="no-print" style={{ marginTop: "10px" }}>
        <button onClick={() => setAberto(true)} style={btnAssinarCasa}>
          Assinar pela casa
        </button>
      </div>
    );
  }

  return (
    <div
      className="no-print"
      style={{
        marginTop: "10px",
        textAlign: "left",
        backgroundColor: "#FBF7EF",
        border: "1px solid #F0E6D0",
        borderRadius: "10px",
        padding: "12px 14px",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <p
        style={{
          margin: "0 0 8px",
          fontSize: "11.5px",
          lineHeight: 1.6,
          color: "var(--gray-mid)",
        }}
      >
        Fica no registo com a sessão autenticada e a data de hoje. Não mexe no
        conteúdo do contrato.
      </p>
      <input
        value={nome}
        onChange={(e) => {
          setNome(e.target.value);
          setErro(null);
        }}
        aria-label="Nome de quem assina pela casa"
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "8px 10px",
          borderRadius: "8px",
          border: "1.5px solid var(--gold-light)",
          fontSize: "12.5px",
          fontFamily: "Inter, sans-serif",
          outline: "none",
          backgroundColor: "white",
        }}
      />
      {erro && (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: "11.5px",
            lineHeight: 1.55,
            color: "#B91C1C",
          }}
        >
          {erro}
        </p>
      )}
      <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
        <button
          onClick={confirmar}
          disabled={aAssinar}
          style={{
            ...btnAssinarCasa,
            backgroundColor: "var(--gold)",
            color: "white",
            border: "1.5px solid var(--gold)",
            opacity: aAssinar ? 0.6 : 1,
            cursor: aAssinar ? "wait" : "pointer",
          }}
        >
          {aAssinar ? "A assinar…" : "Confirmar a assinatura"}
        </button>
        <button
          onClick={() => {
            setAberto(false);
            setErro(null);
          }}
          style={{
            ...btnAssinarCasa,
            color: "var(--gray-mid)",
            border: "1.5px solid var(--hairline, #F0E6D0)",
          }}
        >
          Deixar por assinar
        </button>
      </div>
    </div>
  );
}

// ---- helpers de estilo ----
function Campo({ label, children, flex }) {
  return (
    <div style={{ marginBottom: "12px", flex }}>
      <label style={miniLabel}>{label}</label>
      {children}
    </div>
  );
}

const h3Style = {
  fontSize: "15px",
  fontFamily: "Playfair Display, serif",
  color: "var(--charcoal)",
  margin: "22px 0 12px 0",
};
const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "8px",
  border: "1.5px solid var(--gold-light)",
  fontSize: "13px",
  outline: "none",
  fontFamily: "Inter, sans-serif",
  boxSizing: "border-box",
  backgroundColor: "white",
};
const miniLabel = {
  fontSize: "11px",
  fontWeight: "600",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--charcoal)",
  display: "block",
  marginBottom: "5px",
};
const miniLabelGold = {
  fontSize: "11px",
  fontWeight: "700",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--gold)",
};
const linkRemover = {
  background: "none",
  border: "none",
  color: "#DC2626",
  cursor: "pointer",
  fontSize: "12px",
};
const btnAssinarCasa = {
  padding: "7px 14px",
  borderRadius: "999px",
  fontSize: "11.5px",
  fontWeight: "600",
  fontFamily: "Inter, sans-serif",
  border: "1.5px solid var(--gold-light)",
  color: "var(--gold-dark)",
  backgroundColor: "white",
  cursor: "pointer",
};
const btnAdd = {
  padding: "9px 16px",
  borderRadius: "999px",
  fontSize: "12px",
  fontWeight: "600",
  border: "1.5px solid var(--gold)",
  color: "var(--gold)",
  backgroundColor: "white",
  cursor: "pointer",
  marginBottom: "12px",
};
const btnImprimir = {
  width: "100%",
  padding: "12px",
  borderRadius: "10px",
  fontSize: "13px",
  fontWeight: "600",
  border: "none",
  backgroundColor: "var(--gold)",
  color: "white",
  cursor: "pointer",
};
