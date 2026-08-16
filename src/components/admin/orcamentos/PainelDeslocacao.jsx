import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Icone } from "../Navegacao";
import { inputStyle, miniLabel, formatarEuros } from "./orcamentoConfig";
import { calcularDeslocacao, TROCOS_PADRAO } from "../../../lib/deslocacaoRegra";
import { obterDistancia, LOCALIDADES_MOCK } from "../../../lib/obterDistancia";

// ============================================================
// PainelDeslocacao — o painel "Cálculo de deslocação" que aparece
// dentro de uma linha de orçamento quando o serviço é "Deslocação".
// Handoff de design: Downloads/design_handoff_deslocacao/README.md.
//
// `onAtualizar` é o MESMO callback que LinhaServicoEditor passa a
// qualquer outro campo da linha (GerarOrcamento.jsx) — sempre que o
// custo final muda, escrevemos { valor: custoFinal } por aqui. Sem
// caminho paralelo de estado; o Total do orçamento já recalcula
// sozinho a partir de `linhas` (useMemo existente).
//
// A régua é sempre proporcional à distância ATUAL (não a uma escala
// fixa): largura do troço "incluído" = kmIncluidos / max(distância,
// kmIncluidos). Assim 20km mostra ~25% tramado + 75% dourado, e uma
// distância dentro do raio enche a régua toda de tramado sem dourado.
// ============================================================

const EASE = [0.22, 1, 0.36, 1];

// Chip "morada inválida" dispara o estado ERRO de propósito — não é
// uma morada real, é o gatilho de teste que o próprio design pede.
const MORADA_TESTE_INVALIDA = "Endereço Desconhecido 999";

const formatKm = (n) => {
  const arredondado = Math.round(n * 10) / 10;
  return Number.isInteger(arredondado) ? String(arredondado) : arredondado.toFixed(1);
};

export default function PainelDeslocacao({ linha, moradaPrefill, onAtualizar }) {
  // Hidrata do que foi persistido na linha (se este evento já tinha um
  // cálculo de deslocação gravado) — só na PRIMEIRA renderização deste
  // componente (o painel remonta de cada vez que a linha entra em
  // "deslocacao", ver AnimatePresence em GerarOrcamento.jsx), por isso
  // o initializer do useState é o sítio certo: nunca mais relê depois.
  //
  // Prioridade da morada inicial: 1) o que já foi calculado/gravado
  // NESTA linha; 2) a morada do PRÓPRIO evento (campo com papel
  // "morada" no modelo, ou os campos ad-hoc antigos — ver
  // getResumoSubmissao) — poupa a Nádia de a reescrever à mão numa
  // linha nova; 3) em branco. Nunca dispara o cálculo sozinho — só
  // pré-preenche o texto, o clique em "Calcular distância" continua a
  // ser dela.
  const persistido = linha?.deslocacao;
  const [morada, setMorada] = useState(persistido?.morada || moradaPrefill || "");
  const [distancia, setDistancia] = useState(() => {
    if (persistido?.distanciaKm == null) return "";
    // distâncias CALCULADAS antes da regra dos km inteiros ficaram
    // gravadas com decimais (ex.: 6,5) — ao reabrir mostram-se já
    // redondas (persistem na primeira edição real, nunca ao montar);
    // o que foi escrito à mão fica tal como foi escrito
    return String(
      persistido.origem === "auto"
        ? Math.round(persistido.distanciaKm)
        : persistido.distanciaKm,
    );
  }); // string do input; "" = sem valor
  const [origem, setOrigem] = useState(persistido?.origem || null); // null | "auto" | "manual"
  const [nTrocos, setNTrocos] = useState(persistido?.nTrocos || TROCOS_PADRAO);
  const [isento, setIsento] = useState(persistido?.isento || false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  const distanciaNum = distancia === "" ? undefined : Number(distancia);
  const calc = calcularDeslocacao({ distanciaKm: distanciaNum, nTrocos, isento });

  // onAtualizar muda de identidade a cada render do pai (é uma arrow
  // function inline) — a ref evita que isso reexecute o efeito abaixo;
  // só os campos abaixo é que devem disparar a escrita.
  const onAtualizarRef = useRef(onAtualizar);
  useEffect(() => {
    onAtualizarRef.current = onAtualizar;
  });

  // Nunca escreve ao montar: abrir o painel (linha nova OU reabrir uma
  // linha já persistida) não deve, por si só, tocar no Valor (€) — só
  // uma alteração real (morada, km, troços, isenção) é que escreve.
  // A guarda compara com o ÚLTIMO snapshot escrito, não com um booleano
  // de "já montou": o StrictMode (dev) corre o efeito duas vezes na
  // montagem e um booleano deixava a segunda passagem escrever — era
  // por aí que, em `npm run dev`, uma linha de Deslocação anterior a
  // esta funcionalidade via o Valor (€) zerado só por abrir o editor.
  const ultimoEscritoRef = useRef(null);
  useEffect(() => {
    const deslocacao = {
      morada,
      distanciaKm: distanciaNum ?? null,
      origem,
      nTrocos,
      isento,
    };
    const atual = JSON.stringify(deslocacao);
    if (ultimoEscritoRef.current === atual) return;
    const primeira = ultimoEscritoRef.current === null;
    ultimoEscritoRef.current = atual;
    if (primeira) return;
    onAtualizarRef.current?.({ valor: calc.custoFinal, deslocacao });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morada, distancia, origem, nTrocos, isento]);

  const calcularParaMorada = async (nome) => {
    if (!nome || !nome.trim() || carregando) return;
    setMorada(nome);
    setCarregando(true);
    setErro(null);
    try {
      const km = await obterDistancia(nome);
      setDistancia(String(km));
      setOrigem("auto");
    } catch (e) {
      setErro(e.message);
      setDistancia("");
      setOrigem(null);
    }
    setCarregando(false);
  };

  const aoEditarDistancia = (valor) => {
    setDistancia(valor);
    setOrigem(valor === "" ? null : "manual");
    setErro(null); // editar à mão é exatamente o que o banner pedia — não insiste
  };

  // ---------- Régua ----------
  const totalRef = calc.temDistancia
    ? Math.max(calc.distanciaKm, calc.kmIncluidos)
    : calc.kmIncluidos;
  const pctTramado = Math.min(100, (calc.kmIncluidos / totalRef) * 100);
  const pctDourado = 100 - pctTramado;
  const reguaComDados = calc.temDistancia && !carregando;

  return (
    <div
      style={{
        background: "var(--superficie)",
        border: "1px solid var(--gold-light)",
        borderRadius: "14px",
        padding: "18px 18px 16px",
        marginBottom: "10px",
      }}
    >
      {/* Cabeçalho */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "16px",
        }}
      >
        <span style={{ color: "var(--gold)", fontSize: "13px" }}>◆</span>
        <span
          style={{
            fontSize: "11px",
            fontWeight: "700",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--gold-dark)",
          }}
        >
          Cálculo de deslocação
        </span>
      </div>

      {/* Morada */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginBottom: "6px",
        }}
      >
        <label style={{ ...miniLabel, marginBottom: 0 }}>Morada do evento</label>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "11px",
            color: "var(--gray-mid)",
          }}
        >
          <Icone nome="olhoFechado" tamanho={12} />
          não aparece no orçamento
        </span>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <input
          style={{ ...inputStyle, flex: "1 1 200px" }}
          value={morada}
          onChange={(e) => setMorada(e.target.value)}
          placeholder="Rua, localidade..."
        />
        <button
          type="button"
          onClick={() => calcularParaMorada(morada)}
          disabled={carregando || !morada.trim()}
          style={{
            padding: "9px 20px",
            borderRadius: "999px",
            fontSize: "13px",
            fontWeight: "600",
            border: "1.5px solid var(--gold)",
            color: carregando ? "var(--gray-mid)" : "var(--gold)",
            backgroundColor: "var(--superficie)",
            cursor: carregando || !morada.trim() ? "not-allowed" : "pointer",
            opacity: !morada.trim() && !carregando ? 0.6 : 1,
            whiteSpace: "nowrap",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {carregando && <Spinner />}
          {carregando ? "A calcular…" : "Calcular distância"}
        </button>
      </div>

      {/* Chips de sugestão — atalhos reais (destinos comuns) e também
          o gatilho de teste dos 5 estados do design. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          flexWrap: "wrap",
          marginTop: "9px",
        }}
      >
        <span style={{ fontSize: "11px", color: "var(--gray-mid)" }}>
          sugestões:
        </span>
        {LOCALIDADES_MOCK.map((nome) => (
          <button
            key={nome}
            type="button"
            disabled={carregando}
            onClick={() => calcularParaMorada(nome)}
            style={chipStyle}
          >
            {nome}
          </button>
        ))}
        <button
          type="button"
          disabled={carregando}
          onClick={() => calcularParaMorada(MORADA_TESTE_INVALIDA)}
          style={{ ...chipStyle, borderStyle: "dashed", color: "var(--gray-mid)" }}
        >
          morada inválida
        </button>
      </div>

      {/* Banner de erro — âmbar, nunca vermelho, nunca bloqueia */}
      {erro && (
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "flex-start",
            background: "var(--aviso-fundo)",
            border: "1px solid var(--aviso-borda)",
            borderRadius: "10px",
            padding: "10px 12px",
            margin: "12px 0 0",
            color: "var(--aviso-texto)",
            fontSize: "12.5px",
            lineHeight: 1.55,
          }}
        >
          <span style={{ flexShrink: 0, marginTop: "1px" }}>
            <Icone nome="alerta" tamanho={15} />
          </span>
          <span>
            Não consegui obter a distância desta morada automaticamente. Sem
            problema — escreve os km à mão no campo abaixo ↓
          </span>
        </div>
      )}

      {/* Distância à base + Nº de viagens */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          flexWrap: "wrap",
          marginTop: "14px",
        }}
      >
        <div style={{ flex: "1 1 170px" }}>
          <label style={miniLabel}>Distância à base</label>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input
                type="number"
                min="0"
                value={distancia}
                onChange={(e) => aoEditarDistancia(e.target.value)}
                placeholder="—"
                style={{ ...inputStyle, paddingRight: "34px" }}
              />
              <span
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: "12px",
                  color: "var(--gray-mid)",
                  pointerEvents: "none",
                }}
              >
                km
              </span>
            </div>
            {origem && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  flexShrink: 0,
                  padding: "5px 10px",
                  borderRadius: "999px",
                  fontSize: "11px",
                  fontWeight: "600",
                  whiteSpace: "nowrap",
                  // Fundos fora da paleta (#FBF0D9 / #F3F1EC) — o par
                  // inteiro fica literal, fixado nos claros, para não
                  // ficar letra clara sobre fundo claro no escuro
                  // (o mesmo gesto da ConsultaDeslocacao).
                  ...(origem === "auto"
                    ? {
                        background: "#FBF0D9",
                        border: "1px solid #E8D5A3",
                        color: "#A07830",
                      }
                    : {
                        background: "#F3F1EC",
                        border: "1px solid #DCD5C4",
                        color: "#6B6B6B",
                      }),
                }}
              >
                {origem === "auto" && <Icone nome="check" tamanho={9} />}
                {origem === "auto" ? "automático" : "manual"}
              </span>
            )}
          </div>
        </div>

        <div style={{ flex: "1 1 200px" }}>
          <label style={miniLabel}>Nº de viagens</label>
          <div
            style={{
              display: "flex",
              border: "1.5px solid var(--gold-light)",
              borderRadius: "10px",
              overflow: "hidden",
            }}
          >
            {[2, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNTrocos(n)}
                style={{
                  flex: 1,
                  padding: "9px 10px",
                  fontSize: "12.5px",
                  fontWeight: "600",
                  border: "none",
                  borderLeft: n === 4 ? "1.5px solid var(--gold-light)" : "none",
                  backgroundColor: nTrocos === n ? "var(--gold)" : "var(--superficie)",
                  color: nTrocos === n ? "var(--texto-sobre-ouro)" : "var(--charcoal)",
                  cursor: "pointer",
                }}
              >
                {n} troços
              </button>
            ))}
          </div>
          <p style={{ fontSize: "11px", color: "var(--gray-mid)", margin: "5px 0 0" }}>
            {nTrocos === 4
              ? "Montagem véspera + levantamento no dia seguinte."
              : "Ida e volta no próprio dia."}
          </p>
        </div>
      </div>

      {/* Régua visual */}
      <div style={{ marginTop: "18px", opacity: isento ? 0.55 : 1 }}>
        {/* A pista da régua (aro #ECE3CE, vazio #F1ECDE e o tramado
            lá em baixo) está fora da paleta — fica literal, ilha
            clara nos dois modos, e segue na lista para o Hélio. */}
        <div
          style={{
            display: "flex",
            height: "11px",
            borderRadius: "999px",
            overflow: "hidden",
            border: "1px solid #ECE3CE",
          }}
        >
          {carregando ? (
            <div style={{ width: "100%", ...tramadoCss }} />
          ) : reguaComDados ? (
            <>
              <div style={{ width: `${pctTramado}%`, ...tramadoCss }} />
              <motion.div
                initial={false}
                animate={{ width: `${pctDourado}%` }}
                transition={{ duration: 0.6, ease: EASE }}
                style={{
                  background: "linear-gradient(90deg, var(--gold-light), var(--gold))",
                }}
              />
            </>
          ) : (
            <div style={{ width: "100%", background: "#F1ECDE" }} />
          )}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "6px",
            fontSize: "11.5px",
            color: "var(--gray-mid)",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <Ponto cor="var(--gold-dark)" /> Base · 0 km
          </span>
          <span>
            Evento · {calc.temDistancia ? `${formatKm(calc.distanciaKm)} km` : "— km"}
          </span>
        </div>

        {!calc.temDistancia && !carregando && !erro && (
          <p
            style={{
              fontFamily: "Playfair Display, serif",
              fontStyle: "italic",
              fontSize: "13px",
              color: "var(--gray-mid)",
              margin: "10px 0 0",
            }}
          >
            Introduz a morada ou os km para veres o cálculo dos {calc.kmIncluidos}{" "}
            km grátis.
          </p>
        )}

        {reguaComDados && calc.dentroDoRaio && (
          <div
            style={{
              display: "inline-block",
              marginTop: "12px",
              padding: "6px 14px",
              borderRadius: "999px",
              background: "var(--sucesso-fundo-forte)",
              // O aro #BBE5C8 está fora da família de sucesso da
              // identidade (#BBF7D0) — fica literal e segue na lista
              // para o Hélio.
              border: "1px solid #BBE5C8",
              color: "var(--sucesso-texto)",
              fontSize: "12px",
              fontWeight: "600",
            }}
          >
            Dentro do raio de {calc.kmIncluidos} km · sem custo
          </div>
        )}

        {reguaComDados && !calc.dentroDoRaio && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
              marginTop: "12px",
            }}
          >
            <Pastilha>{calc.kmIncluidos} km incluídos</Pastilha>
            <Simbolo>+</Simbolo>
            <Pastilha>{formatKm(calc.kmForaDoRaio)} km fora do raio</Pastilha>
            <Simbolo>×</Simbolo>
            <Pastilha>{calc.euroPorKm} €/km</Pastilha>
            <Simbolo>=</Simbolo>
            <Pastilha dourada>{formatarEuros(calc.custoCalculado)}</Pastilha>
          </div>
        )}
      </div>

      {/* Custo + isenção */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "14px",
          marginTop: "20px",
        }}
      >
        <div>
          <label style={miniLabel}>Custo de deslocação</label>
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
            {carregando ? (
              <DotsCarregando />
            ) : (
              <span
                style={{
                  fontFamily: "Playfair Display, serif",
                  fontSize: "32px",
                  fontWeight: "600",
                  lineHeight: 1,
                  // O verde #16A34A do «oferecido» está fora da família
                  // de sucesso da identidade (#22C55E/#166534) — fica
                  // literal e segue na lista para o Hélio.
                  color: !calc.temDistancia
                    ? "var(--gray-mid)"
                    : isento
                      ? "#16A34A"
                      : "var(--gold-dark)",
                }}
              >
                {calc.temDistancia ? formatarEuros(calc.custoFinal) : "— €"}
              </span>
            )}
            {isento && calc.custoCalculado > 0 && (
              <span
                style={{
                  fontFamily: "Playfair Display, serif",
                  fontSize: "17px",
                  color: "var(--gray-mid)",
                  textDecoration: "line-through",
                }}
              >
                {formatarEuros(calc.custoCalculado)}
              </span>
            )}
          </div>
          {isento && (
            <p style={{ fontSize: "12px", color: "var(--sucesso-texto)", fontWeight: "600", margin: "3px 0 0" }}>
              Oferecido ao cliente
            </p>
          )}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
          <span style={{ fontSize: "13px", color: "var(--charcoal)" }}>
            Oferecer a deslocação
          </span>
          <Interruptor ligado={isento} onChange={setIsento} />
        </label>
      </div>

      <p
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "11.5px",
          color: "var(--gray-mid)",
          marginTop: "12px",
        }}
      >
        <Icone nome="setaBaixo" tamanho={12} />
        Este valor preenche automaticamente o campo <strong>VALOR (€)</strong>{" "}
        desta linha.
      </p>
    </div>
  );
}

// ---------- sub-componentes visuais ----------

// O tramado dos km incluídos está fora da paleta — fica literal (a
// pista da régua é ilha clara nos dois modos; ver comentário lá em cima).
const tramadoCss = {
  backgroundImage:
    "repeating-linear-gradient(135deg, #EDE2C0 0px, #EDE2C0 5px, #F7F0DD 5px, #F7F0DD 10px)",
};

const chipStyle = {
  padding: "5px 12px",
  borderRadius: "999px",
  border: "1px solid var(--gold-light)",
  backgroundColor: "var(--superficie)",
  color: "var(--charcoal)",
  fontSize: "11.5px",
  cursor: "pointer",
};

function Ponto({ cor }) {
  return (
    <span
      style={{
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: cor,
        display: "inline-block",
      }}
    />
  );
}

function Pastilha({ children, dourada = false }) {
  return (
    <span
      style={{
        padding: "5px 11px",
        borderRadius: "8px",
        fontSize: "12px",
        fontWeight: "600",
        whiteSpace: "nowrap",
        ...(dourada
          ? {
              // Gradiente fora da paleta (#FFFDF5→#FBF2D6) — o par
              // inteiro fica literal, fixado nos claros, para não
              // ficar letra clara sobre fundo claro no escuro.
              background: "linear-gradient(160deg, #FFFDF5, #FBF2D6)",
              border: "1px solid #C9A84C",
              color: "#A07830",
              fontFamily: "Playfair Display, serif",
              fontSize: "14px",
            }
          : {
              background: "var(--superficie-quente)",
              border: "1px solid var(--borda)",
              color: "var(--charcoal)",
            }),
      }}
    >
      {children}
    </span>
  );
}

function Simbolo({ children }) {
  return (
    <span style={{ fontSize: "12px", color: "var(--gray-mid)" }}>{children}</span>
  );
}

function Spinner() {
  return (
    <motion.span
      animate={{ rotate: 360 }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
      style={{
        width: "13px",
        height: "13px",
        borderRadius: "50%",
        border: "2px solid var(--gold-light)",
        borderTopColor: "var(--gold)",
        display: "inline-block",
      }}
    />
  );
}

function DotsCarregando() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: "var(--gold)",
            display: "inline-block",
          }}
        />
      ))}
      <span
        style={{
          fontFamily: "Playfair Display, serif",
          fontSize: "28px",
          color: "var(--gold)",
          marginLeft: "4px",
        }}
      >
        €
      </span>
    </span>
  );
}

function Interruptor({ ligado, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      onClick={() => onChange(!ligado)}
      style={{
        width: "40px",
        height: "22px",
        borderRadius: "999px",
        border: "none",
        padding: "2px",
        // Verde #16A34A e taupe #DCD5C4 fora da paleta — ficam
        // literais (o botão branco por cima lê-se nos dois modos)
        // e seguem na lista para o Hélio.
        background: ligado ? "#16A34A" : "#DCD5C4",
        cursor: "pointer",
        display: "flex",
        justifyContent: ligado ? "flex-end" : "flex-start",
        transition: "background 0.2s",
      }}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        style={{
          width: "18px",
          height: "18px",
          borderRadius: "50%",
          background: "white",
          display: "block",
          boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
        }}
      />
    </button>
  );
}
