import { useState, useEffect, useRef } from "react";
import {
  submeterCaptacao,
  getTiposParaCaptacao,
  MAX_IMAGENS_REFERENCIA,
} from "../../lib/captacao";
import { supabase } from "../../lib/supabase";
import { registarErroFormulario } from "../../lib/errosForm";
import { irmaosDoDia } from "../../lib/disputaDia";
import AvisoDiaDisputado from "../AvisoDiaDisputado";

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
// O detalhe (lotação) faz parte da resposta guardada, para a Nádia
// saber logo o pacote sem consultar tabela nenhuma.
const OPCOES_BUFFET = [
  { nome: "Premium", detalhe: "50 ou mais pessoas" },
  { nome: "Supreme", detalhe: "até 35 pessoas" },
  { nome: "Essence", detalhe: "até 20 pessoas" },
];
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
  modoInterno = false,
  // Barra dourada (página pública /interesse): esconde o botão
  // interno e reporta o progresso dos obrigatórios ao exterior
  ocultarBotao = false,
  onProgresso,
  registarSubmeter,
}) {
  const [tipos, setTipos] = useState([]);
  const [nome, setNome] = useState("");
  const [contacto, setContacto] = useState("");
  const [whatsapp, setWhatsapp] = useState(""); // canal de comunicação — obrigatório
  const [eventTypeId, setEventTypeId] = useState("");
  const [tipoOutro, setTipoOutro] = useState("");
  const [dataEvento, setDataEvento] = useState(dataInicial || "");
  const [numeroConvidados, setNumeroConvidados] = useState("");
  const [local, setLocal] = useState(""); // texto livre (ex: Cascais)
  const [localTipo, setLocalTipo] = useState(""); // tipo de espaço
  const [localOutro, setLocalOutro] = useState("");
  const [servicos, setServicos] = useState([]);
  const [buffet, setBuffet] = useState(""); // pacote escolhido (um só)
  const [balcao, setBalcao] = useState([]);
  const [ficheiros, setFicheiros] = useState([]); // File[]
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

  useEffect(() => {
    getTiposParaCaptacao(tenantSlug).then(setTipos);
  }, [tenantSlug]);

  // Consulta a disputa quando a data muda — com um debounce leve (o
  // input de data dispara a meio da escrita). Se a migração 083 ainda
  // não correu, irmaosDoDia devolve [] em silêncio e o aviso
  // simplesmente não existe — degradação graciosa da casa.
  useEffect(() => {
    if (!modoInterno || !/^\d{4}-\d{2}-\d{2}$/.test(dataEvento || "")) {
      return undefined;
    }
    let cancelado = false;
    const temporizador = setTimeout(async () => {
      const lista = await irmaosDoDia(dataEvento);
      if (!cancelado) setDisputaDia({ data: dataEvento, irmaos: lista || [] });
    }, 350);
    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [modoInterno, dataEvento]);

  // Os irmãos VÁLIDOS para a data que está no campo agora — [] se a
  // consulta guardada for de outra data (ou não houver nenhuma).
  const irmaosDia =
    disputaDia && disputaDia.data === dataEvento ? disputaDia.irmaos : [];

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
    setFicheiros((prev) =>
      [...prev, ...novos].slice(0, MAX_IMAGENS_REFERENCIA),
    );
    e.target.value = ""; // permite escolher o mesmo ficheiro outra vez
  };

  const removerImagem = (idx) =>
    setFicheiros((prev) => prev.filter((_, i) => i !== idx));

  const validar = () => {
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
    setErros(e);
    return Object.keys(e).length === 0;
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
      // O pacote vai com a lotação por extenso ("Premium (até 20
      // pessoas)") — resposta autoexplicativa em qualquer ecrã do admin
      const pacoteBuffet = OPCOES_BUFFET.find((p) => p.nome === buffet);
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
          mensagem,
          ficheiros,
        },
        tenantSlug,
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
      const detalhe = err?.message ? ` (${err.message})` : "";
      setErroGeral(
        `Não foi possível enviar o pedido. Verifica a ligação e tenta novamente.${detalhe}`,
      );
    }
    setEnviando(false);
  };

  // Regista a função de envio para o botão externo (barra dourada).
  // Corre em cada render de propósito: garante que a barra chama
  // sempre a versão mais recente do submeter (sem closures velhas).
  // Vive DEPOIS da declaração do submeter — ler antes era acesso a
  // const por declarar (react-hooks/immutability); a ordem entre
  // efeitos não muda nada aqui, o registo é só guardar a referência.
  useEffect(() => {
    if (registarSubmeter) registarSubmeter(submeter);
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

  return (
    <div>
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
      {modoInterno && irmaosDia.length > 0 && (
        <AvisoDiaDisputado
          dataISO={dataEvento}
          irmaos={irmaosDia}
          estilo={{ margin: "-4px 0 14px" }}
        />
      )}

      <Campo label="Local do evento">
        <input
          style={inputStyle()}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder="ex: Cascais"
        />
      </Campo>

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
                Pacote de buffet *
              </p>
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                {OPCOES_BUFFET.map((p) => {
                  const ativo = buffet === p.nome;
                  return (
                    <button
                      key={p.nome}
                      type="button"
                      onClick={() => toggleBuffet(p.nome)}
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        gap: "10px",
                        width: "100%",
                        padding: "9px 14px",
                        borderRadius: "10px",
                        border: `1.5px solid ${ativo ? "var(--gold)" : "var(--gold-light)"}`,
                        backgroundColor: ativo ? "var(--gold)" : "white",
                        cursor: "pointer",
                        transition: "all 0.15s",
                        textAlign: "left",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: "600",
                          letterSpacing: "0.02em",
                          color: ativo ? "white" : "var(--charcoal)",
                        }}
                      >
                        {p.nome}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          color: ativo
                            ? "rgba(255,255,255,0.9)"
                            : "var(--gray-mid)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.detalhe}
                      </span>
                    </button>
                  );
                })}
              </div>
              {erros.buffet && <Erro texto={erros.buffet} />}
            </div>
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
                src={URL.createObjectURL(f)}
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

      {erroGeral && (
        <p
          style={{
            fontSize: "13px",
            color: "#DC2626",
            margin: "0 0 12px 0",
          }}
        >
          {erroGeral}
        </p>
      )}

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
