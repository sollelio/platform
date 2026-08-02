import { getResumoSubmissao, getValorAtual } from "../../lib/submissionFields";
import {
  FASES_POS_SINAL,
  STATUS_OPTIONS,
  STATUS_COLORS,
} from "./faseConfig";
import { formatarEuros } from "./orcamentos/orcamentoConfig";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from "recharts";

const GOLD_SHADES = ["#C9A84C", "#A07830", "#E8D5A3", "#7A5C20", "#F5ECD7"];

// Estilos partilhados dos cards de KPI do dashboard
const kpiCardStyle = {
  backgroundColor: "white",
  borderRadius: "14px",
  padding: "20px 16px",
  textAlign: "center",
  boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
};
const kpiValueStyle = {
  fontSize: "34px",
  fontWeight: "600",
  margin: "0 0 4px 0",
  lineHeight: 1,
};
const kpiLabelStyle = {
  fontSize: "12px",
  color: "var(--gray-mid)",
  margin: 0,
  lineHeight: 1.4,
};

function ChartCard({ title, children }) {
  return (
    <div
      style={{
        backgroundColor: "white",
        borderRadius: "16px",
        padding: "24px 20px",
        boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
        marginBottom: "20px",
      }}
    >
      <p
        style={{
          fontSize: "12px",
          fontWeight: "600",
          color: "var(--gray-mid)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: "20px",
          margin: "0 0 20px 0",
        }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

function EmptyChart() {
  return (
    <div
      style={{
        height: "160px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <p style={{ color: "var(--gold-light)", fontSize: "13px" }}>
        Sem dados suficientes ainda
      </p>
    </div>
  );
}

// Formata uma data para PT-PT (ex: "12 de junho de 2025")
const formatDate = (date) => {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

// Tab Dashboard — extraída do AdminPage sem mudar
// comportamento. É read-only: só lê submissions/invites/eventTypes e
// desenha. A única saída é onSelectSubmission ao clicar num evento.
//
// Props:
//   submissions         — lista de submissões (já normalizadas)
//   invites             — lista de convites
//   eventTypes          — tipos de evento
//   onSelectSubmission  — abre o drawer de um evento (setSelected no pai)
export default function DashboardTab({
  submissions,
  invites,
  eventTypes,
  onSelectSubmission,
}) {
  // Perdidos ficam fora do dashboard — negócios mortos não são
  // "eventos ativos" nem merecem atenção (o funil é o sítio deles).
  const ativos = (submissions || []).filter((s) => s.fase !== "perdido");

  // Título de QUALQUER evento — a mesma lógica do drawer/funil
  // (dupla fonte + papéis do modelo), em vez do antigo
  // `nome_noivo & nome_noiva` que deixava um "&" pendurado nos
  // eventos que não são casamento.
  const tituloDe = (s) => getResumoSubmissao(s, eventTypes).titulo;

  // ===== A camada financeira — tudo do valor_acordado + fases =====
  const somaValores = (lista) =>
    lista.reduce((acc, e) => acc + (Number(e.valor_acordado) || 0), 0);

  // Garantido POR REALIZAR: sinal pago, evento ainda por acontecer
  const garantidosPorRealizar = ativos.filter(
    (s) => FASES_POS_SINAL.includes(s.fase) && s.status !== "Concluído",
  );
  // Em negociação: o dinheiro possível (pré-sinal — desde a 071 inclui
  // a fase contrato, o limbo pós-aceite)
  const emNegociacaoLista = ativos.filter((s) =>
    ["interessado", "orcamento", "contrato", "sinal"].includes(s.fase),
  );
  // Concluído este ano: a receita já feita — que hoje não aparecia
  // em lado nenhum (os Concluídos saem do funil e do radar)
  const anoAtual = new Date().getFullYear();
  const concluidosAno = ativos.filter(
    (s) =>
      s.status === "Concluído" &&
      s.data_evento &&
      new Date(s.data_evento).getFullYear() === anoAtual,
  );
  // Valor médio por evento (só os que têm valor acordado)
  const comValor = ativos.filter((s) => Number(s.valor_acordado) > 0);
  const valorMedio =
    comValor.length > 0 ? somaValores(comValor) / comValor.length : 0;

  // Receita por mês: barras "feito" (garantido/concluído, dourado cheio)
  // e "possível" (em negociação, dourado claro) — lado a lado.
  const receitaPorMes = () => {
    const buckets = {};
    ativos.forEach((s) => {
      const v = Number(s.valor_acordado) || 0;
      if (!v || !s.data_evento) return;
      const d = new Date(s.data_evento);
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!buckets[chave]) {
        buckets[chave] = {
          chave,
          mes: d.toLocaleDateString("pt-PT", {
            month: "short",
            year: "2-digit",
          }),
          feito: 0,
          possivel: 0,
        };
      }
      if (FASES_POS_SINAL.includes(s.fase)) buckets[chave].feito += v;
      else buckets[chave].possivel += v;
    });
    return Object.values(buckets).sort((a, b) =>
      a.chave.localeCompare(b.chave),
    );
  };

  const eventosPorMes = () => {
    const counts = {};
    ativos.forEach((s) => {
      if (!s.data_evento) return;
      const mes = new Date(s.data_evento).toLocaleDateString("pt-PT", {
        month: "short",
        year: "2-digit",
      });
      counts[mes] = (counts[mes] || 0) + 1;
    });
    return Object.entries(counts).map(([mes, total]) => ({ mes, total }));
  };

  // Dupla fonte (coluna fixa OU respostas[campoId], via getValorAtual) —
  // sem isto, eventos de Modelos de Evento personalizados (que guardam a
  // resposta em respostas.estiloEvento, não na coluna estilo_evento)
  // ficavam sempre de fora da contagem, mesmo com dados reais. "estilo"
  // não é um tipo dedicado (usa checkbox/radio, o mesmo tipo genérico de
  // muitas outras perguntas), por isso — ao contrário da paleta — o
  // fallback é pelo PAPEL "estilo" marcado no modelo, não pelo tipo.
  const estilosMaisPedidos = () => {
    const counts = {};
    ativos.forEach((s) => {
      let valores = getValorAtual(s, "estiloEvento");
      if (!Array.isArray(valores) || valores.length === 0) {
        const campoEstilo = camposDoTipo(s.event_type_id).find(
          (f) => f.papel === "estilo",
        );
        if (campoEstilo) valores = getValorAtual(s, campoEstilo.id);
      }
      // checkbox devolve array; radio devolve uma string só — aceita as duas.
      const lista = Array.isArray(valores) ? valores : valores ? [valores] : [];
      lista.forEach((e) => {
        counts[e] = (counts[e] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);
  };

  // A paleta guarda um array de {nome, hex} (ver SeletorPaleta.jsx) —
  // as cores antigas gravadas directo na coluna eram só o nome (string);
  // nomeCor aceita as duas formas.
  const nomeCor = (c) => (c && typeof c === "object" && c.nome ? c.nome : String(c));

  // Os campos de um modelo, para os fallbacks por papel/tipo acima e abaixo.
  const camposDoTipo = (tipoId) => {
    const tipo = (eventTypes || []).find((et) => et.id === tipoId);
    return (tipo?.steps || []).flatMap((step) => step.fields || []);
  };

  const paletasMaisPopulares = () => {
    const counts = {};
    ativos.forEach((s) => {
      let valores = getValorAtual(s, "paletaCores");
      // Fallback por TYPE: "paleta" é um tipo dedicado (só serve para
      // isto), por isso é seguro apanhar o primeiro campo desse tipo no
      // modelo — mesmo que o id gerado a partir do label não seja
      // literalmente "paletaCores" (ex: label "Paleta de Cores" gera
      // "paletaDeCores", não bate certo com a chave canónica).
      if (!Array.isArray(valores) || valores.length === 0) {
        const campoPaleta = camposDoTipo(s.event_type_id).find(
          (f) => f.type === "paleta",
        );
        if (campoPaleta) valores = getValorAtual(s, campoPaleta.id);
      }
      (Array.isArray(valores) ? valores : []).forEach((c) => {
        const nome = nomeCor(c);
        counts[nome] = (counts[nome] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);
  };

  // Total de convidados a servir (soma de todos os eventos ativos)
  const totalConvidados = () =>
    submissions
      .filter((s) => s.status !== "Concluído")
      .reduce((sum, s) => sum + (s.numero_convidados || 0), 0);

  // Taxa de resposta dos formulários (preenchidos / total enviados)
  const taxaResposta = () => {
    if (!invites.length) return null;
    const preenchidos = invites.filter((i) => i.status === "Preenchido").length;
    return {
      preenchidos,
      total: invites.length,
      pct: Math.round((preenchidos / invites.length) * 100),
    };
  };

  // "Pipeline de Estados" é operacional (Recebido→Concluído) — só faz
  // sentido pós-sinal. Antes disso o status fica sempre em "Recebido"
  // por defeito (ver updateStatus em lib/clientes.js), o que inflava
  // esta barra com leads que ainda nem venderam, não com trabalho por
  // fazer.
  const posSinalAtivos = ativos.filter((s) => FASES_POS_SINAL.includes(s.fase));
  const pipelineData = STATUS_OPTIONS.map((status) => ({
    status,
    total: posSinalAtivos.filter((s) => s.status === status).length,
  })).filter((p) => p.total > 0);

  return (
    <motion.div
      key="tab-dashboard"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {/* ===== ZONA 1 — O essencial ===== */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        {/* Eventos ativos */}
        <div style={kpiCardStyle}>
          <p style={{ ...kpiValueStyle, color: "var(--gold)" }}>
            {ativos.filter((s) => s.status !== "Concluído").length}
          </p>
          <p style={kpiLabelStyle}>Eventos Activos</p>
        </div>

        {/* Total de convidados a servir */}
        <div style={kpiCardStyle}>
          <p style={{ ...kpiValueStyle, color: "#3B82F6" }}>
            {totalConvidados()}
          </p>
          <p style={kpiLabelStyle}>Convidados a Servir</p>
        </div>

        {/* Confirmados */}
        <div style={kpiCardStyle}>
          <p style={{ ...kpiValueStyle, color: "#22C55E" }}>
            {ativos.filter((s) => s.status === "Confirmado").length}
          </p>
          <p style={kpiLabelStyle}>Eventos Confirmados</p>
        </div>

        {/* Taxa de resposta dos formulários */}
        <div style={kpiCardStyle}>
          {taxaResposta() ? (
            <>
              <p style={{ ...kpiValueStyle, color: "var(--gold-dark)" }}>
                {taxaResposta().pct}%
              </p>
              <p style={kpiLabelStyle}>
                Formulários Preenchidos
                <br />
                <span style={{ fontSize: "10px", opacity: 0.7 }}>
                  {taxaResposta().preenchidos} de {taxaResposta().total}
                </span>
              </p>
            </>
          ) : (
            <>
              <p style={{ ...kpiValueStyle, color: "var(--gold-light)" }}>—</p>
              <p style={kpiLabelStyle}>Sem formulários ainda</p>
            </>
          )}
        </div>
      </div>

      {/* ===== ZONA 2 — O negócio em euros =====
          (O "Próximo evento" e o "A precisar de atenção" mudaram-se
          para o Início, onde são mais ricos e acionáveis. O Dashboard
          é o retrato: aqui vive o dinheiro.) */}
      <p
        style={{
          fontSize: "12px",
          fontWeight: "600",
          color: "var(--gray-mid)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          margin: "8px 0 12px 4px",
        }}
      >
        O negócio em euros
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            ...kpiCardStyle,
            backgroundColor: "#F0FDF4",
            border: "1px solid #BBF7D0",
          }}
        >
          <p style={{ ...kpiValueStyle, color: "#166534" }}>
            {formatarEuros(somaValores(garantidosPorRealizar))}
          </p>
          <p style={{ ...kpiLabelStyle, color: "#166534" }}>
            Garantido (por realizar) · {garantidosPorRealizar.length}{" "}
            {garantidosPorRealizar.length === 1 ? "evento" : "eventos"}
          </p>
        </div>
        <div style={kpiCardStyle}>
          <p style={{ ...kpiValueStyle, color: "var(--gold-dark)" }}>
            {formatarEuros(somaValores(emNegociacaoLista))}
          </p>
          <p style={kpiLabelStyle}>
            Em negociação · {emNegociacaoLista.length}{" "}
            {emNegociacaoLista.length === 1 ? "evento" : "eventos"}
          </p>
        </div>
        <div style={kpiCardStyle}>
          <p style={{ ...kpiValueStyle, color: "var(--charcoal)" }}>
            {formatarEuros(somaValores(concluidosAno))}
          </p>
          <p style={kpiLabelStyle}>Concluído em {anoAtual}</p>
        </div>
        <div style={kpiCardStyle}>
          <p style={{ ...kpiValueStyle, color: "var(--charcoal)" }}>
            {formatarEuros(Math.round(valorMedio))}
          </p>
          <p style={kpiLabelStyle}>Valor médio por evento</p>
        </div>
      </div>

      {/* Receita por mês (€) */}
      <ChartCard title="Receita por Mês (€)">
        {receitaPorMes().length === 0 ? (
          <EmptyChart />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={receitaPorMes()}
                margin={{ top: 24, right: 10, left: -10, bottom: 0 }}
              >
                <XAxis
                  dataKey="mes"
                  tick={{ fontSize: 12, fill: "var(--gray-mid)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "var(--gray-mid)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Bar
                  dataKey="feito"
                  fill="var(--gold)"
                  radius={[6, 6, 0, 0]}
                  name="Garantido"
                  label={{
                    position: "top",
                    fontSize: 11,
                    fill: "var(--gold-dark)",
                    fontWeight: 600,
                    formatter: (v) => (v > 0 ? formatarEuros(v) : ""),
                  }}
                />
                <Bar
                  dataKey="possivel"
                  fill="#EAD9AC"
                  radius={[6, 6, 0, 0]}
                  name="Possível"
                  label={{
                    position: "top",
                    fontSize: 11,
                    fill: "#B08A2E",
                    formatter: (v) => (v > 0 ? `${formatarEuros(v)}?` : ""),
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
            <p
              style={{
                fontSize: "11px",
                color: "var(--gray-mid)",
                fontStyle: "italic",
                margin: "6px 0 0 0",
              }}
            >
              Dourado cheio = garantido/concluído · claro com "?" = em
              negociação (possível)
            </p>
          </>
        )}
      </ChartCard>

      {/* ===== ZONA 2.5 — Por tipo de evento ===== */}
      {(() => {
        // Cruza submissions com eventTypes para contar quantos eventos
        // existem por tipo — só mostra tipos com pelo menos 1 evento
        // (tipos sem eventos não aparecem, não polui o dashboard).
        // Eventos SEM modelo (tipo "Outro" da captação, por associar
        // na ficha) entram no bucket "Por classificar".
        const porClassificar = ativos.filter((s) => !s.event_type_id).length;
        const contagemPorTipo = [
          ...eventTypes
            .map((et) => ({
              id: et.id,
              nome: et.nome,
              total: ativos.filter((s) => s.event_type_id === et.id).length,
            }))
            .filter((et) => et.total > 0),
          ...(porClassificar > 0
            ? [
                {
                  id: "__por_classificar",
                  nome: "Por classificar",
                  total: porClassificar,
                },
              ]
            : []),
        ].sort((a, b) => b.total - a.total);

        if (contagemPorTipo.length === 0) return null;

        const totalEventos = contagemPorTipo.reduce((s, et) => s + et.total, 0);

        return (
          <div style={{ marginBottom: "20px" }}>
            <p
              style={{
                fontSize: "10px",
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "var(--gray-mid)",
                margin: "0 0 12px 0",
              }}
            >
              Eventos por Tipo
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "10px",
              }}
            >
              {contagemPorTipo.map((et, i) => {
                const percentagem =
                  totalEventos > 0
                    ? Math.round((et.total / totalEventos) * 100)
                    : 0;
                const isPrincipal = i < 4; // destaque para os 4 com mais eventos

                return (
                  <div
                    key={et.id}
                    style={{
                      backgroundColor: "white",
                      borderRadius: "14px",
                      padding: "16px 18px",
                      boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
                      border: isPrincipal
                        ? "1px solid var(--gold-light)"
                        : "1px solid #F0EDE8",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "11px",
                        color: "var(--gray-mid)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        margin: "0 0 4px 0",
                        fontWeight: "500",
                      }}
                    >
                      {et.nome}
                    </p>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: "6px",
                        marginBottom: "10px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: isPrincipal ? "28px" : "22px",
                          fontWeight: "700",
                          fontFamily: "Playfair Display, serif",
                          color: "var(--gold)",
                          lineHeight: 1,
                        }}
                      >
                        {et.total}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--gray-mid)",
                        }}
                      >
                        {et.total === 1 ? "evento" : "eventos"}
                      </span>
                    </div>
                    {/* Barra de proporção */}
                    <div
                      style={{
                        height: "4px",
                        borderRadius: "999px",
                        backgroundColor: "#F5ECD7",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${percentagem}%`,
                          backgroundColor: "var(--gold)",
                          borderRadius: "999px",
                          transition: "width 0.5s ease",
                        }}
                      />
                    </div>
                    <p
                      style={{
                        fontSize: "10px",
                        color: "var(--gold-light)",
                        margin: "4px 0 0 0",
                        textAlign: "right",
                      }}
                    >
                      {percentagem}% do total
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ===== ZONA 3 — Tendências do negócio ===== */}

      {/* Eventos por mês */}
      <ChartCard title="Eventos por Mês">
        {eventosPorMes().length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={eventosPorMes()}
              margin={{ top: 24, right: 10, left: -20, bottom: 0 }}
            >
              <XAxis
                dataKey="mes"
                tick={{ fontSize: 12, fill: "var(--gray-mid)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: "var(--gray-mid)" }}
                axisLine={false}
                tickLine={false}
              />
              <Bar
                dataKey="total"
                fill="var(--gold)"
                radius={[6, 6, 0, 0]}
                name="Eventos"
                label={{
                  position: "top",
                  fontSize: 13,
                  fill: "var(--gold-dark)",
                  fontWeight: 600,
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Estilos mais pedidos */}
      <ChartCard title="Estilos Mais Pedidos">
        {estilosMaisPedidos().length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer
            width="100%"
            height={estilosMaisPedidos().length * 44 + 20}
          >
            <BarChart
              data={estilosMaisPedidos()}
              layout="vertical"
              margin={{ top: 0, right: 36, left: 10, bottom: 0 }}
            >
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="nome"
                width={130}
                tick={{ fontSize: 12, fill: "var(--charcoal)" }}
                axisLine={false}
                tickLine={false}
              />
              <Bar
                dataKey="valor"
                fill="var(--gold)"
                radius={[0, 6, 6, 0]}
                name="Pedidos"
                label={{
                  position: "right",
                  fontSize: 13,
                  fill: "var(--gold-dark)",
                  fontWeight: 600,
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Paletas mais populares */}
      <ChartCard title="Paletas Mais Populares">
        {paletasMaisPopulares().length === 0 ? (
          <EmptyChart />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {paletasMaisPopulares().map((p, index) => {
              const max = paletasMaisPopulares()[0].valor;
              const pct = Math.round((p.valor / max) * 100);
              return (
                <div key={p.nome}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "4px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        color: "var(--charcoal)",
                      }}
                    >
                      {p.nome}
                    </span>
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: "600",
                        color: "var(--gold-dark)",
                      }}
                    >
                      {p.valor}
                    </span>
                  </div>
                  <div
                    style={{
                      height: "8px",
                      borderRadius: "999px",
                      backgroundColor: "#F5ECD7",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        borderRadius: "999px",
                        backgroundColor:
                          GOLD_SHADES[index % GOLD_SHADES.length],
                        transition: "width 0.5s ease",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ChartCard>

      {/* Pipeline de estados — barras horizontais com valor visível */}
      <ChartCard title="Pipeline de Estados">
        {pipelineData.length === 0 ? (
          <EmptyChart />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {STATUS_OPTIONS.map((status) => {
              const total = posSinalAtivos.filter((s) => s.status === status).length;
              const max = posSinalAtivos.length || 1;
              const pct = Math.round((total / max) * 100);
              const colors = STATUS_COLORS[status];
              return (
                <div key={status}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "4px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        color: "var(--charcoal)",
                      }}
                    >
                      {status}
                    </span>
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: "600",
                        color: colors.color,
                      }}
                    >
                      {total}
                    </span>
                  </div>
                  <div
                    style={{
                      height: "8px",
                      borderRadius: "999px",
                      backgroundColor: "#F3F4F6",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        borderRadius: "999px",
                        backgroundColor: colors.color,
                        transition: "width 0.5s ease",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ChartCard>
    </motion.div>
  );
}
