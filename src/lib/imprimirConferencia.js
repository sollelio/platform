// ============================================================
// imprimirConferencia — a folha "O que sai" numa janela dedicada.
//
// Antes, "Imprimir conferência" fazia window.print() ao admin inteiro:
// saía a página toda, com a tabela cortada onde o overflow horizontal
// a escondia. Agora imprime-se SÓ a conferência, no mesmo molde do
// imprimirFicha.js: janela própria, checkboxes para riscar no armazém,
// ruturas destacadas, carga provisória à parte.
//
// Devolve { ok } — falso quando o browser bloqueia o pop-up, para o
// ecrã avisar na barra da casa (nunca alert()).
// ============================================================

const escapar = (t) =>
  String(t ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

// As datas do período/eventos são dias puros ("2026-07-31") — formatam-se
// em UTC para o dia não fugir num fuso a oeste de Greenwich.
const diaCurtoPT = (isoData) =>
  new Date(`${String(isoData).slice(0, 10)}T00:00:00Z`).toLocaleDateString(
    "pt-PT",
    { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" },
  );

const saldoTexto = (linha) => {
  if (linha.estado === "sem-stock") return "sem stock definido";
  if (linha.estado === "no-limite") return "no limite";
  return linha.saldo > 0 ? `+${linha.saldo}` : `−${Math.abs(linha.saldo)}`;
};

const marcaInativo = (linha) =>
  linha.inativo
    ? '<span class="inativo">⚠ desativado — confirma antes de carregar</span>'
    : "";

const notaVizinhos = (linha) =>
  linha.foraEmVizinhos > 0
    ? `<div class="obs">${linha.foraEmVizinhos} fora em evento vizinho${
        linha.stock == null ? "" : ` (tens ${linha.stock})`
      }</div>`
    : "";

const linhaHtml = (l, eventos) => `
  <tr class="${l.estado === "rutura" ? "rutura" : ""}">
    <td class="col-check"><span class="checkbox"></span></td>
    <td>${escapar(l.material?.nome || "Material")}${marcaInativo(l)}</td>
    ${eventos
      .map(
        (e) =>
          `<td class="col-num">${l.porEvento.get(e.submissionId) || "—"}</td>`,
      )
      .join("")}
    <td class="col-num forte">${l.necessario}</td>
    <td class="col-num">${l.disponivel == null ? "—" : l.disponivel}${notaVizinhos(l)}</td>
    <td class="col-num ${l.saldo != null && l.saldo < 0 ? "negativo" : ""}">${saldoTexto(l)}</td>
  </tr>`;

const categoriaHtml = (grupo, eventos) => `
  <div class="categoria">
    <p class="categoria-titulo">${escapar(grupo.categoria)} · ${grupo.total} un</p>
    <table>
      <thead>
        <tr>
          <th class="col-check"></th>
          <th>Material</th>
          ${eventos
            .map((e) => `<th class="col-num">${escapar(diaCurtoPT(e.dataEvento))}</th>`)
            .join("")}
          <th class="col-num">Precisas</th>
          <th class="col-num">Tens</th>
          <th class="col-num">Saldo</th>
        </tr>
      </thead>
      <tbody>${grupo.linhas.map((l) => linhaHtml(l, eventos)).join("")}</tbody>
    </table>
  </div>`;

const provisoriosHtml = (provisorios, nomeEvento) => {
  if (!provisorios || provisorios.eventos.length === 0) return "";
  return `
  <div class="provisorios">
    <p class="categoria-titulo">Carga provisória — orçamentos sem sinal</p>
    <p class="provisorios-nota">Não conta nos totais nem nos alarmes: um
    orçamento não se carrega na carrinha. Está aqui para não haver
    surpresas se algum fechar à última hora.</p>
    <p class="provisorios-eventos">${provisorios.eventos
      .map(
        (e) =>
          `${escapar(diaCurtoPT(e.dataEvento))} · ${escapar(nomeEvento(e.submissao))} (${e.total} un)`,
      )
      .join(" &nbsp;·&nbsp; ")}</p>
    <table>
      <tbody>
        ${provisorios.linhas
          .map(
            (l) => `
        <tr>
          <td>${escapar(l.material?.nome || "Material")}${marcaInativo(l)}</td>
          <td class="col-num">${l.quantidade}</td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </div>`;
};

export const imprimirConferencia = ({
  conf,
  intervalo,
  tituloPeriodo,
  nomeEvento,
}) => {
  const cabecalhoEventos = conf.eventos
    .map(
      (e) =>
        `<span><strong>${escapar(diaCurtoPT(e.dataEvento))}</strong> ${escapar(
          nomeEvento(e.submissao),
        )} · ${e.total} un</span>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<title>O que sai — ${escapar(intervalo)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=Inter:wght@300;400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; color: #1A1A1A; padding: 24px; }
  .folha { max-width: 760px; margin: 0 auto; }

  .cabecalho {
    display: flex; justify-content: space-between; align-items: flex-end;
    border-bottom: 2px solid #C9A84C; padding-bottom: 10px; margin-bottom: 14px;
  }
  .marca {
    font-family: 'Playfair Display', serif; font-size: 16px;
    text-transform: uppercase; letter-spacing: 0.12em; color: #C9A84C;
  }
  .marca-sub { font-size: 8px; text-transform: uppercase; letter-spacing: 0.2em; color: #A07830; }
  .cabecalho-direita { text-align: right; }
  h1 { font-family: 'Playfair Display', serif; font-size: 20px; }
  .lista-sub { font-size: 10px; color: #6B7280; font-style: italic; }

  .resumo {
    display: flex; gap: 18px; flex-wrap: wrap; align-items: baseline;
    background: #FBF7EF; border: 1px solid #F0E6D0; border-radius: 8px;
    padding: 8px 12px; margin-bottom: 6px; font-size: 11px; color: #4B5563;
  }
  .eventos-linha {
    display: flex; gap: 16px; flex-wrap: wrap; font-size: 10.5px;
    color: #4B5563; margin: 0 0 16px 2px;
  }

  .categoria { margin-bottom: 16px; }
  .categoria-titulo {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.1em; color: #C9A84C;
    border-bottom: 1px solid #C9A84C; padding-bottom: 4px; margin-bottom: 6px;
  }
  table { width: 100%; border-collapse: collapse; }
  th {
    font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.08em;
    color: #6B7280; text-align: left; padding: 4px 6px;
  }
  th.col-num { text-align: right; }
  td { font-size: 11px; padding: 6px; border-bottom: 1px solid #F5ECD7; vertical-align: top; }
  .col-check { width: 26px; }
  .col-num { width: 62px; text-align: right; font-variant-numeric: tabular-nums; }
  .forte { font-weight: 600; }
  .negativo { color: #DC2626; font-weight: 700; }
  tr.rutura td {
    background: #FEF2F2;
    print-color-adjust: exact; -webkit-print-color-adjust: exact;
  }
  .checkbox {
    display: inline-block; width: 12px; height: 12px;
    border: 1.5px solid #C9A84C; border-radius: 3px;
  }
  .obs { font-size: 9px; color: #6B7280; font-style: italic; margin-top: 2px; }
  .inativo {
    display: block; font-size: 9px; color: #B45309; font-weight: 600;
    margin-top: 2px;
  }
  .rodape { font-size: 9.5px; color: #6B7280; font-style: italic; margin-top: 10px; }

  .provisorios {
    margin-top: 22px; border-top: 1.5px dashed #C9A84C; padding-top: 12px;
  }
  .provisorios-nota { font-size: 9.5px; color: #6B7280; font-style: italic; margin-bottom: 6px; }
  .provisorios-eventos { font-size: 10.5px; color: #4B5563; margin-bottom: 8px; }

  @media print { body { padding: 0; } }
</style>
</head>
<body>
<div class="folha">
  <header class="cabecalho">
    <div>
      <p class="marca">Do Luxo à Mesa</p>
      <p class="marca-sub">by Luxury Events</p>
    </div>
    <div class="cabecalho-direita">
      <h1>O que sai</h1>
      <p class="lista-sub">${escapar(tituloPeriodo)} · ${escapar(intervalo)}</p>
    </div>
  </header>
  <div class="resumo">
    <span><strong>${conf.totais.eventos}</strong> ${conf.totais.eventos === 1 ? "evento" : "eventos"}</span>
    <span><strong>${conf.totais.materiais}</strong> ${conf.totais.materiais === 1 ? "material" : "materiais"}</span>
    <span><strong>${conf.totais.unidades}</strong> un a sair de casa</span>
    ${conf.totais.ruturas > 0 ? `<span class="negativo">${conf.totais.ruturas} em rutura</span>` : ""}
  </div>
  ${cabecalhoEventos ? `<div class="eventos-linha">${cabecalhoEventos}</div>` : ""}
  ${conf.porCategoria.map((g) => categoriaHtml(g, conf.eventos)).join("")}
  ${
    conf.totais.foraDaCarga > 0
      ? `<p class="rodape">${conf.totais.foraDaCarga} ${
          conf.totais.foraDaCarga === 1
            ? "linha das fichas destes eventos não entra"
            : "linhas das fichas destes eventos não entram"
        } na Lista de Carga e ${
          conf.totais.foraDaCarga === 1 ? "fica" : "ficam"
        } fora desta soma.</p>`
      : ""
  }
  ${provisoriosHtml(conf.provisorios, nomeEvento)}
</div>
<script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

  const janela = window.open("", "_blank");
  if (!janela) return { ok: false };
  janela.document.write(html);
  janela.document.close();
  return { ok: true };
};
