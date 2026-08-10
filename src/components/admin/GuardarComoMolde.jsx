import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  guardarComoMolde,
  detectarEnvelhecimento,
  perguntaProposta,
  listarDestinatarios,
  linhasActivas,
  rotuloDaRegra,
} from "../../lib/comunicados";
import { getEventTypes } from "../../lib/invites";

// ============================================================
// GuardarComoMolde — a gaveta de baixo que transforma um comunicado
// num modelo de comunicado. Contrato: {comunicado, aberta, onFechar,
// onGuardado}.
//
// A gaveta diz a verdade DUAS vezes antes de pedir o nome: o que
// FICA (a folha, a mensagem, a regra) e o que NÃO FICA (os nomes,
// o endereço, as leituras — com os números reais deste comunicado,
// para a promessa não ser abstracta).
//
// E pergunta UMA coisa que o desenho não perguntava (decisão do
// dono): «o que envelhece?» — a heurística propõe os blocos com
// datas e prazos já assinalados; ela confirma, desmarca ou marca
// qualquer outro. Um bloco marcado leva {rever, pergunta} no modelo
// e a folha que nascer dele pede para o rever.
// ============================================================

const OVERLINE = {
  fontSize: "9.5px",
  fontWeight: "700",
  letterSpacing: "0.15em",
  color: "var(--gold-dark)",
};

// «Os quatro nomes desta lista» — por extenso até dez, como o desenho
// fala; a partir daí o algarismo é mais honesto do que um palavrão.
const POR_EXTENSO = [null, null, "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];

const rotuloNomes = (n) => {
  if (!n) return "Os nomes desta lista"; // sem lista fechada (ou ainda a contar)
  if (n === 1) return "O nome desta lista";
  return `Os ${POR_EXTENSO[n] || n} nomes desta lista`;
};

const rotuloLeituras = (n) => {
  if (!n) return "As leituras";
  if (n === 1) return "A leitura";
  return `As ${n} leituras`;
};

// O rótulo de um bloco na secção do envelhecimento: o rótulo escrito,
// ou as primeiras palavras do texto — o suficiente para ela saber de
// que linha se fala.
const rotuloDoBloco = (b) => {
  const r = (b.rotulo || "").trim();
  if (r) return r;
  const palavras = (b.texto || "").trim().split(/\s+/).filter(Boolean);
  if (!palavras.length) return "(bloco em branco)";
  const corte = palavras.slice(0, 6).join(" ");
  return palavras.length > 6 ? `${corte}…` : corte;
};

// O visto dourado do FICA e o engaste/visto do toggle.
function Visto({ t = 14 }) {
  return (
    <svg width={t} height={t} viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="7" fill="var(--gold)" />
      <path
        d="M4.6 8.4l2.4 2.4 4.4-5"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function GuardarComoMolde({ comunicado, aberta, onFechar, onGuardado }) {
  const reduzido = useReducedMotion();
  const [nome, setNome] = useState("");
  const [tocou, setTocou] = useState(false); // tentou guardar sem nome
  const [ocupado, setOcupado] = useState(false);
  const [erroGuardar, setErroGuardar] = useState("");
  // {id do bloco → pergunta} — estar no mapa É estar marcado.
  const [marcas, setMarcas] = useState({});
  const [propos, setPropos] = useState(false); // a heurística propôs algo?
  const [nomesLista, setNomesLista] = useState(null);
  const [tipos, setTipos] = useState([]);

  const blocos = Array.isArray(comunicado?.blocos) ? comunicado.blocos : [];
  // Só os blocos de TEXTO se marcam para rever — uma imagem não tem
  // prazo; e um bloco vazio não tem nada que envelheça.
  const blocosDeTexto = blocos.filter(
    (b) => b.tipo !== "imagem" && b.tipo !== "chamada" && ((b.rotulo || "").trim() || (b.texto || "").trim()),
  );

  useEffect(() => {
    // Os tipos servem só ao rótulo da regra; sem eles diz «Eventos».
    getEventTypes()
      .then((t) => setTipos(t || []))
      .catch(() => {});
  }, []);

  // Abrir é começar do princípio: o nome proposto é o título da folha
  // (ela muda se quiser), as marcas nascem da heurística — e de marcas
  // que o comunicado já traga, se ele próprio nasceu de um modelo.
  //
  // Semeia-se DURANTE o render (o padrão da casa para estado preso a
  // props), não num efeito: abrir a gaveta não é acontecimento externo,
  // é o próprio render a dizer que ela abriu. Fechar limpa a chave, para
  // reabrir o MESMO comunicado voltar a semear do princípio.
  const chaveAbertura = aberta && comunicado ? comunicado.id : null;
  const [aberturaVista, setAberturaVista] = useState(null);
  if (chaveAbertura !== aberturaVista) {
    setAberturaVista(chaveAbertura);
    if (chaveAbertura) {
      setNome((comunicado.titulo || "").trim());
      setTocou(false);
      setErroGuardar("");
      setNomesLista(null);
      const iniciais = {};
      let algumaProposta = false;
      for (const b of blocosDeTexto) {
        const propoe = detectarEnvelhecimento(`${b.rotulo || ""}\n${b.texto || ""}`);
        if (propoe || b.rever === true) {
          iniciais[b.id] = (b.pergunta || "").trim() || perguntaProposta();
          algumaProposta = true;
        }
      }
      setMarcas(iniciais);
      setPropos(algumaProposta);
    }
  }

  // Os números reais do NÃO FICA vêm da rede — isso sim é um efeito.
  useEffect(() => {
    if (!aberta || !comunicado?.id) return undefined;
    let vivo = true;
    listarDestinatarios(comunicado.id)
      .then((l) => {
        if (vivo) setNomesLista(linhasActivas(l).length);
      })
      .catch(() => {
        if (vivo) setNomesLista(0);
      });
    return () => {
      vivo = false;
    };
  }, [aberta, comunicado?.id]);

  if (!comunicado) return null;

  const alternar = (b) => {
    setMarcas((prev) => {
      const seg = { ...prev };
      if (b.id in seg) delete seg[b.id];
      else seg[b.id] = (b.pergunta || "").trim() || perguntaProposta();
      return seg;
    });
  };

  const guardar = async () => {
    if (ocupado) return;
    if (!nome.trim()) {
      setTocou(true);
      return;
    }
    setOcupado(true);
    setErroGuardar("");
    try {
      // Os blocos vão TODOS (com os tipados), mas as marcas de revisão
      // são as decididas aqui: os marcados levam {rever, pergunta}, os
      // desmarcados perdem qualquer marca que trouxessem.
      const comMarcas = blocos.map((b) => {
        if (b.id in marcas) {
          return { ...b, rever: true, pergunta: (marcas[b.id] || "").trim() || perguntaProposta() };
        }
        const resto = { ...b };
        delete resto.rever;
        delete resto.pergunta;
        return resto;
      });
      const modelo = await guardarComoMolde(comunicado, nome, comMarcas);
      onGuardado(modelo);
    } catch (e) {
      console.error(e);
      setErroGuardar("Não foi possível guardar o modelo. Tente outra vez.");
    } finally {
      setOcupado(false);
    }
  };

  const nBlocos = blocos.length;
  const leituras = comunicado.n_acessos || 0;
  const noAr = Boolean(comunicado.publicado_em) && !comunicado.retirado_em;
  const regra = rotuloDaRegra(comunicado.publico, tipos);
  const erroNome = tocou && !nome.trim() ? "O modelo precisa de um nome." : "";

  const fica = [
    {
      nome: "A folha",
      nota: `Título, linha de apresentação, ${nBlocos === 1 ? "o bloco" : `os ${nBlocos} blocos`} e o aspecto.`,
    },
    { nome: "A mensagem", nota: "O texto que acompanha o endereço na conversa." },
    {
      nome: "Quem recebe",
      nota: regra
        ? `«${regra}» — a regra, não os nomes.`
        : "Ainda sem regra escolhida — fica por dizer em cada folha nova.",
    },
  ];

  const naoFica = [
    { nome: rotuloNomes(nomesLista), nota: "Contam-se de novo, de cada vez que usar o modelo." },
    { nome: "O endereço da folha", nota: "Cada folha nasce sem endereço e ganha o seu ao publicar." },
    {
      nome: rotuloLeituras(leituras),
      nota: noAr ? "Ficam com esta folha, que continua no ar." : "Ficam com esta folha.",
    },
  ];

  return (
    <>
      {/* O véu — clicar fora fecha, como em todas as gavetas da casa. */}
      <div
        onClick={onFechar}
        aria-hidden={!aberta}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(26,26,26,0.28)",
          opacity: aberta ? 1 : 0,
          pointerEvents: aberta ? "auto" : "none",
          transition: reduzido ? "none" : "opacity 200ms ease",
          zIndex: 90,
        }}
      />
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 95,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Guardar como modelo"
          aria-hidden={!aberta}
          style={{
            width: "100%",
            maxWidth: "560px",
            boxSizing: "border-box",
            backgroundColor: "var(--cream)",
            border: "1px solid #F0E6D0",
            borderBottom: "none",
            borderRadius: "18px 18px 0 0",
            boxShadow: "0 -12px 48px rgba(0,0,0,0.12)",
            padding: "10px 20px 24px",
            transform: aberta ? "translateY(0)" : "translateY(105%)",
            transition: reduzido ? "none" : "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)",
            pointerEvents: aberta ? "auto" : "none",
            maxHeight: "92vh",
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ width: "36px", height: "4px", borderRadius: "999px", backgroundColor: "#E8DCC0" }} />
          </div>

          <div style={{ marginTop: "16px", ...OVERLINE }}>GUARDAR COMO MODELO</div>
          <div style={{ margin: "8px 0 0", fontFamily: "'Playfair Display', serif", fontSize: "21px", lineHeight: 1.35 }}>
            O que fica guardado
          </div>

          <div
            style={{
              marginTop: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "1px",
              backgroundColor: "#F0E6D0",
              border: "1px solid #F0E6D0",
              borderRadius: "12px",
              overflow: "hidden",
            }}
          >
            {fica.map((f) => (
              <div
                key={f.nome}
                style={{ display: "flex", gap: "11px", alignItems: "flex-start", backgroundColor: "#FFFFFF", padding: "13px 15px" }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="var(--gold)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  style={{ flexShrink: 0, marginTop: "2px" }}
                >
                  <path d="M3 8.6l3.2 3.2L13 5" />
                </svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: "600" }}>{f.nome}</div>
                  <div style={{ fontSize: "11.5px", lineHeight: 1.55, color: "var(--gray-mid)", marginTop: "2px" }}>
                    {f.nota}
                  </div>
                </div>
              </div>
            ))}
            {naoFica.map((f) => (
              <div
                key={f.nome}
                style={{ display: "flex", gap: "11px", alignItems: "flex-start", backgroundColor: "#FDFBF5", padding: "13px 15px" }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="#C4C4C4"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  aria-hidden="true"
                  style={{ flexShrink: 0, marginTop: "2px" }}
                >
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "var(--gray-mid)",
                      textDecoration: "line-through",
                      textDecorationColor: "#E8DCC0",
                    }}
                  >
                    {f.nome}
                  </div>
                  <div style={{ fontSize: "11.5px", lineHeight: 1.55, color: "var(--gray-mid)", marginTop: "2px" }}>
                    {f.nota}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p
            style={{
              margin: "11px 0 0",
              fontSize: "11.5px",
              fontStyle: "italic",
              lineHeight: 1.65,
              color: "var(--gray-mid)",
              textWrap: "pretty",
            }}
          >
            Alterações só valem para envios novos.
          </p>

          <label htmlFor="dlm-nome-molde" style={{ display: "block", marginTop: "20px", ...OVERLINE }}>
            NOME DO MODELO
          </label>
          <input
            id="dlm-nome-molde"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Como quer chamar-lhe"
            className="caixa-texto"
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginTop: "8px",
              padding: "12px 14px",
              fontFamily: "Inter, sans-serif",
              fontSize: "15px",
              color: "var(--charcoal)",
              border: "1.5px solid var(--gold-light)",
              borderRadius: "10px",
              backgroundColor: "#FFFFFF",
            }}
          />
          <div style={{ fontSize: "11.5px", fontStyle: "italic", color: "var(--gray-mid)", marginTop: "7px" }}>
            Só a casa o vê — as clientes vêem o título da folha.
          </div>

          {/* O QUE ENVELHECE — a pergunta que o desenho não fazia
              (decisão do dono): uma linha curta, não um formulário. */}
          <div style={{ marginTop: "22px" }}>
            <div style={OVERLINE}>O QUE ENVELHECE</div>
            <p
              style={{
                margin: "8px 0 0",
                fontSize: "12.5px",
                lineHeight: 1.6,
                color: "var(--gray-mid)",
                textWrap: "pretty",
              }}
            >
              {propos
                ? "Datas e prazos ficam marcados; ao usar o modelo, a folha pede para os rever."
                : "Nada aqui parece envelhecer — mas pode marcar qualquer linha."}
            </p>
            {blocosDeTexto.length > 0 && (
              <div
                style={{
                  marginTop: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1px",
                  backgroundColor: "#F0E6D0",
                  border: "1px solid #F0E6D0",
                  borderRadius: "12px",
                  overflow: "hidden",
                }}
              >
                {blocosDeTexto.map((b) => {
                  const marcado = b.id in marcas;
                  return (
                    <div key={b.id} style={{ backgroundColor: "#FFFFFF", padding: "11px 13px" }}>
                      <button
                        onClick={() => alternar(b)}
                        aria-pressed={marcado}
                        className="acao"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "11px",
                          width: "100%",
                          textAlign: "left",
                          border: "none",
                          background: "transparent",
                          padding: 0,
                          borderRadius: "8px",
                        }}
                      >
                        {marcado ? (
                          <Visto t={20} />
                        ) : (
                          // O engaste vazio — aro fino sobre branco-quente;
                          // enche de dourado quando a linha se marca.
                          <span
                            aria-hidden
                            style={{
                              width: "20px",
                              height: "20px",
                              borderRadius: "50%",
                              backgroundColor: "#FDFBF5",
                              border: "1px solid #E8DCC0",
                              boxSizing: "border-box",
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: "12.5px",
                            lineHeight: 1.5,
                            color: marcado ? "var(--charcoal)" : "var(--gray-mid)",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {rotuloDoBloco(b)}
                        </span>
                      </button>
                      {marcado && (
                        <input
                          value={marcas[b.id]}
                          onChange={(e) => setMarcas((prev) => ({ ...prev, [b.id]: e.target.value }))}
                          aria-label={`A pergunta que a folha faz sobre «${rotuloDoBloco(b)}»`}
                          className="caixa-texto"
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            marginTop: "9px",
                            padding: "9px 11px",
                            fontFamily: "Inter, sans-serif",
                            fontSize: "12px",
                            color: "var(--charcoal)",
                            border: "1px solid var(--gold-light)",
                            borderRadius: "8px",
                            backgroundColor: "#FDFBF5",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div role="alert" style={{ minHeight: "18px", marginTop: "12px", fontSize: "12.5px", color: "#DC2626" }}>
            {erroNome || erroGuardar}
          </div>
          <button
            onClick={guardar}
            disabled={ocupado}
            className="acao acao--cheia"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "14px",
              borderRadius: "12px",
              fontSize: "13.5px",
              fontWeight: "600",
              boxShadow: "0 4px 12px rgba(201,168,76,0.30)",
            }}
          >
            Guardar o modelo
          </button>
          <button
            onClick={onFechar}
            className="acao"
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginTop: "8px",
              padding: "11px",
              border: "none",
              borderRadius: "10px",
              background: "transparent",
              color: "var(--gray-mid)",
              fontSize: "12.5px",
              fontWeight: "600",
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </>
  );
}
