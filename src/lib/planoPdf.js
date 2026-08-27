import { blocosDoPlano, nomeDoFicheiroDoPlano } from "./planoPdfLayout.js";

// ============================================================
// planoPdf.js — o papel.
//
// Pinta os blocos que o planoPdfLayout produz. É a ÚNICA peça que sabe
// o que é uma página, uma margem ou uma quebra; o que entra no papel
// decidiu-se antes, e testa-se sem abrir um PDF.
//
// PDF estruturado, não fotografia: o texto vai como texto, por isso
// procura-se, copia-se e lê-se ao telemóvel sem esticar. As fontes
// normais do PDF escrevem em WinAnsi, que cobre todos os acentos do
// português — verificado a extrair o texto de volta.
//
// A quebra de página conta antes de escrever, e conta por UNIDADE, não
// por linha. Uma unidade é o que não se pode partir:
//   · uma tarefa inteira — hora, título, nota e a linha dos colegas;
//   · um cabeçalho de dia com a primeira tarefa por baixo;
//   · um título de secção com o seu texto.
// Mede-se a unidade toda e, se não couber no que resta da folha mas
// couber numa folha limpa, vai inteira para a página seguinte. Só se
// parte por dentro quando a própria unidade é mais alta do que uma
// página — aí não há folha nenhuma que a segure.
//
// A biblioteca entra por importação DINÂMICA: são ~400 KB que só quem
// carrega em «Descarregar PDF» precisa de trazer. Estáticos, pagava-os
// toda a gente — incluindo o portal da cliente, que nunca gera folha
// nenhuma.
// ============================================================

const A4 = { largura: 595.28, altura: 841.89 };
const MARGEM = { x: 56, topo: 56, fundo: 52 };
const LARGURA = A4.largura - MARGEM.x * 2;

// Cada bloco: tamanho, peso, cor, espaço antes e depois, e recuo.
// O logótipo: a caixa é QUADRADA porque a marca da casa o é. Os 34 pt
// de altura de antes serviam uma marca deitada e deixavam um selo
// pequeno de mais num quadrado; 70×70 identifica a folha sem tomar
// conta dela, e a folga por baixo respira antes do texto começar.
// Encolhe pela proporção (ver medidaDoLogo), por isso uma marca deitada
// continua a caber — bate primeiro na largura.
const LOGO = { alturaMax: 70, larguraMax: 70, depois: 16 };

const ESTILO = {
  marca:        { tam: 15, peso: "bold",   cor: [176, 141, 87], antes: 0,  depois: 2,  recuo: 0 },
  "marca-linha":{ tam: 8.5, peso: "normal", cor: [140, 140, 140], antes: 0, depois: 16, recuo: 0 },
  titulo:       { tam: 17, peso: "bold",   cor: [26, 26, 26],   antes: 4,  depois: 14, recuo: 0 },
  campo:        { tam: 10.5, peso: "normal", cor: [60, 60, 60],  antes: 0,  depois: 4,  recuo: 0 },
  dia:          { tam: 11, peso: "bold",   cor: [26, 26, 26],   antes: 18, depois: 8,  recuo: 0 },
  tarefa:       { tam: 11.5, peso: "bold", cor: [26, 26, 26],   antes: 6,  depois: 3,  recuo: 12 },
  nota:         { tam: 10, peso: "normal", cor: [90, 90, 90],   antes: 0,  depois: 3,  recuo: 20 },
  colegas:      { tam: 10, peso: "normal", cor: [120, 120, 120], antes: 0, depois: 3, recuo: 20 },
  seccao:       { tam: 10, peso: "bold",   cor: [176, 141, 87], antes: 20, depois: 7, recuo: 0 },
  paragrafo:    { tam: 10.5, peso: "normal", cor: [60, 60, 60], antes: 0,  depois: 4,  recuo: 0 },
  rodape:       { tam: 8.5, peso: "normal", cor: [150, 150, 150], antes: 24, depois: 0, recuo: 0 },
};

const entrelinha = (tam) => tam * 1.38;

// ---------- O logótipo ----------

// Encolhe para caber na caixa sem deformar. Puro, para o tamanho da
// marca no papel se poder testar sem abrir um PDF.
export const medidaDoLogo = (largura, altura, caixa = LOGO) => {
  if (!largura || !altura || largura <= 0 || altura <= 0) return null;
  const escala = Math.min(
    caixa.larguraMax / largura,
    caixa.alturaMax / altura,
    1,
  );
  return { largura: largura * escala, altura: altura * escala };
};

// Traz a imagem para dentro do documento. Só corre no browser, e falha
// em silêncio: um logótipo que não carrega dá um cabeçalho de texto,
// não um plano por entregar. O `crossOrigin` é o que permite ler os
// pixels de um ficheiro servido de outro domínio.
export const carregarLogo = (url) =>
  new Promise((resolve) => {
    if (!url || typeof Image === "undefined") return resolve(null);
    const img = new Image();
    const desistir = setTimeout(() => resolve(null), 5000);
    img.crossOrigin = "anonymous";
    img.onload = () => {
      clearTimeout(desistir);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d").drawImage(img, 0, 0);
        resolve({
          dataUrl: canvas.toDataURL("image/png"),
          largura: img.naturalWidth,
          altura: img.naturalHeight,
        });
      } catch (e) {
        console.error("logótipo do plano:", e);
        resolve(null);
      }
    };
    img.onerror = () => {
      clearTimeout(desistir);
      resolve(null);
    };
    img.src = url;
  });

// O cabeçalho. Diz se DESENHOU, porque é isso que decide se o nome da
// casa ainda faz falta por baixo: com o logótipo lá, era redundante;
// sem ele, é a única coisa que identifica a folha.
const pintarCabecalho = (doc, opcoes, y) => {
  const logo = opcoes.logo;
  if (!logo?.dataUrl) return { y, desenhou: false };
  const medida = medidaDoLogo(logo.largura, logo.altura);
  if (!medida) return { y, desenhou: false };
  try {
    doc.addImage(logo.dataUrl, "PNG", MARGEM.x, y, medida.largura, medida.altura);
    return { y: y + medida.altura + LOGO.depois, desenhou: true };
  } catch (e) {
    // Uma imagem que o jsPDF recusa não pode levar o plano com ela: cai
    // no cabeçalho de texto, que continua a identificar o documento.
    console.error("logótipo do plano:", e);
    return { y, desenhou: false };
  }
};

// Constrói o documento. Exportada à parte do descarregar para o teste
// poder inspeccionar o resultado sem tocar no browser.
export const documentoDoPlano = async (plano, opcoes = {}) => {
  const { jsPDF } = await import("jspdf");
  // O logótipo vem da identidade que a vista dos planos já tem. Aceita-se
  // pré-carregado para o teste não precisar de browser.
  const logo =
    opcoes.logo === undefined
      ? await carregarLogo(opcoes.casa?.logo_url)
      : opcoes.logo;
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  doc.setProperties({
    title: "Plano de Trabalho",
    subject: plano?.evento?.titulo || "Plano de Trabalho",
    creator: opcoes.casa?.nome || "Sollelio",
  });

  // Pinta-se o cabeçalho primeiro para saber se o logótipo entrou; só
  // depois se montam os blocos, que dependem dessa resposta.
  const cabecalho = pintarCabecalho(doc, { ...opcoes, logo }, MARGEM.topo);
  const blocos = blocosDoPlano(plano, {
    ...opcoes,
    comLogotipo: cabecalho.desenhou,
  });
  const limite = A4.altura - MARGEM.fundo;
  const util = limite - MARGEM.topo;

  // Cada bloco já medido: quantas linhas dá, e que altura ocupa.
  const medidos = blocos.map((bloco) => {
    const e = ESTILO[bloco.tipo] ?? ESTILO.paragrafo;
    doc.setFont("helvetica", e.peso);
    doc.setFontSize(e.tam);
    const texto =
      bloco.tipo === "campo" ? `${bloco.rotulo}: ${bloco.texto}` : bloco.texto;
    const linhas = doc.splitTextToSize(String(texto ?? ""), LARGURA - e.recuo);
    const corpo = linhas.length * entrelinha(e.tam);
    return {
      bloco,
      e,
      linhas,
      corpo,
      total: e.antes + corpo + e.depois + (bloco.tipo === "dia" ? 4 : 0),
    };
  });

  // As unidades indivisíveis: blocos do mesmo `grupo` andam juntos, e um
  // cabeçalho de dia leva consigo a primeira tarefa que vier a seguir.
  const unidades = [];
  for (let i = 0; i < medidos.length; i += 1) {
    const m = medidos[i];
    if (m.bloco.tipo === "dia") {
      const unidade = [m];
      const grupoSeguinte = medidos[i + 1]?.bloco.grupo;
      while (
        grupoSeguinte &&
        medidos[i + 1] &&
        medidos[i + 1].bloco.grupo === grupoSeguinte
      ) {
        unidade.push(medidos[i + 1]);
        i += 1;
      }
      unidades.push(unidade);
      continue;
    }
    if (m.bloco.grupo) {
      const unidade = [m];
      while (medidos[i + 1] && medidos[i + 1].bloco.grupo === m.bloco.grupo) {
        unidade.push(medidos[i + 1]);
        i += 1;
      }
      unidades.push(unidade);
      continue;
    }
    unidades.push([m]);
  }

  let y = cabecalho.y;
  const escrever = (m, primeiroDaPagina) => {
    y += primeiroDaPagina ? 0 : m.e.antes;
    doc.setFont("helvetica", m.e.peso);
    doc.setFontSize(m.e.tam);
    doc.setTextColor(...m.e.cor);
    doc.text(m.linhas, MARGEM.x + m.e.recuo, y, { baseline: "top" });
    y += m.corpo + m.e.depois;
    if (m.bloco.tipo === "dia") {
      doc.setDrawColor(230, 224, 214);
      doc.setLineWidth(0.7);
      doc.line(MARGEM.x, y - 4, A4.largura - MARGEM.x, y - 4);
      y += 4;
    }
  };

  for (const unidade of unidades) {
    const altura = unidade.reduce((n, m) => n + m.total, 0);
    // Cabe numa folha limpa mas não no que resta desta? Vai inteira.
    // Não cabe em folha nenhuma? Escreve-se onde está e parte-se — é o
    // único caso em que partir é melhor do que uma página em branco.
    if (y + altura > limite && altura <= util) {
      doc.addPage();
      y = MARGEM.topo;
      unidade.forEach((m, i) => escrever(m, i === 0));
      continue;
    }
    for (const m of unidade) {
      if (y + m.e.antes + m.corpo > limite && m.corpo <= util) {
        doc.addPage();
        y = MARGEM.topo;
        escrever(m, true);
      } else {
        escrever(m, false);
      }
    }
  }

  // Numeração só quando há mais do que uma folha — numa só seria ruído.
  const total = doc.getNumberOfPages();
  if (total > 1) {
    for (let p = 1; p <= total; p += 1) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(150, 150, 150);
      doc.text(`${p}/${total}`, A4.largura - MARGEM.x, A4.altura - 30, {
        align: "right",
      });
    }
  }
  return doc;
};

// O gesto: gera e descarrega. O nome do ficheiro é o que a pessoa vai
// procurar meses depois, por isso leva o nome dela e a data do evento.
export const descarregarPlanoPdf = async (plano, opcoes = {}) => {
  const doc = await documentoDoPlano(plano, opcoes);
  const nome = nomeDoFicheiroDoPlano(plano, opcoes.agora);
  doc.save(nome);
  return nome;
};
