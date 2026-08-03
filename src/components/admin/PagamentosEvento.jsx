import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  registarPagamento,
  apagarPagamento,
  gerarPrevistos,
  resumoPagamentos,
  saldoSinalPendente,
  METODOS_SUGERIDOS,
} from "../../lib/pagamentos";
import { formatarEuros, formatarDataPT } from "./orcamentos/orcamentoConfig";
import { marcarPagamentoFinal, updateFase } from "../../lib/clientes";
import { documentosDoEvento } from "../../lib/documentos";
import { Icone } from "./Navegacao";
import { Convite, useContagemAnimada } from "./acabamento";
import ContribuicaoColetiva from "./ContribuicaoColetiva";
import { CONTRIBUICAO_COLETIVA_ATIVA } from "../../lib/funcionalidades";

// ============================================================
// PagamentosEvento — o separador de pagamentos da página de evento
// (desde o redesenho, o único sítio onde isto vive — o drawer ficou
// espreitadela e deixou de o chamar).
// Mostra o TOTAL acordado, o que já entrou, o que falta, e o plano
// (sinal + remanescente) linha a linha — cada linha com o seu próprio
// "Registar pagamento".
//
// O PLANO DESCE POR PROPS: quem o busca (e mantém fresco) é a
// EventoPage, que já precisava dele para o cabeçalho, a Jornada e as
// Notas — aqui repeti-lo era uma segunda query a piscar "A carregar…"
// a cada visita. Registar/apagar devolve a lista nova pelo
// onPagamentos, e o cabeçalho vê o dinheiro mudar no instante.
// Nunca se guarda um saldo — soma-se sempre os `pagamentos` na hora.
// ============================================================

// ------------------------------------------------------------
// SECÇÕES ESCONDIDAS — decisão do Hélio, 29/07/2026, «por enquanto».
//
//   Contribuição coletiva — a funcionalidade vai ser repensada antes
//     de ser estendida; enquanto isso não acontecer, não se mostra.
//   Gastos do evento — o cartão «Em preparação» anuncia um módulo que
//     ainda não existe.
//
// Interruptores em vez de código comentado: as duas secções ficam
// INTACTAS por baixo, a aritmética não muda (ver nota abaixo), e voltar
// a mostrar qualquer uma delas é pôr a sua constante a true — nada mais.
// São duas e não uma de propósito: podem voltar em alturas diferentes.
//
// A da contribuição deixou de viver aqui: mudou-se para
// lib/funcionalidades.js, porque governa DUAS portas — esta secção e a
// página pública /contribuir/:token. Esconder a sala e deixar a rua
// aberta deixava entrar promessas que ninguém veria.
//
// O QUE ISTO NÃO MUDA: o dinheiro das contribuições continua a contar
// em tudo — no total, no que já entrou, no que falta e no que está pago
// em cada parcela. Só deixa de haver ecrã onde ver ou apagar cada
// contribuição uma a uma (essas linhas só viviam na secção escondida).
// A nota «· X€ da contribuição coletiva» em cada parcela FICA: com a
// secção escondida, passa a ser o único rasto visível desse dinheiro.
// ------------------------------------------------------------
const MOSTRAR_GASTOS_DO_EVENTO = false;

const label = {
  fontSize: "11px",
  fontWeight: "600",
  color: "var(--gray-mid)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: "10px",
};

const formatarDataLonga = (iso) => {
  if (!iso) return null;
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const formatarDataPagamento = (p) => {
  if (p.data) return formatarDataPT(p.data);
  if (p.reconstituido) return "reconstituído · data desconhecida";
  return "sem data";
};

function LinhaPagamento({ pagamento, nova, onPedirApagar }) {
  return (
    <div
      className={nova ? "linha-nova" : undefined}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "10px",
        padding: "8px 0",
        borderTop: "1px solid #F1EAD6",
        fontSize: "12px",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <span style={{ fontWeight: "600", color: "var(--charcoal)" }}>
          {formatarEuros(pagamento.valor)}
        </span>{" "}
        <span style={{ color: "var(--gray-mid)" }}>
          · {pagamento.metodo} · {formatarDataPagamento(pagamento)}
          {pagamento.contribuinte ? ` · ${pagamento.contribuinte}` : ""}
        </span>
      </div>
      <button
        onClick={() => onPedirApagar(pagamento)}
        title="Apagar este pagamento"
        className="icone-botao icone-botao--perigo"
        style={{
          color: "#B91C1C",
          padding: "4px 6px",
          flexShrink: 0,
        }}
      >
        <Icone nome="lixo" tamanho={15} />
      </button>
    </div>
  );
}

// Um dos três números do topo, serif e grande — é o primeiro sítio
// onde os olhos pousam ao abrir o separador. Quando o valor muda à
// frente dos olhos, CONTA até lá (o tabular-nums segura a largura);
// `texto` sobrepõe-se ao número para casos como "✓ Completo".
function Numero({ rotulo, valor, texto, cor, rotuloCor }) {
  const animado = useContagemAnimada(valor);
  return (
    <div>
      <p
        style={{
          margin: "0 0 4px",
          fontSize: "10px",
          color: rotuloCor || "#9B9B9B",
          textTransform: "uppercase",
          letterSpacing: "0.14em",
        }}
      >
        {rotulo}
      </p>
      <p
        style={{
          margin: 0,
          fontFamily: "'Playfair Display', serif",
          fontSize: "30px",
          fontWeight: "400",
          lineHeight: 1,
          color: cor || "var(--charcoal)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {texto ?? formatarEuros(animado)}
      </p>
    </div>
  );
}

// A barra do que entrou, com a legenda a dizer o que falta e até
// quando. O prazo vem da parcela por pagar — nunca de uma conta feita
// aqui.
function BarraDoQueEntrou({ total, pago, falta, previstos, pagamentos }) {
  const porCento = Math.min(100, Math.round((pago / total) * 100));

  const proximaPorPagar = previstos.find((pv) => {
    const jaPago = pagamentos
      .filter((p) => p.previsto_id === pv.id)
      .reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
    return Number(pv.valor) - jaPago > 0;
  });

  const legenda =
    falta <= 0
      ? "está tudo recebido"
      : proximaPorPagar
        ? [
            proximaPorPagar.descricao?.toLowerCase(),
            proximaPorPagar.data_limite
              ? `com prazo a ${formatarDataPT(proximaPorPagar.data_limite)}`
              : "por receber",
          ]
            .filter(Boolean)
            .join(" ")
        : `${formatarEuros(falta)} por receber`;

  return (
    <div style={{ flex: "1 1 240px", minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "10px",
          marginBottom: "7px",
        }}
      >
        <span style={{ fontSize: "11.5px", color: "var(--gray-mid)" }}>
          {legenda}
        </span>
        <span
          style={{
            fontSize: "11.5px",
            color: "var(--gold-dark)",
            fontWeight: "600",
          }}
        >
          {porCento}%
        </span>
      </div>
      <div
        style={{
          height: "5px",
          borderRadius: "999px",
          backgroundColor: "#F1EBDD",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${porCento}%`,
            height: "5px",
            backgroundColor: "var(--gold)",
            transition: "width 240ms ease",
          }}
        />
      </div>
    </div>
  );
}

function FormularioPagamento({ sugestaoValor, onCancelar, onGuardar }) {
  const [valor, setValor] = useState(sugestaoValor ? String(sugestaoValor) : "");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [metodo, setMetodo] = useState("");
  const [contribuinte, setContribuinte] = useState("");
  const [notas, setNotas] = useState("");
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState(null);

  const inputStyle = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "8px",
    border: "1.5px solid var(--gold-light)",
    fontSize: "13px",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  const submeter = async () => {
    setErro(null);
    setAGuardar(true);
    try {
      await onGuardar({ valor, data, metodo, contribuinte, notas });
    } catch (e) {
      setErro(e.message || "Não foi possível guardar. Tenta novamente.");
    }
    setAGuardar(false);
  };

  return (
    <div
      style={{
        backgroundColor: "#FBF7EF",
        border: "1px solid var(--gold-light)",
        borderRadius: "10px",
        padding: "14px",
        marginTop: "8px",
        // Os quatro campos numa linha quando há largura para isso, dois
        // a dois no drawer — sem prop nenhuma a dizer onde estamos.
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: "10px",
        alignItems: "end",
      }}
    >
      <div>
        <label style={{ fontSize: "10px", color: "var(--gray-mid)" }}>
          Valor (€)
        </label>
        <input
          type="number"
          step="0.01"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="caixa-texto"
          style={inputStyle}
        />
      </div>
      <div>
        <label style={{ fontSize: "10px", color: "var(--gray-mid)" }}>
          Data
        </label>
        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="caixa-texto"
          style={inputStyle}
        />
      </div>
      <div>
        <label style={{ fontSize: "10px", color: "var(--gray-mid)" }}>
          Método (escreve ou escolhe)
        </label>
        <input
          list="metodos-pagamento-sugeridos"
          value={metodo}
          onChange={(e) => setMetodo(e.target.value)}
          placeholder="MB Way, Transferência..."
          className="caixa-texto"
          style={inputStyle}
        />
        <datalist id="metodos-pagamento-sugeridos">
          {METODOS_SUGERIDOS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </div>
      <div>
        <label style={{ fontSize: "10px", color: "var(--gray-mid)" }}>
          Quem pagou (opcional)
        </label>
        <input
          value={contribuinte}
          onChange={(e) => setContribuinte(e.target.value)}
          className="caixa-texto"
          style={inputStyle}
        />
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <label style={{ fontSize: "10px", color: "var(--gray-mid)" }}>
          Notas (opcional)
        </label>
        <input
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          className="caixa-texto"
          style={inputStyle}
        />
      </div>
      {erro && (
        <p
          style={{
            gridColumn: "1 / -1",
            fontSize: "11px",
            color: "#B91C1C",
            margin: 0,
          }}
        >
          {erro}
        </p>
      )}
      <div
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          gap: "8px",
          justifyContent: "flex-end",
        }}
      >
        <button
          onClick={onCancelar}
          disabled={aGuardar}
          className="acao acao--neutra"
          style={{
            padding: "7px 14px",
            borderRadius: "999px",
            fontSize: "12px",
          }}
        >
          Cancelar
        </button>
        <button
          onClick={submeter}
          disabled={aGuardar}
          className="acao acao--cheia"
          style={{
            padding: "7px 14px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: "600",
          }}
        >
          {aGuardar ? "A guardar..." : "Registar"}
        </button>
      </div>
    </div>
  );
}

function BlocoPrevisto({ previsto, pagamentosDoPrevisto, formularioAberto, novoId, onAbrirFormulario, onFecharFormulario, onGuardarPagamento, onPedirApagar }) {
  const pago = pagamentosDoPrevisto.reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
  const falta = Math.round((Number(previsto.valor) - pago) * 100) / 100;
  const completo = falta <= 0;
  // As contribuições SOMAM aqui (a parcela fica satisfeita) mas as
  // linhas delas vivem na secção da campanha, não duplicadas nos dois
  // sítios — aqui fica só a nota do quanto veio de lá.
  const daCampanha = Math.round(
    pagamentosDoPrevisto
      .filter((p) => p.origem === "contribuicao")
      .reduce((acc, p) => acc + (Number(p.valor) || 0), 0) * 100,
  ) / 100;
  const linhasProprias = pagamentosDoPrevisto.filter(
    (p) => p.origem !== "contribuicao",
  );

  // O "✓ Recebido" entra com mola quando a parcela SE COMPLETA à
  // frente dos olhos — nunca ao abrir a página com ela já completa.
  const primeiraPintura = useRef(true);
  useEffect(() => {
    primeiraPintura.current = false;
  }, []);
  const reduzirMovimento = useReducedMotion();

  return (
    <div
      style={{
        border: "1px solid var(--gold-light)",
        borderRadius: "10px",
        padding: "12px 14px",
        marginBottom: "10px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: "13px", fontWeight: "600", color: "var(--charcoal)" }}>
            {previsto.descricao}
          </p>
          <p style={{ margin: "2px 0 0 0", fontSize: "11px", color: "var(--gray-mid)" }}>
            {formatarEuros(previsto.valor)}
            {previsto.data_limite ? ` · prazo ${formatarDataPT(previsto.data_limite)}` : ""}
            {daCampanha > 0 && (
              <span style={{ color: "var(--gold-dark)" }}>
                {" "}
                · {formatarEuros(daCampanha)} da contribuição coletiva
              </span>
            )}
          </p>
        </div>
        {completo ? (
          <motion.span
            initial={
              primeiraPintura.current || reduzirMovimento
                ? false
                : { scale: 0.5, opacity: 0 }
            }
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 26 }}
            style={{
              fontSize: "11px",
              fontWeight: "600",
              color: "#166534",
              backgroundColor: "#DCFCE7",
              border: "1px solid #BBF7D0",
              borderRadius: "999px",
              padding: "3px 10px",
            }}
          >
            ✓ Recebido
          </motion.span>
        ) : (
          <button
            onClick={() => onAbrirFormulario(previsto.id, falta)}
            className="acao acao--ouro"
            style={{
              fontSize: "11px",
              fontWeight: "600",
              borderRadius: "999px",
              padding: "5px 12px",
            }}
          >
            {pago > 0
              ? `Registar restante (${formatarEuros(falta)})`
              : "Registar pagamento"}
          </button>
        )}
      </div>

      {linhasProprias.map((p) => (
        <LinhaPagamento
          key={p.id}
          pagamento={p}
          nova={p.id === novoId}
          onPedirApagar={onPedirApagar}
        />
      ))}

      {formularioAberto === previsto.id && (
        <FormularioPagamento
          sugestaoValor={falta}
          onCancelar={onFecharFormulario}
          onGuardar={(dados) => onGuardarPagamento(previsto.id, dados)}
        />
      )}
    </div>
  );
}

export default function PagamentosEvento({
  submissao,
  previstos = [],
  pagamentos = [],
  onPagamentos,
  onRecarregar,
  onSaved,
  realce = null,
  onRealceConsumido,
  onIrParaOrcamento,
}) {
  const [aGerarPlano, setAGerarPlano] = useState(false);
  // O pagamento acabado de registar chega com brilho (ver .linha-nova)
  const [novoId, setNovoId] = useState(null);
  const [erroPlano, setErroPlano] = useState(null);
  const [formularioAberto, setFormularioAberto] = useState(null); // id do previsto, "avulso", ou null
  const [pagamentoParaApagar, setPagamentoParaApagar] = useState(null);
  const [aApagar, setAApagar] = useState(false);
  const [erroApagar, setErroApagar] = useState(null);
  // A aterragem da pílula "registar o sinal": a parcela acende (pulso)
  // e o formulário abre-se já — a promessa cumpre-se, ela não procura.
  const [pulsando, setPulsando] = useState(null); // id do previsto
  // Hooks da sugestão de avanço (Lote 2B) — declarados AQUI, antes dos
  // early returns lá em baixo: um hook depois de um return condicional
  // muda a contagem de hooks entre renders e rebenta o componente.
  const [aAvancarFase, setAAvancarFase] = useState(false);
  const [erroAvanco, setErroAvanco] = useState(null);
  // A regra da casa (071): sinal só depois do contrato assinado. Quando
  // um registo de SINAL apanha o contrato por assinar, o pedido fica
  // aqui parado ({ previstoId, dados }) enquanto a Nádia decide inline —
  // sugere-se, NUNCA se bloqueia.
  const [avisoSinalSemContrato, setAvisoSinalSemContrato] = useState(null);
  const [aRegistarMesmo, setARegistarMesmo] = useState(false);
  const [erroAvisoSinal, setErroAvisoSinal] = useState(null);
  const blocoRefs = useRef({});

  useEffect(() => {
    if (!realce || realce.alvo !== "sinal") return;
    const sinal = previstos.find((p) => p.ordem === 1);
    if (sinal) {
      const pago = pagamentos
        .filter((p) => p.previsto_id === sinal.id)
        .reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
      if (Number(sinal.valor) - pago > 0) setFormularioAberto(sinal.id);
      setPulsando(sinal.id);
      blocoRefs.current[sinal.id]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      setTimeout(() => setPulsando(null), 2600);
    }
    if (onRealceConsumido) onRealceConsumido();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realce]);

  const valorAcordado = Number(submissao?.valor_acordado) || 0;

  const secaoWrap = { marginBottom: "28px" };

  if (!valorAcordado) {
    return (
      <div style={secaoWrap}>
        <p style={label}>Pagamentos</p>
        <Convite
          titulo="Ainda não há valor acordado."
          texto="O plano de pagamento (sinal + remanescente) nasce do valor do orçamento — é por lá que se começa."
          accao="Preparar o orçamento →"
          onAccao={onIrParaOrcamento}
        />
      </div>
    );
  }

  if (previstos.length === 0) {
    return (
      <div style={secaoWrap}>
        <p style={label}>Pagamentos</p>
        <p style={{ fontSize: "12px", color: "var(--gray-mid)", margin: "0 0 10px 0" }}>
          Este evento tem valor acordado mas ainda não tem plano de pagamento.
        </p>
        <button
          onClick={async () => {
            setAGerarPlano(true);
            setErroPlano(null);
            try {
              await gerarPrevistos(submissao.id, valorAcordado, submissao.data_evento);
              // quem guarda o plano é a página — pede-se-lhe que o releia
              if (onRecarregar) await onRecarregar();
            } catch (e) {
              console.error(e);
              setErroPlano("Não foi possível gerar o plano. Tenta novamente.");
            }
            setAGerarPlano(false);
          }}
          disabled={aGerarPlano}
          className="acao acao--ouro"
          style={{
            padding: "8px 16px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: "600",
          }}
        >
          {aGerarPlano ? "A gerar..." : "Gerar plano de pagamento"}
        </button>
        {erroPlano && (
          <p style={{ fontSize: "12px", color: "#B91C1C", margin: "10px 0 0" }}>
            {erroPlano}
          </p>
        )}
      </div>
    );
  }

  const { total, pago, falta } = resumoPagamentos(valorAcordado, pagamentos);
  // As contribuições (incluindo um excedente sem previsto) vivem na
  // secção da campanha — os "outros pagamentos" são os avulsos dela.
  const avulsos = pagamentos.filter(
    (p) => !p.previsto_id && p.origem !== "contribuicao",
  );

  // O remanescente é quem decide pagamento_final — é a coluna que o
  // alerta "falta o pagamento final" do Início ainda lê, por isso tem
  // de continuar sincronizada mesmo agora que o dinheiro se regista
  // aqui, não naquele botão antigo. Silencioso de propósito: uma
  // falha aqui não deve impedir o registo/remoção do pagamento em si.
  const sincronizarPagamentoFinal = async (listaPagamentos) => {
    const remanescente = previstos.find((p) => p.ordem === 2);
    let completo;
    if (remanescente) {
      const pagoNoRemanescente = listaPagamentos
        .filter((p) => p.previsto_id === remanescente.id)
        .reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
      completo = pagoNoRemanescente >= remanescente.valor - 0.005;
    } else {
      // Plano sem remanescente (a sincronização remove o previsto
      // livre quando o lado preso já cobre o total novo): decide a
      // falta GLOBAL — sem isto, um evento totalmente pago mantinha o
      // alerta "falta o pagamento final" para sempre.
      if (!(Number(valorAcordado) > 0)) return;
      const resumo = resumoPagamentos(valorAcordado, listaPagamentos);
      completo = resumo.falta <= 0;
    }
    if (completo === !!submissao.pagamento_final) return;
    try {
      const atualizado = await marcarPagamentoFinal(submissao.id, completo);
      if (onSaved) onSaved(atualizado);
    } catch (e) {
      console.error("marcarPagamentoFinal (sincronização) falhou:", e);
    }
  };

  // O facto "sinal saldado" e a fase (afinado a 03/08/2026): registar o
  // sinal AQUI é a decisão dela — a fase passa a acompanhar SOZINHA no
  // fim do registo (ver guardarPagamento). A regra «sugere-se, nunca se
  // executa» ficou para os JUÍZOS comerciais; um facto registado com
  // trilho reflecte-se sem segunda cerimónia. Este banner continua como
  // REDE: pagamentos que saldaram por outra via (importação, avulsos
  // antigos) ainda encontram aqui a saída de sempre.
  const previstoSinal = previstos.find((p) => p.ordem === 1);
  const sinalSaldado =
    !!previstoSinal &&
    saldoSinalPendente(submissao.id, previstos, pagamentos) <= 0;
  const sugerirAvancoFase =
    sinalSaldado &&
    ["orcamento", "contrato", "sinal"].includes(submissao.fase);

  const avancarParaCliente = async () => {
    setAAvancarFase(true);
    setErroAvanco(null);
    try {
      const atualizada = await updateFase(submissao.id, "cliente");
      // Só o par que mudou: a linha crua inteira esmagaria as colunas
      // que o normalizeSubmission preencheu na leitura (família
      // merge-linha-crua, anotada no relatório).
      if (onSaved)
        onSaved({ fase: atualizada.fase, status: atualizada.status });
    } catch (e) {
      console.error(e);
      setErroAvanco(
        e instanceof Error && e.message
          ? e.message
          : "Não foi possível avançar a fase. Tenta novamente.",
      );
    }
    setAAvancarFase(false);
  };

  // Ao registar um SINAL, espreita-se o contrato primeiro (busca pontual
  // a `documentos` — assinado_em é o carimbo do backoffice, trancado_em o
  // do portal): a regra da casa (071) é sinal só depois da assinatura.
  // Por assinar, o pedido pára num aviso inline com confirmação — a
  // decisão é dela, nunca do código. Se a verificação falhar (rede), o
  // registo segue sem aviso: acusar com dados que não se leram é pior
  // do que não avisar.
  const guardarPagamento = async (previstoId, origem, dados, opcoes = {}) => {
    if (origem === "sinal" && !opcoes.aceitaSemContrato) {
      let assinado = true;
      try {
        const docs = await documentosDoEvento(submissao.id);
        const contrato = docs.find((d) => d.tipo === "contrato");
        assinado = !!(contrato && (contrato.assinado_em || contrato.trancado_em));
      } catch (e) {
        console.warn(
          "Não foi possível verificar o contrato — o registo segue sem aviso:",
          e,
        );
      }
      if (!assinado) {
        setErroAvisoSinal(null);
        setAvisoSinalSemContrato({ previstoId, dados });
        return;
      }
    }
    const registo = await registarPagamento(submissao.id, {
      previstoId: previstoId === "avulso" ? null : previstoId,
      valor: dados.valor,
      data: dados.data,
      metodo: dados.metodo,
      origem,
      contribuinte: dados.contribuinte,
      notas: dados.notas,
    });
    const novaLista = [...pagamentos, registo];
    if (onPagamentos) onPagamentos(novaLista);
    setFormularioAberto(null);
    setAvisoSinalSemContrato(null);
    setErroAvisoSinal(null);
    setNovoId(registo.id);
    setTimeout(() => setNovoId(null), 1300);
    await sincronizarPagamentoFinal(novaLista);
    // 075 · o funil acompanha o facto: com o sinal SALDADO por este
    // registo, a fase avança sozinha para Cliente. Falhar aqui nunca
    // falha o registo — o banner de sugestão fica como rede.
    if (
      previstoSinal &&
      saldoSinalPendente(submissao.id, previstos, novaLista) <= 0 &&
      ["interessado", "orcamento", "contrato", "sinal"].includes(submissao.fase)
    ) {
      try {
        const atualizada = await updateFase(submissao.id, "cliente");
        if (onSaved)
          onSaved({ fase: atualizada.fase, status: atualizada.status });
      } catch (e) {
        console.warn("Sinal saldado; a fase fica para o banner:", e?.message || e);
      }
    }
  };

  // «Registar na mesma» — a confirmação do aviso: o mesmo caminho, agora
  // com o consentimento explícito dela.
  const registarSinalNaMesma = async () => {
    if (!avisoSinalSemContrato) return;
    setARegistarMesmo(true);
    setErroAvisoSinal(null);
    try {
      await guardarPagamento(
        avisoSinalSemContrato.previstoId,
        "sinal",
        avisoSinalSemContrato.dados,
        { aceitaSemContrato: true },
      );
    } catch (e) {
      console.error(e);
      setErroAvisoSinal(
        e.message || "Não foi possível registar. Tenta novamente.",
      );
    }
    setARegistarMesmo(false);
  };

  const deixarSinalSemContrato = () => {
    setAvisoSinalSemContrato(null);
    setErroAvisoSinal(null);
  };

  const fecharConfirmacaoApagar = () => {
    setPagamentoParaApagar(null);
    setErroApagar(null);
  };

  const confirmarApagar = async () => {
    if (!pagamentoParaApagar) return;
    setAApagar(true);
    setErroApagar(null);
    try {
      await apagarPagamento(pagamentoParaApagar.id);
      const novaLista = pagamentos.filter((p) => p.id !== pagamentoParaApagar.id);
      if (onPagamentos) onPagamentos(novaLista);
      fecharConfirmacaoApagar();
      await sincronizarPagamentoFinal(novaLista);
    } catch (e) {
      console.error(e);
      setErroApagar("Não foi possível apagar. Tenta novamente.");
    }
    setAApagar(false);
  };

  return (
    <div style={secaoWrap}>
      <p style={label}>Pagamentos</p>

      {/* Os três números em serif, com a barra do que entrou ao lado. */}
      <div
        style={{
          display: "flex",
          gap: "48px",
          marginBottom: "18px",
          flexWrap: "wrap",
          alignItems: "flex-end",
          backgroundColor: "white",
          border: "1px solid #F0E6D0",
          borderRadius: "14px",
          padding: "20px 24px",
        }}
      >
        <Numero rotulo="Total" valor={total} />
        <Numero rotulo="Recebido" valor={pago} cor="#166534" />
        <Numero
          rotulo={falta > 0 ? "Falta" : falta < 0 ? "Pago a mais" : "Estado"}
          valor={Math.abs(falta)}
          texto={falta === 0 ? "✓ Completo" : undefined}
          cor={falta > 0 ? "var(--gold-dark)" : "#166534"}
          rotuloCor={falta > 0 ? "#B08A3C" : undefined}
        />
        {total > 0 && (
          <BarraDoQueEntrou
            total={total}
            pago={pago}
            falta={falta}
            previstos={previstos}
            pagamentos={pagamentos}
          />
        )}
      </div>

      {/* A sugestão de avanço — o sinal está no banco, a fase é juízo
          dela. Desaparece sozinha quando a fase avança. */}
      {sugerirAvancoFase && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            backgroundColor: "#FBF7EF",
            border: "1px solid var(--gold-light)",
            borderRadius: "12px",
            padding: "12px 16px",
            marginBottom: "18px",
          }}
        >
          <p
            style={{
              flex: 1,
              minWidth: "220px",
              fontSize: "12.5px",
              color: "var(--gold-dark)",
              margin: 0,
            }}
          >
            🥂 O sinal está saldado — este evento ainda conta como «em
            negociação» no funil. Avançar para <strong>Cliente</strong>?
          </p>
          <button
            onClick={avancarParaCliente}
            disabled={aAvancarFase}
            className="acao acao--ouro"
            style={{
              padding: "8px 16px",
              borderRadius: "999px",
              fontSize: "12px",
              fontWeight: "600",
            }}
          >
            {aAvancarFase ? "A avançar..." : "Avançar para Cliente"}
          </button>
          {erroAvanco && (
            <p
              style={{
                width: "100%",
                fontSize: "12px",
                color: "#B91C1C",
                margin: 0,
              }}
            >
              ⚠ {erroAvanco}
            </p>
          )}
        </div>
      )}

      {/* Plano — sinal + remanescente */}
      {previstos.map((previsto) => (
        <div
          key={previsto.id}
          ref={(el) => (blocoRefs.current[previsto.id] = el)}
          className={pulsando === previsto.id ? "realce-pulso" : undefined}
          style={{ borderRadius: "10px" }}
        >
          <BlocoPrevisto
            previsto={previsto}
            pagamentosDoPrevisto={pagamentos.filter((p) => p.previsto_id === previsto.id)}
            formularioAberto={formularioAberto}
            novoId={novoId}
            onAbrirFormulario={(id) => {
              deixarSinalSemContrato();
              setFormularioAberto(id);
            }}
            onFecharFormulario={() => {
              deixarSinalSemContrato();
              setFormularioAberto(null);
            }}
            onGuardarPagamento={(previstoId, dados) => {
              const origem = previsto.ordem === 1 ? "sinal" : "remanescente";
              return guardarPagamento(previstoId, origem, dados);
            }}
            onPedirApagar={setPagamentoParaApagar}
          />
          {/* O aviso da regra da casa, no lugar da parcela do sinal:
              âmbar, com confirmação inline — sugere, nunca bloqueia. */}
          {avisoSinalSemContrato?.previstoId === previsto.id && (
            <div
              style={{
                backgroundColor: "#FFFBEB",
                border: "1px solid #FDE68A",
                borderRadius: "10px",
                padding: "12px 14px",
                margin: "8px 0 10px",
              }}
            >
              <p
                style={{
                  fontSize: "12.5px",
                  color: "#92400E",
                  margin: "0 0 10px",
                  lineHeight: 1.55,
                }}
              >
                O contrato ainda não está assinado — a regra da casa é
                sinal só depois da assinatura.
              </p>
              {erroAvisoSinal && (
                <p
                  style={{
                    fontSize: "11.5px",
                    color: "#B91C1C",
                    margin: "0 0 10px",
                  }}
                >
                  {erroAvisoSinal}
                </p>
              )}
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={registarSinalNaMesma}
                  disabled={aRegistarMesmo}
                  className="acao acao--ouro"
                  style={{
                    padding: "7px 14px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: "600",
                  }}
                >
                  {aRegistarMesmo ? "A registar..." : "Registar na mesma"}
                </button>
                <button
                  onClick={deixarSinalSemContrato}
                  disabled={aRegistarMesmo}
                  className="acao acao--neutra"
                  style={{
                    padding: "7px 14px",
                    borderRadius: "999px",
                    fontSize: "12px",
                  }}
                >
                  Deixar
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Avulsos — pagamentos sem previsto associado */}
      {avulsos.length > 0 && (
        <div style={{ marginTop: "4px", marginBottom: "10px" }}>
          <p style={{ fontSize: "11px", color: "var(--gray-mid)", margin: "0 0 4px 0" }}>
            Outros pagamentos
          </p>
          {avulsos.map((p) => (
            <LinhaPagamento
              key={p.id}
              pagamento={p}
              nova={p.id === novoId}
              onPedirApagar={setPagamentoParaApagar}
            />
          ))}
        </div>
      )}

      {formularioAberto === "avulso" ? (
        <FormularioPagamento
          sugestaoValor={null}
          onCancelar={() => setFormularioAberto(null)}
          onGuardar={(dados) => guardarPagamento("avulso", "outro", dados)}
        />
      ) : (
        <button
          onClick={() => setFormularioAberto("avulso")}
          className="ligacao"
          style={{
            marginTop: "4px",
            fontSize: "11px",
            color: "var(--gold-dark)",
            textDecoration: "underline",
          }}
        >
          + Registar outro pagamento
        </button>
      )}

      {/* A CONTRIBUIÇÃO COLETIVA — o módulo que faz a casa ganhar
          dinheiro. Regista/apaga pela mesma mão que os pagamentos
          (onPagamentos), e sincroniza o pagamento_final como eles.
          ESCONDIDA por enquanto — ver CONTRIBUICAO_COLETIVA_ATIVA. */}
      {CONTRIBUICAO_COLETIVA_ATIVA && (
        <ContribuicaoColetiva
          submissao={submissao}
          previstos={previstos}
          pagamentos={pagamentos}
          faltaEvento={falta}
          onPagamentos={(lista) => {
            if (onPagamentos) onPagamentos(lista);
            sincronizarPagamentoFinal(lista);
          }}
        />
      )}

      {/* O módulo que ainda vai nascer aqui — anunciado na língua dela.
          ESCONDIDO por enquanto — ver MOSTRAR_GASTOS_DO_EVENTO. */}
      {MOSTRAR_GASTOS_DO_EVENTO && (
      <div
        style={{
          borderTop: "1px solid #F0E6D0",
          marginTop: "22px",
          paddingTop: "20px",
        }}
      >
        <p
          style={{
            fontSize: "11px",
            fontWeight: "600",
            color: "var(--gray-mid)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            margin: "0 0 12px",
          }}
        >
          Em preparação
        </p>
        <div
          style={{
            flex: "1 1 260px",
            border: "1px dashed #DFD3B8",
            borderRadius: "12px",
            padding: "16px 18px",
            backgroundColor: "#FCFBF7",
          }}
        >
          <p style={{ fontSize: "13.5px", margin: "0 0 4px" }}>
            Gastos do evento
          </p>
          <p
            style={{
              fontSize: "12px",
              color: "#9B9B9B",
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            Flores, deslocação, equipa — o que o evento custou, ao lado do
            que rendeu.
          </p>
        </div>
      </div>
      )}

      {/* Confirmação de remoção — nunca window.confirm */}
      {pagamentoParaApagar && (
        <div
          onClick={fecharConfirmacaoApagar}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 150,
            backgroundColor: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "white",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "380px",
              width: "100%",
              boxShadow: "0 8px 48px rgba(0,0,0,0.15)",
            }}
          >
            <h3
              style={{
                fontSize: "15px",
                color: "var(--charcoal)",
                margin: "0 0 12px 0",
                fontFamily: "Playfair Display, serif",
              }}
            >
              Apagar este pagamento?
            </h3>
            <p style={{ fontSize: "13px", color: "var(--gray-mid)", margin: "0 0 20px 0", lineHeight: "1.6" }}>
              Vais apagar o registo de{" "}
              <strong>{formatarEuros(pagamentoParaApagar.valor)}</strong>
              {pagamentoParaApagar.data
                ? ` de ${formatarDataLonga(pagamentoParaApagar.data)}`
                : " sem data (reconstituído)"}
              . Esta ação não pode ser anulada.
            </p>
            {erroApagar && (
              <p
                style={{
                  fontSize: "12.5px",
                  color: "#B91C1C",
                  backgroundColor: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: "10px",
                  padding: "8px 12px",
                  margin: "0 0 14px",
                }}
              >
                {erroApagar}
              </p>
            )}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={fecharConfirmacaoApagar}
                disabled={aApagar}
                className="acao acao--neutra"
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarApagar}
                disabled={aApagar}
                className="acao acao--perigo-cheia"
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "600",
                }}
              >
                {aApagar ? "A apagar..." : "Apagar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
