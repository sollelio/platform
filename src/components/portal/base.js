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
