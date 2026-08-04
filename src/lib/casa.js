// ============================================================
// casa.js — a identidade da casa, num sítio só.
//
// Nasceu na fase 2 só com o número de WhatsApp; a costura da marca
// trouxe para aqui o resto do que andava cravado pelo código fora:
// quem é a empresa, onde mora na internet, o logótipo, as linhas de
// marca e as assinaturas que as folhas e os documentos imprimem.
// Quem precisa, importa daqui — e os sítios históricos
// (orcamentoConfig.js, portal/base.js) re-exportam daqui, para
// nenhum import antigo partir.
//
// NÃO é multi-tenancy: um objecto, uma fonte, lido de um sítio só.
// No dia em que houver um segundo negócio, a camada de configuração
// entra AQUI — estes valores passam a vir de onde tiverem de vir —
// e o resto do código não se reescreve, porque já lê tudo daqui.
// ============================================================

// O único import é o ficheiro do logótipo — resolve-se no build para
// um endereço de imagem, sem código atrás: qualquer página (até as
// públicas) continua a importar daqui sem arrastar nada consigo.
import logo from "../assets/logo.png";

// ---------- Quem é a empresa ----------
// Os dados legais da 2.ª contraente — aparecem nos contratos e nos
// orçamentos. (Viviam em orcamentoConfig.js, que agora re-exporta.)
export const EMPRESA = {
  nome: "Nádia Schultz",
  morada: "Rua dos Moinhos nº 31 - Ericeira",
  nif: "243705689",
  iban: "PT50 0193 0000 1050 1570 8076 8",
  designacao: "Do Luxo à Mesa",
  foro: "comarca de Sintra",
};

// ---------- Onde a casa mora na internet ----------
// O domínio à parte do endereço: as folhas escrevem «doluxoamesa.pt»
// como morada legível; o endereço completo é o que se clica.
export const DOMINIO_CASA = "doluxoamesa.pt";
export const SITE_URL = `https://${DOMINIO_CASA}`;

// ---------- O número ----------
// O número do negócio, já canónico (indicativo 351 incluído) — o mesmo
// por onde a casa fala com as clientes.
export const NUMERO_WHATSAPP_CASA = "351927177190";

// O link wa.me da casa, com (ou sem) mensagem pré-escrita.
// NÃO reutiliza o linkWhatsApp de mensagens.js de propósito: aquele
// normaliza números desconhecidos e vive num ficheiro que importa o
// cliente supabase — este é constante da casa que qualquer página
// importa sem trazer o supabase atrás.
export const linkWhatsAppCasa = (texto = "") =>
  `https://wa.me/${NUMERO_WHATSAPP_CASA}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;

// ---------- O logótipo ----------
// Re-exportado para o logo se ler do mesmo sítio que o resto da
// identidade; o ficheiro em si continua em src/assets/.
export const LOGO_CASA = logo;

// ---------- As palavras da marca ----------
// A linha de actividade que acompanha o logótipo nas folhas públicas
// (quem a mostra em maiúsculas fá-lo com .toUpperCase(), nunca com
// uma segunda cópia do texto).
export const LINHA_ACTIVIDADE = "Decoração e aluguer para eventos";

// A linha «by …» que fecha os cabeçalhos das páginas e das fichas.
export const LINHA_BY_LUXURY = "by Luxury Events";

// O slogan — fecha o briefing impresso e a mensagem de convite.
export const SLOGAN_CASA =
  "Planeamos cada detalhe. Criamos memórias inesquecíveis.";

// A tagline do PDF de exportação (hoje só o exportador antigo a usa).
export const TAGLINE_EXPORTS =
  "Planeamento · Personalização · Organização · Detalhes";

// ---------- As assinaturas e os rodapés ----------
// A assinatura fixa da folha de comunicado: despedida + designação.
export const ASSINATURA_FOLHA = {
  despedida: "Com carinho,",
  nome: EMPRESA.designacao,
};

// O rodapé-assinatura das páginas públicas do portal.
export const ASSINATURA_PUBLICA = `${EMPRESA.designacao} · ${LINHA_BY_LUXURY}`;

// A assinatura com a titular — capa do projecto e página de captação.
export const ASSINATURA_TITULAR = `${EMPRESA.designacao} · by ${EMPRESA.nome}`;

// O rodapé da folha de orçamento. Os \u00A0 eram &nbsp; no JSX de
// origem — mantêm-se byte a byte para a folha não mudar um pixel.
export const RODAPE_MARCA_ORCAMENTO = `${EMPRESA.designacao.toUpperCase()} \u00A0|\u00A0 By ${EMPRESA.nome}`;

// O título interno do backoffice (separador do browser) — vivia
// duplicado em notificacoes.js e EventoPage.jsx.
export const TITULO_BACKOFFICE = `Sistema DLM — ${EMPRESA.designacao}`;
