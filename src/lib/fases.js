// ============================================================
// fases.js — a fonte ÚNICA dos rótulos e das listas de fase.
//
// Nasceu para matar uma divergência real: o `clientes.js` tinha um segundo
// mapa de rótulos (`FASE_LABEL_PRE_SINAL`) com palavras DIFERENTES para as
// mesmas fases — «Interessada» no feminino, «Orçamento enviado», «A
// aguardar sinal» — e a Nádia lia nomes diferentes conforme o ecrã. É a
// divergência que o glossário existe para travar (pendências #1 e #2 do
// inventário de 29/07/2026).
//
// Vive em lib/ porque a regra da casa é lib/ nunca importar de
// components/ — e tanto a camada de dados como os ecrãs precisam disto.
// O `faseConfig.js` RE-EXPORTA daqui: quem já importava de lá não muda
// uma linha, e continua a haver uma fonte só.
//
// ⚠ Os rótulos são o que as PESSOAS leem — mudam aqui, uma vez. As CHAVES
// (interessado, orcamento, …) são máquina e não se tocam.
// ============================================================

export const FASE_LABEL = {
  interessado: "Interessado",
  orcamento: "Orçamento",
  sinal: "Aguarda sinal",
  cliente: "Cliente",
  projecto: "Projecto",
  contrato: "Contrato",
  perdido: "Perdido",
};

// Fases PÓS-SINAL (a data está garantida — o negócio é dela). A mesma
// lista canónica da Agenda, dos alertas do Início, da conferência da
// Logística, das lacunas de formulário e da etapa 7 da Jornada do portal.
// O contrato VOLTOU a esta lista (decisão final da dona do negócio,
// migração 077): o sinal paga-se logo a seguir ao aceite e é ELE que
// reserva a data — a fase `contrato` quer dizer «sinal pago, contrato
// por assinar», e portanto já é PÓS-sinal.
export const FASES_POS_SINAL = ["contrato", "cliente", "projecto"];
