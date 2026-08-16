import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence, animate } from "framer-motion";
import { useCampoDocumento as useRascunho } from "./DocumentoProvider";
import { logoDe, rodapeMarcaOrcamento } from "../../../lib/casa";
import { useCasa } from "../../CasaProvider";
import { uploadImagemReferencia } from "../../../lib/captacao";
import { guardarValorAcordado } from "../../../lib/clientes";
import PainelDeslocacao from "./PainelDeslocacao";
import {
  CATALOGO_SERVICOS,
  CONDICOES_ORCAMENTO,
  LOGISTICA_ENTRE_MORADAS,
  NOTA_RODAPE_ORCAMENTO,
  VALIDADE_ORCAMENTO_DIAS,
  formatarEuros,
  formatarDataPT,
  parsearValor,
  inputStyle,
  miniLabel,
} from "./orcamentoConfig";

// Substitui {N} pelo nº de lugares (ou remove o marcador se vazio)
const resolverDescricao = (template, lugares) => {
  if (!template) return "";
  if (!template.includes("{N}")) return template;
  const n = String(lugares || "").trim();
  return n ? template.replace("{N}", n) : template.replace("{N}", "___");
};

// ============================================================
// GerarOrcamento — formulário de dados do evento + linhas de serviço,
// e pré-visualização imprimível que replica o template da Nádia.
// A geração de PDF é via window.print() (só a área do documento imprime).
//
// prefill (opcional) — dados do evento vindos do getDadosParaDocumento
// (botão 💰 no drawer do evento). Alimenta só os useState iniciais:
// o componente é remontado pelo AdminPage (via key) quando o contexto
// muda, por isso não precisa de useEffect. Tudo continua editável.
// ============================================================

// ------------------------------------------------------------
// A logística entre moradas (25€/evento) dilui-se pelas linhas do
// orçamento: o cliente nunca a vê — nem linha própria, nem nota — só os
// serviços ligeiramente mais cheios. O Pacote Buffet nunca absorve
// (decisão da casa, custe o que custar) e a Deslocação também não: é o
// número que choca, e engordá-lo iria contra a razão da própria regra.
// ------------------------------------------------------------
const totalDaLinha = (l) =>
  Math.round(parsearValor(l.valor) * parsearValor(l.qtd) * 100) / 100;

const ehElegivel = (l) =>
  l.servicoId !== "pacote_buffet" &&
  l.servicoId !== "deslocacao" &&
  totalDaLinha(l) > 0;

// Reparte a logística proporcionalmente aos totais das linhas elegíveis
// (a linha de 800€ absorve mais do que a de 100€), em euros inteiros por
// linha; o resto do arredondamento cai na elegível de maior valor, para
// a soma das parcelas ser EXACTAMENTE o total da logística. Devolve
// { total, parcelas } — parcelas ALINHADAS POR ÍNDICE com `linhas`, 0
// nas não-elegíveis — ou null sem elegíveis (e aí os 25€ ficam mesmo de
// fora: o aviso no editor di-lo à Nádia; o buffet nunca os absorve).
const repartirLogistica = (linhas) => {
  const totais = linhas.map((l) => (ehElegivel(l) ? totalDaLinha(l) : 0));
  const soma = totais.reduce((a, b) => a + b, 0);
  if (soma <= 0) return null;
  // floor garante parcelas ≤ à proporção exacta: o resto nunca é negativo.
  const parcelas = totais.map((t) =>
    Math.floor((LOGISTICA_ENTRE_MORADAS * t) / soma),
  );
  const resto = LOGISTICA_ENTRE_MORADAS - parcelas.reduce((a, b) => a + b, 0);
  if (resto > 0) {
    let maior = 0;
    totais.forEach((t, i) => {
      if (t > totais[maior]) maior = i;
    });
    parcelas[maior] += resto;
  }
  return { total: LOGISTICA_ENTRE_MORADAS, parcelas };
};

let seqLinha = 0;
const novaLinha = (base = {}) => ({
  uid: `l_${Date.now()}_${seqLinha++}`,
  descricao: "",
  inclui: [],
  qtd: 1,
  valor: "",
  lugares: "", // nº de lugares (só para serviços que escalam com lugares)
  temLugares: false,
  ...base,
});

export default function GerarOrcamento({
  prefill = null,
  ativo = true,
  onDadosMudaram,
}) {
  const casa = useCasa();
  // Rascunho persistente: cada documento (evento ou manual) tem o seu
  const rid = `orcamento:${prefill?.submissionId || "manual"}`;
  // Dados do cliente/evento — pré-preenchidos quando se chega de um
  // evento; senão, os defaults manuais de sempre.
  const [cliente, setCliente] = useRascunho(
    `${rid}:cliente`,
    prefill?.nomeCliente || "",
  );
  const [tipoEvento, setTipoEvento] = useRascunho(
    `${rid}:tipoEvento`,
    prefill ? prefill.tipoEvento || "" : "Casamento",
  );
  const [dataEvento, setDataEvento] = useRascunho(
    `${rid}:dataEvento`,
    prefill?.dataEvento || "",
  );
  const [local, setLocal] = useRascunho(`${rid}:local`, prefill?.local || "");
  const [subtitulo, setSubtitulo] = useRascunho(`${rid}:subtitulo`, ""); // linha opcional (ex: "Decoração desenvolvida...")

  // Linhas de serviço
  const [linhas, setLinhas] = useRascunho(`${rid}:linhas`, [novaLinha()]);

  // Imagens de referência DO CLIENTE — pré-preenchidas da captação;
  // a Nádia pode remover ou juntar as que chegaram por Instagram.
  // Entram no PDF como páginas de referências, a seguir ao orçamento.
  const [imagens, setImagens] = useRascunho(
    `${rid}:imagens`,
    prefill?.imagensReferencia || [],
  );
  const [carregandoImg, setCarregandoImg] = useState(false);
  // Falhas de upload/gravação falam aqui — a regra da casa proíbe alert()
  const [erroAcao, setErroAcao] = useState(null);
  // Guardar o total como valor acordado do evento (alimenta o funil)
  const [aGuardarValor, setAGuardarValor] = useState(false);
  const [valorGuardado, setValorGuardado] = useState(false);
  const inputImagens = useRef(null);

  const adicionarImagens = async (e) => {
    const ficheiros = Array.from(e.target.files || []).filter((f) =>
      f.type.startsWith("image/"),
    );
    e.target.value = "";
    if (ficheiros.length === 0) return;
    setErroAcao(null);
    setCarregandoImg(true);
    try {
      const novas = [];
      for (const f of ficheiros) {
        novas.push(await uploadImagemReferencia(f));
      }
      setImagens((prev) => [...prev, ...novas]);
    } catch (err) {
      console.error(err);
      setErroAcao("Não foi possível carregar a imagem. Tenta novamente.");
    }
    setCarregandoImg(false);
  };

  const removerImagem = (idx) =>
    setImagens((prev) => prev.filter((_, i) => i !== idx));

  const hoje = new Date().toISOString().slice(0, 10);

  // A repartição da logística deriva SEMPRE das linhas — recalcula a
  // cada edição; null quando nenhuma linha pode absorver.
  const logistica = useMemo(() => repartirLogistica(linhas), [linhas]);

  // __logistica viaja nos dados do documento como outro campo qualquer:
  // o useRascunho entrega-o ao DocumentoProvider (→ documentos.dados →
  // o instantâneo que o dlm_portal_publicar congela → o portal). Os
  // valores das linhas ficam CRUS — a diluição só se soma a quem mostra.
  // O valor guardado é persistência, nunca fonte de verdade: por isso o
  // efeito só escreve quando a derivação muda de facto (a comparação por
  // JSON evita o laço escrita → re-render → escrita).
  const [logisticaGuardada, setLogisticaGuardada] = useRascunho(
    `${rid}:__logistica`,
    null,
  );
  useEffect(() => {
    if (JSON.stringify(logisticaGuardada) !== JSON.stringify(logistica)) {
      setLogisticaGuardada(logistica);
    }
  }, [logistica, logisticaGuardada, setLogisticaGuardada]);

  // Há valor em jogo mas nenhuma linha pode absorver a logística (tudo
  // vive no buffet/deslocação): os 25€ ficam de fora e a Nádia tem de o
  // saber — avisa-se, nunca se bloqueia.
  const logisticaDeFora = useMemo(
    () => !logistica && linhas.some((l) => totalDaLinha(l) > 0),
    [logistica, linhas],
  );

  // Arredondado a cêntimos: evita totais tipo 649.99999999999994 (que
  // apareceriam no botão de guardar e ficariam gravados na BD).
  // Com linhas elegíveis, o total é a soma crua + os 25€ da logística —
  // é ESTE número que a folha imprime e que «guardar como valor
  // acordado» grava (alimenta o funil e o contrato).
  const total = useMemo(() => {
    const soma = linhas.reduce((acc, l) => {
      const v = parsearValor(l.valor);
      const q = parsearValor(l.qtd);
      return acc + v * q;
    }, 0);
    return Math.round((soma + (logistica ? logistica.total : 0)) * 100) / 100;
  }, [linhas, logistica]);

  // Se o total mudar depois de guardado, volta a pedir para guardar
  useEffect(() => {
    setValorGuardado(false);
  }, [total]);

  const atualizarLinha = (uid, campos) =>
    setLinhas((prev) =>
      prev.map((l) => (l.uid === uid ? { ...l, ...campos } : l)),
    );

  const escolherServico = (uid, servicoId) => {
    const serv = CATALOGO_SERVICOS.find((s) => s.id === servicoId);
    if (!serv) return;
    if (serv.ehLivre) {
      atualizarLinha(uid, {
        servicoId,
        descricao: "",
        inclui: [],
        temLugares: false,
      });
      return;
    }
    // Se o serviço escala com lugares, a descrição resolve-se com o nº atual.
    const linha = linhas.find((l) => l.uid === uid);
    const lugares = linha?.lugares || "";
    atualizarLinha(uid, {
      servicoId,
      descricao: resolverDescricao(serv.descricaoTemplate, lugares),
      descricaoTemplate: serv.descricaoTemplate,
      inclui: [...serv.inclui],
      temLugares: serv.temLugares,
      // Deslocação: o Valor (€) passa a ser calculado pelo painel, nunca
      // multiplicado — a Qtd fica presa a 1 (ver PainelDeslocacao.jsx).
      ...(servicoId === "deslocacao" ? { qtd: 1 } : {}),
    });
  };

  // Substitui {N} pelo nº de lugares na descrição
  const atualizarLugares = (uid, lugares) => {
    const linha = linhas.find((l) => l.uid === uid);
    if (!linha) return;
    const template = linha.descricaoTemplate || linha.descricao;
    atualizarLinha(uid, {
      lugares,
      descricao: resolverDescricao(template, lugares),
    });
  };

  const removerLinha = (uid) =>
    setLinhas((prev) => prev.filter((l) => l.uid !== uid));

  // Durante a impressão o browser usa o <title> da app nos cabeçalhos;
  // trocamo-lo temporariamente para o nome certo (e o @page margin 0
  // no CSS elimina os cabeçalhos por completo — cinto e suspensórios).
  const imprimir = () => {
    const tituloAnterior = document.title;
    document.title = `Orçamento — ${cliente || casa.nome}`;
    window.print();
    document.title = tituloAnterior;
  };

  return (
    <div>
      {erroAcao && (
        <p
          style={{
            fontSize: "12.5px",
            color: "#B91C1C",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "10px",
            padding: "10px 14px",
            marginBottom: "14px",
          }}
        >
          ⚠ {erroAcao}
        </p>
      )}
      {/* ===== Estilos de impressão =====
          @page margin 0 elimina os cabeçalhos/rodapés automáticos do
          browser (título + URL); as margens passam a ser o padding dos
          próprios "cartões-página". Cada imagem de referência é uma
          página inteira (.pagina-ref). */}
      {ativo && (
        <style>{`
        @media print {
          body * { visibility: hidden; }
          .area-impressao, .area-impressao * { visibility: visible; }
          .area-impressao { position: absolute; left: 0; top: 0; width: 100%; }
          .orcamento-doc {
            box-shadow: none !important; border: none !important;
            border-radius: 0 !important; max-width: none !important;
            margin: 0 !important; padding: 1.5cm !important;
          }
          .pagina-ref {
            page-break-before: always;
            height: 26.5cm; width: 100%;
            margin: 0 !important; max-width: none !important;
            padding: 1.5cm; box-sizing: border-box;
            display: flex; align-items: center; justify-content: center;
            box-shadow: none !important; border-radius: 0 !important;
          }
          .pagina-ref img { max-width: 100% !important; max-height: 100% !important; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 0; }
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
        {/* ===== COLUNA ESQUERDA: FORMULÁRIO ===== */}
        <div>
          <h3
            style={{
              fontSize: "15px",
              fontFamily: "Playfair Display, serif",
              color: "var(--charcoal)",
              margin: "0 0 16px 0",
            }}
          >
            Dados do orçamento
          </h3>

          <Campo label="Cliente">
            <input
              style={inputStyle}
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="ex: Brenda Lorrana"
            />
          </Campo>

          <div style={{ display: "flex", gap: "12px" }}>
            <Campo label="Tipo de evento" flex={1}>
              <input
                style={inputStyle}
                value={tipoEvento}
                onChange={(e) => setTipoEvento(e.target.value)}
                placeholder="ex: Casamento"
              />
            </Campo>
            <Campo label="Data do evento" flex={1}>
              <input
                type="date"
                style={inputStyle}
                value={dataEvento}
                onChange={(e) => setDataEvento(e.target.value)}
              />
            </Campo>
          </div>

          <Campo label="Local">
            <input
              style={inputStyle}
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="ex: Guia Lounge Cascais"
            />
          </Campo>

          <Campo label="Subtítulo (opcional)">
            <input
              style={inputStyle}
              value={subtitulo}
              onChange={(e) => setSubtitulo(e.target.value)}
              placeholder="ex: Decoração desenvolvida dentro da estética Do Luxo à Mesa."
            />
          </Campo>

          <Campo label="Imagens de referência do cliente">
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {imagens.map((url, i) => (
                <div key={url + i} style={{ position: "relative" }}>
                  <img
                    src={url}
                    alt={`Referência ${i + 1}`}
                    style={{
                      width: "58px",
                      height: "58px",
                      objectFit: "cover",
                      borderRadius: "10px",
                      border: "1px solid var(--gold-light)",
                      display: "block",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removerImagem(i)}
                    aria-label="Remover imagem"
                    style={{
                      position: "absolute",
                      top: "-6px",
                      right: "-6px",
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      border: "none",
                      backgroundColor: "var(--charcoal)",
                      color: "white",
                      fontSize: "10px",
                      lineHeight: 1,
                      cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => inputImagens.current?.click()}
                disabled={carregandoImg}
                aria-label="Adicionar imagens"
                style={{
                  width: "58px",
                  height: "58px",
                  borderRadius: "10px",
                  border: "1.5px dashed var(--gold)",
                  backgroundColor: "white",
                  color: "var(--gold)",
                  fontSize: "20px",
                  cursor: carregandoImg ? "wait" : "pointer",
                }}
              >
                {carregandoImg ? "…" : "+"}
              </button>
            </div>
            <input
              ref={inputImagens}
              type="file"
              accept="image/*"
              multiple
              onChange={adicionarImagens}
              style={{ display: "none" }}
            />
          </Campo>

          <h3
            style={{
              fontSize: "15px",
              fontFamily: "Playfair Display, serif",
              color: "var(--charcoal)",
              margin: "24px 0 12px 0",
            }}
          >
            Serviços
          </h3>

          {linhas.map((l, idx) => (
            <LinhaServicoEditor
              key={l.uid}
              linha={l}
              indice={idx + 1}
              podeRemover={linhas.length > 1}
              moradaPrefill={prefill?.localCompleto}
              parcelaLogistica={logistica ? logistica.parcelas[idx] : 0}
              onEscolherServico={(sid) => escolherServico(l.uid, sid)}
              onAtualizar={(campos) => atualizarLinha(l.uid, campos)}
              onAtualizarLugares={(n) => atualizarLugares(l.uid, n)}
              onRemover={() => removerLinha(l.uid)}
            />
          ))}

          <button
            onClick={() => setLinhas((prev) => [...prev, novaLinha()])}
            style={{
              marginTop: "8px",
              padding: "9px 16px",
              borderRadius: "999px",
              fontSize: "12px",
              fontWeight: "600",
              border: "1.5px solid var(--gold)",
              color: "var(--gold)",
              backgroundColor: "white",
              cursor: "pointer",
            }}
          >
            + Adicionar linha
          </button>
        </div>

        {/* ===== COLUNA DIREITA: dica + imprimir ===== */}
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
                color: "var(--charcoal)",
                margin: "0 0 6px 0",
                fontWeight: "600",
              }}
            >
              Total: {formatarEuros(total)}
            </p>
            {/* Só a Nádia lê isto — a folha impressa não fala de logística. */}
            {logistica && (
              <p
                style={{
                  fontSize: "11px",
                  color: "var(--gray-mid)",
                  margin: "0 0 10px 0",
                  lineHeight: 1.5,
                }}
              >
                inclui {LOGISTICA_ENTRE_MORADAS}€ de logística entre moradas,
                diluídos nos serviços
              </p>
            )}
            {logisticaDeFora && (
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--gold-dark)",
                  backgroundColor: "#FEF9EC",
                  border: "1px solid #E8D5A3",
                  borderRadius: "10px",
                  padding: "10px 12px",
                  margin: "0 0 12px 0",
                  lineHeight: 1.5,
                }}
              >
                ⚠ Não há serviço para absorver os {LOGISTICA_ENTRE_MORADAS}€
                da logística — ficam de fora.
              </p>
            )}
            <p
              style={{
                fontSize: "12px",
                color: "var(--gray-mid)",
                margin: "0 0 16px 0",
                lineHeight: 1.5,
              }}
            >
              A pré-visualização à direita/abaixo é exactamente o que sai
              impresso. Confere e carrega em imprimir para guardar como PDF.
            </p>
            <button
              onClick={imprimir}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "10px",
                fontSize: "13px",
                fontWeight: "600",
                border: "none",
                backgroundColor: "var(--gold)",
                color: "white",
                cursor: "pointer",
              }}
            >
              🖨 Imprimir / Guardar PDF
            </button>
            {prefill?.submissionId && (
              <button
                onClick={async () => {
                  setErroAcao(null);
                  setAGuardarValor(true);
                  try {
                    const { planoDesactualizado } = await guardarValorAcordado(
                      prefill.submissionId,
                      total,
                    );
                    setValorGuardado(true);
                    if (onDadosMudaram) onDadosMudaram();
                    // O valor ficou mesmo guardado — por isso o «✓» acima
                    // acende — mas o plano não acompanhou. Dizem-se as
                    // duas coisas, que as duas são verdade, e nomeia-se o
                    // botão e o sítio: mandar procurar não é avisar.
                    if (planoDesactualizado) {
                      setErroAcao(
                        "O valor ficou guardado, mas o plano de pagamento não actualizou. Abre os Pagamentos do evento e carrega em «Gerar plano de pagamento».",
                      );
                    }
                  } catch (e) {
                    console.error(e);
                    setErroAcao(
                      "Não foi possível guardar o valor. Tenta novamente.",
                    );
                  }
                  setAGuardarValor(false);
                }}
                disabled={aGuardarValor || total <= 0}
                style={{
                  width: "100%",
                  marginTop: "8px",
                  padding: "10px",
                  borderRadius: "10px",
                  fontSize: "12px",
                  fontWeight: "600",
                  border: valorGuardado
                    ? "1.5px solid #16A34A"
                    : "1.5px solid var(--gold)",
                  backgroundColor: valorGuardado ? "#DCFCE7" : "white",
                  color: valorGuardado ? "#166534" : "var(--gold-dark)",
                  cursor: aGuardarValor ? "wait" : "pointer",
                }}
              >
                {aGuardarValor
                  ? "A guardar..."
                  : valorGuardado
                    ? "✓ Valor guardado no evento"
                    : `💾 Guardar ${formatarEuros(total)} como valor acordado`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ===== PRÉ-VISUALIZAÇÃO / ÁREA IMPRIMÍVEL =====
          O orçamento é um cartão-página; cada imagem de referência é
          OUTRO cartão-página abaixo (a divisão visível no ecrã é a
          mesma divisão de páginas do PDF). Sem imagens, nada muda. */}
      <div className="area-impressao">
        <OrcamentoDocumento
          cliente={cliente}
          tipoEvento={tipoEvento}
          dataEvento={dataEvento}
          local={local}
          subtitulo={subtitulo}
          linhas={linhas}
          logistica={logistica}
          total={total}
          dataEmissao={hoje}
        />
        {imagens.map((url, i) => (
          <div
            key={url + i}
            className="pagina-ref"
            style={{
              backgroundColor: "white",
              maxWidth: "800px",
              margin: "24px auto 0",
              padding: "48px 56px",
              boxShadow: "0 2px 24px rgba(0,0,0,0.08)",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={url}
              alt={`Referência do cliente ${i + 1}`}
              style={{
                maxWidth: "100%",
                maxHeight: "70vh",
                objectFit: "contain",
                borderRadius: "4px",
                display: "block",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Editor de uma linha de serviço
// ------------------------------------------------------------
function LinhaServicoEditor({
  linha,
  indice,
  podeRemover,
  moradaPrefill,
  parcelaLogistica = 0,
  onEscolherServico,
  onAtualizar,
  onAtualizarLugares,
  onRemover,
}) {
  const ehDeslocacao = linha.servicoId === "deslocacao";

  // Transição visível quando o painel de deslocação escreve no Valor
  // (€): o número CONTA do valor antigo para o novo, e um anel dourado
  // pulsa à volta do campo — só para esta linha, só quando o valor
  // muda por cálculo (não há animação nos outros serviços).
  const valorAnteriorRef = useRef(parsearValor(linha.valor));
  const [valorExibido, setValorExibido] = useState(() => parsearValor(linha.valor));
  const [pulsar, setPulsar] = useState(0);

  useEffect(() => {
    if (!ehDeslocacao) return;
    const alvo = parsearValor(linha.valor);
    if (alvo === valorAnteriorRef.current) return;
    const inicio = valorAnteriorRef.current;
    valorAnteriorRef.current = alvo;
    setPulsar((n) => n + 1);
    const controls = animate(inicio, alvo, {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: setValorExibido,
    });
    return () => controls.stop();
  }, [linha.valor, ehDeslocacao]);

  return (
    <div
      style={{
        backgroundColor: "#FBF7EF",
        borderRadius: "12px",
        padding: "14px",
        marginBottom: "12px",
        border: "1px solid #F0E6D0",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "10px",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: "700",
            color: "var(--gold)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Linha {indice}
        </span>
        {podeRemover && (
          <button
            onClick={onRemover}
            style={{
              background: "none",
              border: "none",
              color: "#DC2626",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            remover
          </button>
        )}
      </div>

      <select
        value={linha.servicoId || ""}
        onChange={(e) => onEscolherServico(e.target.value)}
        style={{ ...inputStyle, marginBottom: "8px" }}
      >
        <option value="">Escolher serviço...</option>
        {CATALOGO_SERVICOS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.ehLivre ? "— Linha livre —" : s.descricaoTemplate || s.id}
          </option>
        ))}
      </select>

      {linha.temLugares && (
        <div style={{ marginBottom: "8px" }}>
          <label style={miniLabel}>Nº de lugares</label>
          <input
            type="text"
            inputMode="numeric"
            style={inputStyle}
            value={linha.lugares}
            onChange={(e) => onAtualizarLugares(e.target.value)}
            placeholder="ex: 60"
          />
        </div>
      )}

      <input
        style={{ ...inputStyle, marginBottom: "8px" }}
        value={linha.descricao}
        onChange={(e) => onAtualizar({ descricao: e.target.value })}
        placeholder="Descrição da linha"
      />

      {/* O "Inclui:" aparece para QUALQUER serviço escolhido — incluindo
          a Linha livre (que nasce com inclui vazio e sem isto nunca
          ganhava o campo). Linha ainda sem serviço continua sem ele. */}
      {(linha.servicoId || linha.inclui.length > 0) && (
        <textarea
          style={{
            ...inputStyle,
            marginBottom: "8px",
            minHeight: "70px",
            resize: "vertical",
          }}
          value={linha.inclui.join("\n")}
          onChange={(e) => onAtualizar({ inclui: e.target.value.split("\n") })}
          placeholder="Um item por linha (aparece como • no Inclui:)"
        />
      )}

      {/* Painel "Cálculo de deslocação" — só para o serviço Deslocação.
          Trocar de serviço colapsa-o suavemente; ver PainelDeslocacao.jsx.
          onAtualizar é o MESMO callback que qualquer outro campo desta
          linha usa — o painel escreve o Valor (€) por aqui, sem caminho
          paralelo de estado. */}
      <AnimatePresence initial={false}>
        {ehDeslocacao && (
          <motion.div
            key="painel-deslocacao"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "hidden" }}
          >
            <PainelDeslocacao
              linha={linha}
              moradaPrefill={moradaPrefill}
              onAtualizar={onAtualizar}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: "flex", gap: "8px" }}>
        <div style={{ flex: "0 0 70px" }}>
          <label style={miniLabel}>Qtd</label>
          <input
            type="text"
            inputMode="numeric"
            style={{
              ...inputStyle,
              ...(ehDeslocacao
                ? { backgroundColor: "#F3F1EC", color: "var(--gray-mid)", cursor: "not-allowed" }
                : {}),
            }}
            value={ehDeslocacao ? 1 : linha.qtd}
            disabled={ehDeslocacao}
            onChange={(e) => onAtualizar({ qtd: e.target.value })}
          />
        </div>
        <div style={{ flex: 1, position: "relative" }}>
          <label style={miniLabel}>Valor (€)</label>
          {ehDeslocacao && (
            <motion.span
              key={pulsar}
              aria-hidden="true"
              initial={{ boxShadow: "0 0 0 0 rgba(201,168,76,0)" }}
              animate={{
                boxShadow: [
                  "0 0 0 0 rgba(201,168,76,0)",
                  "0 0 0 5px rgba(201,168,76,0.35)",
                  "0 0 0 0 rgba(201,168,76,0)",
                ],
              }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              style={{
                position: "absolute",
                inset: "20px 0 0 0",
                borderRadius: "8px",
                pointerEvents: "none",
              }}
            />
          )}
          <input
            type="text"
            inputMode="decimal"
            readOnly={ehDeslocacao}
            style={{
              ...inputStyle,
              position: "relative",
              ...(ehDeslocacao
                ? { backgroundColor: "#FBF7EF", cursor: "default", fontWeight: "600" }
                : {}),
            }}
            value={ehDeslocacao ? formatarEuros(valorExibido).replace("€", "") : linha.valor}
            onChange={(e) => onAtualizar({ valor: e.target.value })}
            placeholder="0"
          />
        </div>
      </div>

      {/* A parte da logística que esta linha absorve — só a Nádia a vê;
          na folha o valor sai já engordado, sem nota nenhuma. */}
      {parcelaLogistica > 0 && (
        <p
          style={{
            fontSize: "11px",
            color: "var(--gray-mid)",
            fontStyle: "italic",
            margin: "8px 0 0 0",
          }}
        >
          inclui +{parcelaLogistica}€ de logística
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// O DOCUMENTO — replica o template do orçamento da Nádia
// ------------------------------------------------------------
function OrcamentoDocumento({
  cliente,
  tipoEvento,
  dataEvento,
  local,
  subtitulo,
  linhas,
  logistica,
  total,
  dataEmissao,
}) {
  const casa = useCasa();
  // O que a folha MOSTRA por linha: o unitário com a parcela de
  // logística já dentro — nem sombra de «logística» no papel. Com
  // qtd > 1 o unitário ajustado (parcela/qtd) arredonda a cêntimos e o
  // residual desse arredondamento muda-se para outra linha elegível de
  // qtd 1, para a soma das linhas bater com o Total impresso (o caso
  // real da casa é qtd = 1 — os lugares vivem na descrição).
  const valoresFolha = useMemo(() => {
    const vals = linhas.map((l) =>
      l.valor === "" ? null : Math.round(parsearValor(l.valor) * 100) / 100,
    );
    if (!logistica) return vals;
    let residual = 0; // em euros: o que o arredondamento do unitário deixou cair
    linhas.forEach((l, i) => {
      const parcela = logistica.parcelas[i] || 0;
      if (parcela === 0) return;
      const v = parsearValor(l.valor);
      const q = parsearValor(l.qtd) || 1;
      if (q <= 1) {
        vals[i] = Math.round((v + parcela) * 100) / 100;
      } else {
        const unit = Math.round(((v * q + parcela) / q) * 100) / 100;
        vals[i] = unit;
        residual += v * q + parcela - unit * q;
      }
    });
    const residualCents = Math.round(residual * 100);
    if (residualCents !== 0) {
      let alvo = -1;
      linhas.forEach((l, i) => {
        const q = parsearValor(l.qtd) || 1;
        if (ehElegivel(l) && q === 1 && (alvo === -1 || vals[i] > vals[alvo]))
          alvo = i;
      });
      // Sem linha qtd=1 para o acolher, os cêntimos ficam por mostrar —
      // combinação que na prática da casa não existe.
      if (alvo !== -1)
        vals[alvo] = Math.round(vals[alvo] * 100 + residualCents) / 100;
    }
    return vals;
  }, [linhas, logistica]);

  return (
    <div
      className="orcamento-doc"
      style={{
        backgroundColor: "white",
        maxWidth: "800px",
        margin: "0 auto",
        padding: "48px 56px",
        boxShadow: "0 2px 24px rgba(0,0,0,0.08)",
        borderRadius: "4px",
        fontFamily: "Inter, sans-serif",
        color: "#2A2A2A",
      }}
    >
      {/* Cabeçalho */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "24px",
          borderBottom: "2px solid var(--gold)",
          paddingBottom: "20px",
          marginBottom: "28px",
        }}
      >
        <div style={{ flex: "0 0 auto" }}>
          {logoDe(casa) && (
            <img
              src={logoDe(casa)}
              alt={casa.nome}
              style={{ width: "110px", height: "auto", display: "block" }}
            />
          )}
        </div>
        <div
          style={{
            flex: 1,
            borderLeft: "2px solid var(--gold-light)",
            paddingLeft: "24px",
          }}
        >
          <h1
            style={{
              fontFamily: "Playfair Display, serif",
              fontSize: "34px",
              color: "#2A2A2A",
              margin: 0,
              fontWeight: "500",
            }}
          >
            ORÇAMENTO
          </h1>
          <p
            style={{
              fontSize: "13px",
              letterSpacing: "0.1em",
              color: "var(--gray-mid)",
              margin: "2px 0 0 0",
            }}
          >
            PROPOSTA DE SERVIÇOS
          </p>
        </div>
        <div style={{ flex: "0 0 auto", textAlign: "left", fontSize: "12px" }}>
          <p style={{ margin: "0 0 6px 0", color: "#2A2A2A" }}>
            DATA: {formatarDataPT(dataEmissao)}
          </p>
          <p style={{ margin: 0, color: "#2A2A2A" }}>
            VALIDADE: {VALIDADE_ORCAMENTO_DIAS} dias
          </p>
        </div>
      </div>

      {/* Dados do cliente */}
      <div style={{ marginBottom: "28px", fontSize: "14px", lineHeight: 2 }}>
        <p style={{ margin: 0 }}>
          <strong>CLIENTE:</strong> {cliente || "—"}
        </p>
        <p style={{ margin: 0 }}>
          <strong>TIPO DE EVENTO:</strong> {tipoEvento || "—"}
        </p>
        <p style={{ margin: 0 }}>
          <strong>DATA DO EVENTO:</strong> {formatarDataPT(dataEvento) || "—"}
        </p>
        <p style={{ margin: 0 }}>
          <strong>LOCAL:</strong> {local || "—"}
        </p>
        {subtitulo && (
          <p
            style={{
              margin: "10px 0 0 0",
              fontStyle: "italic",
              color: "var(--gray-mid)",
              fontSize: "13px",
            }}
          >
            {subtitulo}
          </p>
        )}
      </div>

      {/* Tabela de serviços */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: "28px",
          fontSize: "13px",
        }}
      >
        <thead>
          <tr style={{ backgroundColor: "#F5F0E6" }}>
            <th style={thStyle}>DESCRIÇÃO</th>
            <th style={{ ...thStyle, width: "60px" }}>QTD</th>
            <th style={{ ...thStyle, width: "90px" }}>VALOR</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={l.uid} style={{ borderBottom: "1px solid #E5DFD0" }}>
              <td style={tdStyle}>
                <strong>{l.descricao || "—"}</strong>
                {l.inclui.filter((i) => i.trim()).length > 0 && (
                  <div style={{ marginTop: "8px" }}>
                    <p
                      style={{
                        margin: "0 0 4px 0",
                        fontWeight: "600",
                        fontSize: "12px",
                      }}
                    >
                      Inclui:
                    </p>
                    {l.inclui
                      .filter((i) => i.trim())
                      .map((item, i) => (
                        <p
                          key={i}
                          style={{
                            margin: "0 0 2px 0",
                            fontSize: "12px",
                            color: "#3A3A3A",
                          }}
                        >
                          • {item}
                        </p>
                      ))}
                  </div>
                )}
              </td>
              <td style={{ ...tdStyle, verticalAlign: "top" }}>{l.qtd}</td>
              <td style={{ ...tdStyle, verticalAlign: "top" }}>
                {valoresFolha[i] !== null ? formatarEuros(valoresFolha[i]) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Condições + Total */}
      <div
        style={{
          display: "flex",
          gap: "32px",
          alignItems: "flex-start",
          marginBottom: "28px",
        }}
      >
        <div style={{ flex: 1 }}>
          <h3
            style={{
              fontFamily: "Playfair Display, serif",
              fontSize: "16px",
              color: "var(--gold-dark)",
              margin: "0 0 12px 0",
              letterSpacing: "0.05em",
            }}
          >
            CONDIÇÕES
          </h3>
          {CONDICOES_ORCAMENTO.map((c, i) => (
            <p
              key={i}
              style={{
                fontSize: "12px",
                margin: "0 0 8px 0",
                color: "#3A3A3A",
              }}
            >
              • {c}
            </p>
          ))}
        </div>
        <div
          style={{
            flex: "0 0 240px",
            border: "1.5px solid var(--gold)",
            borderRadius: "4px",
            padding: "20px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: "12px",
              letterSpacing: "0.08em",
              color: "#3A3A3A",
              margin: "0 0 8px 0",
            }}
          >
            INVESTIMENTO TOTAL
          </p>
          <p
            style={{
              fontFamily: "Playfair Display, serif",
              fontSize: "38px",
              color: "var(--gold-dark)",
              margin: 0,
            }}
          >
            {formatarEuros(total)}
          </p>
        </div>
      </div>

      {/* Nota rodapé */}
      <div
        style={{
          backgroundColor: "#FAFAF8",
          borderRadius: "6px",
          padding: "16px 20px",
          marginBottom: "20px",
        }}
      >
        <p
          style={{
            fontSize: "11px",
            fontStyle: "italic",
            textAlign: "center",
            color: "var(--gray-mid)",
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          {NOTA_RODAPE_ORCAMENTO}
        </p>
      </div>

      <p
        style={{
          textAlign: "center",
          fontSize: "11px",
          letterSpacing: "0.1em",
          color: "var(--gray-mid)",
          margin: 0,
        }}
      >
        {rodapeMarcaOrcamento(casa)}
      </p>
    </div>
  );
}

// ---- estilos partilhados ----
function Campo({ label, children, flex }) {
  return (
    <div style={{ marginBottom: "12px", flex }}>
      <label style={miniLabel}>{label}</label>
      {children}
    </div>
  );
}

const thStyle = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: "12px",
  fontWeight: "700",
  color: "#2A2A2A",
  borderBottom: "2px solid var(--gold-light)",
};

const tdStyle = {
  padding: "12px",
  fontSize: "13px",
  color: "#2A2A2A",
};
