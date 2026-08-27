// ============================================================
// identidadeBackoffice.js — a decisão pura de vestir a casa do
// backoffice com o id da organização.
//
// A identidade da casa NÃO leva id: `identidade_da_casa` devolve treze
// campos de marca e mais nada, e está embutida nas projecções públicas
// (portal, comunicado, campanha, captação). Pôr lá um id era entregar
// um identificador interno ao anon — a regra que essas migrações
// existem para respeitar.
//
// Mas o backoffice PRECISA do id: `has_permission(organization_id, …)`
// pede um uuid, e sem ele o módulo da Equipa nunca chega a perguntar.
// Por isso o id junta-se aqui, à saída da porta AUTENTICADA e só dela.
//
// Vive à parte por ser puro e testável sozinho — e para o teste poder
// provar, sem rede, que só a porta do backoffice o faz.
//
// FALHA FECHADA: sem id, devolve-se a identidade exactamente como veio.
// O backoffice legado continua a funcionar (nome, logo, morada, tudo);
// o que acontece é a Equipa ficar escondida, que é o lado certo para
// falhar — mostrar um menu que daria um ecrã vazio seria pior.
// ============================================================

// tenants.id É organizations.id: o bootstrap da C1 preserva o
// identificador ao migrar (insert into organizations … select t.id,
// -- preserved). Por isso o uuid que a porta legada resolve serve tal
// e qual à autorização do Ponto 1, sem tabela de tradução no meio.
export const comOrganizacao = (resposta, organizationId) => {
  // Só a casa CONHECIDA se veste. Uma casa suspensa não tem equipa a
  // trabalhar, e `tenant_do_pedido` já filtra por estado activo — as
  // duas regras dizem o mesmo, e é de propósito.
  if (resposta?.estado !== "conhecida" || !resposta.casa) return resposta;
  if (!organizationId) return resposta;
  return { ...resposta, casa: { ...resposta.casa, id: organizationId } };
};
