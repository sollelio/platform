import { useCallback, useEffect, useState } from "react";
import { Convite } from "./acabamento";
import {
  alertasDeEquipa,
  prazoEmPalavras,
} from "../../lib/staffAlertsLogic";
import TarefaEditor from "./TarefaEditor";
import EquipaDaTarefa from "./EquipaDaTarefa";
import { listStaffFunctions, listStaffMembers } from "../../lib/staff";
import {
  assignStaffToTask,
  listConsultationAnswers,
  listConsultationsForEvent,
  listEventAssignments,
  mensagemDaRecusaDeEscala,
  unassignStaffFromTask,
} from "../../lib/assignments";
import {
  createEventTask,
  listEventTasks,
  setEventTaskActive,
  updateEventTask,
} from "../../lib/eventTasks";

// ============================================================
// AS TAREFAS DO EVENTO.
//
// O que é preciso fazer neste evento, quando, com que capacidade e
// com quantas pessoas no mínimo. Não escolhe ninguém: a escala é
// passo posterior, e esta lista é o que a consulta de
// disponibilidade lê para saber a quem faz sentido perguntar.
//
// Sem tarefas não há consulta possível — daí o convite dizer isso.
//
// Debaixo de cada tarefa está a escala: quem sabe fazer aquilo, o que
// respondeu, e quem está escalado. Um evento de cada vez, sempre — a
// consulta pode cobrir vários, mas montar a escala é trabalho de um dia.
//
// Uma consulta pode não ser a única a cobrir este evento. Nesse caso
// mostra-se a mais recente e diz-se qual é, com um selector para trocar.
// Nunca se juntam respostas de consultas diferentes: foram perguntas
// diferentes, e somá-las era inventar uma resposta que ninguém deu.
// ============================================================

const caixaErro = {
  fontSize: "12.5px",
  color: "var(--perigo-texto)",
  backgroundColor: "var(--perigo-fundo)",
  border: "1px solid var(--perigo-borda)",
  borderRadius: "10px",
  padding: "10px 14px",
  margin: "0 0 16px",
};

const cartao = {
  backgroundColor: "var(--superficie)",
  border: "1px solid var(--borda)",
  borderRadius: "14px",
  padding: "16px 18px",
  boxShadow: "var(--sombra-cartao)",
};

const quando = (iso, fim) => {
  if (!iso) return "";
  const d = new Date(iso);
  const dia = d.toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  const hora = d.toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (!fim) return `${dia} · ${hora}`;
  const f = new Date(fim);
  const horaF = f.toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const mesmoDia = f.toDateString() === d.toDateString();
  if (mesmoDia) return `${dia} · ${hora}–${horaF}`;
  const diaF = f.toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  return `${dia} ${hora} → ${diaF} ${horaF}`;
};

export default function TarefasEvento({
  organizationId,
  submissionId,
  dataEvento,
  estadoEvento,
  podeGerir,
  podeEscalar,
  onContagem,
}) {
  const [tarefas, setTarefas] = useState([]);
  const [funcoes, setFuncoes] = useState([]);
  const [membros, setMembros] = useState([]);
  const [atribuicoes, setAtribuicoes] = useState([]);
  const [consultas, setConsultas] = useState([]);
  const [escolhidaId, setEscolhidaId] = useState(null);
  const [consultadas, setConsultadas] = useState(new Set());
  const [respostas, setRespostas] = useState(new Map());
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState(null);
  const [sucesso, setSucesso] = useState(null);
  const [aGuardar, setAGuardar] = useState(null);
  const [editor, setEditor] = useState(null);
  const [mostrarInactivas, setMostrarInactivas] = useState(false);

  const anunciar = (msg) => {
    setSucesso(msg);
    setTimeout(() => setSucesso(null), 4000);
  };

  const buscar = useCallback(
    async (consultaPreferida) => {
      if (!organizationId || !submissionId) return null;
      const [t, f, m, a, cs] = await Promise.all([
        listEventTasks(organizationId, submissionId),
        listStaffFunctions(organizationId),
        listStaffMembers(organizationId),
        listEventAssignments(organizationId, submissionId),
        listConsultationsForEvent(organizationId, submissionId),
      ]);
      // A escolhida é a que a Nádia pediu, se ainda cobrir o evento;
      // senão a mais recente. Determinista nos dois casos.
      const escolhida =
        cs.find((c) => c.id === consultaPreferida) ?? cs[0] ?? null;
      const respostas = escolhida
        ? await listConsultationAnswers(organizationId, escolhida.id)
        : { consultadas: new Set(), respostas: new Map() };
      return {
        tarefas: t,
        funcoes: f,
        membros: m,
        atribuicoes: a,
        consultas: cs,
        escolhida,
        ...respostas,
      };
    },
    [organizationId, submissionId],
  );

  const aterrar = useCallback(
    (r) => {
      setTarefas(r.tarefas);
      setFuncoes(r.funcoes);
      setMembros(r.membros);
      setAtribuicoes(r.atribuicoes);
      setConsultas(r.consultas);
      setEscolhidaId(r.escolhida?.id ?? null);
      setConsultadas(r.consultadas);
      setRespostas(r.respostas);
      setErro(null);
      onContagem?.(r.tarefas.filter((t) => t.is_active).length);
    },
    [onContagem],
  );

  const carregar = useCallback(
    async (consultaPreferida) => {
      setACarregar(true);
      try {
        const r = await buscar(consultaPreferida ?? escolhidaId);
        if (r) aterrar(r);
      } catch (e) {
        console.error(e);
        setErro("Não foi possível ler as tarefas deste evento.");
      } finally {
        setACarregar(false);
      }
    },
    [buscar, aterrar, escolhidaId],
  );

  useEffect(() => {
    let vivo = true;
    buscar()
      .then((r) => {
        if (!vivo || !r) return;
        aterrar(r);
        setACarregar(false);
      })
      .catch((e) => {
        if (!vivo) return;
        console.error(e);
        setErro("Não foi possível ler as tarefas deste evento.");
        setACarregar(false);
      });
    return () => {
      vivo = false;
    };
    // onContagem é do pai e muda a cada pintura; a busca depende só dos ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscar]);

  const guardar = async (dados) => {
    if (editor?.id) {
      await updateEventTask({ id: editor.id, ...dados });
      anunciar("Tarefa actualizada.");
    } else {
      await createEventTask({ organizationId, submissionId, ...dados });
      anunciar("Tarefa criada.");
    }
    setEditor(null);
    await carregar();
  };

  const alternarActiva = async (t) => {
    setAGuardar(`tarefa:${t.id}`);
    try {
      await setEventTaskActive(t.id, !t.is_active);
      await carregar();
      anunciar(t.is_active ? "Tarefa desactivada." : "Tarefa reactivada.");
    } catch (e) {
      console.error(e);
      setErro("Não foi possível mudar o estado da tarefa.");
    } finally {
      setAGuardar(null);
    }
  };

  const atribuir = async (tarefaId, pessoaId) => {
    setAGuardar(`atribuir:${tarefaId}:${pessoaId}`);
    try {
      await assignStaffToTask({
        eventTaskId: tarefaId,
        staffMemberId: pessoaId,
      });
      await carregar();
      anunciar("Escalada.");
    } catch (e) {
      console.error(e);
      setErro(mensagemDaRecusaDeEscala(e));
    } finally {
      setAGuardar(null);
    }
  };

  const retirar = async (atribuicaoId) => {
    setAGuardar(`retirar:${atribuicaoId}`);
    try {
      await unassignStaffFromTask(atribuicaoId);
      await carregar();
      anunciar("Retirada da tarefa.");
    } catch (e) {
      console.error(e);
      setErro("Não foi possível retirar a pessoa da tarefa.");
    } finally {
      setAGuardar(null);
    }
  };

  // Quem sabe fazer o que a tarefa exige. Inclui inactivas, para uma
  // atribuição antiga não desaparecer do ecrã por a pessoa ter saído.
  const compativeisDa = (tarefa) =>
    membros.filter((m) => m.functionIds?.includes(tarefa.staff_function_id));

  const nomeDaFuncao = (id) => funcoes.find((f) => f.id === id)?.name ?? "—";
  const areaDaFuncao = (id) => funcoes.find((f) => f.id === id)?.area ?? null;

  const escolhida = consultas.find((c) => c.id === escolhidaId) ?? null;
  // O mesmo aviso que o Início dá, aqui dentro do evento: quem chega
  // pela ficha e não pelo Início tem de o ver na mesma. Calculado do
  // que já está em mãos — a data e o estado vêm da própria página.
  const alerta = alertasDeEquipa({
    eventos: [
      { id: submissionId, data_evento: dataEvento, status: estadoEvento },
    ],
    tarefas: tarefas.map((t) => ({ ...t, submission_id: submissionId })),
    coberturas: consultas.map(() => ({ submission_id: submissionId })),
    atribuicoes,
  })[0];
  const visiveis = mostrarInactivas
    ? tarefas
    : tarefas.filter((t) => t.is_active);
  const inactivas = tarefas.length - tarefas.filter((t) => t.is_active).length;

  return (
    <div>
      {erro && (
        <p role="alert" style={caixaErro}>
          ⚠ {erro}
        </p>
      )}
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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "18px",
        }}
      >
        <p
          style={{
            fontSize: "12.5px",
            color: "var(--texto-suave)",
            margin: 0,
            flex: 1,
            minWidth: "200px",
          }}
        >
          O trabalho que este evento exige. O mínimo de pessoas é um chão, não
          um tecto — e ninguém fica escalado aqui.
        </p>
        {inactivas > 0 && (
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              color: "var(--texto-suave)",
            }}
          >
            <input
              type="checkbox"
              checked={mostrarInactivas}
              onChange={(e) => setMostrarInactivas(e.target.checked)}
            />
            Mostrar desactivadas ({inactivas})
          </label>
        )}
        {podeGerir && funcoes.length > 0 && (
          <button
            className="acao acao--ouro"
            onClick={() => setEditor({})}
            style={{
              padding: "9px 16px",
              borderRadius: "10px",
              fontSize: "12.5px",
              fontWeight: "500",
            }}
          >
            Nova tarefa
          </button>
        )}
      </div>

      {alerta && (
        <div
          role="status"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "3px",
            padding: "11px 14px",
            marginBottom: "16px",
            borderRadius: "10px",
            border: `1px solid ${
              alerta.motivos.some((m) => m.tipo === "equipa")
                ? "var(--perigo-borda)"
                : "var(--aviso-borda)"
            }`,
            backgroundColor: alerta.motivos.some((m) => m.tipo === "equipa")
              ? "var(--perigo-fundo)"
              : "var(--aviso-fundo)",
          }}
        >
          {alerta.motivos.map((m) => (
            <span
              key={m.tipo}
              style={{
                fontSize: "12.5px",
                color:
                  m.tipo === "equipa"
                    ? "var(--perigo-texto)"
                    : "var(--aviso-texto)",
                lineHeight: 1.5,
              }}
            >
              ⚠ {m.texto} — {prazoEmPalavras(alerta.dias)}.
            </span>
          ))}
        </div>
      )}

      {/* De onde vêm as respostas que a grelha mostra. Se houver mais do
        que uma consulta a cobrir este evento, mostra-se UMA — a mais
        recente — e diz-se qual, com um selector para trocar. Somar
        respostas de consultas diferentes seria inventar uma resposta
        que ninguém deu. */}
      {consultas.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
            padding: "9px 14px",
            marginBottom: "16px",
            borderRadius: "10px",
            border: "1px solid var(--borda)",
            backgroundColor: "var(--superficie-quente, transparent)",
          }}
        >
          <span style={{ fontSize: "11.5px", color: "var(--texto-suave)" }}>
            Respostas da consulta
          </span>
          {consultas.length === 1 ? (
            <span style={{ fontSize: "12.5px", color: "var(--texto)" }}>
              {escolhida?.title}
              {escolhida?.closed_at ? " (fechada)" : ""}
            </span>
          ) : (
            <>
              <select
                aria-label="Consulta cujas respostas a grelha mostra"
                value={escolhidaId ?? ""}
                onChange={(e) => {
                  setEscolhidaId(e.target.value);
                  carregar(e.target.value);
                }}
                style={{
                  fontSize: "12.5px",
                  padding: "5px 9px",
                  borderRadius: "8px",
                  border: "1px solid var(--borda)",
                  backgroundColor: "var(--superficie)",
                  color: "var(--texto)",
                }}
              >
                {consultas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                    {c.closed_at ? " (fechada)" : ""}
                  </option>
                ))}
              </select>
              <span
                style={{ fontSize: "11.5px", color: "var(--texto-suave)" }}
              >
                — {consultas.length} consultas cobrem este evento; mostra-se
                uma de cada vez
              </span>
            </>
          )}
        </div>
      )}

      {aCarregar ? (
        <p style={{ color: "var(--texto-suave)", fontSize: "13px" }}>
          A carregar…
        </p>
      ) : funcoes.length === 0 ? (
        <Convite
          titulo="Ainda não há funções operacionais"
          texto="Uma tarefa exige sempre uma capacidade — serviço de mesa, empratamento, o que for. Cria as funções da casa na Equipa e volta aqui."
        />
      ) : visiveis.length === 0 ? (
        <Convite
          titulo="Este evento ainda não tem tarefas"
          texto="Escreve o que é preciso fazer, quando, que função exige e quantas pessoas precisa no mínimo. É desta lista que sai a consulta de disponibilidade."
          accao="Nova tarefa"
          onAccao={podeGerir ? () => setEditor({}) : undefined}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {visiveis.map((t) => {
            const ocupado = aGuardar === `tarefa:${t.id}`;
            const area = areaDaFuncao(t.staff_function_id);
            return (
              <div
                key={t.id}
                style={{
                  ...cartao,
                  opacity: t.is_active ? (ocupado ? 0.5 : 1) : 0.6,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <p
                      style={{
                        fontSize: "14px",
                        color: "var(--texto)",
                        margin: "0 0 4px",
                        fontWeight: 500,
                      }}
                    >
                      {t.title}
                      {!t.is_active && (
                        <span
                          style={{
                            fontSize: "10.5px",
                            color: "var(--texto-suave)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            marginLeft: "8px",
                          }}
                        >
                          desactivada
                        </span>
                      )}
                    </p>
                    <p
                      style={{
                        fontSize: "12.5px",
                        color: "var(--texto-suave)",
                        margin: 0,
                      }}
                    >
                      {quando(t.starts_at, t.ends_at)}
                    </p>
                    {t.notes && (
                      <p
                        style={{
                          fontSize: "12.5px",
                          color: "var(--texto-suave)",
                          margin: "6px 0 0",
                          lineHeight: 1.5,
                        }}
                      >
                        {t.notes}
                      </p>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: "6px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        padding: "4px 10px",
                        borderRadius: "999px",
                        border: "1px solid var(--borda)",
                        color: "var(--texto-suave)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {nomeDaFuncao(t.staff_function_id)}
                      {area ? ` · ${area}` : ""}
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--ouro-texto)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      mínimo {t.minimum_people}{" "}
                      {t.minimum_people === 1 ? "pessoa" : "pessoas"}
                    </span>
                  </div>
                </div>

                {podeGerir && (
                  <div
                    style={{
                      display: "flex",
                      gap: "6px",
                      marginTop: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      className="acao acao--neutra"
                      disabled={ocupado}
                      onClick={() => setEditor(t)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "999px",
                        fontSize: "11.5px",
                      }}
                    >
                      Editar
                    </button>
                    <button
                      className="acao acao--neutra"
                      disabled={ocupado}
                      onClick={() => alternarActiva(t)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "999px",
                        fontSize: "11.5px",
                      }}
                    >
                      {t.is_active ? "Desactivar" : "Reactivar"}
                    </button>
                  </div>
                )}

                {t.is_active && (
                  <EquipaDaTarefa
                    tarefa={t}
                    compativeis={compativeisDa(t)}
                    membros={membros}
                    atribuicoes={atribuicoes}
                    consultadas={consultadas}
                    respostas={respostas}
                    podeGerir={podeEscalar}
                    aGuardar={aGuardar}
                    onAtribuir={atribuir}
                    onRetirar={retirar}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {editor && (
        <TarefaEditor
          tarefa={editor.id ? editor : null}
          funcoes={funcoes.filter((f) => f.is_active || f.id === editor.staff_function_id)}
          onGuardar={guardar}
          onFechar={() => setEditor(null)}
        />
      )}
    </div>
  );
}
