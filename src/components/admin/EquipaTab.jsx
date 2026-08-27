import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ENGAGEMENT_LABELS,
  assignFunction,
  createStaffFunction,
  createStaffMember,
  groupFunctionsByArea,
  listStaffFunctions,
  listStaffMembers,
  removeFunction,
  setStaffFunctionActive,
  setStaffMemberActive,
  updateStaffFunction,
  updateStaffMember,
} from "../../lib/staff";
import StaffMemberEditor from "./StaffMemberEditor";
import StaffFunctionEditor from "./StaffFunctionEditor";
import InstrucoesEquipa from "./InstrucoesEquipa";
import { getTeamInstructions } from "../../lib/planos";

// ============================================================
// A EQUIPA — o catálogo das pessoas e o catálogo das funções, no mesmo
// separador porque é a mesma pergunta vista de dois lados: quem é a
// equipa, e o que é que a equipa sabe fazer.
//
// São ~dez pessoas. Não leva paginação, nem pesquisa, nem gráficos —
// leva um filtro de texto e mais nada, que é o que dez linhas pedem.
// ============================================================

const botaoPrimario = {
  padding: "10px 20px",
  borderRadius: "999px",
  fontSize: "12px",
  fontWeight: "600",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  backgroundColor: "var(--gold)",
  color: "var(--texto-sobre-ouro)",
  border: "none",
  cursor: "pointer",
  whiteSpace: "nowrap",
  boxShadow: "0 4px 16px rgba(var(--ouro-rgb), 0.4)",
};

const botaoDiscreto = {
  padding: "7px 14px",
  borderRadius: "999px",
  fontSize: "11px",
  fontWeight: "600",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  backgroundColor: "transparent",
  color: "var(--gray-mid)",
  border: "1px solid var(--linha)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const etiqueta = (texto, cor) => (
  <span
    style={{
      fontSize: "10px",
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      padding: "3px 9px",
      borderRadius: "999px",
      border: `1px solid ${cor}`,
      color: cor,
      whiteSpace: "nowrap",
    }}
  >
    {texto}
  </span>
);

export default function EquipaTab({ organizationId, podeGerir }) {
  const [membros, setMembros] = useState([]);
  const [funcoes, setFuncoes] = useState([]);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState(null);
  const [sucesso, setSucesso] = useState(null);
  const [filtro, setFiltro] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const [editorMembro, setEditorMembro] = useState(null);
  const [editorFuncao, setEditorFuncao] = useState(null);
  const [aGuardar, setAGuardar] = useState(null);

  const anunciar = (msg) => {
    setSucesso(msg);
    setTimeout(() => setSucesso(null), 4000);
  };

  // Devolve os dados; não toca em estado. Assim serve tanto o efeito
  // (que precisa de poder desistir se o separador fechar a meio) como
  // as acções, que querem recarregar e mostrar logo o resultado.
  const [instrucoes, setInstrucoes] = useState(null);
  const [editorInstrucoes, setEditorInstrucoes] = useState(false);

  const buscar = useCallback(async () => {
    if (!organizationId) return null;
    const [m, f, i] = await Promise.all([
      listStaffMembers(organizationId),
      listStaffFunctions(organizationId),
      getTeamInstructions(organizationId),
    ]);
    return { membros: m, funcoes: f, instrucoes: i };
  }, [organizationId]);

  const carregar = useCallback(async () => {
    setACarregar(true);
    setErro(null);
    try {
      const r = await buscar();
      if (r) {
        setMembros(r.membros);
        setFuncoes(r.funcoes);
        setInstrucoes(r.instrucoes);
      }
    } catch (e) {
      console.error(e);
      setErro("Não foi possível carregar a equipa. Tenta novamente.");
    }
    setACarregar(false);
  }, [buscar]);

  useEffect(() => {
    let vivo = true;
    buscar()
      .then((r) => {
        if (!vivo || !r) return;
        setMembros(r.membros);
        setFuncoes(r.funcoes);
        setInstrucoes(r.instrucoes);
        setACarregar(false);
      })
      .catch((e) => {
        if (!vivo) return;
        console.error(e);
        setErro("Não foi possível carregar a equipa. Tenta novamente.");
        setACarregar(false);
      });
    return () => {
      vivo = false;
    };
  }, [buscar]);

  const funcaoPorId = useMemo(
    () => new Map(funcoes.map((f) => [f.id, f])),
    [funcoes],
  );

  const membrosVisiveis = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    return membros
      .filter((m) => (verInactivos ? true : m.is_active))
      .filter((m) => (t ? m.display_name.toLowerCase().includes(t) : true));
  }, [membros, filtro, verInactivos]);

  const areasDeFuncoes = useMemo(
    () => groupFunctionsByArea(funcoes.filter((f) => f.is_active)),
    [funcoes],
  );

  // ---------- acções ----------

  const guardarMembro = async (valores) => {
    const editar = !!editorMembro?.id;
    if (editar) {
      await updateStaffMember({ id: editorMembro.id, ...valores });
    } else {
      await createStaffMember({ organizationId, ...valores });
    }
    setEditorMembro(null);
    await carregar();
    anunciar(
      `${valores.displayName} ${editar ? "actualizada" : "adicionada"} à equipa.`,
    );
  };

  const guardarFuncao = async (valores) => {
    const editar = !!editorFuncao?.id;
    if (editar) {
      await updateStaffFunction({ id: editorFuncao.id, ...valores });
    } else {
      await createStaffFunction({ organizationId, ...valores });
    }
    setEditorFuncao(null);
    await carregar();
    anunciar(`Função "${valores.name}" ${editar ? "actualizada" : "criada"}.`);
  };

  const alternarMembro = async (m) => {
    setAGuardar(`membro:${m.id}`);
    setErro(null);
    try {
      await setStaffMemberActive({ id: m.id, isActive: !m.is_active });
      await carregar();
      anunciar(`${m.display_name} ${m.is_active ? "desactivada" : "reactivada"}.`);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível mudar o estado. Tenta novamente.");
    }
    setAGuardar(null);
  };

  const alternarFuncao = async (f) => {
    setAGuardar(`funcao:${f.id}`);
    setErro(null);
    try {
      await setStaffFunctionActive({ id: f.id, isActive: !f.is_active });
      await carregar();
      anunciar(`Função "${f.name}" ${f.is_active ? "desactivada" : "reactivada"}.`);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível mudar o estado da função.");
    }
    setAGuardar(null);
  };

  const alternarAtribuicao = async (membro, funcao, temAgora) => {
    setAGuardar(`atrib:${membro.id}:${funcao.id}`);
    setErro(null);
    try {
      if (temAgora) {
        await removeFunction({
          staffMemberId: membro.id,
          staffFunctionId: funcao.id,
        });
      } else {
        await assignFunction({
          organizationId,
          staffMemberId: membro.id,
          staffFunctionId: funcao.id,
        });
      }
      await carregar();
    } catch (e) {
      console.error(e);
      setErro("Não foi possível guardar a função desta pessoa.");
    }
    setAGuardar(null);
  };

  // ---------- ecrã ----------

  return (
    <motion.div
      key="tab-equipa"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        <p
          style={{
            fontSize: "13px",
            color: "var(--gray-mid)",
            margin: 0,
            maxWidth: "460px",
          }}
        >
          As pessoas que trabalham nos eventos e o que cada uma sabe fazer. Não
          é preciso conta na plataforma para constar aqui.
        </p>
        {podeGerir && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              style={botaoDiscreto}
              onClick={() => setEditorFuncao({})}
            >
              + Função
            </button>
            <button style={botaoPrimario} onClick={() => setEditorMembro({})}>
              + Pessoa
            </button>
            {/* As indicações fixas da casa: o mesmo pólo, o mesmo crachá,
              em todos os planos. Vivem aqui, com a equipa, porque é da
              equipa que falam — e não há versão por evento. */}
            <button
              style={botaoDiscreto}
              onClick={() => setEditorInstrucoes(true)}
            >
              Indicações
            </button>
          </div>
        )}
      </div>

      {sucesso && (
        <p
          style={{
            fontSize: "12px",
            color: "var(--sucesso)",
            backgroundColor: "var(--sucesso-fundo)",
            border: "1px solid var(--sucesso-borda)",
            borderRadius: "8px",
            padding: "10px 14px",
            marginBottom: "16px",
          }}
        >
          ✓ {sucesso}
        </p>
      )}
      {erro && (
        <p
          style={{
            fontSize: "12px",
            color: "var(--erro, #b3261e)",
            border: "1px solid var(--linha)",
            borderRadius: "8px",
            padding: "10px 14px",
            marginBottom: "16px",
          }}
          role="alert"
        >
          {erro}
        </p>
      )}

      <div
        style={{
          display: "flex",
          gap: "10px",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "16px",
        }}
      >
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Procurar pelo nome…"
          aria-label="Procurar pelo nome"
          style={{
            flex: "1 1 220px",
            minWidth: "160px",
            padding: "9px 14px",
            borderRadius: "999px",
            border: "1px solid var(--linha)",
            backgroundColor: "var(--superficie)",
            color: "var(--charcoal)",
            fontSize: "13px",
          }}
        />
        <label
          style={{
            fontSize: "12px",
            color: "var(--gray-mid)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            whiteSpace: "nowrap",
          }}
        >
          <input
            type="checkbox"
            checked={verInactivos}
            onChange={(e) => setVerInactivos(e.target.checked)}
          />
          Mostrar inactivas
        </label>
      </div>

      {aCarregar ? (
        <p style={{ color: "var(--gray-mid)", fontSize: "13px" }}>
          A carregar…
        </p>
      ) : membros.length === 0 ? (
        <div
          style={{
            backgroundColor: "var(--superficie)",
            borderRadius: "14px",
            padding: "28px 22px",
            boxShadow: "var(--sombra-cartao)",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontFamily: "Playfair Display, serif",
              fontSize: "16px",
              color: "var(--charcoal)",
              margin: "0 0 6px 0",
            }}
          >
            A equipa ainda não está registada
          </p>
          <p
            style={{
              fontSize: "13px",
              color: "var(--gray-mid)",
              margin: "0 0 16px 0",
            }}
          >
            Começa por criar as funções (serviço de mesa, cozinha, montagem…) e
            depois acrescenta as pessoas.
          </p>
          {podeGerir && (
            <button style={botaoPrimario} onClick={() => setEditorMembro({})}>
              + Adicionar a primeira pessoa
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {membrosVisiveis.length === 0 && (
            <p style={{ color: "var(--gray-mid)", fontSize: "13px" }}>
              Nenhuma pessoa corresponde ao que procuraste.
            </p>
          )}
          {membrosVisiveis.map((m) => {
            const asSuas = m.functionIds
              .map((id) => funcaoPorId.get(id))
              .filter(Boolean);
            return (
              <div
                key={m.id}
                style={{
                  backgroundColor: "var(--superficie)",
                  borderRadius: "14px",
                  padding: "18px 20px",
                  boxShadow: "var(--sombra-cartao)",
                  opacity: m.is_active ? 1 : 0.6,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <h3
                      style={{
                        fontSize: "15px",
                        color: "var(--charcoal)",
                        margin: "0 0 6px 0",
                        fontFamily: "Playfair Display, serif",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {m.display_name}
                    </h3>
                    <div
                      style={{
                        display: "flex",
                        gap: "6px",
                        flexWrap: "wrap",
                        marginBottom: "6px",
                      }}
                    >
                      {etiqueta(
                        ENGAGEMENT_LABELS[m.engagement] ?? m.engagement,
                        "var(--gold)",
                      )}
                      {!m.is_active && etiqueta("Inactiva", "var(--gray-mid)")}
                      {m.may_be_consulted
                        ? etiqueta("Pode ser consultada", "var(--gray-mid)")
                        : etiqueta("Não consultar", "var(--gray-mid)")}
                      {m.user_id && etiqueta("Tem conta", "var(--gray-mid)")}
                    </div>
                    {(m.email || m.phone) && (
                      <p
                        style={{
                          fontSize: "12px",
                          color: "var(--gray-mid)",
                          margin: 0,
                        }}
                      >
                        {[m.email, m.phone].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  {podeGerir && (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        style={botaoDiscreto}
                        onClick={() => setEditorMembro(m)}
                      >
                        Editar
                      </button>
                      <button
                        style={botaoDiscreto}
                        disabled={aGuardar === `membro:${m.id}`}
                        onClick={() => alternarMembro(m)}
                      >
                        {aGuardar === `membro:${m.id}`
                          ? "A guardar…"
                          : m.is_active
                            ? "Desactivar"
                            : "Reactivar"}
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: "14px" }}>
                  <p
                    style={{
                      fontSize: "11px",
                      color: "var(--gray-mid)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      margin: "0 0 8px 0",
                    }}
                  >
                    Funções
                  </p>
                  {funcoes.length === 0 ? (
                    <p style={{ fontSize: "12px", color: "var(--gray-mid)", margin: 0 }}>
                      Ainda não há funções criadas.
                    </p>
                  ) : podeGerir ? (
                    <div
                      style={{ display: "flex", flexDirection: "column", gap: "10px" }}
                    >
                      {areasDeFuncoes.map(({ area, items }) => (
                        <div key={area}>
                          <p
                            style={{
                              fontSize: "10px",
                              color: "var(--gray-mid)",
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              margin: "0 0 5px 0",
                            }}
                          >
                            {area}
                          </p>
                          <div
                            style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}
                          >
                            {items.map((f) => {
                              const tem = m.functionIds.includes(f.id);
                              const ocupado =
                                aGuardar === `atrib:${m.id}:${f.id}`;
                              return (
                                <button
                                  key={f.id}
                                  onClick={() => alternarAtribuicao(m, f, tem)}
                                  disabled={ocupado}
                                  aria-pressed={tem}
                                  style={{
                                    fontSize: "11px",
                                    padding: "5px 12px",
                                    borderRadius: "999px",
                                    cursor: "pointer",
                                    border: `1px solid ${tem ? "var(--gold)" : "var(--linha)"}`,
                                    backgroundColor: tem
                                      ? "rgba(var(--ouro-rgb), 0.12)"
                                      : "transparent",
                                    color: tem ? "var(--gold)" : "var(--gray-mid)",
                                    opacity: ocupado ? 0.5 : 1,
                                  }}
                                >
                                  {tem ? "✓ " : "+ "}
                                  {f.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : asSuas.length === 0 ? (
                    <p style={{ fontSize: "12px", color: "var(--gray-mid)", margin: 0 }}>
                      Sem funções atribuídas.
                    </p>
                  ) : (
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {asSuas.map((f) => (
                        <span
                          key={f.id}
                          style={{
                            fontSize: "11px",
                            padding: "5px 12px",
                            borderRadius: "999px",
                            border: "1px solid var(--gold)",
                            color: "var(--gold)",
                          }}
                        >
                          {f.area} · {f.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---- O catálogo das funções ---- */}
      {!aCarregar && funcoes.length > 0 && (
        <div style={{ marginTop: "28px" }}>
          <h3
            style={{
              fontSize: "12px",
              color: "var(--gray-mid)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              margin: "0 0 10px 0",
            }}
          >
            Funções operacionais
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {groupFunctionsByArea(
              funcoes.filter((f) => (verInactivos ? true : f.is_active)),
            ).map(({ area, items }) => (
              <div
                key={area}
                style={{
                  backgroundColor: "var(--superficie)",
                  borderRadius: "12px",
                  padding: "14px 16px",
                  boxShadow: "var(--sombra-cartao)",
                }}
              >
                <p
                  style={{
                    fontSize: "10px",
                    color: "var(--gray-mid)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    margin: "0 0 8px 0",
                  }}
                >
                  {area}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {items.map((f) => (
                    <div
                      key={f.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "10px",
                        flexWrap: "wrap",
                        opacity: f.is_active ? 1 : 0.55,
                      }}
                    >
                      <span style={{ fontSize: "13px", color: "var(--charcoal)" }}>
                        {f.name}
                        {!f.is_active && " (inactiva)"}
                      </span>
                      {podeGerir && (
                        <span style={{ display: "flex", gap: "6px" }}>
                          <button
                            style={botaoDiscreto}
                            onClick={() => setEditorFuncao(f)}
                          >
                            Editar
                          </button>
                          <button
                            style={botaoDiscreto}
                            disabled={aGuardar === `funcao:${f.id}`}
                            onClick={() => alternarFuncao(f)}
                          >
                            {f.is_active ? "Desactivar" : "Reactivar"}
                          </button>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editorMembro && (
        <StaffMemberEditor
          membro={editorMembro.id ? editorMembro : null}
          onGuardar={guardarMembro}
          onFechar={() => setEditorMembro(null)}
        />
      )}
      {editorInstrucoes && (
        <InstrucoesEquipa
          organizationId={organizationId}
          instrucoes={instrucoes}
          onGuardadas={(guardadas) => {
            setInstrucoes(guardadas);
            setEditorInstrucoes(false);
            anunciar("Indicações da equipa guardadas.");
          }}
          onFechar={() => setEditorInstrucoes(false)}
        />
      )}

      {editorFuncao && (
        <StaffFunctionEditor
          funcao={editorFuncao.id ? editorFuncao : null}
          areasConhecidas={[...new Set(funcoes.map((f) => f.area))]}
          onGuardar={guardarFuncao}
          onFechar={() => setEditorFuncao(null)}
        />
      )}
    </motion.div>
  );
}
