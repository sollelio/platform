// ============================================================
// marcas — o vocabulário de traço da casa, num só sítio.
//
// Um visto e uma cruz desenhados à mão (pontas redondas, traço 2.2),
// parentes do visto da Jornada e do percurso de documentos. Existem
// porque os glifos de texto ✓/✕ variavam de peso e de linha de base
// conforme a fonte do sistema — uma marca é desenho, não texto.
//
// A cor herda-se (currentColor): o botão que a usa é quem manda.
// display block: dentro de um flex centra-se sem folga de baseline.
// ============================================================

export const MarcaVisto = ({ t = 12, cor = "currentColor" }) => (
  <svg
    width={t}
    height={t}
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden
    style={{ display: "block" }}
  >
    <path
      d="M3.5 8.5 L6.6 11.6 L12.5 4.8"
      stroke={cor}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const MarcaCruz = ({ t = 12, cor = "currentColor" }) => (
  <svg
    width={t}
    height={t}
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden
    style={{ display: "block" }}
  >
    <path
      d="M4.5 4.5 L11.5 11.5 M11.5 4.5 L4.5 11.5"
      stroke={cor}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
