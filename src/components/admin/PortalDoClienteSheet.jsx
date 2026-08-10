import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Esqueleto } from "./acabamento";
import { FASES_POS_SINAL } from "./faseConfig";
import {
  getAcessoDoEvento,
  abrirPortal,
  revogarPortal,
  enderecoDoPortal,
  getPublicacoes,
  getPedidosCodigo,
  publicarDocumento,
  emitirCodigo,
  getPapelPorConfirmar,
  getPedidosDoQuestionario,
  marcarPedidoTratado,
  urlDoContratoPapel,
  confirmarContratoPapel,
  ROTULO_DOCUMENTO,
} from "../../lib/portal";
import { supabase } from "../../lib/supabase";
import { documentosDoEvento, obterDocumento } from "../../lib/documentos";
import { comunicadosDoEvento } from "../../lib/comunicados";
import {
  confirmacaoViva,
  guardarConfigSinal,
  guardarPrazoDia,
  limparConfirmacaoSinal,
  prazoWhatsApp,
} from "../../lib/disputaDia";
import { linkWhatsApp } from "../../lib/mensagens";
import { getValorAtual } from "../../lib/submissionFields";
import { extrairDadosCliente } from "../../lib/clientes";
import { EMPRESA } from "../../lib/casa";
import { diaDito } from "./comunicadoTempo";
import { guardarAlteracoes } from "../../lib/briefingEdicao";
import { formatarMorada, moradaVazia } from "../../lib/morada";
import { CONTRATO_INTRO, CLAUSULAS } from "./orcamentos/contratoConfig";
import {
  CONDICOES_ORCAMENTO,
  NOTA_RODAPE_ORCAMENTO,
  VALIDADE_ORCAMENTO_DIAS,
} from "./orcamentos/orcamentoConfig";

// O que se CONGELA junto com os dados ao publicar: o texto fixo que os
// rodeia. Sem isto, mudar uma cláusula no código mudava um contrato já
// publicado — o instantâneo tem de apanhar tudo o que a cliente lê.
const EXTRA_POR_TIPO = {
  contrato: { __contrato: { intro: CONTRATO_INTRO, clausulas: CLAUSULAS } },
  orcamento: {
    __condicoes: CONDICOES_ORCAMENTO,
    __nota: NOTA_RODAPE_ORCAMENTO,
    __validadeDias: VALIDADE_ORCAMENTO_DIAS,
  },
  proposta: null,
};

// ============================================================
// PortalDoClienteSheet — a porta do acompanhamento, do lado da Nádia.
//
// Fecha a fase 1: até aqui a ligação só se obtinha por SQL, ou seja, ela
// não conseguia usá-la. Aqui gera-se, copia-se, vê-se se a cliente lá foi,
// e fecha-se.
//
// A CASA É AO LADO DO BOTÃO DE WHATSAPP, na moldura do evento: gerar e
// enviar são o mesmo momento, e é aí que ela está quando pensa na cliente.
//
// ⚠ NÃO pré-visualizar chamando `dlm_portal_ver`: essa função incrementa
// `n_acessos` e carimba `ultimo_acesso_em`. Uma espreitadela daqui passava
// a contar como visita da cliente e estragava o único sinal que lhe diz se
// vale a pena insistir. Por isso a linha do «o que ela vai ver» sai da
// FASE do evento, não da RPC.
//
// O CONTEÚDO é componente à parte, montado só quando a folha abre. Assim o
// estado nasce limpo a cada abertura sem ser reposto dentro de um efeito —
// que é a família do bug de produção do documento, e que o linter proíbe
// com razão.
//
// Registo de OFÍCIO, não de montra: sem cerimónia, sem Playfair, sem
// movimento além do que a folha faz ao entrar. Terceira pessoa e
// vocabulário sem regionalismos, como no resto — mesmo sendo ecrã interno.
// ============================================================

const overline = {
  fontSize: "10px",
  fontWeight: "700",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--gold-dark)",
  margin: 0,
};

const botao = {
  padding: "9px 16px",
  borderRadius: "10px",
  fontSize: "12.5px",
  fontWeight: "600",
  fontFamily: "inherit",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const dataHora = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })} às ${d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`;
};

// A confirmação de leitura das condições do orçamento: UMA por evento,
// nunca por versão — por isso devolve-se só o carimbo da primeira. O
// !inner é o filtro, como nos pedidos de código. Vive aqui e não em
// lib/portal.js porque esse ficheiro está a ser mexido noutra frente;
// o padrão da query é o mesmo dos factos vizinhos.
const getCondicoesLidas = async (eventoId) => {
  const { data, error } = await supabase
    .from("portal_condicoes_lidas")
    .select("criado_em, portal_publicacoes!inner(submission_id)")
    .eq("portal_publicacoes.submission_id", eventoId)
    .order("criado_em", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.criado_em || null;
};

// ── O SINAL (083) — as peças de leitura da secção ──────────────────────

// As quatro formas de receber o sinal, na ordem do mockup aprovado. As
// chaves são as do jsonb `sinal_pagamento` (083); quem as traduz em ecrã
// para a cliente é o portal (SinalVista) — aqui só se escolhe e grava.
const OPCOES_SINAL = [
  ["mbway_iban", "MB Way + IBAN"],
  ["conversa", "Pela conversa"],
  ["dinheiro", "Dinheiro"],
  ["outra", "À minha maneira"],
];

// A 083 pode ainda não ter corrido nesta BD — o padrão ehTabelaEmFalta
// de notificacoes.js, alargado às colunas e às funções (os códigos que a
// lib da disputa também escuta). A lib não exporta o detector; repete-se
// cá o mínimo, porque a folha faz UMA leitura própria (abaixo).
const ehSem083 = (erro) =>
  ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(
    erro?.code,
  ) ||
  /does not exist|could not find/i.test(erro?.message || "");

// A config da forma de pagamento e o prazo do dia, frescos da BD. A lib
// da disputa só os ESCREVE (guardarConfigSinal/guardarPrazoDia) — lê-los
// ao abrir é papel da folha, que é quem precisa da verdade do momento.
// Devolve:
//   {config, prazo} — a 083 correu (mesmo que ambos venham null);
//   null            — a 083 ainda não correu (a secção diz porquê);
// e DEIXA SUBIR os outros erros — o Promise.all da folha trata-os como
// aos factos acessórios irmãos (console.error, e a secção cala-se).
const getSinalDoEvento = async (eventoId) => {
  const { data, error } = await supabase
    .from("submissions")
    .select("sinal_pagamento, dia_guardado_ate")
    .eq("id", eventoId)
    .single();
  if (error) {
    if (ehSem083(error)) return null;
    throw error;
  }
  return {
    config: data?.sinal_pagamento || null,
    prazo: data?.dia_guardado_ate || null,
  };
};

// «em confirmação há 3 dias», a contar do carimbo do «já paguei» — dias
// inteiros, e no próprio dia diz-se «desde hoje» (um «há 0 dias» soava a
// contador avariado).
const emConfirmacaoHa = (iso) => {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return "desde hoje";
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
};

// «15/08/2026» a partir de 'YYYY-MM-DD', partido à mão — o padrão da
// casa (base.js/disputaDia): um parse ISO por Date cai em UTC e num fuso
// atrás recuava um dia sem ninguém dar por ele.
const dataCurta = (iso) => {
  const [a, m, d] = String(iso || "").slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
};

// O que a cliente vai encontrar, dito pela FASE do evento — a única fonte
// disponível sem gastar uma visita. Usa a lista canónica FASES_POS_SINAL,
// a mesma da conferência da Logística e das lacunas de formulário, em vez
// de uma lista nova.
//
// É informação, nunca travão: não bloqueia nada, só lhe permite decidir
// com conhecimento se é cedo de mais para enviar.
const oQueElaVaiVer = (fase) => {
  if (fase === "perdido") return null;
  if (FASES_POS_SINAL.includes(fase)) {
    return "O evento já vai adiantado: ela vai encontrar boa parte do percurso feito.";
  }
  return "O evento ainda está no princípio: ela vai encontrar quase tudo por acontecer. Não é defeito da página — é onde o evento está —, mas talvez prefira esperar por ter mais para lhe mostrar.";
};

// O erro de uma acção responde JUNTO ao gesto que falhou, nunca no fundo
// da folha (que rola, e onde ninguém está a olhar). Cada secção pinta o
// seu; `erro` é { zona, mensagem } e a zona diz onde.
function ErroDaZona({ erro, zona }) {
  if (!erro || erro.zona !== zona) return null;
  return (
    <p
      style={{
        fontSize: "12.5px",
        lineHeight: 1.6,
        color: "#B91C1C",
        margin: "10px 0 0",
      }}
    >
      {erro.mensagem}
    </p>
  );
}

function Conteudo({ evento, onFechar }) {
  // { estado: 'a-carregar' | 'pronto' | 'erro', acesso, docs, pubs, pedidos }
  const [resultado, setResultado] = useState(null);
  // { zona: 'porta'|'documentos'|'codigos'|'questionario'|'papel'|'fecho',
  //   mensagem } — ver ErroDaZona.
  const [erro, setErro] = useState(null);
  const [aTrabalhar, setATrabalhar] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [aConfirmarFecho, setAConfirmarFecho] = useState(false);
  // Depois de publicar ou emitir, pede-se a verdade à base outra vez em
  // vez de a remendar à mão no estado local.
  const [recarga, setRecarga] = useState(0);
  // O id do pedido cujo código acabou de ser copiado (feedback do botão).
  const [copiadoCodigo, setCopiadoCodigo] = useState(null);
  // O nome tal como está escrito no papel — é ele que fica no trilho.
  const [nomeNoPapel, setNomeNoPapel] = useState("");
  // Bandeira PRÓPRIA: com a partilhada, confirmar o papel punha o botão de
  // emitir código a dizer «A emitir…» sem nada estar a ser emitido.
  const [aConfirmarPapel, setAConfirmarPapel] = useState(false);
  // A morada num toque (074): o pedido cuja confirmação inline está
  // aberta, a bandeira própria do gesto, e o rasto do que ficou aplicado
  // — que tem de sobreviver ao refetch que leva o pedido da lista.
  const [confirmaMorada, setConfirmaMorada] = useState(null);
  const [aAplicarMorada, setAAplicarMorada] = useState(false);
  const [moradaAplicada, setMoradaAplicada] = useState(null);
  // ── O SINAL (083) ──
  // O formulário da config — semeado UMA vez por abertura com o que está
  // gravado (ver formaSemeadaRef): as recargas das outras secções não
  // podem apagar uma edição a meio.
  const [metodoSinal, setMetodoSinal] = useState("mbway_iban");
  const [mbwaySinal, setMbwaySinal] = useState("");
  const [ibanSinal, setIbanSinal] = useState("");
  const [instrucaoSinal, setInstrucaoSinal] = useState("");
  const [aGuardarConfig, setAGuardarConfig] = useState(false);
  // Feedback discreto do «guardado» — o mesmo fôlego do «Copiado».
  const [configGuardada, setConfigGuardada] = useState(false);
  const [prazoInput, setPrazoInput] = useState("");
  const [aGuardarPrazo, setAGuardarPrazo] = useState(false);
  const [copiadoMsgPrazo, setCopiadoMsgPrazo] = useState(false);
  // A confirmação limpa-se com confirmação inline (nunca window.confirm)
  // — bandeira do «tem a certeza?» e bandeira própria do gesto.
  const [confirmaLimparConf, setConfirmaLimparConf] = useState(false);
  const [aLimparConf, setALimparConf] = useState(false);
  const formaSemeadaRef = useRef(false);

  const eventoId = evento.id;

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      getAcessoDoEvento(eventoId),
      documentosDoEvento(eventoId),
      getPublicacoes(eventoId),
      getPedidosCodigo(eventoId),
      getPapelPorConfirmar(eventoId),
      getPedidosDoQuestionario(eventoId),
      // Um facto acessório não derruba a folha: se esta query falhar,
      // lê-se «por confirmar» — que é a verdade possível nesse momento.
      getCondicoesLidas(eventoId).catch((e) => {
        console.error(e);
        return null;
      }),
      // Outro facto acessório, o mesmo trato: falhar cala a secção (a
      // secção sem linhas nem se monta), nunca derruba a folha.
      comunicadosDoEvento(eventoId).catch((e) => {
        console.error(e);
        return [];
      }),
      // O sinal (083): null = a 083 falta (a secção diz porquê);
      // undefined = erro transitório (a secção cala-se — afirmar «falta a
      // migração» num tropeço de rede seria mentir).
      getSinalDoEvento(eventoId).catch((e) => {
        console.error(e);
        return undefined;
      }),
      // A confirmação viva degrada sozinha na lib quando a 083 falta;
      // qualquer OUTRO erro sobe de lá — apara-se aqui como acessório.
      confirmacaoViva(eventoId).catch((e) => {
        console.error(e);
        return null;
      }),
    ])
      .then(([a, docs, pubs, pedidos, papeis, pedidosQ, condicoesLidasEm, comunicados, sinal, confirmacao]) => {
        if (cancelado) return;
        setResultado({ estado: "pronto", acesso: a, docs, pubs, pedidos, papeis, pedidosQ, condicoesLidasEm, comunicados, sinal, confirmacao });
        // A sementeira única do formulário da config: a primeira carga
        // preenche; as recargas seguintes (publicar, emitir…) já não
        // tocam no que a Nádia possa estar a escrever.
        if (!formaSemeadaRef.current && sinal) {
          formaSemeadaRef.current = true;
          const c = sinal.config || {};
          setMetodoSinal(c.metodo || "mbway_iban");
          setMbwaySinal(c.mbway || "");
          setIbanSinal(c.iban || "");
          setInstrucaoSinal(c.instrucao || "");
        }
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado)
          setResultado({ estado: "erro", acesso: null, docs: [], pubs: [], pedidos: [], papeis: [], pedidosQ: [], condicoesLidasEm: null, comunicados: [], sinal: undefined, confirmacao: null });
      });
    return () => {
      cancelado = true;
    };
  }, [eventoId, recarga]);

  const estado = resultado?.estado ?? "a-carregar";
  const acesso = resultado?.acesso ?? null;
  const docs = resultado?.docs ?? [];
  const pubs = resultado?.pubs ?? [];
  const pedidos = resultado?.pedidos ?? [];
  const papeis = resultado?.papeis ?? [];
  const pedidosQ = resultado?.pedidosQ ?? [];
  const condicoesLidasEm = resultado?.condicoesLidasEm ?? null;
  const comunicados = resultado?.comunicados ?? [];
  // Quem manda a secção do papel embora é a ASSINATURA existir — não o
  // aviso ter sido lido. Lê-se nos actos da publicação do contrato.
  const contratoAssinado = pubs.some(
    (p) =>
      p.tipo === "contrato" &&
      (p.portal_actos || []).some((x) => x.acto === "assinou"),
  );
  const papelPorConfirmar = contratoAssinado ? null : papeis[0] || null;
  const endereco = acesso ? enderecoDoPortal(acesso.token) : null;

  // «Copiado» só se afirma quando a cópia ACONTECEU — o writeText pode
  // ser recusado (permissões, foco), e afirmar sucesso punha a Nádia a
  // colar nada numa conversa de WhatsApp.
  const copiar = async () => {
    if (!endereco) return;
    try {
      await navigator.clipboard.writeText(endereco);
      setErro((e) => (e?.zona === "porta" ? null : e));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch (e) {
      console.error(e);
      setErro({
        zona: "porta",
        mensagem:
          "Não foi possível copiar automaticamente. Toque no campo e copie a ligação à mão.",
      });
    }
  };

  const abrir = async () => {
    setATrabalhar(true);
    setErro(null);
    try {
      // Idempotente na base: carregar duas vezes devolve o MESMO token
      // (há um índice único parcial a garanti-lo), nunca cria um segundo.
      await abrirPortal(eventoId);
      // Recarga em vez de substituir o objecto: escrever só `acesso`
      // deitava fora docs/pubs/pedidos, e as secções dos documentos e dos
      // códigos desapareciam até fechar e reabrir a folha.
      setRecarga((r) => r + 1);
    } catch (e) {
      console.error(e);
      setErro({
        zona: "porta",
        mensagem: "Não foi possível abrir o acompanhamento. Tente novamente.",
      });
    } finally {
      setATrabalhar(false);
    }
  };

  const revogar = async () => {
    setATrabalhar(true);
    setErro(null);
    try {
      await revogarPortal(eventoId, "manual");
      setRecarga((r) => r + 1);
      setAConfirmarFecho(false);
    } catch (e) {
      console.error(e);
      setErro({
        zona: "fecho",
        mensagem: "Não foi possível fechar o acompanhamento. Tente novamente.",
      });
    } finally {
      setATrabalhar(false);
    }
  };

  const publicar = async (tipo) => {
    setATrabalhar(true);
    setErro(null);
    try {
      // A proposta publica-se com as imagens DO CLIENTE no lugar das de
      // trabalho: as da Nádia são só dela (o PDF que imprime), e o
      // instantâneo deve conter exactamente o que a cliente vê — a
      // imagem de trabalho nunca sai de casa, nem escondida no JSON.
      // O p_extra substitui `seccoes` por inteiro (a fusão do
      // dlm_portal_publicar é rasa); secção sem imagemCliente
      // publica-se sem imagem, de propósito. O extra segue SEMPRE —
      // mesmo sem secções na BD, `seccoes: []` garante que o verbatim
      // dos dados nunca escapa pela fusão. A 088 (quando correr) faz a
      // mesma troca DENTRO da RPC, atómica sobre os dados frescos; este
      // extra fica como cinto de segurança até lá — e depois dela, a
      // RPC sobrepõe-no com a versão fresca, o que é o desejado.
      let extra = EXTRA_POR_TIPO[tipo] || null;
      if (tipo === "proposta") {
        const docProposta = await obterDocumento("proposta", eventoId);
        const seccoesDoc = docProposta?.dados?.seccoes;
        extra = {
          seccoes: Array.isArray(seccoesDoc)
            ? seccoesDoc.map(({ imagemCliente, ...s }) => ({
                ...s,
                imagem: imagemCliente || "",
              }))
            : [],
        };
      }
      await publicarDocumento(eventoId, tipo, extra);
      setRecarga((r) => r + 1);
    } catch (e) {
      console.error(e);
      setErro({
        zona: "documentos",
        mensagem: /CONTRATO_TRANCADO/.test(e?.message || "")
          ? "Este contrato está assinado e trancado — não há versões novas. Para corrigir, faz-se um contrato novo."
          : "Não foi possível publicar. Tente novamente.",
      });
    } finally {
      setATrabalhar(false);
    }
  };

  const emitir = async (verificacaoId) => {
    setATrabalhar(true);
    setErro(null);
    try {
      await emitirCodigo(verificacaoId);
      setRecarga((r) => r + 1);
    } catch (e) {
      console.error(e);
      setErro({
        zona: "codigos",
        mensagem: "Não foi possível emitir o código. Tente novamente.",
      });
    } finally {
      setATrabalhar(false);
    }
  };

  // O papel: ver a fotografia (URL assinado, 5 minutos) e confirmar com o
  // nome que lá está escrito.
  const verPapel = async (caminho) => {
    setErro(null);
    try {
      const url = await urlDoContratoPapel(caminho);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error(e);
      setErro({
        zona: "papel",
        mensagem: "Não foi possível abrir a fotografia. Tente novamente.",
      });
    }
  };

  const confirmarPapel = async (notificacaoId) => {
    if (aConfirmarPapel) return;
    if (!nomeNoPapel.trim() || nomeNoPapel.trim().length < 3) {
      setErro({
        zona: "papel",
        mensagem:
          "Escreva o nome tal como está no papel — é ele que fica no registo.",
      });
      return;
    }
    setAConfirmarPapel(true);
    setErro(null);
    try {
      const r = await confirmarContratoPapel(notificacaoId, nomeNoPapel.trim());
      if (r?.estado === "ja_assinado") {
        setErro({
          zona: "papel",
          mensagem: "Este contrato já estava assinado — nada mudou.",
        });
      }
      setNomeNoPapel("");
      setRecarga((x) => x + 1);
    } catch (e) {
      console.error(e);
      const m = e?.message || "";
      setErro({
        zona: "papel",
        mensagem: /SEM_CONTRATO_PUBLICADO/.test(m)
          ? "Não há contrato publicado neste evento — publique-o antes de confirmar."
          : /FICHEIRO_NAO_ENCONTRADO/.test(m)
            ? "A fotografia já não está no arquivo. Peça-lhe que a carregue outra vez."
            : "Não foi possível confirmar. Tente novamente.",
      });
    } finally {
      setAConfirmarPapel(false);
    }
  };

  const tratarPedido = async (id) => {
    if (aTrabalhar) return;
    setATrabalhar(true);
    setErro(null);
    try {
      await marcarPedidoTratado(id);
      setRecarga((x) => x + 1);
    } catch (e) {
      console.error(e);
      setErro({
        zona: "questionario",
        mensagem: "Não foi possível marcar como tratado. Tente novamente.",
      });
    } finally {
      setATrabalhar(false);
    }
  };

  // Um pedido com `dados` de morada (074): o objecto das cinco partes,
  // quando tem mesmo alguma coisa lá dentro.
  const moradaDoPedido = (p) =>
    p.dados &&
    typeof p.dados === "object" &&
    !Array.isArray(p.dados) &&
    !moradaVazia(p.dados)
      ? p.dados
      : null;

  // Com orçamento no acompanhamento, aplicar a morada muda o que o
  // cálculo de deslocação usou — informa-se, não se bloqueia.
  const orcamentoNoAr = pubs.some((p) => p.tipo === "orcamento");

  // Aplica a morada nova num toque: (1) escreve a resposta pelo caminho
  // CANÓNICO do briefing — guardarAlteracoes → submissao_fundir_respostas
  // (038/064), que faz o merge no servidor e deixa o registo em
  // respostas_autoria como equipa; nunca por fora dele — e (2) fecha o
  // pedido. Dois passos separados nos erros: falhar o primeiro não muda
  // nada; falhar só o segundo diz exactamente o que ficou.
  const aplicarMorada = async (p) => {
    if (aAplicarMorada) return;
    setAAplicarMorada(true);
    setErro(null);
    try {
      const { error: erroEscrita } = await guardarAlteracoes({ id: eventoId }, [
        { campo: { id: p.campo_id }, valor: p.dados },
      ]);
      if (erroEscrita) throw erroEscrita;
    } catch (e) {
      console.error(e);
      setErro({
        zona: "questionario",
        mensagem: "Não foi possível aplicar a morada — nada mudou. Tente novamente.",
      });
      setAAplicarMorada(false);
      return;
    }
    try {
      await marcarPedidoTratado(p.id);
    } catch (e) {
      console.error(e);
      setErro({
        zona: "questionario",
        mensagem:
          "A morada ficou aplicada, mas o pedido não fechou — use «Marcar como tratado».",
      });
    }
    setMoradaAplicada({ comOrcamento: orcamentoNoAr });
    setConfirmaMorada(null);
    setAAplicarMorada(false);
    setRecarga((x) => x + 1);
  };

  const copiarCodigo = async (id, codigo) => {
    try {
      await navigator.clipboard.writeText(codigo);
      setErro((e) => (e?.zona === "codigos" ? null : e));
      setCopiadoCodigo(id);
      setTimeout(() => setCopiadoCodigo(null), 2500);
    } catch (e) {
      console.error(e);
      setErro({
        zona: "codigos",
        mensagem:
          "Não foi possível copiar automaticamente. O código está no botão — anote-o e envie-o.",
      });
    }
  };

  // ── O SINAL (083) — o que a secção lê e faz ──────────────────────
  // {config, prazo} | null (a 083 falta) | undefined (erro transitório).
  const sinalInfo = resultado?.sinal;
  const confirmacaoSinal = resultado?.confirmacao ?? null;
  // O prazo só vale enquanto >= hoje — a MESMA leitura da dlm_dia_estado:
  // um prazo de ontem já se dissolveu sozinho, e mostrá-lo seria afirmar
  // uma promessa que o servidor já não conta.
  const hojeISO = new Date().toISOString().slice(0, 10);
  const prazoAtivo =
    sinalInfo?.prazo && sinalInfo.prazo >= hojeISO ? sinalInfo.prazo : null;

  // A conversa é com a CLIENTE — o número dela, pelas mesmas duas fontes
  // que a página do evento usa para o botão de WhatsApp da moldura.
  const numeroCliente =
    getValorAtual(evento, "numeroWhatsapp") ||
    getValorAtual(evento, "contactoPrincipal") ||
    null;
  // «Cliente sem nome» é rede das listas, não saudação — antes um «Olá!»
  // simples do que um postal com o remendo à vista.
  const nomeExtraido = extrairDadosCliente(evento.respostas || {}).nome;
  const nomeCliente = nomeExtraido === "Cliente sem nome" ? null : nomeExtraido;
  const mensagemPrazo = prazoAtivo
    ? prazoWhatsApp(nomeCliente, evento.data_evento, prazoAtivo)
    : null;
  const ligacaoPrazo = mensagemPrazo
    ? linkWhatsApp(numeroCliente, mensagemPrazo)
    : null;

  const guardarFormaSinal = async () => {
    if (aGuardarConfig) return;
    setAGuardarConfig(true);
    setErro(null);
    const aparar = (v) => (v && v.trim() ? v.trim() : null);
    try {
      // Só viajam os campos do método escolhido — um IBAN esquecido de
      // uma escolha antiga não pode ressuscitar no portal.
      const r = await guardarConfigSinal(eventoId, {
        metodo: metodoSinal,
        mbway: metodoSinal === "mbway_iban" ? aparar(mbwaySinal) : null,
        iban: metodoSinal === "mbway_iban" ? aparar(ibanSinal) : null,
        instrucao:
          metodoSinal === "dinheiro" || metodoSinal === "outra"
            ? aparar(instrucaoSinal)
            : null,
      });
      if (!r) {
        // A lib degradou: a 083 não está nesta BD — nada ficou gravado.
        setErro({
          zona: "sinal",
          mensagem:
            "A migração 083 ainda não correu nesta base — nada ficou gravado.",
        });
      } else {
        setConfigGuardada(true);
        setTimeout(() => setConfigGuardada(false), 2500);
      }
    } catch (e) {
      console.error(e);
      setErro({
        zona: "sinal",
        mensagem: "Não foi possível guardar a forma de pagamento. Tente novamente.",
      });
    } finally {
      setAGuardarConfig(false);
    }
  };

  // Guardar (dataISO) e limpar (null) são o mesmo gesto na lib — e nos
  // dois casos pede-se a verdade à base outra vez, como as secções irmãs.
  const gravarPrazo = async (dataISO) => {
    if (aGuardarPrazo) return;
    if (dataISO) {
      if (dataISO < hojeISO) {
        setErro({
          zona: "sinal",
          mensagem:
            "O prazo tem de ser hoje ou à frente — um no passado dissolve-se sozinho.",
        });
        return;
      }
      if (evento.data_evento && dataISO > evento.data_evento) {
        setErro({
          zona: "sinal",
          mensagem: "O prazo não pode passar o próprio dia do evento.",
        });
        return;
      }
    }
    setAGuardarPrazo(true);
    setErro(null);
    try {
      const r = await guardarPrazoDia(eventoId, dataISO);
      if (!r) {
        setErro({
          zona: "sinal",
          mensagem:
            "A migração 083 ainda não correu nesta base — nada ficou gravado.",
        });
      } else {
        setPrazoInput("");
        setRecarga((x) => x + 1);
      }
    } catch (e) {
      console.error(e);
      setErro({
        zona: "sinal",
        mensagem: dataISO
          ? "Não foi possível guardar o prazo. Tente novamente."
          : "Não foi possível limpar o prazo. Tente novamente.",
      });
    } finally {
      setAGuardarPrazo(false);
    }
  };

  // A mensagem também se copia — para quem prefere colar na conversa já
  // aberta. O texto é o MESMO do botão de abrir (a garantia vive na lib).
  const copiarMensagemPrazo = async () => {
    if (!mensagemPrazo) return;
    try {
      await navigator.clipboard.writeText(mensagemPrazo);
      setErro((e) => (e?.zona === "sinal" ? null : e));
      setCopiadoMsgPrazo(true);
      setTimeout(() => setCopiadoMsgPrazo(false), 2500);
    } catch (e) {
      console.error(e);
      // Sem número válido da cliente o botão do WhatsApp nem existe —
      // apontar-lhe seria mandar procurar um botão que não está lá.
      setErro({
        zona: "sinal",
        mensagem: ligacaoPrazo
          ? "Não foi possível copiar automaticamente. Abra pelo botão do WhatsApp — a mensagem vai lá escrita."
          : "Não foi possível copiar automaticamente. Tente novamente.",
      });
    }
  };

  const limparConfirmacao = async () => {
    if (aLimparConf || !confirmacaoSinal) return;
    setALimparConf(true);
    setErro(null);
    try {
      // Anula com assinatura (nunca apaga) — e é idempotente na lib: se
      // outra janela a limpou primeiro, o refetch conta a verdade.
      await limparConfirmacaoSinal(confirmacaoSinal.id);
      setConfirmaLimparConf(false);
      setRecarga((x) => x + 1);
    } catch (e) {
      console.error(e);
      setErro({
        zona: "sinal",
        mensagem: "Não foi possível limpar a confirmação. Tente novamente.",
      });
    } finally {
      setALimparConf(false);
    }
  };

  // Os pedidos que precisam dela: por emitir, ou emitidos por usar (o
  // código fica à vista para reenviar). Os já usados são trilho, não fila.
  const pedidosVivos = pedidos.filter(
    (p) =>
      !p.usado_em &&
      (!p.emitido_em || (p.expira_em && new Date(p.expira_em) > new Date())),
  );

  const aviso = oQueElaVaiVer(evento.fase);

  // As zonas de erro presentes NESTE render: se a secção do erro já não
  // está montada (ex.: o refetch levou-a), o parágrafo do fundo apanha-o
  // — um erro nunca pode desaparecer só porque a secção desapareceu.
  const zonasMontadas = new Set();
  if (estado === "pronto") {
    zonasMontadas.add("porta");
    if (acesso) {
      zonasMontadas.add("fecho");
      if (docs.length > 0) zonasMontadas.add("documentos");
      if (pedidosVivos.length > 0) zonasMontadas.add("codigos");
      if (pedidosQ.length > 0) zonasMontadas.add("questionario");
      if (papelPorConfirmar) zonasMontadas.add("papel");
      // A zona conta como montada só quando o ErroDaZona dela está mesmo
      // pintado — na variante «falta a 083» (sinalInfo null) a secção
      // existe mas sem parágrafo de erro, e um erro órfão tem de cair no
      // apanha-tudo do fundo, nunca desaparecer.
      if (orcamentoNoAr && sinalInfo) zonasMontadas.add("sinal");
    }
  }

  return (
    <>
      <p style={overline}>Acompanhamento</p>
      <p
        style={{
          fontSize: "16px",
          fontWeight: "600",
          color: "var(--charcoal)",
          margin: "8px 0 0",
        }}
      >
        A página que a cliente pode acompanhar
      </p>
      <p
        style={{
          fontSize: "12.5px",
          lineHeight: 1.6,
          color: "var(--gray-mid)",
          margin: "6px 0 0",
        }}
      >
        Mostra o percurso do evento — o que já aconteceu e o que vem a seguir.
        Só mostra valores num documento que publicar, e apenas depois do
        código que lhe enviar. Nunca mostra moradas exactas nem notas
        internas.
      </p>

      {estado === "a-carregar" && (
        <div style={{ marginTop: "20px" }}>
          <Esqueleto w="100%" h={44} r={10} style={{ marginBottom: "10px" }} />
          <Esqueleto w={220} h={12} />
        </div>
      )}

      {estado === "erro" && (
        <p
          style={{
            marginTop: "20px",
            fontSize: "12.5px",
            lineHeight: 1.6,
            color: "#B91C1C",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "10px",
            padding: "12px 14px",
          }}
        >
          Não foi possível saber se este evento já tem acompanhamento aberto.
          Verifique a ligação, feche e volte a abrir esta janela.
        </p>
      )}

      {estado === "pronto" && !acesso && (
        <>
          {aviso && (
            <p
              style={{
                marginTop: "18px",
                fontSize: "12px",
                lineHeight: 1.65,
                color: "#92400E",
                backgroundColor: "#FEF3E2",
                border: "1px solid #F0D9B5",
                borderRadius: "10px",
                padding: "12px 14px",
              }}
            >
              {aviso}
            </p>
          )}
          <button
            onClick={abrir}
            disabled={aTrabalhar}
            style={{
              ...botao,
              marginTop: "18px",
              width: "100%",
              border: "none",
              backgroundColor: "var(--gold)",
              color: "white",
              opacity: aTrabalhar ? 0.6 : 1,
              cursor: aTrabalhar ? "wait" : "pointer",
            }}
          >
            {aTrabalhar ? "A abrir…" : "Abrir o acompanhamento"}
          </button>
          <ErroDaZona erro={erro} zona="porta" />
          <p
            style={{
              fontSize: "11.5px",
              lineHeight: 1.6,
              color: "var(--gray-mid)",
              margin: "10px 0 0",
            }}
          >
            Gera uma ligação só deste evento, para lhe enviar. Pode fechá-la a
            qualquer momento.
          </p>
        </>
      )}

      {estado === "pronto" && acesso && (
        <>
          <div
            style={{
              marginTop: "18px",
              display: "flex",
              gap: "8px",
              alignItems: "stretch",
            }}
          >
            <input
              readOnly
              value={endereco || ""}
              onFocus={(e) => e.target.select()}
              style={{
                flex: 1,
                minWidth: 0,
                border: "1.5px solid var(--gold-light)",
                borderRadius: "10px",
                padding: "10px 12px",
                fontSize: "12.5px",
                fontFamily: "inherit",
                color: "var(--charcoal)",
                backgroundColor: "var(--branco-quente, #FDFBF5)",
                boxSizing: "border-box",
              }}
            />
            <button
              onClick={copiar}
              style={{
                ...botao,
                border: "none",
                backgroundColor: copiado ? "#166534" : "var(--gold)",
                color: "white",
                transition: "background-color 140ms ease",
              }}
            >
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>
          <ErroDaZona erro={erro} zona="porta" />

          {/* O SINAL DE VIDA. É o que lhe diz se vale a pena insistir com a
              cliente ou se ela já lá esteve. */}
          <p
            style={{
              fontSize: "12px",
              lineHeight: 1.7,
              color: "var(--gray-mid)",
              margin: "14px 0 0",
            }}
          >
            {!acesso.n_acessos ? (
              <>
                <strong style={{ color: "var(--charcoal)", fontWeight: 600 }}>
                  Ainda não foi aberta.
                </strong>{" "}
                Depois de a enviar, aparece aqui quando ela lá for.
              </>
            ) : (
              // «Visita», não «vez»: o servidor conta VISITAS — aberturas
              // seguidas na mesma meia hora são uma só (a janela da 054,
              // que protege as novidades e o sinal de vida). Dizer
              // «aberta X vezes» prometia um contador de cliques e fazia
              // a contagem parecer avariada a quem recarrega a testar.
              <>
                <strong style={{ color: "var(--charcoal)", fontWeight: 600 }}>
                  {acesso.n_acessos === 1
                    ? "Uma visita."
                    : `${acesso.n_acessos} visitas.`}
                </strong>
                {acesso.ultimo_acesso_em && (
                  <> A última foi a {dataHora(acesso.ultimo_acesso_em)}.</>
                )}{" "}
                <span style={{ color: "#9B9B9B" }}>
                  Aberturas seguidas na mesma meia hora contam como uma.
                </span>
              </>
            )}
          </p>

          {acesso.expira_em && (
            <p
              style={{
                fontSize: "11.5px",
                color: "var(--gray-mid)",
                margin: "6px 0 0",
              }}
            >
              A ligação deixa de abrir a partir de {dataHora(acesso.expira_em)}.
            </p>
          )}

          {/* ── OS DOCUMENTOS NO ACOMPANHAMENTO ──────────────────────────
              Publicar é o acto que substituiu a caixa «enviado»: congela um
              instantâneo, mostra-o à cliente e carimba o envio. O que ela
              vê é o que foi publicado — nunca o documento vivo. */}
          {docs.length > 0 && (
            <div
              style={{
                marginTop: "20px",
                paddingTop: "16px",
                borderTop: "1px solid var(--hairline, #F0E6D0)",
              }}
            >
              <p style={{ ...overline, marginBottom: "10px" }}>
                Documentos no acompanhamento
              </p>
              {["orcamento", "proposta", "contrato"].map((tipo) => {
                const doc = docs.find((d) => d.tipo === tipo);
                if (!doc) return null;
                const pub = pubs.find((p) => p.tipo === tipo) || null;
                const actos = (pub?.portal_actos || [])
                  .slice()
                  .sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1));
                const acto = actos[0] || null;
                const trancado = !!doc.trancado_em;

                return (
                  <div
                    key={tipo}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      flexWrap: "wrap",
                      padding: "9px 0",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p
                        style={{
                          fontSize: "13px",
                          fontWeight: "600",
                          color: "var(--charcoal)",
                          margin: 0,
                        }}
                      >
                        {ROTULO_DOCUMENTO[tipo]}
                      </p>
                      <p
                        style={{
                          fontSize: "11.5px",
                          lineHeight: 1.55,
                          color: trancado ? "#166534" : "var(--gray-mid)",
                          margin: "2px 0 0",
                        }}
                      >
                        {trancado
                          ? `Assinado e trancado a ${dataHora(doc.trancado_em)} — não se altera; um erro resolve-se com contrato novo.`
                          : !pub
                            ? "Ainda não publicado — a cliente não o vê."
                            : acto?.acto === "assinou"
                              ? `Assinado por ${acto.nome_escrito} a ${dataHora(acto.criado_em)}.`
                              : acto?.acto === "aceitou"
                                ? `${tipo === "proposta" ? "Aprovado" : "Aceite"} por ${acto.nome_escrito} a ${dataHora(acto.criado_em)}.`
                                : acto?.acto === "pediu_alteracao"
                                  ? `Pediu uma alteração a ${dataHora(acto.criado_em)} — versão ${pub.versao} à espera de resposta.`
                                  : `Publicado a ${dataHora(pub.publicado_em)} · versão ${pub.versao}.`}
                      </p>
                      {/* A leitura das condições — o facto que a fase do
                          sinal acrescentou: antes de responder, a cliente
                          confirma que leu as condições, e a confirmação
                          fica aqui, junto dos outros factos do orçamento.
                          Uma vez por evento, nunca por versão. Sem leitura
                          e com orçamento no ar, diz-se em tom apagado —
                          informação, nunca cobrança. */}
                      {tipo === "orcamento" && pub && (
                        <p
                          style={{
                            fontSize: "11.5px",
                            lineHeight: 1.55,
                            color: condicoesLidasEm ? "var(--gray-mid)" : "#9B9B9B",
                            margin: "2px 0 0",
                          }}
                        >
                          {condicoesLidasEm
                            ? `Condições confirmadas a ${dataHora(condicoesLidasEm)}.`
                            : "Condições por confirmar"}
                        </p>
                      )}
                      {/* As palavras DELA têm de chegar aqui inteiras —
                          um pedido de alteração que ninguém lê é um acto
                          surdo. Itálico porque é citação dela. */}
                      {acto?.acto === "pediu_alteracao" && acto.mensagem && (
                        <p
                          style={{
                            fontSize: "12px",
                            lineHeight: 1.6,
                            fontStyle: "italic",
                            color: "var(--charcoal)",
                            margin: "6px 0 0",
                            whiteSpace: "pre-line",
                          }}
                        >
                          {acto.mensagem}
                        </p>
                      )}
                    </div>
                    {!trancado && (
                      <button
                        onClick={() => publicar(tipo)}
                        disabled={aTrabalhar}
                        style={{
                          ...botao,
                          padding: "7px 13px",
                          fontSize: "11.5px",
                          border: "1px solid var(--gold)",
                          backgroundColor: "white",
                          color: "var(--gold-dark)",
                          opacity: aTrabalhar ? 0.6 : 1,
                          cursor: aTrabalhar ? "wait" : "pointer",
                          flexShrink: 0,
                        }}
                      >
                        {pub ? "Publicar versão nova" : "Publicar no acompanhamento"}
                      </button>
                    )}
                  </div>
                );
              })}
              <ErroDaZona erro={erro} zona="documentos" />
              <p
                style={{
                  fontSize: "11px",
                  lineHeight: 1.6,
                  color: "#9B9B9B",
                  margin: "6px 0 0",
                }}
              >
                Publicar uma versão nova reabre a resposta da cliente: o
                aceite vale para a versão que ela viu, não para o documento.
              </p>
            </div>
          )}

          {/* ── O SINAL (083) ────────────────────────────────────────────
              Só com orçamento publicado: antes disso não há valor aceite
              nem sinal para combinar — a secção seria uma pergunta sem
              chão. Três peças, pela ordem do fluxo real:
              (1) a CONFIG da forma de pagamento — o que a cliente vê ao
                  dizer «quero pagar o sinal»; vazio, o portal usa os
                  dados da casa;
              (2) o PRAZO — «guardado para si até…», gesto da Nádia, com
                  o WhatsApp pré-escrito no tom da casa (o sistema nunca
                  envia sozinho);
              (3) a CONFIRMAÇÃO viva — o «já paguei» dela, à espera do
                  registo ou da limpeza.
              Degradação graciosa: sinalInfo null = a 083 falta (diz-se
              porquê); undefined = tropeço transitório (cala-se — mentir
              «falta a migração» seria pior). */}
          {orcamentoNoAr && sinalInfo !== undefined && (
            <div
              style={{
                marginTop: "20px",
                paddingTop: "16px",
                borderTop: "1px solid var(--hairline, #F0E6D0)",
              }}
            >
              <p style={{ ...overline, marginBottom: "8px" }}>
                O sinal — como se paga neste evento
              </p>
              {sinalInfo === null ? (
                <p
                  style={{
                    fontSize: "12px",
                    lineHeight: 1.6,
                    color: "var(--gray-mid)",
                    margin: 0,
                  }}
                >
                  A configuração do sinal fica disponível depois de a
                  migração 083 correr nesta base de dados.
                </p>
              ) : (
                <>
                  <p
                    style={{
                      fontSize: "12px",
                      lineHeight: 1.6,
                      color: "var(--gray-mid)",
                      margin: 0,
                    }}
                  >
                    É isto que a cliente encontra quando disser «quero pagar
                    o sinal».
                  </p>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "6px",
                      marginTop: "10px",
                    }}
                  >
                    {OPCOES_SINAL.map(([valor, rotulo]) => {
                      const ativa = metodoSinal === valor;
                      return (
                        <button
                          key={valor}
                          onClick={() => setMetodoSinal(valor)}
                          style={{
                            ...botao,
                            padding: "8px 14px",
                            border: ativa
                              ? "1.5px solid var(--gold)"
                              : "1.5px solid var(--gold-light)",
                            backgroundColor: ativa ? "var(--gold)" : "white",
                            color: ativa ? "white" : "var(--gold-dark)",
                          }}
                        >
                          {rotulo}
                        </button>
                      );
                    })}
                  </div>

                  {metodoSinal === "mbway_iban" && (
                    <>
                      <label
                        style={{
                          display: "block",
                          fontSize: "10px",
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                          color: "var(--gray-mid)",
                          margin: "10px 0 4px",
                        }}
                      >
                        MB Way
                        <input
                          type="text"
                          value={mbwaySinal}
                          onChange={(e) => setMbwaySinal(e.target.value)}
                          placeholder="Vazio — a casa ainda não tem MB Way; fica só o IBAN"
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            marginTop: "4px",
                            padding: "9px 12px",
                            borderRadius: "10px",
                            border: "1.5px solid var(--gold-light)",
                            fontSize: "12.5px",
                            fontFamily: "inherit",
                            letterSpacing: "normal",
                            textTransform: "none",
                            color: "var(--charcoal)",
                            backgroundColor: "var(--branco-quente, #FDFBF5)",
                            outline: "none",
                          }}
                        />
                      </label>
                      <label
                        style={{
                          display: "block",
                          fontSize: "10px",
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                          color: "var(--gray-mid)",
                          margin: "10px 0 4px",
                        }}
                      >
                        IBAN
                        <input
                          type="text"
                          value={ibanSinal}
                          onChange={(e) => setIbanSinal(e.target.value)}
                          placeholder={`Vazio — usa o da casa (${EMPRESA.iban})`}
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            marginTop: "4px",
                            padding: "9px 12px",
                            borderRadius: "10px",
                            border: "1.5px solid var(--gold-light)",
                            fontSize: "12.5px",
                            fontFamily: "inherit",
                            letterSpacing: "normal",
                            textTransform: "none",
                            color: "var(--charcoal)",
                            backgroundColor: "var(--branco-quente, #FDFBF5)",
                            outline: "none",
                          }}
                        />
                      </label>
                    </>
                  )}

                  {metodoSinal === "conversa" && (
                    <p
                      style={{
                        fontSize: "11.5px",
                        lineHeight: 1.6,
                        color: "var(--gray-mid)",
                        margin: "10px 0 0",
                      }}
                    >
                      O portal entrega a cliente à conversa de WhatsApp com a
                      mensagem já escrita — sem caixa de «já paguei»: o canal
                      é a própria conversa.
                    </p>
                  )}

                  {(metodoSinal === "dinheiro" || metodoSinal === "outra") && (
                    <label
                      style={{
                        display: "block",
                        fontSize: "10px",
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        color: "var(--gray-mid)",
                        margin: "10px 0 4px",
                      }}
                    >
                      A instrução, nas suas palavras
                      <textarea
                        value={instrucaoSinal}
                        onChange={(e) => setInstrucaoSinal(e.target.value)}
                        rows={3}
                        placeholder="Combinamos a entrega num café da Ericeira ou em nossa casa — diga-nos o dia que lhe dá jeito."
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          marginTop: "4px",
                          padding: "9px 12px",
                          borderRadius: "10px",
                          border: "1.5px solid var(--gold-light)",
                          fontSize: "12.5px",
                          lineHeight: 1.6,
                          fontFamily: "inherit",
                          letterSpacing: "normal",
                          textTransform: "none",
                          color: "var(--charcoal)",
                          backgroundColor: "var(--branco-quente, #FDFBF5)",
                          outline: "none",
                          resize: "vertical",
                        }}
                      />
                    </label>
                  )}

                  <button
                    onClick={guardarFormaSinal}
                    disabled={aGuardarConfig}
                    style={{
                      ...botao,
                      marginTop: "10px",
                      border: "none",
                      backgroundColor: configGuardada
                        ? "#166534"
                        : "var(--gold)",
                      color: "white",
                      opacity: aGuardarConfig ? 0.6 : 1,
                      cursor: aGuardarConfig ? "wait" : "pointer",
                      transition: "background-color 140ms ease",
                    }}
                  >
                    {aGuardarConfig
                      ? "A guardar…"
                      : configGuardada
                        ? "Guardado"
                        : "Guardar a forma de pagamento"}
                  </button>
                  {metodoSinal === "mbway_iban" && (
                    <p
                      style={{
                        fontSize: "11px",
                        lineHeight: 1.6,
                        color: "#9B9B9B",
                        margin: "8px 0 0",
                      }}
                    >
                      Campos vazios usam os dados da casa — e sem MB Way da
                      casa registado, o portal mostra só o IBAN.
                    </p>
                  )}

                  {/* ── O PRAZO — «guardado para si até…» ──────────────
                      Um gesto da Nádia, nunca do sistema: só COM prazo é
                      que os clientes veem a disputa. Expira sozinho em
                      leitura, e mudar a data do evento dissolve-o. */}
                  <div style={{ marginTop: "16px" }}>
                    {prazoAtivo ? (
                      <>
                        <p
                          style={{
                            fontSize: "12.5px",
                            lineHeight: 1.6,
                            color: "var(--charcoal)",
                            margin: 0,
                          }}
                        >
                          O dia está guardado para esta cliente até{" "}
                          <strong>{dataCurta(prazoAtivo)}</strong> — o portal
                          dela mostra-o, e até lá mais ninguém paga o sinal
                          desta data pelo portal.
                        </p>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "6px",
                            marginTop: "9px",
                          }}
                        >
                          {ligacaoPrazo && (
                            <a
                              href={ligacaoPrazo}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                ...botao,
                                display: "inline-block",
                                padding: "7px 13px",
                                fontSize: "11.5px",
                                border: "none",
                                backgroundColor: "var(--gold)",
                                color: "white",
                                textDecoration: "none",
                              }}
                            >
                              Avisá-la pelo WhatsApp
                            </a>
                          )}
                          <button
                            onClick={copiarMensagemPrazo}
                            style={{
                              ...botao,
                              padding: "7px 13px",
                              fontSize: "11.5px",
                              border: "1px solid var(--gold)",
                              backgroundColor: copiadoMsgPrazo
                                ? "#166534"
                                : "white",
                              color: copiadoMsgPrazo
                                ? "white"
                                : "var(--gold-dark)",
                              transition: "background-color 140ms ease",
                            }}
                          >
                            {copiadoMsgPrazo ? "Copiada" : "Copiar a mensagem"}
                          </button>
                          <button
                            onClick={() => gravarPrazo(null)}
                            disabled={aGuardarPrazo}
                            style={{
                              ...botao,
                              padding: "7px 13px",
                              fontSize: "11.5px",
                              border: "1px solid var(--hairline, #F0E6D0)",
                              backgroundColor: "white",
                              color: "var(--gray-mid)",
                              opacity: aGuardarPrazo ? 0.6 : 1,
                              cursor: aGuardarPrazo ? "wait" : "pointer",
                            }}
                          >
                            {aGuardarPrazo ? "A limpar…" : "Limpar o prazo"}
                          </button>
                        </div>
                        <p
                          style={{
                            fontSize: "11px",
                            lineHeight: 1.6,
                            color: "#9B9B9B",
                            margin: "8px 0 0",
                          }}
                        >
                          A mensagem já vai escrita no tom da casa — o envio é
                          sempre um gesto seu, nunca do sistema.
                        </p>
                      </>
                    ) : (
                      <>
                        <label
                          style={{
                            display: "block",
                            fontSize: "10px",
                            letterSpacing: "0.05em",
                            textTransform: "uppercase",
                            color: "var(--gray-mid)",
                            margin: "0 0 4px",
                          }}
                        >
                          Guardar o dia para esta cliente até…
                        </label>
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "stretch",
                          }}
                        >
                          <input
                            type="date"
                            value={prazoInput}
                            onChange={(e) => setPrazoInput(e.target.value)}
                            min={hojeISO}
                            max={evento.data_evento || undefined}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              boxSizing: "border-box",
                              padding: "9px 12px",
                              borderRadius: "10px",
                              border: "1.5px solid var(--gold-light)",
                              fontSize: "12.5px",
                              fontFamily: "inherit",
                              color: "var(--charcoal)",
                              backgroundColor: "var(--branco-quente, #FDFBF5)",
                              outline: "none",
                            }}
                          />
                          <button
                            onClick={() => {
                              if (!prazoInput) {
                                setErro({
                                  zona: "sinal",
                                  mensagem:
                                    "Escolha a data até quando o dia fica guardado.",
                                });
                                return;
                              }
                              gravarPrazo(prazoInput);
                            }}
                            disabled={aGuardarPrazo}
                            style={{
                              ...botao,
                              border: "1px solid var(--gold)",
                              backgroundColor: "white",
                              color: "var(--gold-dark)",
                              opacity: aGuardarPrazo ? 0.6 : 1,
                              cursor: aGuardarPrazo ? "wait" : "pointer",
                              flexShrink: 0,
                            }}
                          >
                            {aGuardarPrazo ? "A guardar…" : "Guardar o prazo"}
                          </button>
                        </div>
                        <p
                          style={{
                            fontSize: "11px",
                            lineHeight: 1.6,
                            color: "#9B9B9B",
                            margin: "8px 0 0",
                          }}
                        >
                          Sem prazo, os clientes não veem disputa nenhuma. Com
                          prazo, o portal desta cliente diz «guardado para si
                          até…» — e o pagamento do sinal fecha aos outros
                          interessados até essa data. Ao guardar, fica aqui a
                          mensagem de WhatsApp pronta a enviar.
                        </p>
                      </>
                    )}
                  </div>

                  {/* ── A CONFIRMAÇÃO VIVA — «ela disse que já pagou» ──
                      Nunca reserva o dia (quem carimba é o registo), mas
                      fecha o ecrã do sinal aos rivais enquanto estiver de
                      pé — é o instrumento contra quem confirma e nunca
                      paga: confere-se a conta e regista-se, ou limpa-se. */}
                  {confirmacaoSinal && (
                    <div
                      style={{
                        marginTop: "16px",
                        backgroundColor: "#FEF3E2",
                        border: "1px solid #F0D9B5",
                        borderRadius: "10px",
                        padding: "13px 14px",
                      }}
                    >
                      <p
                        style={{
                          fontSize: "13px",
                          fontWeight: "700",
                          lineHeight: 1.5,
                          color: "#92400E",
                          margin: "0 0 6px",
                        }}
                      >
                        ⚠ A cliente disse que já pagou o sinal
                      </p>
                      <p
                        style={{
                          fontSize: "12.5px",
                          lineHeight: 1.6,
                          color: "#92400E",
                          margin: 0,
                        }}
                      >
                        Em confirmação {emConfirmacaoHa(confirmacaoSinal.criadoEm)}
                        {confirmacaoSinal.metodo
                          ? ` — disse que enviou por ${confirmacaoSinal.metodo}`
                          : ""}
                        . Enquanto estiver de pé, fecha o pagamento do sinal
                        aos outros interessados. Confira a conta e registe o
                        pagamento — ou limpe a confirmação, se nada entrou.
                      </p>
                      {confirmaLimparConf ? (
                        <div style={{ marginTop: "10px" }}>
                          <p
                            style={{
                              fontSize: "11.5px",
                              lineHeight: 1.6,
                              color: "#92400E",
                              margin: 0,
                            }}
                          >
                            A cliente volta a ver o ecrã de pagamento, com uma
                            linha a dizer que a confirmação foi anulada. Nada
                            se apaga do registo.
                          </p>
                          <div
                            style={{
                              display: "flex",
                              gap: "8px",
                              marginTop: "9px",
                            }}
                          >
                            <button
                              onClick={limparConfirmacao}
                              disabled={aLimparConf}
                              style={{
                                ...botao,
                                padding: "6px 12px",
                                fontSize: "11.5px",
                                border: "none",
                                backgroundColor: "var(--gold)",
                                color: "white",
                                opacity: aLimparConf ? 0.6 : 1,
                                cursor: aLimparConf ? "wait" : "pointer",
                              }}
                            >
                              {aLimparConf ? "A limpar…" : "Limpar mesmo"}
                            </button>
                            <button
                              onClick={() => setConfirmaLimparConf(false)}
                              style={{
                                ...botao,
                                padding: "6px 12px",
                                fontSize: "11.5px",
                                border: "1px solid var(--hairline, #F0E6D0)",
                                backgroundColor: "white",
                                color: "var(--gray-mid)",
                              }}
                            >
                              Deixar estar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmaLimparConf(true)}
                          style={{
                            ...botao,
                            marginTop: "10px",
                            padding: "6px 12px",
                            fontSize: "11.5px",
                            border: "1px solid #D9A441",
                            backgroundColor: "white",
                            color: "#92400E",
                          }}
                        >
                          Limpar a confirmação
                        </button>
                      )}
                    </div>
                  )}

                  <ErroDaZona erro={erro} zona="sinal" />
                </>
              )}
            </div>
          )}

          {/* ── OS PEDIDOS DE CÓDIGO ─────────────────────────────────────
              A cliente pediu para ver os valores (ou para assinar). Emitir
              gera o código; o envio é dela para ela — pelo WhatsApp da
              conversa que já existe. A emissão fica no trilho de prova. */}
          {pedidosVivos.length > 0 && (
            <div
              style={{
                marginTop: "18px",
                backgroundColor: "#FEF3E2",
                border: "1px solid #F0D9B5",
                borderRadius: "10px",
                padding: "13px 14px",
              }}
            >
              <p style={{ ...overline, color: "#92400E", marginBottom: "8px" }}>
                {pedidosVivos.length === 1
                  ? "Pedido de código"
                  : `${pedidosVivos.length} pedidos de código`}
              </p>
              {pedidosVivos.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    flexWrap: "wrap",
                    padding: "5px 0",
                  }}
                >
                  <p
                    style={{
                      fontSize: "12px",
                      lineHeight: 1.5,
                      color: "#92400E",
                      margin: 0,
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    {/* 083 · o véu do orçamento morreu — o código ficou só
                        na assinatura; a queda sem contexto (pedidos
                        antigos) fala dela, não de valores. */}
                    {p.contexto && ROTULO_DOCUMENTO[p.contexto]
                      ? `Para abrir o ${ROTULO_DOCUMENTO[p.contexto].toLowerCase()}`
                      : "Para assinar o contrato"}{" "}
                    · {dataHora(p.pedido_em)}
                  </p>
                  {/* Às cinco tentativas erradas a base mata o código —
                      copiá-lo e enviá-lo seria mandar a cliente bater
                      numa porta fechada. A linha fica À VISTA (não se
                      remove em silêncio): é ela que explica porque é
                      que a cliente está encravada. */}
                  {(p.tentativas ?? 0) >= 5 ? (
                    <p
                      style={{
                        fontSize: "11.5px",
                        lineHeight: 1.5,
                        color: "#92400E",
                        margin: 0,
                        flexShrink: 0,
                        fontWeight: 600,
                      }}
                    >
                      Este código morreu às cinco tentativas — ela terá de
                      pedir outro.
                    </p>
                  ) : p.codigo && p.emitido_em ? (
                    <button
                      onClick={() => copiarCodigo(p.id, p.codigo)}
                      style={{
                        ...botao,
                        padding: "7px 13px",
                        fontSize: "13px",
                        letterSpacing: "0.12em",
                        fontVariantNumeric: "tabular-nums",
                        border: "none",
                        backgroundColor:
                          copiadoCodigo === p.id ? "#166534" : "var(--gold)",
                        color: "white",
                        flexShrink: 0,
                      }}
                      title="Copiar, para enviar pela conversa de WhatsApp"
                    >
                      {copiadoCodigo === p.id ? "Copiado" : p.codigo}
                    </button>
                  ) : (
                    <button
                      onClick={() => emitir(p.id)}
                      disabled={aTrabalhar}
                      style={{
                        ...botao,
                        padding: "7px 13px",
                        fontSize: "11.5px",
                        border: "none",
                        backgroundColor: "var(--gold)",
                        color: "white",
                        opacity: aTrabalhar ? 0.6 : 1,
                        cursor: aTrabalhar ? "wait" : "pointer",
                        flexShrink: 0,
                      }}
                    >
                      {aTrabalhar ? "A emitir…" : "Emitir código"}
                    </button>
                  )}
                </div>
              ))}
              <ErroDaZona erro={erro} zona="codigos" />
              <p
                style={{
                  fontSize: "11px",
                  lineHeight: 1.6,
                  color: "#92400E",
                  margin: "8px 0 0",
                }}
              >
                Envie o código pela conversa de WhatsApp que já tem com a
                cliente — é esse passo que confirma que é mesmo ela. Vale 24
                horas.
              </p>
            </div>
          )}

          {/* ── OS PEDIDOS DE ALTERAÇÃO AO QUESTIONÁRIO ─────────────────
              Uma resposta que já tinha fechado, e que ela quer mudar. Nada
              mudou sozinho — o valor está como estava.

              «Tratado» não muda a resposta: mudar a resposta é o briefing,
              e é outro gesto. Isto fecha o pedido e reabre a porta a um
              pedido novo ao mesmo campo — sem isto, a cliente ficava sem
              caminho depois do primeiro. */}
          {pedidosQ.length > 0 && (
            <div
              style={{
                marginTop: "18px",
                backgroundColor: "#FEF3E2",
                border: "1px solid #F0D9B5",
                borderRadius: "10px",
                padding: "13px 14px",
              }}
            >
              <p style={{ ...overline, color: "#92400E", marginBottom: "8px" }}>
                {pedidosQ.length === 1
                  ? "Pedido de alteração ao questionário"
                  : `${pedidosQ.length} pedidos de alteração ao questionário`}
              </p>
              {pedidosQ.map((p) => {
                const dadosMorada = moradaDoPedido(p);
                return (
                <div key={p.id} style={{ padding: "7px 0" }}>
                  <p style={{ fontSize: "11px", fontWeight: "600", letterSpacing: "0.04em", textTransform: "uppercase", color: "#92400E", margin: 0 }}>
                    {p.campo_label}
                  </p>
                  <p style={{ fontSize: "12.5px", lineHeight: 1.65, color: "var(--charcoal)", margin: "5px 0 0", whiteSpace: "pre-wrap" }}>
                    {p.pedido}
                  </p>

                  {/* ── A MORADA NUM TOQUE (074) ─────────────────────────
                      O pedido trouxe as cinco partes: mostra-se a morada
                      composta e aplica-se com um toque — escrita canónica
                      no briefing, com registo da equipa, e o pedido fecha
                      no mesmo gesto. Confirmação inline, como sempre. */}
                  {dadosMorada && (
                    <div style={{ marginTop: "8px", backgroundColor: "white", border: "1px solid #F0D9B5", borderRadius: "8px", padding: "10px 12px" }}>
                      <p style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.06em", textTransform: "uppercase", color: "#92400E", margin: 0 }}>
                        A morada nova
                      </p>
                      <p style={{ fontSize: "12.5px", lineHeight: 1.6, color: "var(--charcoal)", margin: "5px 0 0" }}>
                        {formatarMorada(dadosMorada)}
                      </p>
                      {confirmaMorada === p.id ? (
                        <div style={{ marginTop: "9px" }}>
                          <p style={{ fontSize: "11.5px", lineHeight: 1.6, color: "var(--gray-mid)", margin: 0 }}>
                            Escreve esta morada no briefing, com o registo da
                            equipa, e fecha o pedido. A resposta antiga fica no
                            trilho.
                          </p>
                          <div style={{ display: "flex", gap: "8px", marginTop: "9px" }}>
                            <button
                              onClick={() => aplicarMorada(p)}
                              disabled={aAplicarMorada}
                              style={{
                                ...botao,
                                padding: "6px 12px",
                                fontSize: "11.5px",
                                border: "none",
                                backgroundColor: "var(--gold)",
                                color: "white",
                                opacity: aAplicarMorada ? 0.6 : 1,
                                cursor: aAplicarMorada ? "wait" : "pointer",
                              }}
                            >
                              {aAplicarMorada ? "A aplicar…" : "Aplicar mesmo"}
                            </button>
                            <button
                              onClick={() => setConfirmaMorada(null)}
                              style={{
                                ...botao,
                                padding: "6px 12px",
                                fontSize: "11.5px",
                                border: "1px solid var(--hairline, #F0E6D0)",
                                backgroundColor: "white",
                                color: "var(--gray-mid)",
                              }}
                            >
                              Deixar estar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmaMorada(p.id)}
                          style={{
                            ...botao,
                            marginTop: "9px",
                            padding: "6px 12px",
                            fontSize: "11.5px",
                            border: "1px solid #D9A441",
                            backgroundColor: "white",
                            color: "#92400E",
                          }}
                        >
                          Aplicar esta morada
                        </button>
                      )}
                    </div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "7px" }}>
                    <span style={{ fontSize: "11px", color: "#92400E" }}>
                      {dataHora(p.pedido_em)}
                    </span>
                    <button
                      onClick={() => tratarPedido(p.id)}
                      disabled={aTrabalhar}
                      style={{
                        ...botao,
                        padding: "6px 12px",
                        fontSize: "11.5px",
                        border: "1px solid #D9A441",
                        backgroundColor: "white",
                        color: "#92400E",
                        opacity: aTrabalhar ? 0.6 : 1,
                        cursor: aTrabalhar ? "wait" : "pointer",
                      }}
                    >
                      Marcar como tratado
                    </button>
                  </div>
                </div>
                );
              })}
              <ErroDaZona erro={erro} zona="questionario" />
              <p style={{ fontSize: "11px", lineHeight: 1.6, color: "#92400E", margin: "9px 0 0" }}>
                Marcar como tratado não muda a resposta — muda-se no briefing,
                se ficar acordado. Só fecha o pedido e deixa a cliente voltar a
                pedir se precisar.
              </p>
            </div>
          )}

          {/* O rasto da morada aplicada — FORA da secção dos pedidos, porque
              o refetch leva o pedido da lista (e às vezes a secção inteira)
              e o que aconteceu tem de continuar dito. O aviso do orçamento
              informa, não bloqueia. */}
          {moradaAplicada && (
            <div style={{ marginTop: "14px" }}>
              <p style={{ fontSize: "12px", lineHeight: 1.6, color: "#166534", margin: 0 }}>
                Morada aplicada ao briefing — a resposta ficou com o registo da
                equipa.
              </p>
              {moradaAplicada.comOrcamento && (
                <p
                  style={{
                    fontSize: "12px",
                    lineHeight: 1.65,
                    color: "#92400E",
                    backgroundColor: "#FEF3E2",
                    border: "1px solid #F0D9B5",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    margin: "8px 0 0",
                  }}
                >
                  A deslocação do orçamento foi calculada com a morada antiga —
                  reveja o valor.
                </p>
              )}
            </div>
          )}

          {/* ── O CONTRATO ASSINADO EM PAPEL ─────────────────────────────
              A cliente descarregou, assinou à mão, fotografou e carregou.
              O portal prometeu-lhe «confirmamos e avisamos aqui» — é este
              o ecrã que cumpre a promessa. Confirmar deixa acto a sério no
              trilho (o nome que está no papel, quem confirmou, e a
              fotografia) e tranca o contrato, tal como o digital. */}
          {papelPorConfirmar && (
            <div
              style={{
                marginTop: "18px",
                backgroundColor: "#FEF3E2",
                border: "1px solid #F0D9B5",
                borderRadius: "10px",
                padding: "13px 14px",
              }}
            >
              <p style={{ ...overline, color: "#92400E", marginBottom: "8px" }}>
                Contrato assinado em papel
              </p>
              <p
                style={{
                  fontSize: "12px",
                  lineHeight: 1.6,
                  color: "#92400E",
                  margin: "0 0 10px",
                }}
              >
                Carregado a {dataHora(papelPorConfirmar.created_at)}. Veja a
                fotografia, escreva o nome tal como está assinado no papel, e
                confirme.
              </p>

              <button
                onClick={() => verPapel(papelPorConfirmar.dados?.caminho)}
                disabled={!papelPorConfirmar.dados?.caminho}
                style={{
                  ...botao,
                  padding: "7px 13px",
                  fontSize: "12px",
                  border: "1px solid #D9A441",
                  backgroundColor: "white",
                  color: "#92400E",
                  marginBottom: "10px",
                }}
              >
                Ver a fotografia
              </button>

              <input
                type="text"
                value={nomeNoPapel}
                onChange={(e) => setNomeNoPapel(e.target.value)}
                placeholder="Nome tal como está no papel"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "9px 11px",
                  fontSize: "13.5px",
                  fontFamily: "inherit",
                  color: "var(--charcoal, #1A1A1A)",
                  border: "1px solid #F0D9B5",
                  borderRadius: "8px",
                  backgroundColor: "white",
                  outline: "none",
                }}
              />
              <ErroDaZona erro={erro} zona="papel" />

              <button
                onClick={() => confirmarPapel(papelPorConfirmar.id)}
                disabled={aConfirmarPapel}
                style={{
                  ...botao,
                  marginTop: "9px",
                  border: "none",
                  backgroundColor: "var(--gold)",
                  color: "white",
                  opacity: aConfirmarPapel ? 0.6 : 1,
                  cursor: aConfirmarPapel ? "wait" : "pointer",
                }}
              >
                {aConfirmarPapel ? "A confirmar…" : "Confirmar a assinatura"}
              </button>

              <p
                style={{
                  fontSize: "11px",
                  lineHeight: 1.6,
                  color: "#92400E",
                  margin: "9px 0 0",
                }}
              >
                Depois de confirmar, o contrato fica trancado — nem aqui se
                muda. Se houver um erro, faz-se contrato novo.
              </p>
            </div>
          )}

          <div
            style={{
              marginTop: "20px",
              paddingTop: "16px",
              borderTop: "1px solid var(--hairline, #F0E6D0)",
            }}
          >
            {!aConfirmarFecho ? (
              <button
                onClick={() => setAConfirmarFecho(true)}
                style={{
                  ...botao,
                  border: "1px solid #FECACA",
                  backgroundColor: "white",
                  color: "#B91C1C",
                }}
              >
                Fechar o acompanhamento
              </button>
            ) : (
              // Confirmação NO PRÓPRIO ECRÃ, e a nomear o que fica de pé —
              // nunca window.confirm, e nunca um «tem a certeza?» que não
              // diz o que se perde.
              <div
                style={{
                  backgroundColor: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: "10px",
                  padding: "14px 16px",
                }}
              >
                <p
                  style={{
                    fontSize: "12.5px",
                    lineHeight: 1.65,
                    color: "#B91C1C",
                    margin: 0,
                  }}
                >
                  A ligação que enviou deixa de abrir, e ela passa a ver uma página
                  a dizer que já não está activa. O evento, os documentos e os
                  pagamentos ficam todos — não se apaga nada. Pode voltar a
                  abrir depois, mas a ligação nova é outra e terá de lha enviar
                  de novo.
                </p>
                <ErroDaZona erro={erro} zona="fecho" />
                <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                  <button
                    onClick={revogar}
                    disabled={aTrabalhar}
                    style={{
                      ...botao,
                      border: "none",
                      backgroundColor: "#B91C1C",
                      color: "white",
                      opacity: aTrabalhar ? 0.6 : 1,
                      cursor: aTrabalhar ? "wait" : "pointer",
                    }}
                  >
                    {aTrabalhar ? "A fechar…" : "Fechar mesmo"}
                  </button>
                  <button
                    onClick={() => setAConfirmarFecho(false)}
                    style={{
                      ...botao,
                      border: "1px solid var(--hairline, #F0E6D0)",
                      backgroundColor: "white",
                      color: "var(--gray-mid)",
                    }}
                  >
                    Manter aberto
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── OS COMUNICADOS QUE JÁ SAÍRAM PARA ESTE EVENTO ────────────
          O registo da equipa das «folhas da casa» que a cliente vê no
          portal (082) — que folha saiu, quando, e a porta para a ler.
          FORA do ramo do acesso de propósito: a folha viajou pela
          conversa de WhatsApp, e o envio aconteceu houvesse portal ou
          não. «Enviado», nunca «recebido»: o carimbo diz que a mensagem
          saiu, não que chegou nem que foi lida. Uma folha entretanto
          retirada fica na história SEM ligação — não se aponta ao vazio.
          Zero envios = zero secção. */}
      {estado === "pronto" && comunicados.length > 0 && (
        <div
          style={{
            marginTop: "20px",
            paddingTop: "16px",
            borderTop: "1px solid var(--hairline, #F0E6D0)",
          }}
        >
          <p style={{ ...overline, marginBottom: "4px" }}>
            Comunicados enviados
          </p>
          {comunicados.map((c) => (
            <p
              key={`${c.token || c.titulo}·${c.enviado_em}`}
              style={{
                fontSize: "12px",
                lineHeight: 1.7,
                color: "var(--gray-mid)",
                margin: "5px 0 0",
              }}
            >
              <span style={{ color: "var(--charcoal)", fontWeight: 600 }}>
                {c.titulo || "(sem título)"}
              </span>{" "}
              — enviado {diaDito(c.enviado_em)}
              {c.no_ar && (
                <>
                  {" · "}
                  {/* A folha é pública — abrir daqui conta como qualquer
                      leitor, e é essa a natureza dela (nada do cuidado
                      do dlm_portal_ver, que é sinal pessoal). */}
                  <a
                    href={`/comunicado/${c.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ligacao"
                    style={{
                      color: "var(--gold-dark)",
                      textDecoration: "underline",
                    }}
                  >
                    Ver a folha
                  </a>
                </>
              )}
            </p>
          ))}
        </div>
      )}

      {/* Último recurso: um erro cuja secção já não está montada (ou sem
          zona) pinta-se aqui — nunca pode simplesmente desaparecer. */}
      {erro && !zonasMontadas.has(erro.zona) && (
        <p
          style={{
            fontSize: "12.5px",
            color: "#B91C1C",
            margin: "14px 0 0",
          }}
        >
          {erro.mensagem}
        </p>
      )}

      <button
        onClick={onFechar}
        style={{
          ...botao,
          marginTop: "22px",
          width: "100%",
          border: "1px solid var(--hairline, #F0E6D0)",
          backgroundColor: "white",
          color: "var(--gray-mid)",
        }}
      >
        Fechar
      </button>
    </>
  );
}

export default function PortalDoClienteSheet({ evento, aberto, onFechar }) {
  const painelRef = useRef(null);
  const origemRef = useRef(null);

  // Escape fecha (sem roubar a tecla a um campo com o cursor lá dentro —
  // o padrão do SubmissionDrawer), o foco entra no painel ao abrir e
  // volta a quem abriu ao fechar.
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
      {aberto && evento && (
        <motion.div
          onClick={onFechar}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(26,26,26,0.32)",
            zIndex: 1000,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <motion.div
            ref={painelRef}
            role="dialog"
            aria-modal="true"
            aria-label="A página que a cliente pode acompanhar"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
            style={{
              backgroundColor: "white",
              width: "100%",
              maxWidth: "520px",
              borderRadius: "16px 16px 0 0",
              padding: "24px 24px 28px",
              boxShadow: "0 -8px 40px rgba(0,0,0,0.15)",
              maxHeight: "88vh",
              overflowY: "auto",
              boxSizing: "border-box",
            }}
          >
            <Conteudo evento={evento} onFechar={onFechar} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
