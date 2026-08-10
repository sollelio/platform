import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  contarRecorte,
  congelarLista,
  desfazerCongelamento,
  getComunicado,
  listarDestinatarios,
} from "../../lib/comunicados";
import { getEventTypes } from "../../lib/invites";
import { Esqueleto, useContagemAnimada } from "./acabamento";
import { quandoAs } from "./comunicadoTempo";

// ============================================================
// ComunicadoRecorte — «Quem recebe»: a regra que o diz.
//
// Duas origens (Por eventos / Por contactos), os filtros de cada uma,
// e um cartão de contagem que responde em tempo real via contarRecorte
// — a pré-contagem honesta: quantas pessoas, quantos eventos, quem
// fica de fora e PORQUÊ. Nada se escreve até «Fechar a lista», que
// fixa os nomes em comunicado_destinatarios; a partir daí um evento
// novo já não entra e o envio trabalha sem surpresas.
// ============================================================

const OVERLINE = {
  fontSize: "9.5px",
  fontWeight: "700",
  letterSpacing: "0.15em",
  color: "var(--gold-dark)",
};

const JANELAS = [
  { id: "porvir", nome: "Por vir" },
  { id: "passados", nome: "Já passaram" },
  { id: "todos", nome: "Todos" },
];

// QUEM, na origem contactos. «Cliente» é a definição do funil
// (lib/fases.js): tem pelo menos um evento pós-sinal; «interessado»
// tem evento vivo mas nenhum pós-sinal. COINCIDE com a proposta do
// dono — confirmado no código, não inventado (decisão de 04/08/2026).
const QUENS = [
  { id: "todos", nome: "Todos os contactos" },
  { id: "clientes", nome: "Só clientes" },
  { id: "interessados", nome: "Só interessados" },
];

const FRASES_QUEM = {
  todos: "Toda a base: quem fechou, quem ficou a pensar, quem só perguntou.",
  clientes: "Só quem já fechou negócio com a casa.",
  interessados: "Quem mostrou interesse e ainda não fechou.",
};

// «1 evento de Casamento» / «4 eventos de Casamento» — os tipos reais
// vêm da BD sem singular/plural próprios, por isso a frase compõe-se
// com «evento(s) de <Tipo>» (desvio ao desenho, registado): pluralizar
// nomes de tipos à máquina arriscava um «Dia da Mães».
const eventosDe = (n, nomeTipo) =>
  n === 1 ? `1 evento de ${nomeTipo}` : `${n} eventos de ${nomeTipo}`;

const fraseEventos = (nomeTipo, jan, pv, pa) => {
  const tot = pv + pa;
  if (tot === 0) return `Ainda não há eventos de ${nomeTipo} — experimente outro tipo ou janela.`;
  if (jan === "porvir")
    return `${eventosDe(pv, nomeTipo)} por vir · ${pa} já ${pa === 1 ? "passou" : "passaram"}, fora da janela.`;
  if (jan === "passados") return `Só o que já aconteceu: ${eventosDe(pa, nomeTipo)}.`;
  return `${eventosDe(tot, nomeTipo)}: ${pv} por vir, ${pa} já ${pa === 1 ? "passou" : "passaram"}.`;
};

// A frase do dedupe — só na origem eventos, como o desenho a mostra:
// é lá que a mesma pessoa aparece por ter dois eventos na janela.
const fraseDedup = (c) => {
  if (!c.duplicados.length) return "";
  const cabeca = `${c.eventos} eventos na janela, ${c.pessoas} ${c.pessoas === 1 ? "pessoa" : "pessoas"}: `;
  if (c.duplicados.length === 1) {
    const d = c.duplicados[0];
    return `${cabeca}a ${d.nome} tem ${d.n === 2 ? "dois" : d.n} eventos e conta uma vez.`;
  }
  return `${cabeca}${c.duplicados.map((d) => d.nome).join(", ")} têm mais do que um evento e contam uma vez cada.`;
};

// «FICA DE FORA» — quem não tem número utilizável, NOMEADO e com o
// porquê que a contagem traz; ou a garantia de que ninguém ficou.
const fraseFora = (c, origem) => {
  const n = c.semNumero.length;
  if (n === 0) {
    if (c.pessoas === 0) return "Ninguém.";
    if (origem === "eventos")
      return `Ninguém: ${c.pessoas === 1 ? "1 pessoa tem" : `${c.pessoas} pessoas têm`} número utilizável.`;
    return c.pessoas === 1
      ? "Ninguém: a única pessoa tem número utilizável."
      : `Ninguém: os ${c.pessoas} têm número utilizável.`;
  }
  return `Fica${n === 1 ? "" : "m"} de fora ${n}: ${c.semNumero
    .map((s) => `${s.nome} — ${s.porque}`)
    .join("; ")}.`;
};

const frasePromocoes = (c) => {
  const n = c.excluidasPromocoes.length;
  if (n === 0)
    return "Ninguém pediu para não receber promoções.";
  return n === 1
    ? `Fora, a pedido: ${c.excluidasPromocoes[0]} pediu para não receber promoções.`
    : `Fora, a pedido: ${c.excluidasPromocoes.join(", ")} pediram para não receber promoções.`;
};

// A pastilha de escolha, na identidade da casa (.pastilha-escolha) —
// o protótipo pinta os chips à sua maneira, mas a camada de interacção
// da casa já tem uma voz para «filtro escolhido»: usa-se essa.
function Chip({ activo, onEscolher, children }) {
  return (
    <button
      onClick={onEscolher}
      className={`pastilha-escolha${activo ? " pastilha-escolha--activa" : ""}`}
      style={{
        padding: "11px 16px",
        borderRadius: "999px",
        fontSize: "12.5px",
        fontWeight: "600",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export default function ComunicadoRecorte({ comunicado, onVoltar, onMudou, onAbrirExpedicao }) {
  const reduzido = useReducedMotion();
  const congelada = Boolean(comunicado.congelado_em);
  const pub = comunicado.publico || null;

  // A regra do recorte. Quando a lista já foi fechada, os filtros
  // nascem com a regra guardada (comunicados.publico) — o ecrã mostra
  // O QUE se fechou, esmaecido, não um recorte novo.
  const [tipos, setTipos] = useState(null); // null = a caminho
  const [erroTipos, setErroTipos] = useState(false);
  const [origem, setOrigem] = useState(pub?.origem || "eventos");
  const [eventTypeId, setEventTypeId] = useState(pub?.event_type_id || null);
  const [janela, setJanela] = useState(pub?.janela || "porvir");
  const [quem, setQuem] = useState(pub?.quem || "todos");

  const [contagem, setContagem] = useState(null); // {chave, c, porvirEv, passadosEv}
  const [erroContagem, setErroContagem] = useState(null); // a chave que falhou
  const [tick, setTick] = useState(0);

  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [nomesCongelados, setNomesCongelados] = useState(null);
  // Até a lista dizer o contrário, assume-se mexida: o «Desfazer» só
  // aparece com a certeza de que nenhum carimbo existe.
  const [mexida, setMexida] = useState(true);
  const [animarBanda, setAnimarBanda] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    let vivo = true;
    getEventTypes()
      .then((ts) => {
        if (!vivo) return;
        setTipos(ts || []);
        setErroTipos(false);
      })
      .catch((e) => {
        console.error(e);
        if (!vivo) return;
        setTipos([]);
        setErroTipos(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  // O primeiro tipo é o recorte de arranque — o desenho abre já com um
  // chip escolhido, nunca com a pergunta em branco. DERIVA-SE em vez de
  // se escrever num efeito: escolher por omissão não é acontecimento
  // nenhum, é a leitura do que está escolhido quando ninguém escolheu.
  const tipoEscolhido = eventTypeId || (tipos && tipos.length ? tipos[0].id : null);

  // A contagem em tempo real. Na origem eventos vão DOIS pedidos: o da
  // janela escolhida (as pessoas, o fica-de-fora) e o da janela oposta,
  // só para a frase dizer o que está dentro E fora («4 por vir · 1 já
  // passou») — os totais de eventos são aditivos, o de «todos» deriva.
  // O guardião de sequência deita fora respostas fora de ordem.
  // A pergunta que está no ecrã, como uma chave. É ela que diz se o que
  // está guardado ainda serve — «a contar» e «falhou» deduzem-se da
  // comparação, sem ninguém escrever estado dentro do efeito.
  const chave = `${origem}|${tipoEscolhido || ""}|${janela}|${quem}|${tick}`;

  useEffect(() => {
    if (origem === "eventos" && !tipoEscolhido) return;
    const meu = ++seq.current;
    const promessa =
      origem === "eventos"
        ? Promise.all([
            contarRecorte({ origem, eventTypeId: tipoEscolhido, janela }),
            contarRecorte({
              origem,
              eventTypeId: tipoEscolhido,
              janela: janela === "porvir" ? "passados" : "porvir",
            }),
          ]).then(([actual, outra]) => ({
            c: actual,
            porvirEv: janela === "porvir" ? actual.eventos : outra.eventos,
            passadosEv:
              janela === "passados"
                ? actual.eventos
                : janela === "porvir"
                  ? outra.eventos
                  : actual.eventos - outra.eventos,
          }))
        : contarRecorte({ origem, quem }).then((c) => ({ c, porvirEv: 0, passadosEv: 0 }));
    promessa
      .then((r) => {
        if (seq.current !== meu) return;
        setContagem({ ...r, chave });
      })
      .catch((e) => {
        console.error(e);
        if (seq.current !== meu) return;
        setErroContagem(chave);
      });
  }, [origem, tipoEscolhido, janela, quem, tick, chave]);

  // Fechada: a banda precisa do número REAL de linhas fixadas, e o
  // «Desfazer» precisa de saber se o envio já lhes tocou.
  useEffect(() => {
    if (!congelada) return undefined;
    let vivo = true;
    listarDestinatarios(comunicado.id)
      .then((ls) => {
        if (!vivo) return;
        setNomesCongelados(ls.length);
        setMexida(ls.some((l) => l.aberto_em || l.enviado_em));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [congelada, comunicado.id]);

  // A resposta que está em mão só serve se for À PERGUNTA que está no
  // ecrã: mudar um chip invalida-a sem ninguém a apagar.
  const viva = contagem?.chave === chave ? contagem : null;
  const falhou = erroContagem === chave;
  const aContar = !viva && !falhou;

  const pessoas = viva?.c.pessoas ?? 0;
  const pessoasMostradas = Math.round(useContagemAnimada(pessoas));
  const podeCongelar = pessoas > 0 && viva !== null;
  const eEventos = origem === "eventos";
  const nomeTipo = tipos?.find((t) => t.id === tipoEscolhido)?.nome || "evento";

  const congelar = async () => {
    if (ocupado || !podeCongelar) return;
    setOcupado(true);
    setErro("");
    try {
      const regra = eEventos ? { origem, eventTypeId: tipoEscolhido, janela } : { origem, quem };
      const inseridos = await congelarLista(comunicado.id, regra);
      setNomesCongelados(inseridos.length);
      setMexida(false);
      setAnimarBanda(true);
      const rec = await getComunicado(comunicado.id);
      onMudou(rec);
    } catch (e) {
      console.error(e);
      // As mensagens da camada de dados já falam a língua da casa;
      // qualquer outra (rede, permissões) leva a genérica.
      setErro(
        /fechad|recorte|escolha/i.test(e?.message || "")
          ? e.message
          : "Não foi possível fechar a lista. Tente outra vez.",
      );
    } finally {
      setOcupado(false);
    }
  };

  const desfazer = async () => {
    if (ocupado) return;
    setOcupado(true);
    setErro("");
    try {
      const rec = await desfazerCongelamento(comunicado.id);
      setAnimarBanda(false);
      onMudou(rec);
    } catch (e) {
      console.error(e);
      setErro(
        /envio|fecho/i.test(e?.message || "")
          ? e.message
          : "Não foi possível desfazer o fecho da lista. Tente outra vez.",
      );
    } finally {
      setOcupado(false);
    }
  };

  const frase =
    viva === null
      ? ""
      : eEventos
        ? fraseEventos(nomeTipo, janela, viva.porvirEv, viva.passadosEv)
        : FRASES_QUEM[quem];
  const dedup = viva !== null && eEventos ? fraseDedup(viva.c) : "";

  return (
    <div style={{ maxWidth: "560px" }}>
      <button
        onClick={onVoltar}
        className="ligacao"
        style={{ fontSize: "12.5px", color: "var(--gray-mid)" }}
      >
        ← A folha
      </button>

      <div style={{ ...OVERLINE, marginTop: "14px", textTransform: "uppercase" }}>
        FOLHA{comunicado.titulo?.trim() ? ` · ${comunicado.titulo.trim()}` : ""}
      </div>
      <h1
        style={{
          margin: "6px 0 0",
          fontFamily: "'Playfair Display', serif",
          fontSize: "24px",
          fontWeight: "400",
          lineHeight: 1.3,
        }}
      >
        Quem recebe
      </h1>
      <p style={{ margin: "6px 0 0", fontSize: "12.5px", lineHeight: 1.6, color: "var(--gray-mid)" }}>
        A lista só fica fixa quando a fechar.
      </p>

      {/* A pastilha das origens — o indicador branco desliza (180ms,
          curva de folha iOS); com movimento reduzido, muda sem viagem. */}
      <div
        style={{
          position: "relative",
          display: "flex",
          marginTop: "20px",
          backgroundColor: "#FBF7EF",
          border: "1px solid #F0E6D0",
          borderRadius: "12px",
          padding: "3px",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: "3px",
            bottom: "3px",
            left: "3px",
            width: "calc(50% - 3px)",
            backgroundColor: "#FFFFFF",
            border: "1px solid var(--gold-light)",
            borderRadius: "9px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            transform: eEventos ? "translateX(0)" : "translateX(100%)",
            transition: reduzido ? "none" : "transform 180ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        />
        <button
          onClick={() => setOrigem("eventos")}
          className="acao"
          disabled={congelada}
          style={{
            position: "relative",
            flex: 1,
            padding: "11px 8px",
            border: "none",
            background: "transparent",
            borderRadius: "9px",
            fontSize: "12.5px",
            fontWeight: "600",
            color: eEventos ? "var(--charcoal)" : "var(--gray-mid)",
          }}
        >
          Por eventos
        </button>
        <button
          onClick={() => setOrigem("contactos")}
          className="acao"
          disabled={congelada}
          style={{
            position: "relative",
            flex: 1,
            padding: "11px 8px",
            border: "none",
            background: "transparent",
            borderRadius: "9px",
            fontSize: "12.5px",
            fontWeight: "600",
            color: eEventos ? "var(--gray-mid)" : "var(--charcoal)",
          }}
        >
          Por contactos
        </button>
      </div>

      {/* Os filtros esmaecem quando a lista está fechada: mostram a
          regra que a produziu, mas já não se mexem. */}
      <div
        style={{
          opacity: congelada ? 0.45 : 1,
          pointerEvents: congelada ? "none" : "auto",
          transition: "opacity 140ms ease",
        }}
      >
        {eEventos ? (
          <>
            <div style={{ ...OVERLINE, marginTop: "22px" }}>TIPO DE EVENTO</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
              {tipos === null &&
                [0, 1, 2].map((i) => <Esqueleto key={i} w={110} h={40} r={999} />)}
              {tipos !== null &&
                tipos.map((t) => (
                  <Chip key={t.id} activo={t.id === tipoEscolhido} onEscolher={() => setEventTypeId(t.id)}>
                    {t.nome}
                  </Chip>
                ))}
              {tipos !== null && tipos.length === 0 && !erroTipos && (
                <p style={{ margin: 0, fontSize: "12.5px", fontStyle: "italic", color: "var(--gray-mid)" }}>
                  Ainda não há tipos de evento — criam-se em Modelos de Evento.
                </p>
              )}
            </div>
            {erroTipos && (
              <p role="alert" style={{ margin: "10px 0 0", fontSize: "12.5px", color: "#DC2626" }}>
                Não foi possível carregar os tipos de evento. Recarregue a página.
              </p>
            )}
            <div style={{ ...OVERLINE, marginTop: "20px" }}>JANELA</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
              {JANELAS.map((j) => (
                <Chip key={j.id} activo={j.id === janela} onEscolher={() => setJanela(j.id)}>
                  {j.nome}
                </Chip>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ ...OVERLINE, marginTop: "22px" }}>QUEM</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
              {QUENS.map((q) => (
                <Chip key={q.id} activo={q.id === quem} onEscolher={() => setQuem(q.id)}>
                  {q.nome}
                </Chip>
              ))}
            </div>
          </>
        )}
      </div>

      {/* O cartão da contagem — a resposta honesta à pergunta do recorte.
          Enquanto reconta, esmaece de leve; o número acerta-se a contar. */}
      <div
        style={{
          marginTop: "24px",
          backgroundColor: "#FFFFFF",
          border: "1px solid #F0E6D0",
          borderRadius: "14px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
          padding: "18px 18px 16px",
          opacity: aContar && viva !== null ? 0.7 : 1,
          transition: "opacity 140ms ease",
        }}
      >
        {aContar && (
          <>
            <Esqueleto w={140} h={30} r={8} />
            <Esqueleto w="80%" h={13} r={6} style={{ marginTop: "12px" }} />
          </>
        )}
        {falhou && (
          <p role="alert" style={{ margin: 0, fontSize: "12.5px", color: "#DC2626" }}>
            Não foi possível contar.{" "}
            <button
              onClick={() => setTick((t) => t + 1)}
              className="ligacao"
              style={{ fontSize: "12.5px", color: "var(--gold-dark)", textDecoration: "underline" }}
            >
              Tentar de novo
            </button>
          </p>
        )}
        {viva !== null && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
              <div style={{ fontSize: "30px", fontWeight: "600", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                {pessoasMostradas}
              </div>
              <div style={{ fontSize: "13px", fontWeight: "600" }}>
                {pessoas === 1 ? "pessoa" : "pessoas"}
              </div>
            </div>
            <p style={{ margin: "8px 0 0", fontSize: "12.5px", lineHeight: 1.6, color: "var(--gray-mid)" }}>
              {frase}
            </p>
            {dedup && (
              <p style={{ margin: "8px 0 0", fontSize: "12.5px", lineHeight: 1.6, color: "var(--gray-mid)" }}>
                {dedup}
              </p>
            )}
            <div style={{ marginTop: "14px", borderTop: "1px solid #F5ECD7", paddingTop: "12px" }}>
              <div style={{ fontSize: "9px", fontWeight: "700", letterSpacing: "0.15em", color: "#9B9B9B" }}>
                FICA DE FORA
              </div>
              <p style={{ margin: "7px 0 0", fontSize: "12.5px", lineHeight: 1.6, color: "var(--gray-mid)" }}>
                {fraseFora(viva.c, origem)}
              </p>
              {!eEventos && (
                <p style={{ margin: "5px 0 0", fontSize: "12.5px", lineHeight: 1.6, color: "var(--gray-mid)" }}>
                  {frasePromocoes(viva.c)}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* O rodapé que acompanha: fecha ou, fechada, dá o envio. */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          marginTop: "24px",
          backgroundColor: "var(--cream)",
          borderTop: "1px solid #F0E6D0",
          padding: "12px 0 16px",
        }}
      >
        {!congelada ? (
          <>
            <button
              onClick={congelar}
              // Desactivado-suave, não desligado: o botão fica no sítio
              // a dizer PORQUE não há nada para fechar.
              aria-disabled={!podeCongelar || ocupado}
              className="acao acao--cheia"
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: "12px",
                fontSize: "13.5px",
                fontWeight: "600",
                boxShadow: "0 4px 12px rgba(201,168,76,0.30)",
                opacity: podeCongelar && !ocupado ? 1 : 0.45,
              }}
            >
              {podeCongelar
                ? `Fechar a lista · ${pessoas} ${pessoas === 1 ? "nome" : "nomes"}`
                : "Não há ninguém para receber"}
            </button>
            <p style={{ margin: "9px 0 0", textAlign: "center", fontSize: "11.5px", fontStyle: "italic", color: "var(--gray-mid)" }}>
              {podeCongelar
                ? "Fixa estes nomes. Ainda não envia nada."
                : "Ajuste a escolha até a contagem responder."}
            </p>
          </>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              backgroundColor: "#FEF9EC",
              border: "1px solid var(--gold-light)",
              borderRadius: "12px",
              padding: "13px 16px",
              animation:
                animarBanda && !reduzido
                  ? "dlm-com-revelar 480ms cubic-bezier(0.22, 1, 0.36, 1) both"
                  : "none",
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
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "12.5px", fontWeight: "600" }}>
                Lista fechada:{" "}
                {!congelada || nomesCongelados === null
                  ? "…"
                  : `${nomesCongelados} ${nomesCongelados === 1 ? "nome" : "nomes"}`}
                , {quandoAs(comunicado.congelado_em)}.
              </div>
              <div style={{ fontSize: "11.5px", color: "var(--gray-mid)", marginTop: "2px" }}>
                Se entrar um evento novo, esta lista não muda.{" "}
                {!mexida && (
                  <button
                    onClick={desfazer}
                    disabled={ocupado}
                    className="ligacao"
                    style={{
                      fontSize: "11.5px",
                      color: "var(--gray-mid)",
                      textDecoration: "underline",
                      textUnderlineOffset: "3px",
                    }}
                  >
                    Desfazer
                  </button>
                )}
              </div>
            </div>
            <button
              onClick={onAbrirExpedicao}
              className="acao acao--cheia"
              style={{
                flexShrink: 0,
                padding: "10px 14px",
                borderRadius: "10px",
                fontSize: "12px",
                fontWeight: "600",
                boxShadow: "0 4px 12px rgba(201,168,76,0.30)",
                whiteSpace: "nowrap",
              }}
            >
              Abrir o envio →
            </button>
          </div>
        )}
        {erro && (
          <p role="alert" style={{ margin: "10px 0 0", textAlign: "center", fontSize: "12.5px", color: "#DC2626" }}>
            {erro}
          </p>
        )}
      </div>
    </div>
  );
}
