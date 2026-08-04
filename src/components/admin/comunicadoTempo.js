// ============================================================
// comunicadoTempo — as datas da fase 2 dos comunicados, ditas como
// a casa fala: «hoje, 18:04», «ontem às 17:40», «a 3 de agosto».
//
// Vive ao lado das vistas (e não em lib/) porque é gramática de
// ecrã — a que o desenho da fase 2 fixou — e porque lib/comunicados.js
// tem a sua própria âncora («12 de setembro») a servir os INSTANTÂNEOS
// guardados na BD, não o que se mostra ao vivo. Meses em minúscula:
// a grafia destas linhas (a mesma decisão da âncora, registada lá).
// ============================================================

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const mesmoDia = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const pecas = (iso) => {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  // O ano só se diz quando não é o corrente — «3 de agosto» chega
  // enquanto o assunto é deste ano.
  const data =
    d.getFullYear() === hoje.getFullYear()
      ? `${d.getDate()} de ${MESES[d.getMonth()]}`
      : `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  return {
    hora: d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
    eHoje: mesmoDia(d, hoje),
    eOntem: mesmoDia(d, ontem),
    data,
  };
};

// «3 de agosto» — o dia por extenso, sem relógio (a meta da expedição).
export const dataDita = (iso) => {
  if (!iso) return "";
  return pecas(iso).data;
};

// «hoje» / «ontem» / «a 3 de agosto» — para o meio de uma frase.
export const diaDito = (iso) => {
  if (!iso) return "";
  const p = pecas(iso);
  if (p.eHoje) return "hoje";
  if (p.eOntem) return "ontem";
  return `a ${p.data}`;
};

// «hoje, 18:04» / «ontem, 17:40» / «3 de agosto, 17:40» — a coluna
// compacta dos carimbos de envio.
export const quandoDita = (iso) => {
  if (!iso) return "";
  const p = pecas(iso);
  if (p.eHoje) return `hoje, ${p.hora}`;
  if (p.eOntem) return `ontem, ${p.hora}`;
  return `${p.data}, ${p.hora}`;
};

// «hoje às 18:12» / «ontem às 17:40» / «a 3 de agosto às 17:40» —
// quando a frase pede o «às».
export const quandoAs = (iso) => {
  if (!iso) return "";
  const p = pecas(iso);
  if (p.eHoje) return `hoje às ${p.hora}`;
  if (p.eOntem) return `ontem às ${p.hora}`;
  return `a ${p.data} às ${p.hora}`;
};
