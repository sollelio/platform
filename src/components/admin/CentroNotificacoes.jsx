import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { linkWhatsApp } from "../../lib/mensagens";
import { EMPRESA } from "../../lib/casa";
import { MarcaVisto, MarcaCruz } from "./marcas";

// ============================================================
// CentroNotificacoes — a Caixa de Entrada da Nádia.
//
// Duas peças, uma experiência (o estado vivo — useNotificacoes —
// mora em lib/notificacoes.js):
//   • PainelNotificacoes — o painel lateral com os pedidos, cada um
//     expansível com TODOS os dados que o interessado preencheu;
//   • ToastNotificacao — o momento WOW: quando um pedido chega com a
//     app aberta, desce um cartão dourado com shimmer e um sino suave.
//
// A estética segue a casa: Playfair nos nomes, dourado na moldura,
// linhas finas, nada de emoji nos elementos permanentes.
// ============================================================

// ------------------------------------------------------------
// O sino sonoro — duas notas suaves geradas no browser (WebAudio),
// sem ficheiros. Falha em silêncio se o browser não deixar tocar.
//
// O browser só deixa um AudioContext arrancar depois de um gesto do
// utilizador na página (clique, tecla, toque) — e uma notificação
// chega por WebSocket, nunca por um gesto. Sem desbloquear ao
// primeiro gesto da Nádia (ver useDesbloquearSino, mais abaixo), o
// AudioContext nasce sempre "suspended" e o sino fica mudo, mesmo com
// tudo o resto (toast, badge) a funcionar.
// ------------------------------------------------------------
let audioCtx = null;
const tocarSino = () => {
  try {
    audioCtx =
      audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const nota = (freq, quando, dur = 0.9, vol = 0.08) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, quando);
      gain.gain.exponentialRampToValueAtTime(vol, quando + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, quando + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(quando);
      osc.stop(quando + dur + 0.05);
    };
    const t = audioCtx.currentTime;
    nota(987.77, t); // Si5
    nota(1318.51, t + 0.14); // Mi6 — o intervalo "campainha de hotel"
  } catch {
    /* sem áudio — sem drama */
  }
};

// Cria/retoma o AudioContext dentro do próprio gesto — só isso conta
// como "user activation" para o browser. Uma vez desbloqueado, fica
// destrancado para o resto da sessão (mesmo AudioContext partilhado
// do tocarSino), por isso só precisa de correr uma vez.
let sinoDesbloqueado = false;
const desbloquearSino = () => {
  if (sinoDesbloqueado) return;
  sinoDesbloqueado = true;
  try {
    audioCtx =
      audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {
    /* sem áudio — sem drama */
  }
};

// Liga o desbloqueio ao primeiro clique/tecla/toque da Nádia na app —
// monta-se uma vez (na ToastNotificacao, sempre presente no
// AdminPage), muito antes de a primeira notificação chegar.
function useDesbloquearSino() {
  useEffect(() => {
    if (sinoDesbloqueado) return;
    const eventos = ["pointerdown", "keydown", "touchstart"];
    eventos.forEach((ev) =>
      document.addEventListener(ev, desbloquearSino, { once: true }),
    );
    return () => {
      eventos.forEach((ev) =>
        document.removeEventListener(ev, desbloquearSino),
      );
    };
  }, []);
}

// ------------------------------------------------------------
// Tempo relativo humano ("agora mesmo", "há 20 min", "ontem"...)
// ------------------------------------------------------------
const tempoRelativo = (iso) => {
  if (!iso) return "";
  const seg = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seg < 60) return "agora mesmo";
  const min = Math.floor(seg / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d} dias`;
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "short",
  });
};

const dataLonga = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const iniciais = (nome) =>
  (nome || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");

// ------------------------------------------------------------
// As notificações do PORTAL não são pedidos de interesse.
// ------------------------------------------------------------
// A Caixa de Entrada nasceu para uma coisa só: o formulário público.
// O portal passou a lá pôr mais três — um pedido de código, um pedido de
// alteração e um contrato assinado em papel — e elas caíam no molde da
// captação: subtítulo «Pedido de interesse» debaixo de um título que
// dizia outra coisa, e o painel aberto a procurar respostas que nunca
// existiram. O título vem do servidor e está certo; o que faltava era
// tudo o resto.
const TIPOS_DO_PORTAL = {
  codigo_pedido: {
    resumo: "Pediu um código para ver",
    corpo:
      "A cliente pediu para abrir o que tem valores. Emita o código na " +
      "folha do evento e envie-lho pela conversa de WhatsApp que já tem " +
      "com ela — é esse passo que confirma que é mesmo ela.",
  },
  pedido_alteracao: {
    resumo: "Pediu uma alteração",
    corpo:
      "A cliente leu e quer mudar alguma coisa antes de aceitar. " +
      "Fale com ela e, se ficar acordado, publique uma versão nova.",
    // Ela ESCREVEU o que quer mudar, e a frase vem guardada no aviso
    // (`dados.mensagem`, gravada pela 058). Não a mostrar era mandar a
    // Nádia telefonar a perguntar uma coisa que já tinha em mãos.
    citar: (d) => d?.mensagem || null,
  },
  questionario_entregue: {
    resumo: "Respondeu ao questionário",
    corpo:
      "As respostas estão na ficha do evento, e é delas que sai o " +
      "briefing da montagem. A partir daqui ela ainda pode corrigir o que " +
      "estiver aberto — o que já fechou passa a chegar como pedido.",
  },
  questionario_pedido: {
    resumo: "Pediu uma alteração ao questionário",
    corpo:
      "A resposta que ela quer mudar já tinha fechado. Nada mudou " +
      "sozinho — trate o pedido na folha do Acompanhamento, onde pode " +
      "marcá-lo como tratado.",
    // A frase dela, tal e qual (063 grava-a em `dados.mensagem`).
    citar: (d) => d?.mensagem || null,
  },
  avaliacao_recebida: {
    resumo: "Avaliou o evento",
    corpo:
      "Está tudo em Avaliações, com as linhas que ela puxou e a " +
      "fotografia que escolheu. Se autorizou publicação, é de lá que sai " +
      "para o site quando houver site.",
    // As palavras dela, tal e qual. É a melhor notícia que esta caixa dá,
    // e seria estranho obrigá-la a ir a outro lado para as ler.
    citar: (d) => d?.mensagem || null,
  },
  contrato_papel: {
    resumo: "Carregou o contrato assinado em papel",
    corpo:
      "Abra a folha do evento para ver a fotografia e confirmar a " +
      "assinatura. Confirmar tranca o contrato.",
  },
  // 072 · As respostas que faltavam. Antes, aceitar/aprovar/assinar era
  // silêncio na Caixa — e eram os momentos de agir na hora.
  orcamento_aceite: {
    resumo: "Aceitou o orçamento",
    corpo:
      "O próximo passo é o contrato: prepare-o e publique-o no " +
      "acompanhamento — com ele assinado, o sinal guarda a data.",
  },
  projecto_aprovado: {
    resumo: "Aprovou o projecto",
    corpo:
      "A mesa que ela viu é a que se monta. As compras e a preparação " +
      "seguem por esta versão.",
  },
  contrato_assinado: {
    resumo: "Assinou o contrato",
    corpo:
      "O contrato ficou trancado, com o nome dela no registo. É a deixa " +
      "para o sinal — metade do valor guarda a data.",
  },
};

// Nome do tipo de evento: modelo conhecido OU o texto livre do cliente.
const nomeDoTipo = (n, eventTypes) => {
  const tipo = (eventTypes || []).find((et) => et.id === n.event_type_id);
  if (tipo) return tipo.nome;
  return n.dados?.respostas?.tipoEventoOutro || null;
};

// ------------------------------------------------------------
// Blocos de apresentação do pedido
// ------------------------------------------------------------
function Rotulo({ children }) {
  return (
    <p
      style={{
        fontSize: "9px",
        fontWeight: "600",
        color: "var(--gray-mid)",
        textTransform: "uppercase",
        letterSpacing: "0.14em",
        margin: "0 0 3px 0",
      }}
    >
      {children}
    </p>
  );
}

function Valor({ children }) {
  return (
    <p
      style={{
        fontSize: "13px",
        color: "var(--charcoal)",
        margin: 0,
        lineHeight: 1.5,
        overflowWrap: "anywhere",
      }}
    >
      {children}
    </p>
  );
}

function Chip({ children, cheio }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 11px",
        borderRadius: "999px",
        fontSize: "11.5px",
        fontWeight: "500",
        backgroundColor: cheio ? "#FBF7EF" : "white",
        border: "1px solid var(--gold-light)",
        color: "var(--gold-dark)",
        // o texto livre legado («Outro: …») pode exceder o cartão —
        // a pastilha quebra em vez de transbordar
        maxWidth: "100%",
        overflowWrap: "anywhere",
      }}
    >
      {children}
    </span>
  );
}

// O retrato completo do pedido — tudo o que o interessado preencheu,
// em leitura confortável: grelha de pares rótulo/valor, chips para os
// serviços, a mensagem em citação e as fotos de inspiração em fila.
function DetalhePedido({ n }) {
  const r = n.dados?.respostas || {};
  const dataEvento = n.dados?.data_evento || r.dataEvento || null;
  const convidados = n.dados?.numero_convidados ?? r.numeroConvidados ?? null;
  // Serviços com hierarquia — o pai vive em `servicos`, o detalhe em
  // campos próprios. O agrupamento é pelo CAMPO de origem, nunca por
  // comparação de texto: as grafias históricas (julho de 2026, com
  // «Cocktail & bar» e lotações trocadas) agrupam na mesma. O grupo
  // consome o pai; sem detalhe (Buffet antigo sem pacote) o pai fica
  // pastilha plana. O «pretende» legado é sempre plano, e o Set no fim
  // evita a pastilha — e a chave React — dupla num registo importado
  // que traga os dois campos.
  const grupos = [
    ["Buffet", r.servicosBuffet],
    ["Balcão", r.servicosBalcao],
  ]
    .map(([nome, filhos]) => [
      nome,
      Array.isArray(filhos) ? [...new Set(filhos)] : [],
    ])
    .filter(([, filhos]) => filhos.length > 0);
  const nomesComGrupo = new Set(grupos.map(([nome]) => nome));
  const planos = [
    ...new Set(
      [
        ...(Array.isArray(r.servicos) ? r.servicos : []),
        ...(Array.isArray(r.pretende) ? r.pretende : []),
      ].filter((s) => !nomesComGrupo.has(s)),
    ),
  ];
  const temServicos = planos.length > 0 || grupos.length > 0;
  const imagens = Array.isArray(r.imagensReferencia) ? r.imagensReferencia : [];
  const contacto = r.contactoPrincipal || null;
  const whatsapp = r.numeroWhatsapp || null;
  const wa = linkWhatsApp(whatsapp || contacto);

  const pares = [
    ["Data do evento", dataLonga(dataEvento)],
    ["Convidados", convidados ? `${convidados} pessoas` : null],
    ["Local", r.localEvento],
    ["Espaço", r.tipoLocal],
    ["Contacto", contacto],
    ["WhatsApp", whatsapp],
  ].filter(([, v]) => v);

  return (
    <div
      style={{
        borderTop: "1px solid #F5ECD7",
        marginTop: "12px",
        paddingTop: "14px",
      }}
    >
      {/* Grelha dos factos */}
      {pares.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px 16px",
            marginBottom: temServicos ? "14px" : 0,
          }}
        >
          {pares.map(([rotulo, valor]) => (
            <div
              key={rotulo}
              style={
                rotulo === "Data do evento" ? { gridColumn: "1 / -1" } : null
              }
            >
              <Rotulo>{rotulo}</Rotulo>
              <Valor>{valor}</Valor>
            </div>
          ))}
        </div>
      )}

      {/* Serviços pedidos — os simples na fila de pastilhas; um serviço
          com detalhe (pacote de buffet, tipos de balcão) ganha a sua
          linha: a pastilha do serviço à esquerda — a mesma dos simples —
          e os filhos a negrito ao lado */}
      {temServicos && (
        <div style={{ marginBottom: "14px" }}>
          <Rotulo>Serviços pedidos</Rotulo>
          {planos.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "6px",
                marginTop: "5px",
              }}
            >
              {planos.map((s) => (
                <Chip key={s} cheio>
                  {s}
                </Chip>
              ))}
            </div>
          )}
          {grupos.map(([nome, filhos], i) => (
            <div
              key={nome}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "5px 6px",
                marginTop: i === 0 && planos.length === 0 ? "5px" : "8px",
              }}
            >
              <Chip cheio>{nome}</Chip>
              {filhos.map((f, j) => (
                // a vírgula viaja dentro do span: a quebra dá-se entre
                // itens (num flex com wrap, o item só parte por dentro
                // quando sozinho excede o cartão — um valor degenerado
                // de importação quebra em vez de transbordar)
                <span
                  key={f}
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "var(--charcoal)",
                    maxWidth: "100%",
                    overflowWrap: "anywhere",
                  }}
                >
                  {f}
                  {j < filhos.length - 1 ? "," : ""}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* A mensagem, nas palavras da pessoa */}
      {(r.mensagemInicial || r.maisDetalhes) && (
        <div style={{ marginBottom: "14px" }}>
          <Rotulo>Mensagem</Rotulo>
          <p
            style={{
              margin: "5px 0 0 0",
              padding: "10px 14px",
              borderLeft: "2px solid var(--gold)",
              backgroundColor: "#FBF7EF",
              borderRadius: "0 10px 10px 0",
              fontSize: "13px",
              fontStyle: "italic",
              color: "var(--charcoal)",
              lineHeight: 1.6,
              overflowWrap: "anywhere",
            }}
          >
            “{r.mensagemInicial || r.maisDetalhes}”
          </p>
        </div>
      )}

      {/* Fotos de inspiração */}
      {imagens.length > 0 && (
        <div style={{ marginBottom: "14px" }}>
          <Rotulo>Inspiração ({imagens.length})</Rotulo>
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginTop: "5px",
              overflowX: "auto",
              paddingBottom: "4px",
            }}
          >
            {imagens.map((url, i) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                style={{ flexShrink: 0 }}
              >
                <img
                  src={url}
                  alt={`Referência ${i + 1}`}
                  style={{
                    width: "76px",
                    height: "76px",
                    objectFit: "cover",
                    borderRadius: "10px",
                    border: "1px solid var(--gold-light)",
                    display: "block",
                  }}
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Ações */}
      <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              padding: "10px 16px",
              borderRadius: "999px",
              fontSize: "12px",
              fontWeight: "600",
              border: "1px solid var(--gold)",
              color: "var(--gold-dark)",
              backgroundColor: "white",
              textDecoration: "none",
            }}
          >
            WhatsApp
          </a>
        )}
        <button
          onClick={() => n.__abrirFicha?.()}
          style={{
            flex: 1,
            padding: "10px 16px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: "600",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            border: "none",
            backgroundColor: "var(--gold)",
            color: "white",
            cursor: "pointer",
            boxShadow: "0 3px 10px rgba(201,168,76,0.3)",
          }}
        >
          Abrir ficha completa →
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// DetalheDoPortal — o que se abre debaixo de um aviso do portal.
// ------------------------------------------------------------
// Deliberadamente curto: aqui não há nada para ler, há uma coisa para
// fazer, e faz-se na folha do evento. Uma frase a dizer o quê, e o
// caminho para lá.
// Os rótulos dos documentos do lado da Nádia. A armadilha do costume:
// 'proposta' é o PROJECTO.
const ROTULO_DOC = {
  orcamento: "Orçamento",
  proposta: "Projecto",
  contrato: "Contrato",
};

function DetalheDoPortal({ corpo, citacao, contexto, onAbrirFicha }) {
  return (
    <div
      style={{
        marginTop: "12px",
        paddingTop: "12px",
        borderTop: "1px solid #F0E6D0",
      }}
    >
      {contexto && (
        <p
          style={{
            fontSize: "11px",
            fontWeight: "600",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--gold-dark)",
            margin: "0 0 8px",
          }}
        >
          {contexto}
        </p>
      )}

      {/* As palavras dela, tal e qual — sem resumo e sem paráfrase. É a
          única coisa deste painel que a Nádia não consegue adivinhar. */}
      {citacao && (
        <blockquote
          style={{
            margin: "0 0 12px",
            padding: "10px 14px",
            borderLeft: "2px solid var(--gold)",
            backgroundColor: "#FEFCF7",
            borderRadius: "0 8px 8px 0",
            fontSize: "13.5px",
            lineHeight: 1.7,
            color: "var(--charcoal)",
            fontStyle: "italic",
            whiteSpace: "pre-wrap",
          }}
        >
          {citacao}
        </blockquote>
      )}

      <p
        style={{
          fontSize: "13px",
          lineHeight: 1.7,
          color: "var(--charcoal)",
          margin: "0 0 12px",
        }}
      >
        {corpo}
      </p>
      <button
        onClick={onAbrirFicha}
        style={{
          width: "100%",
          padding: "10px 16px",
          borderRadius: "999px",
          fontSize: "12px",
          fontWeight: "600",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          border: "none",
          backgroundColor: "var(--gold)",
          color: "white",
          cursor: "pointer",
          boxShadow: "0 3px 10px rgba(201,168,76,0.3)",
        }}
      >
        Abrir ficha completa →
      </button>
    </div>
  );
}

// ------------------------------------------------------------
// MedalhaoSelecao — as iniciais douradas que são também o interruptor
// de escolha (o gesto do correio moderno): um toque VIRA o medalhão
// num círculo com ✓. Em modo de seleção, o medalhão "esvazia"
// (contorno dourado) para mostrar que está à espera de ser escolhido.
// ------------------------------------------------------------
function MedalhaoSelecao({ titulo, emSelecao, selecionada, protegida, onToggle }) {
  const face = {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
    boxSizing: "border-box",
  };
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={
        protegida
          ? "Este aviso guarda a fila do contrato em papel — não se remove"
          : selecionada
            ? "Desmarcar"
            : "Selecionar"
      }
      aria-pressed={selecionada}
      style={{
        flexShrink: 0,
        width: "42px",
        height: "42px",
        padding: 0,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        perspective: "300px",
        position: "relative",
      }}
    >
      <motion.span
        animate={{ rotateY: selecionada ? 180 : 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.8, 0.3, 1] }}
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
          display: "block",
        }}
      >
        {/* frente: as iniciais */}
        <span
          style={{
            ...face,
            background: emSelecao
              ? "white"
              : "linear-gradient(135deg, #E8D5A3 0%, #C9A84C 60%, #A07830 100%)",
            border: emSelecao ? "1.5px solid var(--gold)" : "none",
            color: emSelecao ? "var(--gold-dark)" : "white",
            fontSize: "15px",
            fontFamily: "Playfair Display, serif",
            letterSpacing: "0.03em",
            transition: "background 0.25s, color 0.25s, border 0.25s",
          }}
        >
          {iniciais(titulo)}
        </span>
        {/* verso: a escolha feita — a marca desenhada da casa, não o
            glifo de texto (variava de peso conforme a fonte do sistema) */}
        <span
          style={{
            ...face,
            transform: "rotateY(180deg)",
            background: "linear-gradient(135deg, #C9A84C 0%, #A07830 100%)",
            color: "white",
            boxShadow: "0 3px 10px rgba(201,168,76,0.45)",
          }}
        >
          <MarcaVisto t={16} cor="white" />
        </span>
      </motion.span>
    </button>
  );
}

// ------------------------------------------------------------
// Um cartão da Caixa de Entrada — fechado é um relance (quem, o quê,
// quando); aberto é o pedido inteiro. Abrir marca como lida.
// Em modo de seleção, o cartão inteiro alterna a escolha.
// ------------------------------------------------------------
function CartaoNotificacao({
  n,
  eventTypes,
  expandida,
  modoSelecao,
  selecionada,
  onToggle,
  onToggleSelecao,
  onAbrirEvento,
}) {
  const naoLida = !n.lida_em;
  const doPortal = TIPOS_DO_PORTAL[n.tipo] || null;
  const tipo = nomeDoTipo(n, eventTypes);
  const dataEvento =
    n.dados?.data_evento || n.dados?.respostas?.dataEvento || null;
  const convidados =
    n.dados?.numero_convidados ?? n.dados?.respostas?.numeroConvidados ?? null;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 80, transition: { duration: 0.22 } }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      onClick={modoSelecao ? onToggleSelecao : onToggle}
      style={{
        position: "relative",
        backgroundColor: selecionada
          ? "#FBF7EF"
          : naoLida
            ? "#FFFDF6"
            : "white",
        border: selecionada
          ? "1.5px solid var(--gold)"
          : naoLida
            ? "1px solid var(--gold-light)"
            : "1px solid #F0E6D0",
        borderRadius: "14px",
        padding: "14px 16px",
        marginBottom: "10px",
        cursor: "pointer",
        overflow: "hidden",
        boxShadow: selecionada
          ? "0 4px 16px rgba(201,168,76,0.22)"
          : naoLida
            ? "0 2px 12px rgba(201,168,76,0.12)"
            : "none",
      }}
    >
      {/* fio dourado à esquerda enquanto não for lida */}
      {naoLida && !selecionada && (
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "3px",
            background:
              "linear-gradient(180deg, var(--gold-light), var(--gold))",
          }}
        />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {/* Iniciais em medalhão dourado — tocar = escolher */}
        <MedalhaoSelecao
          titulo={n.titulo}
          emSelecao={modoSelecao}
          selecionada={!!selecionada}
          protegida={n.tipo === "contrato_papel"}
          onToggle={onToggleSelecao}
        />

        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "10px",
            }}
          >
            <p
              style={{
                fontSize: "15px",
                fontWeight: "600",
                fontFamily: "Playfair Display, serif",
                color: "var(--charcoal)",
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {n.titulo || "Novo interessado"}
            </p>
            <span
              style={{
                flexShrink: 0,
                fontSize: "10.5px",
                color: naoLida ? "var(--gold-dark)" : "var(--gray-mid)",
                fontWeight: naoLida ? "600" : "400",
              }}
            >
              {tempoRelativo(n.created_at)}
            </span>
          </div>
          <p
            style={{
              fontSize: "12px",
              color: "var(--gray-mid)",
              margin: "2px 0 0 0",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {doPortal
              ? doPortal.resumo
              : [
              tipo,
              dataEvento
                ? new Date(dataEvento).toLocaleDateString("pt-PT", {
                    day: "numeric",
                    month: "long",
                  })
                : null,
              convidados ? `${convidados} convidados` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Pedido de interesse"}
          </p>
        </div>

        {/* seta que roda ao expandir (esconde-se em modo de seleção) —
            chevron desenhado, não o glifo › (marca é desenho, não texto) */}
        {!modoSelecao && (
          <motion.span
            animate={{ rotate: expandida ? 90 : 0 }}
            transition={{ duration: 0.2 }}
            style={{
              flexShrink: 0,
              color: "var(--gold)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <svg
              width={12}
              height={12}
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
              style={{ display: "block" }}
            >
              <path
                d="M6 3.5 L10.5 8 L6 12.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {expandida && !modoSelecao && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
            onClick={(e) => e.stopPropagation()}
          >
            {doPortal ? (
              <DetalheDoPortal
                corpo={doPortal.corpo}
                citacao={doPortal.citar ? doPortal.citar(n.dados) : null}
                contexto={
                  n.dados?.tipo_documento && n.dados?.versao
                    ? `${ROTULO_DOC[n.dados.tipo_documento] || n.dados.tipo_documento}, versão ${n.dados.versao}`
                    : // Um pedido de código traz o documento em
                      // `dados.contexto` — sem esta queda, o aviso não
                      // dizia para QUE documento era o código.
                      n.dados?.contexto
                      ? ROTULO_DOC[n.dados.contexto] || n.dados.contexto
                      : n.dados?.campo || null
                }
                // O TIPO segue junto: é ele que diz à AdminPage ONDE o
                // aviso manda ir (a folha do Acompanhamento, a ficha, ou
                // o separador Avaliações) — sem ele, tudo caía no drawer.
                onAbrirFicha={() =>
                  onAbrirEvento && onAbrirEvento(n.submission_id, n.tipo)
                }
              />
            ) : (
              <DetalhePedido
                n={{
                  ...n,
                  __abrirFicha: () =>
                    onAbrirEvento && onAbrirEvento(n.submission_id),
                }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ------------------------------------------------------------
// PainelNotificacoes — a Caixa de Entrada em painel lateral.
// ------------------------------------------------------------
// Botão discreto do cabeçalho (Marcar todas / Selecionar / Limpar lidas)
function BotaoCabecalho({ cor = "var(--gold-dark)", onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: 0,
        border: "none",
        background: "none",
        cursor: "pointer",
        fontSize: "11px",
        fontWeight: "600",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: cor,
      }}
    >
      {children}
    </button>
  );
}

// Tudo o que vive DENTRO do painel: cabeçalho, lista e a barra de
// seleção. Só é montado com o painel aberto — o estado (expansão,
// seleção) nasce e morre com ele, sem sincronizações via effect.
//
// A seleção segue o gesto do correio moderno: tocar no MEDALHÃO das
// iniciais vira-o num círculo ✓ e faz subir a barra de ações; em modo
// de seleção, tocar em qualquer cartão alterna a escolha. "Limpar
// lidas" usa o MESMO mecanismo — pré-seleciona as já lidas, para a
// Nádia VER exatamente o que vai sair antes de confirmar.
function ConteudoCaixa({
  destaqueId,
  lista,
  naoLidas,
  eventTypes,
  onFechar,
  onMarcarLida,
  onMarcarTodas,
  onApagarVarias,
  onAbrirEvento,
}) {
  const [expandidaId, setExpandidaId] = useState(destaqueId || null);
  // null = fora do modo de seleção; Set (mesmo vazio) = a escolher
  const [selecao, setSelecao] = useState(null);
  const [confirmando, setConfirmando] = useState(false);

  // Um aviso de contrato em papel NÃO se remove: é a própria fila de
  // confirmação (a folha do Acompanhamento lê getPapelPorConfirmar desta
  // tabela, e `dados.caminho` é o único fio até à fotografia). Removê-lo
  // apagava a secção «Contrato assinado em papel» para sempre. Marcar
  // como lida continua livre — só a remoção é que se recusa.
  const protegida = (n) => n.tipo === "contrato_papel";
  const removiveis = lista.filter((n) => !protegida(n));
  const haProtegidas = removiveis.length < lista.length;

  const lidas = removiveis.filter((n) => n.lida_em);
  const emSelecao = selecao !== null;
  const nSel = selecao ? selecao.size : 0;
  const todasSelecionadas = nSel > 0 && nSel === removiveis.length;

  // O destaque (vindo do toast) expande-se e conta logo como lido — e
  // com a DEPENDÊNCIA, não só na montagem: clicar no toast com a Caixa
  // já aberta também tem de cumprir a promessa do «Ver o pedido».
  // A expansão ajusta-se DURANTE o render (estado preso à prop); só a ida
  // ao servidor fica no efeito. (onMarcarLida é useCallback estável.)
  const [destaqueVisto, setDestaqueVisto] = useState(null);
  if (destaqueId && destaqueVisto !== destaqueId) {
    setDestaqueVisto(destaqueId);
    setExpandidaId(destaqueId);
  }
  useEffect(() => {
    if (destaqueId) onMarcarLida(destaqueId);
  }, [destaqueId, onMarcarLida]);

  const alternarExpansao = (id) => {
    setExpandidaId((atual) => (atual === id ? null : id));
    const n = lista.find((x) => x.id === id);
    if (n && !n.lida_em && expandidaId !== id) onMarcarLida(id);
  };

  const entrarEmSelecao = (idsIniciais = []) => {
    setExpandidaId(null); // agora escolhe-se, não se lê
    setConfirmando(false);
    setSelecao(new Set(idsIniciais));
  };

  const sairDaSelecao = () => {
    setSelecao(null);
    setConfirmando(false);
  };

  const alternarSelecao = (id) => {
    // Os protegidos não entram na escolha — nem pelo medalhão, nem pelo
    // toque no cartão em modo de seleção.
    const alvo = lista.find((n) => n.id === id);
    if (alvo && protegida(alvo)) return;
    setConfirmando(false);
    setExpandidaId(null);
    setSelecao((atual) => {
      const novo = new Set(atual || []);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  const removerSelecionadas = () => {
    const ids = [...selecao];
    sairDaSelecao();
    onApagarVarias(ids);
  };

  return (
    <>
      {/* Cabeçalho */}
      <div
        style={{
          padding: "22px 22px 16px",
          backgroundColor: "white",
          borderBottom: "1px solid var(--gold-light)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
          }}
        >
          <div>
            <p
              style={{
                fontSize: "9px",
                fontWeight: "600",
                color: "var(--gold)",
                textTransform: "uppercase",
                letterSpacing: "0.22em",
                margin: "0 0 3px 0",
              }}
            >
              {EMPRESA.designacao}
            </p>
            <h2
              style={{
                fontSize: "21px",
                fontFamily: "Playfair Display, serif",
                fontWeight: "500",
                color: "var(--charcoal)",
                margin: 0,
              }}
            >
              Caixa de Entrada
              {naoLidas > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "22px",
                    height: "22px",
                    padding: "0 6px",
                    marginLeft: "10px",
                    borderRadius: "999px",
                    backgroundColor: "var(--gold)",
                    color: "white",
                    fontSize: "11px",
                    fontWeight: "700",
                    fontFamily: "Inter, sans-serif",
                    verticalAlign: "3px",
                  }}
                >
                  {naoLidas}
                </span>
              )}
            </h2>
          </div>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            style={{
              color: "var(--gray-mid)",
              background: "none",
              border: "none",
              cursor: "pointer",
              lineHeight: 1,
              padding: "6px",
            }}
          >
            <MarcaCruz t={14} />
          </button>
        </div>

        {/* Ações do cabeçalho — fora do modo de seleção */}
        {lista.length > 0 && !emSelecao && (
          <div
            style={{
              display: "flex",
              gap: "16px",
              marginTop: "10px",
              flexWrap: "wrap",
            }}
          >
            {naoLidas > 0 && (
              <BotaoCabecalho onClick={onMarcarTodas}>
                Marcar todas como lidas
              </BotaoCabecalho>
            )}
            <BotaoCabecalho onClick={() => entrarEmSelecao()}>
              Selecionar
            </BotaoCabecalho>
            {lidas.length > 0 && (
              <BotaoCabecalho
                cor="var(--gray-mid)"
                onClick={() => entrarEmSelecao(lidas.map((n) => n.id))}
              >
                Limpar lidas ({lidas.length})
              </BotaoCabecalho>
            )}
          </div>
        )}
        {emSelecao && (
          <p
            style={{
              fontSize: "11.5px",
              color: "var(--gray-mid)",
              margin: "10px 0 0 0",
            }}
          >
            Toque nos pedidos que quer remover — os medalhões ficam marcados.
          </p>
        )}
      </div>

      {/* Lista */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 16px 24px",
          scrollbarWidth: "thin",
          scrollbarColor: "var(--gold-light) transparent",
        }}
      >
        {lista.length === 0 ? (
          <div style={{ textAlign: "center", padding: "72px 24px" }}>
            {/* losango no traço da casa — quadrado rodado, não o glifo ✦ */}
            <svg
              width={22}
              height={22}
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
              style={{
                display: "block",
                margin: "0 auto 10px",
                color: "var(--gold-light)",
              }}
            >
              <rect
                x="4.6"
                y="4.6"
                width="6.8"
                height="6.8"
                stroke="currentColor"
                strokeWidth="1.4"
                transform="rotate(45 8 8)"
              />
            </svg>
            <p
              style={{
                fontSize: "16px",
                fontFamily: "Playfair Display, serif",
                color: "var(--charcoal)",
                margin: "0 0 6px 0",
              }}
            >
              Sem novidades por agora
            </p>
            <p
              style={{
                fontSize: "12.5px",
                color: "var(--gray-mid)",
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              Quando alguém preencher o formulário de interesse — ou mexer no
              acompanhamento de um evento — aparece aqui ao segundo.
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {lista.map((n) => (
              <CartaoNotificacao
                key={n.id}
                n={n}
                eventTypes={eventTypes}
                expandida={expandidaId === n.id}
                modoSelecao={emSelecao}
                selecionada={emSelecao && selecao.has(n.id)}
                onToggle={() => alternarExpansao(n.id)}
                onToggleSelecao={() => alternarSelecao(n.id)}
                onAbrirEvento={onAbrirEvento}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Barra de seleção — sobe do fundo quando há escolha em curso */}
      <AnimatePresence>
        {emSelecao && (
          <motion.div
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 90, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 340 }}
            style={{
              flexShrink: 0,
              backgroundColor: "white",
              borderTop: "1px solid var(--gold-light)",
              boxShadow: "0 -8px 24px rgba(0,0,0,0.08)",
              padding: "14px 18px calc(14px + env(safe-area-inset-bottom))",
            }}
          >
            {confirmando ? (
              <motion.div
                key="confirmar"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
              >
                <p
                  style={{
                    fontSize: "13.5px",
                    fontWeight: "600",
                    color: "var(--charcoal)",
                    margin: "0 0 2px 0",
                  }}
                >
                  Remover{" "}
                  {nSel === 1 ? "este pedido" : `estes ${nSel} pedidos`} da
                  caixa?
                </p>
                <p
                  style={{
                    fontSize: "11.5px",
                    color: "var(--gray-mid)",
                    margin: 0,
                  }}
                >
                  Os dados continuam guardados na ficha de cada cliente.
                </p>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    justifyContent: "flex-end",
                    marginTop: "12px",
                  }}
                >
                  <button
                    onClick={() => setConfirmando(false)}
                    style={{
                      padding: "9px 18px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: "600",
                      border: "1px solid var(--gold-light)",
                      color: "var(--gray-mid)",
                      backgroundColor: "white",
                      cursor: "pointer",
                    }}
                  >
                    Voltar
                  </button>
                  <button
                    onClick={removerSelecionadas}
                    style={{
                      padding: "9px 20px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: "600",
                      letterSpacing: "0.04em",
                      border: "none",
                      backgroundColor: "#A63D2F",
                      color: "white",
                      cursor: "pointer",
                      boxShadow: "0 3px 10px rgba(166,61,47,0.3)",
                    }}
                  >
                    Sim, remover
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="escolher"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "var(--charcoal)",
                      margin: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {nSel === 0
                      ? "Nenhum escolhido"
                      : nSel === 1
                        ? "1 pedido escolhido"
                        : `${nSel} pedidos escolhidos`}
                  </p>
                  <button
                    onClick={() =>
                      setSelecao(
                        new Set(
                          todasSelecionadas ? [] : removiveis.map((n) => n.id),
                        ),
                      )
                    }
                    style={{
                      padding: 0,
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      fontSize: "11px",
                      fontWeight: "600",
                      color: "var(--gold-dark)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {todasSelecionadas
                      ? "Desmarcar todas"
                      : "Selecionar todas"}
                  </button>
                  {haProtegidas && (
                    <p
                      style={{
                        fontSize: "10.5px",
                        lineHeight: 1.5,
                        color: "var(--gray-mid)",
                        margin: "4px 0 0",
                        whiteSpace: "normal",
                      }}
                    >
                      Os avisos de contrato em papel ficam — são a fila de
                      confirmação.
                    </p>
                  )}
                </div>
                <button
                  onClick={sairDaSelecao}
                  style={{
                    flexShrink: 0,
                    padding: "9px 16px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: "600",
                    border: "1px solid var(--gold-light)",
                    color: "var(--gray-mid)",
                    backgroundColor: "white",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => nSel > 0 && setConfirmando(true)}
                  disabled={nSel === 0}
                  style={{
                    flexShrink: 0,
                    padding: "9px 20px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: "600",
                    letterSpacing: "0.04em",
                    border: "none",
                    backgroundColor: nSel === 0 ? "#E5E0D5" : "#A63D2F",
                    color: "white",
                    cursor: nSel === 0 ? "default" : "pointer",
                    boxShadow:
                      nSel === 0 ? "none" : "0 3px 10px rgba(166,61,47,0.3)",
                    transition: "background-color 0.2s",
                  }}
                >
                  Remover{nSel > 0 ? ` (${nSel})` : ""}
                </button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default function PainelNotificacoes({
  aberto,
  destaqueId = null, // notificação a abrir já expandida (vinda do toast)
  lista,
  naoLidas,
  eventTypes,
  onFechar,
  onMarcarLida,
  onMarcarTodas,
  onApagarVarias,
  onAbrirEvento,
}) {
  const painelRef = useRef(null);
  const origemRef = useRef(null);

  // Escape fecha (sem roubar a tecla a um campo com o cursor lá dentro —
  // o padrão do SubmissionDrawer), o foco entra no painel ao abrir e
  // volta ao sino ao fechar.
  useEffect(() => {
    if (!aberto) return undefined;
    origemRef.current = document.activeElement;
    painelRef.current?.focus({ preventScroll: true });
    const aoTeclar = (e) => {
      if (e.key !== "Escape") return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      onFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      if (origemRef.current?.focus) origemRef.current.focus();
    };
  }, [aberto, onFechar]);

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onFechar}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 52,
            backgroundColor: "rgba(26,26,26,0.4)",
            backdropFilter: "blur(2px)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <motion.div
            ref={painelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Caixa de Entrada"
            tabIndex={-1}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(460px, 100%)",
              height: "100%",
              backgroundColor: "var(--cream)",
              boxShadow: "-12px 0 40px rgba(0,0,0,0.18)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <ConteudoCaixa
              destaqueId={destaqueId}
              lista={lista}
              naoLidas={naoLidas}
              eventTypes={eventTypes}
              onFechar={onFechar}
              onMarcarLida={onMarcarLida}
              onMarcarTodas={onMarcarTodas}
              onApagarVarias={onApagarVarias}
              onAbrirEvento={onAbrirEvento}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ------------------------------------------------------------
// ToastNotificacao — o cartão dourado que desce quando um pedido
// chega em tempo real. Clique = abre a Caixa de Entrada já no pedido.
// Desaparece sozinho ao fim de 9 segundos (linha dourada a esgotar).
// ------------------------------------------------------------
const DURACAO_TOAST_S = 9;

export function ToastNotificacao({ nova, eventTypes, onAbrir, onFechar }) {
  // Desbloqueia o som ao primeiro gesto da Nádia na app (ver comentário
  // acima de tocarSino) — sem isto, o sino fica sempre mudo.
  useDesbloquearSino();

  // Com movimento reduzido no sistema, o shimmer e a barra de vida
  // ficam quietos (o framer-motion trata das molas via MotionConfig;
  // estas duas são keyframes CSS e tratam-se aqui).
  const reduzido = useReducedMotion();

  // Toca o sino a cada chegada
  useEffect(() => {
    if (nova) tocarSino();
  }, [nova?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fecho
  useEffect(() => {
    if (!nova) return undefined;
    const t = setTimeout(onFechar, DURACAO_TOAST_S * 1000);
    return () => clearTimeout(t);
  }, [nova?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tipo = nova ? nomeDoTipo(nova, eventTypes) : null;
  // Um aviso do PORTAL não é um pedido de interesse — o toast veste-o
  // com o overline e o resumo dele, não com o molde da captação.
  const doPortal = nova ? TIPOS_DO_PORTAL[nova.tipo] || null : null;
  const dataEvento =
    nova?.dados?.data_evento || nova?.dados?.respostas?.dataEvento || null;
  const convidados =
    nova?.dados?.numero_convidados ??
    nova?.dados?.respostas?.numeroConvidados ??
    null;

  return (
    <>
      <style>{`
        @keyframes dlm-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(220%); }
        }
        @keyframes dlm-toast-vida {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
      <AnimatePresence>
        {nova && (
          <motion.div
            key={nova.id}
            initial={{ opacity: 0, y: -28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.97 }}
            transition={{ type: "spring", damping: 22, stiffness: 300 }}
            onClick={() => onAbrir(nova)}
            role="button"
            style={{
              position: "fixed",
              top: "18px",
              right: "18px",
              left: "auto",
              zIndex: 70,
              width: "min(360px, calc(100vw - 36px))",
              backgroundColor: "white",
              border: "1px solid var(--gold)",
              borderRadius: "16px",
              boxShadow:
                "0 16px 48px rgba(160,120,48,0.28), 0 3px 10px rgba(0,0,0,0.08)",
              cursor: "pointer",
              overflow: "hidden",
            }}
          >
            {/* varrimento de luz — o brilho da casa */}
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                width: "45%",
                background:
                  "linear-gradient(105deg, transparent, rgba(232,213,163,0.45), transparent)",
                animation: reduzido
                  ? "none"
                  : "dlm-shimmer 2.4s ease-in-out 0.3s 2",
                pointerEvents: "none",
              }}
            />

            <div
              style={{
                display: "flex",
                gap: "13px",
                alignItems: "flex-start",
                padding: "15px 16px 13px",
              }}
            >
              {/* medalhão com a faísca */}
              <motion.span
                initial={{ rotate: -20, scale: 0.6 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: "spring", damping: 10, stiffness: 260, delay: 0.15 }}
                style={{
                  flexShrink: 0,
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  background:
                    "linear-gradient(135deg, #E8D5A3 0%, #C9A84C 60%, #A07830 100%)",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 12px rgba(201,168,76,0.4)",
                }}
              >
                {/* losango no traço da casa, não o glifo ✦ */}
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden
                  style={{ display: "block" }}
                >
                  <rect
                    x="4.6"
                    y="4.6"
                    width="6.8"
                    height="6.8"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    transform="rotate(45 8 8)"
                  />
                </svg>
              </motion.span>

              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  style={{
                    fontSize: "9px",
                    fontWeight: "700",
                    color: "var(--gold-dark)",
                    textTransform: "uppercase",
                    letterSpacing: "0.18em",
                    margin: "0 0 3px 0",
                  }}
                >
                  {doPortal ? "Do acompanhamento" : "Novo pedido de interesse"}
                </p>
                <p
                  style={{
                    fontSize: "17px",
                    fontWeight: "600",
                    fontFamily: "Playfair Display, serif",
                    color: "var(--charcoal)",
                    margin: "0 0 2px 0",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {nova.titulo || "Novo interessado"}
                </p>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--gray-mid)",
                    margin: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {doPortal
                    ? doPortal.resumo
                    : [
                        tipo,
                        dataEvento
                          ? new Date(dataEvento).toLocaleDateString("pt-PT", {
                              day: "numeric",
                              month: "long",
                            })
                          : null,
                        convidados ? `${convidados} convidados` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Toque para ver os detalhes"}
                </p>
                <p
                  style={{
                    fontSize: "11px",
                    fontWeight: "600",
                    color: "var(--gold-dark)",
                    margin: "7px 0 0 0",
                    letterSpacing: "0.04em",
                  }}
                >
                  Ver o pedido →
                </p>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFechar();
                }}
                aria-label="Dispensar"
                style={{
                  flexShrink: 0,
                  color: "var(--gray-mid)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  lineHeight: 1,
                  padding: "2px",
                }}
              >
                <MarcaCruz t={14} />
              </button>
            </div>

            {/* a vida do toast a esgotar-se — estática com movimento
                reduzido (o auto-fecho continua a contar na mesma) */}
            <span
              aria-hidden="true"
              style={{
                display: "block",
                height: "3px",
                background:
                  "linear-gradient(90deg, var(--gold), var(--gold-light))",
                animation: reduzido
                  ? "none"
                  : `dlm-toast-vida ${DURACAO_TOAST_S}s linear forwards`,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
