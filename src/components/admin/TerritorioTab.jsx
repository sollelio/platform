import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useRotas } from "../../lib/rotasAdmin";
import {
  gerarAtlas,
  contextoAvaliacao,
  POPULACAO,
  dataCurta,
} from "../../lib/territorio/motor";
import { VERSAO_ZONAMENTO } from "../../lib/territorio/zonas";
import { obterDeslocacao } from "../../lib/obterDistancia";
import { calcularDeslocacao, TROCOS_PADRAO } from "../../lib/deslocacaoRegra";
import { formatarEuros } from "./orcamentos/orcamentoConfig";

// ============================================================
// TerritorioTab — o Atlas da Casa, Lote A (Revisão 2, aprovada
// 10/09/2026): SÓ FRASES, sem mapa, sem migração, sem libs novas.
//
// A interface fala por frases-conclusão determinísticas sobre os
// PEDIDOS REGISTADOS (honestidade epistemológica: o que não foi
// registado não está aqui, e o texto di-lo). O motor é puro
// (lib/territorio/motor.js, testado com a fotografia real); este
// ficheiro só veste as frases e o drawer «porquê».
//
// Explicitamente FORA deste lote (ficam no roadmap, atrás do
// checkpoint): mapa/MapLibre, heatmaps, 3D, deck.gl, simulação de
// núcleos, geocodificação. Nada disso foi antecipado.
// ============================================================

const CAMADA_ROTULO = {
  procura: "Procura",
  operacoes: "Operações",
  infraestrutura: "Infraestrutura",
  arrumacao: "Casa em ordem",
};

// A cor da CAMADA é forma de leitura, não decoração: procura = ouro
// (o comércio), operações = verde (o trabalho), arrumação = neutro.
const CAMADA_ESTILO = {
  procura: {
    color: "var(--gold-dark)",
    backgroundColor: "var(--superficie-quente)",
    border: "1px solid var(--gold-light)",
  },
  operacoes: {
    color: "var(--sucesso-texto)",
    backgroundColor: "var(--sucesso-fundo)",
    border: "1px solid var(--sucesso-borda)",
  },
  arrumacao: {
    color: "var(--gray-mid)",
    backgroundColor: "var(--superficie)",
    border: "1px solid var(--neutro-borda)",
  },
};

export default function TerritorioTab({ submissions = [], loading = false }) {
  const rotas = useRotas();
  // As deslocações conhecidas vivem dentro dos documentos de orçamento
  // (linhas «Deslocação» com km congelado) — o único fetch próprio do
  // separador. Guarda de sequência contra o dobro-mount do StrictMode.
  const [deslocacoes, setDeslocacoes] = useState([]);
  const pedidoRef = useRef(0);
  useEffect(() => {
    const meu = ++pedidoRef.current;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("documentos")
          .select("submission_id, dados, created_at")
          .eq("tipo", "orcamento")
          .order("created_at", { ascending: true });
        if (error) throw error;
        if (pedidoRef.current !== meu) return;
        // O mais recente por evento ganha; e só eventos que este ecrã
        // conhece (a lição da 108: nunca confiar que a RLS filtra a casa).
        const ids = new Set(submissions.map((s) => s.id));
        const porEvento = new Map();
        for (const doc of data || []) {
          if (!ids.has(doc.submission_id)) continue;
          const linha = (doc.dados?.linhas || []).find(
            (l) => l?.deslocacao && l.deslocacao.distanciaKm != null,
          );
          if (!linha) continue;
          porEvento.set(doc.submission_id, {
            submissionId: doc.submission_id,
            distanciaKm: Number(linha.deslocacao.distanciaKm),
            duracaoMin: linha.deslocacao.duracaoMin ?? null,
            nTrocos: linha.deslocacao.nTrocos || TROCOS_PADRAO,
            isento: !!linha.deslocacao.isento,
            valor: Number(linha.valor) || 0,
          });
        }
        setDeslocacoes([...porEvento.values()]);
      } catch (e) {
        // Sem deslocações o Atlas continua — as frases de estrada dormem.
        console.warn("Território sem deslocações dos orçamentos:", e);
      }
    })();
  }, [submissions]);

  const atlas = useMemo(
    () => gerarAtlas(submissions, { deslocacoes, hoje: new Date() }),
    [submissions, deslocacoes],
  );
  const contexto = useMemo(
    () => contextoAvaliacao(atlas.censo, deslocacoes),
    [atlas, deslocacoes],
  );

  const [porque, setPorque] = useState(null); // a frase aberta no drawer
  const [mostrarDormir, setMostrarDormir] = useState(false);

  if (loading && submissions.length === 0) {
    return (
      <div
        className="esqueleto"
        style={{ height: "260px", borderRadius: "16px" }}
      />
    );
  }

  const desde = atlas.censo.primeiroRegisto
    ? new Date(atlas.censo.primeiroRegisto).toLocaleDateString("pt-PT", {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{ maxWidth: "680px" }}
    >
      {/* Cabeçalho */}
      <p
        style={{
          fontSize: "10px",
          fontWeight: "700",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--gold-dark)",
          margin: "0 0 4px 0",
        }}
      >
        Território
      </p>
      <h2
        style={{
          fontSize: "22px",
          color: "var(--charcoal)",
          margin: "0 0 6px 0",
        }}
      >
        Atlas da Casa
      </h2>
      <p
        style={{
          fontSize: "12.5px",
          color: "var(--gray-mid)",
          lineHeight: 1.6,
          margin: "0 0 20px 0",
        }}
      >
        Conclusões sobre os <strong>{atlas.censo.n}</strong> {POPULACAO}
        {desde ? ` desde ${desde}` : ""} — o que não foi registado não está
        aqui. Cada frase mostra o seu porquê.
      </p>

      {/* Avaliar novo pedido — a decisão semanal */}
      <CartaoAvaliarPedido contexto={contexto} />

      {/* Frases ativas */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {atlas.ativas.map((f) => (
          <CartaoFrase key={f.id} frase={f} onPorque={() => setPorque(f)} />
        ))}
        {atlas.arrumacao.map((f) => (
          <CartaoFrase key={f.id} frase={f} onPorque={() => setPorque(f)} />
        ))}
      </div>

      {/* A dormir */}
      {atlas.adormecidas.length > 0 && (
        <div style={{ marginTop: "18px" }}>
          <button
            type="button"
            className="ligacao"
            onClick={() => setMostrarDormir((v) => !v)}
            style={{
              fontSize: "12px",
              fontWeight: "600",
              color: "var(--gray-mid)",
              textDecoration: "underline",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {mostrarDormir ? "▾" : "▸"} A dormir ({atlas.adormecidas.length}) —
            frases à espera de dados
          </button>
          {mostrarDormir && (
            <div
              style={{
                marginTop: "10px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              {atlas.adormecidas.map((d) => (
                <div
                  key={d.id}
                  style={{
                    border: "1px dashed var(--neutro-borda)",
                    borderRadius: "12px",
                    padding: "12px 14px",
                    opacity: 0.75,
                  }}
                >
                  <SeloCamada camada={d.camada} familia={d.familia} />
                  <p
                    style={{
                      fontSize: "12px",
                      fontStyle: "italic",
                      color: "var(--gray-mid)",
                      margin: "6px 0 0 0",
                      lineHeight: 1.55,
                    }}
                  >
                    {d.condicao}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rodapé de honestidade */}
      <p
        style={{
          fontSize: "10.5px",
          color: "var(--gray-mid)",
          fontStyle: "italic",
          margin: "22px 0 0 0",
          lineHeight: 1.6,
        }}
      >
        Zonamento {VERSAO_ZONAMENTO} · contagens em vez de percentagens até 20
        registos (um pedido novo mexia-as demasiado) · o mapa acorda no Lote B
        — as frases não precisam dele.
      </p>

      {porque && <DrawerPorque frase={porque} onFechar={() => setPorque(null)} rotas={rotas} />}
    </motion.div>
  );
}

function SeloCamada({ camada, familia }) {
  const estilo = CAMADA_ESTILO[camada] || CAMADA_ESTILO.arrumacao;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "9px",
        fontWeight: "700",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}
    >
      <span
        style={{
          padding: "2px 8px",
          borderRadius: "999px",
          ...estilo,
        }}
      >
        {CAMADA_ROTULO[camada] || camada}
      </span>
      <span style={{ color: "var(--gold-dark)", letterSpacing: "0.12em" }}>
        {familia}
      </span>
    </span>
  );
}

function CartaoFrase({ frase, onPorque }) {
  return (
    <div
      style={{
        backgroundColor: "var(--superficie)",
        border: "1px solid var(--borda)",
        borderRadius: "14px",
        padding: "14px 16px 12px",
        boxShadow: "var(--sombra-cartao)",
      }}
    >
      <SeloCamada camada={frase.camada} familia={frase.familia} />
      <p
        style={{
          fontSize: "15.5px",
          lineHeight: 1.55,
          color: "var(--charcoal)",
          margin: "8px 0 0 0",
        }}
      >
        {frase.segmentos.map((s, i) =>
          s.t === "n" ? (
            <strong
              key={i}
              style={{
                color: "var(--gold-dark)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {s.v}
            </strong>
          ) : (
            <span key={i}>{s.v}</span>
          ),
        )}
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
          marginTop: "10px",
          paddingTop: "8px",
          borderTop: "1px solid var(--borda)",
        }}
      >
        <button
          type="button"
          className="ligacao"
          onClick={onPorque}
          style={{
            fontSize: "12px",
            fontWeight: "600",
            color: "var(--gold-dark)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          porquê →
        </button>
        {frase.chip && (
          <span
            style={{
              fontSize: "10.5px",
              fontWeight: "600",
              color: "var(--gray-mid)",
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {frase.chip}
          </span>
        )}
      </div>
    </div>
  );
}

function DrawerPorque({ frase, onFechar, rotas }) {
  return (
    <div
      onClick={onFechar}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        backgroundColor: "var(--cortina)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <motion.div
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(460px, 100vw)",
          height: "100%",
          overflowY: "auto",
          backgroundColor: "var(--superficie)",
          borderLeft: "1px solid var(--borda)",
          padding: "22px 20px 40px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "10px",
            marginBottom: "12px",
          }}
        >
          <SeloCamada camada={frase.camada} familia={frase.familia} />
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            style={{
              background: "none",
              border: "none",
              fontSize: "17px",
              color: "var(--gray-mid)",
              cursor: "pointer",
              lineHeight: 1,
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        <p
          style={{
            fontSize: "15px",
            lineHeight: 1.55,
            color: "var(--charcoal)",
            margin: "0 0 16px 0",
          }}
        >
          {frase.segmentos.map((s, i) =>
            s.t === "n" ? (
              <strong key={i} style={{ color: "var(--gold-dark)" }}>
                {s.v}
              </strong>
            ) : (
              <span key={i}>{s.v}</span>
            ),
          )}
        </p>

        <Seccao titulo="Como foi calculado">
          <p style={pTexto}>{frase.porque.formula}</p>
          {frase.justificacao && (
            <p style={{ ...pTexto, fontStyle: "italic" }}>
              Regra do limiar: {frase.justificacao}
            </p>
          )}
        </Seccao>

        {frase.porque.linhas.length > 0 && (
          <Seccao titulo={`Os registos que contam (${frase.porque.linhas.length})`}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {frase.porque.linhas.map((l, i) =>
                l.id ? (
                  <Link
                    key={i}
                    to={rotas.evento(l.id)}
                    className="ligacao"
                    style={{
                      fontSize: "12px",
                      color: "var(--charcoal)",
                      textDecoration: "none",
                      padding: "7px 10px",
                      borderRadius: "8px",
                      border: "1px solid var(--borda)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {l.texto} <span style={{ color: "var(--gold-dark)" }}>→</span>
                  </Link>
                ) : (
                  <p
                    key={i}
                    style={{
                      ...pTexto,
                      margin: 0,
                      padding: "7px 10px",
                      borderRadius: "8px",
                      border: "1px solid var(--borda)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {l.texto}
                  </p>
                ),
              )}
            </div>
          </Seccao>
        )}

        {frase.porque.excluidos.length > 0 && (
          <Seccao titulo="Fora desta conta">
            {frase.porque.excluidos.map((e, i) => (
              <p key={i} style={pTexto}>
                · {e}
              </p>
            ))}
          </Seccao>
        )}

        {frase.porque.notas.length > 0 && (
          <Seccao titulo="Notas de honestidade">
            {frase.porque.notas.map((n, i) => (
              <p key={i} style={pTexto}>
                · {n}
              </p>
            ))}
          </Seccao>
        )}

        <p
          style={{
            fontSize: "10px",
            color: "var(--gray-mid)",
            marginTop: "18px",
            fontStyle: "italic",
          }}
        >
          Tabela de zonamento {VERSAO_ZONAMENTO}.
        </p>
      </motion.div>
    </div>
  );
}

const pTexto = {
  fontSize: "12.5px",
  lineHeight: 1.6,
  color: "var(--gray-mid)",
  margin: "0 0 8px 0",
};

function Seccao({ titulo, children }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <p
        style={{
          fontSize: "10px",
          fontWeight: "700",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--gold-dark)",
          margin: "0 0 6px 0",
        }}
      >
        {titulo}
      </p>
      {children}
    </div>
  );
}

// ------------------------------------------------------------
// «Avaliar novo pedido» — a única decisão geográfica semanal: chegou
// um interessado de X, aceito e a que preço? Km on-demand pela porta
// única (obterDeslocacao) + comparação com o censo dos registos.
// ------------------------------------------------------------
function CartaoAvaliarPedido({ contexto }) {
  const { interessados, kmsConhecidos, valorTipico } = contexto;
  const [escolhido, setEscolhido] = useState("");
  const [resultado, setResultado] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  if (interessados.length === 0) return null;

  const alvo = interessados.find((p) => p.id === escolhido) || null;

  const calcular = async () => {
    if (!alvo || carregando) return;
    setCarregando(true);
    setErro(null);
    setResultado(null);
    try {
      const r = await obterDeslocacao(alvo.localidadeTexto);
      const calc = calcularDeslocacao({
        distanciaKm: r.km,
        nTrocos: TROCOS_PADRAO,
        isento: false,
      });
      setResultado({ km: r.km, duracaoMin: r.duracaoMin, custo: calc.custoFinal });
    } catch (e) {
      setErro(e.message);
    }
    setCarregando(false);
  };

  const maisLonge = resultado
    ? kmsConhecidos.filter((k) => k >= resultado.km).length
    : 0;
  const peso =
    resultado && valorTipico
      ? Math.round((resultado.custo / valorTipico) * 100)
      : null;

  return (
    <div
      style={{
        backgroundColor: "var(--superficie-quente)",
        border: "1px solid var(--gold-light)",
        borderRadius: "14px",
        padding: "14px 16px",
        marginBottom: "14px",
      }}
    >
      <SeloCamada camada="procura" familia="Avaliar novo pedido" />
      <p
        style={{
          fontSize: "12.5px",
          color: "var(--gray-mid)",
          margin: "8px 0 10px 0",
          lineHeight: 1.55,
        }}
      >
        Tens {interessados.length} pedido{interessados.length === 1 ? "" : "s"}{" "}
        em conversa com localidade — vê quanto custa a estrada antes de dar o
        preço. Os km contam-se da mesma base que os teus orçamentos.
      </p>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <select
          value={escolhido}
          onChange={(e) => {
            setEscolhido(e.target.value);
            setResultado(null);
            setErro(null);
          }}
          style={{
            flex: "1 1 200px",
            padding: "8px 10px",
            borderRadius: "8px",
            border: "1.5px solid var(--gold-light)",
            fontSize: "12.5px",
            backgroundColor: "var(--superficie)",
            color: "var(--charcoal)",
          }}
        >
          <option value="">Escolher pedido...</option>
          {interessados.map((p) => (
            <option key={p.id} value={p.id}>
              {p.localidadeTexto} · {dataCurta(p.dataEvento)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={calcular}
          disabled={!alvo || carregando}
          className="acao"
          style={{
            padding: "8px 16px",
            borderRadius: "8px",
            fontSize: "12.5px",
            fontWeight: "600",
            border: "1.5px solid var(--gold)",
            backgroundColor: "var(--superficie)",
            color: !alvo || carregando ? "var(--gray-mid)" : "var(--gold-dark)",
            cursor: !alvo || carregando ? "not-allowed" : "pointer",
          }}
        >
          {carregando ? "A calcular..." : "Calcular km"}
        </button>
      </div>
      {erro && (
        <p style={{ fontSize: "12px", color: "var(--perigo-texto)", margin: "10px 0 0" }}>
          {erro} — escreve os km no painel de deslocação do orçamento.
        </p>
      )}
      {resultado && (
        <p
          style={{
            fontSize: "13px",
            color: "var(--charcoal)",
            margin: "12px 0 0",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "var(--gold-dark)" }}>
            {resultado.km} km
          </strong>{" "}
          de estrada
          {resultado.duracaoMin ? ` (≈${resultado.duracaoMin} min por troço)` : ""} —
          pela regra, a deslocação vale{" "}
          <strong style={{ color: "var(--gold-dark)" }}>
            {formatarEuros(resultado.custo)}
          </strong>{" "}
          (2 troços)
          {peso !== null ? `, ≈${peso}% do teu valor típico de ${formatarEuros(valorTipico)}` : ""}
          .{" "}
          {kmsConhecidos.length > 0
            ? maisLonge > 0
              ? `${maisLonge} dos teus ${kmsConhecidos.length} orçamentos com km ficaram tão ou mais longe.`
              : `Nenhum dos teus ${kmsConhecidos.length} orçamentos com km ficou tão longe — seria o novo alcance.`
            : ""}
        </p>
      )}
    </div>
  );
}
