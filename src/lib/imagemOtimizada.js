// ============================================================
// imagemOtimizada.js — O mecanismo único de otimização de imagens
// no carregamento (14/08/2026).
//
// Antes havia três compressores artesanais (captacao.js → JPEG,
// materiais.js → PNG, fotografias.js a reusar o primeiro) e um buraco:
// o contrato assinado no portal subia a fotografia CRUA do telemóvel.
// Este módulo substitui os três e tapa o buraco — toda a imagem que
// sobe para o armazenamento passa por aqui.
//
// O que faz: redimensiona ao lado máximo pedido e exporta em WebP
// (com qualidade alta); onde o browser não souber exportar WebP, cai
// para JPEG (fotografias) ou PNG (quando é preciso transparência).
// WebP guarda a MESMA qualidade visual em ~2/3 do peso do JPEG e
// suporta transparência — serve os dois mundos com um formato só.
//
// O que NUNCA faz: piorar. Se a imagem já é pequena e o resultado
// ficar maior que o original, vai o original. SVG (vectorial) e GIF
// (pode ser animado) passam intactos — rasterizá-los era destruí-los.
// O que não for imagem (ex.: PDF do contrato) também passa intacto,
// para o chamador não precisar de distinguir.
// ============================================================

// Deteta UMA vez se o browser sabe exportar WebP pelo canvas — os que
// não sabem devolvem PNG ao pedir-se WebP, e é isso que se testa.
let webpSuportado = null;
const sabeExportarWebP = () => {
  if (webpSuportado === null) {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    webpSuportado = c.toDataURL("image/webp").startsWith("data:image/webp");
  }
  return webpSuportado;
};

const EXTENSAO_POR_TIPO = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

// A extensão certa para o caminho no balde, a partir do MIME real do
// blob que vai subir — nunca da extensão que o ficheiro trazia.
export const extensaoDoTipo = (tipo, alternativa = "bin") =>
  EXTENSAO_POR_TIPO[tipo] || alternativa;

const passarIntacto = (ficheiro) => ({
  blob: ficheiro,
  tipo: ficheiro?.type || "application/octet-stream",
  extensao: (ficheiro?.name?.split(".").pop() || "bin").toLowerCase(),
  otimizada: false,
});

// Otimiza um ficheiro de imagem para upload.
// Devolve { blob, tipo, extensao, otimizada } — o caminho no balde
// compõe-se com `extensao` e o upload leva `contentType: tipo`.
//
// Opções:
//   ladoMax       — o lado maior nunca passa disto (px)
//   qualidade     — 0..1 para WebP/JPEG (PNG ignora)
//   transparencia — true preserva o alfa (materiais); false pinta o
//                   fundo de branco, para um PNG transparente nunca
//                   virar preto em JPEG (o bug clássico do canvas)
export const otimizarImagem = (
  ficheiro,
  { ladoMax = 1600, qualidade = 0.82, transparencia = false } = {},
) =>
  new Promise((resolve, reject) => {
    if (!ficheiro) {
      reject(new Error("Nenhum ficheiro selecionado."));
      return;
    }
    const tipoOriginal = ficheiro.type || "";
    if (
      !tipoOriginal.startsWith("image/") ||
      tipoOriginal === "image/svg+xml" ||
      tipoOriginal === "image/gif"
    ) {
      resolve(passarIntacto(ficheiro));
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(ficheiro);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const encolheu = Math.max(width, height) > ladoMax;
      if (width > height && width > ladoMax) {
        height = Math.round((height * ladoMax) / width);
        width = ladoMax;
      } else if (height > ladoMax) {
        width = Math.round((width * ladoMax) / height);
        height = ladoMax;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (transparencia) {
        ctx.clearRect(0, 0, width, height);
      } else {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(img, 0, 0, width, height);

      const formato = sabeExportarWebP()
        ? "image/webp"
        : transparencia
          ? "image/png"
          : "image/jpeg";
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Falha ao otimizar a imagem."));
            return;
          }
          // A guarda de nunca piorar: sem redimensionamento e com o
          // resultado maior que o original, o original ganha.
          if (!encolheu && blob.size >= ficheiro.size) {
            resolve(passarIntacto(ficheiro));
            return;
          }
          resolve({
            blob,
            tipo: blob.type,
            extensao: extensaoDoTipo(blob.type),
            otimizada: true,
          });
        },
        formato,
        formato === "image/png" ? undefined : qualidade,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem."));
    };
    img.src = url;
  });
