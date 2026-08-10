import { useEffect, useRef, useState } from "react";
import { LOGO_CASA as logoUrl, EMPRESA, DOMINIO_CASA } from "../../lib/casa";
import {
  guardarComunicado,
  listarDestinatarios,
  primeiroNome,
  enderecoDoComunicado,
} from "../../lib/comunicados";
import { resolverMensagem } from "../../lib/mensagens";

// ============================================================
// MensagemEditor — o texto que acompanha o endereço da folha.
//
// Sobreposição irmã do ComunicadoEditor, pelo desenho «A mensagem»:
// escreve-se UMA vez e em cada conversa sai com o nome da pessoa. Os
// botões dizem «+ nome» e «+ endereço» em português humano, mas o que
// inserem são os tokens da casa — {NOME} e {LINK_FOLHA} — e quem os
// resolve é o MESMO resolvedor das mensagens-tipo (resolverMensagem):
// um resolvedor, não dois (regra do dono).
//
// A pré «como chega» mostra a mensagem dentro de um balão de WhatsApp,
// com o cartão da folha em miniatura por cima — resolvida com o
// primeiro nome do primeiro destinatário da lista fechada, se ela já
// existir; senão com a Marta do desenho.
//
// props:
//   comunicado — o registo (id + titulo + mensagem + token)
//   onFechar   — fecha sem guardar
//   onGuardado(rec) — guardou; recebe o registo actualizado
// (A frente do envio abre esta mesma porta — o componente não
// assume de onde foi chamado.)
// ============================================================

// O gémeo do ComunicadoEditor: nos browsers sem field-sizing:content, a
// caixa cresce à mão com o scrollHeight. Duplicado de propósito — uma
// função de oito linhas não paga a renda de um módulo partilhado.
const SUPORTA_FIELD_SIZING =
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("field-sizing", "content");

const ajustarAltura = (el) => {
  if (!el || SUPORTA_FIELD_SIZING) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
};

const OVERLINE = {
  fontSize: "9.5px",
  fontWeight: "700",
  letterSpacing: "0.15em",
  color: "var(--gold-dark)",
};

export default function MensagemEditor({ comunicado, onFechar, onGuardado }) {
  const [base, setBase] = useState(comunicado.mensagem || "");
  const [tentouGuardar, setTentouGuardar] = useState(false);
  const [erroRede, setErroRede] = useState("");
  const [aGuardar, setAGuardar] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const timerGuardado = useRef(null);
  const areaRef = useRef(null);

  // O nome do exemplo: o primeiro da lista fechada, se já existir —
  // a pré mostra a mensagem como vai mesmo sair para alguém real; sem
  // lista (ou sem rede), a Marta do desenho serve.
  const [nomeExemplo, setNomeExemplo] = useState("Marta");
  useEffect(() => {
    let cancelado = false;
    listarDestinatarios(comunicado.id)
      .then((lista) => {
        if (cancelado || !lista.length) return;
        const nome = primeiroNome(lista[0].nome);
        if (nome) setNomeExemplo(nome);
      })
      .catch(() => {
        /* a pré não pode partir por a lista não vir — fica a Marta */
      });
    return () => {
      cancelado = true;
    };
  }, [comunicado.id]);

  // A hora do balão, apanhada uma vez à abertura — é cenografia do
  // WhatsApp, não um relógio a trabalhar.
  const [hora] = useState(() =>
    new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
  );

  useEffect(() => () => clearTimeout(timerGuardado.current), []);

  // Insere o token NA POSIÇÃO DO CURSOR (substituindo a selecção, se a
  // houver) — como o desenho faz, por selectionStart. O cursor fica
  // logo a seguir ao token, pronto a continuar a frase.
  const inserir = (token) => {
    const el = areaRef.current;
    if (el && typeof el.selectionStart === "number") {
      const i = el.selectionStart;
      const f = el.selectionEnd;
      setBase(base.slice(0, i) + token + base.slice(f));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(i + token.length, i + token.length);
        ajustarAltura(el);
      });
    } else {
      setBase(`${base} ${token}`);
    }
  };

  // As palavras do desenho — o endereço é obrigatório porque uma
  // mensagem de envio sem a folha não leva ninguém a lado nenhum.
  const problema = () => {
    if (!base.trim()) return "A mensagem está vazia.";
    if (!base.includes("{LINK_FOLHA}")) {
      return "A mensagem tem de levar o endereço da folha — o botão «+ endereço» volta a pô-lo.";
    }
    return "";
  };

  const guardar = async () => {
    const p = problema();
    if (p) {
      setTentouGuardar(true);
      setErroRede("");
      return;
    }
    setTentouGuardar(false);
    setErroRede("");
    setAGuardar(true);
    try {
      const rec = await guardarComunicado(comunicado.id, { mensagem: base.trim() });
      setGuardado(true);
      // O visto fica 900ms à vista antes de a porta fechar — o mesmo
      // compasso do editor da folha.
      timerGuardado.current = setTimeout(() => onGuardado(rec), 900);
    } catch (e) {
      console.error(e);
      setErroRede("Não foi possível guardar a mensagem. Tente outra vez.");
    } finally {
      setAGuardar(false);
    }
  };

  const erro = erroRede || (tentouGuardar ? problema() : "");

  const tituloFolha = (comunicado.titulo || "").trim();
  // A pré resolve com o endereço LIMPO (sem https://), como o desenho
  // mostra — no envio sai o completo, que é o que abre à primeira.
  const endereco = comunicado.token
    ? enderecoDoComunicado(comunicado.token).replace(/^https?:\/\//, "")
    : null;
  const previa = resolverMensagem(base, { nomeCliente: nomeExemplo, linkFolha: endereco });
  // «À MARTA» é a grafia do desenho; um nome real entra sem artigo —
  // não se adivinha o género de quem recebe.
  const comoChega =
    nomeExemplo === "Marta" ? "COMO CHEGA À MARTA" : `COMO CHEGA A ${nomeExemplo.toUpperCase()}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="A mensagem da folha"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        backgroundColor: "var(--cream)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* A identidade dos botões de token vive numa classe para o hover
          poder responder (a regra da camada de interacção da casa). */}
      <style>{`
        .dlm-token {
          border: 1px solid var(--gold-light);
          background-color: white;
          color: var(--gold-dark);
        }
        .dlm-token:hover {
          background-color: #fbf7ef;
          border-color: var(--gold);
        }
      `}</style>

      {/* ---- Cabeçalho fixo ---- */}
      <header
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "12px 20px",
          borderBottom: "1px solid #F0E6D0",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              ...OVERLINE,
              fontSize: "9px",
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {tituloFolha ? `FOLHA · ${tituloFolha.toUpperCase()}` : "FOLHA"}
          </div>
          <div
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "21px",
              lineHeight: 1.25,
              color: "var(--charcoal)",
            }}
          >
            A mensagem
          </div>
        </div>
        <button
          onClick={onFechar}
          aria-label="Fechar sem guardar"
          className="icone-botao"
          style={{
            width: "34px",
            height: "34px",
            borderRadius: "10px",
            color: "var(--gray-mid)",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </header>

      {/* ---- Corpo com scroll ---- */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto", padding: "24px 20px 60px" }}>
          <label htmlFor="campo-mensagem-base" style={{ display: "block", ...OVERLINE }}>
            O TEXTO QUE ACOMPANHA O ENDEREÇO
          </label>
          <p style={{ margin: "8px 0 0", fontSize: "12px", lineHeight: 1.6, color: "var(--gray-mid)" }}>
            Escreve-se uma vez; em cada conversa sai com o nome da pessoa.
          </p>
          <textarea
            id="campo-mensagem-base"
            ref={(el) => {
              areaRef.current = el;
              ajustarAltura(el);
            }}
            value={base}
            onChange={(e) => setBase(e.target.value)}
            onInput={(e) => ajustarAltura(e.currentTarget)}
            rows={5}
            placeholder="Olá, {NOME}! Temos uma folha para si — pode ler e partilhar: {LINK_FOLHA}"
            className="caixa-texto"
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginTop: "12px",
              padding: "13px 14px",
              fontFamily: "Inter, sans-serif",
              fontSize: "13.5px",
              lineHeight: 1.65,
              color: "var(--charcoal)",
              border: "1.5px solid var(--gold-light)",
              borderRadius: "12px",
              backgroundColor: "white",
              outline: "none",
              resize: "none",
              minHeight: "120px",
              // Nos browsers que o falam, a caixa cresce sozinha; nos
              // outros, o ajustarAltura acima faz o mesmo ofício.
              fieldSizing: "content",
            }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginTop: "10px" }}>
            <button
              onClick={() => inserir("{NOME}")}
              className="acao dlm-token"
              style={{
                padding: "8px 13px",
                borderRadius: "999px",
                fontSize: "11.5px",
                fontWeight: "600",
              }}
            >
              + nome
            </button>
            <button
              onClick={() => inserir("{LINK_FOLHA}")}
              className="acao dlm-token"
              style={{
                padding: "8px 13px",
                borderRadius: "999px",
                fontSize: "11.5px",
                fontWeight: "600",
              }}
            >
              + endereço
            </button>
            <div style={{ fontSize: "11.5px", fontStyle: "italic", color: "var(--gray-mid)" }}>
              Na lista de difusão a mensagem sai igual para todos — o nome é
              retirado.
            </div>
          </div>

          {/* ---- A pré: o balão de WhatsApp do desenho ---- */}
          <div style={{ marginTop: "28px", ...OVERLINE }}>{comoChega}</div>
          <div
            style={{
              marginTop: "12px",
              backgroundColor: "#ECE7DE",
              border: "1px solid #F0E6D0",
              borderRadius: "16px",
              padding: "18px 14px",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <div
              style={{
                maxWidth: "310px",
                minWidth: 0,
                backgroundColor: "#FBF7EF",
                border: "1px solid #F0E6D0",
                borderRadius: "14px 14px 4px 14px",
                padding: "7px 8px 8px",
                boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
              }}
            >
              {/* O cartão da folha em miniatura — o que o WhatsApp desenha
                  quando o endereço vai na mensagem. */}
              <div
                style={{
                  display: "flex",
                  gap: "9px",
                  alignItems: "center",
                  backgroundColor: "var(--cream)",
                  border: "1px solid #F0E6D0",
                  borderRadius: "9px",
                  padding: "8px 10px",
                }}
              >
                <img
                  src={logoUrl}
                  alt={EMPRESA.designacao}
                  style={{ height: "34px", width: "auto", flex: "none" }}
                />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "11.5px",
                      fontWeight: "600",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {tituloFolha ? `Folha — ${tituloFolha}` : "Folha"}
                  </div>
                  <div
                    style={{
                      fontSize: "10.5px",
                      color: "var(--gray-mid)",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {`Uma folha da ${EMPRESA.designacao}, para ler e partilhar.`}
                  </div>
                  <div style={{ fontSize: "10px", color: "#9B9B9B" }}>{DOMINIO_CASA}</div>
                </div>
              </div>
              <div
                style={{
                  padding: "7px 4px 0",
                  fontSize: "13px",
                  lineHeight: 1.5,
                  whiteSpace: "pre-line",
                  overflowWrap: "break-word",
                }}
              >
                {previa}
              </div>
              <div style={{ textAlign: "right", fontSize: "10px", color: "#9B9B9B", padding: "2px 4px 0" }}>
                {hora}
              </div>
            </div>
          </div>
          {/* Sem endereço não há o que resolver — o «___» é o aviso
              honesto da casa, e esta linha diz de onde ele vem. */}
          {!comunicado.token && (
            <p style={{ margin: "10px 0 0", fontSize: "11.5px", fontStyle: "italic", color: "var(--gray-mid)" }}>
              A folha ainda não tem endereço — quando for publicada, o «___»
              dá lugar ao endereço verdadeiro.
            </p>
          )}
        </div>
      </div>

      {/* ---- Rodapé fixo ---- */}
      <footer
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "12px 20px",
          borderTop: "1px solid #F0E6D0",
        }}
      >
        <div role="alert" style={{ flex: 1, minWidth: 0, fontSize: "12.5px", color: "#DC2626" }}>
          {erro}
        </div>
        <button
          onClick={onFechar}
          className="acao acao--neutra"
          style={{
            flex: "none",
            padding: "10px 16px",
            borderRadius: "10px",
            fontSize: "12.5px",
            fontWeight: "600",
          }}
        >
          Cancelar
        </button>
        <button
          onClick={guardar}
          disabled={aGuardar || guardado}
          className="acao acao--cheia"
          style={{
            flex: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            padding: "10px 20px",
            borderRadius: "10px",
            fontSize: "12.5px",
            fontWeight: "600",
            boxShadow: "0 4px 12px rgba(201,168,76,0.30)",
          }}
        >
          {guardado && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 8.6l3.2 3.2L13 5" />
            </svg>
          )}
          {guardado ? "Guardada" : "Guardar"}
        </button>
      </footer>
    </div>
  );
}
