// ============================================================
// base.js — datas e estilos da vitrina do acompanhamento.
//
// Ficheiro `.js` e não `.jsx` de propósito: são constantes e funções puras,
// e o linter da casa proíbe misturá-las com componentes no mesmo ficheiro
// (react-refresh/only-export-components). Os componentes vivem em `pecas.jsx`
// e a composição de conteúdo em `conteudo.js`.
// ============================================================

// ---------- Datas ----------
//
// Meses e dias escritos à mão, em vez de toLocaleDateString: a casa usa
// grafia pré-acordo e nessa grafia os meses levam maiúscula, que o locale do
// browser não dá. De caminho, tira-se qualquer dependência do fuso.
export const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio",
  "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const SEMANA = ["domingo", "segunda-feira", "terça-feira",
  "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

// Lê o dia de calendário da string ISO sem passar por um Date local: as
// datas vêm de colunas DATE convertidas para timestamptz, e um Date local
// desloca-as um dia para quem esteja a oeste de Greenwich. A linguagem da
// casa serve todo o espaço lusófono.
export const partesDaData = (iso) => {
  if (!iso) return null;
  const [a, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return null;
  return { a, m, d, semana: new Date(Date.UTC(a, m - 1, d)).getUTCDay() };
};

export const diaEMes = (iso) => {
  const p = partesDaData(iso);
  return p ? `${p.d} de ${MESES[p.m - 1]}` : null;
};

export const semanaEAno = (iso) => {
  const p = partesDaData(iso);
  return p ? `${SEMANA[p.semana]}, ${p.a}` : null;
};

export const diaMesAno = (iso) => {
  const p = partesDaData(iso);
  return p ? `${p.d} de ${MESES[p.m - 1]} de ${p.a}` : null;
};

// «terça-feira, 28 de Julho» — para a linha da última visita.
export const semanaEDia = (iso) => {
  const p = partesDaData(iso);
  return p ? `${SEMANA[p.semana]}, ${p.d} de ${MESES[p.m - 1]}` : null;
};

// ---------- Tipografia ----------

export const overline = (cor = "#A07830", tracking = "0.22em", tamanho = "9.5px") => ({
  font: `700 ${tamanho} Inter, sans-serif`,
  letterSpacing: tracking,
  textTransform: "uppercase",
  color: cor,
  margin: 0,
});

export const playfair = {
  fontFamily: "'Playfair Display', serif",
  fontWeight: 400,
  color: "var(--charcoal)",
  margin: 0,
};

// A hachura de ausência: enche a amostra quando a paleta traz o NOME da cor
// e não o código. Nunca se adivinha a cor a partir da palavra.
export const HACHURA = "repeating-linear-gradient(45deg, #F2ECDF 0 5px, #FAF7EF 5px 11px)";

export const ehCodigoDeCor = (v) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(v).trim());

export const naoVazio = (v) => typeof v === "string" && v.trim() !== "";

// ---------- Contacto da casa ----------
// O número do negócio — o mesmo por onde a casa já fala com as clientes.
// A mensagem pré-escrita dá contexto a quem chega de uma ligação terminada.
export const WHATSAPP_URL =
  "https://wa.me/351927177190?text=Ol%C3%A1%21%20Escrevo%20a%20partir%20da%20p%C3%A1gina%20de%20acompanhamento%20do%20meu%20evento.";
export const SITE_URL = "https://doluxoamesa.pt";

// ---------- Dinheiro à portuguesa ----------
// 1 291,50 € — espaço nos milhares, vírgula nos cêntimos, símbolo no fim,
// espaços inquebráveis para o valor nunca partir ao meio de uma linha.
export const formatarEuroPT = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const [int, cent] = v.toFixed(2).split(".");
  const comMilhares = int.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
  return `${comMilhares},${cent}\u00A0€`;
};

// «14:32» a partir de um timestamptz, no relógio de quem lê.
export const horaCurta = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// ---------- A sessão verificada ----------
// Depois de o código ser aceite, a sessão (60 minutos) sobrevive a um
// recarregar: fica no sessionStorage, presa ao token. Nunca guarda o
// código — só o id da verificação, que sem o token não abre nada.
const chaveSessao = (token) => `dlm_acomp_sessao_${token}`;

export const lerSessao = (token) => {
  try {
    const bruto = sessionStorage.getItem(chaveSessao(token));
    if (!bruto) return null;
    const s = JSON.parse(bruto);
    if (!s?.id || !s?.validaAte || new Date(s.validaAte) < new Date()) return null;
    return s;
  } catch {
    return null;
  }
};

export const guardarSessao = (token, id, validaAte) => {
  try {
    sessionStorage.setItem(chaveSessao(token), JSON.stringify({ id, validaAte }));
  } catch {
    /* privado/cheio — a sessão vive só em memória nesta visita */
  }
};

// ---------- O que mudou entre duas versões do orçamento ----------
//
// Só o orçamento: é o único documento onde a diferença se diz em linhas e
// valores. No projecto e no contrato mudou o texto, e um comparador de
// texto diria pior do que a Nádia diz na conversa.
//
// Compara por `uid` — o identificador que a linha traz do orçamento — e só
// cai na descrição quando não há uid. Isto importa: sem ele, mudar o nome
// de um serviço aparecia como um a sair e outro a entrar.
//
// O VÉU, e o que ele custa: sem sessão verificada o servidor não põe o
// valor a zero — TIRA a chave `valor` das linhas (058, `v_el - 'valor'`).
// Logo esta função não consegue ver alterações de preço nenhumas: os dois
// lados ficam iguais e `valorMudou` é sempre falso.
//
// Isso NÃO se resolve aqui, e ainda bem — resolvê-lo era fazer sair do
// servidor o que ele decidiu não deixar sair. Resolve-se em quem mostra:
// sob véu o cartão diz o que sabe (que serviços entraram e saíram) e nomeia
// o que não pode saber, em vez de dar a lista por completa.
export const diferencasDeOrcamento = (antes, depois) => {
  const lin = (d) => (Array.isArray(d?.instantaneo?.linhas) ? d.instantaneo.linhas : []);
  const chave = (l, i) => l.uid || `d:${(l.descricao || "").trim().toLowerCase()}|${i}`;

  const mapaAntes = new Map();
  lin(antes).forEach((l, i) => mapaAntes.set(chave(l, i), l));

  const vistas = new Set();
  const entraram = [];
  const mudaram = [];

  lin(depois).forEach((l, i) => {
    const k = chave(l, i);
    vistas.add(k);
    const a = mapaAntes.get(k);
    if (!a) {
      entraram.push({ nome: l.descricao || "Serviço", qtd: l.qtd, valor: l.valor });
      return;
    }
    const qtdMudou = (Number(a.qtd) || 0) !== (Number(l.qtd) || 0);
    const valorMudou = (Number(a.valor) || 0) !== (Number(l.valor) || 0);
    if (qtdMudou || valorMudou) {
      mudaram.push({
        nome: l.descricao || "Serviço",
        qtdAntes: a.qtd, qtdDepois: l.qtd,
        valorAntes: a.valor, valorDepois: l.valor,
        qtdMudou, valorMudou,
      });
    }
  });

  const sairam = [];
  mapaAntes.forEach((l, k) => {
    if (!vistas.has(k)) sairam.push({ nome: l.descricao || "Serviço" });
  });

  const soma = (d) =>
    lin(d).reduce((acc, l) => acc + (Number(l.qtd) || 0) * (Number(l.valor) || 0), 0);
  const totalAntes = soma(antes);
  const totalDepois = soma(depois);

  return {
    entraram, sairam, mudaram,
    totalAntes, totalDepois,
    // Com véu os valores vêm a zero dos dois lados: a diferença de total
    // não se mostra, porque não se sabe.
    totalMudou: totalAntes !== totalDepois,
    houve: entraram.length > 0 || sairam.length > 0 || mudaram.length > 0,
  };
};
