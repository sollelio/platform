import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import logoUrl from "../../assets/logo.png";
import { Esqueleto } from "../admin/acabamento";
import {
  overline, playfair, diaMesAno, diaEMes, horaCurta, formatarEuroPT,
  WHATSAPP_URL, lerSessao, guardarSessao,
} from "./base";
import {
  FileteComLosango, CartaoBranco, Medalhao, EngasteVazio, VistoDourado,
  CabecalhoDivisao, Assinatura,
} from "./pecas";
import {
  SeloVersao, Folha, Timbre, LinhaServico, TotalOrcamento,
  TiraContexto, Dupla, CapsulaVazada, LigacaoDiscreta, CelulasCodigo,
  BlocoRecusa, BlocoRegisto, FaixaSelo, CampoAssinatura, CampoRecado,
  EngasteTirar, TituloDocumento, VeuValor,
} from "./documentos-pecas";
import {
  getDocumentosPortal, verDocumentoPortal, pedirCodigo, verificarCodigo,
  registarActo, enviarContratoAssinado, ROTULO_DOCUMENTO,
} from "../../lib/portal";
import { dataPorExtenso } from "../admin/orcamentos/contratoConfig";

// ============================================================
// DocumentosVista — a área dos documentos do acompanhamento (fases 3 e 4).
//
// /acompanhar/:token/documentos          → a lista
// /acompanhar/:token/documentos/:tipo    → o documento, e os actos no pé
//
// AS REGRAS QUE GOVERNAM ISTO (folha de decisões):
//   · Todo o acto se refere a UMA VERSÃO, e nunca se desfaz — arquiva-se.
//   · O documento ABRE-SE SEMPRE; sem sessão, só os euros ficam velados
//     (cortados no servidor — o véu daqui é só o desenho do lugar deles).
//   · O acto vive no pé do documento, com o fim dele à vista. Nunca num
//     ecrã só de botões.
//   · Orçamento ACEITA-SE · projecto APROVA-SE · contrato ASSINA-SE.
//   · A espera do código é uma pessoa a tratar do assunto, com o nome
//     dela: «a Nádia envia-lhe», nunca «será enviado».
//
// ⚠ O código vale 24 HORAS (decisão da casa: «ela pode só ver o pedido à
//   noite») — o desenho dizia trinta minutos e perdeu. A sessão depois do
//   código é de 60 minutos e sobrevive a recarregar (sessionStorage).
// ============================================================

const naoVazia = (s) => typeof s === "string" && s.trim() !== "";
const nomeCompleto = (s) => /\S{2,}\s+\S{2,}/.test((s || "").trim());

// ---------- resolver das cláusulas ----------
// As cláusulas viajam CONGELADAS no instantâneo (com os marcadores), e
// resolvem-se aqui com os dados do MESMO instantâneo. Devolve uma lista de
// pedaços (texto e JSX) para o véu poder entrar no lugar exacto do número.
function resolverCorpo(corpo, inst, velado) {
  const valores = {
    TIPO_EVENTO: inst.tipoEvento || "o evento",
    DATA_EXTENSO: inst.dataEvento ? dataPorExtenso(inst.dataEvento) : "a data combinada",
    LOCAL: inst.local || "o espaço combinado",
    HORA_INICIO: inst.horaInicio || "—",
    HORA_FIM: inst.horaFim || "—",
    VALOR: velado ? null : formatarEuroPT(inst.valor),
    VALOR_EXTENSO: velado ? null : inst.valorExtenso || "",
  };
  const pedacos = String(corpo || "").split(/(\{[A-Z_]+\})/);
  return pedacos.map((p, i) => {
    const m = p.match(/^\{([A-Z_]+)\}$/);
    if (!m) return p;
    const v = valores[m[1]];
    if (v === null)
      return (
        <span key={i} style={{ display: "inline-block", verticalAlign: "middle", margin: "0 3px" }}>
          <VeuValor largura={64} altura={12} />
        </span>
      );
    return v !== undefined ? v : p;
  });
}

// A cláusula dos serviços: as linhas da composição (• = item, resto =
// cabeçalho) mais as secções extra — a mesma leitura do GerarContrato.
function LinhasComposicao({ inst }) {
  const linhas = String(inst.composicao || "").split("\n");
  const extras = Array.isArray(inst.seccoesExtra) ? inst.seccoesExtra : [];
  return (
    <div>
      {naoVazia(inst.lugares) && (
        <p style={{ fontSize: "12px", lineHeight: 1.75, color: "var(--gray-mid)", margin: "0 0 6px" }}>
          Serviço de mesa posta para {inst.lugares} convidados, incluindo:
        </p>
      )}
      {linhas.map((l, i) => (
        <p
          key={i}
          style={{
            fontSize: "12px", lineHeight: 1.7, color: "var(--gray-mid)",
            margin: l === "" ? "8px 0" : "0 0 2px",
            fontWeight: l !== "" && !l.startsWith("•") ? 600 : 400,
          }}
        >
          {l}
        </p>
      ))}
      {extras
        .filter((s) => naoVazia(s.titulo) || naoVazia(s.itens))
        .map((s, i) => (
          <div key={i} style={{ marginTop: "10px" }}>
            {naoVazia(s.titulo) && (
              <p style={{ fontSize: "12px", fontWeight: 600, lineHeight: 1.7, color: "var(--gray-mid)", margin: 0 }}>
                {s.titulo}
              </p>
            )}
            {String(s.itens || "").split("\n").filter(Boolean).map((l, j) => (
              <p key={j} style={{ fontSize: "12px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "0 0 2px" }}>
                {l}
              </p>
            ))}
          </div>
        ))}
    </div>
  );
}

// ---------- os três corpos de documento ----------

function CorpoOrcamento({ doc }) {
  const inst = doc.instantaneo || {};
  const linhas = Array.isArray(inst.linhas) ? inst.linhas : [];
  const total = linhas.reduce(
    (acc, l) => acc + (Number(l.qtd) || 0) * (Number(l.valor) || 0), 0);
  const valeAte = useMemo(() => {
    const dias = Number(inst.__validadeDias) || 30;
    const d = new Date(doc.publicado_em);
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
  }, [doc.publicado_em, inst.__validadeDias]);

  return (
    <>
      <Timbre logoUrl={logoUrl} nome="Orçamento" versao={doc.versao} quando={doc.publicado_em} />
      <TituloDocumento
        meta={[
          inst.dataEvento ? diaMesAno(inst.dataEvento) : null,
          naoVazia(inst.local) ? inst.local : null,
        ].filter(Boolean).join(" · ") || null}
      >
        {naoVazia(inst.subtitulo)
          ? inst.subtitulo
          : [inst.tipoEvento, inst.cliente].filter(naoVazia).join(" · ") || "O seu orçamento"}
      </TituloDocumento>

      <div style={{ padding: "16px 22px 0" }}>
        {linhas.map((l, i) => (
          <LinhaServico
            key={l.uid || i}
            nome={l.descricao || "Serviço"}
            nota={Array.isArray(l.inclui) && l.inclui.length > 0 ? l.inclui.join(" · ") : null}
            qtd={l.qtd}
            valor={l.valor}
            velado={doc.velado}
          />
        ))}
      </div>

      <TotalOrcamento total={total} velado={doc.velado} />

      <div style={{ padding: "16px 22px 24px" }}>
        {Array.isArray(inst.__condicoes) && inst.__condicoes.length > 0 && (
          <p style={{ fontSize: "11.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: 0, textWrap: "pretty" }}>
            {inst.__condicoes.join(". ")}.
          </p>
        )}
        <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: "10px 0 0", fontVariantNumeric: "tabular-nums" }}>
          Este orçamento vale até {diaMesAno(valeAte)}.
        </p>
      </div>
    </>
  );
}

function CorpoProjecto({ doc }) {
  const inst = doc.instantaneo || {};
  const seccoes = (Array.isArray(inst.seccoes) ? inst.seccoes : []).filter(
    (s) => naoVazia(s.titulo) || naoVazia(s.imagem) || naoVazia(s.descricao),
  );
  return (
    <>
      <Timbre logoUrl={logoUrl} nome="Projecto" versao={doc.versao} quando={doc.publicado_em} />
      <TituloDocumento meta="A partir do que nos contou no questionário.">
        {naoVazia(inst.subtitulo) ? inst.subtitulo : "A mesa que lhe desenhámos"}
      </TituloDocumento>

      {seccoes.map((s, i) => (
        <div key={s.uid || i} style={{ padding: "20px 22px 0" }}>
          {naoVazia(s.titulo) && <p style={overline("#9B9B9B", "0.22em", "9px")}>{s.titulo}</p>}
          {naoVazia(s.imagem) && (
            <img
              src={s.imagem}
              alt=""
              loading="lazy"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block", marginTop: "11px", border: "1px solid #EFE7D6" }}
            />
          )}
          {naoVazia(s.descricao) && (
            <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "11px 0 0", textWrap: "pretty" }}>
              {s.descricao}
            </p>
          )}
        </div>
      ))}

      <div style={{ padding: "22px 22px 24px" }}>
        <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: 0, textWrap: "pretty" }}>
          As imagens são do nosso arquivo e servem de referência. No dia, a
          mesa é a sua.
        </p>
      </div>
    </>
  );
}

function CorpoContrato({ doc, resumoSo = false }) {
  const inst = doc.instantaneo || {};
  const contrato = inst.__contrato || {};
  const clausulas = Array.isArray(contrato.clausulas) ? contrato.clausulas : [];
  const contraentes = (Array.isArray(inst.contraentes) ? inst.contraentes : [])
    .map((c) => c.nome).filter(naoVazia);

  const resumo = [
    inst.tipoEvento && inst.dataEvento
      ? `${inst.tipoEvento}, a ${dataPorExtenso(inst.dataEvento)}${naoVazia(inst.horaInicio) ? `, das ${inst.horaInicio} às ${inst.horaFim || "—"}` : ""}.`
      : null,
    naoVazia(inst.local) ? `Em ${inst.local}.` : null,
    naoVazia(inst.lugares) ? `Mesa posta para ${inst.lugares} convidados.` : null,
    doc.velado
      ? null
      : inst.valor
        ? `O valor do serviço é de ${formatarEuroPT(inst.valor)}.`
        : null,
  ].filter(Boolean);

  return (
    <>
      <TituloDocumento
        meta={contraentes.length > 0 ? `Entre Do Luxo à Mesa e ${contraentes.join(" e ")}` : null}
      >
        {inst.tipoEvento || "O seu contrato"}
      </TituloDocumento>

      <div style={{ margin: "20px 22px 0", backgroundColor: "#FDFBF5", border: "1px solid #F0E6D0", padding: "18px 18px 16px" }}>
        <p style={overline()}>Em resumo</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "11px", marginTop: "13px" }}>
          {resumo.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: "11px", alignItems: "flex-start" }}>
              <div aria-hidden="true" style={{ width: "5px", height: "5px", backgroundColor: "var(--gold)", transform: "rotate(45deg)", flex: "none", marginTop: "6px", opacity: 0.55 }} />
              <p style={{ fontSize: "12px", lineHeight: 1.65, color: "var(--charcoal)", margin: 0, textWrap: "pretty" }}>{r}</p>
            </div>
          ))}
          {doc.velado && (
            <div style={{ display: "flex", gap: "11px", alignItems: "center" }}>
              <div aria-hidden="true" style={{ width: "5px", height: "5px", backgroundColor: "var(--gold)", transform: "rotate(45deg)", flex: "none", opacity: 0.55 }} />
              <span style={{ fontSize: "12px", color: "var(--charcoal)", marginRight: "6px" }}>O valor do serviço é de</span>
              <VeuValor largura={78} altura={13} />
            </div>
          )}
        </div>
        <p style={{ fontSize: "10.5px", lineHeight: 1.6, color: "#9B9B9B", margin: "14px 0 0", textWrap: "pretty" }}>
          O resumo é uma ajuda de leitura. O que obriga é o texto{resumoSo ? " do contrato" : " que se segue"}.
        </p>
      </div>

      {!resumoSo && (
        <>
          <div style={{ padding: "24px 22px 0" }}>
            <FileteComLosango margem="0" largura={40} />
          </div>
          <div style={{ padding: "6px 22px 0" }}>
            {clausulas.map((c, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: "12px", padding: "16px 0 0" }}>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: "17px", lineHeight: 1.2, color: "var(--gold)", fontVariantNumeric: "tabular-nums", paddingTop: "1px", margin: 0 }}>
                  {String(c.n || "").replace(".ª", "")}
                </p>
                <div>
                  <p style={{ fontSize: "12.5px", fontWeight: 600, lineHeight: 1.4, margin: 0, color: "var(--charcoal)" }}>{c.titulo}</p>
                  {c.ehServicos ? (
                    <div style={{ marginTop: "6px" }}>
                      <LinhasComposicao inst={inst} />
                    </div>
                  ) : (
                    <p style={{ fontSize: "12px", lineHeight: 1.75, color: "var(--gray-mid)", margin: "6px 0 0", textWrap: "pretty" }}>
                      {resolverCorpo(c.corpo, inst, doc.velado)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ---------- a lista ----------

function Lista({ token, meta }) {
  const docs = meta?.documentos || [];
  const porTipo = (t) => docs.find((d) => d.tipo === t) || null;
  const aEspera = docs.filter((d) => !d.acto).length;

  const frase =
    docs.length === 0
      ? "Ainda não há documentos aqui."
      : aEspera === 0
        ? "Está tudo respondido."
        : aEspera === 1
          ? "Um deles espera por si."
          : `${aEspera === 2 ? "Dois" : "Três"} esperam por si.`;

  const AINDA_NAO = {
    orcamento: "Ainda não existe. Estamos a prepará-lo com o que nos contou.",
    proposta: "Ainda não existe. Desenhamo-lo depois de o orçamento estar aceite.",
    contrato: "Ainda não existe. Escrevemo-lo depois de o projecto estar aprovado.",
  };
    // O orçamento ACEITA-SE, o projecto APROVA-SE, o contrato ASSINA-SE —
  // os verbos nunca se trocam (folha de decisões, secção Língua).
  const actoTexto = (acto, tipo) =>
    acto === "assinou"
      ? "Assinou-o"
      : acto === "pediu_alteracao"
        ? "Pediu uma alteração"
        : tipo === "proposta"
          ? "Aprovou-o"
          : "Aceitou-o";

  return (
    <div style={{ padding: "34px 26px 32px" }}>
      <CabecalhoDivisao rotulo="Os seus documentos" frase={frase} />

      <div style={{ marginTop: "26px", display: "flex", flexDirection: "column", gap: "14px" }}>
        {["orcamento", "proposta", "contrato"].map((tipo) => {
          const d = porTipo(tipo);
          if (!d) {
            return (
              <div key={tipo} style={{ display: "flex", gap: "11px", alignItems: "flex-start", padding: "4px 4px 0" }}>
                <EngasteVazio />
                <div style={{ paddingTop: "2px" }}>
                  <p style={{ ...playfair, fontSize: "17px", lineHeight: 1.25 }}>{ROTULO_DOCUMENTO[tipo]}</p>
                  <p style={{ fontSize: "12px", lineHeight: 1.65, color: "#9B9B9B", margin: "6px 0 0", textWrap: "pretty" }}>
                    {AINDA_NAO[tipo]}
                  </p>
                </div>
              </div>
            );
          }
          const espera = !d.acto;
          return (
            <CartaoBranco
              key={tipo}
              padding="19px 20px"
              style={espera ? { border: "1.5px solid #E8D5A3" } : undefined}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                <div>
                  <p style={{ ...playfair, fontSize: "18px", lineHeight: 1.25 }}>{ROTULO_DOCUMENTO[tipo]}</p>
                  <SeloVersao versao={d.versao} quando={d.publicado_em} style={{ marginTop: "7px" }} />
                </div>
                {espera ? (
                  <span style={{ fontSize: "10.5px", letterSpacing: "0.02em", color: "var(--gold-dark)", backgroundColor: "#FEF9EC", border: "1px solid #E8D5A3", borderRadius: "999px", padding: "4px 11px", flex: "none" }}>
                    à sua espera
                  </span>
                ) : (
                  <div style={{ width: "26px", height: "26px", borderRadius: "50%", backgroundColor: "#FEF9EC", border: "1px solid #E8D5A3", flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <VistoDourado />
                  </div>
                )}
              </div>
              <p style={{ fontSize: "12.5px", lineHeight: 1.65, color: "var(--gray-mid)", margin: "11px 0 0", textWrap: "pretty" }}>
                {d.acto
                  ? `${actoTexto(d.acto.acto, tipo)} a ${diaEMes(d.acto_em)}. Fica guardado tal como o leu nesse dia.`
                  : tipo === "proposta"
                    ? "A sua mesa desenhada — cores, louça, flores e o cenário. Diga-nos se está como imaginou."
                    : tipo === "contrato"
                      ? "O que combinámos, passado a escrito. Leia com calma antes de assinar."
                      : "Os serviços e os valores da sua mesa. Responda quando quiser."}
              </p>
              {espera ? (
                <Link
                  to={`/acompanhar/${token}/documentos/${tipo}`}
                  style={{
                    display: "block", textAlign: "center", marginTop: "15px",
                    font: "600 11px Inter, sans-serif", letterSpacing: "0.14em",
                    textTransform: "uppercase", color: "var(--gold-dark)",
                    backgroundColor: "white", border: "1px solid var(--gold)",
                    borderRadius: "999px", padding: "13px 20px", textDecoration: "none",
                  }}
                >
                  Abrir o {ROTULO_DOCUMENTO[tipo].toLowerCase()}
                </Link>
              ) : (
                <div style={{ marginTop: "12px" }}>
                  <Link
                    to={`/acompanhar/${token}/documentos/${tipo}`}
                    style={{ fontSize: "12px", letterSpacing: "0.03em", color: "var(--charcoal)", borderBottom: "1px solid #E8D5A3", paddingBottom: "3px", textDecoration: "none" }}
                  >
                    Ver o {ROTULO_DOCUMENTO[tipo].toLowerCase()}
                  </Link>
                </div>
              )}
            </CartaoBranco>
          );
        })}
      </div>

      <Assinatura style={{ marginTop: "32px" }} />
    </div>
  );
}

// ---------- o fluxo do código ----------

function FluxoCodigo({ token, tipo, versao, meta, onVerificado, onRecarregarMeta }) {
  // O «agora» fixa-se quando o ecrã abre: o render tem de ser puro, e a
  // pergunta «já passaram duas horas?» não precisa de relógio vivo.
  const [agora] = useState(() => new Date().getTime());
  // 'espera' | 'celulas' | 'recusado' — a entrada decide-se pelo estado do
  // pedido: se há código emitido, vai-se direito às células.
  const v = meta?.verificacao;
  const [modo, setModo] = useState(v?.estado === "pedido" ? "espera" : "celulas");
  const [codigo, setCodigo] = useState("");
  const [aTrabalhar, setATrabalhar] = useState(false);
  const [recusa, setRecusa] = useState(null);

  const titulo = `${ROTULO_DOCUMENTO[tipo]} · versão ${versao}`;

  const verificar = async () => {
    if (codigo.length < 6 || aTrabalhar) return;
    setATrabalhar(true);
    try {
      const r = await verificarCodigo(token, codigo);
      if (r?.estado === "verificado") {
        guardarSessao(token, r.verificacao, r.valida_ate);
        onVerificado(r.verificacao);
      } else {
        setRecusa("O código não confere — ou já passou o prazo dele.");
        setModo("recusado");
        setCodigo("");
      }
    } catch (e) {
      console.error(e);
      setRecusa("Não foi possível verificar. A ligação falhou a meio.");
      setModo("recusado");
    } finally {
      setATrabalhar(false);
    }
  };

  const pedirOutro = async () => {
    setATrabalhar(true);
    try {
      await pedirCodigo(token, tipo);
      await onRecarregarMeta();
      setRecusa(null);
      setModo("espera");
    } catch (e) {
      console.error(e);
    } finally {
      setATrabalhar(false);
    }
  };

  const pedidoEm = v?.pedido_em || null;
  const esperaLonga =
    pedidoEm && agora - new Date(pedidoEm).getTime() > 2 * 60 * 60 * 1000;

  return (
    <div>
      <TiraContexto
        titulo={titulo}
        direita={<span style={{ fontSize: "10.5px", color: "#9B9B9B" }}>valores velados</span>}
      />

      {modo === "espera" && (
        <div style={{ padding: "44px 30px 0", textAlign: "center" }}>
          {/* O sopro da espera: o único movimento fora do cabeçalho —
              laço de ambiente, diz que alguém está a tratar do assunto. */}
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", height: "64px" }}>
            <div aria-hidden="true" className="portal-sopro" style={{
              position: "absolute", width: "130px", height: "130px", borderRadius: "50%",
              background: "radial-gradient(circle, rgba(232,213,163,0.55) 0%, rgba(232,213,163,0) 70%)",
            }} />
            <div style={{ position: "relative", width: "44px", height: "44px", borderRadius: "50%", backgroundColor: "#FEF9EC", border: "1px solid #E8D5A3" }} />
          </div>

          <p style={{ ...overline(), marginTop: "22px" }}>O código</p>
          <p style={{ ...playfair, fontSize: "21px", lineHeight: 1.32, marginTop: "12px", textWrap: "balance" }}>
            A Nádia já sabe que precisa dele.
          </p>
          <FileteComLosango margem="20px 0" />
          <p style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--gray-mid)", margin: 0, textWrap: "pretty" }}>
            {pedidoEm ? `Pediu-o às ${horaCurta(pedidoEm)}. ` : ""}Ela envia-lho
            pela conversa que já tem consigo, no número que temos na sua ficha.
          </p>
          <p style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--gray-mid)", margin: "12px 0 0", textWrap: "pretty" }}>
            Pode fechar esta página. Quando voltar, está tudo como deixou — e o
            código continua a servir.
          </p>

          <div style={{ marginTop: "26px", display: "flex", flexDirection: "column", alignItems: "center", gap: "15px" }}>
            <CapsulaVazada onClick={() => setModo("celulas")} style={{ width: "auto", padding: "13px 26px" }}>
              Já tenho o código
            </CapsulaVazada>
            <LigacaoDiscreta href={WHATSAPP_URL} apagada>
              Falar pelo WhatsApp
            </LigacaoDiscreta>
          </div>

          {esperaLonga && (
            <p style={{ marginTop: "28px", paddingTop: "18px", borderTop: "1px solid #F0E6D0", fontSize: "11.5px", lineHeight: 1.7, color: "#9B9B9B", textWrap: "pretty" }}>
              Já vão duas horas desde o pedido. Se tiver pressa, perguntar por
              WhatsApp é o caminho mais curto.
            </p>
          )}
        </div>
      )}

      {modo === "celulas" && (
        <div style={{ padding: "38px 26px 0", textAlign: "center" }}>
          <p style={overline()}>O código</p>
          <p style={{ ...playfair, fontSize: "21px", lineHeight: 1.32, marginTop: "12px", textWrap: "balance" }}>
            Escreva os seis dígitos que a Nádia lhe enviou.
          </p>

          <div style={{ marginTop: "24px" }}>
            <CelulasCodigo valor={codigo} onValor={setCodigo} aVerificar={aTrabalhar} />
          </div>

          {/* 24 horas por decisão da casa — o desenho dizia trinta minutos
              e perdeu: ela pode só ver o pedido à noite. */}
          <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: "16px 0 0", fontVariantNumeric: "tabular-nums" }}>
            O código vale um dia inteiro, a contar do envio.
          </p>

          <CapsulaVazada onClick={verificar} aTrabalhar={aTrabalhar} style={{ marginTop: "24px", opacity: codigo.length === 6 ? 1 : 0.5 }}>
            {aTrabalhar ? "A abrir…" : "Abrir os valores"}
          </CapsulaVazada>

          <div style={{ marginTop: "26px", paddingTop: "18px", borderTop: "1px solid #F0E6D0", textAlign: "center" }}>
            <LigacaoDiscreta onClick={pedirOutro} apagada>
              Não recebi o código
            </LigacaoDiscreta>
          </div>
        </div>
      )}

      {modo === "recusado" && (
        <div style={{ padding: "38px 26px 0", textAlign: "center" }}>
          <p style={overline()}>O código</p>
          <p style={{ ...playfair, fontSize: "21px", lineHeight: 1.32, marginTop: "12px", textWrap: "balance" }}>
            Este código não abriu.
          </p>

          <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "22px" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ width: "48px", height: "56px", borderRadius: "8px", backgroundColor: "white", border: "1px solid #E8DCC0" }} />
            ))}
          </div>

          <BlocoRecusa
            facto={recusa || "O código não confere — ou já passou o prazo dele."}
            saida="Acontece: um dígito trocado, ou um código de ontem. Pede-se outro e segue-se."
          />

          <CapsulaVazada onClick={pedirOutro} aTrabalhar={aTrabalhar} style={{ marginTop: "20px" }}>
            Pedir outro código
          </CapsulaVazada>
          <div style={{ marginTop: "16px" }}>
            <LigacaoDiscreta href={WHATSAPP_URL} apagada>
              Falar pelo WhatsApp
            </LigacaoDiscreta>
          </div>
          <p style={{ marginTop: "26px", paddingTop: "18px", borderTop: "1px solid #F0E6D0", fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", textWrap: "pretty" }}>
            O {ROTULO_DOCUMENTO[tipo].toLowerCase()} fica onde está. Só os
            valores esperam pelo código.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------- pedir alteração ----------

function PedirAlteracao({ token, tipo, doc, sessaoId, onEnviado, onVoltar }) {
  const inst = doc.instantaneo || {};
  const [marcados, setMarcados] = useState([]);
  const [recado, setRecado] = useState("");
  const [nome, setNome] = useState("");
  const [aTrabalhar, setATrabalhar] = useState(false);
  const [erro, setErro] = useState(null);

  const linhas = tipo === "orcamento" && Array.isArray(inst.linhas) ? inst.linhas : [];
  const seccoes = tipo === "proposta" && Array.isArray(inst.seccoes)
    ? inst.seccoes.filter((s) => naoVazia(s.titulo)) : [];

  const alternar = (chave) =>
    setMarcados((prev) =>
      prev.includes(chave) ? prev.filter((c) => c !== chave) : [...prev, chave]);

  const enviar = async () => {
    if (aTrabalhar) return;
    const partes = [];
    if (marcados.length > 0) partes.push(`Tirar: ${marcados.join(", ")}.`);
    if (naoVazia(recado)) partes.push(recado.trim());
    if (partes.length === 0) {
      setErro("Diga-nos o que quer mudar — uma frase chega.");
      return;
    }
    if (!naoVazia(nome)) {
      setErro("Falta o seu nome, para o pedido ficar registado.");
      return;
    }
    setATrabalhar(true);
    setErro(null);
    try {
      const r = await registarActo(token, tipo, sessaoId, "pediu_alteracao", nome, partes.join("\n"), doc?.versao);
      if (r?.estado === "ok") onEnviado();
      else if (r?.estado === "precisa_codigo") setErro("A sessão do código terminou. Volte ao documento e abra os valores outra vez.");
      else setErro("Não foi possível enviar. Tente novamente.");
    } catch (e) {
      console.error(e);
      setErro("Não foi possível enviar. Verifique a ligação e tente novamente.");
    } finally {
      setATrabalhar(false);
    }
  };

  return (
    <div>
      <TiraContexto
        titulo={`${ROTULO_DOCUMENTO[tipo]} · versão ${doc.versao}`}
        direita={<LigacaoDiscreta onClick={onVoltar} apagada style={{ fontSize: "10.5px" }}>voltar ao documento</LigacaoDiscreta>}
      />
      <div style={{ padding: "30px 26px 0" }}>
        <p style={overline()}>Pedir alteração</p>
        <p style={{ ...playfair, fontSize: "21px", lineHeight: 1.32, marginTop: "11px", textWrap: "balance" }}>
          {tipo === "proposta" ? "Em que parte quer mexer?" : "Diga-nos o que quer mudar."}
        </p>
        <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "10px 0 0", textWrap: "pretty" }}>
          {tipo === "proposta"
            ? "Escolha uma ou mais. Depois diga por palavras suas o que tem em mente."
            : "Não precisa de explicar tudo. Uma frase basta — respondemos com um orçamento novo."}
        </p>

        {linhas.length > 0 && (
          <div style={{ marginTop: "22px", backgroundColor: "white", border: "1.5px solid #F0E6D0", borderRadius: "14px", padding: "18px 18px 16px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
            <p style={overline("#9B9B9B", "0.22em", "9px")}>Se for para tirar algum serviço</p>
            <div style={{ marginTop: "6px" }}>
              {linhas.map((l, i) => {
                const chave = l.descricao || `serviço ${i + 1}`;
                const marcado = marcados.includes(chave);
                return (
                  <div key={l.uid || i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "13px 0", borderBottom: "1px solid #F3EBDA" }}>
                    <div>
                      <p style={{
                        fontSize: "12.5px", fontWeight: 500, lineHeight: 1.4, margin: 0,
                        color: marcado ? "#9B9B9B" : "var(--charcoal)",
                        textDecoration: marcado ? "line-through" : "none",
                        textDecorationColor: "#D8C6B8",
                      }}>
                        {chave}
                      </p>
                      <p style={{ fontSize: "11px", lineHeight: 1.5, color: "#9B9B9B", margin: "4px 0 0", fontVariantNumeric: "tabular-nums" }}>
                        {doc.velado ? `${l.qtd} × —` : `${l.qtd} × ${formatarEuroPT(l.valor)}`}
                      </p>
                    </div>
                    <EngasteTirar marcado={marcado} onToggle={() => alternar(chave)} />
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: "12px 0 0", textWrap: "pretty" }}>
              Toque no que quer tirar. Pode não tocar em nenhum.
            </p>
          </div>
        )}

        {seccoes.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "20px" }}>
            {seccoes.map((s, i) => {
              const marcado = marcados.includes(s.titulo);
              return (
                <div key={s.uid || i} style={{ backgroundColor: "white", border: `1.5px solid ${marcado ? "#9C5A3C" : "#F0E6D0"}`, borderRadius: "14px", padding: "10px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
                  {naoVazia(s.imagem) ? (
                    <img src={s.imagem} alt="" loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                      style={{ width: "100%", aspectRatio: "16 / 10", objectFit: "cover", display: "block", border: "1px solid #EFE7D6" }} />
                  ) : (
                    <div aria-hidden="true" style={{ width: "100%", aspectRatio: "16 / 10", background: "repeating-linear-gradient(45deg, #F2ECDF 0 5px, #FAF7EF 5px 11px)", border: "1px solid #EFE7D6" }} />
                  )}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginTop: "10px" }}>
                    <p style={{ fontSize: "11.5px", fontWeight: 500, margin: 0, color: marcado ? "#9B9B9B" : "var(--charcoal)" }}>
                      {s.titulo}
                    </p>
                    <EngasteTirar marcado={marcado} onToggle={() => alternar(s.titulo)} tamanho={18} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <CampoRecado valor={recado} onValor={setRecado} />

        {/* O trilho quer «quem (nome escrito)» em TODOS os actos — o
            desenho não trazia este campo, a decisão fechada sim. */}
        <div style={{ marginTop: "14px", display: "flex", alignItems: "baseline", gap: "10px" }}>
          <label htmlFor="nome-alteracao" style={{ ...overline("#9B9B9B", "0.16em", "9px"), flex: "none" }}>
            O seu nome
          </label>
          <input
            id="nome-alteracao"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="name"
            style={{ flex: 1, minWidth: 0, border: "none", borderBottom: "1.5px solid #E8DCC0", outline: "none", background: "transparent", padding: "0 0 6px", fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontSize: "16px", color: "var(--charcoal)" }}
          />
        </div>

        {erro && (
          <p style={{ fontSize: "12px", lineHeight: 1.6, color: "#9C5A3C", margin: "14px 0 0", textWrap: "pretty" }}>{erro}</p>
        )}

        <CapsulaVazada onClick={enviar} aTrabalhar={aTrabalhar} style={{ marginTop: "20px" }}>
          {aTrabalhar ? "A enviar…" : "Enviar o pedido"}
        </CapsulaVazada>

        <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: "14px 0 0", textAlign: "center", textWrap: "pretty" }}>
          {tipo === "proposta"
            ? "Se preferir falar, o WhatsApp está sempre aberto — mas por escrito não se perde nada pelo caminho."
            : "O orçamento actual mantém-se de pé até sair o novo. Nada se perde entretanto."}
        </p>
      </div>
    </div>
  );
}

// ---------- a vista ----------

export default function DocumentosVista({ token, tipo, reduzir }) {
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);
  // O documento guarda a CHAVE a que pertence; mudou a chave, o derivado
  // volta a null sozinho — sem repor estado dentro do efeito.
  const [docGuardado, setDocGuardado] = useState(null);
  const [estado, setEstado] = useState("a-carregar");
  // 'doc' | 'codigo' | 'alterar' | 'assinar' | 'papel' | 'feito' | 'versao-nova'
  const [passo, setPasso] = useState("doc");
  const [feito, setFeito] = useState(null); // { acto, nome, quando }
  const [nomeAssina, setNomeAssina] = useState("");
  const [fileteCheio, setFileteCheio] = useState(false);
  const [aTrabalhar, setATrabalhar] = useState(false);
  const [erro, setErro] = useState(null);
  const [papelEnviado, setPapelEnviado] = useState(false);
  const [versaoAntiga, setVersaoAntiga] = useState(null);
  const [recarga, setRecarga] = useState(0);

  const sessao = lerSessao(token);
  const sessaoId = sessao?.id || null;

  // O filete da assinatura: 2 500 ms depois de o nome ficar completo, a
  // cápsula acende. É o GESTO DE ESCREVER que agenda — não um efeito a
  // vigiar o estado (a família do bug de produção). Com movimento
  // reduzido não há espera: o filete é desenho, não portão.
  const completo = nomeCompleto(nomeAssina);
  const fileteTimerRef = useRef(null);
  const aoEscreverNome = (v) => {
    setNomeAssina(v);
    if (fileteTimerRef.current) clearTimeout(fileteTimerRef.current);
    if (!nomeCompleto(v)) {
      setFileteCheio(false);
    } else if (reduzir) {
      setFileteCheio(true);
    } else {
      setFileteCheio(false);
      fileteTimerRef.current = setTimeout(() => setFileteCheio(true), 2500);
    }
  };

  useEffect(() => {
    let cancelado = false;
    getDocumentosPortal(token)
      .then((m) => {
        if (cancelado) return;
        if (m?.estado !== "activo") {
          setEstado("terminado");
          return;
        }
        setMeta(m);
        setEstado("pronto");
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado) setEstado("erro");
      });
    return () => {
      cancelado = true;
    };
  }, [token, recarga]);

  const metaDoc = meta?.documentos?.find((d) => d.tipo === tipo) || null;

  const chaveDoc = `${tipo}|${sessaoId}|${versaoAntiga}|${recarga}`;
  useEffect(() => {
    if (!tipo || estado !== "pronto") return;
    let cancelado = false;
    verDocumentoPortal(token, tipo, sessaoId, versaoAntiga)
      .then((d) => {
        if (!cancelado) setDocGuardado({ chave: chaveDoc, dados: d });
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado) setDocGuardado({ chave: chaveDoc, dados: { estado: "erro" } });
      });
    return () => {
      cancelado = true;
    };
    // sessaoId entra de propósito: verificar o código recarrega o documento
    // já sem véu.
  }, [token, tipo, estado, sessaoId, versaoAntiga, recarga, chaveDoc]);

  const doc = docGuardado?.chave === chaveDoc ? docGuardado.dados : null;

  const recarregarMeta = async () => setRecarga((r) => r + 1);

  const agir = async (acto, nome, mensagem) => {
    setATrabalhar(true);
    setErro(null);
    try {
      const r = await registarActo(token, tipo, sessaoId, acto, nome, mensagem, doc?.versao);
      if (r?.estado === "versao_mudou") {
        // Saiu versão nova enquanto ela lia. O acto NÃO se gravou — e é
        // isso que se lhe diz, com o caminho à frente.
        setErro(
          `Entretanto saiu uma versão nova (versão ${r.versao}). Recarregue a página e leia-a antes de responder — a sua resposta não foi registada.`,
        );
      } else if (r?.estado === "ok" || r?.estado === "ja_feito") {
        setFeito({ acto, nome, quando: r?.quando || new Date().toISOString() });
        setPasso("feito");
        setRecarga((x) => x + 1);
      } else if (r?.estado === "precisa_codigo") {
        setPasso("codigo");
      } else if (r?.estado === "nome_em_falta") {
        setErro("Falta o nome completo.");
      } else {
        setErro("Não foi possível registar. Tente novamente.");
      }
    } catch (e) {
      console.error(e);
      setErro("Não foi possível registar. Verifique a ligação e tente novamente.");
    } finally {
      setATrabalhar(false);
    }
  };

  // ---------- estados de moldura ----------
  if (estado === "a-carregar") {
    return (
      <div style={{ padding: "34px 26px" }}>
        <Esqueleto w={150} h={12} style={{ margin: "0 auto 14px" }} />
        <Esqueleto w={240} h={24} style={{ margin: "0 auto 26px" }} />
        <Esqueleto w="100%" h={150} r={14} style={{ marginBottom: "14px" }} />
        <Esqueleto w="100%" h={150} r={14} />
      </div>
    );
  }
  if (estado === "terminado" || estado === "erro") {
    // A cortina de sempre vive na página; aqui basta devolver ao topo.
    return (
      <div style={{ padding: "44px 26px", textAlign: "center" }}>
        <p style={{ ...playfair, fontSize: "20px", lineHeight: 1.4, textWrap: "balance" }}>
          {estado === "terminado"
            ? "Esta ligação já não abre os documentos."
            : "Não foi possível abrir os documentos."}
        </p>
        <p style={{ fontSize: "12.5px", color: "var(--gray-mid)", marginTop: "12px" }}>
          {estado === "terminado"
            ? "Se precisar deles, fale connosco pelo WhatsApp."
            : "Verifique a ligação à internet e recarregue a página."}
        </p>
      </div>
    );
  }

  // ---------- a lista ----------
  if (!tipo) return <Lista token={token} meta={meta} />;

  // ---------- um documento ----------
  const rotulo = ROTULO_DOCUMENTO[tipo] || "Documento";
  const voltarLista = () => navigate(`/acompanhar/${token}/documentos`);

  if (!metaDoc || doc?.estado === "nada") {
    return (
      <div style={{ padding: "44px 26px", textAlign: "center" }}>
        <p style={overline()}>{rotulo}</p>
        <p style={{ ...playfair, fontSize: "20px", lineHeight: 1.4, marginTop: "12px", textWrap: "balance" }}>
          Ainda não existe.
        </p>
        <div style={{ marginTop: "22px" }}>
          <LigacaoDiscreta onClick={voltarLista}>Os seus documentos</LigacaoDiscreta>
        </div>
      </div>
    );
  }

  if (!doc || doc.estado === "erro") {
    return (
      <div style={{ padding: "34px 26px" }}>
        {doc?.estado === "erro" ? (
          <p style={{ fontSize: "12.5px", color: "var(--gray-mid)", textAlign: "center" }}>
            Não foi possível abrir. Verifique a ligação e recarregue.
          </p>
        ) : (
          <>
            <Esqueleto w="100%" h={120} r={2} style={{ marginBottom: "10px" }} />
            <Esqueleto w="100%" h={300} r={2} />
          </>
        )}
      </div>
    );
  }

  const assinado = doc.acto?.acto === "assinou";
  const versaoNova = !doc.acto && metaDoc.acto_anterior && !versaoAntiga;

  // ── o interstício da versão nova ──
  if (versaoNova && passo === "doc" && !sessionStorage.getItem(`dlm_vnova_${token}_${tipo}_${doc.versao}`)) {
    const ant = metaDoc.acto_anterior;
    return (
      <div style={{ padding: "34px 26px 32px" }}>
        <p style={overline()}>O seu {rotulo.toLowerCase()} mudou</p>
        <p style={{ ...playfair, fontSize: "21px", lineHeight: 1.32, marginTop: "11px", textWrap: "balance" }}>
          Saiu um {rotulo.toLowerCase()} novo{tipo === "orcamento" ? ", com o que nos pediu" : ""}.
        </p>
        <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "11px 0 0", textWrap: "pretty" }}>
          Esta é a versão {doc.versao}, de {diaEMes(doc.publicado_em)}.
        </p>

        <div style={{ marginTop: "22px", paddingTop: "18px", borderTop: "1px solid #F0E6D0", display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <div style={{ width: "26px", height: "26px", borderRadius: "50%", backgroundColor: "#FEF9EC", border: "1px solid #E8D5A3", flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <VistoDourado />
          </div>
          <div>
            <p style={{ fontSize: "12.5px", fontWeight: 500, lineHeight: 1.5, margin: 0, color: "var(--charcoal)" }}>
              A sua resposta de {diaEMes(ant.acto_em)} fica onde está.
            </p>
            <p style={{ fontSize: "11.5px", lineHeight: 1.7, color: "#9B9B9B", margin: "6px 0 0", textWrap: "pretty" }}>
              Vale para a versão {ant.versao}, a que leu nesse dia, e não se
              apaga. Esta é outra — por isso pede uma resposta nova.
            </p>
          </div>
        </div>

        <CapsulaVazada
          onClick={() => {
            sessionStorage.setItem(`dlm_vnova_${token}_${tipo}_${doc.versao}`, "1");
            setRecarga((r) => r + 1);
          }}
          style={{ marginTop: "22px" }}
        >
          Abrir o {rotulo.toLowerCase()} novo
        </CapsulaVazada>
        <div style={{ textAlign: "center", marginTop: "15px" }}>
          <LigacaoDiscreta onClick={() => setVersaoAntiga(ant.versao)} apagada>
            Ver a versão {ant.versao}, como respondeu
          </LigacaoDiscreta>
        </div>
      </div>
    );
  }

  // ── os passos por cima do documento ──
  if (passo === "codigo") {
    return (
      <FluxoCodigo
        token={token}
        tipo={tipo}
        versao={doc.versao}
        meta={meta}
        onRecarregarMeta={recarregarMeta}
        onVerificado={() => {
          setPasso("doc");
          setRecarga((r) => r + 1);
        }}
      />
    );
  }

  if (passo === "alterar") {
    return (
      <PedirAlteracao
        token={token}
        tipo={tipo}
        doc={doc}
        sessaoId={sessaoId}
        onVoltar={() => setPasso("doc")}
        onEnviado={() => {
          setFeito({ acto: "pediu_alteracao", quando: new Date().toISOString() });
          setPasso("feito");
          setRecarga((r) => r + 1);
        }}
      />
    );
  }

  if (passo === "papel") {
    const enviarFicheiro = async (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      setATrabalhar(true);
      setErro(null);
      try {
        await enviarContratoAssinado(token, f);
        setPapelEnviado(true);
      } catch (err) {
        console.error(err);
        setErro("Não foi possível carregar. Verifique a ligação e tente novamente.");
      } finally {
        setATrabalhar(false);
      }
    };
    return (
      <div>
        <TiraContexto
          titulo={`Contrato · versão ${doc.versao}`}
          direita={<LigacaoDiscreta onClick={() => setPasso("doc")} apagada style={{ fontSize: "10.5px" }}>assinar aqui em vez disso</LigacaoDiscreta>}
        />
        <div style={{ padding: "30px 26px 0" }}>
          <p style={overline()}>Assinar em papel</p>
          <p style={{ ...playfair, fontSize: "21px", lineHeight: 1.32, marginTop: "11px", textWrap: "balance" }}>
            Também se faz à mão.
          </p>
          <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "10px 0 0", textWrap: "pretty" }}>
            Vale exactamente o mesmo. Só leva mais um dia ou dois.
          </p>

          <div style={{ marginTop: "22px" }}>
            {[
              ["1", "Imprima o contrato", "Ou guarde-o e leve-o a imprimir — a ligação está aqui em baixo."],
              ["2", "Assine na última folha", "Com a data do dia em que assinar."],
              ["3", "Fotografe e carregue aqui", "Uma fotografia bem tirada serve. Confirmamos e avisamos aqui."],
            ].map(([n, titulo, nota]) => (
              <div key={n} style={{ display: "grid", gridTemplateColumns: "30px 1fr", gap: "14px", padding: "16px 0", borderTop: "1px solid #F0E6D0" }}>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: "22px", lineHeight: 1, color: "var(--gold)", fontVariantNumeric: "tabular-nums", margin: 0 }}>{n}</p>
                <div>
                  <p style={{ fontSize: "13px", fontWeight: 500, lineHeight: 1.4, margin: 0, color: "var(--charcoal)" }}>{titulo}</p>
                  <p style={{ fontSize: "11.5px", lineHeight: 1.7, color: "#9B9B9B", margin: "5px 0 0", textWrap: "pretty" }}>{nota}</p>
                </div>
              </div>
            ))}
          </div>

          <CapsulaVazada onClick={() => window.print()} style={{ marginTop: "20px" }}>
            Imprimir o contrato
          </CapsulaVazada>

          <div style={{ marginTop: "16px", backgroundColor: "#FDFBF5", border: "1px solid #E8DCC0", padding: "20px", textAlign: "center" }}>
            <p style={overline("#9B9B9B", "0.22em", "9px")}>Quando estiver assinado</p>
            {papelEnviado ? (
              <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "11px 0 0", textWrap: "pretty" }}>
                Chegou. A Nádia confirma e o contrato fecha-se aqui — receberá
                um aviso.
              </p>
            ) : (
              <>
                <label style={{ display: "inline-block", marginTop: "11px", fontSize: "12.5px", letterSpacing: "0.02em", borderBottom: "1px solid #E8D5A3", paddingBottom: "3px", cursor: "pointer", color: "var(--charcoal)" }}>
                  {aTrabalhar ? "A carregar…" : "Carregar o contrato assinado"}
                  <input type="file" accept="image/*,.pdf" onChange={enviarFicheiro} style={{ display: "none" }} />
                </label>
                <p style={{ fontSize: "11px", lineHeight: 1.65, color: "#9B9B9B", margin: "11px 0 0", textWrap: "pretty" }}>
                  Uma fotografia bem tirada serve. Confirmamos e avisamos aqui.
                </p>
              </>
            )}
            {erro && <p style={{ fontSize: "11.5px", color: "#9C5A3C", margin: "10px 0 0" }}>{erro}</p>}
          </div>

          <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: "18px 0 0", textAlign: "center", textWrap: "pretty" }}>
            Em papel, a data que conta é a que escrever na folha.
          </p>
        </div>
      </div>
    );
  }

  if (passo === "feito" && feito) {
    const ehAssinatura = feito.acto === "assinou";
    const ehAlteracao = feito.acto === "pediu_alteracao";
    return (
      <div style={{ padding: "34px 26px 32px" }}>
        <div style={{ position: "relative", marginTop: "18px" }}>
          <CartaoBranco padding="30px 20px 22px" style={{ textAlign: "center" }}>
            <Medalhao />
            <p style={overline()}>
              {ehAssinatura ? "Está assinado" : ehAlteracao ? "Seguiu" : tipo === "proposta" ? "Aprovado" : "Aceite"}
            </p>
            <p style={{ ...playfair, fontSize: ehAssinatura ? "23px" : "22px", lineHeight: 1.3, marginTop: "10px", textWrap: "balance" }}>
              {ehAssinatura
                ? "O contrato ficou fechado."
                : ehAlteracao
                  ? "O seu pedido seguiu."
                  : `O ${rotulo.toLowerCase()} está ${tipo === "proposta" ? "aprovado" : "aceite"}.`}
            </p>
            <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "11px 0 0", textWrap: "pretty" }}>
              {ehAssinatura
                ? "Não muda mais — nem do seu lado nem do nosso."
                : ehAlteracao
                  ? `Respondemos com um ${rotulo.toLowerCase()} novo. O actual mantém-se de pé até lá.`
                  : "Guardámos a versão que leu, tal como estava no momento em que respondeu."}
            </p>
          </CartaoBranco>
        </div>

        {!ehAlteracao && (
          <div style={{ marginTop: "26px" }}>
            <p style={overline("#9B9B9B", "0.22em", "9px")}>O que ficou registado</p>
            <BlocoRegisto
              linhas={[
                ...(feito.nome ? [["Assinado por", feito.nome]] : []),
                ["Versão", `Versão ${doc.versao}, de ${diaEMes(doc.publicado_em)}`],
                ["Data e hora", `${diaMesAno(feito.quando)}, às ${horaCurta(feito.quando)}`],
                ["Verificação", "Com o código que a Nádia lhe enviou"],
              ]}
            />
            <div style={{ textAlign: "center", marginTop: "20px" }}>
              <LigacaoDiscreta onClick={() => { setPasso("doc"); setRecarga((r) => r + 1); }}>
                Ver o {rotulo.toLowerCase()} como o {ehAssinatura ? "assinou" : tipo === "proposta" ? "aprovou" : "aceitou"}
              </LigacaoDiscreta>
            </div>
          </div>
        )}

        <div style={{ marginTop: "30px", paddingTop: "19px", borderTop: "1px solid #F0E6D0" }}>
          <p style={overline("#9B9B9B", "0.22em", "9px")}>O que vem a seguir</p>
          <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "11px 0 0", textWrap: "pretty" }}>
            {ehAssinatura
              ? "A preparação. Fechamos as compras e as listas na semana antes do dia — e é aqui que lhe contamos."
              : ehAlteracao
                ? "A Nádia lê o seu pedido e responde pela conversa que já tem consigo — e o documento novo aparece aqui."
                : tipo === "proposta"
                  ? "O contrato. Passamos a escrito o que ficou combinado e avisamos quando estiver aqui para ler."
                  : "O projecto da mesa. Desenhamo-lo com o que nos contou e avisamos quando estiver aqui para ver."}
          </p>
        </div>

        <Assinatura style={{ marginTop: "30px" }} />
      </div>
    );
  }

  // ── o contrato assinado, em repouso ──
  // `versaoAntiga` é a saída do «ler por inteiro»: sem esta guarda, o
  // repouso engolia o pedido e a leitura completa nunca abria.
  if (tipo === "contrato" && assinado && !versaoAntiga) {
    const inst = doc.instantaneo || {};
    const clausulas = Array.isArray(inst.__contrato?.clausulas) ? inst.__contrato.clausulas : [];
    return (
      <div style={{ padding: "22px 16px 30px" }}>
        <Folha selada>
          <FaixaSelo
            visto={<VistoDourado />}
            quem={doc.acto?.nome || "si"}
            quando={`${dataPorExtenso(String(doc.acto?.quando || "").slice(0, 10))} às ${horaCurta(doc.acto?.quando)}`}
          />
          <div style={{ padding: "22px 22px 24px" }}>
            <div style={{ textAlign: "center" }}>
              <img src={logoUrl} alt="Do Luxo à Mesa" style={{ width: "74px", height: "auto", display: "block", margin: "0 auto", opacity: 0.8 }} />
              <SeloVersao versao={doc.versao} quando={doc.publicado_em} comDe={false} style={{ marginTop: "14px" }} />
            </div>
            <div style={{ marginTop: "20px", paddingTop: "18px", borderTop: "1px solid #F3EBDA" }}>
              <CorpoContrato doc={doc} resumoSo />
            </div>
            <div style={{ margin: "20px 22px 0", paddingTop: "16px", borderTop: "1px solid #F3EBDA" }}>
              <p style={overline("#9B9B9B", "0.22em", "9px")}>
                As {clausulas.length} cláusulas
              </p>
              <p style={{ fontSize: "11.5px", lineHeight: 1.95, color: "#9B9B9B", margin: "9px 0 0", textWrap: "pretty" }}>
                {clausulas.map((c) => c.titulo).join(" · ")}
              </p>
              <div style={{ marginTop: "10px" }}>
                <LigacaoDiscreta onClick={() => setVersaoAntiga(doc.versao)}>
                  Ler o contrato por inteiro
                </LigacaoDiscreta>
              </div>
            </div>
          </div>
        </Folha>

        <div style={{ marginTop: "18px", textAlign: "center" }}>
          <p style={{ fontSize: "11.5px", lineHeight: 1.75, color: "#9B9B9B", margin: 0, textWrap: "pretty" }}>
            Este documento está fechado. Se houver um erro, faz-se um contrato
            novo — este fica como está.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "20px", marginTop: "15px" }}>
            <LigacaoDiscreta onClick={() => window.print()}>Imprimir em A4</LigacaoDiscreta>
            <LigacaoDiscreta onClick={voltarLista} apagada>Os seus documentos</LigacaoDiscreta>
          </div>
        </div>
      </div>
    );
  }

  // ── o documento, com o acto no pé ──
  const veiado = !!doc.velado;
  const jaRespondeu = !!doc.acto;

  return (
    <div className="acomp-imprimivel" style={{ padding: "22px 16px 26px" }}>
      <Folha>
        {tipo === "orcamento" && <CorpoOrcamento doc={doc} />}
        {tipo === "proposta" && <CorpoProjecto doc={doc} />}
        {tipo === "contrato" && (
          <>
            <Timbre logoUrl={logoUrl} nome="Contrato" versao={doc.versao} quando={doc.publicado_em} />
            <CorpoContrato doc={doc} />
            <div style={{ padding: "22px 22px 0" }}>
              <div aria-hidden="true" style={{ height: "1px", width: "26px", background: "linear-gradient(90deg, #E8D5A3, rgba(232,213,163,0))" }} />
              <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: "14px 0 24px", textWrap: "pretty" }}>
                Este contrato ainda pode mudar. Fecha no momento em que o
                assinar.
              </p>
            </div>
          </>
        )}

        {/* ── O VÉU E O CAMINHO DO CÓDIGO ── */}
        {veiado && !versaoAntiga && (
          <div style={{ margin: "0 22px 24px", backgroundColor: "white", border: "1.5px solid #F0E6D0", borderRadius: "14px", padding: "20px 18px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
            <p style={overline()}>Os valores</p>
            <p style={{ ...playfair, fontSize: "19px", lineHeight: 1.32, marginTop: "10px", textWrap: "balance" }}>
              Os valores mostram-se a quem é da casa.
            </p>
            <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "10px 0 0", textWrap: "pretty" }}>
              Esta ligação pode passar por outras mãos. Para os abrir, a Nádia
              envia-lhe um código de seis dígitos pela conversa que já tem
              consigo.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #F3EBDA" }}>
              <div aria-hidden="true" style={{ width: "40px", height: "40px", borderRadius: "50%", background: "repeating-linear-gradient(45deg, #F2ECDF 0 5px, #FAF7EF 5px 11px)", border: "1px solid #E8DCC0", flex: "none" }} />
              <div>
                <p style={{ fontSize: "12.5px", fontWeight: 500, lineHeight: 1.35, margin: 0, color: "var(--charcoal)" }}>A Nádia</p>
                <p style={{ fontSize: "11px", lineHeight: 1.5, color: "#9B9B9B", margin: "3px 0 0" }}>
                  Do Luxo à Mesa · não é automático, é ela que o envia
                </p>
              </div>
            </div>
            <CapsulaVazada
              aTrabalhar={aTrabalhar}
              onClick={async () => {
                setATrabalhar(true);
                try {
                  await pedirCodigo(token, tipo);
                  await recarregarMeta();
                  setPasso("codigo");
                } catch (e) {
                  console.error(e);
                } finally {
                  setATrabalhar(false);
                }
              }}
              style={{ marginTop: "18px" }}
            >
              {meta?.verificacao?.estado === "emitido" || meta?.verificacao?.estado === "pedido"
                ? "Já pedi · continuar"
                : "Pedir o código"}
            </CapsulaVazada>
          </div>
        )}

        {/* ── O PÉ DO ACTO ── */}
        {!veiado && !jaRespondeu && !versaoAntiga && tipo !== "contrato" && (
          <div style={{ backgroundColor: "#FDFBF5", borderTop: "1px solid #E8D5A3", padding: "22px" }}>
            <p style={overline()}>A sua resposta</p>
            <p style={{ ...playfair, fontSize: "19px", lineHeight: 1.32, marginTop: "10px", textWrap: "balance" }}>
              {tipo === "proposta" ? "É esta a mesa que imaginou?" : "Está de acordo com este orçamento?"}
            </p>
            <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "10px 0 0", textWrap: "pretty" }}>
              {tipo === "proposta"
                ? `Aprova a versão ${doc.versao}, de ${diaEMes(doc.publicado_em)}. É por ela que compramos as flores e montamos no dia.`
                : `Responde à versão ${doc.versao}, de ${diaEMes(doc.publicado_em)} — a que tem aqui em cima. Se aceitar, desenhamos o projecto a seguir.`}
            </p>

            {/* O aceite também é um acto com nome escrito. */}
            <div style={{ marginTop: "16px", display: "flex", alignItems: "baseline", gap: "10px" }}>
              <label htmlFor="nome-acto" style={{ ...overline("#9B9B9B", "0.16em", "9px"), flex: "none" }}>
                O seu nome
              </label>
              <input
                id="nome-acto"
                value={nomeAssina}
                onChange={(e) => setNomeAssina(e.target.value)}
                autoComplete="name"
                style={{ flex: 1, minWidth: 0, border: "none", borderBottom: "1.5px solid #E8DCC0", outline: "none", background: "transparent", padding: "0 0 6px", fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontSize: "16px", color: "var(--charcoal)" }}
              />
            </div>
            {erro && <p style={{ fontSize: "12px", color: "#9C5A3C", margin: "12px 0 0" }}>{erro}</p>}

            <Dupla
              rotuloPrimario={aTrabalhar ? "…" : tipo === "proposta" ? "Aprovar" : "Aceitar"}
              rotuloSecundario="Pedir alteração"
              aTrabalhar={aTrabalhar}
              onPrimario={() => {
                if (!naoVazia(nomeAssina)) {
                  setErro("Escreva o seu nome — é ele que fica no registo.");
                  return;
                }
                agir("aceitou", nomeAssina);
              }}
              onSecundario={() => setPasso("alterar")}
              linhaDeBaixo={
                tipo === "proposta"
                  ? "Mexer no projecto é para isto que ele serve — vale a pena mexer agora, não no dia."
                  : "Pedir alteração é tão comum como aceitar. Quase todos os orçamentos mudam uma vez antes de ficarem certos."
              }
            />
          </div>
        )}

        {/* ── A ASSINATURA DO CONTRATO ── */}
        {!veiado && !jaRespondeu && !versaoAntiga && tipo === "contrato" && (
          <div style={{ backgroundColor: "#FDFBF5", borderTop: "1px solid #E8D5A3", padding: "22px" }}>
            <p style={overline()}>A assinatura</p>
            <p style={{ ...playfair, fontSize: "20px", lineHeight: 1.32, marginTop: "10px", textWrap: "balance" }}>
              O que fica assinado
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "15px" }}>
              {[
                doc.instantaneo?.tipoEvento && doc.instantaneo?.dataEvento
                  ? `A decoração para ${doc.instantaneo.tipoEvento}, a ${dataPorExtenso(doc.instantaneo.dataEvento)}.`
                  : "A decoração do seu evento, na data combinada.",
                doc.instantaneo?.valor
                  ? `O valor de ${formatarEuroPT(doc.instantaneo.valor)}, nas condições das cláusulas.`
                  : "O valor e as condições das cláusulas.",
                `A versão ${doc.versao} deste contrato, de ${diaEMes(doc.publicado_em)} — a que acabou de ler.`,
                "Que depois de assinado não muda mais, nem do seu lado nem do nosso.",
              ].map((r, i) => (
                <div key={i} style={{ display: "flex", gap: "11px", alignItems: "flex-start" }}>
                  <div aria-hidden="true" style={{ width: "5px", height: "5px", backgroundColor: "var(--gold)", transform: "rotate(45deg)", flex: "none", marginTop: "6px" }} />
                  <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--charcoal)", margin: 0, textWrap: "pretty" }}>{r}</p>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "9px", alignItems: "flex-start", marginTop: "18px", paddingTop: "16px", borderTop: "1px solid #F0E6D0" }}>
              <div style={{ width: "16px", height: "16px", borderRadius: "50%", backgroundColor: "#FEF9EC", border: "1px solid #E8D5A3", flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <VistoDourado />
              </div>
              <p style={{ fontSize: "11px", lineHeight: 1.6, color: "#9B9B9B", margin: 0, fontVariantNumeric: "tabular-nums", textWrap: "pretty" }}>
                {sessao ? "Sessão verificada com o código que a Nádia lhe enviou." : "A assinatura pede o código que a Nádia lhe envia."}
              </p>
            </div>

            <CampoAssinatura nome={nomeAssina} onNome={aoEscreverNome} completo={completo} />
            {erro && <p style={{ fontSize: "12px", color: "#9C5A3C", margin: "12px 0 0", textAlign: "center" }}>{erro}</p>}

            <button
              onClick={() => fileteCheio && agir("assinou", nomeAssina)}
              disabled={!fileteCheio || aTrabalhar}
              style={{
                display: "block", width: "100%", boxSizing: "border-box",
                textAlign: "center", marginTop: "20px",
                font: "600 11px Inter, sans-serif", letterSpacing: "0.14em",
                textTransform: "uppercase", borderRadius: "999px", padding: "14px 20px",
                fontFamily: "Inter, sans-serif",
                color: fileteCheio ? "#FFFDF7" : "#C6BEAE",
                backgroundColor: fileteCheio ? "#A07830" : "white",
                border: `1px solid ${fileteCheio ? "#A07830" : "#EFE7D6"}`,
                cursor: fileteCheio ? (aTrabalhar ? "wait" : "pointer") : "default",
                transition: "background-color 140ms ease, color 140ms ease",
              }}
            >
              {aTrabalhar ? "A assinar…" : "Assinar o contrato"}
            </button>

            <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: "16px 0 0", textAlign: "center" }}>
              Prefere em papel?{" "}
              <LigacaoDiscreta onClick={() => setPasso("papel")} style={{ fontSize: "11px" }}>
                Descarregar para assinar à mão
              </LigacaoDiscreta>
            </p>
          </div>
        )}

        {/* Já respondeu a esta versão: o pé recolhe para uma linha. */}
        {jaRespondeu && !assinado && (
          <div style={{ display: "flex", gap: "10px", alignItems: "center", justifyContent: "center", backgroundColor: "#FDFBF5", borderTop: "1px solid #E8D5A3", padding: "16px 22px" }}>
            <VistoDourado />
            <p style={{ fontSize: "12px", color: "var(--gray-mid)", margin: 0, fontVariantNumeric: "tabular-nums" }}>
              {doc.acto.acto === "pediu_alteracao"
                ? `Pediu uma alteração a ${diaEMes(doc.acto.quando)} — estamos a tratar dela.`
                : `${tipo === "proposta" ? "Aprovado" : "Aceite"} por ${doc.acto.nome} a ${diaEMes(doc.acto.quando)}.`}
            </p>
          </div>
        )}
      </Folha>

      <div style={{ marginTop: "16px", textAlign: "center", display: "flex", justifyContent: "center", gap: "20px" }}>
        <LigacaoDiscreta onClick={() => window.print()} apagada>
          Imprimir em A4
        </LigacaoDiscreta>
        {versaoAntiga ? (
          <LigacaoDiscreta onClick={() => setVersaoAntiga(null)}>
            Voltar à versão actual
          </LigacaoDiscreta>
        ) : (
          <LigacaoDiscreta onClick={voltarLista} apagada>
            Os seus documentos
          </LigacaoDiscreta>
        )}
      </div>

      {/* A impressão A4: só a folha fica visível — o mesmo truque do
          GerarContrato, para o browser imprimir papel e não a página. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .acomp-imprimivel, .acomp-imprimivel * { visibility: visible; }
          .acomp-imprimivel { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
