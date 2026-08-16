import { useEffect, useState } from "react";
import { getAcessoDoEvento, enderecoDoPortal } from "../../lib/portal";
import { sinalRecebidoWhatsApp } from "../../lib/disputaDia";
import { linkWhatsApp } from "../../lib/mensagens";
import { getValorAtual } from "../../lib/submissionFields";
import { extrairDadosCliente } from "../../lib/clientes";

// ============================================================
// AvisoSinalRecebido — a oferta de aviso à cliente no instante em que
// o sinal entra no livro (decisão de 10/08/2026).
//
// O elo que faltava: o registo do sinal acorda o portal no servidor,
// mas ninguém dizia à cliente para ir lá ver — a página respondia
// quando ela olhasse, e ninguém lhe dizia para olhar. Este cartão é o
// padrão do prazo aplicado ao desfecho: a mensagem pré-escrita no tom
// da casa, com a ligação do acompanhamento lá dentro — e o envio é
// sempre um gesto da Nádia, nunca do sistema (doutrina de 09/08).
//
// Vive nas duas portas do registo (a aba Pagamentos e o Funil) e é
// passageiro: fecha-se e não volta — quem manda no aviso é ela.
// Sem acompanhamento aberto, a frase da página cala-se na mensagem
// (não se promete uma página que não está no ar); sem número da
// cliente, fica só o copiar.
// ============================================================

export default function AvisoSinalRecebido({ evento, aoFechar, style }) {
  const [ligacaoPortal, setLigacaoPortal] = useState(null);
  const [carregado, setCarregado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    getAcessoDoEvento(evento.id)
      .then((a) => {
        if (!cancelado)
          setLigacaoPortal(a?.token ? enderecoDoPortal(a.token) : null);
      })
      .catch((e) => {
        // Sem leitura do acesso, a mensagem sai sem a frase da página —
        // honesta na mesma.
        console.error(e);
      })
      .finally(() => {
        if (!cancelado) setCarregado(true);
      });
    return () => {
      cancelado = true;
    };
  }, [evento.id]);

  // O nome e o número saem da ficha como no aviso do prazo — e a rede
  // «Cliente sem nome» das listas nunca vira saudação.
  const nomeExtraido = extrairDadosCliente(evento.respostas || {}).nome;
  const nome = nomeExtraido === "Cliente sem nome" ? null : nomeExtraido;
  const numero =
    getValorAtual(evento, "numeroWhatsapp") ||
    getValorAtual(evento, "contactoPrincipal") ||
    null;

  const mensagem = sinalRecebidoWhatsApp(nome, evento.data_evento, ligacaoPortal);
  const ligacao = linkWhatsApp(numero, mensagem);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(mensagem);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch (e) {
      console.error(e);
    }
  };

  // Um instante de espera para a mensagem nascer já certa (com ou sem
  // a ligação) — nunca se mostra uma versão e troca-se por outra.
  if (!carregado) return null;

  return (
    <div
      style={{
        backgroundColor: "var(--superficie-quente)",
        border: "1px solid var(--gold-light)",
        borderRadius: "12px",
        padding: "12px 16px",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
        <p
          style={{
            flex: 1,
            minWidth: "200px",
            margin: 0,
            fontSize: "12.5px",
            fontWeight: "600",
            color: "var(--gold-dark)",
          }}
        >
          O sinal está no livro — a cliente ainda não sabe.
        </p>
        <button
          onClick={aoFechar}
          style={{
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: "11.5px",
            color: "var(--gray-mid)",
            fontFamily: "inherit",
            padding: "2px 4px",
          }}
        >
          Fechar
        </button>
      </div>
      <p
        style={{
          margin: "8px 0 10px",
          fontSize: "12px",
          fontStyle: "italic",
          color: "var(--charcoal)",
          lineHeight: 1.55,
          overflowWrap: "anywhere",
        }}
      >
        «{mensagem}»
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
        {ligacao && (
          <button
            onClick={() => window.open(ligacao, "_blank")}
            className="acao acao--cheia"
            style={{ padding: "8px 14px", borderRadius: "10px", fontSize: "12px", fontWeight: "600" }}
          >
            Avisá-la pelo WhatsApp
          </button>
        )}
        <button
          onClick={copiar}
          className="acao acao--neutra"
          style={{ padding: "8px 14px", borderRadius: "10px", fontSize: "12px" }}
        >
          {copiado ? "Copiado ✓" : "Copiar a mensagem"}
        </button>
        <span style={{ fontSize: "11.5px", fontStyle: "italic", color: "var(--gray-mid)" }}>
          o envio é sempre um gesto seu, nunca do sistema
        </span>
      </div>
    </div>
  );
}
