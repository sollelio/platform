// ============================================================
// casa.js — os dados de contacto da casa, num sítio só.
//
// O número de WhatsApp vivia escrito à mão no portal (base.js) e ia
// passar a ser preciso também na expedição dos comunicados — dois
// sítios para o MESMO número é a receita para um deles ficar velho no
// dia em que a casa mudar de cartão. Passa a viver aqui; quem precisa,
// importa daqui.
// ============================================================

// O número do negócio, já canónico (indicativo 351 incluído) — o mesmo
// por onde a casa fala com as clientes.
export const NUMERO_WHATSAPP_CASA = "351927177190";

// O link wa.me da casa, com (ou sem) mensagem pré-escrita.
// NÃO reutiliza o linkWhatsApp de mensagens.js de propósito: aquele
// normaliza números desconhecidos e vive num ficheiro que importa o
// cliente supabase — este é constante da casa, sem dependências, que
// qualquer página (até as públicas) importa sem arrastar nada consigo.
export const linkWhatsAppCasa = (texto = "") =>
  `https://wa.me/${NUMERO_WHATSAPP_CASA}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
