// ============================================================
// rpc.js — ler os códigos de NEGÓCIO que as RPCs sinalizam.
//
// O ficheiro nasceu para outra coisa e chamava-se por ela: enquanto uma
// migração não tivesse corrido numa BD, a função não existia lá, o
// código detectava-o (PGRST202) e caía num caminho antigo de acesso
// directo às tabelas. Isso deixava o deploy do código e as migrações
// acontecer por qualquer ordem, sem partir nenhum dos ambientes.
//
// Esse contrato MORREU com a RLS por casa (091), e a 104 arrumou-o. Os
// caminhos antigos deixaram de dar «função em falta»: dão política
// negada — verificado contra a base, 42501 e não PGRST202 — ou, quando
// eram um SELECT, dão ZERO LINHAS sem erro nenhum, e a página pinta-se
// vazia a dizer que não há nada. Um fallback que a política nega falha
// em silêncio, e por isso morreu.
//
// Com o `ehFuncaoRpcEmFalta` fora, o que resta é a função abaixo — e
// essa é outra coisa desde sempre: não adivinha migrações por correr,
// lê o que a função respondeu DE PROPÓSITO.
// ============================================================

// As funções sinalizam erros de negócio com códigos no message
// (ex: "CONVITE_JA_USADO"). Devolve o código, ou null.
export const codigoErroRpc = (erro) => {
  const m = (erro?.message || "").match(/[A-Z][A-Z_]{3,}/);
  return m ? m[0] : null;
};
