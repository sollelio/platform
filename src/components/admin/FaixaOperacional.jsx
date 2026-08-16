import { getFaixaOperacional } from "../../lib/submissionFields";

// ============================================================
// FaixaOperacional — as quatro respostas que ela procura com o carro à
// porta: a que horas monta, a que horas recolhe, quem manda no dia, e
// para onde é que vai.
//
// Estão no topo da Visão geral em destaque porque são as únicas que
// têm hora marcada. O resto do briefing lê-se sentada; isto lê-se de
// pé. Os campos são os mesmos do modelo — nada aqui é uma segunda
// fonte, é só a mesma folha com o que urge em primeiro lugar.
//
// "Os mesmos do modelo" passou a ser verdade em código e não só em
// intenção: quem resolve cada resposta é o getFaixaOperacional, contra
// os passos do modelo. Aqui só se desenha o que ele devolver.
// ============================================================

const texto = (v) => {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
};

function Bloco({ rotulo, children, largo }) {
  return (
    <div style={{ flex: largo ? "2 1 280px" : "1 1 170px", minWidth: 0 }}>
      <p
        style={{
          fontSize: "9px",
          fontWeight: "700",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--gold-dark)",
          margin: "0 0 5px",
        }}
      >
        {rotulo}
      </p>
      {children}
    </div>
  );
}

const horas = { fontSize: "17px", color: "var(--charcoal)", margin: 0 };
const sub = {
  fontSize: "11.5px",
  color: "var(--gray-mid)",
  margin: "3px 0 0",
  textWrap: "pretty",
};

export default function FaixaOperacional({ submissao, seccoes }) {
  const f = getFaixaOperacional(submissao, seccoes);

  const montagem = texto(f.montagem);
  const limiteMontagem = texto(f.limiteMontagem);
  const recolha = texto(f.recolha);
  const diaSeguinte = texto(f.diaSeguinte);
  const responsavel = texto(f.responsavel);
  const relacao = texto(f.relacao);
  const contactoResp = texto(f.contactoResponsavel);
  const abre = texto(f.abre);
  const contactoAbre = texto(f.contactoAbre);
  const morada = texto(f.morada);
  const acessos = texto(f.acessos);
  const notasAcesso = texto(f.notasAcesso);
  const inicio = texto(f.inicio);
  const fim = texto(f.fim);

  // Sem nenhuma destas respostas não há faixa nenhuma para mostrar —
  // um evento acabado de criar não deve abrir com uma caixa vazia.
  if (
    !montagem &&
    !recolha &&
    !responsavel &&
    !morada &&
    !inicio &&
    !abre
  ) {
    return null;
  }

  return (
    <div
      style={{
        backgroundColor: "var(--superficie-quente)",
        border: "1px solid var(--gold-light)",
        borderRadius: "14px",
        padding: "16px 20px",
        marginBottom: "20px",
        display: "flex",
        gap: "28px",
        flexWrap: "wrap",
        alignItems: "flex-start",
      }}
    >
      {(montagem || limiteMontagem) && (
        <Bloco rotulo="Montagem">
          <p style={horas}>
            {montagem || "—"}
            {limiteMontagem && (
              <>
                <span style={{ color: "var(--gold)", margin: "0 6px" }}>→</span>
                {limiteMontagem}
              </>
            )}
          </p>
          {abre && (
            <p style={sub}>
              espaço aberto por {abre}
              {contactoAbre && ` · ${contactoAbre}`}
            </p>
          )}
        </Bloco>
      )}

      {recolha && (
        <Bloco rotulo="Recolha">
          <p style={horas}>{recolha}</p>
          {diaSeguinte && (
            <p style={sub}>
              dia seguinte possível:{" "}
              <span style={{ color: "var(--sucesso-texto)", fontWeight: "600" }}>
                {diaSeguinte}
              </span>
            </p>
          )}
        </Bloco>
      )}

      {responsavel && (
        <Bloco rotulo="Responsável no dia">
          <p style={{ ...horas, fontSize: "14px" }}>{responsavel}</p>
          <p style={sub}>
            {[relacao, contactoResp].filter(Boolean).join(" · ")}
          </p>
        </Bloco>
      )}

      {morada && (
        <Bloco rotulo="Morada exacta" largo>
          <p style={{ ...horas, fontSize: "13px", lineHeight: 1.45 }}>
            {morada}
          </p>
          <p style={sub}>
            {[acessos, notasAcesso].filter(Boolean).join(" · ")}
          </p>
        </Bloco>
      )}

      {(inicio || fim) && (
        <Bloco rotulo="Evento">
          <p style={{ ...horas, fontSize: "14px" }}>
            {inicio || "—"}
            {fim && (
              <>
                <span style={{ color: "var(--gold)", margin: "0 6px" }}>→</span>
                {fim}
              </>
            )}
          </p>
        </Bloco>
      )}
    </div>
  );
}
