import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { MensagensConteudo } from "./MensagensSheet";
import { caminhoDoSeparador } from "../../lib/rotasAdmin";

// ============================================================
// MensagensTab — a biblioteca de mensagens-tipo como separador
// próprio (grupo Gestão): sempre à mão para consultar, editar e
// criar, sem precisar de abrir um evento.
//
// Sem contexto de evento, os campos automáticos ({NOME}, {VALOR},
// {SINAL}...) aparecem como "___" — a nota explica que, abertas a
// partir de um evento (💬 no cartão), vêm preenchidas.
// ============================================================

export default function MensagensTab() {
  return (
    <motion.div
      key="tab-mensagens"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <h2
        style={{
          fontSize: "22px",
          fontFamily: "Playfair Display, serif",
          color: "var(--charcoal)",
          margin: "0 0 4px 0",
        }}
      >
        Mensagens
      </h2>
      <p
        style={{
          fontSize: "13px",
          color: "var(--gray-mid)",
          margin: "0 0 20px 0",
          lineHeight: 1.6,
          maxWidth: "560px",
        }}
      >
        Os teus textos prontos para o Instagram. Aqui os campos
        automáticos aparecem como <strong>___</strong> — abre as
        mensagens a partir de um evento (💬 no cartão do cliente) para
        os veres preenchidos com o nome, a data e os valores certos.
      </p>
      {/* Uma seta discreta para o vizinho: as mensagens falam com UMA
          pessoa de cada vez; quando é para muitos, a ferramenta é outra. */}
      <p
        style={{
          fontSize: "12px",
          fontStyle: "italic",
          color: "var(--gray-mid)",
          margin: "-10px 0 20px 0",
          lineHeight: 1.6,
          maxWidth: "560px",
        }}
      >
        Para dizer uma coisa a muitos de uma vez, a folha com endereço
        próprio vive nos{" "}
        <Link
          to={caminhoDoSeparador("comunicados")}
          style={{
            color: "var(--gold-dark)",
            textDecorationColor: "var(--gold-light)",
            textUnderlineOffset: "3px",
          }}
        >
          Comunicados
        </Link>
        .
      </p>
      <div style={{ maxWidth: "560px" }}>
        <MensagensConteudo dados={null} reordenavel />
      </div>
    </motion.div>
  );
}