import { FASE_LABEL } from "../lib/fases";

// ============================================================
// AvisoDiaDisputado — o banner âmbar da disputa na CRIAÇÃO
// (decisão de 30/07, absorvida no Bloco 4): quando a data escolhida
// já tem pedidos vivos, informa — e NUNCA trava a criação (o dia só
// muda de mãos no registo do sinal, nunca aqui). A pele é a do
// FormulariosOrfaos (#FEF3E2/#F0D9B5/#92400E, linha do ⚠ a 13px/700).
//
// Vive na raiz de components/ (como EnvBanner e LogoDourado) porque
// serve três painéis de pastas diferentes: a captação interna
// (captacao/), o painel «cliente novo» de Formulários e a reserva do
// Calendário (admin/) — e a captação entra no bundle público, por isso
// nunca pode ir buscar nada a admin/.
//
// `irmaos` é a lista de irmaosDoDia (lib/disputaDia): eventos vivos da
// data + reservas provisórias. Uma reserva sem evento no funil não tem
// fase — apresenta-se como o que é.
//
// 104 · `falhou` é o TERCEIRO estado: a consulta não chegou ao fim.
// Antes era indistinguível de «não há disputa» — a lib devolvia [] e o
// banner não aparecia, e quem marcava um dia já disputado não era
// avisada. Diz-se, e diz-se mais BAIXO: o âmbar é o mesmo (o vermelho
// está reservado ao dia tomado, que é o que exige atenção a sério), mas
// sem o ⚠ e sem o peso do título, porque isto não é um alerta — é uma
// ausência de informação.
//
// E não se oferece saída. Não é ela que resolve uma falha de rede, e um
// «tenta novamente» ao lado convidava a carregar num botão que
// provavelmente falha outra vez. Informa-se e sai-se da frente: nada
// aqui trava a criação, pela mesma regra do banner da disputa.
// ============================================================

// Os meses à mão, como base.js e disputaDia.js (cópia deliberada — a
// lib não exporta o formatador e ganhar-lho não é trabalho deste
// componente): grafia da casa com maiúscula, sem depender do ICU do
// browser, que sem pt-PT cai em inglês SEM erro nenhum.
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio",
  "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// «25 de Agosto» a partir de 'YYYY-MM-DD', partido à mão — um parse
// ISO por Date cai em UTC e num fuso atrás recuava um dia.
const diaPorExtenso = (iso) => {
  const [, m, d] = String(iso || "").slice(0, 10).split("-").map(Number);
  if (!m || !d || !MESES[m - 1]) return "";
  return `${d} de ${MESES[m - 1]}`;
};

export default function AvisoDiaDisputado({ dataISO, irmaos, falhou, estilo }) {
  if (falhou) {
    return (
      <div
        style={{
          backgroundColor: "#FEF3E2",
          border: "1px solid #F0D9B5",
          borderRadius: "12px",
          padding: "12px 14px",
          ...estilo,
        }}
      >
        <p
          style={{
            fontSize: "12.5px",
            color: "#92400E",
            margin: 0,
            lineHeight: 1.55,
          }}
        >
          Não foi possível verificar se este dia já tem outro evento.
        </p>
      </div>
    );
  }
  const nomes = irmaos
    .map(
      (i) =>
        `${i.nome} (${i.ehReserva ? "Reserva provisória" : FASE_LABEL[i.fase] || i.fase || "—"})`,
    )
    .join(", ");
  return (
    <div
      style={{
        backgroundColor: "#FEF3E2",
        border: "1px solid #F0D9B5",
        borderRadius: "12px",
        padding: "12px 14px",
        ...estilo,
      }}
    >
      <p
        style={{
          fontSize: "13px",
          fontWeight: "700",
          color: "#92400E",
          margin: "0 0 4px",
          lineHeight: 1.5,
        }}
      >
        ⚠ {diaPorExtenso(dataISO)} tem{" "}
        {irmaos.length === 1
          ? "1 pedido vivo"
          : `${irmaos.length} pedidos vivos`}
      </p>
      <p
        style={{
          fontSize: "12.5px",
          color: "#92400E",
          margin: 0,
          lineHeight: 1.55,
        }}
      >
        {nomes} — só o primeiro sinal registado reserva o dia.
      </p>
    </div>
  );
}
