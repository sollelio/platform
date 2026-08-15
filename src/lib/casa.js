// ============================================================
// casa.js — a FORMA da identidade, já não os valores.
//
// Nasceu na fase 2 com o número de WhatsApp e cresceu na costura da
// marca (04/08) até guardar a identidade inteira: quem é a empresa,
// onde mora na internet, o logótipo, as linhas de marca, as
// assinaturas que as folhas imprimem. O comentário de então prometia:
// «no dia em que houver um segundo negócio, a camada de configuração
// entra AQUI — estes valores passam a vir de onde tiverem de vir — e
// o resto do código não se reescreve, porque já lê tudo daqui».
//
// Esse dia é hoje. Os valores passam a viver na tabela `tenants`
// (migração 097) e chegam por três portas públicas (098). Este
// ficheiro fica com o que é mesmo dele: a FORMA — como se compõem as
// assinaturas, como se monta o wa.me, o que fica quando falta um
// campo.
//
// A DO LUXO À MESA CONTINUA AQUI, como omissão. Não é resíduo: é o
// que a interface desenha enquanto a identidade viaja, e o que a
// salva se a rede falhar a meio. Uma folha sem cabeçalho é pior do
// que uma folha com o cabeçalho de ontem. Quando entrar a segunda
// casa, estes valores mudam para os da Sollelio e deixam de nomear
// ninguém — mas isso é o dia da segunda casa, não hoje.
// ============================================================

import logo from "../assets/logo.png";

// ---------- A omissão ----------
// Os valores que a 097 copiou para a base, byte a byte. Enquanto
// houver uma casa só, o que se desenha antes e depois de a
// identidade chegar é exactamente o mesmo — e é isso que torna a
// migração ficheiro a ficheiro segura: nada pisca, nada muda.
export const CASA_OMISSAO = {
  nome: "Do Luxo à Mesa",
  titular: "Nádia Schultz",
  morada: "Rua dos Moinhos nº 31 - Ericeira",
  nif: "243705689",
  iban: "PT50 0193 0000 1050 1570 8076 8",
  mbway: "927 177 190",
  foro: "comarca de Sintra",
  dominio: "doluxoamesa.pt",
  whatsapp: "351927177190",
  logo_url: null, // nulo = usa o logótipo do repositório (ver logoDe)
  linha_actividade: "Decoração e aluguer para eventos",
  linha_by: "by Luxury Events",
  slogan: "Planeamos cada detalhe. Criamos memórias inesquecíveis.",
};

// Um campo em falta cai na omissão, campo a campo — nunca o objecto
// inteiro. Uma casa nova sem foro preenchido não deve herdar a
// comarca de Sintra por a resposta ter chegado incompleta; deve
// herdar campo nulo e a folha decide. Mas uma resposta que não chegou
// de todo (null) cai inteira, que é o caso da rede em baixo.
export const comOmissao = (casa) => ({ ...CASA_OMISSAO, ...(casa || {}) });

// ---------- O logótipo ----------
// A casa que tem logo no Storage usa-o; a que não tem cai no ficheiro
// do repositório. O import continua a resolver-se no build, sem
// código atrás — qualquer página, até as públicas, importa daqui sem
// arrastar nada consigo.
export const LOGO_REPOSITORIO = logo;
export const logoDe = (casa) => casa?.logo_url || LOGO_REPOSITORIO;

// ---------- A letra da assinatura ----------
// NÃO é da casa: é sistema de desenho da Sollelio, e por isso ficou
// de fora da 097 — a mesma razão que deixou paleta e tipografias
// fora da costura de 04/08. A Cochocib Script Latin Pro é a escolha
// do Hélio (10/08), fonte COMERCIAL que não se embute sem licença:
// fica primeira na pilha, à espera. Até lá vale a Great Vibes
// (Google Fonts, SIL), a caligráfica de casamento mais próxima.
export const FONTE_ASSINATURA_CASA =
  '"Cochocib Script Latin Pro", "Great Vibes", cursive';

// ---------- O título do backoffice ----------
// Diz o nome do PRODUTO visto por dentro, não o do cliente — por isso
// também ficou fora da 097. Era «Sistema DLM», que nomeava a primeira
// casa numa etiqueta que todas vão ver.
export const TITULO_BACKOFFICE = (casa) =>
  `Celebra — ${comOmissao(casa).nome}`;

// ---------- Onde a casa mora na internet ----------
export const siteDe = (casa) => `https://${comOmissao(casa).dominio}`;

// ---------- O WhatsApp ----------
// NÃO reutiliza o linkWhatsApp de mensagens.js, de propósito: aquele
// normaliza números desconhecidos e vive num ficheiro que importa o
// cliente supabase — este monta-se com o número já canónico e
// qualquer página o usa sem trazer o supabase atrás.
export const linkWhatsAppCasa = (casa, texto = "") => {
  const numero = comOmissao(casa).whatsapp;
  return `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
};

// O número como se lê em voz alta: +351 927 177 190. O canónico não
// tem sinais (o wa.me exige-o assim); esta é a forma de o mostrar.
export const numeroLegivel = (casa) => {
  const n = comOmissao(casa).whatsapp;
  return `+${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 9)} ${n.slice(9)}`;
};

// ---------- As assinaturas e os rodapés ----------
// Derivações, não dados — por isso continuam aqui e não na base. O
// que muda é de onde vêm os pedaços.

// A assinatura fixa da folha de comunicado: despedida + designação.
export const assinaturaFolha = (casa) => ({
  despedida: "Com carinho,",
  nome: comOmissao(casa).nome,
});

// O rodapé-assinatura das páginas públicas do portal.
export const assinaturaPublica = (casa) => {
  const c = comOmissao(casa);
  return c.linha_by ? `${c.nome} · ${c.linha_by}` : c.nome;
};

// A assinatura com a titular — capa do projecto e página do pedido.
export const assinaturaTitular = (casa) => {
  const c = comOmissao(casa);
  return c.titular ? `${c.nome} · by ${c.titular}` : c.nome;
};

// O rodapé da folha de orçamento. Os \u00A0 eram &nbsp; no JSX de
// origem — mantêm-se byte a byte para a folha não mudar um pixel.
export const rodapeMarcaOrcamento = (casa) => {
  const c = comOmissao(casa);
  return `${c.nome.toUpperCase()} \u00A0|\u00A0 By ${c.titular}`;
};

// ============================================================
// A PONTE — o que sobra dela.
//
// Eram doze exportações a servir vinte ficheiros. A 099 migrou-os
// todos; onze caíram por não terem ficado com um único consumidor.
// Sobra UMA, e sobra por um motivo que não é preguiça.
//
// ⚠ O EMPRESA não conhece a casa. Enquanto houver uma casa só diz a
// verdade; no dia da segunda mente — e mente em silêncio, que é o pior
// modo de mentir. Continua vivo porque o texto das CLÁUSULAS do
// contrato o tem cosido por dentro das frases («sob a designação
// comercial X», «o foro da X»), e essas frases são da titular, não
// molde de plataforma: trocar o X por casa.nome não as tornaria da
// casa seguinte, tornava-as só menos verdadeiras.
//
// O prazo: as cláusulas passam a texto por casa, na base. Nesse dia
// esta ponte cai inteira. Até lá é UM ficheiro, e está nomeado:
//
//   grep -rln "EMPRESA" src/ --include=*.js --include=*.jsx
//   → src/components/admin/orcamentos/contratoConfig.js
//
// Se esse grep alguma vez devolver um segundo ficheiro, alguém voltou
// a atravessar a ponte em vez de usar o useCasa().
// ============================================================

/** @deprecated só para o texto das cláusulas — usar useCasa() (099) */
export const EMPRESA = {
  nome: CASA_OMISSAO.titular, // ⚠ invertido de propósito: o casa.js
  designacao: CASA_OMISSAO.nome, //   antigo chamava `nome` à pessoa
  morada: CASA_OMISSAO.morada,
  nif: CASA_OMISSAO.nif,
  iban: CASA_OMISSAO.iban,
  mbway: CASA_OMISSAO.mbway,
  foro: CASA_OMISSAO.foro,
};