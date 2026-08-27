import {
  ESTADO_RESPOSTA,
  estadoDaPessoa,
  posicaoDaTarefa,
} from "../../lib/staffingLogic";

// ============================================================
// QUEM FAZ ESTA TAREFA.
//
// Uma tarefa, as pessoas que a sabem fazer, o que cada uma respondeu na
// consulta, e quem está escalado. Um evento de cada vez — montar uma
// escala é trabalho de um dia, e uma grelha que juntasse eventos punha
// a Nádia a separá-los de cabeça.
//
// A disponibilidade INFORMA, não decide: escalar quem disse que não
// podia é permitido, aparece assinalado, e grava à mesma. O aviso de
// mínimo é só quando FALTA gente — estar acima do mínimo não é problema
// nenhum e não se comenta.
//
// «Sem resposta» e «não recebe consultas» são coisas diferentes e
// mostram-se diferentes. A Nádia é o caso: nunca recebe ligação, e
// continua a poder ser escalada — não é um esquecimento dela.
// ============================================================

const CHIP = {
  available: { fundo: "rgba(46,125,50,0.12)", cor: "#2E7D32" },
  unavailable: { fundo: "var(--perigo-fundo)", cor: "var(--perigo-texto)" },
  partial: { fundo: "rgba(184,134,11,0.14)", cor: "#8A6508" },
  unanswered: { fundo: "var(--neutro-fundo)", cor: "var(--texto-suave)" },
  not_consulted: { fundo: "transparent", cor: "var(--texto-apagado)" },
  non_consultable: { fundo: "transparent", cor: "var(--texto-apagado)" },
};

const seccao = {
  fontSize: "10.5px",
  fontWeight: 600,
  color: "var(--texto-suave)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  margin: "0 0 8px",
};

const hora = (iso) =>
  iso
    ? new Date(iso).toLocaleString("pt-PT", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const janelaEmPalavras = (e) => {
  if (e.estado !== "partial") return null;
  const partes = [];
  if (e.de) partes.push(`a partir de ${hora(e.de)}`);
  if (e.ate) partes.push(`até ${hora(e.ate)}`);
  return partes.join(", ") || "sem limites indicados";
};

function Chip({ estado }) {
  const c = CHIP[estado] ?? CHIP.not_consulted;
  return (
    <span
      style={{
        fontSize: "10.5px",
        padding: "3px 9px",
        borderRadius: "999px",
        backgroundColor: c.fundo,
        color: c.cor,
        border: c.fundo === "transparent" ? "1px solid var(--borda)" : "none",
        whiteSpace: "nowrap",
      }}
    >
      {ESTADO_RESPOSTA[estado] ?? estado}
    </span>
  );
}

export default function EquipaDaTarefa({
  tarefa,
  compativeis,
  atribuicoes,
  consultadas,
  respostas,
  podeGerir,
  aGuardar,
  onAtribuir,
  onRetirar,
}) {
  const pos = posicaoDaTarefa({
    tarefa,
    compativeis,
    atribuicoes,
    consultadas,
    respostas,
  });
  const minimo = tarefa.minimum_people ?? 1;
  const idsEscalados = new Set(pos.escalados.map((e) => e.pessoa.id));
  // Quem pode entrar: compatível, activa, e ainda não escalada. Ordem de
  // nome, a de sempre — nada aqui ordena por aptidão.
  const porEscalar = compativeis.filter(
    (p) => p.is_active && !idsEscalados.has(p.id),
  );

  return (
    <div
      style={{
        marginTop: "14px",
        paddingTop: "14px",
        borderTop: "1px dashed var(--borda)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
          marginBottom: "12px",
        }}
      >
        <span
          style={{
            fontSize: "12.5px",
            fontWeight: 600,
            color: pos.abaixoDoMinimo ? "var(--perigo-texto)" : "var(--texto)",
          }}
        >
          {pos.escalados.length} de {minimo}
          {pos.escalados.length > minimo ? " (mínimo)" : ""}
        </span>
        {pos.abaixoDoMinimo && (
          <span
            style={{
              fontSize: "11.5px",
              padding: "3px 10px",
              borderRadius: "999px",
              backgroundColor: "var(--perigo-fundo)",
              color: "var(--perigo-texto)",
              border: "1px solid var(--perigo-borda)",
            }}
          >
            ⚠ Falta{pos.emFalta === 1 ? "" : "m"} {pos.emFalta}
          </span>
        )}
        {pos.conflitos.length > 0 && (
          <span
            style={{
              fontSize: "11.5px",
              padding: "3px 10px",
              borderRadius: "999px",
              backgroundColor: "var(--aviso-fundo)",
              color: "var(--aviso-texto)",
              border: "1px solid var(--aviso-borda)",
            }}
          >
            ⚠ {pos.conflitos.length}{" "}
            {pos.conflitos.length === 1 ? "conflito" : "conflitos"} de
            disponibilidade
          </span>
        )}
      </div>

      {pos.escalados.length > 0 && (
        <div style={{ marginBottom: "14px" }}>
          <p style={seccao}>Escalados</p>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "6px" }}
          >
            {pos.escalados.map((e) => {
              const conflito = pos.conflitos.some(
                (c) => c.pessoa.id === e.pessoa.id,
              );
              const ocupado = aGuardar === `retirar:${e.atribuicaoId}`;
              return (
                <div
                  key={e.atribuicaoId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flexWrap: "wrap",
                    padding: "7px 10px",
                    borderRadius: "10px",
                    border: `1px solid ${conflito ? "var(--aviso-borda)" : "var(--borda)"}`,
                    backgroundColor: conflito
                      ? "var(--aviso-fundo)"
                      : "transparent",
                    opacity: ocupado ? 0.5 : 1,
                  }}
                >
                  <span
                    style={{
                      fontSize: "13px",
                      color: "var(--texto)",
                      flex: "1 1 120px",
                    }}
                  >
                    {e.pessoa.display_name}
                    {!e.pessoa.is_active && (
                      <span
                        style={{
                          fontSize: "10px",
                          color: "var(--texto-suave)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          marginLeft: "7px",
                        }}
                      >
                        inactiva
                      </span>
                    )}
                  </span>
                  <Chip estado={e.estado} />
                  {e.estado === "partial" && (
                    <span
                      style={{
                        fontSize: "11.5px",
                        color:
                          e.cobertura === "cobre"
                            ? "var(--texto-suave)"
                            : "var(--aviso-texto)",
                      }}
                    >
                      {janelaEmPalavras(e)}
                      {e.cobertura === "nao-cobre"
                        ? " — não cobre a tarefa toda"
                        : e.cobertura === "indeterminada"
                          ? " — a tarefa não tem fim marcado, não dá para confirmar"
                          : ""}
                    </span>
                  )}
                  {podeGerir && (
                    <button
                      className="acao acao--neutra"
                      disabled={Boolean(aGuardar)}
                      onClick={() => onRetirar(e.atribuicaoId)}
                      style={{
                        padding: "5px 11px",
                        borderRadius: "999px",
                        fontSize: "11px",
                      }}
                    >
                      Retirar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {pos.disponiveisPorEscalar.length > 0 && (
        <p
          style={{
            fontSize: "11.5px",
            color: "#2E7D32",
            margin: "0 0 12px",
            lineHeight: 1.5,
          }}
        >
          Disseram que podem e não estão escalados:{" "}
          {pos.disponiveisPorEscalar.map((x) => x.pessoa.display_name).join(", ")}
        </p>
      )}

      {porEscalar.length > 0 && (
        <div>
          <p style={seccao}>Quem sabe fazer isto</p>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {porEscalar.map((p) => {
              const e = estadoDaPessoa({ pessoa: p, tarefa, consultadas, respostas });
              const ocupado = aGuardar === `atribuir:${tarefa.id}:${p.id}`;
              return (
                <button
                  key={p.id}
                  disabled={!podeGerir || Boolean(aGuardar)}
                  onClick={() => onAtribuir(tarefa.id, p.id)}
                  title={
                    podeGerir
                      ? `Escalar ${p.display_name}`
                      : "Sem permissão para escalar"
                  }
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "11.5px",
                    padding: "5px 12px",
                    borderRadius: "999px",
                    border: "1px solid var(--borda)",
                    backgroundColor: "transparent",
                    color: "var(--texto-suave)",
                    cursor: podeGerir && !aGuardar ? "pointer" : "default",
                    opacity: ocupado ? 0.5 : 1,
                  }}
                >
                  {podeGerir ? "+ " : ""}
                  {p.display_name}
                  <Chip estado={e.estado} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {compativeis.length === 0 && (
        <p
          style={{
            fontSize: "12px",
            color: "var(--texto-suave)",
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Ninguém da equipa tem a função que esta tarefa exige. Atribui-a a
          alguém na Equipa, ou muda a função da tarefa.
        </p>
      )}
    </div>
  );
}
