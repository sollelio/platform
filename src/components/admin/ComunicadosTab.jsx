import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  listarComunicados,
  getComunicado,
  criarComunicado,
  publicarComunicado,
  retirarComunicado,
  enderecoDoComunicado,
  nascerDeMolde,
} from "../../lib/comunicados";
import { Convite, Esqueleto } from "./acabamento";
import ComunicadoEditor from "./ComunicadoEditor";
import MensagemEditor from "./MensagemEditor";
import ComunicadoRecorte from "./ComunicadoRecorte";
import ComunicadoExpedicao from "./ComunicadoExpedicao";
import ComunicadoModelos from "./ComunicadoModelos";
import GuardarComoMolde from "./GuardarComoMolde";
import ComunicadoDeMolde from "./ComunicadoDeMolde";

// ============================================================
// ComunicadosTab — as folhas públicas da casa, no separador Gestão.
//
// Duas vistas dentro do separador: a LISTA (padrão da casa, sem
// desenho próprio) e o DETALHE de uma folha — o ecrã «Publicar» do
// Design, com os três estados: por publicar, publicada, retirada.
// O editor abre por cima como sobreposição de ecrã inteiro.
//
// A pastilha de leituras conta o TOTAL e só o total: a folha é
// pública e reencaminhável, e nunca se sabe quem a abriu — a
// interface diz isto por extenso, porque um número sem essa nota
// parecia prometer o que os dados não têm.
// ============================================================

const estadoDe = (c) =>
  c.retirado_em ? "retirada" : c.publicado_em ? "publicada" : "por publicar";

// «guardada hoje às 15:42» — o tempo dito como a casa fala.
const quandoGuardada = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  const mesmoDia = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const hora = d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  if (mesmoDia(d, hoje)) return `hoje às ${hora}`;
  if (mesmoDia(d, ontem)) return `ontem às ${hora}`;
  return `a ${d.toLocaleDateString("pt-PT")} às ${hora}`;
};

const plural = (n, um, muitos) => (n === 1 ? um : `${n} ${muitos}`);

// ------------------------------------------------------------
// A pastilha de estado — o anel cinzento para o que não está no ar,
// o visto dourado para o que está. As palavras são as do desenho.
// ------------------------------------------------------------
function PastilhaEstado({ estado }) {
  if (estado === "publicada") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", flexShrink: 0 }}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
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
        <span style={{ fontSize: "9.5px", fontWeight: "700", letterSpacing: "0.16em", color: "var(--gold-dark)" }}>
          PUBLICADA
        </span>
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", flexShrink: 0 }}>
      <span
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          border: "1.5px solid #9B9B9B",
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: "9.5px", fontWeight: "700", letterSpacing: "0.16em", color: "#6B7280" }}>
        {estado === "retirada" ? "RETIRADA" : "POR PUBLICAR"}
      </span>
    </span>
  );
}

// ------------------------------------------------------------
// O DETALHE — o ecrã «Publicar» do desenho, palavra a palavra.
// Vive num componente próprio (com key pelo id) para o estado do
// gesto — copiar, armar o retirar, a revelação — nascer limpo de
// cada vez que outra folha abre.
// ------------------------------------------------------------
function DetalheComunicado({
  comunicado,
  onVoltar,
  onEditar,
  onMensagem,
  onPublico,
  onExpedicao,
  onMudou,
  onGuardarMolde,
  moldeGuardado,
  onVerMoldes,
}) {
  const reduzido = useReducedMotion();
  const estado = estadoDe(comunicado);

  // A revelação entre estados só anima DEPOIS de um acto (publicar,
  // retirar): a chegada ao ecrã não é um acontecimento, o acto é.
  const [animar, setAnimar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [retirarArmado, setRetirarArmado] = useState(false);
  const timerCopiado = useRef(null);

  // O botão de retirar armado desarma sozinho aos 4s.
  useEffect(() => {
    if (!retirarArmado) return undefined;
    const t = setTimeout(() => setRetirarArmado(false), 4000);
    return () => clearTimeout(t);
  }, [retirarArmado]);

  useEffect(() => () => clearTimeout(timerCopiado.current), []);

  const publicar = async () => {
    if (ocupado) return;
    setOcupado(true);
    setErro("");
    try {
      await publicarComunicado(comunicado.id);
      const rec = await getComunicado(comunicado.id);
      setAnimar(true);
      setRetirarArmado(false);
      onMudou(rec);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível publicar a folha. Tente outra vez.");
    } finally {
      setOcupado(false);
    }
  };

  const retirar = async () => {
    if (ocupado) return;
    if (!retirarArmado) {
      setRetirarArmado(true);
      return;
    }
    setOcupado(true);
    setErro("");
    try {
      await retirarComunicado(comunicado.id);
      const rec = await getComunicado(comunicado.id);
      setAnimar(true);
      setRetirarArmado(false);
      onMudou(rec);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível retirar a folha. Tente outra vez.");
    } finally {
      setOcupado(false);
    }
  };

  const copiar = () => {
    // Copia-se o endereço completo (com o https://); mostra-se limpo.
    try {
      navigator.clipboard?.writeText(enderecoDoComunicado(comunicado.token)).catch(() => {});
    } catch {
      /* um clipboard indisponível não é motivo para partir o ecrã */
    }
    clearTimeout(timerCopiado.current);
    setCopiado(true);
    timerCopiado.current = setTimeout(() => setCopiado(false), 2200);
  };

  const nBlocos = Array.isArray(comunicado.blocos) ? comunicado.blocos.length : 0;
  const leituras = comunicado.n_acessos || 0;
  const enderecoLimpo = comunicado.token
    ? enderecoDoComunicado(comunicado.token).replace(/^https?:\/\//, "")
    : "";

  const animacao =
    animar && !reduzido
      ? "dlm-com-revelar 480ms cubic-bezier(0.22, 1, 0.36, 1) both"
      : "none";

  return (
    <div style={{ maxWidth: "720px" }}>
      <button
        onClick={onVoltar}
        className="ligacao"
        style={{ fontSize: "12.5px", color: "var(--gray-mid)", marginBottom: "18px" }}
      >
        ← Comunicados
      </button>

      <div style={{ fontSize: "9.5px", fontWeight: "700", letterSpacing: "0.15em", color: "var(--gold-dark)" }}>
        COMUNICADO
      </div>
      <h1
        style={{
          margin: "8px 0 0",
          fontFamily: "'Playfair Display', serif",
          fontSize: "26px",
          lineHeight: 1.3,
          fontWeight: "400",
          textWrap: "balance",
          color: comunicado.titulo?.trim() ? "var(--charcoal)" : "#9B9B9B",
        }}
      >
        {comunicado.titulo?.trim() || "Sem título, por enquanto"}
      </h1>
      <p style={{ margin: "9px 0 0", fontSize: "12.5px", color: "var(--gray-mid)" }}>
        {plural(nBlocos, "1 bloco", "blocos")} · guardada{" "}
        {quandoGuardada(comunicado.actualizado_em)} ·{" "}
        <button
          onClick={onEditar}
          className="ligacao"
          style={{
            fontSize: "12.5px",
            color: "var(--gold-dark)",
            textDecoration: "underline",
            textDecorationColor: "var(--gold-light)",
            textUnderlineOffset: "3px",
          }}
        >
          Editar a folha
        </button>{" "}
        ·{" "}
        {/* A mensagem que acompanha o endereço na expedição — mora ao
            lado do editar porque é a outra metade da mesma escrita. */}
        <button
          onClick={onMensagem}
          className="ligacao"
          style={{
            fontSize: "12.5px",
            color: "var(--gold-dark)",
            textDecoration: "underline",
            textDecorationColor: "var(--gold-light)",
            textUnderlineOffset: "3px",
          }}
        >
          Escrever a mensagem
        </button>{" "}
        ·{" "}
        {/* A porta para os moldes — discreta, entre as ligações: o
            comunicado que já serviu uma vez pode servir muitas. */}
        <button
          onClick={onGuardarMolde}
          className="ligacao"
          style={{
            fontSize: "12.5px",
            color: "var(--gold-dark)",
            textDecoration: "underline",
            textDecorationColor: "var(--gold-light)",
            textUnderlineOffset: "3px",
          }}
        >
          Guardar como molde
        </button>
      </p>

      {/* A banda que confirma o molde guardado e diz ONDE ele mora —
          com a ligação directa para a biblioteca. */}
      {moldeGuardado && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginTop: "18px",
            backgroundColor: "#FEF9EC",
            border: "1px solid var(--gold-light)",
            borderRadius: "14px",
            padding: "15px 16px",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0 }}>
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
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "13px", fontWeight: "600" }}>
              Molde guardado: {moldeGuardado.nome}
            </div>
            <div style={{ fontSize: "11.5px", color: "var(--gray-mid)", marginTop: "2px" }}>
              Fica em Comunicados · Moldes.
            </div>
          </div>
          <button
            onClick={onVerMoldes}
            className="ligacao"
            style={{ flexShrink: 0, fontSize: "12.5px", color: "var(--gold-dark)", whiteSpace: "nowrap" }}
          >
            Ver →
          </button>
        </div>
      )}

      <section
        style={{
          marginTop: "34px",
          backgroundColor: "white",
          border: "1.5px solid var(--gold-light)",
          borderRadius: "16px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
          padding: "36px 28px 34px",
          textAlign: "center",
        }}
      >
        {estado === "por publicar" && (
          <div key="por-publicar" style={{ animation: animacao }}>
            <PastilhaEstado estado="por publicar" />
            <div
              style={{
                margin: "14px auto 0",
                maxWidth: "420px",
                fontFamily: "'Playfair Display', serif",
                fontSize: "21px",
                lineHeight: 1.4,
                textWrap: "balance",
              }}
            >
              A folha está pronta; falta dar-lhe um endereço.
            </div>
            <div
              style={{
                margin: "16px auto 0",
                maxWidth: "400px",
                boxSizing: "border-box",
                backgroundColor: "#FDFBF5",
                border: "1.5px dashed #E8DCC0",
                borderRadius: "12px",
                padding: "13px 16px",
                fontSize: "12.5px",
                fontStyle: "italic",
                color: "#9B9B9B",
              }}
            >
              — ainda sem endereço —
            </div>
            <p
              style={{
                margin: "18px auto 0",
                maxWidth: "420px",
                fontSize: "13px",
                lineHeight: 1.7,
                color: "var(--gray-mid)",
                textWrap: "pretty",
              }}
            >
              Publicar cria o endereço público da folha. A partir daí, qualquer
              pessoa com o endereço pode abri-la e reencaminhá-la — é assim que
              ela chega ao espaço e aos fornecedores.
            </p>
            <button
              onClick={publicar}
              disabled={ocupado}
              className="acao acao--cheia"
              style={{
                marginTop: "24px",
                padding: "13px 28px",
                borderRadius: "12px",
                fontSize: "13.5px",
                fontWeight: "600",
                boxShadow: "0 4px 12px rgba(201,168,76,0.30)",
              }}
            >
              Publicar a folha
            </button>
            <p style={{ margin: "14px 0 0", fontSize: "11.5px", fontStyle: "italic", color: "var(--gray-mid)" }}>
              Pode retirá-la do ar a qualquer momento.
            </p>
          </div>
        )}

        {estado === "publicada" && (
          <div key="publicada" style={{ animation: animacao }}>
            <PastilhaEstado estado="publicada" />
            <div
              style={{
                margin: "14px auto 0",
                maxWidth: "420px",
                fontFamily: "'Playfair Display', serif",
                fontSize: "21px",
                lineHeight: 1.4,
              }}
            >
              A folha está no ar.
            </div>
            <div
              style={{
                margin: "18px auto 0",
                maxWidth: "400px",
                boxSizing: "border-box",
                backgroundColor: "#FBF7EF",
                border: "1px solid var(--gold-light)",
                borderRadius: "12px",
                padding: "13px 16px",
                fontSize: "13.5px",
                fontWeight: "500",
                letterSpacing: "0.01em",
                wordBreak: "break-all",
              }}
            >
              {enderecoLimpo}
            </div>
            <button
              onClick={copiar}
              className="acao acao--ouro"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                marginTop: "14px",
                padding: "10px 18px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: "600",
              }}
            >
              {copiado ? (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 8.6l3.2 3.2L13 5" />
                </svg>
              ) : (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
                  <path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
                </svg>
              )}
              {copiado ? "Endereço copiado" : "Copiar endereço"}
            </button>
            <div style={{ margin: "26px auto 0", maxWidth: "420px", borderTop: "1px solid #F5ECD7", paddingTop: "20px" }}>
              <div style={{ fontSize: "13px" }}>
                <span style={{ fontWeight: "600", fontVariantNumeric: "tabular-nums" }}>{leituras}</span>{" "}
                {leituras === 1 ? "leitura" : "leituras"} até agora.
              </div>
              <p
                style={{
                  margin: "8px auto 0",
                  maxWidth: "380px",
                  fontSize: "11.5px",
                  fontStyle: "italic",
                  lineHeight: 1.6,
                  color: "var(--gray-mid)",
                  textWrap: "pretty",
                }}
              >
                Contam-se no total: a folha é pública e reencaminhável, e não se
                sabe quem a abriu nem quantas pessoas são.
              </p>
            </div>
            <div style={{ marginTop: "24px" }}>
              {retirarArmado ? (
                <button
                  onClick={retirar}
                  disabled={ocupado}
                  className="acao"
                  style={{
                    padding: "8px 14px",
                    border: "1px solid #FECACA",
                    borderRadius: "999px",
                    backgroundColor: "#FEF2F2",
                    color: "#DC2626",
                    fontSize: "12px",
                    fontWeight: "600",
                  }}
                >
                  Confirmar? A folha sai do ar.
                </button>
              ) : (
                <button
                  onClick={retirar}
                  disabled={ocupado}
                  className="acao dlm-retirar"
                  style={{
                    padding: "8px 14px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: "600",
                  }}
                >
                  Retirar a folha do ar
                </button>
              )}
            </div>
          </div>
        )}

        {estado === "retirada" && (
          <div key="retirada" style={{ animation: animacao }}>
            <PastilhaEstado estado="retirada" />
            <div
              style={{
                margin: "14px auto 0",
                maxWidth: "420px",
                fontFamily: "'Playfair Display', serif",
                fontSize: "21px",
                lineHeight: 1.4,
              }}
            >
              A folha deixou de estar no ar.
            </div>
            <p
              style={{
                margin: "16px auto 0",
                maxWidth: "430px",
                fontSize: "13px",
                lineHeight: 1.7,
                color: "var(--gray-mid)",
                textWrap: "pretty",
              }}
            >
              O endereço continua reservado a esta folha, mas quem o abrir agora
              encontra uma página da casa a dizer que não há nada para ler — sem
              nomes nem detalhes.
            </p>
            <p style={{ margin: "14px 0 0", fontSize: "12.5px", color: "var(--gray-mid)" }}>
              Foi aberta{" "}
              <span style={{ fontWeight: "600", fontVariantNumeric: "tabular-nums" }}>{leituras}</span>{" "}
              {leituras === 1 ? "vez" : "vezes"} enquanto esteve no ar.
            </p>
            <button
              onClick={publicar}
              disabled={ocupado}
              className="acao acao--cheia"
              style={{
                marginTop: "22px",
                padding: "12px 24px",
                borderRadius: "12px",
                fontSize: "13px",
                fontWeight: "600",
                boxShadow: "0 4px 12px rgba(201,168,76,0.30)",
              }}
            >
              Voltar a publicar
            </button>
            <p style={{ margin: "14px 0 0", fontSize: "11.5px", fontStyle: "italic", color: "var(--gray-mid)" }}>
              O mesmo endereço volta a abrir a folha.
            </p>
          </div>
        )}

        {erro && (
          <p role="alert" style={{ margin: "18px 0 0", fontSize: "12.5px", color: "#DC2626" }}>
            {erro}
          </p>
        )}
      </section>

      {/* A EXPEDIÇÃO — só depois de a folha ter endereço: escolher a quem
          se destina antes de haver o que mandar era pôr o carro à frente.
          A zona conta o que já está feito e dá o gesto seguinte, um só. */}
      {estado === "publicada" && (
        <section
          style={{
            marginTop: "18px",
            backgroundColor: "white",
            border: "1px solid #F0E6D0",
            borderRadius: "16px",
            padding: "22px 24px",
          }}
        >
          <div style={{ fontSize: "9.5px", fontWeight: "700", letterSpacing: "0.15em", color: "var(--gold-dark)" }}>
            A EXPEDIÇÃO
          </div>
          {comunicado.congelado_em ? (
            <>
              <p style={{ margin: "10px 0 0", fontSize: "13.5px", lineHeight: 1.6 }}>
                A lista está congelada{" "}
                <span style={{ color: "var(--gray-mid)" }}>
                  {quandoGuardada(comunicado.congelado_em).replace(/^guardada /, "")}
                </span>
                .
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "14px" }}>
                <button
                  onClick={onExpedicao}
                  className="acao acao--cheia"
                  style={{ padding: "11px 20px", borderRadius: "10px", fontSize: "12.5px", fontWeight: "600" }}
                >
                  Abrir a expedição →
                </button>
                <button
                  onClick={onPublico}
                  className="acao acao--neutra"
                  style={{ padding: "11px 16px", borderRadius: "10px", fontSize: "12.5px", fontWeight: "600" }}
                >
                  Ver o público
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={{ margin: "10px 0 0", fontSize: "13.5px", lineHeight: 1.6, color: "var(--gray-mid)" }}>
                Falta dizer a quem se destina. O recorte responde com a contagem
                antes de fixar seja o que for.
              </p>
              <button
                onClick={onPublico}
                className="acao acao--cheia"
                style={{ marginTop: "14px", padding: "11px 20px", borderRadius: "10px", fontSize: "12.5px", fontWeight: "600" }}
              >
                Escolher quem recebe →
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// O separador em si: lista → detalhe → editor por cima.
// ------------------------------------------------------------
export default function ComunicadosTab() {
  const [lista, setLista] = useState(null); // null = ainda a caminho
  const [erroLista, setErroLista] = useState("");
  const [aberto, setAberto] = useState(null); // a folha em detalhe
  const [emEdicao, setEmEdicao] = useState(null); // a folha no editor
  const [emMensagem, setEmMensagem] = useState(null); // a folha na mensagem
  const [aCriar, setACriar] = useState(false);
  // Dentro de uma folha aberta: detalhe → público (o recorte) → expedição
  // → e, desde a fase 3, o nascimento (uma folha acabada de nascer de um
  // molde). Estado, e não rota: o separador inteiro é uma vista só, e o
  // URL do admin já leva o separador. Voltar à lista repõe o detalhe.
  const [vista, setVista] = useState("detalhe");
  // De onde se abriu o público: o «voltar» do recorte regressa a quem o
  // chamou — o detalhe, ou o ecrã de nascimento de um molde.
  const [vistaMae, setVistaMae] = useState("detalhe");
  // Feitos | Moldes — os dois separadores internos da lista. Doze é o
  // que há na navegação e doze é o que fica: isto vive AQUI dentro.
  const [tab, setTab] = useState("feitos");
  // O nome do molde que deu origem à folha em nascimento — o ecrã da
  // frente irmã di-lo no cabeçalho.
  const [nomeMoldeUsado, setNomeMoldeUsado] = useState("");
  // A gaveta «Guardar como molde» e a banda de confirmação no detalhe.
  const [gavetaMolde, setGavetaMolde] = useState(false);
  const [moldeGuardado, setMoldeGuardado] = useState(null);

  // Em cadeia de promessas, não em async/await: todos os setState vivem
  // dentro de callbacks, e o efeito de arranque não corre nada síncrono.
  // O erro limpa-se QUANDO os dados chegam, não antes de tentar — um
  // recarregar falhado não pisca a mensagem.
  const carregar = () =>
    listarComunicados()
      .then((l) => {
        setLista(l);
        setErroLista("");
      })
      .catch((e) => {
        console.error(e);
        setErroLista("Não foi possível carregar os comunicados.");
        setLista((prev) => prev || []);
      });

  useEffect(() => {
    carregar();
  }, []);

  const abrir = (c) => {
    setAberto(c);
    setVista("detalhe");
    setVistaMae("detalhe");
    setMoldeGuardado(null);
    setGavetaMolde(false);
    // O que está em mão mostra-se já; as leituras frescas chegam logo a
    // seguir, sem esqueleto — o número acerta-se à frente dos olhos.
    getComunicado(c.id)
      .then(setAberto)
      .catch(() => {});
  };

  // Usar um molde: nasce um comunicado novo (folha + mensagem + regra,
  // sem endereço nem lista) e abre-se a vista de nascimento. Os erros
  // sobem — é o cartão do molde que os mostra, ao lado do gesto.
  const usarMolde = async (modelo) => {
    const novo = await nascerDeMolde(modelo);
    setLista((prev) => (prev ? [novo, ...prev] : [novo]));
    setNomeMoldeUsado(modelo.nome || "");
    setMoldeGuardado(null);
    setGavetaMolde(false);
    setAberto(novo);
    setVista("nascimento");
    setVistaMae("detalhe");
    return novo;
  };

  // A ligação «Ver →» da banda: da folha para a biblioteca de moldes.
  const irAosMoldes = () => {
    setAberto(null);
    setVista("detalhe");
    setMoldeGuardado(null);
    setTab("moldes");
    carregar();
  };

  const novo = async () => {
    if (aCriar) return;
    setACriar(true);
    setErroLista("");
    try {
      const rec = await criarComunicado();
      // A folha nasce e o editor abre logo — o primeiro gesto é escrever.
      setEmEdicao(rec);
    } catch (e) {
      console.error(e);
      setErroLista("Não foi possível criar o comunicado. Tente outra vez.");
    } finally {
      setACriar(false);
    }
  };

  // POR PUBLICAR primeiro (é onde há trabalho por acabar), depois as
  // publicadas, por fim as retiradas. Dentro de cada grupo, as mais
  // recentes primeiro — a ordem que a listagem já traz, e o sort é
  // estável, por isso preserva-a.
  const PESO = { "por publicar": 0, publicada: 1, retirada: 2 };
  const ordenados = lista
    ? [...lista].sort((a, b) => PESO[estadoDe(a)] - PESO[estadoDe(b)])
    : [];

  return (
    <motion.div
      key="tab-comunicados"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* A revelação entre estados do detalhe e as identidades que
          precisam de hover (regra da camada de interacção). */}
      <style>{`
        @keyframes dlm-com-revelar {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: none; }
        }
        .dlm-retirar {
          border: none;
          background-color: transparent;
          color: var(--gray-mid);
        }
        .dlm-retirar:hover:not(:disabled) {
          color: #DC2626;
          background-color: #FEF2F2;
        }
        .dlm-cartao-com {
          background-color: #fff;
          border: 1px solid #F0E6D0;
        }
        .dlm-cartao-com:hover {
          border-color: var(--gold-light);
          box-shadow: 0 2px 12px rgba(0,0,0,0.05);
        }
        .dlm-tab-com:hover:not(.dlm-tab-com--activa) {
          color: var(--charcoal);
        }
      `}</style>

      {aberto && vista === "publico" ? (
        <ComunicadoRecorte
          key={`recorte-${aberto.id}`}
          comunicado={aberto}
          onVoltar={() => setVista(vistaMae)}
          onMudou={setAberto}
          onAbrirExpedicao={() => setVista("expedicao")}
        />
      ) : aberto && vista === "expedicao" ? (
        <ComunicadoExpedicao
          key={`expedicao-${aberto.id}`}
          comunicado={aberto}
          onVoltar={() => setVista("detalhe")}
          onMensagem={() => setEmMensagem(aberto)}
        />
      ) : aberto && vista === "nascimento" ? (
        // A folha acabada de nascer de um molde — o ecrã é da frente
        // irmã; este separador só lhe dá a folha e as portas.
        <ComunicadoDeMolde
          key={`nascimento-${aberto.id}`}
          comunicado={aberto}
          nomeMolde={nomeMoldeUsado}
          onVoltar={() => {
            setAberto(null);
            setVista("detalhe");
            setVistaMae("detalhe");
            setTab("moldes");
            carregar();
          }}
          onMudou={setAberto}
          onAbrirEditor={() => setEmEdicao(aberto)}
          onAbrirMensagem={() => setEmMensagem(aberto)}
          onAbrirPublico={() => {
            setVistaMae("nascimento");
            setVista("publico");
          }}
          onIrAoDetalhe={() => {
            setVista("detalhe");
            setVistaMae("detalhe");
          }}
        />
      ) : aberto ? (
        <DetalheComunicado
          key={aberto.id}
          comunicado={aberto}
          onVoltar={() => {
            setAberto(null);
            setVista("detalhe");
            setVistaMae("detalhe");
            setMoldeGuardado(null);
            carregar();
          }}
          onEditar={() => setEmEdicao(aberto)}
          onMensagem={() => setEmMensagem(aberto)}
          onPublico={() => {
            setVistaMae("detalhe");
            setVista("publico");
          }}
          onExpedicao={() => setVista("expedicao")}
          onMudou={setAberto}
          onGuardarMolde={() => setGavetaMolde(true)}
          moldeGuardado={moldeGuardado}
          onVerMoldes={irAosMoldes}
        />
      ) : (
        <>
          {/* Feitos | Moldes — tabs de texto com underline dourado no
              activo (o padrão do desenho da biblioteca), não a pastilha
              deslizante: são vistas irmãs, não um filtro. */}
          <div style={{ maxWidth: "640px" }}>
            <div style={{ fontSize: "9.5px", fontWeight: "700", letterSpacing: "0.15em", color: "var(--gold-dark)" }}>
              COMUNICADOS
            </div>
            <div
              role="tablist"
              aria-label="Feitos ou moldes"
              style={{
                display: "flex",
                gap: "22px",
                marginTop: "12px",
                marginBottom: "22px",
                borderBottom: "1px solid #F0E6D0",
              }}
            >
              {[
                ["feitos", "Feitos"],
                ["moldes", "Moldes"],
              ].map(([id, nome]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`acao dlm-tab-com${tab === id ? " dlm-tab-com--activa" : ""}`}
                  style={{
                    padding: "0 0 11px",
                    border: "none",
                    borderBottom: tab === id ? "2px solid var(--gold)" : "2px solid transparent",
                    borderRadius: 0,
                    background: "transparent",
                    fontSize: "13.5px",
                    fontWeight: "600",
                    color: tab === id ? "var(--charcoal)" : "var(--gray-mid)",
                  }}
                >
                  {nome}
                </button>
              ))}
            </div>
          </div>

          {tab === "moldes" ? (
            <ComunicadoModelos onUsar={usarMolde} onIrAosFeitos={() => setTab("feitos")} />
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "16px",
                  maxWidth: "640px",
                }}
              >
                <div>
                  <h2
                    style={{
                      fontSize: "22px",
                      fontFamily: "Playfair Display, serif",
                      color: "var(--charcoal)",
                      margin: "0 0 4px 0",
                    }}
                  >
                    Comunicados
                  </h2>
                  <p
                    style={{
                      fontSize: "13px",
                      color: "var(--gray-mid)",
                      margin: "0 0 20px 0",
                      lineHeight: 1.6,
                      maxWidth: "480px",
                    }}
                  >
                    Folhas públicas com endereço próprio — escrevem-se uma vez e
                    chegam a muitos: o espaço, a wedding planner, os fornecedores.
                    Publicar dá o endereço; retirar tira a folha do ar.
                  </p>
                </div>
                <button
                  onClick={novo}
                  disabled={aCriar}
                  className="acao acao--ouro"
                  style={{
                    flexShrink: 0,
                    padding: "9px 16px",
                    borderRadius: "999px",
                    fontSize: "12.5px",
                    fontWeight: "600",
                  }}
                >
                  + Novo comunicado
                </button>
              </div>

              {erroLista && (
                <p role="alert" style={{ maxWidth: "640px", fontSize: "12.5px", color: "#DC2626", margin: "0 0 14px" }}>
                  {erroLista}{" "}
                  <button
                    onClick={carregar}
                    className="ligacao"
                    style={{ fontSize: "12.5px", color: "var(--gold-dark)", textDecoration: "underline" }}
                  >
                    Tentar de novo
                  </button>
                </p>
              )}

              {lista === null && (
                <div style={{ maxWidth: "640px" }}>
                  {[0, 1, 2].map((i) => (
                    <Esqueleto key={i} h={68} r={12} style={{ marginBottom: "12px" }} />
                  ))}
                </div>
              )}

              {lista !== null && ordenados.length === 0 && !erroLista && (
                <div style={{ maxWidth: "640px" }}>
                  <Convite
                    titulo="Nenhuma folha, por enquanto."
                    texto="Um comunicado é uma folha pública com endereço próprio — escreve-se uma vez, publica-se, e o endereço passa de mão em mão até chegar a quem precisa de o ler."
                    accao="Escrever a primeira folha"
                    onAccao={novo}
                  />
                </div>
              )}

              {lista !== null && ordenados.length > 0 && (
                <div style={{ maxWidth: "640px" }}>
                  {ordenados.map((c) => {
                    const estado = estadoDe(c);
                    return (
                      <button
                        key={c.id}
                        onClick={() => abrir(c)}
                        className="acao dlm-cartao-com"
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          boxSizing: "border-box",
                          borderRadius: "12px",
                          padding: "14px 16px",
                          marginBottom: "12px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "baseline",
                            justifyContent: "space-between",
                            gap: "12px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "14.5px",
                              fontWeight: c.titulo?.trim() ? "600" : "400",
                              color: c.titulo?.trim() ? "var(--charcoal)" : "#9B9B9B",
                              fontStyle: c.titulo?.trim() ? "normal" : "italic",
                              overflow: "hidden",
                              whiteSpace: "nowrap",
                              textOverflow: "ellipsis",
                              minWidth: 0,
                            }}
                          >
                            {c.titulo?.trim() || "Sem título, por enquanto"}
                          </span>
                          <PastilhaEstado estado={estado} />
                        </div>
                        <div style={{ marginTop: "5px", fontSize: "12px", color: "var(--gray-mid)" }}>
                          {estado === "publicada" && (
                            <>{plural(c.n_acessos || 0, "1 leitura", "leituras")} · </>
                          )}
                          guardada {quandoGuardada(c.actualizado_em)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* A gaveta «Guardar como molde» vive ao nível do separador: o
          detalhe abre-a, mas é aqui que a banda de confirmação nasce.
          Montada sempre que há folha aberta, para a folha deslizar
          (320ms) em vez de aparecer. */}
      {aberto && (
        <GuardarComoMolde
          comunicado={aberto}
          aberta={gavetaMolde}
          onFechar={() => setGavetaMolde(false)}
          onGuardado={(m) => {
            setGavetaMolde(false);
            setMoldeGuardado(m);
          }}
        />
      )}

      {emEdicao && (
        <ComunicadoEditor
          comunicado={emEdicao}
          onFechar={() => {
            // Fechar sem guardar: a folha fica como estava; a lista
            // refresca porque uma folha acabada de criar já lá vive.
            setEmEdicao(null);
            carregar();
          }}
          onGuardado={(rec) => {
            // Guardar fecha PARA O DETALHE — o gesto seguinte natural é
            // publicar, e é lá que ele mora.
            setEmEdicao(null);
            setAberto(rec);
            carregar();
          }}
        />
      )}

      {emMensagem && (
        <MensagemEditor
          comunicado={emMensagem}
          onFechar={() => setEmMensagem(null)}
          onGuardado={(rec) => {
            // A mensagem guardada volta ao detalhe com o registo fresco
            // — a expedição vai lê-la de lá.
            setEmMensagem(null);
            setAberto(rec);
            carregar();
          }}
        />
      )}
    </motion.div>
  );
}
