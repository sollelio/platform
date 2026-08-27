import { useCallback, useEffect, useState } from "react";
import { Convite } from "./acabamento";
import { listStaffMembers } from "../../lib/staff";
import { listEventTasks } from "../../lib/eventTasks";
import { listEventAssignments } from "../../lib/assignments";
import { getTeamInstructions } from "../../lib/planos";
import { formatarPlanoTexto, planosDoEvento } from "../../lib/planoFormato";

// ============================================================
// OS PLANOS INDIVIDUAIS DE UM EVENTO.
//
// Um plano por pessoa escalada, deste evento. A mesma pessoa noutro
// evento tem outro plano, noutro sítio — nunca se juntam, e não há
// plano semanal.
//
// Sai das ATRIBUIÇÕES e de mais nada: quem a Nádia escalou tem plano,
// tenha respondido o que tiver respondido à consulta. Os avisos de
// disponibilidade vivem na aba das Tarefas e não impedem nada aqui.
//
// O que importa é o botão de copiar: o plano vai à mão, por WhatsApp.
// «Copiado» só se afirma depois de a cópia ACONTECER — afirmar sucesso
// punha a Nádia a colar nada numa conversa.
// ============================================================

const cartao = {
  backgroundColor: "var(--superficie)",
  border: "1px solid var(--borda)",
  borderRadius: "14px",
  padding: "18px 20px",
  boxShadow: "var(--sombra-cartao)",
};

const seccao = {
  fontSize: "10.5px",
  fontWeight: 600,
  color: "var(--texto-suave)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  margin: "0 0 8px",
};

const caixaErro = {
  fontSize: "12.5px",
  color: "var(--perigo-texto)",
  backgroundColor: "var(--perigo-fundo)",
  border: "1px solid var(--perigo-borda)",
  borderRadius: "10px",
  padding: "10px 14px",
  margin: "0 0 16px",
};

export default function PlanosEvento({
  organizationId,
  submissionId,
  resumoDoEvento,
  onContagem,
}) {
  const [planos, setPlanos] = useState([]);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState(null);
  const [copiado, setCopiado] = useState(null);
  const [semIndicacoes, setSemIndicacoes] = useState(false);

  const buscar = useCallback(async () => {
    if (!organizationId || !submissionId) return null;
    const [tarefas, atribuicoes, membros, instrucoes] = await Promise.all([
      listEventTasks(organizationId, submissionId),
      listEventAssignments(organizationId, submissionId),
      listStaffMembers(organizationId),
      getTeamInstructions(organizationId),
    ]);
    return {
      planos: planosDoEvento({
        evento: resumoDoEvento,
        tarefas,
        atribuicoes,
        membros,
        instrucoes,
      }),
      instrucoes,
    };
  }, [organizationId, submissionId, resumoDoEvento]);

  useEffect(() => {
    let vivo = true;
    buscar()
      .then((r) => {
        if (!vivo || !r) return;
        setPlanos(r.planos);
        setSemIndicacoes(
          !r.instrucoes?.standard_instructions &&
            !r.instrucoes?.hot_weather_instructions,
        );
        setErro(null);
        setACarregar(false);
        onContagem?.(r.planos.length);
      })
      .catch((e) => {
        if (!vivo) return;
        console.error(e);
        setErro("Não foi possível montar os planos deste evento.");
        setACarregar(false);
      });
    return () => {
      vivo = false;
    };
    // onContagem é do pai e muda a cada pintura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscar]);

  const copiar = async (plano) => {
    try {
      await navigator.clipboard.writeText(formatarPlanoTexto(plano));
      setErro(null);
      setCopiado(plano.pessoa.id);
      setTimeout(() => setCopiado(null), 2500);
    } catch (e) {
      console.error(e);
      setErro(
        "Não foi possível copiar automaticamente. Selecciona o texto do plano e copia à mão.",
      );
    }
  };

  if (aCarregar)
    return (
      <p style={{ color: "var(--texto-suave)", fontSize: "13px" }}>
        A carregar…
      </p>
    );

  return (
    <div>
      {erro && (
        <p role="alert" style={caixaErro}>
          ⚠ {erro}
        </p>
      )}

      {planos.length === 0 ? (
        <Convite
          titulo="Ainda não há ninguém escalado"
          texto="Um plano nasce de uma atribuição: abre as Tarefas deste evento, escala quem vai fazer o quê, e os planos aparecem aqui prontos a enviar."
        />
      ) : (
        <>
          <p
            style={{
              fontSize: "12.5px",
              color: "var(--texto-suave)",
              margin: "0 0 18px",
              lineHeight: 1.55,
            }}
          >
            Um plano por pessoa escalada neste evento. Copia e envia por
            WhatsApp.
            {semIndicacoes && (
              <>
                {" "}
                As indicações fixas da equipa ainda não estão escritas — vê a
                Equipa, em Indicações.
              </>
            )}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {planos.map((plano) => (
              <div key={plano.pessoa.id} style={cartao}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    flexWrap: "wrap",
                    marginBottom: "14px",
                  }}
                >
                  <p
                    style={{
                      fontFamily: "Playfair Display, serif",
                      fontSize: "16px",
                      color: "var(--texto)",
                      margin: 0,
                      flex: 1,
                      minWidth: "140px",
                    }}
                  >
                    {plano.pessoa.display_name}
                    {!plano.pessoa.is_active && (
                      <span
                        style={{
                          fontSize: "10px",
                          fontFamily: "inherit",
                          color: "var(--texto-suave)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          marginLeft: "8px",
                        }}
                      >
                        inactiva
                      </span>
                    )}
                  </p>
                  <button
                    className="acao acao--ouro"
                    onClick={() => copiar(plano)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "10px",
                      fontSize: "12.5px",
                      fontWeight: 500,
                    }}
                  >
                    {copiado === plano.pessoa.id ? "✓ Copiado" : "Copiar plano"}
                  </button>
                </div>

                {plano.dias.map((dia) => (
                  <div key={dia.data} style={{ marginBottom: "12px" }}>
                    <p style={seccao}>{dia.dataPorExtenso}</p>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {dia.tarefas.map((t) => (
                        <div
                          key={t.id}
                          style={{
                            paddingLeft: "12px",
                            borderLeft: "2px solid var(--ouro-suave, var(--borda))",
                          }}
                        >
                          <p
                            style={{
                              fontSize: "13.5px",
                              color: "var(--texto)",
                              margin: "0 0 2px",
                            }}
                          >
                            <strong style={{ fontWeight: 600 }}>
                              {t.fim ? `${t.inicio}–${t.fim}` : t.inicio}
                            </strong>{" "}
                            · {t.titulo}
                          </p>
                          {t.notas && (
                            <p
                              style={{
                                fontSize: "12.5px",
                                color: "var(--texto-suave)",
                                margin: "0 0 2px",
                                lineHeight: 1.5,
                              }}
                            >
                              {t.notas}
                            </p>
                          )}
                          {t.colegas.length > 0 && (
                            <p
                              style={{
                                fontSize: "12px",
                                color: "var(--texto-suave)",
                                margin: 0,
                              }}
                            >
                              Com: {t.colegas.join(", ")}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {(plano.instrucoes?.standard_instructions ||
                  plano.instrucoes?.hot_weather_instructions) && (
                  <div
                    style={{
                      marginTop: "14px",
                      paddingTop: "12px",
                      borderTop: "1px dashed var(--borda)",
                    }}
                  >
                    {plano.instrucoes.standard_instructions && (
                      <>
                        <p style={seccao}>Indicações da equipa</p>
                        <p
                          style={{
                            fontSize: "12.5px",
                            color: "var(--texto-suave)",
                            margin: "0 0 10px",
                            lineHeight: 1.55,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {plano.instrucoes.standard_instructions}
                        </p>
                      </>
                    )}
                    {plano.instrucoes.hot_weather_instructions && (
                      <>
                        <p style={seccao}>Em dias de muito calor</p>
                        <p
                          style={{
                            fontSize: "12.5px",
                            color: "var(--texto-suave)",
                            margin: 0,
                            lineHeight: 1.55,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {plano.instrucoes.hot_weather_instructions}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
