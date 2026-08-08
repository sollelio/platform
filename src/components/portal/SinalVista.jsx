import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { EMPRESA, linkWhatsAppCasa } from "../../lib/casa";
import {
  overline, playfair, diaEMes, partesDaData, SEMANA, formatarEuroPT, naoVazio,
} from "./base";
import {
  FileteComLosango, CartaoBranco, VistoDourado, Assinatura,
} from "./pecas";
import {
  CapsulaCheia, CapsulaVazada, LigacaoDiscreta,
} from "./documentos-pecas";
import DestaqueAcompanhamento from "./DestaqueAcompanhamento";

// ============================================================
// SinalVista — o ecrã do sinal (/acompanhar/:token/sinal).
//
// O passo entre o aceite e a data reservada. O dia é o protagonista e a
// verdade diz-se serena: até ao sinal entrar, o dia continua em aberto no
// calendário da casa. A confirmação da cliente NUNCA reserva — é aviso;
// quem carimba é o registo da Nádia (decisão 4 de 08/08/2026).
//
// Os ecrãs, pela ordem em que se decidem (o mockup aprovado é a spec):
//   D  sinal feito            — «O dia é seu. Ninguém mais o leva.»
//   E  caducado               — a data passou sem sinal: NUNCA se convida
//                               a pagar um dia que já foi.
//   H  dia tomado             — outro evento vivo tem o sinal registado.
//   H′ tomado + aviso próprio — pagou e o dia já era de outra: a casa
//                               devolve por inteiro e fala nesse dia.
//   H″ tomado + prazo próprio — a promessa quebrada: a casa registou o
//                               sinal rival por cima do «guardado para
//                               si» — as desculpas dizem-se de frente.
//   G  preferência alheia     — substitui o ecrã POR INTEIRO, seja qual
//   G′ em confirmação alheia    for a config: nem dados, nem a conversa
//                               de pagar.
//   C  aviso entregue         — «Recebemos o seu aviso.» — persiste até
//                               a casa confirmar.
//   F  guardado para si       — o convite com o selo do prazo da Nádia.
//   A  o convite              — orçamento aceite, dia livre.
//   B  a revelação            — a forma de pagamento que a Nádia
//                               configurou (mbway_iban | conversa |
//                               dinheiro | outra).
//
// O H″ lê `estado_do_dia.promessa_quebrada` (migração 084): a projecção
// só a levanta quando o dia foi tomado com o prazo próprio ainda de pé —
// deriva em leitura, e antes da 084 a chave nem existe, por isso o ramo
// degrada sozinho para o H simples. Precedência: o H′ ganha ao H″ quando
// ambos — o sinal cruzado é o desfecho mais grave, e a devolução integral
// é a primeira coisa a dizer.
//
// A verdade da canalização: a RPC do «já paguei» reconfere o dia no clique
// (dia_tomado / fechado em vez de aceitar às cegas), e a vista reconfere ao
// ganhar foco e ao voltar a ficar visível — é isso que «será esta página a
// dizê-lo» promete, nem mais nem menos.
//
// Estilos INLINE, como todo o portal. As peças vêm de pecas.jsx e
// documentos-pecas.jsx; só o que não existe lá se desenha aqui.
// ============================================================

// ---------- A RPC, com o wrapper local ----------
// A lib/portal.js é da cablagem (outro bloco); o wrapper vive aqui para a
// vista não depender de um ficheiro que ainda vai mudar. Os estados que a
// 083 devolve: ok, ja_feito, ja_reservado, dia_tomado, fechado, terminado.
async function confirmarSinalRPC(token, metodo) {
  const { data, error } = await supabase.rpc("dlm_portal_confirmar_sinal", {
    p_token: token,
    p_metodo: metodo || null,
  });
  if (error) throw error;
  return data;
}

const MSG_ERRO_REDE =
  "Não foi possível guardar a confirmação. Verifique a ligação e tente novamente.";

// ---------- Peças locais ----------

// O selo de estado — a pastilha vazada que diz um facto curto («guardado
// para si até…», «à espera da confirmação da casa»). Informa, não pede.
function Selo({ children }) {
  return (
    <span style={{
      display: "inline-block", fontSize: "10.5px", color: "var(--gold-dark)",
      backgroundColor: "#FEF9EC", border: "1px solid var(--gold-light)",
      borderRadius: "999px", padding: "4px 11px",
    }}>
      {children}
    </span>
  );
}

// O medalhão SOLTO do desfecho D. O Medalhao de pecas.jsx assenta na borda
// de um cartão (position absolute) — aqui está sozinho no topo do ecrã,
// como no mockup, por isso desenha-se a variante solta com o mesmo visto.
function MedalhaoSolto() {
  return (
    <div style={{
      width: "36px", height: "36px", borderRadius: "50%", margin: "0 auto 14px",
      backgroundColor: "#FEF9EC", border: "1px solid var(--gold-light)",
      boxShadow: "0 0 0 5px var(--cream), 0 4px 12px rgba(201,168,76,0.22)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <VistoDourado tamanho={16} />
    </div>
  );
}

// A caixa «já fiz o pagamento» — o par do pórtico das condições
// (DocumentosVista), vestido para o claro: linha inteira clicável,
// aria-pressed, engaste que enche a dourado com o visto. Nunca um alvo
// de 26 px.
function CaixaConfirmo({ texto, marcado, onToggle, reduzir }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={marcado}
      className="foco"
      style={{
        display: "flex", alignItems: "flex-start", gap: "13px",
        width: "100%", boxSizing: "border-box", textAlign: "left",
        backgroundColor: marcado ? "rgba(201,168,76,0.13)" : "#FDFBF5",
        border: `1.5px solid ${marcado ? "var(--gold)" : "rgba(232,213,163,0.45)"}`,
        borderRadius: "14px", padding: "16px 15px", margin: "16px 0 12px",
        cursor: "pointer", fontFamily: "Inter, sans-serif",
        transition: reduzir ? "none" : "border-color 300ms ease, background-color 300ms ease",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "26px", height: "26px", borderRadius: "50%", boxSizing: "border-box",
          flex: "none", display: "flex", alignItems: "center", justifyContent: "center",
          marginTop: "1px",
          backgroundColor: marcado ? "var(--gold)" : "white",
          border: `1.5px solid ${marcado ? "var(--gold)" : "var(--gold-light)"}`,
          transition: reduzir ? "none" : "background-color 300ms ease, border-color 300ms ease",
        }}
      >
        <span style={{
          display: "inline-flex",
          transform: marcado ? "scale(1)" : "scale(0)",
          // A mola do visto sem biblioteca — o mesmo back-out do pórtico.
          // Com movimento reduzido, aparece e pronto.
          transition: reduzir ? "none" : "transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24">
            <path d="M4.5 12.5l5 5 10-10" fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </span>
      <span style={{ fontSize: "14px", fontWeight: 600, lineHeight: 1.6, color: "var(--gold-dark)", textWrap: "pretty" }}>
        {texto}
      </span>
    </button>
  );
}

// A linha copiável — a LINHA INTEIRA é o alvo, nunca só a palavra
// «copiar». O «copiado ✓» fica dois segundos no próprio sítio. Se o
// browser negar o clipboard, selecciona-se o texto — a pessoa copia à mão.
function LinhaCopiavel({ nome, dado, dadoParaCopiar, ultima, copiado, onCopiar }) {
  const dadoRef = useRef(null);
  return (
    <button
      type="button"
      onClick={() => onCopiar(nome, dadoParaCopiar ?? dado, dadoRef.current)}
      aria-label={copiado ? `${nome} copiado` : `Copiar ${nome} ${dado}`}
      className="foco"
      style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        gap: "10px", width: "100%", boxSizing: "border-box", textAlign: "left",
        padding: "13px 2px", background: "none", cursor: "pointer",
        border: "none", borderBottom: ultima ? "none" : "1px solid #F6EFE0",
        borderRadius: 0, fontFamily: "Inter, sans-serif",
      }}
    >
      <span style={{ ...overline(undefined, "0.14em", "10px"), flex: "none" }}>{nome}</span>
      <span
        ref={dadoRef}
        style={{
          fontSize: "13.5px", color: "var(--charcoal)",
          fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere",
        }}
      >
        {dado}
      </span>
      {/* O aria-live anuncia o «copiado ✓» a quem não o vê — o contentor
          persiste, só a palavra muda. */}
      <span aria-live="polite" style={{ flex: "none" }}>
        {copiado ? (
          <span style={{ fontSize: "10.5px", fontWeight: 600, color: "var(--gold-dark)" }}>
            copiado ✓
          </span>
        ) : (
          <span style={{
            fontSize: "10.5px", color: "var(--gold-dark)",
            borderBottom: "1px solid var(--gold-light)", paddingBottom: "2px",
            display: "inline-block",
          }}>
            copiar
          </span>
        )}
      </span>
    </button>
  );
}

// O chip do método — «como seguiu?» é opcional e viaja no aviso à Nádia:
// diz-lhe onde conferir. Nunca é obrigatório.
function ChipMetodo({ rotulo, escolhido, onEscolher }) {
  return (
    <button
      type="button"
      onClick={onEscolher}
      aria-pressed={escolhido}
      className="foco"
      style={{
        fontSize: "10.5px", fontWeight: escolhido ? 600 : 400,
        color: "var(--gold-dark)",
        backgroundColor: escolhido ? "#FEF9EC" : "white",
        border: `1px solid ${escolhido ? "var(--gold)" : "var(--gold-light)"}`,
        borderRadius: "999px", padding: "4px 11px", cursor: "pointer",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {rotulo}
    </button>
  );
}

// O corpo cinzento de sempre — 12.5px, 1.7, textWrap pretty.
const corpo = (extra) => ({
  fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)",
  margin: 0, textWrap: "pretty", ...extra,
});

// A micro-linha informativa — 11.5px, passa AA sobre o creme.
const micro = (extra) => ({
  fontSize: "11.5px", color: "var(--gray-mid)", margin: "8px 0 0", ...extra,
});

// ============================================================
// A vista
// ============================================================
export default function SinalVista({ token, dados, reduzir, aoVoltar, aoRecarregar }) {
  // ---------- O que a projecção diz ----------
  const sinal = dados?.sinal || null;
  const ev = dados?.evento || null;
  const dias = ev?.dias_para;
  const jornada = Array.isArray(dados?.jornada) ? dados.jornada : [];

  // A inferência canónica do front (a mesma da PortalPage): a etapa
  // «sinal» com estado que não seja «por acontecer».
  const sinalFeitoProj = jornada.some(
    (e) => e.etapa === "sinal" && e.estado !== "por_acontecer",
  );
  const aceite = dados?.resposta_orcamento?.acto === "aceitou";

  const estadoDia = sinal?.estado_do_dia?.estado || "livre";
  const prazoAte = sinal?.estado_do_dia?.ate || null;
  // 084 · a promessa quebrada: o dia foi tomado com o prazo próprio ainda
  // de pé. Antes da 084 a chave nem existe — false, e o H simples serve.
  const promessaQuebrada = !!sinal?.estado_do_dia?.promessa_quebrada;
  const conf = sinal?.confirmacao || null;
  const confVivaProj = !!(conf?.em && !conf?.anulada_em);
  const anulada = !!(conf?.anulada_em && !confVivaProj);

  // ---------- A memória local do clique ----------
  // A RPC pode dizer o que a projecção ainda não sabe — o ecrã vira NO
  // MOMENTO e o aoRecarregar traz a verdade do servidor logo a seguir.
  const [tomadoLocal, setTomadoLocal] = useState(false);
  const [reservadoLocal, setReservadoLocal] = useState(false);
  const [confirmadoLocal, setConfirmadoLocal] = useState(false);

  // A revelação (B). Uma confirmação ANULADA pela Nádia devolve a cliente
  // directamente ao ecrã de pagamento — com a linha honesta lá dentro. A
  // anulação entra na CONDIÇÃO do ecrã (revelado || anulada), não no
  // estado inicial: pode chegar DEPOIS da montagem, pela reconferência do
  // foco, e tem de virar o ecrã na mesma.
  const [revelado, setRevelado] = useState(false);
  // Em C, «ver os dados de pagamento outra vez» reabre só os dados —
  // sem caixa nem cápsula: o aviso já está entregue, não se pede outro.
  const [verDados, setVerDados] = useState(false);

  const [marcado, setMarcado] = useState(false);
  const [metodoIndicado, setMetodoIndicado] = useState(null);
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState(null);
  // O destaque escuro do que o sinal abre (Bloco 3) — abre do teaser.
  const [destaqueAberto, setDestaqueAberto] = useState(false);

  // O «copiado ✓» de dois segundos, uma linha de cada vez.
  const [copiado, setCopiado] = useState(null);
  const timerCopiado = useRef(null);
  useEffect(() => () => clearTimeout(timerCopiado.current), []);

  const sinalFeito = sinalFeitoProj || reservadoLocal;
  const confViva = confVivaProj || confirmadoLocal;
  const tomado = tomadoLocal || estadoDia === "tomado";

  // Ao entrar, a vista começa do topo — o padrão das outras vistas. As
  // trocas de ecrã DENTRO da vista repõem-no nos próprios gestos (revelar,
  // confirmar), onde o momento da troca é conhecido.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // A reconferência prometida: ao ganhar foco ou voltar a ficar visível,
  // re-pede-se a projecção — «será esta página a dizê-lo».
  useEffect(() => {
    if (!aoRecarregar) return undefined;
    const reconferir = () => {
      if (document.visibilityState === "hidden") return;
      aoRecarregar();
    };
    window.addEventListener("focus", reconferir);
    document.addEventListener("visibilitychange", reconferir);
    return () => {
      window.removeEventListener("focus", reconferir);
      document.removeEventListener("visibilitychange", reconferir);
    };
  }, [aoRecarregar]);

  // A guarda: sem orçamento aceite (e sem sinal feito) este ecrã não
  // existe — devolve-se à jornada, que sabe o que dizer. E sem a chave
  // `sinal` na projecção (migração 083 por correr, ou sem orçamento
  // publicado) o ecrã não tem com que trabalhar: mesma porta.
  //
  // MAS nunca de imediato: quem chega do ecrã «feito» do aceite traz a
  // projecção OBSOLETA da página (o acto registou-se dentro dos
  // documentos, e a página só re-pede ao regressar à jornada) — sem
  // esta espera, a cápsula «Tratar do sinal» caía sempre de volta à
  // jornada. Pede-se a reconferência primeiro; só se a projecção
  // fresca continuar sem base é que a porta fecha.
  const semBase = !sinalFeito && (!aceite || !sinal);
  const [reconferiu, setReconferiu] = useState(false);
  useEffect(() => {
    if (!semBase || reconferiu) return undefined;
    let vivo = true;
    Promise.resolve(aoRecarregar?.()).finally(() => {
      if (vivo) setReconferiu(true);
    });
    return () => {
      vivo = false;
    };
  }, [semBase, reconferiu, aoRecarregar]);
  useEffect(() => {
    if (semBase && reconferiu) aoVoltar?.();
  }, [semBase, reconferiu, aoVoltar]);
  if (semBase) return null;

  // ---------- Datas e valores, nas palavras da casa ----------
  const quandoDia = diaEMes(ev?.data); // «25 de Agosto»
  const partes = partesDaData(ev?.data);
  const diaSemana = partes ? SEMANA[partes.semana] : null;
  const contagem =
    typeof dias === "number" && dias > 1 ? `daqui a ${dias} dias`
      : dias === 1 ? "é amanhã"
        : dias === 0 ? "é hoje"
          : null;

  const valor = formatarEuroPT(sinal?.valor);
  const total = formatarEuroPT(sinal?.total);

  // ---------- A config da forma de pagamento ----------
  // A config vem CRUA do evento; os defaults da casa aplicam-se aqui, que
  // é quem os conhece (083): sem escolha → MB Way + IBAN com os dados da
  // casa — e sem MB Way da casa registado, o default é só IBAN (decisão
  // 8). EMPRESA.mbway ainda não existe em casa.js; o dia em que nascer,
  // este ecrã passa a mostrá-lo sem mudar uma linha.
  const config = sinal?.config || null;
  const metodoCfg = config?.metodo || "mbway_iban";
  const mbway = naoVazio(config?.mbway) ? config.mbway.trim()
    : naoVazio(EMPRESA.mbway) ? EMPRESA.mbway.trim() : null;
  const iban = naoVazio(config?.iban) ? config.iban.trim() : EMPRESA.iban;
  const instrucao = naoVazio(config?.instrucao) ? config.instrucao.trim() : null;

  // A caixa fala a língua do método: transferiu ou entregou em mãos.
  const textoCaixa = metodoCfg === "dinheiro" || metodoCfg === "outra"
    ? "Já entreguei o sinal"
    : "Já fiz o pagamento do sinal";

  // A conversa — mensagem neutra de género, com a data quando a há.
  const mensagemConversa = `Olá! Escrevo para tratar do sinal do meu evento${quandoDia ? ` de ${quandoDia}` : ""}.`;
  const urlConversa = linkWhatsAppCasa(mensagemConversa);
  const abrirConversa = () => window.open(urlConversa, "_blank", "noopener,noreferrer");

  // ---------- Copiar ----------
  const copiar = async (chave, texto, elemento) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(chave);
      clearTimeout(timerCopiado.current);
      timerCopiado.current = setTimeout(() => setCopiado(null), 2000);
    } catch {
      // O clipboard negado (http, permissões): selecciona-se o texto da
      // linha — o gesto de copiar fica a um toque, em vez de perdido.
      if (!elemento) return;
      try {
        const alcance = document.createRange();
        alcance.selectNodeContents(elemento);
        const selecao = window.getSelection();
        selecao.removeAllRanges();
        selecao.addRange(alcance);
      } catch {
        /* sem selecção possível — o número continua legível à mesma */
      }
    }
  };

  // ---------- Avisar a casa ----------
  const avisar = async () => {
    if (!marcado || aEnviar) return;
    setAEnviar(true);
    setErro(null);
    try {
      const r = await confirmarSinalRPC(token, metodoIndicado);
      const estado = r?.estado;
      if (estado === "ok" || estado === "ja_feito") {
        // «ja_feito» agradece na mesma: o carimbo que fica é o primeiro,
        // e para quem está a ler a diferença não existe.
        setConfirmadoLocal(true);
        setRevelado(false);
        window.scrollTo(0, 0);
        aoRecarregar?.();
      } else if (estado === "ja_reservado") {
        // Quem já pagou e volta é devolvido ao desfecho — é o D.
        setReservadoLocal(true);
        window.scrollTo(0, 0);
        aoRecarregar?.();
      } else if (estado === "dia_tomado") {
        // O mundo mudou debaixo dos pés: o ecrã vira H no momento, e a
        // projecção confirma logo a seguir.
        setTomadoLocal(true);
        window.scrollTo(0, 0);
        aoRecarregar?.();
      } else if (estado === "fechado" || estado === "terminado") {
        // Prazo/confirmação alheia de pé, ou o token/pedido morreu — o
        // ecrã nem devia estar aberto. A projecção fresca diz o que há a
        // dizer (G/G′, o caducado, ou a cortina da página).
        aoRecarregar?.();
      } else {
        // Um estado que não se conhece trata-se como falha honesta: a
        // caixa mantém-se marcada e a cápsula volta a poder tocar-se.
        setErro(MSG_ERRO_REDE);
      }
    } catch (e) {
      console.error(e);
      setErro(MSG_ERRO_REDE);
    } finally {
      setAEnviar(false);
    }
  };

  // ---------- As peças partilhadas dos ecrãs ----------

  // Os dados de pagamento em si — servem a revelação (B) e o «ver os
  // dados outra vez» do aviso entregue (C). `soLeitura` cala a caixa e a
  // cápsula: com o aviso entregue, não se pede segundo aviso.
  const dadosDePagamento = (
    metodoCfg === "conversa" ? (
      <>
        <p style={corpo({ maxWidth: "290px", margin: "0 auto 18px" })}>
          Para este evento, o sinal combina-se connosco, na conversa — a
          mensagem já vai escrita, só falta enviá-la.
        </p>
        <CapsulaCheia onClick={abrirConversa}>Continuar na conversa</CapsulaCheia>
        <p style={micro({ marginTop: "10px" })}>
          abre o WhatsApp com: «{mensagemConversa}»
        </p>
      </>
    ) : metodoCfg === "dinheiro" || metodoCfg === "outra" ? (
      <>
        <CartaoBranco>
          {/* A instrução que a Nádia escreveu na folha, nas palavras
              dela — em itálico, para se ouvir que é ela a falar. */}
          <p style={corpo({ fontStyle: "italic" })}>
            {instrucao
              ? `«${instrucao}»`
              : "Combinamos a entrega connosco — fale-nos pela conversa, que acertamos o dia."}
          </p>
        </CartaoBranco>
        <p style={{ margin: "14px 0 6px" }}>
          <LigacaoDiscreta href={urlConversa}>Combinar na conversa</LigacaoDiscreta>
        </p>
      </>
    ) : (
      // mbway_iban — o default da casa.
      <CartaoBranco padding="12px 16px" style={{ textAlign: "left" }}>
        {mbway && (
          <LinhaCopiavel
            nome="MB Way"
            dado={mbway}
            copiado={copiado === "MB Way"}
            onCopiar={copiar}
          />
        )}
        <LinhaCopiavel
          nome="Transferência"
          dado={iban}
          // O IBAN copia SEM espaços — pronto a colar no homebanking.
          dadoParaCopiar={String(iban).replace(/\s+/g, "")}
          ultima
          copiado={copiado === "Transferência"}
          onCopiar={copiar}
        />
        <p style={micro({ textAlign: "left" })}>
          Na descrição, escreva o seu nome — é assim que o reconhecemos.
        </p>
      </CartaoBranco>
    )
  );

  // A cápsula da conversa em modo saída — os ecrãs fechados (E/G/G′/H/H′)
  // acabam todos na mesma porta.
  const capsulaConversa = (
    <CapsulaVazada
      onClick={abrirConversa}
      style={{ width: "auto", display: "inline-block", padding: "15px 26px" }}
    >
      Falar connosco na conversa
    </CapsulaVazada>
  );

  // ---------- O ecrã que toca a este momento ----------
  let conteudo;
  let comVoltarDiscreto = true;

  if (sinalFeito) {
    // ── D · a data reservada — o beat que paga a sequência inteira ──
    conteudo = (
      <>
        <MedalhaoSolto />
        <p style={overline()}>A data reservada</p>
        <p style={{ ...playfair, fontSize: "22px", lineHeight: 1.3, marginTop: "10px", textWrap: "balance" }}>
          {quandoDia ? `O dia ${quandoDia} é seu.` : "O seu dia é seu."}
          <br />
          Ninguém mais o leva.
        </p>
        <FileteComLosango margem="18px auto 20px" />
        <p style={corpo({ maxWidth: "290px", margin: "0 auto 20px" })}>
          Recebemos o sinal. O acompanhamento acordou — o questionário, o
          projecto, a preparação e as fotografias seguem agora consigo,
          nesta página.
        </p>
        <CapsulaVazada
          onClick={aoVoltar}
          style={{ width: "auto", display: "inline-block", padding: "15px 26px" }}
        >
          Ver o acompanhamento
        </CapsulaVazada>
      </>
    );
    comVoltarDiscreto = false;
  } else if (typeof dias === "number" && dias < 0) {
    // ── E · caducado — nunca se pede dinheiro por um dia que já foi ──
    conteudo = (
      <>
        <p style={overline()}>Sobre a sua data</p>
        <p style={{ ...playfair, fontSize: "22px", lineHeight: 1.3, marginTop: "10px", textWrap: "balance" }}>
          {quandoDia ? `O dia ${quandoDia}` : "A sua data"}
          <br />
          já passou.
        </p>
        <FileteComLosango margem="18px auto 20px" />
        <p style={corpo({ maxWidth: "290px", margin: "0 auto 20px" })}>
          A data chegou sem o sinal, e o calendário seguiu. Se ainda quiser
          a Do Luxo à Mesa no seu evento, fale connosco — encontramos uma
          nova data juntos.
        </p>
        {capsulaConversa}
      </>
    );
  } else if (tomado) {
    // ── H / H′ / H″ · o dia ficou de outra celebração ──
    // Dispara com o REGISTO do sinal rival (o acto que reserva), nunca
    // com uma confirmação. H′ é o desfecho duro: quem tinha confirmado
    // «já paguei» ouve a regra da casa — a devolução integral (dec. 17)
    // — e ganha ao H″ quando ambos: o sinal cruzado é mais grave do que
    // o prazo quebrado, e a devolução é a primeira coisa a dizer. H″
    // (migração 084) é a promessa quebrada — a Nádia registou o rival
    // por cima do «guardado para si» — e as desculpas da casa dizem-se
    // de frente, nunca um «ficou reservado» seco por cima da promessa.
    conteudo = confViva ? (
      <>
        <p style={overline()}>Sobre a sua data</p>
        <p style={{ ...playfair, fontSize: "22px", lineHeight: 1.3, marginTop: "10px", textWrap: "balance" }}>
          O seu sinal chegou —
          <br />
          e o dia já era de outra.
        </p>
        <FileteComLosango margem="18px auto 20px" />
        <p style={corpo({ maxWidth: "290px", margin: "0 auto 20px" })}>
          Os dois sinais cruzaram-se, e lamentamos. O que enviou volta por
          inteiro, e é connosco: falamos consigo hoje para devolver e para
          encontrar uma nova data — se assim o quiser, igualmente sua.
        </p>
        {capsulaConversa}
      </>
    ) : promessaQuebrada ? (
      <>
        <p style={overline()}>Sobre a sua data</p>
        <p style={{ ...playfair, fontSize: "22px", lineHeight: 1.3, marginTop: "10px", textWrap: "balance" }}>
          Não conseguimos manter
          <br />
          o dia guardado para si.
        </p>
        <FileteComLosango margem="18px auto 20px" />
        <p style={corpo({ maxWidth: "290px", margin: "0 auto 20px" })}>
          O dia{quandoDia ? ` ${quandoDia}` : ""}, que estava guardado
          para si, ficou de outra celebração — as nossas desculpas. Fale
          connosco: encontramos a data certa para o seu evento, com a
          casa a tratar de tudo.
        </p>
        {capsulaConversa}
      </>
    ) : (
      <>
        <p style={overline()}>Sobre a sua data</p>
        <p style={{ ...playfair, fontSize: "22px", lineHeight: 1.3, marginTop: "10px", textWrap: "balance" }}>
          {quandoDia ? `O dia ${quandoDia}` : "Este dia"}
          <br />
          ficou reservado.
        </p>
        <FileteComLosango margem="18px auto 20px" />
        <p style={corpo({ maxWidth: "290px", margin: "0 auto 20px" })}>
          Este dia ficou reservado por outra celebração. Se quiser a Do
          Luxo à Mesa no seu evento, fale connosco — encontramos uma nova
          data juntos.
        </p>
        {capsulaConversa}
      </>
    );
  } else if (estadoDia === "preferencia_alheia") {
    // ── G · a preferência de outro fecha o ecrã POR INTEIRO ──
    // Seja qual for a config: nem dados de pagamento, nem a conversa de
    // pagar. A data em que o dia volta a abrir é a única coisa que o
    // portal precisa (e pode) dizer — do rival não sai uma migalha.
    conteudo = (
      <>
        <p style={overline()}>Sobre a sua data</p>
        <p style={{ ...playfair, fontSize: "22px", lineHeight: 1.3, marginTop: "10px", textWrap: "balance" }}>
          Este dia tem uma
          <br />
          preferência em curso.
        </p>
        <FileteComLosango margem="18px auto 20px" />
        <p style={corpo({ maxWidth: "290px", margin: "0 auto 20px" })}>
          {quandoDia ? `O dia ${quandoDia} está` : "O dia está"} guardado
          para outra celebração{prazoAte ? ` até ${diaEMes(prazoAte)}` : ""}.
          Se voltar a abrir, será esta página a dizê-lo. E se preferir não
          esperar, encontramos consigo uma data próxima — igualmente sua.
        </p>
        {capsulaConversa}
      </>
    );
  } else if (estadoDia === "em_confirmacao_alheia") {
    // ── G′ · o dia em confirmação — a protecção da Gina ──
    // Sem data no ecrã: dura até a Nádia registar ou limpar; o relógio
    // dela é o aviso na Caixa de Entrada.
    conteudo = (
      <>
        <p style={overline()}>Sobre a sua data</p>
        <p style={{ ...playfair, fontSize: "22px", lineHeight: 1.3, marginTop: "10px", textWrap: "balance" }}>
          Este dia está
          <br />
          em confirmação.
        </p>
        <FileteComLosango margem="18px auto 20px" />
        <p style={corpo({ maxWidth: "290px", margin: "0 auto 20px" })}>
          Outra celebração disse-nos que enviou o sinal
          {quandoDia ? ` para o dia ${quandoDia}` : ""}, e estamos a
          conferir. Se o dia voltar a abrir, será esta página a dizê-lo.
          Se preferir, fale connosco — há datas próximas igualmente suas.
        </p>
        {capsulaConversa}
      </>
    );
  } else if (confViva) {
    // ── C · o aviso entregue — persiste até a casa confirmar ──
    conteudo = (
      <>
        <p style={overline()}>O sinal</p>
        <p style={{ ...playfair, fontSize: "22px", lineHeight: 1.3, marginTop: "10px", textWrap: "balance" }}>
          Recebemos o seu aviso.
        </p>
        <FileteComLosango margem="18px auto 20px" />
        <p style={corpo({ maxWidth: "290px", margin: "0 auto" })}>
          Vamos confirmar a chegada do sinal — normalmente no próprio dia.
          Assim que estiver connosco,
          {quandoDia ? (
            <> a data de <b style={{ color: "var(--charcoal)", fontWeight: 600 }}>{quandoDia}</b> fica</>
          ) : (
            <> a sua data fica</>
          )}{" "}
          reservada em seu nome, e esta página acorda por inteiro.
        </p>
        <p style={{ margin: "18px 0 14px" }}>
          <Selo>à espera da confirmação da casa</Selo>
        </p>
        {verDados ? (
          <div style={{ margin: "18px 0 4px" }}>{dadosDePagamento}</div>
        ) : (
          <p style={{ margin: "0 0 10px" }}>
            <LigacaoDiscreta onClick={() => setVerDados(true)}>
              Ver os dados de pagamento outra vez
            </LigacaoDiscreta>
          </p>
        )}
        <p style={micro({ marginTop: "12px" })}>
          Enganou-se ao marcar?{" "}
          <LigacaoDiscreta href={urlConversa}>Fale connosco pela conversa</LigacaoDiscreta>
        </p>
      </>
    );
  } else if (revelado || anulada) {
    // ── B · a revelação — a forma de pagamento que a Nádia configurou ──
    const titulo = metodoCfg === "conversa"
      ? "Este pagamento combina-se na conversa."
      : metodoCfg === "dinheiro" || metodoCfg === "outra"
        ? "O sinal deste evento combina-se assim:"
        : "Assim que o sinal chegar, o dia fica guardado.";
    conteudo = (
      <>
        <p style={{ ...overline(), fontVariantNumeric: "tabular-nums" }}>
          O sinal · {valor}
        </p>
        <p style={{ ...playfair, fontSize: "21px", lineHeight: 1.32, marginTop: "10px", textWrap: "balance" }}>
          {titulo}
        </p>
        <FileteComLosango margem="18px auto 20px" />

        {dadosDePagamento}

        {/* A linha honesta de quem foi limpo pela casa: o ecrã reabriu,
            e diz-se porquê — nunca se finge que nada aconteceu. */}
        {anulada && (
          <p style={micro({ marginTop: "12px" })}>
            A sua confirmação foi anulada — se o pagamento seguiu mesmo,{" "}
            <LigacaoDiscreta href={urlConversa}>fale connosco</LigacaoDiscreta>.
          </p>
        )}

        {/* «Pela conversa» não tem caixa: o canal é a Nádia, e ela fica
            logo a saber. Nos outros métodos o pagamento acontece longe
            dela — a caixa e a cápsula são o aviso. */}
        {metodoCfg !== "conversa" && (
          <>
            <CaixaConfirmo
              texto={textoCaixa}
              marcado={marcado}
              onToggle={() => {
                setMarcado((m) => !m);
                setErro(null);
              }}
              reduzir={reduzir}
            />

            {/* «Como seguiu?» — só onde há DOIS caminhos possíveis: sem
                MB Way à vista, a transferência é o único e a pergunta
                seria ruído. */}
            {marcado && metodoCfg === "mbway_iban" && mbway && (
              <>
                <p style={micro({ margin: "0 0 4px" })}>
                  Como seguiu?{" "}
                  <span style={{ color: "#9B9B9B" }}>(ajuda-nos a conferir — opcional)</span>
                </p>
                <div style={{ display: "flex", gap: "6px", justifyContent: "center", margin: "8px 0 14px" }}>
                  <ChipMetodo
                    rotulo="MB Way"
                    escolhido={metodoIndicado === "MB Way"}
                    onEscolher={() => setMetodoIndicado((m) => (m === "MB Way" ? null : "MB Way"))}
                  />
                  <ChipMetodo
                    rotulo="Transferência"
                    escolhido={metodoIndicado === "Transferência"}
                    onEscolher={() => setMetodoIndicado((m) => (m === "Transferência" ? null : "Transferência"))}
                  />
                </div>
              </>
            )}

            {/* A cápsula da casa: dorme inerte, acende com a caixa —
                visível para se saber o que vem, intocável até lá. */}
            <CapsulaCheia inerte={!marcado} aTrabalhar={aEnviar} onClick={avisar}>
              {aEnviar ? "A guardar…" : "Avisar a Do Luxo à Mesa"}
            </CapsulaCheia>

            {erro && (
              <p style={{ fontSize: "12px", lineHeight: 1.7, color: "#9C5A3C", margin: "10px 0 0", textWrap: "pretty" }}>
                {erro}
              </p>
            )}

            {/* O fecho é só do B (mbway_iban) — no mockup, o B‴ do
                dinheiro/«à minha maneira» termina na cápsula. */}
            {metodoCfg === "mbway_iban" && (
              <p style={corpo({ marginTop: "14px" })}>
                A reserva confirma-se quando o sinal chegar à casa —
                receberá aqui o aviso, e é nesse momento que o
                acompanhamento acorda.
              </p>
            )}
          </>
        )}
      </>
    );
  } else {
    // ── A / F · o convite — o dia como protagonista ──
    // F é o A com o selo do prazo que a Nádia deu («guardado para si
    // até…»): a pressão visível é sempre um gesto dela, nunca do sistema.
    const guardado = estadoDia === "guardado_para_si" && prazoAte;
    conteudo = (
      <>
        <p style={overline()}>O passo que guarda o dia</p>
        <p style={{ ...playfair, fontSize: "22px", lineHeight: 1.3, marginTop: "10px", textWrap: "balance" }}>
          O orçamento está aceite.
          <br />
          Falta guardar a sua data.
        </p>
        <FileteComLosango margem="18px auto 20px" />

        {quandoDia && (
          <p style={{ ...playfair, fontSize: "31px", lineHeight: 1.15, margin: "2px 0 0" }}>
            {quandoDia}
          </p>
        )}
        {(diaSemana || contagem) && (
          <p style={micro({ marginTop: "2px", fontVariantNumeric: "tabular-nums" })}>
            {[diaSemana, contagem].filter(Boolean).join(" · ")}
          </p>
        )}

        {guardado ? (
          <>
            <p style={{ margin: "12px 0 0" }}>
              <Selo>guardado para si até {diaEMes(prazoAte)}</Selo>
            </p>
            <p style={micro({ maxWidth: "290px", margin: "10px auto 0" })}>
              Até lá, o dia é seu para confirmar. Depois, volta a ficar em
              aberto no calendário da casa.
            </p>
          </>
        ) : (
          <p style={micro({ maxWidth: "280px", margin: "10px auto 0" })}>
            Até ao sinal entrar, o dia continua em aberto no calendário da
            casa.
          </p>
        )}

        <CartaoBranco style={{ marginTop: "18px" }}>
          <p style={{ ...overline(), marginBottom: "6px" }}>O sinal</p>
          <p style={{ ...playfair, fontSize: "27px", fontVariantNumeric: "tabular-nums", margin: "2px 0 0" }}>
            {valor}
          </p>
          <p style={micro({ marginTop: "4px", fontVariantNumeric: "tabular-nums" })}>
            metade do valor total de {total}
          </p>
          {!guardado && (
            <p style={corpo({ margin: "14px 0 18px" })}>
              É o sinal que reserva o dia em seu nome — a partir daí,
              ninguém mais o leva. O restante combina-se connosco, sem
              pressa.
            </p>
          )}
          <CapsulaCheia
            onClick={() => {
              setRevelado(true);
              window.scrollTo(0, 0);
            }}
            style={guardado ? { marginTop: "14px" } : undefined}
          >
            Quero pagar o sinal
          </CapsulaCheia>
          <p style={micro()}>mostra como pagar — nada fica pago ao tocar</p>
        </CartaoBranco>

        {/* O teaser do que o sinal abre — acende o destaque escuro do
            pórtico aqui mesmo, sem sair do ecrã. */}
        {!guardado && (
          <div style={{ marginTop: "22px", paddingTop: "20px", borderTop: "1px solid #F0E6D0" }}>
            <p style={{ ...overline(), marginBottom: "4px" }}>Depois do sinal</p>
            <p style={{ ...playfair, fontSize: "17px", margin: "0 0 10px", textWrap: "balance" }}>
              O seu evento, acompanhado em tempo real.
            </p>
            <LigacaoDiscreta onClick={() => setDestaqueAberto(true)}>
              Ver o que se abre
            </LigacaoDiscreta>
          </div>
        )}
      </>
    );
  }

  // ---------- A moldura — coluna centrada, como as outras vistas ----------
  return (
    <div style={{ padding: "34px 26px 32px", textAlign: "center" }}>
      {conteudo}

      {/* A porta de saída discreta — o D já tem a sua cápsula própria. */}
      {comVoltarDiscreto && (
        <p style={{ margin: "30px 0 0" }}>
          <LigacaoDiscreta apagada onClick={aoVoltar}>
            Voltar ao acompanhamento
          </LigacaoDiscreta>
        </p>
      )}

      <Assinatura style={{ marginTop: "28px" }} />

      {destaqueAberto && (
        <DestaqueAcompanhamento
          reduzir={reduzir}
          aoFechar={() => setDestaqueAberto(false)}
        />
      )}
    </div>
  );
}
