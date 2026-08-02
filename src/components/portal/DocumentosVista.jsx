import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import logoUrl from "../../assets/logo.png";
import { Esqueleto } from "../admin/acabamento";
import {
  overline, playfair, diaMesAno, diaEMes, horaCurta, formatarEuroPT,
  WHATSAPP_URL, lerSessao, guardarSessao, esquecerSessao, diferencasDeOrcamento,
} from "./base";
import {
  FileteComLosango, CartaoBranco, Medalhao, EngasteVazio, VistoDourado,
  CabecalhoDivisao, Assinatura,
} from "./pecas";
import {
  SeloVersao, Folha, Timbre, LinhaServico, TotalOrcamento, CapsulaCheia,
  TiraContexto, Dupla, CapsulaVazada, LigacaoDiscreta, CelulasCodigo,
  BlocoRecusa, BlocoRegisto, FaixaSelo, CampoAssinatura, CampoRecado,
  EngasteTirar, TituloDocumento, VeuValor, EstiloImpressao,
} from "./documentos-pecas";
import {
  getDocumentosPortal, verDocumentoPortal, pedirCodigo, verificarCodigo,
  registarActo, enviarContratoAssinado, ROTULO_DOCUMENTO,
} from "../../lib/portal";
import { dataPorExtenso } from "../admin/orcamentos/contratoConfig";

// ============================================================
// AvisoVersaoNova — o interstício de quando o documento mudou.
// ============================================================
// Ela já tinha respondido, e saiu versão nova. Este ecrã diz-lhe três
// coisas antes de a deixar entrar: que mudou, que a resposta antiga fica
// de pé, e — no orçamento — O QUE mudou.
//
// O cartão das diferenças foi a peça que faltava. Sem ele, «saiu um
// orçamento novo, com o que nos pediu» obriga-a a comparar duas folhas de
// cabeça para descobrir se o que pediu está lá. Com ele, lê em cinco
// segundos e confia.
//
// Só no orçamento, e só se a versão anterior chegar: se a rede falhar, o
// cartão não aparece e o resto do ecrã fica igual — nunca se mostra um
// esqueleto de uma coisa que talvez não exista.
function CartaoDiferencas({ dif, velado }) {
  // A chave leva o grupo e a posição, nunca o texto: um orçamento pode ter
  // duas linhas com a mesma descrição, e aí a chave repetia-se.
  const linha = (k, texto, cor, sinal) => (
    <div key={k} style={{ display: "flex", gap: "9px", alignItems: "baseline", padding: "3px 0" }}>
      <span style={{ color: cor, fontSize: "12px", lineHeight: 1.6, flex: "none", width: "9px" }}>{sinal}</span>
      <span style={{ fontSize: "12.5px", lineHeight: 1.6, color: "var(--charcoal)", textWrap: "pretty" }}>{texto}</span>
    </div>
  );

  const euro = (v) => (velado ? null : formatarEuroPT(Number(v) || 0));

  return (
    <div style={{ marginTop: "20px", border: "1px solid #F0E6D0", borderRadius: "3px", backgroundColor: "#FEFCF7", padding: "15px 17px" }}>
      <p style={{ ...overline(), marginBottom: "9px" }}>O que mudou</p>

      {dif.entraram.map((l, i) =>
        linha(
          `e${i}`,
          velado || l.valor == null
            ? `Entrou: ${l.nome}`
            : `Entrou: ${l.nome} — ${euro(l.valor)}`,
          "#5B7B5B",
          "+",
        ),
      )}

      {dif.mudaram.map((l, i) => {
        const partes = [];
        if (l.qtdMudou) partes.push(`de ${l.qtdAntes} para ${l.qtdDepois}`);
        if (l.valorMudou) partes.push(`${euro(l.valorAntes)} → ${euro(l.valorDepois)}`);
        return linha(`m${i}`, `${l.nome}: ${partes.join(", ")}`, "var(--gold-dark)", "·");
      })}

      {dif.sairam.map((l, i) => linha(`s${i}`, `Saiu: ${l.nome}`, "#9C5A3C", "−"))}

      {!velado && dif.totalMudou && (
        <p style={{ fontSize: "12.5px", lineHeight: 1.6, color: "var(--charcoal)", margin: "11px 0 0", paddingTop: "10px", borderTop: "1px solid #F0E6D0", fontVariantNumeric: "tabular-nums" }}>
          Total: {formatarEuroPT(dif.totalAntes)} → <strong style={{ fontWeight: 600 }}>{formatarEuroPT(dif.totalDepois)}</strong>
        </p>
      )}

      {/* Sem sessão verificada, o servidor não manda os valores — nem os de
          agora nem os de antes. Este cartão NÃO PODE dizer se um preço
          mudou, e um cartão chamado «O que mudou» que cala uma alteração de
          preço é pior do que cartão nenhum: dá por completa uma lista que
          não é. Por isso diz-se o que se sabe, e nomeia-se o que falta. */}
      <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: "10px 0 0", textWrap: "pretty" }}>
        {!velado
          ? "A folha completa está a seguir — isto é só o resumo."
          : dif.houve
            ? "Os valores não aparecem aqui sem o código — se algum mudou, este resumo não o mostra. A folha completa está a seguir."
            : "Os serviços são os mesmos. Se algum valor mudou, isso não se vê aqui sem o código."}
      </p>
    </div>
  );
}

function AvisoVersaoNova({ token, tipo, sessaoId, doc, ant, rotulo, onAbrir, onVerAntiga }) {
  const [dif, setDif] = useState(null);

  // Vai buscar a versão a que ela respondeu, só para comparar. Passa pelo
  // mesmo RPC — e portanto pelo mesmo véu.
  useEffect(() => {
    if (tipo !== "orcamento") return undefined;
    let cancelado = false;
    verDocumentoPortal(token, tipo, sessaoId, ant.versao)
      .then((r) => {
        // A RPC devolve o documento DIRECTO — {estado, versao, instantaneo…},
        // sem embrulho. Ler `r.doc` (que não existe) fazia a guarda disparar
        // sempre, e o cartão nunca chegava a ser pintado.
        if (cancelado || r?.estado !== "ok") return;
        const d = diferencasDeOrcamento(r, doc);
        if (d.houve || doc.velado) setDif(d);
      })
      .catch(() => {}); // sem comparação o ecrã continua a servir
    return () => {
      cancelado = true;
    };
  }, [token, tipo, sessaoId, ant.versao, doc]);

  return (
    <div style={{ padding: "34px 26px 32px" }}>
      <p style={overline()}>O seu {rotulo.toLowerCase()} mudou</p>
      <p style={{ ...playfair, fontSize: "21px", lineHeight: 1.32, marginTop: "11px", textWrap: "balance" }}>
        Saiu um {rotulo.toLowerCase()} novo{tipo === "orcamento" ? ", com o que nos pediu" : ""}.
      </p>
      <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "11px 0 0", textWrap: "pretty" }}>
        Esta é a versão {doc.versao}, de {diaEMes(diaLocalISO(doc.publicado_em))}.
      </p>

      {dif && (dif.houve || doc.velado) && (
        <CartaoDiferencas dif={dif} velado={!!doc.velado} />
      )}

      <div style={{ marginTop: "22px", paddingTop: "18px", borderTop: "1px solid #F0E6D0", display: "flex", gap: "12px", alignItems: "flex-start" }}>
        <div style={{ width: "26px", height: "26px", borderRadius: "50%", backgroundColor: "#FEF9EC", border: "1px solid #E8D5A3", flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <VistoDourado />
        </div>
        <div>
          <p style={{ fontSize: "12.5px", fontWeight: 500, lineHeight: 1.5, margin: 0, color: "var(--charcoal)" }}>
            A sua resposta de {diaEMes(diaLocalISO(ant.acto_em))} fica onde está.
          </p>
          <p style={{ fontSize: "11.5px", lineHeight: 1.7, color: "#9B9B9B", margin: "6px 0 0", textWrap: "pretty" }}>
            Vale para a versão {ant.versao}, a que leu nesse dia, e não se
            apaga. Esta é outra — por isso pede uma resposta nova.
          </p>
        </div>
      </div>

      <CapsulaVazada onClick={onAbrir} style={{ marginTop: "22px" }}>
        Abrir o {rotulo.toLowerCase()} novo
      </CapsulaVazada>
      <div style={{ textAlign: "center", marginTop: "15px" }}>
        <LigacaoDiscreta onClick={onVerAntiga} apagada>
          Ver a versão {ant.versao}, como respondeu
        </LigacaoDiscreta>
      </div>
    </div>
  );
}

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

// O dia de calendário LOCAL de um timestamptz. Os carimbos de actos e de
// publicações são instantes — fatiá-los em UTC (slice da string ISO) fazia
// a data fugir um dia para quem lê a oeste de Greenwich. As colunas DATE
// (dataEvento) ficam com partesDaData, que não passa por um Date local.
// (Candidato a subir para base.js quando a área partilhada o adoptar.)
const diaLocalISO = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// O interstício da versão nova dispensa-se uma vez por visita. Com try,
// como o resto do ficheiro: em modo privado o sessionStorage pode recusar,
// e aí o estado local (interVisto) segura a dispensa nesta montagem.
const lerVeuVisto = (token, tipo, versao) => {
  try {
    return sessionStorage.getItem(`dlm_vnova_${token}_${tipo}_${versao}`);
  } catch {
    return null;
  }
};
const marcarVeuVisto = (token, tipo, versao) => {
  try {
    sessionStorage.setItem(`dlm_vnova_${token}_${tipo}_${versao}`, "1");
  } catch {
    /* o estado local segura a dispensa nesta visita */
  }
};

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
    // No calendário de quem lê — o slice UTC podia adiantar (ou atrasar)
    // a validade um dia inteiro.
    return diaLocalISO(d);
  }, [doc.publicado_em, inst.__validadeDias]);

  return (
    <>
      <Timbre logoUrl={logoUrl} nome="Orçamento" versao={doc.versao} quando={diaLocalISO(doc.publicado_em)} />
      {/* O véu explica-se acima da dobra: sem esta linha, a folha abria
          em hachuras sem uma palavra sobre o que são. */}
      {doc.velado && (
        <p style={{ fontSize: "11px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "12px 22px 0", textAlign: "center", textWrap: "pretty" }}>
          Os valores estão velados — o caminho para os abrir está no fim da
          folha.
        </p>
      )}
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
      <Timbre logoUrl={logoUrl} nome="Projecto" versao={doc.versao} quando={diaLocalISO(doc.publicado_em)} />
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
            <div style={{ display: "flex", gap: "11px", alignItems: "flex-start" }}>
              <div aria-hidden="true" style={{ width: "5px", height: "5px", backgroundColor: "var(--gold)", transform: "rotate(45deg)", flex: "none", marginTop: "6px", opacity: 0.55 }} />
              {/* «é de» e a hachura andam juntos: sem o nowrap, a linha
                  partia entre «é» e «de», com o losango a meio. */}
              <p style={{ fontSize: "12px", lineHeight: 1.65, color: "var(--charcoal)", margin: 0 }}>
                O valor do serviço{" "}
                <span style={{ whiteSpace: "nowrap" }}>
                  é de{" "}
                  <span style={{ display: "inline-block", verticalAlign: "middle", marginLeft: "2px" }}>
                    <VeuValor largura={78} altura={13} />
                  </span>
                </span>
              </p>
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

  // A história pela ordem nova (071): orçamento aceite → contrato para
  // assinar → o sinal reserva a data → o projecto desenha-se com ela sua.
  const AINDA_NAO = {
    orcamento: "Ainda não existe. Estamos a prepará-lo com o que nos contou.",
    contrato: "Ainda não existe. Segue para si depois de o orçamento estar aceite.",
    proposta: "Ainda não existe. Desenhamo-lo com a data já reservada.",
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

      {/* Orçamento · Contrato · Projecto — a ordem em que chegam (071). */}
      <div style={{ marginTop: "26px", display: "flex", flexDirection: "column", gap: "14px" }}>
        {["orcamento", "contrato", "proposta"].map((tipo) => {
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
                  <SeloVersao versao={d.versao} quando={diaLocalISO(d.publicado_em)} style={{ marginTop: "7px" }} />
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
                {/* `d.acto` é um TEXTO na projecção da lista («assinou»), e
                    um objecto na do documento aberto. Ler `.acto` aqui dava
                    undefined e caía no último ramo: um contrato assinado
                    dizia «Aceitou-o», e um pedido de alteração também. */}
                {d.acto
                  ? `${actoTexto(d.acto, tipo)} a ${diaEMes(diaLocalISO(d.acto_em))}. Fica guardado tal como o leu nesse dia.`
                  : tipo === "proposta"
                    ? "A sua mesa desenhada — cores, louça, flores e o cenário. Diga-nos se está como imaginou."
                    : tipo === "contrato"
                      ? "O que combinámos, passado a escrito. Leia com calma antes de assinar."
                      : "Os serviços e os valores da sua mesa. Responda quando quiser."}
              </p>
              {espera ? (
                <CapsulaVazada
                  to={`/acompanhar/${token}/documentos/${tipo}`}
                  style={{ marginTop: "15px" }}
                >
                  Abrir o {ROTULO_DOCUMENTO[tipo].toLowerCase()}
                </CapsulaVazada>
              ) : (
                <div style={{ marginTop: "12px" }}>
                  {/* O sublinhado vive num <span> interior: o padding do
                      Link sobe o alvo de toque aos 44px e a margem negativa
                      devolve o espaço — o aspecto não mexe. */}
                  <Link
                    to={`/acompanhar/${token}/documentos/${tipo}`}
                    className="foco"
                    style={{ display: "inline-block", fontSize: "12px", letterSpacing: "0.03em", color: "var(--charcoal)", textDecoration: "none", padding: "12px 10px", margin: "-12px -10px" }}
                  >
                    <span style={{ borderBottom: "1px solid #E8D5A3", paddingBottom: "3px" }}>
                      Ver o {ROTULO_DOCUMENTO[tipo].toLowerCase()}
                    </span>
                  </Link>
                </div>
              )}
            </CartaoBranco>
          );
        })}
      </div>

      {/* O caminho de regresso — a área não pode ser um beco. O mesmo
          desenho da porta discreta da jornada, no sentido inverso. */}
      <p style={{ textAlign: "center", marginTop: "28px" }}>
        <Link
          to={`/acompanhar/${token}`}
          className="foco"
          style={{ display: "inline-block", fontSize: "12px", letterSpacing: "0.03em", color: "var(--gray-mid)", textDecoration: "none", padding: "12px 10px", margin: "-12px -10px" }}
        >
          <span style={{ borderBottom: "1px solid #E8D5A3", paddingBottom: "3px" }}>
            Voltar ao acompanhamento
          </span>
        </Link>
      </p>

      <Assinatura style={{ marginTop: "32px" }} />
    </div>
  );
}

// ---------- o fluxo do código ----------

function FluxoCodigo({ token, tipo, versao, meta, motivo, onVerificado, onVoltar, onRecarregarMeta, modoInicial }) {
  // O «agora» fixa-se quando o ecrã abre: o render tem de ser puro, e a
  // pergunta «já passaram duas horas?» não precisa de relógio vivo.
  const [agora] = useState(() => new Date().getTime());
  // 'pedir' | 'espera' | 'celulas' | 'recusado' — a entrada decide-se pelo
  // estado do pedido: código emitido vai direito às células, pedido entra
  // na espera, e sem pedido nenhum (sessão morta, chegada por outro
  // documento) pede-se — nunca se pedem seis dígitos que nunca foram
  // enviados.
  const v = meta?.verificacao;
  // `modoInicial` manda quando vem: o cartão do véu já disse o estado por
  // palavras, e «Já tenho o código» tem de aterrar nas células — não na
  // espera a repetir o que o cartão acabou de dizer.
  const [modo, setModo] = useState(
    modoInicial ||
      (v?.estado === "pedido" ? "espera" : v?.estado === "emitido" ? "celulas" : "pedir"),
  );
  const [codigo, setCodigo] = useState("");
  const [aTrabalhar, setATrabalhar] = useState(false);
  const [recusa, setRecusa] = useState(null);
  // Rede em baixo não é recusa: o erro fica no lugar do gesto e o modo
  // 'recusado' reserva-se às respostas do servidor.
  const [erroRede, setErroRede] = useState(null);
  const [erroPedido, setErroPedido] = useState(null);
  const [avisoIncompleto, setAvisoIncompleto] = useState(false);

  const titulo = `${ROTULO_DOCUMENTO[tipo]} · versão ${versao} · velados`;

  const aoMudarCodigo = (valor) => {
    setCodigo(valor);
    setAvisoIncompleto(false);
    setErroRede(null);
  };

  const verificar = async () => {
    if (aTrabalhar) return;
    if (codigo.length < 6) {
      // A cápsula responde sempre ao toque — nunca é um botão morto.
      setAvisoIncompleto(true);
      return;
    }
    setATrabalhar(true);
    setErroRede(null);
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
      setErroRede("Não foi possível verificar. Verifique a ligação e tente novamente.");
    } finally {
      setATrabalhar(false);
    }
  };

  const pedirOutro = async () => {
    if (aTrabalhar) return;
    setATrabalhar(true);
    setErroPedido(null);
    try {
      await pedirCodigo(token, tipo);
      // Este pedido matou, no servidor, o código anterior e a sessão que ele
      // tivesse aberto (061). A local vai atrás — senão o ecrã continuava a
      // mostrar valores com uma sessão que já não existe.
      esquecerSessao(token);
      await onRecarregarMeta();
      setRecusa(null);
      setModo("espera");
    } catch (e) {
      console.error(e);
      setErroPedido("Não foi possível pedir o código. Verifique a ligação e tente novamente.");
    } finally {
      setATrabalhar(false);
    }
  };

  const pedidoEm = v?.pedido_em || null;
  const esperaLonga =
    pedidoEm && agora - new Date(pedidoEm).getTime() > 2 * 60 * 60 * 1000;

  const faltam = 6 - codigo.length;
  const FALTAM_EXTENSO = ["um", "dois", "três", "quatro", "cinco", "seis"];

  return (
    <div>
      <TiraContexto
        titulo={titulo}
        direita={
          <LigacaoDiscreta onClick={onVoltar} apagada style={{ fontSize: "10.5px", flex: "none" }}>
            voltar ao documento
          </LigacaoDiscreta>
        }
      />

      {/* Ela escreveu um código há minutos e está a ver este ecrã outra vez.
          Sem uma linha a dizer porquê, isto lê-se como avaria — e o que se
          passa é uma regra: assinar não se autoriza com um código que veio
          para ver o orçamento. Diz-se, e diz-se sem culpa nenhuma dela. */}
      {motivo === "outro_documento" && (
        <div style={{ margin: "16px 26px 0", padding: "13px 15px", backgroundColor: "#FEF9EC", border: "1px solid #E8D5A3", borderRadius: "3px" }}>
          <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--charcoal)", margin: 0, textWrap: "pretty" }}>
            O código que usou foi pedido para ver outro documento. Assinar é o
            passo que fecha o contrato — por isso pede um código pedido a
            partir daqui.
          </p>
        </div>
      )}

      {/* Sem código pedido nem emitido — sessão morta, ou um acto que exige
          código pedido a partir daqui. Pedir seis dígitos que nunca foram
          enviados era um beco; primeiro pede-se. */}
      {modo === "pedir" && (
        <div style={{ padding: "38px 26px 0", textAlign: "center" }}>
          <p style={overline()}>O código</p>
          <p id="acomp-passo-titulo" tabIndex={-1} style={{ ...playfair, fontSize: "21px", lineHeight: 1.32, marginTop: "12px", textWrap: "balance", outline: "none" }}>
            Para responder, é preciso o código que a Do Luxo à Mesa lhe envia.
          </p>
          <p style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--gray-mid)", margin: "14px 0 0", textWrap: "pretty" }}>
            Ela envia-lho pela conversa que já tem consigo, no número que
            temos na sua ficha.
          </p>

          <CapsulaVazada onClick={pedirOutro} aTrabalhar={aTrabalhar} style={{ marginTop: "24px" }}>
            {aTrabalhar ? "A pedir…" : "Pedir o código"}
          </CapsulaVazada>
          {erroPedido && (
            <p style={{ fontSize: "12px", lineHeight: 1.6, color: "#9C5A3C", margin: "12px 0 0", textWrap: "pretty" }}>{erroPedido}</p>
          )}

          <div style={{ marginTop: "18px" }}>
            <LigacaoDiscreta href={WHATSAPP_URL} apagada>
              Falar pelo WhatsApp
            </LigacaoDiscreta>
          </div>
        </div>
      )}

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
          <p id="acomp-passo-titulo" tabIndex={-1} style={{ ...playfair, fontSize: "21px", lineHeight: 1.32, marginTop: "12px", textWrap: "balance", outline: "none" }}>
            O pedido ficou com a Do Luxo à Mesa.
          </p>
          <FileteComLosango margem="20px 0" />
          <p style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--gray-mid)", margin: 0, textWrap: "pretty" }}>
            {pedidoEm ? `Pediu-o às ${horaCurta(pedidoEm)}. ` : ""}Não é
            automático — é a casa que envia o código, pela conversa de
            WhatsApp que já tem consigo.
          </p>
          <p style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--gray-mid)", margin: "12px 0 0", textWrap: "pretty" }}>
            Pode fechar esta página. Quando voltar, está tudo como deixou — e o
            código continua a servir.
          </p>

          <div style={{ marginTop: "26px", display: "flex", flexDirection: "column", alignItems: "center", gap: "15px" }}>
            <CapsulaVazada onClick={() => setModo("celulas")} style={{ width: "auto", padding: "15px 26px" }}>
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
          <p id="acomp-passo-titulo" tabIndex={-1} style={{ ...playfair, fontSize: "21px", lineHeight: 1.32, marginTop: "12px", textWrap: "balance", outline: "none" }}>
            Escreva os seis dígitos que a Do Luxo à Mesa lhe enviou.
          </p>

          <div style={{ marginTop: "24px" }}>
            <CelulasCodigo valor={codigo} onValor={aoMudarCodigo} onSubmeter={verificar} aVerificar={aTrabalhar} />
          </div>

          {/* 24 horas por decisão da casa — o desenho dizia trinta minutos
              e perdeu: ela pode só ver o pedido à noite. */}
          <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: "16px 0 0", fontVariantNumeric: "tabular-nums" }}>
            O código vale um dia inteiro, a contar do envio.
          </p>

          <CapsulaVazada onClick={verificar} aTrabalhar={aTrabalhar} style={{ marginTop: "24px", opacity: codigo.length === 6 ? 1 : 0.5 }}>
            {aTrabalhar ? "A abrir…" : "Abrir os valores"}
          </CapsulaVazada>
          {avisoIncompleto && faltam > 0 && (
            <p style={{ fontSize: "12px", lineHeight: 1.6, color: "#9C5A3C", margin: "12px 0 0" }}>
              {faltam === 1 ? "Falta um dígito." : `Faltam ${FALTAM_EXTENSO[faltam - 1]} dígitos.`}
            </p>
          )}
          {erroRede && (
            <p style={{ fontSize: "12px", lineHeight: 1.6, color: "#9C5A3C", margin: "12px 0 0", textWrap: "pretty" }}>{erroRede}</p>
          )}

          <div style={{ marginTop: "26px", paddingTop: "18px", borderTop: "1px solid #F0E6D0", textAlign: "center" }}>
            <LigacaoDiscreta onClick={pedirOutro} apagada>
              Não recebi o código
            </LigacaoDiscreta>
            {erroPedido && (
              <p style={{ fontSize: "12px", lineHeight: 1.6, color: "#9C5A3C", margin: "12px 0 0", textWrap: "pretty" }}>{erroPedido}</p>
            )}
          </div>
        </div>
      )}

      {modo === "recusado" && (
        <div style={{ padding: "38px 26px 0", textAlign: "center" }}>
          <p style={overline()}>O código</p>
          <p id="acomp-passo-titulo" tabIndex={-1} style={{ ...playfair, fontSize: "21px", lineHeight: 1.32, marginTop: "12px", textWrap: "balance", outline: "none" }}>
            Este código não abriu.
          </p>

          <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "22px" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ width: "48px", height: "56px", borderRadius: "8px", backgroundColor: "white", border: "1px solid #E8DCC0" }} />
            ))}
          </div>

          <BlocoRecusa
            facto={recusa || "O código não confere — ou já passou o prazo dele."}
            saida="Acontece: um dígito trocado, ou um código de ontem. Corrige-se ou pede-se outro, e segue-se."
          />

          <CapsulaVazada onClick={pedirOutro} aTrabalhar={aTrabalhar} style={{ marginTop: "20px" }}>
            Pedir outro código
          </CapsulaVazada>
          {erroPedido && (
            <p style={{ fontSize: "12px", lineHeight: 1.6, color: "#9C5A3C", margin: "12px 0 0", textWrap: "pretty" }}>{erroPedido}</p>
          )}
          {/* Um dígito trocado corrige-se sem matar o código emitido — a
              recusa não pode ser um meio-caminho morto. */}
          <div style={{ marginTop: "16px" }}>
            <LigacaoDiscreta onClick={() => { setRecusa(null); setModo("celulas"); }}>
              Escrever o código outra vez
            </LigacaoDiscreta>
          </div>
          <div style={{ marginTop: "14px" }}>
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

// O formulário é CONTROLADO: marcados, recado e nome vivem na vista. Assim,
// quando a sessão do código morre a meio, o caminho «pedir o código» sai e
// volta com o texto dela intacto — «o que escreveu fica nesta página» tem
// de ser verdade.
function PedirAlteracao({
  token, tipo, doc, sessaoId,
  marcados, onMarcados, recado, onRecado, nome, onNome,
  onEnviado, onVoltar, onPedirCodigo,
}) {
  const inst = doc.instantaneo || {};
  const [aTrabalhar, setATrabalhar] = useState(false);
  const [erro, setErro] = useState(null);
  const [sessaoMorta, setSessaoMorta] = useState(false);

  const linhas = tipo === "orcamento" && Array.isArray(inst.linhas) ? inst.linhas : [];
  const seccoes = tipo === "proposta" && Array.isArray(inst.seccoes)
    ? inst.seccoes.filter((s) => naoVazia(s.titulo)) : [];

  // A chave é a IDENTIDADE da linha (uid, com a posição como rede) — duas
  // linhas com a mesma descrição já não alternam juntas.
  const chaveLinha = (l, i) => l.uid || `linha-${i}`;
  const chaveSeccao = (s, i) => s.uid || `sec-${i}`;

  const alternar = (chave) =>
    onMarcados(
      marcados.includes(chave) ? marcados.filter((c) => c !== chave) : [...marcados, chave]);

  const enviar = async () => {
    if (aTrabalhar) return;
    // Na mensagem vão os NOMES, traduzidos a partir das chaves.
    const nomes = [
      ...linhas.map((l, i) => ({ chave: chaveLinha(l, i), nome: l.descricao || "serviço" })),
      ...seccoes.map((s, i) => ({ chave: chaveSeccao(s, i), nome: s.titulo || "secção" })),
    ].filter((x) => marcados.includes(x.chave)).map((x) => x.nome);
    const partes = [];
    if (nomes.length > 0) partes.push(`Tirar: ${nomes.join(", ")}.`);
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
    setSessaoMorta(false);
    try {
      const r = await registarActo(token, tipo, sessaoId, "pediu_alteracao", nome, partes.join("\n"), doc?.versao);
      if (r?.estado === "ok") onEnviado();
      else if (r?.estado === "precisa_codigo") setSessaoMorta(true);
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
        <p id="acomp-passo-titulo" tabIndex={-1} style={{ ...playfair, fontSize: "21px", lineHeight: 1.32, marginTop: "11px", textWrap: "balance", outline: "none" }}>
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
                const chave = chaveLinha(l, i);
                const marcado = marcados.includes(chave);
                // A linha inteira alterna — o engaste sozinho era um alvo
                // de 26px; o botão continua a ser o controlo acessível.
                return (
                  <div
                    key={chave}
                    onClick={() => alternar(chave)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "13px 0", borderBottom: "1px solid #F3EBDA", cursor: "pointer" }}
                  >
                    <div>
                      <p style={{
                        fontSize: "12.5px", fontWeight: 500, lineHeight: 1.4, margin: 0,
                        color: marcado ? "#9B9B9B" : "var(--charcoal)",
                        textDecoration: marcado ? "line-through" : "none",
                        textDecorationColor: "#D8C6B8",
                      }}>
                        {l.descricao || `serviço ${i + 1}`}
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
              const chave = chaveSeccao(s, i);
              const marcado = marcados.includes(chave);
              // O cartão inteiro alterna; o engaste fica como controlo
              // acessível (aria-pressed) com stopPropagation.
              return (
                <div
                  key={chave}
                  onClick={() => alternar(chave)}
                  style={{ backgroundColor: "white", border: `1.5px solid ${marcado ? "#9C5A3C" : "#F0E6D0"}`, borderRadius: "14px", padding: "10px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)", cursor: "pointer" }}
                >
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
                    <EngasteTirar marcado={marcado} onToggle={() => alternar(chave)} tamanho={18} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <CampoRecado valor={recado} onValor={onRecado} />

        {/* O trilho quer «quem (nome escrito)» em TODOS os actos — o
            desenho não trazia este campo, a decisão fechada sim. */}
        <div style={{ marginTop: "14px", display: "flex", alignItems: "baseline", gap: "10px" }}>
          <label htmlFor="nome-alteracao" style={{ ...overline("#9B9B9B", "0.16em", "9px"), flex: "none" }}>
            O seu nome
          </label>
          <input
            id="nome-alteracao"
            value={nome}
            onChange={(e) => onNome(e.target.value)}
            autoComplete="name"
            style={{ flex: 1, minWidth: 0, border: "none", borderBottom: "1.5px solid #E8DCC0", outline: "none", background: "transparent", padding: "0 0 6px", fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontSize: "16px", color: "var(--charcoal)" }}
          />
        </div>

        {erro && (
          <p style={{ fontSize: "12px", lineHeight: 1.6, color: "#9C5A3C", margin: "14px 0 0", textWrap: "pretty" }}>{erro}</p>
        )}
        {/* A sessão morreu a meio: diz-se o que aconteceu e dá-se o caminho
            — e o texto dela fica, porque o estado vive na vista. */}
        {sessaoMorta && (
          <div style={{ margin: "14px 0 0" }}>
            <p style={{ fontSize: "12px", lineHeight: 1.7, color: "#9C5A3C", margin: 0, textWrap: "pretty" }}>
              A sessão do código terminou. Peça um código novo — o que
              escreveu fica nesta página.
            </p>
            <div style={{ marginTop: "8px" }}>
              <LigacaoDiscreta onClick={onPedirCodigo}>Pedir o código</LigacaoDiscreta>
            </div>
          </div>
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

export default function DocumentosVista({ token, tipo, reduzir, titular }) {
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
  // Porque é que ela está no ecrã do código. Sem isto, ser recusada por ter
  // um código de outro documento mostrava-lhe o mesmo pedido de sempre — e
  // acabar de escrever um código para ouvir «peça o código» é avaria, não
  // é regra.
  const [motivoCodigo, setMotivoCodigo] = useState(null);
  // «ja_feito»: o registo que fica é o do servidor, não o que ela acabou de
  // escrever — o refetch traz o acto real e esta flag explica-o numa linha.
  const [jaTinha, setJaTinha] = useState(false);
  // «versao_mudou»: além da frase, o gesto — «Recarregar agora» sem sair da app.
  const [erroVersao, setErroVersao] = useState(false);
  // Pedir o código a partir do cartão do véu com a rede em baixo.
  const [erroPedido, setErroPedido] = useState(null);
  // De onde se veio para o ecrã do código — 'alterar' regressa ao pedido
  // com o texto intacto em vez de cair no documento.
  const [voltarPara, setVoltarPara] = useState(null);
  // «Já tenho o código» no cartão do véu abre DIREITO nas células, mesmo
  // com o pedido por atender — o cartão já disse o estado; a espera só
  // repetia. Limpa-se ao voltar/verificar.
  const [modoForcado, setModoForcado] = useState(null);
  // O interstício dispensado nesta montagem (chave tipo_versão), para o
  // caso de o sessionStorage recusar a escrita.
  const [interVisto, setInterVisto] = useState(null);
  // O formulário do pedido de alteração vive AQUI (controlado): sobrevive
  // à ida ao ecrã do código e volta intacto.
  const [altMarcados, setAltMarcados] = useState([]);
  const [altRecado, setAltRecado] = useState("");
  const [altNome, setAltNome] = useState("");

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

  // A cada mudança de ecrã: topo (seco, sem smooth — respeita o movimento
  // reduzido por natureza) e o foco no título do passo, quando o há.
  useEffect(() => {
    window.scrollTo(0, 0);
    document.getElementById("acomp-passo-titulo")?.focus({ preventScroll: true });
  }, [passo, tipo, versaoAntiga]);

  // Mudou de documento: o que era de um não fala pelo outro — a linha do
  // «já tinha resposta», o formulário do pedido e o regresso ao pedido.
  // Reset DURANTE o render (padrão do react.dev para estado preso a uma
  // prop): num efeito, o ecrã antigo pintava um quadro no documento novo.
  const [tipoVisto, setTipoVisto] = useState(tipo);
  if (tipoVisto !== tipo) {
    setTipoVisto(tipo);
    setJaTinha(false);
    setErroPedido(null);
    setVoltarPara(null);
    setAltMarcados([]);
    setAltRecado("");
    setAltNome("");
    setModoForcado(null);
  }

  // Busca e assenta o meta DE VERDADE antes de devolver a mão: o refetch
  // por recarga corria em paralelo com o do documento, e o ecrã de espera
  // só aparecia se o do meta ganhasse a corrida. A recarga não se toca —
  // o documento não muda por se pedir um código.
  const recarregarMeta = async () => {
    const m = await getDocumentosPortal(token);
    if (m?.estado === "activo") setMeta(m);
  };

  const agir = async (acto, nome, mensagem) => {
    setATrabalhar(true);
    setErro(null);
    setErroVersao(false);
    try {
      const r = await registarActo(token, tipo, sessaoId, acto, nome, mensagem, doc?.versao);
      if (r?.estado === "versao_mudou") {
        // Saiu versão nova enquanto ela lia. O acto NÃO se gravou — e é
        // isso que se lhe diz, com o caminho à frente (e o gesto ao lado).
        setErroVersao(true);
        setErro(
          `Entretanto saiu uma versão nova (versão ${r.versao}). Recarregue a página e leia-a antes de responder — a sua resposta não foi registada.`,
        );
      } else if (r?.estado === "ok") {
        setFeito({ acto, nome, quando: r?.quando || new Date().toISOString() });
        setPasso("feito");
        setRecarga((x) => x + 1);
      } else if (r?.estado === "ja_feito") {
        // Já havia resposta registada — e é ELA que fica, não o nome e a
        // hora que ela acabou de escrever. O refetch traz o acto real e o
        // ecrã cai no pé recolhido (ou no repouso do contrato), com uma
        // linha a dizê-lo.
        setJaTinha(true);
        setRecarga((x) => x + 1);
      } else if (r?.estado === "precisa_codigo") {
        // Duas razões diferentes, e confundi-las era mandá-la escrever
        // outra vez o código que acabou de escrever. `codigo_de_outro_
        // documento` (061) quer dizer que a sessão está viva, mas nasceu
        // noutro documento — e assinar exige um código pedido AQUI.
        // Sem esse motivo, limpa-se o aviso — senão reaparecia sem razão.
        if (r?.motivo === "codigo_de_outro_documento") {
          esquecerSessao(token);
          setMotivoCodigo("outro_documento");
        } else {
          setMotivoCodigo(null);
        }
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
  // Dispensar não refaz fetch nenhum: o documento já estava em mãos, e o
  // render seguinte cai directo nele. O estado local (interVisto) segura a
  // dispensa quando o sessionStorage recusa a escrita.
  if (
    versaoNova &&
    passo === "doc" &&
    interVisto !== `${tipo}_${doc.versao}` &&
    !lerVeuVisto(token, tipo, doc.versao)
  ) {
    return (
      <AvisoVersaoNova
        token={token}
        tipo={tipo}
        sessaoId={sessaoId}
        doc={doc}
        ant={metaDoc.acto_anterior}
        rotulo={rotulo}
        onAbrir={() => {
          marcarVeuVisto(token, tipo, doc.versao);
          setInterVisto(`${tipo}_${doc.versao}`);
        }}
        onVerAntiga={() => setVersaoAntiga(metaDoc.acto_anterior.versao)}
      />
    );
  }

  // ── os passos por cima do documento ──
  if (passo === "codigo") {
    return (
      <FluxoCodigo
        token={token}
        tipo={tipo}
        motivo={motivoCodigo}
        versao={doc.versao}
        meta={meta}
        modoInicial={modoForcado}
        onRecarregarMeta={recarregarMeta}
        onVoltar={() => {
          setVoltarPara(null);
          setModoForcado(null);
          setPasso("doc");
        }}
        onVerificado={() => {
          // Quem veio do pedido de alteração volta ao pedido, com o texto
          // intacto (o formulário vive nesta vista); os restantes caem no
          // documento já sem véu.
          setPasso(voltarPara === "alterar" ? "alterar" : "doc");
          setVoltarPara(null);
          setModoForcado(null);
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
        marcados={altMarcados}
        onMarcados={setAltMarcados}
        recado={altRecado}
        onRecado={setAltRecado}
        nome={altNome}
        onNome={setAltNome}
        onVoltar={() => setPasso("doc")}
        onPedirCodigo={() => {
          setVoltarPara("alterar");
          setMotivoCodigo(null);
          setPasso("codigo");
        }}
        onEnviado={() => {
          setAltMarcados([]);
          setAltRecado("");
          setAltNome("");
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
          <p id="acomp-passo-titulo" tabIndex={-1} style={{ ...playfair, fontSize: "21px", lineHeight: 1.32, marginTop: "11px", textWrap: "balance", outline: "none" }}>
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
                Chegou. A Do Luxo à Mesa confirma e o contrato fecha-se aqui — receberá
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

        {/* A cópia imprimível, escondida no ecrã: «Imprimir o contrato»
            imprimia as INSTRUÇÕES, não o contrato. No papel sai isto. */}
        <div className="acomp-imprimivel" style={{ display: "none" }}>
          <Folha>
            <Timbre logoUrl={logoUrl} nome="Contrato" versao={doc.versao} quando={diaLocalISO(doc.publicado_em)} />
            <CorpoContrato doc={doc} />
          </Folha>
        </div>
        <EstiloImpressao />
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
            <p id="acomp-passo-titulo" tabIndex={-1} style={{ ...playfair, fontSize: ehAssinatura ? "23px" : "22px", lineHeight: 1.3, marginTop: "10px", textWrap: "balance", outline: "none" }}>
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
                ["Versão", `Versão ${doc.versao}, de ${diaEMes(diaLocalISO(doc.publicado_em))}`],
                ["Data e hora", `${diaMesAno(diaLocalISO(feito.quando))}, às ${horaCurta(feito.quando)}`],
                ["Verificação", "Com o código que a Do Luxo à Mesa lhe enviou"],
              ]}
            />
            <div style={{ textAlign: "center", marginTop: "20px" }}>
              <LigacaoDiscreta onClick={() => { setPasso("doc"); setRecarga((r) => r + 1); }}>
                Ver o {rotulo.toLowerCase()} como o {ehAssinatura ? "assinou" : tipo === "proposta" ? "aprovou" : "aceitou"}
              </LigacaoDiscreta>
            </div>
          </div>
        )}

        {/* A ordem nova (071): aceite → contrato para assinar → o sinal
            guarda a data → projecto → preparação. Cada ramo aponta o
            passo verdadeiro que se segue ao acto acabado de registar. */}
        <div style={{ marginTop: "30px", paddingTop: "19px", borderTop: "1px solid #F0E6D0" }}>
          <p style={overline("#9B9B9B", "0.22em", "9px")}>O que vem a seguir</p>
          <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "11px 0 0", textWrap: "pretty" }}>
            {ehAssinatura
              ? "O sinal — metade do valor. Com o contrato assinado, é ele que guarda a sua data; a partir daí, o caminho conta-se aqui."
              : ehAlteracao
                ? "A Do Luxo à Mesa lê o seu pedido e responde pela conversa que já tem consigo — e o documento novo aparece aqui."
                : tipo === "proposta"
                  ? "A preparação. Fechamos as compras e as listas na semana antes do dia — e é aqui que lhe contamos."
                  : "O contrato. Passamos a escrito o que ficou combinado — chega-lhe aqui para assinar, e com o sinal a data fica sua."}
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
      <div className="acomp-imprimivel" style={{ padding: "22px 16px 30px" }}>
        <Folha selada>
          <FaixaSelo
            visto={<VistoDourado />}
            quem={doc.acto?.nome || "si"}
            quando={`${dataPorExtenso(diaLocalISO(doc.acto?.quando) || "")} às ${horaCurta(doc.acto?.quando)}`}
          />
          <div style={{ padding: "22px 22px 24px" }}>
            <div style={{ textAlign: "center" }}>
              <img src={logoUrl} alt="Do Luxo à Mesa" style={{ width: "74px", height: "auto", display: "block", margin: "0 auto", opacity: 0.8 }} />
              <SeloVersao versao={doc.versao} quando={diaLocalISO(doc.publicado_em)} comDe={false} style={{ marginTop: "14px" }} />
            </div>
            {/* No papel sai o contrato completo (o bloco só-de-impressão a
                seguir); o resumo recolhido e o índice ficam no ecrã. */}
            <div className="acomp-nao-imprime" style={{ marginTop: "20px", paddingTop: "18px", borderTop: "1px solid #F3EBDA" }}>
              <CorpoContrato doc={doc} resumoSo />
            </div>
            <div className="acomp-nao-imprime" style={{ margin: "20px 22px 0", paddingTop: "16px", borderTop: "1px solid #F3EBDA" }}>
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
            {/* «Imprimir em A4» imprimia o resumo recolhido, sem as
                cláusulas. Este bloco só existe no papel. */}
            <div className="acomp-so-imprime" style={{ display: "none", marginTop: "20px", paddingTop: "18px", borderTop: "1px solid #F3EBDA" }}>
              <CorpoContrato doc={doc} />
            </div>
          </div>
        </Folha>

        <div className="acomp-nao-imprime" style={{ marginTop: "18px", textAlign: "center" }}>
          {jaTinha && (
            <p style={{ fontSize: "11.5px", lineHeight: 1.75, color: "#9B9B9B", margin: "0 0 10px", textWrap: "pretty" }}>
              Este documento já tinha uma resposta registada — é ela que fica.
            </p>
          )}
          <p style={{ fontSize: "11.5px", lineHeight: 1.75, color: "#9B9B9B", margin: 0, textWrap: "pretty" }}>
            Este documento está fechado. Se houver um erro, faz-se um contrato
            novo — este fica como está.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "20px", marginTop: "15px" }}>
            <LigacaoDiscreta onClick={() => window.print()}>Imprimir em A4</LigacaoDiscreta>
            <LigacaoDiscreta onClick={voltarLista} apagada>Os seus documentos</LigacaoDiscreta>
          </div>
        </div>
        <EstiloImpressao />
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
            <Timbre logoUrl={logoUrl} nome="Contrato" versao={doc.versao} quando={diaLocalISO(doc.publicado_em)} />
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
        {/* Também na versão antiga: hachuras sem cartão dos valores nem
            caminho para o código eram um beco. O pé do acto, esse sim,
            continua excluído em versaoAntiga. */}
        {/* O CARTÃO DIZ O ESTADO NA PROSA — não escondido num rótulo de
            botão. Três tempos, cada um com a sua frase e a sua acção:
            · nunca pedido → porquê do véu, a quem chega o código, e
              «Pedir o código» (que leva à espera: acto → confirmação);
            · pedido por atender → «já está pedido», e a única acção
              útil é «Já tenho o código» (células) — a espera não se
              repete a quem volta cá;
            · emitido → «já seguiu», «Escrever o código».
            Nunca se mostra o número — a projecção não o traz, de
            propósito. O nome do titular já se mostra na jornada. */}
        {veiado &&
          (() => {
            const vEstado = meta?.verificacao?.estado;
            const vPedidoEm = meta?.verificacao?.pedido_em;
            const conversaAlvo = titular
              ? `conversa de WhatsApp de ${titular}`
              : "conversa de WhatsApp da pessoa da ficha";
            const irAsCelulas = () => {
              setErroPedido(null);
              setVoltarPara(null);
              setMotivoCodigo(null);
              setModoForcado("celulas");
              setPasso("codigo");
            };
            return (
              <div className="acomp-nao-imprime" style={{ margin: "0 22px 24px", backgroundColor: "white", border: "1.5px solid #F0E6D0", borderRadius: "14px", padding: "20px 18px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
                <p style={overline()}>Os valores</p>
                <p style={{ ...playfair, fontSize: "19px", lineHeight: 1.32, marginTop: "10px", textWrap: "balance" }}>
                  {vEstado === "emitido"
                    ? "O seu código já seguiu."
                    : vEstado === "pedido"
                      ? "O código já está pedido."
                      : "Os valores mostram-se a quem é da casa."}
                </p>
                <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "10px 0 0", textWrap: "pretty" }}>
                  {vEstado === "emitido"
                    ? `Está na ${conversaAlvo} — vale um dia inteiro, a contar do envio. Escreva-o, e os valores abrem-se.`
                    : vEstado === "pedido"
                      ? `O pedido ficou feito${vPedidoEm ? ` às ${horaCurta(vPedidoEm)}` : ""}. Não é automático — assim que a Do Luxo à Mesa o enviar, chega à ${conversaAlvo}.`
                      : "Esta ligação pode passar por outras mãos. Para os abrir, a Do Luxo à Mesa envia um código de seis dígitos — e só a quem é do evento."}
                </p>
                {!vEstado || vEstado === "nenhum" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #F3EBDA" }}>
                    <div aria-hidden="true" style={{ width: "40px", height: "40px", borderRadius: "50%", background: "repeating-linear-gradient(45deg, #F2ECDF 0 5px, #FAF7EF 5px 11px)", border: "1px solid #E8DCC0", flex: "none" }} />
                    <div>
                      <p style={{ fontSize: "12.5px", fontWeight: 500, lineHeight: 1.35, margin: 0, color: "var(--charcoal)" }}>
                        {titular || "A pessoa da ficha"}
                      </p>
                      <p style={{ fontSize: "11px", lineHeight: 1.5, color: "#9B9B9B", margin: "3px 0 0" }}>
                        o código segue para o número que temos na sua ficha
                      </p>
                    </div>
                  </div>
                ) : null}
                {vEstado === "emitido" || vEstado === "pedido" ? (
                  <>
                    <CapsulaVazada onClick={irAsCelulas} style={{ marginTop: "18px" }}>
                      {vEstado === "emitido" ? "Escrever o código" : "Já tenho o código"}
                    </CapsulaVazada>
                    {vEstado === "pedido" && (
                      <p style={{ textAlign: "center", margin: "14px 0 0" }}>
                        <LigacaoDiscreta href={WHATSAPP_URL} apagada>
                          Se tiver pressa, fale pelo WhatsApp
                        </LigacaoDiscreta>
                      </p>
                    )}
                  </>
                ) : (
                  <CapsulaVazada
                    aTrabalhar={aTrabalhar}
                    onClick={async () => {
                      setErroPedido(null);
                      setVoltarPara(null);
                      setModoForcado(null);
                      setATrabalhar(true);
                      try {
                        await pedirCodigo(token, tipo);
                        esquecerSessao(token);
                        setMotivoCodigo(null);
                        await recarregarMeta();
                        setPasso("codigo");
                      } catch (e) {
                        console.error(e);
                        setErroPedido("Não foi possível pedir o código. Verifique a ligação e tente novamente.");
                      } finally {
                        setATrabalhar(false);
                      }
                    }}
                    style={{ marginTop: "18px" }}
                  >
                    Pedir o código
                  </CapsulaVazada>
                )}
                {erroPedido && (
                  <p style={{ fontSize: "12px", lineHeight: 1.6, color: "#9C5A3C", margin: "12px 0 0", textWrap: "pretty" }}>{erroPedido}</p>
                )}
              </div>
            );
          })()}

        {/* ── O PÉ DO ACTO ── */}
        {!veiado && !jaRespondeu && !versaoAntiga && tipo !== "contrato" && (
          <div className="acomp-nao-imprime" style={{ backgroundColor: "#FDFBF5", borderTop: "1px solid #E8D5A3", padding: "22px" }}>
            <p style={overline()}>A sua resposta</p>
            <p style={{ ...playfair, fontSize: "19px", lineHeight: 1.32, marginTop: "10px", textWrap: "balance" }}>
              {tipo === "proposta" ? "É esta a mesa que imaginou?" : "Está de acordo com este orçamento?"}
            </p>
            <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "10px 0 0", textWrap: "pretty" }}>
              {tipo === "proposta"
                ? `Aprova a versão ${doc.versao}, de ${diaEMes(diaLocalISO(doc.publicado_em))}. É por ela que compramos as flores e montamos no dia.`
                : `Responde à versão ${doc.versao}, de ${diaEMes(diaLocalISO(doc.publicado_em))} — a que tem aqui em cima. Se aceitar, o contrato chega-lhe aqui a seguir — e com o sinal, a data fica sua.`}
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
            {erro && (
              <p style={{ fontSize: "12px", color: "#9C5A3C", margin: "12px 0 0" }}>
                {erro}
                {erroVersao && (
                  <>
                    {" "}
                    <LigacaoDiscreta
                      onClick={() => { setErro(null); setErroVersao(false); setRecarga((r) => r + 1); }}
                      style={{ fontSize: "12px" }}
                    >
                      Recarregar agora
                    </LigacaoDiscreta>
                  </>
                )}
              </p>
            )}

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
          <div className="acomp-nao-imprime" style={{ backgroundColor: "#FDFBF5", borderTop: "1px solid #E8D5A3", padding: "22px" }}>
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
                `A versão ${doc.versao} deste contrato, de ${diaEMes(diaLocalISO(doc.publicado_em))} — a que acabou de ler.`,
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
                {sessao ? "Sessão verificada com o código que a Do Luxo à Mesa lhe enviou." : "A assinatura pede o código que a Do Luxo à Mesa lhe envia."}
              </p>
            </div>

            <CampoAssinatura nome={nomeAssina} onNome={aoEscreverNome} completo={completo} />
            {erro && (
              <p style={{ fontSize: "12px", color: "#9C5A3C", margin: "12px 0 0", textAlign: "center" }}>
                {erro}
                {erroVersao && (
                  <>
                    {" "}
                    <LigacaoDiscreta
                      onClick={() => { setErro(null); setErroVersao(false); setRecarga((r) => r + 1); }}
                      style={{ fontSize: "12px" }}
                    >
                      Recarregar agora
                    </LigacaoDiscreta>
                  </>
                )}
              </p>
            )}

            <CapsulaCheia
              onClick={() => agir("assinou", nomeAssina)}
              inerte={!fileteCheio}
              aTrabalhar={aTrabalhar}
              style={{ marginTop: "20px" }}
            >
              {aTrabalhar ? "A assinar…" : "Assinar o contrato"}
            </CapsulaCheia>

            <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: "16px 0 0", textAlign: "center" }}>
              Prefere em papel?{" "}
              {/* Dizia «Descarregar para assinar à mão» e não descarregava
                  nada: mudava de ecrã. O contrato lê-se aqui e imprime-se
                  daqui — a palavra tem de ser a do gesto que existe. */}
              <LigacaoDiscreta onClick={() => setPasso("papel")} style={{ fontSize: "11px" }}>
                Assinar à mão e enviar a fotografia
              </LigacaoDiscreta>
            </p>
          </div>
        )}

        {/* Já respondeu a esta versão: o pé recolhe para uma linha. */}
        {jaRespondeu && !assinado && (
          <div style={{ backgroundColor: "#FDFBF5", borderTop: "1px solid #E8D5A3", padding: "16px 22px" }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", justifyContent: "center" }}>
              <VistoDourado />
              <p style={{ fontSize: "12px", color: "var(--gray-mid)", margin: 0, fontVariantNumeric: "tabular-nums" }}>
                {doc.acto.acto === "pediu_alteracao"
                  ? `Pediu uma alteração a ${diaEMes(diaLocalISO(doc.acto.quando))} — estamos a tratar dela.`
                  : `${tipo === "proposta" ? "Aprovado" : "Aceite"} por ${doc.acto.nome} a ${diaEMes(diaLocalISO(doc.acto.quando))}.`}
              </p>
            </div>
            {jaTinha && (
              <p style={{ fontSize: "11px", lineHeight: 1.6, color: "#9B9B9B", margin: "8px 0 0", textAlign: "center", textWrap: "pretty" }}>
                Este documento já tinha uma resposta registada — é ela que fica.
              </p>
            )}
          </div>
        )}
      </Folha>

      <div className="acomp-nao-imprime" style={{ marginTop: "16px", textAlign: "center", display: "flex", justifyContent: "center", gap: "20px" }}>
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

      {/* A impressão A4: só a folha fica visível — a peça partilhada com o
          ramo «papel» e o repouso, para o browser imprimir papel e não a
          página. */}
      <EstiloImpressao />
    </div>
  );
}
