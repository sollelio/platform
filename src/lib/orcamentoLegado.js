// ============================================================
// orcamentoLegado.js — a LOGÍSTICA ENTRE MORADAS que já não se cobra.
//
// Os 25€ fixos por evento, diluídos pelas linhas do orçamento (decisão
// de 03/08/2026), foram retirados a 24/09/2026: penalizavam os eventos
// pequenos. Um orçamento novo NUNCA os calcula nem cria `__logistica`.
//
// O que fica aqui é só a LEITURA do passado, no gerador:
//   · um rascunho antigo que já traz `__logistica` gravado mostra-a tal
//     como está (nunca se recalcula das linhas) enquanto só é ABERTO —
//     ver um orçamento não pode mudar-lhe o preço;
//   · à primeira edição COMERCIAL das linhas (juntar/remover linha,
//     serviço, quantidade, valor), passa de vez ao modelo novo e a
//     chave antiga descarta-se.
// As versões PUBLICADAS são outra coisa: instantâneos congelados, lidos
// pelo portal e pelo SQL (083/085) com a sua própria compatibilidade —
// nada aqui lhes toca.
//
// Puro (sem estado, BD nem rede). `parsear` é o parser de valores do
// gerador (orcamentoConfig.parsearValor), injectado porque lib/ nunca
// importa de components/.
// ============================================================

// A forma que os leitores históricos (portal, SQL) exigem para contar a
// logística: parcelas num array. Fora disso, é como se não existisse.
export const logisticaLegadaValida = (guardada) =>
  guardada && Array.isArray(guardada.parcelas) ? guardada : null;

// O que conta como mudança COMERCIAL das linhas: a sua identidade e
// ordem (as parcelas antigas estão alinhadas por índice), o serviço, a
// quantidade e o valor — normalizados, para «800» e «800,00» serem o
// mesmo preço. Texto (descrição, «Inclui:», lugares) e a morada da
// deslocação sem mudança de valor NÃO contam: na dúvida, preserva-se o
// rascunho antigo em vez de lhe tirar 25€ de surpresa.
export const assinaturaComercial = (linhas, parsear) =>
  JSON.stringify(
    (Array.isArray(linhas) ? linhas : []).map((l, i) => [
      l.uid ?? i,
      l.servicoId ?? null,
      parsear(l.qtd),
      parsear(l.valor),
    ]),
  );

// A logística antiga ainda em vigor neste render? Só se veio gravada e
// as linhas continuam comercialmente iguais às da abertura.
export const logisticaEmVigor = ({ guardada, assinaturaInicial, assinaturaAtual }) =>
  assinaturaInicial === assinaturaAtual ? logisticaLegadaValida(guardada) : null;

const cent = (v) => Math.round(v * 100) / 100;

// O total do orçamento: a soma das linhas — mais o total antigo da
// logística, SÓ num rascunho legado ainda intocado.
export const totalDoOrcamento = (linhas, logistica, parsear) => {
  const soma = (Array.isArray(linhas) ? linhas : []).reduce(
    (acc, l) => acc + parsear(l.valor) * parsear(l.qtd),
    0,
  );
  return cent(soma + (logistica ? Number(logistica.total) || 0 : 0));
};

// O que a folha mostra por linha: o valor cru — ou, num rascunho legado
// intocado, o unitário com a parcela antiga dentro, exactamente como a
// folha o mostrava (incluindo o acerto dos cêntimos com qtd > 1, que
// cai na linha de qtd 1 de maior valor que absorvia logística).
export const valoresDaFolha = (linhas, logistica, parsear) => {
  const ls = Array.isArray(linhas) ? linhas : [];
  const vals = ls.map((l) => (l.valor === "" ? null : cent(parsear(l.valor))));
  if (!logistica) return vals;
  const absorvia = (l) =>
    l.servicoId !== "pacote_buffet" &&
    l.servicoId !== "deslocacao" &&
    cent(parsear(l.valor) * parsear(l.qtd)) > 0;
  let residual = 0;
  ls.forEach((l, i) => {
    const parcela = Number(logistica.parcelas[i]) || 0;
    if (parcela === 0) return;
    const v = parsear(l.valor);
    const q = parsear(l.qtd) || 1;
    if (q <= 1) {
      vals[i] = cent(v + parcela);
    } else {
      const unit = cent((v * q + parcela) / q);
      vals[i] = unit;
      residual += v * q + parcela - unit * q;
    }
  });
  const residualCents = Math.round(residual * 100);
  if (residualCents !== 0) {
    let alvo = -1;
    ls.forEach((l, i) => {
      const q = parsear(l.qtd) || 1;
      if (absorvia(l) && q === 1 && (alvo === -1 || vals[i] > vals[alvo])) alvo = i;
    });
    if (alvo !== -1) vals[alvo] = Math.round(vals[alvo] * 100 + residualCents) / 100;
  }
  return vals;
};
