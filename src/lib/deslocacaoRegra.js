// ============================================================
// deslocacaoRegra.js — a regra de negócio PURA do cálculo de
// deslocação (painel "Deslocação" na linha de orçamento). Nenhuma
// função aqui toca em estado, BD ou rede — só números — para poder
// ser testada isoladamente e reutilizada sem risco de efeitos
// colaterais.
//
//   excedente_km = max(0, distancia_km - KM_INCLUIDOS)
//   euroPorKm    = EURO_POR_KM_BASE * n_trocos   (2 troços → 1€/km; 4 → 2€/km)
//   custo        = isento ? 0 : excedente_km * euroPorKm
// ============================================================

const KM_INCLUIDOS = 5;
const EURO_POR_KM_BASE = 0.5;
export const TROCOS_PADRAO = 2;

// Arredonda a cêntimos — evita ruído de vírgula flutuante (ex:
// 14.999999999999998 em vez de 15), o mesmo cuidado de orcamentoConfig.js.
const arredondar = (v) => Math.round(v * 100) / 100;

const calcularExcedenteKm = (distanciaKm) =>
  Math.max(0, (Number(distanciaKm) || 0) - KM_INCLUIDOS);

const calcularEuroPorKm = (nTrocos = TROCOS_PADRAO) =>
  EURO_POR_KM_BASE * (Number(nTrocos) || TROCOS_PADRAO);

// Devolve tudo o que o painel precisa para se desenhar (régua, pastilhas
// da fórmula, resultado) num único objecto — sem isto, cada consumidor
// teria de recalcular as mesmas peças à mão.
export const calcularDeslocacao = ({
  distanciaKm,
  nTrocos = TROCOS_PADRAO,
  isento = false,
} = {}) => {
  const distancia = Number(distanciaKm);
  const temDistancia = Number.isFinite(distancia) && distancia >= 0;

  const kmForaDoRaio = temDistancia ? calcularExcedenteKm(distancia) : 0;
  const euroPorKm = calcularEuroPorKm(nTrocos);
  const custoCalculado = temDistancia
    ? arredondar(kmForaDoRaio * euroPorKm)
    : 0;
  const custoFinal = isento ? 0 : custoCalculado;
  const dentroDoRaio = temDistancia && distancia <= KM_INCLUIDOS;

  return {
    temDistancia,
    distanciaKm: temDistancia ? distancia : null,
    kmIncluidos: KM_INCLUIDOS,
    kmForaDoRaio: arredondar(kmForaDoRaio),
    euroPorKm,
    custoCalculado,
    custoFinal,
    dentroDoRaio,
    isento: !!isento,
  };
};
