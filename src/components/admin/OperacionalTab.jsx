import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import {
  getMateriais,
  createMaterial,
  updateMaterial,
  toggleMaterial,
  agruparPorCategoria,
  CATEGORIAS_ORDEM,
} from "../../lib/materiais";
import {
  getTodasFichas,
  getAppConfig,
  getBuffer,
  calcularAlertas,
  calcularAlertasReposicao,
} from "../../lib/stock";
import ConferenciaPeriodo from "./ConferenciaPeriodo";
import AlertasTab from "./AlertasTab";
import MateriaisInventario from "./MateriaisInventario";

// Unidades sugeridas no seletor ao criar/editar um material.
const UNIDADES = ["un", "mt", "cx", "kg", "par", "conj"];

// ============================================================
// OperacionalTab — Logística.
// Sub-navegação interna:
//   • Materiais  → o catálogo e o stock (CRUD)
//   • O que sai  → a conferência do período, somando todos os eventos
//   • Alertas    → onde é que o stock vai rebentar
//
// O separador "Fichas" saiu: a ficha de materiais passou para dentro do
// evento (/evento/:id → Materiais), e deixava de fazer sentido haver um
// sítio onde se volta a PROCURAR o evento que já estava aberto. No lugar
// dele entra a vista que faltava — transversal, não por evento: «tenho
// material para tudo o que sai este fim de semana?».
//
// Este componente é o dono dos dados (materiais, fichas, buffer): carrega
// uma vez e partilha pelos três.
// ============================================================
export default function OperacionalTab({ submissions = [], eventTypes = [] }) {
  const [subTab, setSubTab] = useState("materiais");

  // Dados para os alertas — carregados AQUI (uma vez) e partilhados entre
  // o badge da sub-navegação e a vista AlertasTab, para não duplicar
  // trabalho nem queries.
  const [materiais, setMateriais] = useState([]);
  const [todasFichas, setTodasFichas] = useState([]);
  const [buffer, setBuffer] = useState({ antes: 2, depois: 2 });
  const [loadingAlertas, setLoadingAlertas] = useState(true);

  // Recarrega os dados que alimentam os alertas (stock, fichas, buffer).
  // Chamada uma vez ao montar, E sempre que um filho grava algo que afeta
  // os alertas (quantidade numa ficha, stock de um material) — assim o
  // badge e a lista atualizam sem refrescar a página.
  // O erro de carga ganha voz (Lote 4B): sem isto, materiais/fichas
  // ficavam [] e a conferência dizia "Nada sai de casa" — uma mentira
  // tranquilizadora em cima de uma falha de rede.
  const [erroDados, setErroDados] = useState(null);
  const recarregarDados = useCallback(async () => {
    // O erro só limpa quando um pedido NOVO resolve — limpá-lo à
    // partida fazia o retry mostrar "Nada sai de casa" durante o
    // pedido em curso (a mentira de volta, no pior momento).
    try {
      const [mats, fichas, config] = await Promise.all([
        getMateriais({ incluirInativos: true }),
        getTodasFichas(),
        getAppConfig(),
      ]);
      setMateriais(mats);
      setTodasFichas(fichas);
      setBuffer(await getBuffer(config));
      setErroDados(null);
    } catch (e) {
      console.error("Erro ao carregar alertas:", e);
      setErroDados(
        "Não foi possível carregar os dados de stock e fichas — o que vês pode estar incompleto.",
      );
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setLoadingAlertas(true);
      await recarregarDados();
      if (vivo) setLoadingAlertas(false);
    })();
    return () => {
      vivo = false;
    };
  }, [recarregarDados]);

  const alertas = useMemo(
    () => calcularAlertas({ materiais, submissions, todasFichas, buffer }),
    [materiais, submissions, todasFichas, buffer],
  );

  // Alertas de reposição (stock abaixo do ideal) — planeamento, não urgência.
  const alertasReposicao = useMemo(
    () => calcularAlertasReposicao({ materiais }),
    [materiais],
  );

  // O badge conta só as RUTURAS REAIS (stock definido mas insuficiente),
  // não os "sem stock definido" (stock = 0) — esses são setup por fazer,
  // não conflitos acionáveis. Assim o badge mantém-se credível no dia 1.
  const numRuturasReais = useMemo(
    () => alertas.filter((a) => a.stock > 0).length,
    [alertas],
  );

  return (
    <motion.div
      key="tab-operacional"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Sub-navegação */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "24px",
          flexWrap: "wrap",
        }}
      >
        {[
          { id: "materiais", label: "Materiais" },
          { id: "conferencia", label: "O que sai" },
          { id: "alertas", label: "Alertas" },
        ].map((st) => {
          const ativo = subTab === st.id;
          // Badge só no botão Alertas, e só quando há ruturas reais
          const mostrarBadge = st.id === "alertas" && numRuturasReais > 0;
          return (
            <button
              key={st.id}
              onClick={() => setSubTab(st.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 18px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: "600",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                border: `1.5px solid ${ativo ? "var(--gold)" : "var(--gold-light)"}`,
                backgroundColor: ativo ? "var(--gold)" : "white",
                color: ativo ? "white" : "var(--gray-mid)",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {st.label}
              {mostrarBadge && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "18px",
                    height: "18px",
                    padding: "0 5px",
                    borderRadius: "999px",
                    fontSize: "10px",
                    fontWeight: "700",
                    lineHeight: 1,
                    // No botão ativo (fundo dourado) o badge fica branco com
                    // texto dourado; no inativo, vermelho cheio.
                    backgroundColor: ativo ? "white" : "#DC2626",
                    color: ativo ? "#DC2626" : "white",
                  }}
                >
                  {numRuturasReais}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {subTab === "materiais" && (
        <MateriaisInventario onStockAlterado={recarregarDados} />
      )}
      {subTab === "conferencia" && (
        <ConferenciaPeriodo
          materiais={materiais}
          submissions={submissions}
          todasFichas={todasFichas}
          eventTypes={eventTypes}
          loading={loadingAlertas}
          erro={erroDados}
          onTentarNovamente={recarregarDados}
        />
      )}
      {subTab === "alertas" && (
        <AlertasTab
          alertas={alertas}
          alertasReposicao={alertasReposicao}
          loading={loadingAlertas}
          submissions={submissions}
          eventTypes={eventTypes}
        />
      )}
    </motion.div>
  );
}

// ------------------------------------------------------------
// Catálogo de materiais — accordion por categoria + busca
// ------------------------------------------------------------
// ⚠ CÓDIGO MORTO (verificado no Lote 4B): nunca é renderizado — o
// inventário real é o MateriaisInventario.jsx. Candidato a remoção
// no 4D; não corrigir bugs aqui.
function MateriaisCatalogo({ onStockAlterado }) {
  const [materiais, setMateriais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [abertas, setAbertas] = useState({}); // { categoria: true/false }
  const [criarEm, setCriarEm] = useState(null); // categoria onde criar
  const [editando, setEditando] = useState(null); // material a editar (modal)
  const [successMsg, setSuccessMsg] = useState(null);

  const carregar = async () => {
    setLoading(true);
    try {
      // inclui inativos para a irmã os poder reativar
      const data = await getMateriais({ incluirInativos: true });
      setMateriais(data);
    } catch (e) {
      console.error("Erro ao carregar materiais:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const mostrarSucesso = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  // Filtra por busca (nome ou categoria). Sem busca, mostra tudo.
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return materiais;
    return materiais.filter(
      (m) =>
        m.nome.toLowerCase().includes(q) ||
        m.categoria.toLowerCase().includes(q),
    );
  }, [materiais, busca]);

  const grupos = useMemo(() => agruparPorCategoria(filtrados), [filtrados]);

  // Quando há busca, todas as categorias com resultados abrem automaticamente.
  const buscaAtiva = busca.trim().length > 0;
  const isAberta = (cat) => (buscaAtiva ? true : !!abertas[cat]);

  const toggleCategoria = (cat) => {
    if (buscaAtiva) return; // durante a busca, ficam sempre abertas
    setAbertas((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  // --- ações ---

  const handleCriar = async (dados) => {
    const novo = await createMaterial(dados);
    setMateriais((prev) => [...prev, novo]);
    setCriarEm(null);
    mostrarSucesso(`"${novo.nome}" adicionado a ${novo.categoria}.`);
    onStockAlterado?.();
  };

  const handleGuardarEdicao = async (id, campos) => {
    const atualizado = await updateMaterial(id, campos);
    setMateriais((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...atualizado } : m)),
    );
    setEditando(null);
    mostrarSucesso(`"${atualizado.nome}" actualizado.`);
    onStockAlterado?.();
  };

  const handleToggleAtivo = async (material) => {
    const novoEstado = !material.ativo;
    try {
      const atualizado = await toggleMaterial(material.id, novoEstado);
      setMateriais((prev) =>
        prev.map((m) => (m.id === material.id ? { ...m, ...atualizado } : m)),
      );
      mostrarSucesso(
        novoEstado
          ? `"${material.nome}" reactivado.`
          : `"${material.nome}" desativado (não aparece em novas fichas).`,
      );
      onStockAlterado?.();
    } catch (e) {
      console.error(e);
      // No lugar do alert: a mesma faixa dos sucessos, com a falha
      // dita por extenso (a regra da casa — nunca diálogos do browser).
      mostrarSucesso(
        `Não foi possível alterar "${material.nome}". Tenta novamente.`,
      );
    }
  };

  return (
    <div>
      {/* Cabeçalho + busca */}
      <div style={{ marginBottom: "16px" }}>
        <p
          style={{
            fontSize: "13px",
            color: "var(--gray-mid)",
            margin: "0 0 14px 0",
            maxWidth: "560px",
          }}
        >
          O catálogo de materiais que usas nas fichas de cada evento. Organizado
          pelas mesmas categorias do teu documento de planeamento.
        </p>

        {/* Busca */}
        <div style={{ position: "relative" }}>
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
            placeholder="Procurar material (ex: toalha, mesas, velas)..."
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
      </div>

      {successMsg && (
        <p
          style={{
            fontSize: "12px",
            color: "#22C55E",
            backgroundColor: "#F0FDF4",
            border: "1px solid #BBF7D0",
            borderRadius: "8px",
            padding: "10px 14px",
            marginBottom: "16px",
          }}
        >
          ✓ {successMsg}
        </p>
      )}

      {/* Lista por categoria (accordion) */}
      {loading ? (
        <p
          style={{
            textAlign: "center",
            padding: "60px",
            color: "var(--gray-mid)",
            fontSize: "14px",
          }}
        >
          A carregar...
        </p>
      ) : grupos.length === 0 ? (
        <p
          style={{
            textAlign: "center",
            padding: "60px",
            color: "var(--gray-mid)",
            fontSize: "14px",
          }}
        >
          {buscaAtiva
            ? "Nenhum material encontrado."
            : "Ainda não há materiais no catálogo."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {grupos.map((grupo) => {
            const aberta = isAberta(grupo.categoria);
            const totalAtivos = grupo.itens.filter((m) => m.ativo).length;
            return (
              <div
                key={grupo.categoria}
                style={{
                  backgroundColor: "white",
                  borderRadius: "14px",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
                  overflow: "hidden",
                }}
              >
                {/* Cabeçalho da categoria */}
                <button
                  onClick={() => toggleCategoria(grupo.categoria)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    padding: "16px 20px",
                    border: "none",
                    backgroundColor: "transparent",
                    cursor: buscaAtiva ? "default" : "pointer",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        transform: aberta ? "rotate(90deg)" : "rotate(0deg)",
                        transition: "transform 0.2s",
                        color: "var(--gold)",
                        fontSize: "12px",
                      }}
                    >
                      ▶
                    </span>
                    <h3
                      style={{
                        fontSize: "15px",
                        color: "var(--charcoal)",
                        margin: 0,
                        fontFamily: "Playfair Display, serif",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {grupo.categoria}
                    </h3>
                  </div>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--gray-mid)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {totalAtivos} {totalAtivos === 1 ? "material" : "materiais"}
                  </span>
                </button>

                {/* Itens da categoria */}
                {aberta && (
                  <div
                    style={{
                      borderTop: "1px solid var(--gold-light)",
                      padding: "8px",
                    }}
                  >
                    {grupo.itens.map((m) => (
                      <MaterialLinha
                        key={m.id}
                        material={m}
                        onEditar={() => setEditando(m)}
                        onToggleAtivo={() => handleToggleAtivo(m)}
                      />
                    ))}

                    {/* Botão adicionar nesta categoria */}
                    <button
                      onClick={() => setCriarEm(grupo.categoria)}
                      style={{
                        width: "100%",
                        marginTop: "4px",
                        padding: "10px",
                        borderRadius: "10px",
                        fontSize: "12px",
                        fontWeight: "600",
                        border: "1.5px dashed var(--gold-light)",
                        backgroundColor: "#FBF7EF",
                        color: "var(--gold)",
                        cursor: "pointer",
                      }}
                    >
                      + Adicionar material a {grupo.categoria}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal criar */}
      {criarEm && (
        <MaterialModal
          titulo={`Novo material · ${criarEm}`}
          inicial={{
            categoria: criarEm,
            nome: "",
            unidade: "un",
            quantidade_total: 0,
            def_carga: true,
            def_montagem: true,
            def_higienizacao: false,
          }}
          onCancel={() => setCriarEm(null)}
          onGuardar={handleCriar}
        />
      )}

      {/* Modal editar */}
      {editando && (
        <MaterialModal
          titulo="Editar material"
          inicial={editando}
          permitirMudarCategoria
          onCancel={() => setEditando(null)}
          onGuardar={(dados) => handleGuardarEdicao(editando.id, dados)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Linha de um material dentro da categoria
// ------------------------------------------------------------
function MaterialLinha({ material, onEditar, onToggleAtivo }) {
  const inativo = !material.ativo;
  // Stock em falta (0 ou indefinido) → pista visual âmbar de "por definir".
  // Com stock > 0 → mostra o número em cinza normal, ao lado da unidade.
  const stock = Number(material.quantidade_total) || 0;
  const semStock = stock <= 0;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "10px",
        padding: "10px 12px",
        borderRadius: "10px",
        opacity: inativo ? 0.55 : 1,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            fontSize: "14px",
            color: "var(--charcoal)",
            margin: "0 0 2px 0",
            textDecoration: inativo ? "line-through" : "none",
          }}
        >
          {material.nome}
        </p>
        <div
          style={{
            display: "flex",
            gap: "6px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "11px", color: "var(--gray-mid)" }}>
            {material.unidade}
          </span>
          {/* Stock — número se definido, pista âmbar se por definir */}
          <span
            style={{
              fontSize: "11px",
              fontWeight: semStock ? "600" : "500",
              color: semStock ? "var(--gold-dark)" : "var(--gray-mid)",
            }}
          >
            {semStock ? "· sem stock definido" : `· ${stock} em stock`}
          </span>
          {/* Etiquetas de listas por defeito */}
          <ListaTag ativo={material.def_carga} label="Carga" />
          <ListaTag ativo={material.def_montagem} label="Montagem" />
          <ListaTag ativo={material.def_higienizacao} label="Higienização" />
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onEditar}
          title="Editar"
          style={{
            padding: "6px 12px",
            borderRadius: "8px",
            fontSize: "11px",
            fontWeight: "600",
            border: "1px solid var(--gold-light)",
            backgroundColor: "white",
            color: "var(--gold)",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          ✏️
        </button>
        <button
          onClick={onToggleAtivo}
          title={inativo ? "Reactivar" : "Desativar"}
          style={{
            padding: "6px 12px",
            borderRadius: "8px",
            fontSize: "11px",
            fontWeight: "600",
            border: `1px solid ${inativo ? "#BBF7D0" : "#FECACA"}`,
            backgroundColor: inativo ? "#F0FDF4" : "#FEF2F2",
            color: inativo ? "#22C55E" : "#DC2626",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {inativo ? "↺" : "🚫"}
        </button>
      </div>
    </div>
  );
}

// Etiqueta pequena que mostra se o material entra numa lista por defeito
function ListaTag({ ativo, label }) {
  if (!ativo) return null;
  return (
    <span
      style={{
        fontSize: "9px",
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        padding: "2px 7px",
        borderRadius: "999px",
        backgroundColor: "#FEF9EC",
        color: "var(--gold-dark)",
        border: "1px solid var(--gold-light)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// ------------------------------------------------------------
// Modal de criar/editar material
// ------------------------------------------------------------
function MaterialModal({
  titulo,
  inicial,
  permitirMudarCategoria = false,
  onCancel,
  onGuardar,
}) {
  const [nome, setNome] = useState(inicial.nome || "");
  const [categoria, setCategoria] = useState(inicial.categoria || "");
  const [unidade, setUnidade] = useState(inicial.unidade || "un");
  const [quantidadeTotal, setQuantidadeTotal] = useState(
    inicial.quantidade_total ?? 0,
  );
  const [defCarga, setDefCarga] = useState(inicial.def_carga ?? true);
  const [defMontagem, setDefMontagem] = useState(inicial.def_montagem ?? true);
  const [defHigienizacao, setDefHigienizacao] = useState(
    inicial.def_higienizacao ?? false,
  );
  const [guardando, setGuardando] = useState(false);
  const [erro, setErro] = useState(null);

  const guardar = async () => {
    if (!nome.trim()) {
      setErro("O nome é obrigatório.");
      return;
    }
    setGuardando(true);
    setErro(null);
    try {
      await onGuardar({
        nome: nome.trim(),
        categoria,
        unidade,
        // Normaliza: inteiro, nunca negativo
        quantidade_total: Math.max(0, Math.round(Number(quantidadeTotal) || 0)),
        def_carga: defCarga,
        def_montagem: defMontagem,
        def_higienizacao: defHigienizacao,
      });
    } catch (e) {
      console.error(e);
      setErro("Não foi possível guardar. Tenta novamente.");
      setGuardando(false);
    }
  };

  return (
    <div
      onClick={onCancel}
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
          maxWidth: "420px",
          width: "100%",
          boxShadow: "0 8px 48px rgba(0,0,0,0.15)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h3
          style={{
            fontSize: "16px",
            color: "var(--charcoal)",
            margin: "0 0 18px 0",
            fontFamily: "Playfair Display, serif",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {titulo}
        </h3>

        {/* Nome */}
        <div style={{ marginBottom: "14px" }}>
          <label style={labelStyle}>Nome</label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoFocus
            placeholder="ex: Mesas Retangulares"
            style={inputStyle}
          />
        </div>

        {/* Categoria (só editável se permitido) */}
        {permitirMudarCategoria ? (
          <div style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>Categoria</label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              style={inputStyle}
            >
              {CATEGORIAS_ORDEM.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>Categoria</label>
            <p
              style={{
                fontSize: "13px",
                color: "var(--charcoal)",
                margin: 0,
                padding: "10px 14px",
                backgroundColor: "#FBF7EF",
                borderRadius: "8px",
                border: "1px solid var(--gold-light)",
              }}
            >
              {categoria}
            </p>
          </div>
        )}

        {/* Unidade + Quantidade em stock, lado a lado */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "18px" }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Unidade</label>
            <select
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
              style={inputStyle}
            >
              {UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Em stock</label>
            <input
              type="number"
              min="0"
              step="1"
              value={quantidadeTotal}
              onChange={(e) => setQuantidadeTotal(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Nota sobre o stock */}
        <p
          style={{
            fontSize: "11px",
            color: "var(--gray-mid)",
            margin: "-8px 0 18px 0",
            lineHeight: 1.5,
          }}
        >
          Quantas unidades tens no total. Serve para avisar quando dois eventos
          próximos precisam de mais do que tens.
        </p>

        {/* Defaults de lista */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ ...labelStyle, marginBottom: "8px" }}>
            Listas por defeito
          </label>
          <p
            style={{
              fontSize: "11px",
              color: "var(--gray-mid)",
              margin: "0 0 10px 0",
              lineHeight: 1.5,
            }}
          >
            Em que listas este material entra quando o adicionas a um evento.
            Podes sempre ajustar por evento.
          </p>
          <CheckLinha
            label="Carga"
            descricao="Sai do armazém"
            checked={defCarga}
            onChange={setDefCarga}
          />
          <CheckLinha
            label="Montagem"
            descricao="Vai para o local"
            checked={defMontagem}
            onChange={setDefMontagem}
          />
          <CheckLinha
            label="Higienização"
            descricao="Volta e precisa de limpeza"
            checked={defHigienizacao}
            onChange={setDefHigienizacao}
          />
        </div>

        {erro && (
          <p
            style={{
              fontSize: "12px",
              color: "#EF4444",
              backgroundColor: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: "8px",
              padding: "10px 14px",
              margin: "0 0 16px 0",
            }}
          >
            ⚠ {erro}
          </p>
        )}

        <div
          style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}
        >
          <button
            onClick={onCancel}
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
            onClick={guardar}
            disabled={guardando}
            style={{
              padding: "10px 24px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: "600",
              border: "none",
              backgroundColor: guardando ? "var(--gold-light)" : "var(--gold)",
              color: "white",
              cursor: guardando ? "not-allowed" : "pointer",
            }}
          >
            {guardando ? "A guardar..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Linha de checkbox estilizada para os defaults de lista
function CheckLinha({ label, descricao, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "10px 12px",
        marginBottom: "6px",
        borderRadius: "10px",
        border: `1.5px solid ${checked ? "var(--gold)" : "var(--gold-light)"}`,
        backgroundColor: checked ? "#FEF9EC" : "white",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span
        style={{
          width: "20px",
          height: "20px",
          borderRadius: "6px",
          border: `1.5px solid ${checked ? "var(--gold)" : "var(--gold-light)"}`,
          backgroundColor: checked ? "var(--gold)" : "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {checked && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </span>
      <div>
        <p
          style={{
            fontSize: "13px",
            fontWeight: "600",
            color: "var(--charcoal)",
            margin: 0,
          }}
        >
          {label}
        </p>
        <p style={{ fontSize: "11px", color: "var(--gray-mid)", margin: 0 }}>
          {descricao}
        </p>
      </div>
    </button>
  );
}

const labelStyle = {
  fontSize: "11px",
  fontWeight: "600",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  color: "var(--charcoal)",
  display: "block",
  marginBottom: "6px",
};

const inputStyle = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: "8px",
  border: "1.5px solid var(--gold-light)",
  fontSize: "13px",
  outline: "none",
  fontFamily: "Inter, sans-serif",
  boxSizing: "border-box",
  backgroundColor: "white",
};
