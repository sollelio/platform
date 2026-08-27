// ============================================================
// planoPdfLayout.js — o plano transformado em BLOCOS, sem PDF.
//
// Separa-se do desenho de propósito: o que entra no papel, por que
// ordem, e como se chama o ficheiro são decisões de produto e testam-se
// sem abrir um PDF. O planoPdf.js só pinta o que daqui sai.
//
// Não importa nada, como o resto da lógica pura da Equipa.
//
// 🔴 NADA de identificadores internos: nem o id do evento, nem o da
// pessoa, nem tokens. O papel leva o que a pessoa precisa de ler, e um
// uuid impresso é um uuid que sai de casa.
// ============================================================

// Só o que uma folha da casa mostra. Escolhe-se campo a campo em vez de
// espalhar o objecto: a identidade do backoffice passou a levar o id da
// organização, e um spread punha-o no papel sem ninguém dar por isso.
export const marcaDaCasa = (casa) => ({
  nome: casa?.nome || null,
  linha: casa?.linha_actividade || null,
});

// «27/08/2026, 21:34» em Lisboa, seja qual for o relógio de quem gera.
// Existe para distinguir duas versões da mesma folha, e é a única data
// no documento que fala do documento e não do trabalho.
export const carimboDeGeracao = (agora = new Date()) =>
  new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(agora);

// ---------- O nome do ficheiro ----------

// Acentos fora, espaços para underscore, e só o que é seguro num nome
// de ficheiro em qualquer sistema. Um nome vazio nunca sai daqui: sem
// isso, um nome só de símbolos dava «Plano_de_Trabalho__2026-08-27».
const asciiSeguro = (texto) =>
  (texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "Equipa";

// A data do ficheiro é a do EVENTO — é por ela que se procura a folha
// meses depois. Sem data formal, usa-se o primeiro dia de trabalho; sem
// nenhum dos dois, o dia em que se gerou.
const dataDoFicheiro = (plano, agora) => {
  const doEvento = plano?.evento?.data;
  if (typeof doEvento === "string" && /^\d{4}-\d{2}-\d{2}/.test(doEvento))
    return doEvento.slice(0, 10);
  const primeiroDia = plano?.dias?.[0]?.data;
  if (typeof primeiroDia === "string" && /^\d{4}-\d{2}-\d{2}/.test(primeiroDia))
    return primeiroDia;
  const d = agora ?? new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const nomeDoFicheiroDoPlano = (plano, agora = new Date()) =>
  `Plano_de_Trabalho_${asciiSeguro(plano?.pessoa?.display_name)}_${dataDoFicheiro(plano, agora)}.pdf`;

// A data do evento por extenso, como a casa a escreve. Um valor que não
// seja uma data fica como está — não se inventa nem se apaga.
export const dataPorExtenso = (valor) => {
  if (!valor) return null;
  const texto = String(valor);
  if (!/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto;
  const d = new Date(`${texto.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return texto;
  return d.toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

// ---------- Os blocos ----------
//
// Cada bloco diz O QUE é, não onde fica. O tamanho, a margem e a quebra
// de página são do pintor, que é quem sabe o tamanho do papel.
//
// Os blocos de uma tarefa levam o mesmo `grupo`: a hora e o título, a
// nota e a linha dos colegas são UMA coisa e não podem separar-se numa
// quebra de página. Quem lê ao telemóvel, de pé, não vira a folha para
// descobrir com quem trabalha. O pintor mede o grupo inteiro antes de
// escrever a primeira linha dele.
export const blocosDoPlano = (
  plano,
  { casa, agora = new Date(), comLogotipo = false } = {},
) => {
  if (!plano) return [];
  const b = [];
  const marca = marcaDaCasa(casa);

  // Com o logótipo no cabeçalho, o nome da casa por baixo era a mesma
  // coisa dita duas vezes — e o logótipo já a diz melhor. A linha de
  // actividade fica: essa acrescenta, não repete.
  if (marca.nome && !comLogotipo) b.push({ tipo: "marca", texto: marca.nome });
  if (marca.linha) b.push({ tipo: "marca-linha", texto: marca.linha });
  b.push({ tipo: "titulo", texto: "PLANO DE TRABALHO" });

  if (plano.evento?.titulo)
    b.push({ tipo: "campo", rotulo: "Evento", texto: plano.evento.titulo });
  const dataDoEvento = dataPorExtenso(plano.evento?.data);
  if (dataDoEvento) b.push({ tipo: "campo", rotulo: "Data", texto: dataDoEvento });
  const onde = plano.evento?.local || plano.evento?.morada;
  if (onde) b.push({ tipo: "campo", rotulo: "Local", texto: onde });
  b.push({
    tipo: "campo",
    rotulo: "Para",
    texto: plano.pessoa?.display_name || "",
  });

  for (const dia of plano.dias ?? []) {
    b.push({ tipo: "dia", texto: (dia.dataPorExtenso || dia.data || "").toUpperCase() });
    for (const t of dia.tarefas ?? []) {
      const horas = t.fim ? `${t.inicio}–${t.fim}` : t.inicio;
      const grupo = `tarefa:${dia.data}:${t.id}`;
      b.push({ tipo: "tarefa", grupo, texto: `${horas}  ${t.titulo}` });
      if (t.notas) b.push({ tipo: "nota", grupo, texto: t.notas });
      if (t.colegas?.length)
        b.push({ tipo: "colegas", grupo, texto: `Com: ${t.colegas.join(", ")}` });
    }
  }

  const std = plano.instrucoes?.standard_instructions;
  const calor = plano.instrucoes?.hot_weather_instructions;
  // O mesmo para o cabeçalho de uma secção e o seu texto: um título
  // sozinho no fim da folha não é um título, é um susto.
  if (std) {
    b.push({ tipo: "seccao", grupo: "instrucoes", texto: "INDICAÇÕES DA EQUIPA" });
    b.push({ tipo: "paragrafo", grupo: "instrucoes", texto: std });
  }
  if (calor) {
    b.push({ tipo: "seccao", grupo: "calor", texto: "EM DIAS DE MUITO CALOR" });
    b.push({ tipo: "paragrafo", grupo: "calor", texto: calor });
  }

  b.push({ tipo: "rodape", texto: `Gerado em ${carimboDeGeracao(agora)}` });
  return b;
};
