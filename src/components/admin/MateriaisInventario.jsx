import { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import {
  getMateriais,
  createMaterial,
  updateMaterial,
  toggleMaterial,
} from "../../lib/materiais";
import MaterialModalRico from "./MaterialModalRico";

// ============================================================
// MateriaisInventario — inventário visual do stock (Fase C-2c).
// Substitui a lista de texto por uma montra: filtro por Grupo (chips) +
// grelha de cards, cada peça com as suas dimensões, quantidade e estado.
//
// Só leitura neste bloco. A edição (modal rico + quantidade inline) vem
// no bloco seguinte.
// ============================================================

// Título legível de uma peça a partir das dimensões (tipo · cor), com a
// medida como subtítulo. Evita o "nome" longo e espremido.
const tituloPeca = (m) => {
  const partes = [m.tipo, m.cor].map((p) => (p || "").trim()).filter(Boolean);
  if (partes.length) return partes.join(" · ");
  // sem tipo/cor: cai para o nome, ou para o grupo
  return (m.nome || m.categoria || "Material").trim();
};

// Disponível de uma peça = total − higienização − por confirmar.
// (A reserva pelos eventos entra nos alertas, não aqui no card de stock.)
const disponivelDe = (m) => {
  const total = Number(m.quantidade_total) || 0;
  const higien = Number(m.em_higienizacao) || 0;
  const conf = Number(m.por_confirmar) || 0;
  return total - higien - conf;
};

// Estado da peça face ao stock ideal:
//   'critico'  → disponível <= 0, ou abaixo de metade do ideal
//   'atencao'  → disponível abaixo do ideal (mas acima de metade)
//   'ok'       → disponível >= ideal (ou sem ideal definido e com stock)
//   'vazio'    → sem stock nenhum registado
const estadoDe = (m) => {
  const disp = disponivelDe(m);
  const total = Number(m.quantidade_total) || 0;
  const ideal = m.stock_ideal == null ? null : Number(m.stock_ideal);

  if (total <= 0) return "vazio";
  if (disp <= 0) return "critico";
  if (ideal != null && ideal > 0) {
    if (disp < ideal / 2) return "critico";
    if (disp < ideal) return "atencao";
  }
  return "ok";
};

// As escritas do stepper em voo, em cadeia: o carregar() espera por
// elas antes do SELECT — sem isto, sair e voltar depressa ao separador
// lia o total ANTIGO enquanto o UPDATE do flush ainda ia a caminho.
let escritaEmVoo = Promise.resolve();

// Cores de cada estado (paleta do dlm-app)
const CORES_ESTADO = {
  ok: { texto: "#3B6D11", fundo: "#EAF3DE", label: "OK" },
  atencao: { texto: "var(--gold-dark)", fundo: "#FEF9EC", label: "Atenção" },
  critico: { texto: "#DC2626", fundo: "#FEF2F2", label: "Crítico" },
  vazio: { texto: "var(--gray-mid)", fundo: "#F3F4F6", label: "Sem stock" },
};

export default function MateriaisInventario({ onStockAlterado, onErroGravacao }) {
  const [materiais, setMateriais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [grupoAtivo, setGrupoAtivo] = useState("Todos");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState(null); // material a editar (ou {} para novo)
  const [successMsg, setSuccessMsg] = useState(null);
  // Erro com cor de erro (Lote 4B): a faixa verde de sucesso a dizer
  // falhas enganava; e o alert() está proibido pela regra da casa.
  const [erroMsg, setErroMsg] = useState(null);

  const carregar = async () => {
    setLoading(true);
    try {
      await escritaEmVoo;
      const data = await getMateriais({ incluirInativos: true });
      setMateriais(data);
    } catch (e) {
      // Um catálogo vazio por falha de rede é indistinguível de um
      // catálogo vazio de verdade — e o segundo nunca acontece nesta
      // casa. Dizer que falhou é o mínimo.
      console.error("Erro ao carregar materiais:", e);
      setErroMsg(
        "Não foi possível carregar o inventário — isto não quer dizer que não haja materiais. Recarrega a página.",
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const mostrarSucesso = (msg) => {
    setErroMsg(null);
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const mostrarErro = (msg) => {
    setSuccessMsg(null);
    setErroMsg(msg);
  };

  const handleGuardar = async (dados) => {
    if (editando?.id) {
      const atualizado = await updateMaterial(editando.id, dados);
      setMateriais((prev) =>
        prev.map((m) => (m.id === editando.id ? { ...m, ...atualizado } : m)),
      );
      mostrarSucesso(`"${atualizado.nome}" actualizado.`);
    } else {
      const novo = await createMaterial(dados);
      setMateriais((prev) => [...prev, novo]);
      mostrarSucesso(`"${novo.nome}" adicionado.`);
    }
    setEditando(null);
    onStockAlterado?.();
  };

  // Edição inline do total, direto no card (atualização otimista + grava).
  const handleAtualizarTotal = async (materialId, novoTotal) => {
    const valor = Math.max(0, Math.round(Number(novoTotal) || 0));
    // otimista: atualiza já o card
    setMateriais((prev) =>
      prev.map((m) =>
        m.id === materialId ? { ...m, quantidade_total: valor } : m,
      ),
    );
    try {
      const p = updateMaterial(materialId, { quantidade_total: valor });
      escritaEmVoo = escritaEmVoo.then(() => p).catch(() => {});
      await p;
      onErroGravacao?.(null);
      onStockAlterado?.();
    } catch (e) {
      console.error(e);
      // A voz do erro vive no PAI (OperacionalTab): se isto for o flush
      // de um card já desmontado, a barra local já não existe — sem
      // isto, a falha era um no-op silencioso e o número mentia.
      const material = materiais.find((m) => m.id === materialId);
      onErroGravacao?.(
        `Não foi possível guardar o stock${material ? ` de "${material.nome}"` : ""} — o valor no ecrã pode não estar gravado. Tenta outra vez.`,
      );
      // em erro, recarrega para repor o valor verdadeiro
      carregar();
    }
  };

  const handleToggleAtivo = async (material) => {
    const novoEstado = !material.ativo;
    try {
      const atualizado = await toggleMaterial(material.id, novoEstado);
      setMateriais((prev) =>
        prev.map((m) => (m.id === material.id ? { ...m, ...atualizado } : m)),
      );
      onStockAlterado?.();
    } catch (e) {
      console.error(e);
      mostrarErro(
        `Não foi possível alterar "${material.nome}". Tenta novamente.`,
      );
    }
  };

  // Grupos existentes (pela ordem em que aparecem), com contagem
  // Só os ativos aparecem no inventário. Os "removidos" (inativos) são
  // desativados na BD mas não se mostram — mantêm-se para não partir
  // fichas de eventos que os usem.
  const ativos = useMemo(
    () => materiais.filter((m) => m.ativo !== false),
    [materiais],
  );

  const grupos = useMemo(() => {
    const contagem = new Map();
    for (const m of ativos) {
      const g = (m.categoria || "Sem grupo").trim();
      contagem.set(g, (contagem.get(g) || 0) + 1);
    }
    return Array.from(contagem.entries()).map(([nome, n]) => ({ nome, n }));
  }, [ativos]);

  // Materiais filtrados por grupo + busca
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return ativos.filter((m) => {
      const grupo = (m.categoria || "Sem grupo").trim();
      if (grupoAtivo !== "Todos" && grupo !== grupoAtivo) return false;
      if (!q) return true;
      const alvo = [m.codigo, m.tipo, m.cor, m.medida, m.nome, grupo]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return alvo.includes(q);
    });
  }, [ativos, grupoAtivo, busca]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <p
          style={{
            fontSize: "13px",
            color: "var(--gray-mid)",
            margin: 0,
            maxWidth: "440px",
          }}
        >
          O teu inventário. Filtra por grupo, ou procura por código, tipo ou
          cor.
        </p>
        <button
          onClick={() => setEditando({})}
          style={{
            flexShrink: 0,
            padding: "9px 18px",
            borderRadius: "10px",
            fontSize: "13px",
            fontWeight: "600",
            border: "none",
            backgroundColor: "var(--gold)",
            color: "white",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(201,168,76,0.3)",
          }}
        >
          + Novo material
        </button>
      </div>

      {erroMsg && (
        <p
          style={{
            fontSize: "12px",
            color: "#B91C1C",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "8px",
            padding: "10px 14px",
            marginBottom: "14px",
          }}
        >
          ⚠ {erroMsg}
        </p>
      )}
      {successMsg && (
        <p
          style={{
            fontSize: "12px",
            color: "#22C55E",
            backgroundColor: "#F0FDF4",
            border: "1px solid #BBF7D0",
            borderRadius: "8px",
            padding: "10px 14px",
            marginBottom: "14px",
          }}
        >
          ✓ {successMsg}
        </p>
      )}

      {/* Busca */}
      <div style={{ position: "relative", marginBottom: "14px" }}>
        <span
          style={{
            position: "absolute",
            left: "14px",
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: "14px",
            pointerEvents: "none",
            color: "var(--gray-mid)",
          }}
        >
          🔍
        </span>
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Procurar (ex: CP001, vinho, dourado)..."
          style={{
            width: "100%",
            padding: "11px 40px 11px 42px",
            borderRadius: "12px",
            fontSize: "13px",
            border: "1.5px solid var(--gold-light)",
            outline: "none",
            fontFamily: "Inter, sans-serif",
            color: "var(--charcoal)",
            backgroundColor: "white",
            boxSizing: "border-box",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = "var(--gold)";
            e.target.style.boxShadow = "0 0 0 3px rgba(201,168,76,0.12)";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "var(--gold-light)";
            e.target.style.boxShadow = "none";
          }}
        />
        {busca && (
          <button
            onClick={() => setBusca("")}
            style={{
              position: "absolute",
              right: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "16px",
              color: "var(--gray-mid)",
              padding: "2px 4px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Filtro por grupo (chips) */}
      <div className="filter-wrap" style={{ marginBottom: "20px" }}>
        <div className="h-scroll" style={{ gap: "8px", paddingRight: "32px" }}>
          {[{ nome: "Todos", n: ativos.length }, ...grupos].map((g) => {
            const ativo = grupoAtivo === g.nome;
            return (
              <button
                key={g.nome}
                onClick={() => setGrupoAtivo(g.nome)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 16px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  fontWeight: ativo ? "600" : "400",
                  border: `1.5px solid ${ativo ? "var(--gold)" : "var(--gold-light)"}`,
                  backgroundColor: ativo ? "var(--gold)" : "white",
                  color: ativo ? "white" : "var(--charcoal)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 0.2s",
                }}
              >
                {g.nome}
                <span
                  style={{
                    fontSize: "11px",
                    opacity: 0.7,
                    color: ativo ? "white" : "var(--gray-mid)",
                  }}
                >
                  {g.n}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grelha de cards */}
      {loading ? (
        <p
          style={{
            textAlign: "center",
            padding: "60px",
            color: "var(--gray-mid)",
            fontSize: "14px",
          }}
        >
          A carregar o inventário...
        </p>
      ) : filtrados.length === 0 ? (
        <p
          style={{
            textAlign: "center",
            padding: "60px",
            color: "var(--gray-mid)",
            fontSize: "14px",
          }}
        >
          Nenhum material encontrado.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "12px",
          }}
        >
          {filtrados.map((m, idx) => (
            <MaterialCard
              key={m.id}
              material={m}
              idx={idx}
              onEditar={(totalAtual) =>
                setEditando(
                  totalAtual == null
                    ? m
                    : { ...m, quantidade_total: totalAtual },
                )
              }
              onAtualizarTotal={handleAtualizarTotal}
            />
          ))}
        </div>
      )}

      {/* Modal de criar/editar */}
      {editando && (
        <MaterialModalRico
          inicial={editando}
          gruposExistentes={grupos.map((g) => g.nome)}
          onCancel={() => setEditando(null)}
          onGuardar={handleGuardar}
          onRemover={async () => {
            await handleToggleAtivo(editando);
            setEditando(null);
            mostrarSucesso(`"${editando.nome}" removido do inventário.`);
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Card de uma peça
// ------------------------------------------------------------
function MaterialCard({ material, idx, onEditar, onAtualizarTotal }) {
  const inativo = !material.ativo;
  const higien = Number(material.em_higienizacao) || 0;
  const inicial = (material.categoria || "?").trim().charAt(0).toUpperCase();

  // Total com edição inline otimista + debounce (agrupa cliques rápidos).
  const [totalLocal, setTotalLocal] = useState(
    Number(material.quantidade_total) || 0,
  );
  const debounceRef = useRef(null);
  const total = totalLocal;

  // Estado/disponível calculados com o total LOCAL, para a cor e o número
  // reagirem logo ao clicar (antes mesmo de gravar).
  const materialLocal = { ...material, quantidade_total: totalLocal };
  const estado = estadoDe(materialLocal);
  const cor = CORES_ESTADO[estado];
  const disp = disponivelDe(materialLocal);

  // Se o material mudar por fora (ex: recarregar), sincroniza o valor local.
  useEffect(() => {
    setTotalLocal(Number(material.quantidade_total) || 0);
  }, [material.quantidade_total]);

  // O valor por gravar vive num ref para o flush do unmount: sem isto,
  // clicar no stepper e mudar logo de separador cancelava o timer e a
  // gravação PERDIA-SE em silêncio — o número voltava atrás no regresso.
  const pendenteRef = useRef(null);
  const aoAtualizarRef = useRef(onAtualizarTotal);
  aoAtualizarRef.current = onAtualizarTotal;

  const agendarGravacao = (valor) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    pendenteRef.current = valor;
    debounceRef.current = setTimeout(() => {
      pendenteRef.current = null;
      onAtualizarTotal?.(material.id, valor);
    }, 600);
  };

  useEffect(() => {
    // O mesmo flush serve o unmount E o pagehide (F5/fechar o tab):
    // o cleanup do React não corre no unload, e a edição perder-se-ia.
    const flush = () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (pendenteRef.current != null) {
        const valor = pendenteRef.current;
        pendenteRef.current = null;
        aoAtualizarRef.current?.(material.id, valor);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
    // material.id é estável durante a vida do card (key da lista)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alterarTotal = (delta) => {
    const novo = Math.max(0, totalLocal + delta);
    setTotalLocal(novo);
    agendarGravacao(novo);
  };

  // Só permitimos stepper inline quando NÃO há higienização em curso —
  // nesse caso o card mostra o disponível (leitura) e o total mexe-se no
  // modal, para não confundir "total" com "disponível".
  const permiteInline = higien === 0;

  return (
    <motion.div
      onClick={() => onEditar(totalLocal)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.25,
        ease: "easeOut",
        delay: Math.min(idx * 0.02, 0.25),
      }}
      whileHover={{ y: -2, boxShadow: "0 6px 20px rgba(0,0,0,0.1)" }}
      style={{
        backgroundColor: "white",
        borderRadius: "12px",
        border: "1px solid var(--gold-light)",
        overflow: "hidden",
        boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
        opacity: inativo ? 0.5 : 1,
        cursor: "pointer",
      }}
    >
      {/* Imagem ou placeholder da inicial */}
      <div
        style={{
          height: "96px",
          backgroundColor: "#FBF7EF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {material.imagem_url ? (
          <img
            src={material.imagem_url}
            alt={tituloPeca(material)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span
            style={{
              fontFamily: "Playfair Display, serif",
              fontSize: "34px",
              color: "var(--gold)",
            }}
          >
            {inicial}
          </span>
        )}
        {material.codigo && (
          <span
            style={{
              position: "absolute",
              top: "8px",
              left: "10px",
              fontFamily: "monospace",
              fontSize: "11px",
              color: "var(--gold-dark)",
              backgroundColor: "rgba(255,255,255,0.85)",
              padding: "1px 6px",
              borderRadius: "6px",
            }}
          >
            {material.codigo}
          </span>
        )}
      </div>

      {/* Corpo */}
      <div style={{ padding: "12px 14px" }}>
        <p
          style={{
            fontSize: "14px",
            fontWeight: "500",
            color: "var(--charcoal)",
            margin: "0 0 2px 0",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {tituloPeca(material)}
        </p>
        <p
          style={{
            fontSize: "12px",
            color: "var(--gray-mid)",
            margin: "0 0 10px 0",
            minHeight: "16px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {material.medida ||
            (higien > 0 ? `${total} total · ${higien} na lavandaria` : "")}
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
          }}
        >
          {permiteInline ? (
            // Stepper inline: −  N  +  (não abre o modal)
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "default",
              }}
            >
              <StepBtn
                label="−"
                onClick={() => alterarTotal(-1)}
                disabled={total <= 0}
              />
              <div style={{ textAlign: "center", minWidth: "36px" }}>
                <span
                  style={{
                    fontSize: "22px",
                    fontWeight: "600",
                    color: estado === "critico" ? "#DC2626" : "var(--charcoal)",
                    lineHeight: 1,
                  }}
                >
                  {total}
                </span>
              </div>
              <StepBtn label="+" onClick={() => alterarTotal(1)} />
            </div>
          ) : (
            // Com higienização: mostra o disponível em leitura (total no modal)
            <div>
              <span
                style={{
                  fontSize: "22px",
                  fontWeight: "600",
                  color: estado === "critico" ? "#DC2626" : "var(--charcoal)",
                  lineHeight: 1,
                }}
              >
                {disp}
              </span>
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--gray-mid)",
                  marginLeft: "4px",
                }}
              >
                disp.
              </span>
            </div>
          )}
          <span
            style={{
              fontSize: "11px",
              fontWeight: "600",
              color: cor.texto,
              backgroundColor: cor.fundo,
              padding: "2px 8px",
              borderRadius: "999px",
              flexShrink: 0,
            }}
          >
            {cor.label}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// Botão −/+ do stepper inline de quantidade
function StepBtn({ label, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "28px",
        height: "28px",
        borderRadius: "8px",
        border: `1.5px solid ${disabled ? "#E5E7EB" : "var(--gold-light)"}`,
        backgroundColor: "white",
        color: disabled ? "#D1D5DB" : "var(--gold-dark)",
        fontSize: "16px",
        fontWeight: "700",
        lineHeight: 1,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        padding: 0,
      }}
    >
      {label}
    </button>
  );
}
