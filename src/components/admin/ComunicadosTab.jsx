import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  listarComunicados,
  getComunicado,
  apagarComunicado,
  publicarComunicado,
  retirarComunicado,
  enderecoDoComunicado,
  listarDestinatarios,
  linhasActivas,
  listarModelos,
  prepararDeModelo,
  rotuloDaRegra,
} from "../../lib/comunicados";
import { supabase } from "../../lib/supabase";
import { getEventTypes } from "../../lib/invites";
import { Convite, Esqueleto } from "./acabamento";
import { diaDito } from "./comunicadoTempo";
import ComunicadoEditor from "./ComunicadoEditor";
import MensagemEditor from "./MensagemEditor";
import ComunicadoRecorte from "./ComunicadoRecorte";
import ComunicadoExpedicao from "./ComunicadoExpedicao";
import ComunicadoModelos from "./ComunicadoModelos";
import GuardarComoMolde from "./GuardarComoMolde";

// ============================================================
// ComunicadosTab — as folhas públicas da casa, no separador Gestão
// (slug visível: envios).
//
// A Fase B arrumou o detalhe num PERCURSO de quatro passos — 1 A folha,
// 2 Publicar, 3 Quem recebe, 4 Enviar — momento a momento como o mockup
// aprovado. Os cartões activos de cada passo são os de sempre (mesmas
// frases e botões); as peças novas são exactamente três: a pílula de
// passo com visto (base: o indicador do Importar), a secção dormente e
// a secção-resumo de passo feito.
//
// O estado da secção vive no URL, pelo precedente dos Documentos:
// /admin/envios/:p1/:p2 — p1='modelos' abre a bancada, p1=UUID abre o
// percurso desse comunicado, p2 ∈ {'quem-recebe','enviar'} abre o
// passo; um id inválido devolve à lista. As sobreposições (editor da
// folha, mensagem, gaveta de modelo) ficam FORA do URL, como em todo o
// backoffice; o rascunho em memória (zero ou de modelo) não tem rota
// porque não tem id.
//
// A pastilha de leituras conta o TOTAL e só o total: a folha é
// pública e reencaminhável, e nunca se sabe quem a abriu — a
// interface diz isto por extenso, porque um número sem essa nota
// parecia prometer o que os dados não têm.
// ============================================================

const estadoDe = (c) =>
  c.retirado_em ? "retirada" : c.publicado_em ? "publicada" : "por publicar";

// Um id de comunicado é um UUID — é assim que a rota o distingue da
// bancada ('modelos') e de lixo no URL.
const EH_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// Números por extenso até dez, nos dois géneros — «Sete conversas à
// espera», «Dois blocos pedem revisão». Acima de dez, o algarismo é
// mais honesto que uma tabela infinita (a regra da expedição).
const EXTENSO_F = ["zero", "uma", "duas", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];
const EXTENSO_M = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];
const extensoF = (n) => EXTENSO_F[n] ?? String(n);
const extensoM = (n) => EXTENSO_M[n] ?? String(n);
const maiuscula = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const minusculaInicial = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

// ------------------------------------------------------------
// A pastilha de estado — o anel cinzento para o que não está no ar,
// o visto dourado para o que está. Vive na LISTA (o percurso conta o
// estado nas pílulas de passo, não numa pastilha).
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
// As roupas do percurso — as do mockup da Fase B, ao pixel.
// ------------------------------------------------------------
const OVERLINE = {
  fontSize: "9.5px",
  fontWeight: "700",
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  color: "var(--gold-dark)",
};

const SECCAO = {
  backgroundColor: "white",
  border: "1px solid #F0E6D0",
  borderRadius: "12px",
  padding: "18px 22px",
  marginTop: "14px",
};

const SECCAO_CENTRAL = {
  backgroundColor: "white",
  border: "1.5px solid var(--gold-light)",
  borderRadius: "16px",
  padding: "26px 26px 24px",
  marginTop: "14px",
  textAlign: "center",
  boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
};

const SECCAO_DORMENTE = {
  ...SECCAO,
  backgroundColor: "#FDFBF5",
  borderStyle: "dashed",
};

const LINHA_META = {
  margin: "6px 0 0",
  fontSize: "12.5px",
  color: "var(--gray-mid)",
  lineHeight: 1.6,
};

const NOTA_DORMENTE = {
  margin: "6px 0 0",
  fontSize: "12.5px",
  fontStyle: "italic",
  color: "#9B9B9B",
  lineHeight: 1.6,
};

const FRASE_CENTRAL = {
  margin: "14px auto 0",
  maxWidth: "420px",
  fontFamily: "'Playfair Display', serif",
  fontSize: "21px",
  lineHeight: 1.4,
  textWrap: "balance",
};

// A pastilha «a rever» — a mesma pele das marcas da casa (editor, 081).
const PASTILHA_REVER = {
  display: "inline-block",
  fontSize: "9.5px",
  fontWeight: "700",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--gold-dark)",
  backgroundColor: "#FEF9EC",
  border: "1px solid var(--gold-light)",
  borderRadius: "999px",
  padding: "2px 8px",
  whiteSpace: "nowrap",
};

const LIG = {
  fontSize: "12.5px",
  color: "var(--gold-dark)",
  textDecoration: "underline",
  textDecorationColor: "var(--gold-light)",
  textUnderlineOffset: "3px",
};

// A ligação dourada sublinhada — a mesma identidade em todas as secções.
function Lig({ onClick, children }) {
  return (
    <button onClick={onClick} className="ligacao" style={LIG}>
      {children}
    </button>
  );
}

// ------------------------------------------------------------
// PilulasDoPercurso — o padrão do indicador de passos do Importar
// (10px/600/0.06em, cápsula com filete), com o visto «feito»
// acrescentado: uma das três peças novas da Fase B assumidas por
// escrito. Três estados + o esmaecido da retirada (as pílulas congelam
// como estavam — nenhum visto se finge apagado).
// ------------------------------------------------------------
function PilulasDoPercurso({ passos }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", margin: "18px 0 8px" }}>
      {passos.map((p) => (
        <span
          key={p.nome}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "10px",
            fontWeight: "600",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            padding: "5px 12px",
            borderRadius: "999px",
            whiteSpace: "nowrap",
            border: `1.5px solid ${p.feito ? "var(--gold-light)" : p.activa ? "var(--gold)" : "#E8DCC0"}`,
            color: p.feito ? "var(--gold-dark)" : p.activa ? "var(--charcoal)" : "#9B9B9B",
            backgroundColor: p.feito ? "#FEF9EC" : p.activa ? "#FBF7EF" : "white",
            opacity: p.esmaecida ? 0.45 : 1,
          }}
        >
          {p.feito && (
            <span aria-hidden="true" style={{ fontWeight: "700" }}>
              ✓
            </span>
          )}
          {p.nome}
        </span>
      ))}
    </div>
  );
}

// O excerto de um bloco para a linha «a rever» do passo 1 — o campo
// onde uma data pode viver em cada tipo (a regra do nascimento antigo).
const resumoDoBloco = (b) => {
  const texto =
    b.tipo === "imagem"
      ? b.legenda || ""
      : b.tipo === "chamada"
        ? b.rotulo || ""
        : b.texto || b.rotulo || "";
  const linha = texto.trim().split("\n")[0];
  return linha.length > 48 ? `${linha.slice(0, 48).trimEnd()}…` : linha;
};

// ------------------------------------------------------------
// O PERCURSO — o antigo detalhe, arrumado em quatro passos pela ordem
// do envio. Vive num componente próprio (com key pelo id) para o estado
// do gesto — copiar, armar o retirar, a revelação — nascer limpo de
// cada vez que outra folha abre.
//
// Os estados DERIVAM dos dados que já existem: blocos (e as marcas
// rever), publicado_em/retirado_em, congelado_em, e os carimbos
// enviado_em dos destinatários — que se carregam AQUI, numa ida só
// (listarDestinatarios, a mesma da expedição), quando há lista fechada.
// ------------------------------------------------------------
function PercursoComunicado({
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
  const retirada = estado === "retirada";

  // A revelação entre estados só anima DEPOIS de um acto (publicar,
  // retirar): a chegada ao ecrã não é um acontecimento, o acto é.
  const [animar, setAnimar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [retirarArmado, setRetirarArmado] = useState(false);
  // O passo 2 feito mostra-se em resumo; «Ver o endereço» abre-o por
  // inteiro (endereço, copiar, leituras, retirar) para o resto da visita.
  const [enderecoAberto, setEnderecoAberto] = useState(false);
  const timerCopiado = useRef(null);

  // Os destinatários, guardados COM a chave a que pertencem (id + fecho)
  // — o «a caminho» DERIVA-SE de a chave actual ainda não ter resposta,
  // em vez de um reset síncrono no efeito (regra de lint da casa; o
  // padrão da contagem do nascimento antigo). Sem lista fechada não há
  // o que ir buscar; se a ida falhar, fica «não veio», nunca zero a mentir.
  const chaveLinhas = `${comunicado.id}|${comunicado.congelado_em || ""}`;
  const [linhasInfo, setLinhasInfo] = useState({ para: null, linhas: null });
  useEffect(() => {
    if (!comunicado.congelado_em) return undefined;
    const chave = `${comunicado.id}|${comunicado.congelado_em || ""}`;
    let vivo = true;
    listarDestinatarios(comunicado.id)
      .then((ls) => {
        if (vivo) setLinhasInfo({ para: chave, linhas: ls });
      })
      .catch((e) => console.error(e));
    return () => {
      vivo = false;
    };
  }, [comunicado.id, comunicado.congelado_em]);
  // null = a caminho (ou a ida falhou); [] quando não há lista fechada.
  const linhas = !comunicado.congelado_em
    ? []
    : linhasInfo.para === chaveLinhas
      ? linhasInfo.linhas
      : null;

  // O nome do modelo de origem, para a banda «Nascida do modelo …».
  // Ida directa (precedente da casa: componentes com uma pergunta só);
  // um modelo entretanto apagado deixa a banda em branco, sem drama.
  // Sem modelo_id o efeito não corre e o nome fica vazio — o componente
  // tem key pelo id da folha, nasce limpo de cada vez.
  const [nomeModelo, setNomeModelo] = useState("");
  useEffect(() => {
    if (!comunicado.modelo_id) return undefined;
    let vivo = true;
    supabase
      .from("comunicado_modelos")
      .select("nome")
      .eq("id", comunicado.modelo_id)
      .limit(1)
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) {
          console.error(error);
          return;
        }
        setNomeModelo(data && data.length ? data[0].nome || "" : "");
      });
    return () => {
      vivo = false;
    };
  }, [comunicado.modelo_id]);

  // Os tipos de evento — só para o rótulo da regra pré-carregada do
  // modelo («todos os contactos», «casamentos por vir») no passo 3.
  const precisaTipos = Boolean(comunicado.publico && !comunicado.congelado_em);
  const [tipos, setTipos] = useState([]);
  useEffect(() => {
    if (!precisaTipos) return undefined;
    let vivo = true;
    getEventTypes()
      .then((ts) => {
        if (vivo) setTipos(ts || []);
      })
      .catch((e) => console.error(e));
    return () => {
      vivo = false;
    };
  }, [precisaTipos]);

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

  const blocos = Array.isArray(comunicado.blocos) ? comunicado.blocos : [];
  const nBlocos = blocos.length;
  const blocosRever = blocos.filter((b) => b.rever);
  const leituras = comunicado.n_acessos || 0;
  const enderecoLimpo = comunicado.token
    ? enderecoDoComunicado(comunicado.token).replace(/^https?:\/\//, "")
    : "";
  const mensagemEscrita = Boolean((comunicado.mensagem || "").trim());

  // As contagens do passo 4 — as MESMAS derivações da expedição:
  // activas sem dispensa, com número, com carimbo de saída.
  const activas = Array.isArray(linhas) ? linhasActivas(linhas) : null;
  const comNumero = activas ? activas.filter((l) => l.telefone) : null;
  const enviadas = activas ? activas.filter((l) => l.enviado_em) : null;
  const porSair = comNumero ? comNumero.filter((l) => !l.enviado_em) : null;
  const ultimaEnviada =
    enviadas && enviadas.length
      ? enviadas.reduce((a, b) => (a.enviado_em > b.enviado_em ? a : b))
      : null;

  // Os quatro passos, derivados — nada se guarda que já não exista.
  const passo1Feito = nBlocos > 0 && blocosRever.length === 0;
  const passo2Feito = estado === "publicada";
  const passo3Feito = Boolean(comunicado.congelado_em);
  const passo4Feito =
    passo3Feito && Array.isArray(porSair) && porSair.length === 0 && enviadas.length > 0;
  const concluido = passo4Feito && !retirada;

  // O passo activo é o primeiro por fazer; a retirada prende-o no 2
  // (é lá que a folha volta ao ar) e congela o resto como estava.
  const activaIdx = retirada ? 1 : !passo1Feito ? 0 : !passo2Feito ? 1 : !passo3Feito ? 2 : 3;

  const passos = ["1 · A folha", "2 · Publicar", "3 · Quem recebe", "4 · Enviar"].map(
    (nome, i) => {
      const feito = [passo1Feito, passo2Feito, passo3Feito, passo4Feito][i];
      return {
        nome,
        feito,
        activa: !feito && i === activaIdx,
        esmaecida: retirada && i !== 1,
      };
    },
  );

  const animacao =
    animar && !reduzido
      ? "dlm-com-revelar 480ms cubic-bezier(0.22, 1, 0.36, 1) both"
      : "none";

  // A linha da mensagem — SEMPRE editável, desde o primeiro momento;
  // são os envios que esperam pela lista, não a escrita.
  const excertoMensagem = (() => {
    const m = (comunicado.mensagem || "").trim().split("\n")[0];
    return m.length > 36 ? `${m.slice(0, 36).trimEnd()}…` : m;
  })();
  const linhaMensagem = mensagemEscrita ? (
    <p style={LINHA_META}>
      {comunicado.modelo_id ? (
        <>
          A mensagem veio do modelo: <span style={{ fontStyle: "italic" }}>«{excertoMensagem}»</span>
        </>
      ) : (
        <>A mensagem que acompanha o endereço está escrita.</>
      )}{" "}
      · <Lig onClick={onMensagem}>Editar a mensagem</Lig>
    </p>
  ) : (
    <p style={LINHA_META}>
      A mensagem que acompanha o endereço ainda está por escrever — é ela que leva o
      endereço. <Lig onClick={onMensagem}>Escrever a mensagem</Lig>
    </p>
  );

  const rotuloRegra = precisaTipos
    ? minusculaInicial(rotuloDaRegra(comunicado.publico, tipos) || "")
    : "";

  // O conteúdo por inteiro do passo 2 publicado — o cartão de hoje,
  // arrumado dentro da sua secção (endereço, copiar, leituras, retirar).
  const passo2Aberto = (
    <>
      <div
        style={{
          margin: "12px 0 0",
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
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "12px", marginTop: "12px" }}>
        <button
          onClick={copiar}
          className="acao acao--ouro"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
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
        <span style={{ fontSize: "12.5px", color: "var(--gray-mid)" }}>
          <span style={{ fontWeight: "600", fontVariantNumeric: "tabular-nums" }}>{leituras}</span>{" "}
          {leituras === 1 ? "leitura" : "leituras"} até agora.
        </span>
      </div>
      <p
        style={{
          margin: "10px 0 0",
          maxWidth: "420px",
          fontSize: "11.5px",
          fontStyle: "italic",
          lineHeight: 1.6,
          color: "var(--gray-mid)",
          textWrap: "pretty",
        }}
      >
        Contam-se no total: a folha é pública e reencaminhável, e não se sabe quem a
        abriu nem quantas pessoas são.
      </p>
      <div style={{ marginTop: "14px" }}>
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
    </>
  );

  return (
    <div style={{ maxWidth: "720px" }}>
      <button
        onClick={onVoltar}
        className="ligacao"
        style={{ fontSize: "12.5px", color: "var(--gray-mid)", marginBottom: "18px" }}
      >
        ← Envios
      </button>

      <div style={OVERLINE}>COMUNICADO</div>
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

      {/* A retirada suspende o percurso — a faixa transversal di-lo antes
          das pílulas, e nenhum visto se finge apagado. */}
      {retirada && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: "#F4F4F2",
            border: "1px solid #D9D9D4",
            borderRadius: "10px",
            padding: "9px 14px",
            margin: "16px 0 0",
            fontSize: "12.5px",
            color: "#6B7280",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              border: "1.5px solid #9B9B9B",
              boxSizing: "border-box",
              flexShrink: 0,
            }}
          />
          A folha saiu do ar — o percurso está suspenso. O endereço fica reservado.
        </div>
      )}

      {/* A proveniência de um comunicado nascido de modelo. */}
      {nomeModelo && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginTop: "16px",
            backgroundColor: "#FEF9EC",
            border: "1px solid var(--gold-light)",
            borderRadius: "10px",
            padding: "10px 14px",
            fontSize: "13px",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0 }}>
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
          <span style={{ minWidth: 0 }}>
            Nascida do modelo <span style={{ fontWeight: "600" }}>{nomeModelo}</span>
            {comunicado.publico && !comunicado.congelado_em
              ? " — quem recebe já veio pré-escolhido."
              : "."}
          </span>
        </div>
      )}

      {/* A banda que confirma o modelo guardado e diz ONDE ele mora —
          com a ligação directa para a biblioteca. */}
      {moldeGuardado && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginTop: "16px",
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
              Modelo guardado: {moldeGuardado.nome}
            </div>
            <div style={{ fontSize: "11.5px", color: "var(--gray-mid)", marginTop: "2px" }}>
              Fica em Envios · Modelos.
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

      <PilulasDoPercurso passos={passos} />

      {/* ===== 1 · A FOLHA ===== */}
      {blocosRever.length > 0 && !retirada ? (
        <section style={SECCAO_CENTRAL}>
          <div style={OVERLINE}>1 · A folha</div>
          <div style={FRASE_CENTRAL}>
            {blocosRever.length === 1
              ? "Um bloco pede revisão."
              : `${maiuscula(extensoM(blocosRever.length))} blocos pedem revisão.`}
          </div>
          {blocosRever.map((b) => (
            <p key={b.id} style={{ ...LINHA_META, margin: "10px auto 0", maxWidth: "460px" }}>
              <span style={PASTILHA_REVER}>a rever</span> «{resumoDoBloco(b)}»
              {b.pergunta ? ` — ${b.pergunta}` : ""}
            </p>
          ))}
          <button
            onClick={onEditar}
            className="acao acao--cheia"
            style={{
              marginTop: "20px",
              padding: "13px 28px",
              borderRadius: "12px",
              fontSize: "13.5px",
              fontWeight: "600",
              boxShadow: "0 4px 12px rgba(201,168,76,0.30)",
            }}
          >
            Rever a folha
          </button>
        </section>
      ) : (
        <section style={SECCAO}>
          <div style={OVERLINE}>1 · A folha</div>
          <p style={LINHA_META}>
            {plural(nBlocos, "1 bloco", "blocos")} · guardada{" "}
            {quandoGuardada(comunicado.actualizado_em)} ·{" "}
            <Lig onClick={onEditar}>Editar a folha</Lig>
          </p>
        </section>
      )}

      {/* ===== 2 · PUBLICAR ===== */}
      {retirada ? (
        <section style={SECCAO_CENTRAL}>
          <div key="retirada" style={{ animation: animacao }}>
            <div style={OVERLINE}>2 · Publicar</div>
            <div style={FRASE_CENTRAL}>A folha deixou de estar no ar.</div>
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
        </section>
      ) : estado === "por publicar" ? (
        activaIdx === 0 ? (
          <section style={SECCAO_DORMENTE}>
            <div style={{ ...OVERLINE, color: "#B9A97E" }}>2 · Publicar</div>
            <p style={NOTA_DORMENTE}>Abre com a folha revista e guardada.</p>
          </section>
        ) : (
          <section style={SECCAO_CENTRAL}>
            <div key="por-publicar" style={{ animation: animacao }}>
              <div style={OVERLINE}>2 · Publicar</div>
              <div style={FRASE_CENTRAL}>A folha está pronta; falta dar-lhe um endereço.</div>
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
          </section>
        )
      ) : (
        <section style={SECCAO}>
          <div key="publicada" style={{ animation: animacao }}>
            <div style={OVERLINE}>2 · Publicar</div>
            {activaIdx === 2 || enderecoAberto ? (
              passo2Aberto
            ) : (
              <p style={LINHA_META}>
                No ar · {plural(leituras, "1 leitura", "leituras")} ·{" "}
                <Lig onClick={() => setEnderecoAberto(true)}>Ver o endereço</Lig>
              </p>
            )}
          </div>
        </section>
      )}

      {erro && (
        <p role="alert" style={{ margin: "12px 0 0", fontSize: "12.5px", color: "#DC2626" }}>
          {erro}
        </p>
      )}

      {/* ===== 3 · QUEM RECEBE ===== */}
      {passo3Feito ? (
        <section style={SECCAO}>
          <div style={OVERLINE}>3 · Quem recebe</div>
          <p style={LINHA_META}>
            Lista fechada {diaDito(comunicado.congelado_em)}
            {activas !== null && <> · {plural(activas.length, "1 nome", "nomes")}</>} ·{" "}
            <Lig onClick={onPublico}>Ver quem recebe</Lig>
          </p>
        </section>
      ) : estado === "publicada" && !retirada ? (
        <section style={SECCAO_CENTRAL}>
          <div style={OVERLINE}>3 · Quem recebe</div>
          <div style={FRASE_CENTRAL}>Falta dizer a quem se destina.</div>
          <p
            style={{
              margin: "12px auto 0",
              maxWidth: "420px",
              fontSize: "13px",
              lineHeight: 1.7,
              color: "var(--gray-mid)",
              textWrap: "pretty",
            }}
          >
            O recorte responde com a contagem antes de fixar seja o que for.
          </p>
          <button
            onClick={onPublico}
            className="acao acao--cheia"
            style={{
              marginTop: "18px",
              padding: "11px 20px",
              borderRadius: "10px",
              fontSize: "12.5px",
              fontWeight: "600",
            }}
          >
            Escolher quem recebe →
          </button>
        </section>
      ) : comunicado.publico ? (
        <section style={SECCAO}>
          <div style={OVERLINE}>3 · Quem recebe</div>
          <p style={LINHA_META}>
            A regra do modelo: <span style={{ fontWeight: "600" }}>{rotuloRegra || "…"}</span> —
            a lista conta-se ao fechar, de novo.
          </p>
        </section>
      ) : (
        <section style={SECCAO_DORMENTE}>
          <div style={{ ...OVERLINE, color: "#B9A97E" }}>3 · Quem recebe</div>
          <p style={NOTA_DORMENTE}>
            {retirada ? "Abre quando a folha voltar ao ar." : "Abre quando a folha tiver endereço."}
          </p>
        </section>
      )}

      {/* ===== 4 · ENVIAR ===== */}
      {concluido ? (
        <section style={SECCAO_CENTRAL}>
          <div style={OVERLINE}>4 · Enviar</div>
          <div style={FRASE_CENTRAL}>
            {enviadas.length === 1
              ? "A conversa saiu."
              : `As ${extensoF(enviadas.length)} conversas saíram.`}
          </div>
          <p style={{ ...LINHA_META, margin: "10px auto 0", maxWidth: "420px" }}>
            {enviadas.length === 1 ? "Enviada" : "Enviadas"}{" "}
            {diaDito(ultimaEnviada?.enviado_em)} ·{" "}
            <Lig onClick={onExpedicao}>Ver os envios</Lig>
          </p>
          {!comunicado.modelo_id && (
            <button
              onClick={onGuardarMolde}
              className="acao acao--ouro"
              style={{
                marginTop: "16px",
                padding: "9px 18px",
                borderRadius: "999px",
                fontSize: "12.5px",
                fontWeight: "600",
              }}
            >
              Guardar como modelo
            </button>
          )}
        </section>
      ) : retirada ? (
        <section style={SECCAO}>
          <div style={OVERLINE}>4 · Enviar</div>
          {passo3Feito ? (
            <p style={LINHA_META}>
              {enviadas === null ? (
                <Esqueleto w={110} h={10} style={{ display: "inline-block", verticalAlign: "middle" }} />
              ) : enviadas.length > 0 ? (
                <>
                  {enviadas.length === 1 ? "Enviada" : "Enviadas"}{" "}
                  {diaDito(ultimaEnviada?.enviado_em)}
                </>
              ) : (
                "Nenhuma mensagem saiu ainda."
              )}{" "}
              · <Lig onClick={onExpedicao}>Ver os envios</Lig>
            </p>
          ) : (
            <>
              {linhaMensagem}
              <p style={NOTA_DORMENTE}>Os envios abrem com a lista fechada.</p>
            </>
          )}
        </section>
      ) : passo3Feito ? (
        <section style={SECCAO_CENTRAL}>
          <div style={OVERLINE}>4 · Enviar</div>
          {activas === null ? (
            <>
              <Esqueleto h={22} r={8} style={{ maxWidth: "260px", margin: "14px auto 0" }} />
              <Esqueleto h={40} r={12} style={{ maxWidth: "180px", margin: "16px auto 0" }} />
            </>
          ) : (
            <>
              <div style={FRASE_CENTRAL}>
                {porSair.length === 1
                  ? "Uma conversa à espera."
                  : `${maiuscula(extensoF(porSair.length))} conversas à espera.`}
              </div>
              {enviadas.length > 0 && (
                <p style={{ ...LINHA_META, margin: "8px auto 0", maxWidth: "420px" }}>
                  {enviadas.length} de {comNumero.length} enviadas.
                </p>
              )}
              {mensagemEscrita ? (
                <>
                  <p style={{ ...LINHA_META, margin: "8px auto 14px", maxWidth: "420px" }}>
                    <Lig onClick={onMensagem}>Editar a mensagem</Lig>
                  </p>
                  <button
                    onClick={onExpedicao}
                    className="acao acao--cheia"
                    style={{
                      padding: "13px 28px",
                      borderRadius: "12px",
                      fontSize: "13.5px",
                      fontWeight: "600",
                      boxShadow: "0 4px 12px rgba(201,168,76,0.30)",
                    }}
                  >
                    Enviar →
                  </button>
                </>
              ) : (
                <>
                  <p style={{ ...LINHA_META, margin: "8px auto 14px", maxWidth: "420px" }}>
                    Falta a mensagem que acompanha o endereço.{" "}
                    <Lig onClick={onMensagem}>Escrever a mensagem</Lig>
                  </p>
                  {/* O Enviar inerte — presente mas apagado: o percurso
                      mostra o gesto e diz o que lhe falta. */}
                  <button
                    disabled
                    className="acao"
                    style={{
                      padding: "13px 28px",
                      border: "none",
                      borderRadius: "12px",
                      fontSize: "13.5px",
                      fontWeight: "600",
                      backgroundColor: "#E8DCC0",
                      color: "#B0A68E",
                      cursor: "default",
                    }}
                  >
                    Enviar →
                  </button>
                  <p style={{ ...NOTA_DORMENTE, margin: "10px 0 0" }}>
                    O Enviar acende com a mensagem escrita.
                  </p>
                </>
              )}
            </>
          )}
        </section>
      ) : (
        <section style={SECCAO}>
          <div style={OVERLINE}>4 · Enviar</div>
          {linhaMensagem}
          <p style={NOTA_DORMENTE}>Os envios abrem com a lista fechada.</p>
        </section>
      )}

      {/* A porta para os modelos — o peso discreto de sempre; no
          concluído sobe para o balanço, e um comunicado que JÁ nasceu
          de um modelo não volta a guardar-se (decisão registada). */}
      {!retirada && !concluido && !comunicado.modelo_id && (
        <p style={{ margin: "16px 0 0" }}>
          <Lig onClick={onGuardarMolde}>Guardar como modelo</Lig>
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// O separador em si: lista → percurso → recorte/expedição, com o
// editor, a mensagem e a gaveta por cima (fora do URL).
// ------------------------------------------------------------
export default function ComunicadosTab({ rotaP1, rotaP2, aoNavegarRota }) {
  const [lista, setLista] = useState(null); // null = ainda a caminho
  const [erroLista, setErroLista] = useState("");
  const [aberto, setAberto] = useState(null); // a folha em percurso
  const [emEdicao, setEmEdicao] = useState(null); // a folha no editor
  // O preparado em memória de um modelo (prepararDeModelo) — só vale
  // com emEdicao === "nova"; nada existe na base até ao primeiro Guardar.
  const [inicialEditor, setInicialEditor] = useState(null);
  const [emMensagem, setEmMensagem] = useState(null); // a folha na mensagem

  // O QUE A ROTA DIZ — o estado deriva daqui, não de vistas internas.
  const idAberto = rotaP1 && rotaP1 !== "modelos" && EH_UUID.test(rotaP1) ? rotaP1 : null;
  const tab = rotaP1 === "modelos" ? "moldes" : "feitos";
  const vista = rotaP2 === "quem-recebe" ? "publico" : rotaP2 === "enviar" ? "expedicao" : "detalhe";

  // Apagar em duas fases, no cartão — só para folhas SEM HISTÓRIA (nem
  // leituras, nem lista): o rascunho que se criou por engano. O resto
  // retira-se, nunca se apaga.
  const [apagarArmado, setApagarArmado] = useState(null);
  const [erroApagar, setErroApagar] = useState("");
  useEffect(() => {
    if (!apagarArmado) return undefined;
    const t = setTimeout(() => setApagarArmado(null), 4000);
    return () => clearTimeout(t);
  }, [apagarArmado]);

  // A razão do X esmaecido — as folhas COM história mantêm o X, mas o
  // toque responde no ecrã com a razão por baixo do cartão (o padrão da
  // casa: nada de title escondido). Desarma sozinha aos 6s, ao clicar
  // noutro sítio ou com Escape (o par do clicar-fora na casa — quem
  // abre por teclado fecha por teclado); clicar no próprio X (ou noutro
  // X esmaecido) não conta como «noutro sítio» — é o gesto que a abre.
  const [razaoAberta, setRazaoAberta] = useState(null);
  useEffect(() => {
    if (!razaoAberta) return undefined;
    const t = setTimeout(() => setRazaoAberta(null), 6000);
    const fora = (e) => {
      if (e.target instanceof Element && e.target.closest("[data-razao-com]")) return;
      setRazaoAberta(null);
    };
    const aoTeclar = (e) => {
      if (e.key === "Escape") setRazaoAberta(null);
    };
    document.addEventListener("click", fora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", fora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [razaoAberta]);

  const apagar = (c) => {
    if (apagarArmado !== c.id) {
      setApagarArmado(c.id);
      return;
    }
    setApagarArmado(null);
    setErroApagar("");
    apagarComunicado(c.id)
      .then(() => carregar())
      .catch((e) => {
        console.error(e);
        setErroApagar(
          /hist/i.test(e?.message || "")
            ? e.message
            : "Não foi possível apagar a folha. Tente outra vez.",
        );
      });
  };

  // O ESCOLHEDOR de duas vias do «+ Novo comunicado» — o precedente do
  // «+ Criar Tipo de Evento» (EventTypesTab): modelo ou zero, e nada se
  // escreve na base até ao primeiro Guardar em qualquer das vias.
  const [escolhedor, setEscolhedor] = useState(false);
  const [modelosEscolha, setModelosEscolha] = useState(null); // null = a caminho
  const [erroEscolhedor, setErroEscolhedor] = useState("");
  const [modeloEscolhidoId, setModeloEscolhidoId] = useState("");

  // A gaveta «Guardar como modelo» e a banda de confirmação no percurso.
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

  // ROTA → ESTADO: a folha da rota carrega-se quando ainda não é a que
  // está em mão; voltar à lista (ou à bancada) refresca a listagem —
  // é o mesmo efeito que a carrega ao arrancar, porque arrancar É
  // chegar a uma rota. Um id que não é UUID nem 'modelos' devolve à
  // lista; um p2 desconhecido normaliza para o percurso. A folha aberta
  // NÃO se apaga ao sair (o ecrã deriva da rota, não dela) — apagar era
  // escrever estado em seco no efeito, a regra de lint da casa.
  // As correcções de URL navegam com replace: um push deixava o URL
  // partido no histórico, e o «voltar» do browser ficava num vaivém
  // (voltar ao partido → o efeito empurra outra vez).
  useEffect(() => {
    if (rotaP1 && rotaP1 !== "modelos" && !EH_UUID.test(rotaP1)) {
      aoNavegarRota(null, { replace: true });
      return undefined;
    }
    if (idAberto && rotaP2 && rotaP2 !== "quem-recebe" && rotaP2 !== "enviar") {
      aoNavegarRota(idAberto, { replace: true });
      return undefined;
    }
    if (idAberto) {
      if (aberto?.id === idAberto) return undefined;
      let vivo = true;
      getComunicado(idAberto)
        .then((c) => {
          if (!vivo) return;
          // Outra folha na mão = banda e gaveta da anterior fecham-se.
          setMoldeGuardado(null);
          setGavetaMolde(false);
          setAberto(c);
        })
        .catch((e) => {
          console.error(e);
          // id que não existe → a lista (replace: correcção, não viagem)
          if (vivo) aoNavegarRota(null, { replace: true });
        });
      return () => {
        vivo = false;
      };
    }
    carregar();
    return undefined;
    // aoNavegarRota vem estável da AdminPage (navigate); os guardas
    // acima tornam o efeito idempotente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotaP1, rotaP2]);

  const abrir = (c) => {
    setMoldeGuardado(null);
    setGavetaMolde(false);
    setAberto(c);
    aoNavegarRota(c.id);
    // O que está em mão mostra-se já; as leituras frescas chegam logo a
    // seguir, sem esqueleto — o número acerta-se à frente dos olhos.
    getComunicado(c.id)
      .then(setAberto)
      .catch(() => {});
  };

  // Nascer de um modelo — a MESMA porta do zero: o editor abre com o
  // preparado em memória e a folha só existe no primeiro Guardar.
  // Serve o escolhedor E o «Usar este modelo» da bancada.
  const usarModelo = (modelo) => {
    setEscolhedor(false);
    setInicialEditor(prepararDeModelo(modelo));
    setEmEdicao("nova");
  };

  const carregarModelosEscolha = () => {
    setErroEscolhedor("");
    listarModelos()
      .then((l) => {
        setModelosEscolha(l);
        setModeloEscolhidoId((prev) =>
          prev && l.some((m) => m.id === prev) ? prev : (l[0]?.id ?? ""),
        );
      })
      .catch((e) => {
        console.error(e);
        setErroEscolhedor("Não foi possível carregar os modelos.");
        setModelosEscolha((prev) => prev || []);
      });
  };

  // O «+ Novo comunicado» abre o escolhedor; nada se cria na base — a
  // folha nasce no primeiro Guardar (lib/comunicados), venha do zero ou
  // de um modelo.
  const novo = () => {
    setErroLista("");
    setEscolhedor(true);
    carregarModelosEscolha();
  };

  const comecarDoZero = () => {
    setEscolhedor(false);
    setInicialEditor(null);
    setEmEdicao("nova");
  };

  const comecarDeModelo = () => {
    const m =
      (modelosEscolha || []).find((x) => x.id === modeloEscolhidoId) ||
      (modelosEscolha || [])[0];
    if (!m) return;
    usarModelo(m);
  };

  // A ligação «Ver →» da banda: da folha para a biblioteca de modelos.
  const irAosMoldes = () => aoNavegarRota("modelos");

  // POR PUBLICAR primeiro (é onde há trabalho por acabar), depois as
  // publicadas, por fim as retiradas. Dentro de cada grupo, as mais
  // recentes primeiro — a ordem que a listagem já traz, e o sort é
  // estável, por isso preserva-a.
  const PESO = { "por publicar": 0, publicada: 1, retirada: 2 };
  const ordenados = lista
    ? [...lista].sort((a, b) => PESO[estadoDe(a)] - PESO[estadoDe(b)])
    : [];

  const nomesDosModelos = (modelosEscolha || [])
    .slice(0, 3)
    .map((m) => m.nome)
    .join(" · ");

  return (
    <motion.div
      key="tab-comunicados"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* A revelação entre estados do percurso e as identidades que
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
        .dlm-apagar-com:hover {
          color: #DC2626;
          background-color: #FEF2F2;
        }
        .dlm-cartao-com:hover {
          border-color: var(--gold-light);
          box-shadow: 0 2px 12px rgba(0,0,0,0.05);
        }
        .dlm-tab-com:hover:not(.dlm-tab-com--activa) {
          color: var(--charcoal);
        }
      `}</style>

      {idAberto && (!aberto || aberto.id !== idAberto) ? (
        // A folha da rota ainda vem a caminho (um URL colado, um refrescar).
        <div style={{ maxWidth: "720px" }}>
          <Esqueleto h={26} r={8} style={{ maxWidth: "320px" }} />
          <Esqueleto h={30} r={999} style={{ maxWidth: "420px", marginTop: "20px" }} />
          {[0, 1, 2].map((i) => (
            <Esqueleto key={i} h={86} r={12} style={{ marginTop: "14px" }} />
          ))}
        </div>
      ) : idAberto && vista === "publico" ? (
        <ComunicadoRecorte
          key={`recorte-${aberto.id}`}
          comunicado={aberto}
          onVoltar={() => aoNavegarRota(aberto.id)}
          onMudou={setAberto}
          onAbrirExpedicao={() => aoNavegarRota(`${aberto.id}/enviar`)}
        />
      ) : idAberto && vista === "expedicao" ? (
        <ComunicadoExpedicao
          key={`expedicao-${aberto.id}`}
          comunicado={aberto}
          onVoltar={() => aoNavegarRota(aberto.id)}
          onMensagem={() => setEmMensagem(aberto)}
        />
      ) : idAberto ? (
        <PercursoComunicado
          key={aberto.id}
          comunicado={aberto}
          onVoltar={() => aoNavegarRota(null)}
          onEditar={() => setEmEdicao(aberto)}
          onMensagem={() => setEmMensagem(aberto)}
          onPublico={() => aoNavegarRota(`${aberto.id}/quem-recebe`)}
          onExpedicao={() => aoNavegarRota(`${aberto.id}/enviar`)}
          onMudou={setAberto}
          onGuardarMolde={() => setGavetaMolde(true)}
          moldeGuardado={moldeGuardado}
          onVerMoldes={irAosMoldes}
        />
      ) : (
        <>
          {/* Envios | Modelos — tabs de texto com underline dourado no
              activo (o padrão do desenho da biblioteca), não a pastilha
              deslizante: são vistas irmãs, não um filtro. */}
          <div style={{ maxWidth: "640px" }}>
            <div style={{ fontSize: "9.5px", fontWeight: "700", letterSpacing: "0.15em", color: "var(--gold-dark)" }}>
              COMUNICADOS
            </div>
            <div
              role="tablist"
              aria-label="Envios ou modelos"
              style={{
                display: "flex",
                gap: "22px",
                marginTop: "12px",
                marginBottom: "22px",
                borderBottom: "1px solid #F0E6D0",
              }}
            >
              {[
                ["feitos", "Envios"],
                ["moldes", "Modelos"],
              ].map(([id, nome]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => aoNavegarRota(id === "moldes" ? "modelos" : null)}
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
            <ComunicadoModelos onUsar={usarModelo} onIrAosFeitos={() => aoNavegarRota(null)} />
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
                    Envios
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

              {erroApagar && (
                <p role="alert" style={{ margin: "0 0 12px", fontSize: "12.5px", color: "#DC2626", maxWidth: "640px" }}>
                  {erroApagar}
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
                    // Sem história = sem leituras e sem lista fechada:
                    // só esses rascunhos se podem apagar. O resto retira-se
                    // — e o X esmaecido responde com o motivo real.
                    const apagavel = (c.n_acessos || 0) === 0 && !c.congelado_em;
                    const razaoDoX =
                      (c.n_acessos || 0) > 0
                        ? "Já tem leituras — só pode ser retirada do ar."
                        : "Já tem lista fechada — só pode ser retirada do ar.";
                    return (
                      <div key={c.id} style={{ marginBottom: "12px" }}>
                      <div
                        className="dlm-cartao-com"
                        style={{
                          display: "flex",
                          alignItems: "stretch",
                          gap: "4px",
                          boxSizing: "border-box",
                          borderRadius: "12px",
                          padding: "14px 10px 14px 16px",
                        }}
                      >
                        <button
                          onClick={() => abrir(c)}
                          className="acao"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            display: "block",
                            textAlign: "left",
                            border: "none",
                            background: "none",
                            padding: 0,
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
                        {apagavel ? (
                          apagarArmado === c.id ? (
                            <button
                              onClick={() => apagar(c)}
                              className="acao"
                              style={{
                                flex: "none",
                                alignSelf: "center",
                                padding: "8px 12px",
                                border: "1px solid #FECACA",
                                borderRadius: "999px",
                                backgroundColor: "#FEF2F2",
                                color: "#DC2626",
                                fontSize: "11.5px",
                                fontWeight: "600",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Confirmar? A folha apaga-se.
                            </button>
                          ) : (
                            <button
                              onClick={() => apagar(c)}
                              aria-label="Apagar a folha"
                              title="Apagar a folha"
                              className="acao dlm-apagar-com"
                              style={{
                                flex: "none",
                                alignSelf: "center",
                                width: "32px",
                                height: "32px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                border: "none",
                                borderRadius: "8px",
                                background: "transparent",
                                color: "#C4C4C4",
                              }}
                            >
                              <svg
                                width="12"
                                height="12"
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
                          )
                        ) : (
                          // O X esmaecido — mesma pele, sem o vermelho do
                          // hover; o toque (rato, dedo ou Enter) abre a
                          // razão por baixo do cartão, e o aria-label di-la
                          // também.
                          <button
                            onClick={() => setRazaoAberta(c.id)}
                            aria-label={razaoDoX}
                            data-razao-com="1"
                            className="acao"
                            style={{
                              flex: "none",
                              alignSelf: "center",
                              width: "32px",
                              height: "32px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              border: "none",
                              borderRadius: "8px",
                              background: "transparent",
                              color: "#C4C4C4",
                              opacity: 0.45,
                            }}
                          >
                            <svg
                              width="12"
                              height="12"
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
                        )}
                      </div>
                      {!apagavel && razaoAberta === c.id && (
                        <p
                          role="status"
                          data-razao-com="1"
                          style={{
                            margin: "8px 0 0",
                            fontSize: "11.5px",
                            color: "var(--gray-mid)",
                            backgroundColor: "#FDFBF5",
                            border: "1px solid #E8DCC0",
                            borderRadius: "8px",
                            padding: "7px 10px",
                            lineHeight: 1.6,
                          }}
                        >
                          {razaoDoX}{" "}
                          <button
                            onClick={() => abrir(c)}
                            className="ligacao"
                            style={{
                              fontSize: "11.5px",
                              color: "var(--gold-dark)",
                              textDecoration: "underline",
                              textUnderlineOffset: "2px",
                            }}
                          >
                            Abrir a folha
                          </button>
                        </p>
                      )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* O ESCOLHEDOR de duas vias — modelo ou zero. Fica fora do URL,
          como as outras sobreposições: um rascunho sem id não tem rota. */}
      {escolhedor && (
        <div
          onClick={() => setEscolhedor(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 150,
            backgroundColor: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "white",
              borderRadius: "16px",
              padding: "22px 24px",
              maxWidth: "460px",
              width: "100%",
              boxShadow: "0 8px 48px rgba(0,0,0,0.15)",
            }}
          >
            <div style={{ ...OVERLINE, marginBottom: "14px" }}>Novo comunicado</div>

            {/* Via 1: começar de um modelo */}
            <div
              style={{
                border: "1.5px solid var(--gold-light)",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "12px",
              }}
            >
              <p style={{ fontSize: "13.5px", fontWeight: "600", margin: "0 0 6px" }}>
                Começar de um modelo
              </p>
              {erroEscolhedor ? (
                <p style={{ fontSize: "12px", color: "#DC2626", margin: "0 0 12px" }}>
                  {erroEscolhedor}{" "}
                  <button
                    onClick={carregarModelosEscolha}
                    className="ligacao"
                    style={{ fontSize: "12px", color: "var(--gold-dark)", textDecoration: "underline" }}
                  >
                    Tentar de novo
                  </button>
                </p>
              ) : modelosEscolha === null ? (
                <Esqueleto h={14} r={6} style={{ maxWidth: "260px", marginBottom: "12px" }} />
              ) : modelosEscolha.length === 0 ? (
                <p style={{ fontSize: "12px", color: "var(--gray-mid)", margin: "0 0 4px", lineHeight: 1.6 }}>
                  Ainda não há modelos de comunicado — guardam-se a partir de uma
                  folha, em «Guardar como modelo».
                </p>
              ) : (
                <>
                  <p style={{ fontSize: "12px", color: "var(--gray-mid)", margin: "0 0 12px", lineHeight: 1.6 }}>
                    {nomesDosModelos}
                    {modelosEscolha.length > 3 ? " · …" : ""} — a folha, a mensagem e
                    quem recebe, prontos a rever.
                  </p>
                  {modelosEscolha.length > 1 && (
                    <select
                      value={modeloEscolhidoId}
                      onChange={(e) => setModeloEscolhidoId(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "9px 12px",
                        borderRadius: "8px",
                        border: "1.5px solid var(--gold-light)",
                        fontSize: "13px",
                        marginBottom: "12px",
                        fontFamily: "Inter, sans-serif",
                      }}
                    >
                      {modelosEscolha.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={comecarDeModelo}
                    className="acao acao--cheia"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "11px",
                      borderRadius: "10px",
                      fontSize: "12.5px",
                      fontWeight: "600",
                    }}
                  >
                    Usar este modelo
                    {modelosEscolha.length === 1 ? ` — ${modelosEscolha[0].nome}` : ""}
                  </button>
                </>
              )}
            </div>

            {/* Via 2: começar do zero */}
            <div
              style={{
                border: "1.5px solid #F0E6D0",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "16px",
              }}
            >
              <p style={{ fontSize: "13.5px", fontWeight: "600", margin: "0 0 6px" }}>
                Começar do zero
              </p>
              <p style={{ fontSize: "12px", color: "var(--gray-mid)", margin: "0 0 12px", lineHeight: 1.6 }}>
                Uma folha em branco. Nada fica guardado até ao primeiro Guardar.
              </p>
              <button
                onClick={comecarDoZero}
                className="acao acao--ouro"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "11px",
                  borderRadius: "10px",
                  fontSize: "12.5px",
                  fontWeight: "600",
                }}
              >
                Começar do zero
              </button>
            </div>

            <button
              onClick={() => setEscolhedor(false)}
              className="acao"
              style={{
                width: "100%",
                padding: "8px",
                fontSize: "12px",
                color: "var(--gray-mid)",
                background: "none",
                border: "none",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* A gaveta «Guardar como modelo» vive ao nível do separador: o
          percurso abre-a, mas é aqui que a banda de confirmação nasce.
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
          comunicado={emEdicao === "nova" ? null : emEdicao}
          inicial={emEdicao === "nova" ? inicialEditor || undefined : undefined}
          onFechar={() => {
            // Fechar sem guardar: a folha fica como estava; o rascunho em
            // memória (zero ou de modelo) evapora-se — rasto zero.
            setEmEdicao(null);
            setInicialEditor(null);
            carregar();
          }}
          onGuardado={(rec) => {
            // Guardar fecha PARA O PERCURSO — o gesto seguinte natural é
            // publicar, e é lá que ele mora.
            setEmEdicao(null);
            setInicialEditor(null);
            setAberto(rec);
            carregar();
            if (idAberto !== rec.id) aoNavegarRota(rec.id);
          }}
        />
      )}

      {emMensagem && (
        <MensagemEditor
          comunicado={emMensagem}
          onFechar={() => setEmMensagem(null)}
          onGuardado={(rec) => {
            // A mensagem guardada volta ao percurso com o registo fresco
            // — o envio vai lê-la de lá.
            setEmMensagem(null);
            setAberto(rec);
            carregar();
          }}
        />
      )}
    </motion.div>
  );
}
