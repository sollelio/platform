import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRotas } from "../../lib/rotasAdmin";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../lib/supabase";
import {
  getValorAtual,
  getResumoSubmissao,
  seccoesDoModelo,
} from "../../lib/submissionFields";
import { iniciarTour, tourJaVista } from "../../lib/tour";
import {
  getTipoEventoLivre,
  precisaClassificacao,
  encontrarModeloPorNome,
  associarModeloAoEvento,
  criarModeloEAssociar,
} from "../../lib/tipoEvento";
import MensagensSheet from "./MensagensSheet";
import { MarcaVisto, MarcaCruz } from "./marcas";
import { Icone } from "./Navegacao";
import Jornada from "./Jornada";
import { construirEtapas } from "./jornadaEtapas";
import { estadoFormularioDoEvento } from "../../lib/invites";
import { fundirCampos } from "../../lib/briefingEdicao";
import { codigoErroRpc } from "../../lib/rpc";
import { getPagamentosEvento } from "../../lib/pagamentos";
import { documentosDoEvento } from "../../lib/documentos";
import { traduzirErroDaCasa } from "../../lib/errosDaCasa";

// ============================================================
// SubmissionDrawer — painel lateral de detalhes de um evento.
// GENÉRICO: gera as secções a partir dos steps do modelo de evento,
// funcionando para Casamento, Aniversário, ou qualquer modelo futuro.
//
// Leitura: mostra só os campos preenchidos, agrupados pelo título do
//   passo (step) a que pertencem. Lê via getValorAtual (colunas antigas
//   OU respostas).
// Edição: mostra todos os campos do modelo; ao guardar, escreve no
//   respostas (JSONB) E, quando o campo tem coluna antiga equivalente,
//   também na coluna — para não partir o Casamento nem os briefings.
//
// Classificação do tipo "Outro": quando o evento não tem modelo mas o
//   cliente escreveu um tipo na captação (respostas.tipoEventoOutro),
//   aparece um banner para associar a um modelo existente ou criar um
//   novo com um clique (ver lib/tipoEvento.js).
//
// Props:
//   selected       — a submissão selecionada (ou null)
//   eventTypes     — lista de modelos de evento
//   onClose()      — fechar o drawer
//   onStatusChange(id, novoStatus)
//   onSaved(submissaoAtualizada) — após guardar edição
//   onGerarDocumento(submissao, "orcamento"|"contrato") — abre o
//     separador Documentos com o documento pré-preenchido deste evento
//     a este evento (as respostas atualizam-no, não criam duplicados)
//   onModeloCriado() — após criar um modelo novo via classificação
//     (o AdminPage recarrega os eventTypes)
// ============================================================

const formatData = (d) => {
  if (!d) return "Sem data";
  return new Date(d).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};


export default function SubmissionDrawer({
  selected,
  eventTypes,
  onClose,
  onStatusChange,
  onSaved,
  onGerarDocumento,
  invites = [],
  // Sem saber que convites existem, «este evento não tem formulário» é
  // um palpite — e o palpite errado cria um formulário a mais que, ao
  // ser preenchido, faz nascer cliente e evento DUPLICADOS. Enquanto
  // isto for verdade, o gesto cala-se em vez de adivinhar.
  convitesPorChegar = false,
  onModeloCriado,
  onRecuperarPerdido,
}) {
  const [folhaMensagens, setFolhaMensagens] = useState(false);
  const [pagamentosDoEvento, setPagamentosDoEvento] = useState(null);
  const [docsDoEvento, setDocsDoEvento] = useState(null);
  const navigate = useNavigate();
  const rotas = useRotas();

  // Guia interativo — a dica visual (sublinhado + hover) sozinha não
  // estava a ser óbvia o suficiente; isto aponta mesmo para o campo, uma
  // única vez por browser, na primeira vez que a Nádia abre um evento.
  // Dispara depois do slide-in da drawer assentar (mesmo temporizador
  // que o FormPage.jsx usa para a tour do formulário público).
  useEffect(() => {
    if (!selected || tourJaVista("data-evento")) return;
    const temporizador = setTimeout(() => {
      iniciarTour("data-evento", [
        {
          element: "#tour-data-evento",
          popover: {
            title: "A data é editável",
            description:
              "Clica aqui a qualquer momento para corrigir a data deste evento.",
          },
        },
      ]);
    }, 500);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // O plano (pagamentos_previstos) e o que já entrou — só para a
  // Jornada poder dizer a verdade no passo "Sinal": previsto menos
  // recebido, em vez de metade do valor acordado. Guarda o id junto
  // dos dados para se saber de quem eles são; se falhar, fica sem
  // plano e a Jornada cai na estimativa de sempre — nunca vale a pena
  // estragar o drawer por causa disto.
  useEffect(() => {
    const id = selected?.id;
    if (!id) return;
    let cancelado = false;
    getPagamentosEvento(id)
      .then((dados) => !cancelado && setPagamentosDoEvento({ id, ...dados }))
      .catch(
        (e) =>
          !cancelado &&
          // erro: true — a Jornada cai na estimativa, mas com uma nota
          // honesta em vez do silêncio (Lote 4B).
          (console.warn("Plano indisponível no drawer:", e?.message || e),
          setPagamentosDoEvento({ id, erro: true })),
      );
    // Os documentos: a evidência que acende o Contrato na régua antes
    // de a fase o reconhecer. Falhar deixa a régua decidir pela fase,
    // como sempre — nunca se estraga o drawer por causa disto.
    documentosDoEvento(id)
      .then((docs) => !cancelado && setDocsDoEvento({ id, docs }))
      .catch((e) => {
        console.warn("Documentos indisponíveis no drawer:", e?.message || e);
        if (!cancelado) setDocsDoEvento({ id, docs: [] });
      });
    return () => {
      cancelado = true;
    };
  }, [selected?.id]);

  // Escape fecha — primeiro a folha de mensagens, depois o drawer. E
  // nunca rouba a tecla a um campo com o cursor lá dentro: aí o Escape
  // é do campo (desistir do que se estava a escrever), não da moldura.
  useEffect(() => {
    if (!selected) return;
    const aoTeclar = (evento) => {
      if (evento.key !== "Escape") return;
      const tag = evento.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (folhaMensagens) setFolhaMensagens(false);
      else onClose();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [selected, folhaMensagens, onClose]);

  if (!selected) return <AnimatePresence />;

  // Ao saltar de um evento para outro o pedido novo ainda vem a
  // caminho — os números do anterior não valem para este.
  const planoDoEvento =
    pagamentosDoEvento?.id === selected.id ? pagamentosDoEvento : null;
  const documentosDoSelecionado =
    docsDoEvento?.id === selected.id ? docsDoEvento.docs : [];

  const tipo = eventTypes?.find((et) => et.id === selected.event_type_id);
  const seccoes = seccoesDoModelo(tipo);
  // O campo do modelo marcado como "a data do evento" (papel: "data") —
  // se existir, é aqui que o briefing e o formulário completo vão ler a
  // data (via respostas), por isso qualquer edição da data tem de
  // escrever também neste campo, não só na coluna data_evento. Mesmo
  // critério da leitura em getResumoSubmissao: o primeiro encontrado.
  const campoData = seccoes.flatMap((sec) => sec.campos).find((c) => c.papel === "data");
  const resumo = getResumoSubmissao(selected, eventTypes);
  // O tipo "Outro" que o cliente escreveu na captação (fallback de
  // exibição enquanto não é associado a um modelo).
  const tipoLivre = getTipoEventoLivre(selected);

  // O WhatsApp do evento (captação) — a última milha das mensagens:
  // escolher a mensagem-tipo → abre a conversa certa com o texto pronto.
  const numeroWhatsapp =
    getValorAtual(selected, "numeroWhatsapp") ||
    getValorAtual(selected, "contactoPrincipal") ||
    null;
  // Os TRÊS estados do formulário deste evento — a MESMA conta da
  // Jornada e do separador Documentos (fonte única em lib/invites):
  //   sem convite  → criar (painel Novo Formulário)
  //   pendente     → abrir para PREENCHER (como o ✏ do cartão)
  //   submetido    → nada a abrir (botão desativado, etapa morta)
  // "preenchido-noutro" (convite que duplicou; as respostas vivem
  // noutro evento) conta como não preenchido: o caminho honesto é
  // criar um formulário novo já apontado a este evento.
  const { estado: estadoFormulario } = estadoFormularioDoEvento(
    invites,
    selected.id,
  );
  const formularioSubmetido = estadoFormulario === "preenchido";
  // O selo do Formulário passa a NAVEGAR para a aba Documentos do
  // evento, com o realce na linha certa — o mesmo padrão que os outros
  // gestos da Jornada aqui do lado já usam.
  //
  // Antes abria o painel de criação no separador Formulários (por
  // callback e route state). A criação mudou-se para dentro do evento, e
  // manter aqui uma segunda porta era manter dois sítios a criar a mesma
  // coisa — que é o que este trabalho existe para desfazer. O drawer
  // passa a ser visor: mostra o estado e leva ao sítio onde se resolve.
  //
  // Vale para as CINCO superfícies que montam este drawer (Início,
  // Contactos, funil, Agenda, notificações).
  const abrirFormulario = () => {
    if (formularioSubmetido || convitesPorChegar) return;
    navigate(rotas.evento(selected.id, "documentos"), {
      state: { realce: { alvo: "formulario", n: Date.now() } },
    });
  };

  const dadosMensagens = {
    nomeCliente: resumo.titulo,
    tipoEvento:
      (eventTypes?.find((et) => et.id === selected.event_type_id) || {})
        .nome ||
      tipoLivre ||
      "",
    dataEvento: selected.data_evento || resumo.data || "",
    valor: selected.valor_acordado,
  };

  // 3 · O GESTO. Um só, com o nome do que vem a seguir — o mesmo
  // cálculo que alimenta a frase "→ A seguir" da Jornada, para as duas
  // peças nunca discordarem.
  //
  // A excepção que a arquitectura abre: se o próximo passo É o sinal,
  // o botão vive aqui. Os outros levam ao separador da página onde o
  // gesto se faz de verdade — o drawer aponta, não trabalha.
  const gesto = (() => {
    if (selected.fase === "perdido") return null;
    const { atual, porArrumar } = construirEtapas({
      s: selected,
      invites,
      previstos: planoDoEvento?.previstos,
      pagamentos: planoDoEvento?.pagamentos,
      dinheiroACaminho: !planoDoEvento,
      documentos: documentosDoSelecionado,
    });
    // "Por arrumar" (Concluído com fase atrasada): a Jornada diz para
    // arrumar no funil — um botão a mandar produzir documentos para um
    // evento já acontecido contradizia-a dois blocos acima.
    if (!atual || porArrumar) return null;
    // O botão promete um gesto concreto — a navegação leva a intenção
    // (realce) consigo, e o separador aterra com a parcela/linha em
    // evidência. A EventoPage consome o state uma única vez.
    const ir = (aba, alvo) => () =>
      navigate(rotas.evento(selected.id, aba), {
        state: { realce: { alvo, n: Date.now() } },
      });
    const porMapa = {
      orcamento: { rotulo: "Preparar orçamento", aba: "documentos", alvo: "orcamento" },
      sinal: {
        // Saldado sem avanço: o botão deixa de pedir um sinal que já
        // está no banco — leva à aba Pagamentos, onde vive a sugestão
        // de avanço (Lote 2B).
        rotulo: atual.saldado
          ? "Sinal saldado · confirmar avanço"
          : atual.sub
            ? `Registar sinal · ${atual.sub.replace(" por receber", "")}`
            : "Registar sinal",
        aba: "pagamentos",
        alvo: "sinal",
      },
      projecto: { rotulo: "Criar projecto", aba: "documentos", alvo: "proposta" },
      contrato: { rotulo: "Preparar contrato", aba: "documentos", alvo: "contrato" },
      preparacao: { rotulo: "Preparar o evento", aba: "materiais", alvo: "ficha" },
    }[atual.id];
    if (!porMapa) return null;
    return { rotulo: porMapa.rotulo, accao: ir(porMapa.aba, porMapa.alvo) };
  })();

  const fechar = () => onClose();


  return (
    <AnimatePresence>
      <motion.div
        onClick={fechar}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          backgroundColor: "var(--cortina)",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
          style={{
            backgroundColor: "var(--superficie)",
            width: "100%",
            maxWidth: "560px", // largo o suficiente para a Jornada respirar
            height: "100%",
            overflowY: "auto",
            padding: "28px 24px",
            boxShadow: "-4px 0 24px rgba(0,0,0,0.1)",
          }}
        >
          {/* Cabeçalho */}
          <div style={{ marginBottom: "24px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "24px",
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: "20px",
                    color: "var(--charcoal)",
                    margin: "0 0 4px 0",
                    fontFamily: "Playfair Display, serif",
                  }}
                >
                  {resumo.titulo}
                </h2>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--gray-mid)",
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <DataEventoEditor
                    key={selected.id}
                    submissao={selected}
                    campoData={campoData}
                    onSaved={onSaved}
                  />
                  {tipo
                    ? ` · ${tipo.nome}`
                    : tipoLivre
                      ? ` · ${tipoLivre} ✳`
                      : ""}
                </p>
              </div>
              <div
                style={{ display: "flex", gap: "8px", alignItems: "center" }}
              >
                <button
                  onClick={fechar}
                  title="Fechar (Esc)"
                  className="icone-botao"
                  style={{
                    color: "var(--gray-mid)",
                    padding: "6px 8px",
                    display: "inline-flex",
                  }}
                >
                  <MarcaCruz t={14} />
                </button>
              </div>
            </div>

            {/* ===== A JORNADA — a linha de vida do evento =====
                Também é aqui que o estado (Recebido/Em Preparação/
                Confirmado/Concluído) se edita — nos passos "Preparação"
                e "Grande dia", em vez de num bloco à parte sem ligação
                visual. Vive em Jornada.jsx desde que passou a aparecer
                também no cabeçalho da página do evento.
                key = id do evento: a guarda de primeira pintura vive num
                ref DENTRO da Jornada e só conhece a primeira montagem —
                trocar de evento sem fechar o drawer (ex.: "Abrir ficha
                completa" numa notificação, que fica por cima do backdrop)
                reaproveitava a instância e as diferenças entre as duas
                réguas animavam como acontecimentos. Remontar reinicia a
                guarda, como já fazem DataEventoEditor e ClassificacaoTipo. */}
            <Jornada
              key={selected.id}
              submissao={selected}
              invites={invites}
              previstos={planoDoEvento?.previstos}
              pagamentos={planoDoEvento?.pagamentos}
              dinheiroACaminho={!planoDoEvento}
              documentos={documentosDoSelecionado}
              onStatusChange={onStatusChange}
              onRecuperar={
                onRecuperarPerdido
                  ? () => onRecuperarPerdido(selected.id)
                  : undefined
              }
              onEtapa={(id) => {
                if (id === "orcamento")
                  onGerarDocumento && onGerarDocumento(selected, "orcamento");
                else if (id === "projecto")
                  onGerarDocumento && onGerarDocumento(selected, "proposta");
                else if (id === "contrato")
                  onGerarDocumento && onGerarDocumento(selected, "contrato");
                else if (id === "formulario") abrirFormulario();
                // A ficha de materiais deste evento — o mesmo destino do
                // "→ A seguir" aqui ao lado. Mandava para a Logística de
                // quando a ficha vivia lá; desde que ela passou para
                // dentro do evento, ir à Logística era chegar a um sítio
                // onde é preciso procurar outra vez o evento que já está
                // aberto à frente.
                else if (id === "preparacao")
                  navigate(rotas.evento(selected.id, "materiais"), {
                    state: { realce: { alvo: "ficha", n: Date.now() } },
                  });
                // O sinal regista-se na aba Pagamentos — o mesmo destino
                // do irComGesto da ficha, para as duas réguas concordarem.
                else if (id === "sinal")
                  navigate(rotas.evento(selected.id, "pagamentos"), {
                    state: { realce: { alvo: "sinal", n: Date.now() } },
                  });
              }}
            />
            {planoDoEvento?.erro && (
              <p
                style={{
                  fontSize: "11px",
                  fontStyle: "italic",
                  color: "var(--aviso)",
                  margin: "6px 0 0",
                }}
              >
                ⚠ Plano de pagamentos indisponível — os valores do sinal na
                Jornada são estimativa (metade do acordado).
              </p>
            )}

            {/* ===== Classificação do tipo "Outro" (quando aplicável) =====
                A única coisa fora dos quatro blocos, e de propósito: um
                evento sem modelo não tem Jornada que se leia nem folha
                que se imprima. Não é trabalho — é uma pergunta que
                bloqueia a leitura, e o drawer é onde se lê.
                key = id do evento: mudar de evento reinicia o estado */}
            {precisaClassificacao(selected) && (
              <ClassificacaoTipo
                key={selected.id}
                submissao={selected}
                eventTypes={eventTypes}
                onSaved={onSaved}
                onModeloCriado={onModeloCriado}
              />
            )}

            {/* 3 · O GESTO — um só, com o nome do que vem a seguir.
                O gesto muda de nome, a estrutura não. */}
            {gesto && (
              <button
                onClick={gesto.accao}
                className="acao acao--cheia"
                style={{
                  width: "100%",
                  padding: "13px",
                  marginBottom: "10px",
                  borderRadius: "12px",
                  fontSize: "13.5px",
                  fontWeight: "600",
                  letterSpacing: "0.01em",
                  boxShadow: "0 4px 12px rgba(var(--ouro-rgb), 0.30)",
                }}
              >
                {gesto.rotulo}
              </button>
            )}

            {/* 4 · A SAÍDA — o drawer responde a perguntas, a página faz
                trabalho: daqui vai-se para onde o trabalho se faz. */}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => navigate(rotas.evento(selected.id))}
                className="acao acao--ouro"
                style={{
                  flex: 1,
                  padding: "11px",
                  borderRadius: "12px",
                  fontSize: "13px",
                  fontWeight: "500",
                }}
              >
                Abrir evento →
              </button>
              <button
                onClick={() => setFolhaMensagens(true)}
                title={
                  numeroWhatsapp
                    ? "Escolher uma mensagem e abrir a conversa"
                    : "Sem número de WhatsApp neste evento"
                }
                className="acao acao--verde"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "11px 14px",
                  borderRadius: "12px",
                  fontSize: "13px",
                  fontWeight: "500",
                }}
              >
                <Icone nome="mensagens" tamanho={16} />
                WhatsApp
              </button>
            </div>
          </div>


          {/* Folha de mensagens do evento — cada mensagem com Copiar e,
              havendo número, o botão que abre a conversa já escrita */}
          {folhaMensagens && (
            <MensagensSheet
              dados={dadosMensagens}
              whatsapp={numeroWhatsapp}
              onFechar={() => setFolhaMensagens(false)}
            />
          )}

        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ============================================================
// DataEventoEditor — a data do evento no cabeçalho, sempre editável
// aqui, MESMO quando o modelo do tipo de evento não tem um campo de
// data nos seus steps (o modo Editar geral, mais abaixo, só edita
// campos do modelo — ver comentário no topo do ficheiro). Grava
// directo na coluna data_evento, sem depender do modelo.
// key={submissao.id} no local de uso: remonta (e limpa o estado) ao
// trocar de evento.
// ============================================================
function DataEventoEditor({ submissao, campoData, onSaved }) {
  const [aEditar, setAEditar] = useState(false);
  const [valor, setValor] = useState(submissao.data_evento || "");
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState(null);

  const guardar = async () => {
    setAGuardar(true);
    setErro(null);
    // Além da coluna, escreve também no campo do modelo marcado como
    // "papel: data" (se existir) — é dali que o briefing e o
    // formulário completo leem a data; sem isto, ficam presos no
    // valor antigo mesmo depois de corrigida aqui.
    //
    // A escrita vai pelo fundirCampos: só a chave da data viaja e o
    // merge do respostas é feito no servidor — reescrever o JSONB
    // inteiro a partir desta cópia (que pode ter horas) apagava
    // respostas que a cliente tivesse submetido entretanto.
    const patch = campoData ? { [campoData.id]: valor || null } : {};
    try {
      const linha = await fundirCampos(submissao.id, patch, {
        data_evento: valor || null,
      });
      setAGuardar(false);
      if (onSaved && linha) onSaved({ ...submissao, ...linha });
      setAEditar(false);
    } catch (e) {
      console.error(e);
      setAGuardar(false);
      // O evento apagado entretanto é terminal — repetir nunca vai
      // funcionar; diz-se isso em vez de convidar ao retry.
      setErro(
        codigoErroRpc(e) === "EVENTO_EM_FALTA"
          ? "Este evento já não existe — fecha o painel e recarrega a página."
          : traduzirErroDaCasa(e) || "Não guardou — tenta outra vez.",
      );
    }
  };

  if (aEditar) {
    return (
      <span
        style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
      >
        <input
          type="date"
          value={valor || ""}
          onChange={(e) => setValor(e.target.value)}
          disabled={aGuardar}
          autoFocus
          className="caixa-texto"
          style={{
            fontSize: "12px",
            padding: "3px 6px",
            borderRadius: "6px",
            border: "1.5px solid var(--gold)",
            outline: "none",
            fontFamily: "Inter, sans-serif",
          }}
        />
        <button
          onClick={guardar}
          disabled={aGuardar}
          title="Guardar"
          className="icone-botao"
          style={{
            // #16A34A está fora da paleta (--sucesso é #22C55E) — fica
            // literal e segue no relatório de violações.
            color: "#16A34A",
            padding: "3px 5px",
            lineHeight: 1,
            display: "inline-flex",
          }}
        >
          <MarcaVisto />
        </button>
        <button
          onClick={() => {
            setValor(submissao.data_evento || "");
            setErro(null);
            setAEditar(false);
          }}
          disabled={aGuardar}
          title="Cancelar"
          className="icone-botao"
          style={{
            color: "var(--gray-mid)",
            padding: "3px 5px",
            lineHeight: 1,
            display: "inline-flex",
          }}
        >
          <MarcaCruz />
        </button>
        {erro && (
          <span style={{ fontSize: "11px", color: "var(--perigo-texto)" }}>{erro}</span>
        )}
      </span>
    );
  }

  return (
    // O sublinhado pontilhado é o sinal de "isto edita-se" mesmo sem
    // rato por perto (não dá para a Nádia adivinhar só pela cor herdada
    // do texto à volta); o dourado + o lápis a aparecer no hover
    // confirmam a intenção assim que ela se aproxima.
    <motion.button
      id="tour-data-evento"
      onClick={() => setAEditar(true)}
      title="Editar a data do evento"
      className="foco"
      initial="rest"
      whileHover="hover"
      whileTap={{ scale: 0.97 }}
      variants={{
        rest: { backgroundColor: "rgba(var(--ouro-rgb), 0)", color: "var(--texto-suave)" },
        hover: { backgroundColor: "rgba(var(--ouro-rgb), 0.14)", color: "var(--ouro-texto)" },
      }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      style={{
        fontSize: "13px",
        font: "inherit",
        border: "none",
        borderRadius: "6px",
        padding: "2px 6px",
        margin: "-2px 0 -2px -6px",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
      }}
    >
      <span
        style={{
          textDecoration: "underline",
          textDecorationStyle: "dotted",
          textUnderlineOffset: "3px",
        }}
      >
        {formatData(submissao.data_evento)}
      </span>
      <motion.span
        variants={{
          rest: { opacity: 0.5, scale: 0.85 },
          hover: { opacity: 1, scale: 1 },
        }}
        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        style={{ display: "inline-flex" }}
      >
        <Icone nome="lapis" tamanho={12} />
      </motion.span>
    </motion.button>
  );
}

// ============================================================
// ClassificacaoTipo — o banner "Tipo indicado pelo cliente".
// Aparece quando o evento não tem modelo mas o cliente escreveu um
// tipo no "Outro" da captação. Duas saídas:
//   • associar a um modelo existente (dropdown)
//   • criar um modelo novo com esse nome (0 passos) e associar
// Dedup: se já existir um modelo com o mesmo nome (normalizado), o
// dropdown vem pré-seleccionado com ele — nunca se criam duplicados.
// O texto do cliente fica nas respostas como histórico.
// ============================================================
function ClassificacaoTipo({ submissao, eventTypes, onSaved, onModeloCriado }) {
  const texto = getTipoEventoLivre(submissao);
  const match = encontrarModeloPorNome(texto, eventTypes);
  const [modeloId, setModeloId] = useState(match?.id || "");
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState(null);

  if (!texto) return null;

  const guardar = async () => {
    setAGuardar(true);
    setErro(null);
    try {
      let idFinal;
      if (modeloId) {
        await associarModeloAoEvento(submissao.id, modeloId);
        idFinal = modeloId;
      } else {
        const { modelo, jaExistia } = await criarModeloEAssociar(
          texto,
          submissao.id,
          eventTypes,
        );
        idFinal = modelo.id;
        if (!jaExistia && onModeloCriado) onModeloCriado();
      }
      // Merge mínimo no objeto normalizado que o AdminPage já tem
      if (onSaved) onSaved({ ...submissao, event_type_id: idFinal });
    } catch (e) {
      console.error(e);
      setErro(
        traduzirErroDaCasa(e) ||
          "Não foi possível associar. Verifica a ligação e tenta novamente.",
      );
    }
    setAGuardar(false);
  };

  const textoCurto = texto.length > 26 ? `${texto.slice(0, 26)}…` : texto;

  return (
    <div
      style={{
        backgroundColor: "var(--superficie-quente)",
        border: "1px solid var(--gold-light)",
        borderRadius: "12px",
        padding: "12px 14px",
        marginBottom: "14px",
      }}
    >
      <p
        style={{
          fontSize: "10px",
          fontWeight: "600",
          color: "var(--gold-dark)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          margin: "0 0 2px 0",
        }}
      >
        Tipo indicado pelo cliente
      </p>
      <p
        style={{
          fontSize: "14px",
          fontWeight: "600",
          color: "var(--charcoal)",
          margin: "0 0 10px 0",
        }}
      >
        "{texto}"
      </p>
      <div
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <select
          value={modeloId}
          onChange={(e) => setModeloId(e.target.value)}
          className="caixa-texto"
          style={{
            flex: "1 1 180px",
            minWidth: 0,
            padding: "8px 12px",
            borderRadius: "8px",
            border: "1.5px solid var(--gold-light)",
            fontSize: "12px",
            outline: "none",
            fontFamily: "Inter, sans-serif",
            backgroundColor: "var(--superficie)",
          }}
        >
          <option value="">Associar a um modelo…</option>
          {(eventTypes || []).map((et) => (
            <option key={et.id} value={et.id}>
              {et.nome}
            </option>
          ))}
        </select>
        <button
          onClick={guardar}
          disabled={aGuardar}
          className={`acao ${modeloId ? "acao--cheia" : "acao--ouro"}`}
          style={{
            flexShrink: 0,
            padding: "8px 14px",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: "600",
            whiteSpace: "nowrap",
          }}
        >
          {aGuardar
            ? "A associar..."
            : modeloId
              ? "✓ Associar"
              : `＋ Criar modelo "${textoCurto}"`}
        </button>
      </div>
      <p
        style={{
          fontSize: "10px",
          color: "var(--gray-mid)",
          margin: "8px 0 0 0",
        }}
      >
        O modelo novo nasce com 0 passos — completa-o em Modelos de Evento
        quando quiseres.
      </p>
      {erro && (
        <p
          style={{
            fontSize: "11px",
            color: "var(--perigo)",
            margin: "8px 0 0 0",
          }}
        >
          {erro}
        </p>
      )}
    </div>
  );
}

// Campo de edição genérico — adapta o input ao type do campo.
