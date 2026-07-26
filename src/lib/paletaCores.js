// ============================================================
// paletaCores.js — catálogo fixo de cores para os eventos.
// Dois grupos, como a Nádia trabalha: as cores suaves (nudes e
// pastéis, o território habitual) de um lado, as fortes do outro.
//
// Cada cor tem nome (PT-PT) e hex. Ao escolher, guardamos ambos —
// o nome para leitura, o hex para mostrar a amostra visual em
// qualquer lado (formulário, drawer, briefing).
// ============================================================

export const GRUPOS_PALETA = [
  {
    titulo: "Nudes & Pastéis",
    cores: [
      { nome: "Branco", hex: "#FFFFFF" },
      { nome: "Marfim", hex: "#F5EFE6" },
      { nome: "Bege", hex: "#E8D9C5" },
      { nome: "Areia", hex: "#D9C0A3" },
      { nome: "Camel", hex: "#C9A87C" },
      { nome: "Dourado", hex: "#C9A84C" },
      { nome: "Terracota Suave", hex: "#D8A9A0" },
      { nome: "Castanho Nude", hex: "#B08968" },
      { nome: "Rosa Pastel", hex: "#F6D9DE" },
      { nome: "Pêssego", hex: "#F3E1D0" },
      { nome: "Amarelo Manteiga", hex: "#FBEFC9" },
      { nome: "Verde Sálvia", hex: "#DCE8CE" },
      { nome: "Verde Água", hex: "#CFE4E0" },
      { nome: "Azul Céu", hex: "#CADEEF" },
      { nome: "Lilás", hex: "#D9CFE8" },
      { nome: "Malva", hex: "#E8D5E4" },
    ],
  },
  {
    titulo: "Cores Fortes",
    cores: [
      { nome: "Bordeaux", hex: "#9B2D4F" },
      { nome: "Fúcsia", hex: "#C4416A" },
      { nome: "Vermelho", hex: "#B03636" },
      { nome: "Roxo", hex: "#7A3B8F" },
      { nome: "Azul Marinho", hex: "#2E5A8F" },
      { nome: "Verde Esmeralda", hex: "#2C6E63" },
      { nome: "Preto", hex: "#1A1A1A" },
      { nome: "Cinza", hex: "#7C7F83" },
    ],
  },
];

// Lista plana de todas as cores (para procuras rápidas).
export const TODAS_AS_CORES = GRUPOS_PALETA.flatMap((g) => g.cores);

// Dado um nome de cor, devolve o hex (ou null se não existir no catálogo).
// Útil para mostrar a amostra de valores antigos guardados só como nome.
export const hexDaCor = (nome) => {
  const cor = TODAS_AS_CORES.find(
    (c) => c.nome.toLowerCase() === String(nome).toLowerCase(),
  );
  return cor ? cor.hex : null;
};

// Determina se um texto de cor precisa de letra escura ou clara por cima
// (para etiquetas legíveis sobre a amostra). Baseado na luminância do hex.
export const corTextoSobre = (hex) => {
  if (!hex || typeof hex !== "string") return "#1A1A1A";
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#1A1A1A";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // luminância relativa aproximada
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1A1A1A" : "#FFFFFF";
};

// A cor de quem se perdeu: um nome sem hex que o catálogo não conhece.
export const COR_NEUTRA = "#DDDDDD";

const HEX = /^(.*?)\s*(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}))$/;

// ============================================================
// CORES EM TEXTO — evento_materiais.cores é uma coluna de TEXTO
// ("Marfim, Dourado"), e não um array como o paletaCores do briefing.
//
// Para uma cor do catálogo o nome chega: o hex procura-se aqui. Fora do
// catálogo não há onde o ir buscar, por isso ele viaja atrás do nome —
// "Verde Tiffany #4FD1C5". Sem isto, uma cor inventada voltava cinzenta
// da base de dados, que é o mesmo que não a poder inventar.
//
// O formato antigo continua a ler-se tal e qual (nomes soltos), e as
// cores do catálogo continuam a escrever-se sem hex — quem espreitar a
// coluna vê o que sempre viu.
// ============================================================

export function coresDeTexto(texto) {
  return String(texto || "")
    .split(",")
    .map((parte) => parte.trim())
    .filter(Boolean)
    .map((parte) => {
      const comHex = HEX.exec(parte);
      if (comHex) {
        const [, nome, hex] = comHex;
        return { nome: nome.trim() || hex, hex };
      }
      return { nome: parte, hex: hexDaCor(parte) || COR_NEUTRA };
    });
}

export function textoDeCores(cores) {
  return (cores || [])
    .filter((c) => c && c.nome)
    .map(({ nome, hex }) => {
      // A vírgula é o separador: num nome partiria a cor em duas na
      // leitura seguinte.
      const limpo = String(nome).replace(/,/g, " ").replace(/\s+/g, " ").trim();
      // Sem hex para acrescentar: está no catálogo (o hex procura-se
      // lá), o nome já É o hex, ou não se sabe a cor — e o cinzento de
      // recurso não é uma cor, é a falta dela. Escrevê-lo transformava
      // «não sei» em «é cinzenta», e estragava o que lá estava de antes.
      if (!hex || hex === COR_NEUTRA || limpo === hex || hexDaCor(limpo))
        return limpo;
      return `${limpo} ${hex}`;
    })
    .join(", ");
}
