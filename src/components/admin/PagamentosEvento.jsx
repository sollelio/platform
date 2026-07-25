import { useEffect, useState } from "react";
import {
  getPagamentosEvento,
  registarPagamento,
  apagarPagamento,
  gerarPrevistos,
  resumoPagamentos,
  METODOS_SUGERIDOS,
} from "../../lib/pagamentos";
import { formatarEuros, formatarDataPT } from "./orcamentos/orcamentoConfig";
import { marcarPagamentoFinal } from "../../lib/clientes";

// ============================================================
// PagamentosEvento — o separador de pagamentos da ficha de evento.
// Mostra o TOTAL acordado, o que já entrou, o que falta, e o plano
// (sinal + remanescente) linha a linha — cada linha com o seu próprio
// "Registar pagamento". Lê e escreve via lib/pagamentos.js; nunca
// guarda um saldo — soma sempre os `pagamentos` reais na hora.
//
// Convive, por agora, com o botão antigo "Marcar pagamento final
// recebido" mais acima na drawer (ainda não escreve aqui) — a
// substituição desse botão é um passo à parte, só depois deste painel
// confirmado a funcionar.
// ============================================================

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

function LinhaPagamento({ pagamento, onPedirApagar }) {
  return (
    <div
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
        style={{
          border: "none",
          background: "none",
          color: "#B91C1C",
          cursor: "pointer",
          fontSize: "13px",
          padding: "4px 6px",
          flexShrink: 0,
        }}
      >
        🗑
      </button>
    </div>
  );
}

// Um dos três números do topo. Em largura inteira é serif e grande —
// é o primeiro sítio onde os olhos pousam ao abrir o separador.
function Numero({ rotulo, valor, cor, rotuloCor, largo }) {
  return (
    <div style={largo ? undefined : { flex: "1 1 100px" }}>
      <p
        style={{
          margin: largo ? "0 0 4px" : 0,
          fontSize: "10px",
          color: rotuloCor || (largo ? "#9B9B9B" : "var(--gray-mid)"),
          textTransform: "uppercase",
          letterSpacing: largo ? "0.14em" : undefined,
        }}
      >
        {rotulo}
      </p>
      <p
        style={{
          margin: 0,
          fontFamily: largo ? "'Playfair Display', serif" : "inherit",
          fontSize: largo ? "30px" : "16px",
          fontWeight: largo ? "400" : "700",
          lineHeight: largo ? 1 : undefined,
          color: cor || "var(--charcoal)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {valor}
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
          style={{
            padding: "7px 14px",
            borderRadius: "999px",
            fontSize: "12px",
            border: "1.5px solid var(--gold-light)",
            backgroundColor: "white",
            color: "var(--gray-mid)",
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
        <button
          onClick={submeter}
          disabled={aGuardar}
          style={{
            padding: "7px 14px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: "600",
            border: "none",
            backgroundColor: "var(--gold)",
            color: "white",
            cursor: aGuardar ? "wait" : "pointer",
          }}
        >
          {aGuardar ? "A guardar..." : "Registar"}
        </button>
      </div>
    </div>
  );
}

function BlocoPrevisto({ previsto, pagamentosDoPrevisto, formularioAberto, onAbrirFormulario, onFecharFormulario, onGuardarPagamento, onPedirApagar }) {
  const pago = pagamentosDoPrevisto.reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
  const falta = Math.round((Number(previsto.valor) - pago) * 100) / 100;
  const completo = falta <= 0;

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
          </p>
        </div>
        {completo ? (
          <span
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
          </span>
        ) : (
          <button
            onClick={() => onAbrirFormulario(previsto.id, falta)}
            style={{
              fontSize: "11px",
              fontWeight: "600",
              border: "1.5px solid var(--gold)",
              backgroundColor: "white",
              color: "var(--gold-dark)",
              borderRadius: "999px",
              padding: "5px 12px",
              cursor: "pointer",
            }}
          >
            {pago > 0
              ? `Registar restante (${formatarEuros(falta)})`
              : "Registar pagamento"}
          </button>
        )}
      </div>

      {pagamentosDoPrevisto.map((p) => (
        <LinhaPagamento key={p.id} pagamento={p} onPedirApagar={onPedirApagar} />
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

export default function PagamentosEvento({ submissao, onSaved, largo = false }) {
  const [previstos, setPrevistos] = useState([]);
  const [pagamentos, setPagamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [aGerarPlano, setAGerarPlano] = useState(false);
  const [formularioAberto, setFormularioAberto] = useState(null); // id do previsto, "avulso", ou null
  const [pagamentoParaApagar, setPagamentoParaApagar] = useState(null);
  const [aApagar, setAApagar] = useState(false);
  // Bumped para forçar um refetch (ex: depois de gerar o plano) sem
  // precisar de expor uma função "carregar" memoizada.
  const [chaveRecarga, setChaveRecarga] = useState(0);

  useEffect(() => {
    if (!submissao?.id) return;
    let cancelado = false;
    setCarregando(true);
    (async () => {
      try {
        const dados = await getPagamentosEvento(submissao.id);
        if (!cancelado) {
          setPrevistos(dados.previstos);
          setPagamentos(dados.pagamentos);
        }
      } catch (e) {
        console.error("getPagamentosEvento falhou:", e);
      }
      if (!cancelado) setCarregando(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [submissao?.id, chaveRecarga]);

  const valorAcordado = Number(submissao?.valor_acordado) || 0;

  const secaoWrap = { marginBottom: "28px" };

  if (!valorAcordado) {
    return (
      <div style={secaoWrap}>
        <p style={label}>Pagamentos</p>
        <p style={{ fontSize: "12px", color: "var(--gray-mid)", margin: 0 }}>
          Define o valor no orçamento para gerar o plano de pagamento (sinal +
          remanescente).
        </p>
      </div>
    );
  }

  if (carregando) {
    return (
      <div style={secaoWrap}>
        <p style={label}>Pagamentos</p>
        <p style={{ fontSize: "12px", color: "var(--gray-mid)", margin: 0 }}>
          A carregar...
        </p>
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
            try {
              await gerarPrevistos(submissao.id, valorAcordado, submissao.data_evento);
              setChaveRecarga((n) => n + 1);
            } catch (e) {
              console.error(e);
              alert("Não foi possível gerar o plano. Tenta novamente.");
            }
            setAGerarPlano(false);
          }}
          disabled={aGerarPlano}
          style={{
            padding: "8px 16px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: "600",
            border: "1.5px solid var(--gold)",
            backgroundColor: "white",
            color: "var(--gold-dark)",
            cursor: aGerarPlano ? "wait" : "pointer",
          }}
        >
          {aGerarPlano ? "A gerar..." : "Gerar plano de pagamento"}
        </button>
      </div>
    );
  }

  const { total, pago, falta } = resumoPagamentos(valorAcordado, pagamentos);
  const avulsos = pagamentos.filter((p) => !p.previsto_id);

  // O remanescente é quem decide pagamento_final — é a coluna que o
  // alerta "falta o pagamento final" do Início ainda lê, por isso tem
  // de continuar sincronizada mesmo agora que o dinheiro se regista
  // aqui, não naquele botão antigo. Silencioso de propósito: uma
  // falha aqui não deve impedir o registo/remoção do pagamento em si.
  const sincronizarPagamentoFinal = async (listaPagamentos) => {
    const remanescente = previstos.find((p) => p.ordem === 2);
    if (!remanescente) return;
    const pagoNoRemanescente = listaPagamentos
      .filter((p) => p.previsto_id === remanescente.id)
      .reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
    const completo = pagoNoRemanescente >= remanescente.valor - 0.005;
    if (completo === !!submissao.pagamento_final) return;
    try {
      const atualizado = await marcarPagamentoFinal(submissao.id, completo);
      if (onSaved) onSaved(atualizado);
    } catch (e) {
      console.error("marcarPagamentoFinal (sincronização) falhou:", e);
    }
  };

  const guardarPagamento = async (previstoId, origem, dados) => {
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
    setPagamentos(novaLista);
    setFormularioAberto(null);
    await sincronizarPagamentoFinal(novaLista);
  };

  const confirmarApagar = async () => {
    if (!pagamentoParaApagar) return;
    setAApagar(true);
    try {
      await apagarPagamento(pagamentoParaApagar.id);
      const novaLista = pagamentos.filter((p) => p.id !== pagamentoParaApagar.id);
      setPagamentos(novaLista);
      setPagamentoParaApagar(null);
      await sincronizarPagamentoFinal(novaLista);
    } catch (e) {
      console.error(e);
      alert("Não foi possível apagar. Tenta novamente.");
    }
    setAApagar(false);
  };

  return (
    <div style={secaoWrap}>
      <p style={label}>Pagamentos</p>

      {/* Totais. Em largura inteira ganham a serif, o cartão e a barra
          do que entrou ao lado; no drawer ficam como sempre foram. */}
      <div
        style={{
          display: "flex",
          gap: largo ? "48px" : "10px",
          marginBottom: largo ? "18px" : "14px",
          flexWrap: "wrap",
          alignItems: "flex-end",
          backgroundColor: largo ? "white" : "transparent",
          border: largo ? "1px solid #F0E6D0" : "none",
          borderRadius: largo ? "14px" : 0,
          padding: largo ? "20px 24px" : 0,
        }}
      >
        <Numero rotulo="Total" valor={formatarEuros(total)} largo={largo} />
        <Numero
          rotulo="Recebido"
          valor={formatarEuros(pago)}
          cor="#166534"
          largo={largo}
        />
        <Numero
          rotulo={falta > 0 ? "Falta" : falta < 0 ? "Pago a mais" : "Estado"}
          valor={falta === 0 ? "✓ Completo" : formatarEuros(Math.abs(falta))}
          cor={falta > 0 ? "var(--gold-dark)" : "#166534"}
          rotuloCor={falta > 0 ? "#B08A3C" : undefined}
          largo={largo}
        />
        {largo && total > 0 && (
          <BarraDoQueEntrou
            total={total}
            pago={pago}
            falta={falta}
            previstos={previstos}
            pagamentos={pagamentos}
          />
        )}
      </div>

      {/* Plano — sinal + remanescente */}
      {previstos.map((previsto) => (
        <BlocoPrevisto
          key={previsto.id}
          previsto={previsto}
          pagamentosDoPrevisto={pagamentos.filter((p) => p.previsto_id === previsto.id)}
          formularioAberto={formularioAberto}
          onAbrirFormulario={(id) => setFormularioAberto(id)}
          onFecharFormulario={() => setFormularioAberto(null)}
          onGuardarPagamento={(previstoId, dados) => {
            const origem = previsto.ordem === 1 ? "sinal" : "remanescente";
            return guardarPagamento(previstoId, origem, dados);
          }}
          onPedirApagar={setPagamentoParaApagar}
        />
      ))}

      {/* Avulsos — pagamentos sem previsto associado */}
      {avulsos.length > 0 && (
        <div style={{ marginTop: "4px", marginBottom: "10px" }}>
          <p style={{ fontSize: "11px", color: "var(--gray-mid)", margin: "0 0 4px 0" }}>
            Outros pagamentos
          </p>
          {avulsos.map((p) => (
            <LinhaPagamento key={p.id} pagamento={p} onPedirApagar={setPagamentoParaApagar} />
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
          style={{
            marginTop: "4px",
            fontSize: "11px",
            border: "none",
            background: "none",
            color: "var(--gold-dark)",
            cursor: "pointer",
            padding: 0,
            textDecoration: "underline",
          }}
        >
          + Registar outro pagamento
        </button>
      )}

      {/* Os dois módulos que a arquitectura manda nascer AQUI, e não no
          drawer — é por eles que o drawer não podia continuar a crescer.
          Ficam anunciados enquanto não existem: o separador tem de
          mostrar onde vão morar, não fingir que já lá estão. */}
      {largo && (
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
              margin: "0 0 4px",
            }}
          >
            Reservado neste separador
          </p>
          <p style={{ fontSize: "12px", color: "#9B9B9B", margin: "0 0 12px" }}>
            Os dois módulos que a arquitectura manda nascer aqui — não no
            drawer.
          </p>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {[
              {
                titulo: "Contribuição coletiva",
                nota: "quem contribuiu, quanto, link partilhável",
              },
              {
                titulo: "Gastos do evento",
                nota: "flores, deslocação, equipa · margem real do evento",
              },
            ].map((bloco) => (
              <div
                key={bloco.titulo}
                style={{
                  flex: "1 1 260px",
                  border: "1px dashed #DFD3B8",
                  borderRadius: "12px",
                  padding: "16px 18px",
                  backgroundColor: "#FCFBF7",
                }}
              >
                <p style={{ fontSize: "13.5px", margin: "0 0 4px" }}>
                  {bloco.titulo}
                </p>
                <p
                  style={{
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: "10.5px",
                    color: "#B3AB9C",
                    letterSpacing: "0.04em",
                    margin: 0,
                  }}
                >
                  {bloco.nota}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmação de remoção — nunca window.confirm */}
      {pagamentoParaApagar && (
        <div
          onClick={() => setPagamentoParaApagar(null)}
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
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setPagamentoParaApagar(null)}
                disabled={aApagar}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  border: "1.5px solid var(--gold-light)",
                  color: "var(--gray-mid)",
                  backgroundColor: "white",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarApagar}
                disabled={aApagar}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "600",
                  border: "none",
                  backgroundColor: aApagar ? "#FCA5A5" : "#EF4444",
                  color: "white",
                  cursor: aApagar ? "not-allowed" : "pointer",
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
