import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  submeterCaptacao,
  getTiposParaCaptacao,
  MAX_IMAGENS_REFERENCIA,
} from "../../lib/captacao";
import { supabase } from "../../lib/supabase";
import { registarErroFormulario } from "../../lib/errosForm";
import { irmaosDoDia } from "../../lib/disputaDia";
import AvisoDiaDisputado from "../AvisoDiaDisputado";
import { traduzirErroDaCasa } from "../../lib/errosDaCasa";
import { useRotas } from "../../lib/rotasAdmin";
import SeletorPacotes from "./SeletorPacotes";
import { pacotePorNome } from "./pacotesBuffet";
import { LOCALIDADES_ZONA } from "../../lib/localidades";

// ============================================================
// CaptacaoForm — os campos da captação, PARTILHADOS entre:
//   • a página pública /interesse (o interessado preenche)
//   • os modais "+ Registar pedido" (funil e Início)
//
// UM formulário, UMA verdade: os campos, labels e regras são os
// MESMOS em todas as portas (pedido explícito de consistência).
// Telemóvel é opcional (a conversa de Instagram é o canal — quem
// chega ao /interesse chegou pelo link enviado nessa conversa);
// a data do evento é obrigatória e exata.
//
// props:
//   onSubmetido(submission) — chamado após criar cliente + evento
//   textoBotao              — label do botão (default "Enviar pedido")
// ============================================================

const OPCOES_LOCAL = ["Ao domicílio", "Salão", "Quinta", "Exterior", "Outro"];
// ⚠ Renomear um rótulo aqui pede migração no mapa das avaliações:
// avaliacao_eixos aceita várias cadeias por eixo (desenho da 066), e a
// cadeia nova junta-se ao eixo sem perder o histórico. «Mesa do bolo da
// noiva» → «Mesa do bolo» foi a 087.
const OPCOES_SERVICOS = [
  "Mesa posta",
  "Buffet",
  "Cenário fotografável",
  "Mesa do bolo",
  "Balcão",
];
// Pacotes de buffet — escolha ÚNICA, aparecem ao selecionar "Buffet".
// A carta (nomes, preços, o que inclui) vive em pacotesBuffet.js e os
// cartões em SeletorPacotes.jsx; o detalhe (lotação) continua a fazer
// parte da resposta guardada, para a Nádia saber logo o pacote sem
// consultar tabela nenhuma.
const OPCOES_BALCAO = [
  "Welcome Drink",
  "Bar & Cocktail",
  "Doces",
  "Hambúrgueres & Cachorro",
];

export default function CaptacaoForm({
  tenantSlug = null,
  onSubmetido,
  textoBotao = "Enviar pedido",
  dataInicial = "",
  // R1 (109): as pontes dos popovers do Início trazem a morada/data já
  // escrita na consulta — a procura que se revelava ao telefone deixa
  // de evaporar (era «Não guarda nada — é só uma consulta»).
  localInicial = "",
  modoInterno = false,
  // Barra dourada (página pública /interesse): esconde o botão
  // interno e reporta o progresso dos obrigatórios ao exterior
  ocultarBotao = false,
  onProgresso,
  registarSubmeter,
  // Porta pública: a experiência por CAPÍTULOS (revelação progressiva
  // — um aberto de cada vez, os feitos recolhem para linhas-resumo).
  // O interno fica PLANO: a Nádia transcreve leads à velocidade dela.
  porCapitulos = false,
}) {
  const rotas = useRotas();
  // ------------------------------------------------------------
  // A CASA DO PEDIDO — e de onde vem cada uma.
  //
  // PÚBLICO: do endereço /interesse/:slug, que chega por prop. É a
  // porta da 093, e não há sessão para confirmar coisa nenhuma.
  //
  // INTERNO (108): da ROTA do backoffice. Até aqui ia `null` e o
  // servidor caía no `tenant_actual()` — que com duas memberships
  // escolhia a mais antiga em SILÊNCIO, e o interessado nascia na casa
  // errada. Agora o slug viaja, e o `captacao_submeter` confirma-o
  // contra a membership (recusa com CASA_ERRADA se não for de quem
  // pede).
  //
  // Vem da rota e NÃO por prop, de propósito: são três modais a montar
  // este mesmo formulário (Início, Funil, Agenda). Um quarto que
  // aparecesse sem a passar repetia à letra a regressão da 093 — o
  // select dos modelos desapareceu em silêncio, durante semanas,
  // porque ninguém se lembrou de passar o slug.
  // ------------------------------------------------------------
  const casaDoPedido = modoInterno ? rotas.casa || null : tenantSlug;

  const [tipos, setTipos] = useState([]);
  const [nome, setNome] = useState("");
  const [contacto, setContacto] = useState("");
  const [whatsapp, setWhatsapp] = useState(""); // canal de comunicação — obrigatório
  const [eventTypeId, setEventTypeId] = useState("");
  const [tipoOutro, setTipoOutro] = useState("");
  const [dataEvento, setDataEvento] = useState(dataInicial || "");
  const [numeroConvidados, setNumeroConvidados] = useState("");
  const [local, setLocal] = useState(localInicial || ""); // texto livre (ex: Cascais)
  const [canalOrigem, setCanalOrigem] = useState(""); // como nos conheceu (opcional)
  const [localTipo, setLocalTipo] = useState(""); // tipo de espaço
  const [localOutro, setLocalOutro] = useState("");
  const [servicos, setServicos] = useState([]);
  const [buffet, setBuffet] = useState(""); // pacote escolhido (um só)
  const [balcao, setBalcao] = useState([]);
  // [{ file, url }] — o objectURL nasce ao escolher e revoga-se ao
  // remover/desmontar (criá-lo no render vazava um URL por tecla).
  const [ficheiros, setFicheiros] = useState([]);
  const [mensagem, setMensagem] = useState("");
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [erroGeral, setErroGeral] = useState(null);
  // Aviso de deduplicação (SÓ no modo interno — a página pública fica
  // muda de propósito: revelar que um número já existe seria fuga de
  // privacidade). { tipo: "duplicado"|"reutilizado", submission }
  const [avisoDedupe, setAvisoDedupe] = useState(null);
  // A disputa da data escolhida — eventos vivos + reservas provisórias
  // do mesmo dia (Bloco 4; absorve a decisão pendente de 30/07). SÓ no
  // modo interno: a página pública nunca consulta nem revela a agenda
  // — dia disputado ≠ indisponível, e o aviso é para os olhos da Nádia
  // (decisão de 09/08). Guarda-se {data, irmaos} e só se pinta quando
  // a data guardada É a data actual do campo: uma resposta atrasada de
  // uma data antiga nunca aparece, e mudar a data apaga o aviso sem
  // precisar de limpeza síncrona no efeito.
  const [disputaDia, setDisputaDia] = useState(null);
  const inputImagens = useRef(null);
  // O capítulo aberto (0..3) — só usado com porCapitulos.
  const [capitulo, setCapitulo] = useState(0);
  // Espelho para o cleanup de desmontagem (um cleanup com deps []
  // capturaria a lista inicial e deixava URLs vivos por revogar).
  const ficheirosRef = useRef(ficheiros);
  useEffect(() => {
    ficheirosRef.current = ficheiros;
  }, [ficheiros]);
  useEffect(
    () => () => {
      for (const f of ficheirosRef.current) URL.revokeObjectURL(f.url);
    },
    [],
  );

  useEffect(() => {
    // UMA porta para a lista, agora que as duas bocas têm slug (108).
    // Eram duas — a pública com slug e uma de dentro sem ele — e a de
    // dentro devolvia os modelos de TODAS as casas da sessão. Ver o
    // obituário dela em lib/captacao.js.
    //
    // ⚠ A REDE, e a lição que a paga: sem slug esta chamada devolve
    // [] e o formulário degrada para texto livre — foi assim que o
    // select dos modelos desapareceu na 093 e ninguém deu por isso
    // durante semanas. Se um modal novo montar isto fora de
    // /admin/:casa, o aviso sai aqui em vez de o silêncio voltar.
    if (modoInterno && !casaDoPedido) {
      console.error(
        "CaptacaoForm em modo interno sem casa na rota: o select dos modelos vai ficar vazio.",
      );
    }
    getTiposParaCaptacao(casaDoPedido).then(setTipos);
  }, [casaDoPedido, modoInterno]);

  // Consulta a disputa quando a data muda — com um debounce leve (o
  // input de data dispara a meio da escrita).
  //
  // 104 · A lib deixou de engolir: `[]` é resposta («não há disputa»),
  // uma falha é outra coisa e chega aqui como excepção. Marca-se
  // `falhou` em vez de a confundir com o vazio — sem isto, não conseguir
  // perguntar e não haver rival nenhum eram a mesma coisa no ecrã.
  useEffect(() => {
    if (!modoInterno || !/^\d{4}-\d{2}-\d{2}$/.test(dataEvento || "")) {
      return undefined;
    }
    let cancelado = false;
    const temporizador = setTimeout(async () => {
      try {
        const lista = await irmaosDoDia(dataEvento);
        if (!cancelado) setDisputaDia({ data: dataEvento, irmaos: lista || [] });
      } catch (e) {
        console.error("Não foi possível verificar a disputa do dia:", e);
        if (!cancelado)
          setDisputaDia({ data: dataEvento, irmaos: [], falhou: true });
      }
    }, 350);
    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [modoInterno, dataEvento]);

  // Os irmãos VÁLIDOS para a data que está no campo agora — [] se a
  // consulta guardada for de outra data (ou não houver nenhuma).
  const daDataActual = disputaDia && disputaDia.data === dataEvento;
  const irmaosDia = daDataActual ? disputaDia.irmaos : [];
  // A consulta desta data não chegou ao fim (104) — diz-se, em vez de
  // deixar o silêncio passar por «não há disputa».
  const falhouDia = !!daDataActual && !!disputaDia.falhou;

  // Nº de convidados: obrigatório na porta PÚBLICA — o orçamento
  // depende da lotação — EXCEPTO quando o pedido é SÓ o cenário
  // fotografável, o único serviço que não se vende ao convidado. Na
  // porta interna fica livre: a Nádia transcreve leads de Instagram e
  // nem sempre sabe já o número (o mesmo racional da regra dos 9
  // dígitos do contacto).
  const pedidoSoCenario =
    !!localTipo &&
    servicos.length === 1 &&
    servicos[0] === "Cenário fotografável";
  const convidadosObrigatorios = !modoInterno && !pedidoSoCenario;

  // O rótulo da barra é a PRÓXIMA AÇÃO — progresso comunicado pelo
  // que vem a seguir, não pelo que falta. (Vive antes do efeito do
  // progresso, que o leva nas deps.)
  const rotuloAcao = !porCapitulos
    ? null
    : [
        "Continuar: o evento →",
        "Continuar: espaço e inspiração →",
        "Rever o pedido →",
        "Enviar pedido",
      ][capitulo];

  // Progresso dos campos obrigatórios — alimenta a barra dourada da
  // página pública. O total é dinâmico: serviços (e balcão) só contam
  // depois de escolhido o espaço, tal como no validar().
  useEffect(() => {
    if (!onProgresso) return;
    const requisitos = [
      !!nome.trim(),
      !!contacto.trim(),
      !!((eventTypeId && eventTypeId !== "__outro__") || tipoOutro.trim()),
      !!dataEvento,
      !!localTipo && (localTipo !== "Outro" || !!localOutro.trim()),
    ];
    // O MESMO critério do validar() — barra cheia tem de significar
    // validação a passar ("0" não pode encher a barra e morrer no toque)
    if (convidadosObrigatorios)
      requisitos.push(
        !!numeroConvidados.trim() && Number(numeroConvidados) >= 1,
      );
    if (localTipo) {
      requisitos.push(servicos.length > 0);
      if (servicos.includes("Buffet")) requisitos.push(!!buffet);
      if (servicos.includes("Balcão")) requisitos.push(balcao.length > 0);
    }
    const feitos = requisitos.filter(Boolean).length;
    onProgresso({
      feitos,
      total: requisitos.length,
      completo: feitos === requisitos.length,
      enviando,
      capitulo,
      rotuloAcao,
    });
  }, [
    nome,
    contacto,
    eventTypeId,
    tipoOutro,
    dataEvento,
    numeroConvidados,
    convidadosObrigatorios,
    localTipo,
    localOutro,
    servicos,
    buffet,
    balcao,
    enviando,
    onProgresso,
    capitulo,
    rotuloAcao,
  ]);

  const toggleServico = (opt) => {
    setServicos((prev) => {
      const novo = prev.includes(opt)
        ? prev.filter((o) => o !== opt)
        : [...prev, opt];
      if (!novo.includes("Buffet")) setBuffet("");
      if (!novo.includes("Balcão")) setBalcao([]);
      return novo;
    });
    setErros((prev) => ({
      ...prev,
      servicos: undefined,
      buffet: undefined,
      balcao: undefined,
      // Mudar os serviços pode dispensar (ou voltar a exigir) o nº de
      // convidados — o erro antigo não pode ficar a apontar para nada
      convidados: undefined,
    }));
  };

  // Buffet: escolha ÚNICA — clicar noutro pacote troca; no mesmo tira.
  const toggleBuffet = (nome) => {
    setBuffet((prev) => (prev === nome ? "" : nome));
    setErros((prev) => ({ ...prev, buffet: undefined }));
  };

  // Balcão: escolha ÚNICA — clicar noutra troca; clicar na mesma tira.
  const toggleBalcao = (opt) => {
    setBalcao((prev) => (prev.includes(opt) ? [] : [opt]));
    setErros((prev) => ({ ...prev, balcao: undefined }));
  };

  const escolherImagens = (e) => {
    const novos = Array.from(e.target.files || []).filter((f) =>
      f.type.startsWith("image/"),
    );
    setFicheiros((prev) => {
      // só se criam URLs para o que CABE — criar e cortar vazava
      const espaco = Math.max(0, MAX_IMAGENS_REFERENCIA - prev.length);
      const aceites = novos
        .slice(0, espaco)
        .map((file) => ({ file, url: URL.createObjectURL(file) }));
      return [...prev, ...aceites];
    });
    e.target.value = ""; // permite escolher o mesmo ficheiro outra vez
  };

  const removerImagem = (idx) =>
    setFicheiros((prev) => {
      if (prev[idx]) URL.revokeObjectURL(prev[idx].url);
      return prev.filter((_, i) => i !== idx);
    });

  const calcularErros = () => {
    const e = {};
    if (!nome.trim()) e.nome = "Indica o nome.";
    if (!contacto.trim()) {
      e.contacto = "Indica o contacto principal.";
    } else if (!modoInterno && contacto.replace(/\D/g, "").length < 9) {
      // <9 dígitos úteis: o dedupe do Postgres não consegue comparar
      // (Lote 3A) e cada reenvio criava um cliente novo. Só na porta
      // PÚBLICA — na interna a Nádia transcreve leads de Instagram
      // ("insta: @vera") e bloqueá-la trocava um duplicado possível
      // por trabalho impossível.
      e.contacto =
        "O contacto precisa de pelo menos 9 dígitos (podes usar espaços ou indicativo).";
    }
    const temTipo =
      (eventTypeId && eventTypeId !== "__outro__") || tipoOutro.trim();
    if (!temTipo) e.tipo = "Escolhe o tipo de evento.";
    // Data do evento: obrigatória e exata (em todas as portas)
    if (!dataEvento) e.data = "Indica a data do evento.";
    if (
      convidadosObrigatorios &&
      (!numeroConvidados.trim() || Number(numeroConvidados) < 1)
    )
      e.convidados = "Indica o número de convidados.";
    if (!localTipo) e.espaco = "Escolhe o espaço onde vai ser realizado.";
    if (localTipo === "Outro" && !localOutro.trim())
      e.localOutro = "Descreve o local.";
    // Serviços só são pedidos (e obrigatórios) depois de escolhido o
    // "onde vai ser realizado" — é ele que revela a secção.
    if (localTipo) {
      if (servicos.length === 0) e.servicos = "Escolhe pelo menos uma opção.";
      if (servicos.includes("Buffet") && !buffet)
        e.buffet = "Escolhe o pacote de buffet.";
      if (servicos.includes("Balcão") && balcao.length === 0)
        e.balcao = "Escolhe o tipo de balcão.";
    }
    return e;
  };
  const validar = () => {
    const e = calcularErros();
    setErros(e);
    return Object.keys(e).length === 0;
  };

  // ---------- os capítulos (só na porta pública) ----------
  // Cada capítulo valida SÓ as suas chaves ao continuar — a pessoa
  // nunca vê erros de um capítulo onde ainda não esteve.
  const CHAVES_POR_CAPITULO = [
    ["nome", "contacto", "whatsapp"],
    ["tipo", "data", "convidados"],
    ["espaco", "localOutro", "servicos", "buffet", "balcao"],
  ];
  const errosDoCapitulo = (n, e) =>
    Object.fromEntries(
      Object.entries(e).filter(([k]) => CHAVES_POR_CAPITULO[n]?.includes(k)),
    );
  const capituloDoErro = (e) =>
    CHAVES_POR_CAPITULO.findIndex((chaves) => chaves.some((k) => e[k]));

  const avancarCapitulo = () => {
    const eCap = errosDoCapitulo(capitulo, calcularErros());
    if (Object.keys(eCap).length) {
      setErros(eCap);
      return;
    }
    setErros({});
    setCapitulo((c) => Math.min(c + 1, 3));
  };

  const submeter = async () => {
    setErroGeral(null);
    if (!validar()) return;
    setEnviando(true);
    try {
      const tipoReal =
        eventTypeId && eventTypeId !== "__outro__" ? eventTypeId : null;
      // Dois campos distintos: "local" (texto livre, ex: Cascais) vai
      // para a chave canónica localEvento; "tipoLocal" é o tipo de
      // espaço (ou a descrição, no caso do Outro)
      const tipoLocalFinal =
        localTipo === "Outro" ? `Outro: ${localOutro.trim()}` : localTipo;
      // O pacote vai com a lotação por extenso ("Supreme (até 35
      // convidados)") — resposta autoexplicativa em qualquer ecrã do
      // admin. "Personalizado (mais de 50 convidados)" também cá passa.
      const pacoteBuffet = pacotePorNome(buffet);
      const submission = await submeterCaptacao(
        {
          nome,
          contacto,
          whatsapp,
          eventTypeId: tipoReal,
          tipoOutro: tipoReal ? null : tipoOutro,
          dataEvento,
          numeroConvidados,
          local,
          tipoLocal: tipoLocalFinal,
          servicos: localTipo ? servicos : [],
          servicosBuffet:
            localTipo && servicos.includes("Buffet") && pacoteBuffet
              ? [`${pacoteBuffet.nome} (${pacoteBuffet.detalhe})`]
              : [],
          servicosBalcao:
            localTipo && servicos.includes("Balcão") ? balcao : [],
          canalOrigem,
          mensagem,
          ficheiros: ficheiros.map((f) => f.file),
        },
        casaDoPedido,
      );
      if (
        modoInterno &&
        (submission.duplicado || submission.clienteReutilizado)
      ) {
        // Não fecha já: primeiro conta à Nádia o que aconteceu — e A
        // QUEM ficou ligado (Lote 3A): um telefone com gralha que
        // coincida com outra pessoa só se apanha vendo o nome. O fetch
        // do nome é AUTENTICADO (só a porta interna cá chega; o
        // anónimo da porta pública nunca vê nomes — a RLS é a
        // fronteira) e best-effort.
        let nomeExistente = null;
        if (submission.cliente_id) {
          try {
            const { data: ficha } = await supabase
              .from("clientes")
              .select("nome")
              .eq("id", submission.cliente_id)
              .maybeSingle();
            nomeExistente = ficha?.nome || null;
          } catch (e) {
            console.warn("Sem nome da ficha reutilizada:", e?.message || e);
          }
        }
        setAvisoDedupe({
          tipo: submission.duplicado ? "duplicado" : "reutilizado",
          submission,
          nomeExistente,
        });
        setEnviando(false);
        return;
      }
      if (onSubmetido) onSubmetido(submission);
    } catch (err) {
      console.error(err);
      registarErroFormulario({
        origem: "captacao",
        erro: err,
        // A casa vem do endereço — o público da 093, o interno da 108.
        // Sem ela o erro fica sem dono e não se sabe de quem era o
        // pedido perdido. E o log carrega as RESPOSTAS: um log na casa
        // errada é dados pessoais na casa errada (emenda do Hélio,
        // 16/08), que é o que a 106 existiu para impedir.
        tenantSlug: casaDoPedido,
        contexto: { modoInterno: !!modoInterno, eventTypeId },
        respostas: {
          nome,
          contacto,
          whatsapp,
          dataEvento,
          numeroConvidados,
          local,
          tipoLocal: localTipo,
          servicos,
          buffet,
          balcao,
          mensagem,
        },
      });
      // O detalhe entre parênteses ficou — é o que permite diagnosticar
      // uma falha de rede sem pedir a consola a ninguém. O que saiu foi
      // o CODE-WORD cru: «CASA_ERRADA» não é português, e era o que
      // aparecia a quem submetesse com o slug de outra casa (108).
      const daCasa = traduzirErroDaCasa(err);
      if (daCasa) {
        setErroGeral(daCasa);
      } else {
        const detalhe = err?.message ? ` (${err.message})` : "";
        setErroGeral(
          `Não foi possível enviar o pedido. Verifica a ligação e tenta novamente.${detalhe}`,
        );
      }
    }
    setEnviando(false);
  };

  // Enviar a partir da revisão: valida TUDO — um erro num capítulo
  // anterior salta para lá em vez de acender vermelho fora do ecrã.
  const submeterComSalto = async () => {
    const eTodos = calcularErros();
    if (Object.keys(eTodos).length) {
      setErros(eTodos);
      const c = capituloDoErro(eTodos);
      if (c >= 0) setCapitulo(c);
      return;
    }
    await submeter();
  };

  // A ação da barra dourada: continuar capítulo a capítulo; no último,
  // enviar. (No modo plano continua a ser o submeter de sempre.)
  const acaoDaBarra = () => {
    if (!porCapitulos) return submeter();
    if (capitulo < 3) return avancarCapitulo();
    return submeterComSalto();
  };

  // Regista a ação para o botão externo (barra dourada).
  // Corre em cada render de propósito: garante que a barra chama
  // sempre a versão mais recente (sem closures velhas). Vive DEPOIS
  // das declarações — ler antes era acesso a const por declarar.
  useEffect(() => {
    if (registarSubmeter) registarSubmeter(acaoDaBarra);
  });

  if (avisoDedupe) {
    const duplicado = avisoDedupe.tipo === "duplicado";
    return (
      <div
        style={{
          backgroundColor: "#FEF9EC",
          border: "1.5px solid var(--gold-light)",
          borderRadius: "14px",
          padding: "20px 18px",
        }}
      >
        <p
          style={{
            fontSize: "15px",
            fontWeight: "600",
            color: "var(--charcoal)",
            margin: "0 0 8px 0",
          }}
        >
          {duplicado
            ? "Este pedido já existia"
            : "Telefone conhecido — juntámos ao contacto existente"}
        </p>
        <p
          style={{
            fontSize: "13px",
            color: "var(--gray-mid)",
            margin: "0 0 16px 0",
            lineHeight: 1.6,
          }}
        >
          {duplicado
            ? "Já havia um evento vivo deste contacto nesta data — não foi criado nada de novo (proteção contra envios repetidos). Se é mesmo um evento diferente, muda a data ou o contacto."
            : avisoDedupe.nomeExistente
              ? `Este telefone já pertencia à ficha de ${avisoDedupe.nomeExistente} — o evento novo ficou guardado nessa ficha, a mesma pessoa não se duplica. Se NÃO é esta pessoa, o número tem uma gralha: corrige-o na ficha do evento.`
              : "Este telefone já pertencia a uma ficha registada, por isso o evento novo ficou guardado nessa ficha — a mesma pessoa não se duplica. Abre a ficha para confirmar."}
        </p>
        <button
          onClick={() => {
            const sub = avisoDedupe.submission;
            setAvisoDedupe(null);
            if (onSubmetido) onSubmetido(sub);
          }}
          style={{
            width: "100%",
            padding: "11px",
            borderRadius: "10px",
            fontSize: "13px",
            fontWeight: "600",
            border: "none",
            backgroundColor: "var(--gold)",
            color: "white",
            cursor: "pointer",
          }}
        >
          Entendido
        </button>
      </div>
    );
  }

  // ---------- as secções (funções chamadas inline — NUNCA componentes
  // internos: um componente interno remontava a cada render e roubava
  // o foco dos inputs a cada tecla) ----------
  const secSobreTi = () => (
    <>
      <Campo label="Nome *" erro={erros.nome}>
        <input
          style={inputStyle(erros.nome)}
          value={nome}
          onChange={(e) => {
            setNome(e.target.value);
            setErros((p) => ({ ...p, nome: undefined }));
          }}
          placeholder="ex: Ana Cruz"
        />
      </Campo>

      <Campo label="Contacto principal *" erro={erros.contacto}>
        <input
          type="tel"
          style={inputStyle(erros.contacto)}
          value={contacto}
          onChange={(e) => {
            // Só telefone: dígitos, espaços, +, - e parêntesis
            setContacto(e.target.value.replace(/[^0-9+()\s-]/g, ""));
            setErros((p) => ({ ...p, contacto: undefined }));
          }}
          placeholder="ex: 912 345 678"
        />
      </Campo>

      <Campo label="Número WhatsApp" erro={erros.whatsapp}>
        <input
          type="tel"
          style={inputStyle(erros.whatsapp)}
          value={whatsapp}
          onChange={(e) => {
            setWhatsapp(e.target.value);
            setErros((p) => ({ ...p, whatsapp: undefined }));
          }}
          placeholder="ex: 912 345 678"
        />
      </Campo>

      {/* R1 (109): o canal de origem — opcional de propósito (fricção
          zero na porta pública), mas é o que um dia separa a procura
          do Instagram da procura por recomendação, por zona. */}
      <Campo label="Como nos conheceste?">
        <select
          style={inputStyle()}
          value={canalOrigem}
          onChange={(e) => setCanalOrigem(e.target.value)}
        >
          <option value="">Escolher... (opcional)</option>
          <option value="Instagram">Instagram</option>
          <option value="Facebook">Facebook</option>
          <option value="WhatsApp">WhatsApp</option>
          <option value="Recomendação">Recomendação de alguém</option>
          <option value="Pesquisa Google">Pesquisa no Google</option>
          <option value="Outro">Outro</option>
        </select>
      </Campo>
    </>
  );

  const secEvento = () => (
    <>
      <Campo label="Tipo de evento *" erro={erros.tipo}>
        {tipos.length > 0 ? (
          <select
            style={inputStyle(erros.tipo)}
            value={eventTypeId}
            onChange={(e) => {
              setEventTypeId(e.target.value);
              if (e.target.value && e.target.value !== "__outro__")
                setTipoOutro("");
              setErros((p) => ({ ...p, tipo: undefined }));
            }}
          >
            <option value="">Escolher...</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
            <option value="__outro__">Outro (escrever em baixo)</option>
          </select>
        ) : null}
        {(tipos.length === 0 || eventTypeId === "__outro__") && (
          <input
            style={{ ...inputStyle(erros.tipo), marginTop: "6px" }}
            value={tipoOutro}
            onChange={(e) => {
              setTipoOutro(e.target.value);
              setErros((p) => ({ ...p, tipo: undefined }));
            }}
            placeholder={
              tipos.length > 0
                ? "Outro tipo de evento? Escreve aqui"
                : "ex: Casamento, Batizado, Aniversário..."
            }
          />
        )}
      </Campo>

      <div style={{ display: "flex", gap: "10px" }}>
        <Campo label="Data do evento *" erro={erros.data} flex={1}>
          <input
            type="date"
            style={inputStyle(erros.data)}
            value={dataEvento}
            onChange={(e) => {
              setDataEvento(e.target.value);
              setErros((p) => ({ ...p, data: undefined }));
            }}
          />
        </Campo>
        <Campo
          label={
            convidadosObrigatorios ? "Nº de convidados *" : "Nº de convidados"
          }
          erro={erros.convidados}
          flex={1}
        >
          <input
            type="number"
            min="1"
            style={inputStyle(erros.convidados)}
            value={numeroConvidados}
            onChange={(e) => {
              setNumeroConvidados(e.target.value);
              setErros((p) => ({ ...p, convidados: undefined }));
            }}
            placeholder="ex: 25"
          />
        </Campo>
      </div>

      {/* O aviso da disputa — NUNCA bloqueia: a criação segue na mesma
          (o dia só muda de mãos no registo do sinal, não aqui). Fica
          logo por baixo do campo da data, a que ele responde. */}
      {modoInterno && (irmaosDia.length > 0 || falhouDia) && (
        <AvisoDiaDisputado
          dataISO={dataEvento}
          irmaos={irmaosDia}
          falhou={falhouDia}
          estilo={{ margin: "-4px 0 14px" }}
        />
      )}

      {/* R1 (109): «Localidade», com sugestões — o texto livre desta
          caixa é o que o Atlas lê por zona, e vinha cheio de nomes de
          salão e gralhas. O datalist encaminha para a grafia certa sem
          bloquear ninguém (continua texto livre). */}
      <Campo label="Localidade do evento">
        <input
          style={inputStyle()}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder="ex: Cascais"
          list="dlm-localidades"
        />
        <datalist id="dlm-localidades">
          {LOCALIDADES_ZONA.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </Campo>
    </>
  );

  const secEspaco = () => (
    <>
      <Campo
        label="Espaço onde vai ser realizado *"
        erro={erros.espaco || erros.localOutro}
      >
        <select
          style={inputStyle()}
          value={localTipo}
          onChange={(e) => {
            setLocalTipo(e.target.value);
            if (e.target.value !== "Outro") setLocalOutro("");
            setErros((p) => ({
              ...p,
              espaco: undefined,
              localOutro: undefined,
              // O espaço revela os serviços — e com eles pode mudar a
              // obrigatoriedade do nº de convidados
              convidados: undefined,
            }));
          }}
        >
          <option value="">Escolher...</option>
          {OPCOES_LOCAL.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {localTipo === "Outro" && (
          <input
            style={{ ...inputStyle(erros.localOutro), marginTop: "6px" }}
            value={localOutro}
            onChange={(e) => {
              setLocalOutro(e.target.value);
              setErros((p) => ({ ...p, localOutro: undefined }));
            }}
            placeholder="Descreve o local (ex: jardim da quinta da avó, Sintra)"
          />
        )}
      </Campo>

      {localTipo && (
        <Campo label="Opções *" erro={erros.servicos}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {OPCOES_SERVICOS.map((opt) => {
              const ativo = servicos.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleServico(opt)}
                  style={pillStyle(ativo)}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {servicos.includes("Buffet") && (
            <SeletorPacotes
              escolhido={buffet}
              onEscolher={toggleBuffet}
              numeroConvidados={numeroConvidados}
              onNumeroConvidados={(v) => {
                setNumeroConvidados(v);
                setErros((p) => ({ ...p, convidados: undefined }));
              }}
              erro={erros.buffet}
            />
          )}
          {servicos.includes("Balcão") && (
            <div
              style={{
                marginTop: "10px",
                padding: "10px 12px",
                backgroundColor: "#FBF7EF",
                border: "1px solid var(--gold-light)",
                borderRadius: "10px",
              }}
            >
              <p
                style={{
                  fontSize: "10px",
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--gold-dark)",
                  margin: "0 0 8px 0",
                }}
              >
                Tipo de balcão *
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {OPCOES_BALCAO.map((opt) => {
                  const ativo = balcao.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleBalcao(opt)}
                      style={pillStyle(ativo, true)}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {erros.balcao && <Erro texto={erros.balcao} />}
            </div>
          )}
        </Campo>
      )}

      <Campo
        label={`Imagens de referência (até ${MAX_IMAGENS_REFERENCIA}, opcional)`}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {ficheiros.map((f, i) => (
            <div key={i} style={{ position: "relative" }}>
              <img
                src={f.url}
                alt={`Referência ${i + 1}`}
                style={{
                  width: "64px",
                  height: "64px",
                  objectFit: "cover",
                  borderRadius: "10px",
                  border: "1px solid var(--gold-light)",
                  display: "block",
                }}
              />
              <button
                type="button"
                onClick={() => removerImagem(i)}
                aria-label="Remover imagem"
                style={{
                  position: "absolute",
                  top: "-6px",
                  right: "-6px",
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  border: "none",
                  backgroundColor: "var(--charcoal)",
                  color: "white",
                  fontSize: "11px",
                  lineHeight: 1,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {ficheiros.length < MAX_IMAGENS_REFERENCIA && (
            <button
              type="button"
              onClick={() => inputImagens.current?.click()}
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "10px",
                border: "1.5px dashed var(--gold)",
                backgroundColor: "white",
                color: "var(--gold)",
                fontSize: "22px",
                cursor: "pointer",
              }}
              aria-label="Adicionar imagens"
            >
              +
            </button>
          )}
        </div>
        <input
          ref={inputImagens}
          type="file"
          accept="image/*"
          multiple
          onChange={escolherImagens}
          style={{ display: "none" }}
        />
      </Campo>

      <Campo label="Mais detalhes">
        <textarea
          style={{ ...inputStyle(), minHeight: "70px", resize: "vertical" }}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          placeholder="ex: Ambiente bonito e acolhedor para um pedido de noivado, cor champanhe..."
        />
      </Campo>
    </>
  );

  const blocoErroGeral = erroGeral ? (
    <p style={{ fontSize: "13px", color: "#DC2626", margin: "0 0 12px 0" }}>
      {erroGeral}
    </p>
  ) : null;

  // ---------- modo PLANO (interno e qualquer porta sem capítulos) ----------
  if (!porCapitulos) {
    return (
      <div>
        {secSobreTi()}
        {secEvento()}
        {secEspaco()}
        {blocoErroGeral}
        {!ocultarBotao && (
          <button
            onClick={submeter}
            disabled={enviando}
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: "10px",
              fontSize: "14px",
              fontWeight: "600",
              border: "none",
              backgroundColor: enviando ? "var(--gold-light)" : "var(--gold)",
              color: "white",
              cursor: enviando ? "wait" : "pointer",
              boxShadow: "0 4px 12px rgba(201,168,76,0.3)",
            }}
          >
            {enviando ? "A enviar..." : textoBotao}
          </button>
        )}
      </div>
    );
  }

  // ---------- a experiência por CAPÍTULOS (porta pública) ----------
  const tipoEscolhido = tipos.find((t) => t.id === eventTypeId);
  const nomeTipo =
    (eventTypeId && eventTypeId !== "__outro__" && tipoEscolhido?.nome) ||
    tipoOutro.trim() ||
    "";
  const resumoData = dataEvento
    ? new Date(`${dataEvento}T12:00:00`).toLocaleDateString("pt-PT", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
  const resumoServicos = servicos
    .map((sv) =>
      sv === "Buffet" && buffet ? `Buffet ${buffet}` : sv === "Balcão" && balcao[0] ? `Balcão · ${balcao[0]}` : sv,
    )
    .join(", ");
  const resumos = [
    [nome.trim(), contacto.trim()].filter(Boolean).join(" · "),
    [
      nomeTipo,
      resumoData,
      numeroConvidados.trim() && `${numeroConvidados} convidados`,
      local.trim(),
    ]
      .filter(Boolean)
      .join(" · "),
    [
      localTipo === "Outro" ? localOutro.trim() : localTipo,
      resumoServicos,
      ficheiros.length
        ? `${ficheiros.length} ${ficheiros.length === 1 ? "imagem" : "imagens"}`
        : "",
    ]
      .filter(Boolean)
      .join(" · "),
  ];
  const CAPITULOS = [
    {
      titulo: "Sobre ti",
      intro: "Só o essencial para te conseguirmos responder.",
      corpo: secSobreTi,
    },
    {
      titulo: "O evento",
      intro: "O dia, o sítio e o tamanho da festa.",
      corpo: secEvento,
    },
    {
      titulo: "Espaço e inspiração",
      intro: "Como imaginas o espaço — e tudo o que nos quiseres mostrar.",
      corpo: secEspaco,
    },
    {
      titulo: "Rever e enviar",
      intro: "Confere com calma — podes voltar a qualquer parte.",
      corpo: null,
    },
  ];
  const editarCapitulo = (i) => {
    setErros({});
    setCapitulo(i);
  };

  return (
    <div>
      {CAPITULOS.map((c, i) => {
        // Na revisão, a própria revisão é o resumo — repetir os
        // capítulos recolhidos por cima era dizer tudo duas vezes.
        if (i < capitulo && capitulo === 3) return null;
        if (i < capitulo)
          return (
            <CapituloFeito
              key={c.titulo}
              titulo={c.titulo}
              resumo={resumos[i]}
              onEditar={() => editarCapitulo(i)}
            />
          );
        if (i > capitulo)
          return <CapituloFuturo key={c.titulo} n={i} titulo={c.titulo} />;
        return (
          <div key={c.titulo}>
            <p
              style={{
                fontSize: "10px",
                fontWeight: "700",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--gold-dark)",
                margin: "0 0 4px 0",
              }}
            >
              Passo {i + 1} de 4
            </p>
            <h2
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: "21px",
                fontWeight: "500",
                color: "var(--charcoal)",
                margin: "0 0 4px 0",
              }}
            >
              {c.titulo}
            </h2>
            <p
              style={{
                fontSize: "12.5px",
                color: "var(--gray-mid)",
                lineHeight: 1.6,
                margin: "0 0 18px 0",
              }}
            >
              {c.intro}
            </p>
            <motion.div
              key={`corpo-${i}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {c.corpo ? (
                c.corpo()
              ) : (
                <>
                  {[0, 1, 2].map((n) => (
                    <LinhaRevisao
                      key={n}
                      titulo={CAPITULOS[n].titulo}
                      valor={resumos[n] || "—"}
                      onEditar={() => editarCapitulo(n)}
                    />
                  ))}
                  {mensagem.trim() && (
                    <LinhaRevisao titulo="Mais detalhes" valor={mensagem.trim()} />
                  )}
                  {ficheiros.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        gap: "6px",
                        flexWrap: "wrap",
                        padding: "10px 0 4px",
                      }}
                    >
                      {ficheiros.map((f, i2) => (
                        <img
                          key={i2}
                          src={f.url}
                          alt={`Referência ${i2 + 1}`}
                          style={{
                            width: "44px",
                            height: "44px",
                            objectFit: "cover",
                            borderRadius: "8px",
                            border: "1px solid var(--gold-light)",
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <p
                    style={{
                      fontSize: "11.5px",
                      color: "var(--gray-mid)",
                      lineHeight: 1.6,
                      margin: "14px 0 4px",
                    }}
                  >
                    Ao enviar, o pedido chega-nos direto — respondemos-te em
                    breve pelo contacto que deixaste.
                  </p>
                  {blocoErroGeral}
                </>
              )}
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

// ---- capítulos: as peças fechadas ----

// Capítulo já preenchido: recolhe para uma linha-resumo com «Editar»
// — o que ficou para trás continua à vista, nunca escondido.
function CapituloFeito({ titulo, resumo, onEditar }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        padding: "11px 0",
        borderBottom: "1px solid var(--borda-leve, #F0EAD9)",
        marginBottom: "4px",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "18px",
          height: "18px",
          borderRadius: "50%",
          backgroundColor: "var(--gold)",
          color: "white",
          fontSize: "10px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: "1px",
        }}
      >
        ✓
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: "10px",
            fontWeight: "700",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--gold-dark)",
            margin: "0 0 2px 0",
          }}
        >
          {titulo}
        </p>
        <p
          style={{
            fontSize: "12.5px",
            color: "var(--charcoal)",
            margin: 0,
            lineHeight: 1.5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {resumo || "—"}
        </p>
      </div>
      <button
        type="button"
        onClick={onEditar}
        style={{
          border: "none",
          background: "none",
          color: "var(--gold-dark)",
          fontSize: "12px",
          fontWeight: "600",
          cursor: "pointer",
          padding: "2px 0",
          flexShrink: 0,
        }}
      >
        Editar
      </button>
    </div>
  );
}

// Capítulo por vir: um título sereno — sabe-se o que aí vem, sem peso.
function CapituloFuturo({ n, titulo }) {
  return (
    <div
      className="cap-futuro"
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: "10px",
        padding: "13px 0 3px",
        borderTop: "1px solid var(--borda-leve, #F0EAD9)",
        marginTop: "16px",
        opacity: 0.55,
      }}
    >
      <span
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "15px",
          color: "var(--gold-dark)",
        }}
      >
        {n + 1}
      </span>
      <span
        style={{
          fontSize: "11px",
          fontWeight: "600",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--gray-mid)",
        }}
      >
        {titulo}
      </span>
    </div>
  );
}

// Uma linha da revisão final: título pequeno, valor legível, Editar.
function LinhaRevisao({ titulo, valor, onEditar }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        padding: "10px 0",
        borderBottom: "1px solid var(--borda-leve, #F0EAD9)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: "10px",
            fontWeight: "700",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--gold-dark)",
            margin: "0 0 3px 0",
          }}
        >
          {titulo}
        </p>
        <p
          style={{
            fontSize: "13px",
            color: "var(--charcoal)",
            margin: 0,
            lineHeight: 1.55,
            overflowWrap: "anywhere",
          }}
        >
          {valor}
        </p>
      </div>
      {onEditar && (
        <button
          type="button"
          onClick={onEditar}
          style={{
            border: "none",
            background: "none",
            color: "var(--gold-dark)",
            fontSize: "12px",
            fontWeight: "600",
            cursor: "pointer",
            padding: "2px 0",
            flexShrink: 0,
          }}
        >
          Editar
        </button>
      )}
    </div>
  );
}

// ---- helpers ----

function Campo({ label, erro, children, flex }) {
  return (
    <div style={{ marginBottom: "14px", flex }}>
      <label
        style={{
          fontSize: "11px",
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--charcoal)",
          display: "block",
          marginBottom: "5px",
        }}
      >
        {label}
      </label>
      {children}
      {erro && <Erro texto={erro} />}
    </div>
  );
}

function Erro({ texto }) {
  return (
    <p style={{ fontSize: "12px", color: "#DC2626", margin: "4px 0 0 0" }}>
      {texto}
    </p>
  );
}

const inputStyle = (temErro) => ({
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  border: `1.5px solid ${temErro ? "#DC2626" : "var(--gold-light)"}`,
  fontSize: "13px",
  outline: "none",
  fontFamily: "Inter, sans-serif",
  boxSizing: "border-box",
  backgroundColor: "white",
});

const pillStyle = (ativo, pequeno = false) => ({
  padding: pequeno ? "6px 14px" : "8px 18px",
  borderRadius: "999px",
  fontSize: pequeno ? "12px" : "13px",
  fontWeight: ativo ? "600" : "400",
  border: `1.5px solid ${ativo ? "var(--gold)" : "var(--gold-light)"}`,
  backgroundColor: ativo ? "var(--gold)" : "white",
  color: ativo ? "white" : "var(--gray-mid)",
  cursor: "pointer",
  transition: "all 0.15s",
});
