import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { adaptadorJSON } from "../../lib/importacao/adaptadores";
import { normalizarPlano } from "../../lib/importacao/normalizar";
import { validarPlano } from "../../lib/importacao/validar";
import { executarPlano } from "../../lib/importacao/executar";

// ============================================================
// ImportarTab — "Importar clientes antigos".
// FASE 1 (dry-run): passos 1–4 do fluxo — colar/carregar JSON,
// validação, pré-visualização expansível e seleção por cliente.
// NADA é escrito na BD nesta fase: o botão de importar está
// desativado até a Fase 2 (execução via função Postgres, transação
// por cliente).
//
// A inteligência (interpretar PDFs, WhatsApp, emails) acontece FORA
// da app, num chat de IA, com o prompt de docs/prompt-migracao.md.
// Aqui só entra JSON estruturado.
// ============================================================

const PASSOS = [
  "Colar ou carregar JSON",
  "Validação",
  "Pré-visualização",
  "Seleção",
  "Importação",
];

const microLabel = {
  fontSize: "11px",
  fontWeight: "600",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--gold-dark)",
  margin: "0 0 8px 0",
};

const cartao = {
  backgroundColor: "white",
  borderRadius: "14px",
  padding: "18px",
  border: "1px solid var(--gold-light)",
  boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
  marginBottom: "16px",
};

export default function ImportarTab({ eventTypes = [], onModelosCriados }) {
  const [texto, setTexto] = useState("");
  const [aValidar, setAValidar] = useState(false);
  const [erroEntrada, setErroEntrada] = useState(null);
  const [resultado, setResultado] = useState(null); // { plano, contagens, tiposDesconhecidos }
  const [expandido, setExpandido] = useState({}); // chave → bool
  const [criarModelos, setCriarModelos] = useState(true);
  const [aImportar, setAImportar] = useState(false);
  const [progresso, setProgresso] = useState(null); // nome do cliente em curso
  const [relatorio, setRelatorio] = useState(null);
  const inputFicheiro = useRef(null);

  const carregarFicheiro = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      setTexto(String(leitor.result || ""));
      setResultado(null);
      setErroEntrada(null);
    };
    leitor.onerror = () =>
      setErroEntrada("Não foi possível ler o ficheiro. Tenta novamente.");
    leitor.readAsText(f);
  };

  const validar = async () => {
    setErroEntrada(null);
    setResultado(null);
    setRelatorio(null);
    const { bruto, erro } = adaptadorJSON(texto);
    if (erro) {
      setErroEntrada(erro);
      return;
    }
    setAValidar(true);
    try {
      const plano = normalizarPlano(bruto);
      const res = await validarPlano(plano, eventTypes);
      setResultado(res);
      setExpandido({});
    } catch (e) {
      console.error(e);
      setErroEntrada(
        "A validação falhou a ler a base de dados — verifica a ligação e tenta novamente.",
      );
    }
    setAValidar(false);
  };

  // Passo 5 — escrita real (Fase 2): transação por cliente na função
  // Postgres. Depois de uma execução, o botão bloqueia — reimportar o
  // mesmo ficheiro duplicaria os dados.
  const importar = async () => {
    setAImportar(true);
    setRelatorio(null);
    try {
      const rel = await executarPlano(resultado, {
        criarModelos,
        aoProgresso: (nome) => setProgresso(nome),
      });
      setRelatorio(rel);
      if (rel.modelosCriados > 0 && onModelosCriados) onModelosCriados();
    } catch (e) {
      console.error(e);
      setRelatorio({ falhaGeral: e.message || "Falha inesperada." });
    }
    setProgresso(null);
    setAImportar(false);
  };

  const alternarCliente = (chave) => {
    setResultado((prev) => {
      if (!prev) return prev;
      const clientes = prev.plano.clientes.map((c) =>
        c.chave === chave && c.erros.length === 0
          ? { ...c, selecionado: !c.selecionado }
          : c,
      );
      return { ...prev, plano: { ...prev.plano, clientes } };
    });
  };

  const marcarTodos = (valor) => {
    setResultado((prev) => {
      if (!prev) return prev;
      const clientes = prev.plano.clientes.map((c) =>
        c.erros.length === 0 ? { ...c, selecionado: valor } : c,
      );
      return { ...prev, plano: { ...prev.plano, clientes } };
    });
  };

  const selecionados = resultado
    ? resultado.plano.clientes.filter((c) => c.selecionado)
    : [];

  return (
    <motion.div
      key="tab-importar"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <h2
        style={{
          fontSize: "18px",
          fontFamily: "Playfair Display, serif",
          color: "var(--charcoal)",
          margin: "0 0 4px 0",
        }}
      >
        Importar clientes antigos
      </h2>
      <p
        style={{
          fontSize: "12px",
          color: "var(--gray-mid)",
          margin: "0 0 18px 0",
          lineHeight: 1.6,
        }}
      >
        Junta os documentos de cada cliente num chat de IA com o prompt de
        migração (docs/prompt-migracao.md), cola aqui o JSON devolvido e a
        app cria o estado final — cliente, eventos, formulários e
        documentos — como se tivessem percorrido toda a jornada.
      </p>

      {/* Indicador de passos */}
      <div
        style={{
          display: "flex",
          gap: "6px",
          flexWrap: "wrap",
          marginBottom: "16px",
        }}
      >
        {PASSOS.map((p, i) => {
          const ativo =
            (i === 0 && !resultado) || (i > 0 && i < 4 && !!resultado);
          return (
            <span
              key={p}
              style={{
                fontSize: "10px",
                fontWeight: "600",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                padding: "4px 10px",
                borderRadius: "999px",
                border: `1px solid ${ativo ? "var(--gold)" : "var(--gold-light)"}`,
                color: ativo ? "var(--gold-dark)" : "var(--gray-mid)",
                backgroundColor: ativo ? "#FBF7EF" : "white",
                opacity: i === 4 ? 0.5 : 1,
              }}
            >
              {i + 1}. {p}
            </span>
          );
        })}
      </div>

      {/* ===== PASSO 1 — Entrada ===== */}
      <div style={cartao}>
        <p style={microLabel}>Passo 1 — Colar ou carregar JSON</p>
        <textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setResultado(null);
            setErroEntrada(null);
          }}
          placeholder='{"versao": 1, "clientes": [ ... ]}'
          spellCheck={false}
          style={{
            width: "100%",
            minHeight: "140px",
            resize: "vertical",
            padding: "12px",
            borderRadius: "10px",
            border: "1.5px solid var(--gold-light)",
            fontSize: "12px",
            fontFamily: "monospace",
            outline: "none",
            boxSizing: "border-box",
            backgroundColor: "#FAFAF8",
          }}
        />
        <div
          style={{
            display: "flex",
            gap: "10px",
            marginTop: "10px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            onClick={() => inputFicheiro.current?.click()}
            style={{
              padding: "9px 16px",
              borderRadius: "10px",
              fontSize: "12px",
              fontWeight: "600",
              border: "1.5px solid var(--gold)",
              color: "var(--gold-dark)",
              backgroundColor: "white",
              cursor: "pointer",
            }}
          >
            📄 Carregar ficheiro .json
          </button>
          <input
            ref={inputFicheiro}
            type="file"
            accept=".json,application/json"
            onChange={carregarFicheiro}
            style={{ display: "none" }}
          />
          <button
            onClick={validar}
            disabled={aValidar}
            style={{
              padding: "9px 20px",
              borderRadius: "10px",
              fontSize: "13px",
              fontWeight: "600",
              border: "none",
              backgroundColor: aValidar ? "var(--gold-light)" : "var(--gold)",
              color: "white",
              cursor: aValidar ? "wait" : "pointer",
              boxShadow: "0 4px 12px rgba(201,168,76,0.3)",
            }}
          >
            {aValidar ? "A validar..." : "Validar →"}
          </button>
        </div>
        {erroEntrada && (
          <p
            style={{
              fontSize: "12px",
              color: "#DC2626",
              backgroundColor: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: "10px",
              padding: "8px 12px",
              margin: "12px 0 0 0",
            }}
          >
            {erroEntrada}
          </p>
        )}
      </div>

      {resultado && (
        <>
          {/* ===== PASSO 2/3 — Validação + Pré-visualização ===== */}
          <div style={cartao}>
            <p style={microLabel}>Passo 2 — Validação · Passo 3 — Pré-visualização</p>
            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                marginBottom: "12px",
              }}
            >
              <Pill ok texto={`${resultado.contagens.clientes} clientes (${resultado.contagens.clientesNovos} novos · ${resultado.contagens.clientesAAtualizar} a anexar a existentes)`} />
              <Pill ok texto={`${resultado.contagens.eventos} eventos`} />
              <Pill ok texto={`${resultado.contagens.documentos} documentos`} />
              <Pill ok texto={`${resultado.contagens.formularios} formulários`} />
              {resultado.contagens.avisos > 0 && (
                <Pill aviso texto={`${resultado.contagens.avisos} avisos`} />
              )}
              {resultado.contagens.erros > 0 && (
                <Pill erro texto={`${resultado.contagens.erros} erros`} />
              )}
            </div>

            {resultado.tiposDesconhecidos.length > 0 && (
              <div
                style={{
                  backgroundColor: "#FBF7EF",
                  border: "1px solid var(--gold-light)",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  marginBottom: "12px",
                }}
              >
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--charcoal)",
                    margin: "0 0 6px 0",
                  }}
                >
                  Tipos de evento por criar:{" "}
                  <strong>{resultado.tiposDesconhecidos.join(", ")}</strong>
                </p>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    color: "var(--gray-mid)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={criarModelos}
                    onChange={(e) => setCriarModelos(e.target.checked)}
                  />
                  Criar estes modelos automaticamente na importação (0 passos —
                  completam-se depois em Modelos de Evento)
                </label>
              </div>
            )}

            {/* Lista de clientes — expansível */}
            {resultado.plano.clientes.map((c) => {
              const aberto = !!expandido[c.chave];
              const comErro = c.erros.length > 0;
              return (
                <div
                  key={c.chave}
                  style={{
                    border: `1px solid ${comErro ? "#FECACA" : "var(--gold-light)"}`,
                    borderRadius: "12px",
                    marginBottom: "8px",
                    backgroundColor: comErro ? "#FFF9F9" : "white",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 14px",
                    }}
                  >
                    {/* Passo 4 — seleção por cliente */}
                    <input
                      type="checkbox"
                      checked={c.selecionado}
                      disabled={comErro}
                      onChange={() => alternarCliente(c.chave)}
                      title={
                        comErro
                          ? "Cliente com erros — corrige o JSON para o importar"
                          : "Incluir na importação"
                      }
                    />
                    <button
                      onClick={() =>
                        setExpandido((p) => ({ ...p, [c.chave]: !aberto }))
                      }
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: "left",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        fontFamily: "Inter, sans-serif",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: "600",
                          color: "var(--charcoal)",
                        }}
                      >
                        {aberto ? "▾ " : "▸ "}
                        {c.cliente.nome || "(sem nome)"}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--gray-mid)",
                          marginLeft: "8px",
                        }}
                      >
                        {c.eventos.length}{" "}
                        {c.eventos.length === 1 ? "evento" : "eventos"} ·{" "}
                        {c.eventos.reduce(
                          (n, ev) => n + Object.keys(ev.documentos).length,
                          0,
                        )}{" "}
                        docs
                        {c.clienteExistente
                          ? ` · anexa a "${c.clienteExistente.nome}"`
                          : ""}
                      </span>
                    </button>
                    {c.avisos.length > 0 && !comErro && (
                      <span style={{ fontSize: "11px", color: "#B45309" }}>
                        ⚠ {c.avisos.length}
                      </span>
                    )}
                    {comErro && (
                      <span style={{ fontSize: "11px", color: "#DC2626" }}>
                        ✕ {c.erros.length}
                      </span>
                    )}
                  </div>
                  {aberto && (
                    <div
                      style={{
                        borderTop: "1px solid #F0EBE0",
                        padding: "10px 14px 12px",
                        fontSize: "12px",
                      }}
                    >
                      {c.erros.map((e, i) => (
                        <p key={`e${i}`} style={{ color: "#DC2626", margin: "0 0 4px 0" }}>
                          ✕ {e}
                        </p>
                      ))}
                      {c.avisos.map((a, i) => (
                        <p key={`a${i}`} style={{ color: "#B45309", margin: "0 0 4px 0" }}>
                          ⚠ {a}
                        </p>
                      ))}
                      {c.eventos.map((ev, i) => (
                        <p
                          key={`ev${i}`}
                          style={{ color: "var(--gray-mid)", margin: "0 0 3px 0" }}
                        >
                          • {ev.tipoEvento || "Sem tipo"}
                          {ev.dataEvento ? ` · ${ev.dataEvento}` : ""} ·{" "}
                          {ev.estado} / {ev.fase}
                          {ev.valorAcordado ? ` · ${ev.valorAcordado}€` : ""} ·
                          docs: {Object.keys(ev.documentos).join(", ") || "—"}
                          {ev.formularioPreenchido ? " · formulário ✓" : ""}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Passo 4 — controlos de seleção */}
            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: "12px",
              }}
            >
              <button onClick={() => marcarTodos(true)} style={btnLigeiro}>
                Selecionar todos
              </button>
              <button onClick={() => marcarTodos(false)} style={btnLigeiro}>
                Desmarcar todos
              </button>
              <span style={{ fontSize: "12px", color: "var(--gray-mid)" }}>
                {selecionados.length} de {resultado.plano.clientes.length}{" "}
                selecionados
              </span>
            </div>
          </div>

          {/* ===== PASSO 5 — Importação ===== */}
          <div style={cartao}>
            <p style={microLabel}>Passo 5 — Importação</p>

            {!relatorio && (
              <div style={{ textAlign: "center" }}>
                <button
                  onClick={importar}
                  disabled={aImportar || selecionados.length === 0}
                  style={{
                    padding: "12px 28px",
                    borderRadius: "10px",
                    fontSize: "13px",
                    fontWeight: "600",
                    border: "none",
                    backgroundColor:
                      aImportar || selecionados.length === 0
                        ? "var(--gold-light)"
                        : "var(--gold)",
                    color: "white",
                    cursor:
                      aImportar || selecionados.length === 0
                        ? "not-allowed"
                        : "pointer",
                    boxShadow:
                      aImportar || selecionados.length === 0
                        ? "none"
                        : "0 4px 12px rgba(201,168,76,0.3)",
                  }}
                >
                  {aImportar
                    ? `A importar${progresso ? ` "${progresso}"` : ""}...`
                    : `Importar ${selecionados.length} ${
                        selecionados.length === 1 ? "cliente" : "clientes"
                      }`}
                </button>
                <p
                  style={{
                    fontSize: "11px",
                    color: "var(--gray-mid)",
                    margin: "8px 0 0 0",
                  }}
                >
                  Cada cliente é escrito numa transação própria — um erro num
                  cliente não afeta os restantes.
                </p>
              </div>
            )}

            {relatorio && relatorio.falhaGeral && (
              <p
                style={{
                  fontSize: "12px",
                  color: "#DC2626",
                  backgroundColor: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  margin: 0,
                }}
              >
                ✕ {relatorio.falhaGeral} Nada foi importado — corrige e volta a
                validar.
              </p>
            )}

            {relatorio && !relatorio.falhaGeral && (
              <div>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginBottom: "12px",
                  }}
                >
                  <Pill
                    ok
                    texto={`${relatorio.clientesOk.length} clientes importados`}
                  />
                  <Pill ok texto={`${relatorio.eventos} eventos`} />
                  <Pill ok texto={`${relatorio.documentos} documentos`} />
                  <Pill ok texto={`${relatorio.formularios} formulários`} />
                  {relatorio.pagamentos > 0 && (
                    <Pill ok texto={`${relatorio.pagamentos} pagamentos`} />
                  )}
                  {relatorio.modelosCriados > 0 && (
                    <Pill
                      ok
                      texto={`${relatorio.modelosCriados} modelos criados`}
                    />
                  )}
                  {relatorio.clientesFalhados.length > 0 && (
                    <Pill
                      erro
                      texto={`${relatorio.clientesFalhados.length} falhados`}
                    />
                  )}
                  <Pill
                    ok
                    texto={`${(relatorio.duracaoMs / 1000).toFixed(1)}s`}
                  />
                </div>
                {relatorio.clientesOk.map((c, i) => (
                  <p
                    key={`ok${i}`}
                    style={{
                      fontSize: "12px",
                      color: "#166534",
                      margin: "0 0 3px 0",
                    }}
                  >
                    ✓ {c.nome} — {c.eventos}{" "}
                    {c.eventos === 1 ? "evento" : "eventos"}
                    {c.anexado ? " (anexado a cliente existente)" : ""}
                  </p>
                ))}
                {relatorio.clientesFalhados.map((c, i) => (
                  <p
                    key={`f${i}`}
                    style={{
                      fontSize: "12px",
                      color: "#DC2626",
                      margin: "0 0 3px 0",
                    }}
                  >
                    ✕ {c.nome} — {c.erro}
                  </p>
                ))}
                <p
                  style={{
                    fontSize: "11px",
                    color: "var(--gray-mid)",
                    margin: "10px 0 0 0",
                    lineHeight: 1.6,
                  }}
                >
                  Os clientes importados já estão em Clientes, Agenda,
                  Documentos e Dashboard. Para importar outro ficheiro, cola o
                  JSON novo e valida — <strong>não</strong> voltes a importar
                  este (duplicaria os dados).
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}

const btnLigeiro = {
  padding: "6px 14px",
  borderRadius: "999px",
  fontSize: "12px",
  border: "1px solid var(--gold-light)",
  color: "var(--gray-mid)",
  backgroundColor: "white",
  cursor: "pointer",
};

function Pill({ texto, ok, aviso, erro }) {
  const cor = erro
    ? { bg: "#FEF2F2", borda: "#FECACA", texto: "#DC2626", icone: "✕" }
    : aviso
      ? { bg: "#FEF3E2", borda: "#F0D9B5", texto: "#B45309", icone: "⚠" }
      : { bg: "#F0FDF4", borda: "#BBF7D0", texto: "#166534", icone: "✓" };
  return (
    <span
      style={{
        fontSize: "12px",
        fontWeight: "600",
        padding: "5px 12px",
        borderRadius: "999px",
        backgroundColor: cor.bg,
        border: `1px solid ${cor.borda}`,
        color: cor.texto,
        whiteSpace: "nowrap",
      }}
    >
      {cor.icone} {texto}
    </span>
  );
}