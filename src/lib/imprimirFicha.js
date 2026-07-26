import { coresDeTexto } from "./paletaCores";

// ============================================================
// imprimirFicha — gera as TRÊS listas operacionais de um evento
// (Carga, Montagem e Higienização) numa janela de impressão.
//
// Cada lista é uma tabela com checkboxes para a equipa riscar no
// terreno. A coluna CORES mostra a BOLINHA de cada cor ao lado do
// nome (o catálogo dá o hex; nomes desconhecidos ficam com a
// bolinha neutra) — com print-color-adjust para o browser não
// "poupar tinta" e imprimir círculos brancos.
// ============================================================

const escapar = (t) =>
  String(t ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const formatarDataPT = (data) => {
  if (!data) return "Sem data";
  return new Date(data).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

// "Camel, Verde Esmeralda" → bolinhas + nomes (HTML)
const coresHtml = (texto) => {
  const cores = coresDeTexto(texto);
  if (cores.length === 0) return "";
  return cores
    .map(
      ({ nome, hex }) =>
        `<span class="cor"><span class="bola" style="background:${hex}"></span>${escapar(nome)}</span>`,
    )
    .join("");
};

// Agrupa as linhas por categoria do material (ordem alfabética,
// materiais pela ordem do catálogo dentro de cada grupo)
const agrupar = (linhas) => {
  const grupos = {};
  linhas.forEach((l) => {
    const cat = l.material?.categoria || "Outros";
    if (!grupos[cat]) grupos[cat] = [];
    grupos[cat].push(l);
  });
  return Object.keys(grupos)
    .sort((a, b) => a.localeCompare(b, "pt"))
    .map((cat) => ({ categoria: cat, itens: grupos[cat] }));
};

// Uma tabela (secção de categoria) de uma lista
const tabelaCategoria = (grupo) => `
  <div class="categoria">
    <p class="categoria-titulo">${escapar(grupo.categoria)}</p>
    <table>
      <thead>
        <tr>
          <th class="col-check"></th>
          <th>Material</th>
          <th class="col-qtd">Qtd.</th>
          <th class="col-un">Un.</th>
          <th class="col-cores">Cores</th>
        </tr>
      </thead>
      <tbody>
        ${grupo.itens
          .map(
            (l) => `
          <tr>
            <td class="col-check"><span class="checkbox"></span></td>
            <td>${escapar(l.material?.nome || "Material")}</td>
            <td class="col-qtd">${escapar(l.quantidade ?? 0)}</td>
            <td class="col-un">${escapar(l.material?.unidade || "un")}</td>
            <td class="col-cores">${coresHtml(l.cores)}${
              l.observacoes
                ? `<div class="obs">${escapar(l.observacoes)}</div>`
                : ""
            }</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </div>
`;

// Uma lista completa (página): título + evento + categorias
const gerarLista = (titulo, subtitulo, linhas, submissao, tituloEvento) => {
  if (linhas.length === 0) return "";
  const grupos = agrupar(linhas);
  return `
  <section class="lista">
    <header class="cabecalho">
      <div>
        <p class="marca">Do Luxo à Mesa</p>
        <p class="marca-sub">by Luxury Events</p>
      </div>
      <div class="cabecalho-direita">
        <h1>${escapar(titulo)}</h1>
        <p class="lista-sub">${escapar(subtitulo)}</p>
      </div>
    </header>
    <div class="evento-linha">
      <span class="evento-nome">${escapar(tituloEvento)}</span>
      <span>${formatarDataPT(submissao?.data_evento)}</span>
      <span>${escapar(submissao?.local_evento || "")}</span>
    </div>
    ${grupos.map(tabelaCategoria).join("")}
  </section>
  `;
};

export const imprimirFicha = (linhas, submissao, tituloEvento = "") => {
  const nome =
    tituloEvento ||
    submissao?.nome_noivo ||
    submissao?.respostas?.nomeDoCliente ||
    "Evento";

  const listas = [
    gerarLista(
      "Lista de Carga",
      "O que sai do armazém",
      linhas.filter((l) => l.lista_carga),
      submissao,
      nome,
    ),
    gerarLista(
      "Lista de Montagem",
      "O que se monta no local",
      linhas.filter((l) => l.lista_montagem),
      submissao,
      nome,
    ),
    gerarLista(
      "Lista de Higienização",
      "O que volta e se higieniza",
      linhas.filter((l) => l.lista_higienizacao),
      submissao,
      nome,
    ),
  ]
    .filter(Boolean)
    .join('<div class="quebra"></div>');

  const html = `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<title>Ficha Operacional — ${escapar(nome)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=Inter:wght@300;400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', sans-serif;
    color: #1A1A1A;
    padding: 24px;
  }
  .lista { max-width: 720px; margin: 0 auto; }
  .quebra { page-break-after: always; }

  .cabecalho {
    display: flex; justify-content: space-between; align-items: flex-end;
    border-bottom: 2px solid #C9A84C; padding-bottom: 10px; margin-bottom: 14px;
  }
  .marca {
    font-family: 'Playfair Display', serif; font-size: 16px;
    text-transform: uppercase; letter-spacing: 0.12em; color: #C9A84C;
  }
  .marca-sub {
    font-size: 8px; text-transform: uppercase; letter-spacing: 0.2em; color: #A07830;
  }
  .cabecalho-direita { text-align: right; }
  h1 { font-family: 'Playfair Display', serif; font-size: 20px; }
  .lista-sub { font-size: 10px; color: #6B7280; font-style: italic; }

  .evento-linha {
    display: flex; gap: 18px; align-items: baseline;
    background: #FBF7EF; border: 1px solid #F0E6D0; border-radius: 8px;
    padding: 8px 12px; margin-bottom: 16px; font-size: 11px; color: #4B5563;
  }
  .evento-nome { font-weight: 600; color: #1A1A1A; }

  .categoria { margin-bottom: 18px; }
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
  td {
    font-size: 11px; padding: 6px; border-bottom: 1px solid #F5ECD7;
    vertical-align: top;
  }
  .col-check { width: 26px; }
  .col-qtd { width: 46px; text-align: right; }
  .col-un { width: 36px; color: #6B7280; }
  .col-cores { width: 190px; }
  .checkbox {
    display: inline-block; width: 12px; height: 12px;
    border: 1.5px solid #C9A84C; border-radius: 3px;
  }
  .obs { font-size: 9.5px; color: #6B7280; font-style: italic; margin-top: 2px; }

  /* As bolinhas de cor — com print-color-adjust para o browser
     imprimir o fundo (sem isto, no papel saíam círculos brancos) */
  .cor {
    display: inline-flex; align-items: center; gap: 4px;
    margin: 0 10px 2px 0; white-space: nowrap;
  }
  .bola {
    display: inline-block; width: 10px; height: 10px; border-radius: 50%;
    border: 1px solid rgba(0,0,0,0.2); flex-shrink: 0;
    print-color-adjust: exact; -webkit-print-color-adjust: exact;
  }

  @media print {
    body { padding: 0; }
  }
</style>
</head>
<body>
${listas || '<p style="text-align:center;color:#6B7280;padding:40px;font-size:13px;">Sem materiais em nenhuma lista — marca Carga/Montagem/Higienização nos materiais da ficha.</p>'}
<script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

  const janela = window.open("", "_blank");
  if (!janela) {
    alert("O browser bloqueou a janela de impressão — permite pop-ups.");
    return;
  }
  janela.document.write(html);
  janela.document.close();
};