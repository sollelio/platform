// ============================================================
// funcionalidades.js — os interruptores de funcionalidades inteiras.
//
// Não é um sítio para preferências nem para configuração: é para as
// funcionalidades que estão LIGADAS ou DESLIGADAS por decisão, e que
// têm mais do que uma porta. O valor de as ter aqui, e não espalhadas,
// é que as portas nunca divergem — fechar a sala e deixar a rua aberta
// é o erro que isto existe para impedir.
// ============================================================

// ------------------------------------------------------------
// CONTRIBUIÇÃO COLETIVA — desligada por decisão do Hélio (29/07/2026).
//
// A funcionalidade vai ser repensada antes de ser estendida, e enquanto
// isso não acontecer não pode estar meia-aberta. São DUAS portas, e a
// segunda é a que obriga a este ficheiro:
//
//   1. A SALA (backoffice): a secção no separador Pagamentos de um
//      evento — a taça, a meta, o link, as promessas por confirmar.
//      Escondida a 29/07/2026.
//
//   2. A RUA (página pública /contribuir/:token): a página onde um
//      convidado vê a campanha e deixa a promessa.
//
// Esconder só a sala deixava a rua aberta: uma promessa deixada por um
// convidado ENTRAVA na base de dados — e não havia ecrã nenhum onde a
// ver, confirmar ou anular. Dinheiro anunciado a que a casa nunca
// responderia, e uma pessoa a achar que tinha sido registada.
//
// Hoje isto é preventivo: produção não tem campanhas nenhumas, logo não
// há tokens em circulação nem links partilhados. Mas a porta fechava-se
// de qualquer forma — uma porta aberta para uma sala sem luz não espera
// que alguém entre para ser um erro.
//
// PARA VOLTAR A LIGAR: pôr a true. As duas portas abrem juntas, que é
// precisamente a razão de haver um só interruptor.
//
// NOTA SOBRE A BASE DE DADOS: isto fecha a porta por onde as pessoas
// passam — a página. As duas funções públicas da base (ler a campanha,
// deixar a promessa) continuam concedidas ao anónimo, portanto um
// pedido feito à mão, por quem soubesse um token, ainda passaria.
// Fechar também esse lado é uma migração, e essa é decisão do Hélio.
// ------------------------------------------------------------
export const CONTRIBUICAO_COLETIVA_ATIVA = false;
