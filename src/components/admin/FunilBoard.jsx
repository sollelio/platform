import { useState, useEffect, useRef } from "react";
import {
  getEventosFunil,
  getPreparacaoFunil,
  updateFase,
} from "../../lib/clientes";
import { estadoFormularioDoEvento } from "../../lib/invites";
import {
  registarSinalDoFunil,
  sincronizarPrevistos,
  METODOS_SUGERIDOS,
  getPagamentosEvento,
  saldoSinalPendente,
} from "../../lib/pagamentos";
import { estadoDoDia, registarSinalComGuarda } from "../../lib/disputaDia";
import AvisoSinalRecebido from "./AvisoSinalRecebido";
import { getResumoSubmissao } from "../../lib/submissionFields";
import { formatarEuros } from "./orcamentos/orcamentoConfig";
import {
  FASE_LABEL,
  FASE_COR,
  FASES_BOARD,
  FASES_POS_SINAL,
  PROXIMA_FASE,
  AVANCO_LABEL,
} from "./faseConfig";
import CaptacaoForm from "../captacao/CaptacaoForm";

// ============================================================
// FunilBoard — a esteira visual do funil comercial, dentro de Clientes.
// TRÊS colunas: Interessados (pré-sinal) | Clientes (pós-sinal, ainda
// por preparar) | Em Preparação (pós-sinal, já em mãos), empilhadas
// no telemóvel. Perdido NÃO é coluna (é saída): só aparece quando a
// Nádia liga "Ver perdidos".
//
// A coluna é decidida por DOIS eixos:
//   • fase (funil comercial)  → Interessados vs pós-sinal
//   • trabalho (operacional)  → Clientes (ganho, ainda intocado) vs
//     Em Preparação — que se atravessa pelo status do drawer OU, desde
//     02/08/2026, sozinha: quando a preparação COMEÇA de facto
//     (formulário enviado/respondido, projecto em mãos, ficha de
//     materiais com linhas). A coluna lê a realidade — nada se escreve
//     na base por causa dela, e o gesto manual continua a mandar.
// "Concluído" sai do board, como sempre. Os cartões de Em Preparação
// levam o TRILHO (as quatro marcas do trabalho); os de Clientes não —
// por definição estariam vazias.
//
// refrescarEm — bump vindo do AdminPage: quando o drawer altera um
// evento (estado, valor, dados), o board recarrega (tem fetch próprio
// e o drawer abre por cima dele).
//
// Interação por TOQUE, não drag-and-drop (decisão validada: DnD entre
// colunas com scroll horizontal é péssimo no telemóvel):
//   • tocar no corpo do card → abre o drawer do evento (onAbrirEvento)
//   • "FaseSeguinte →" → avança uma fase
//   • "perder" → confirmação inline → fase perdido
//   • na coluna Perdidos: "↩ Recuperar" → volta a interessado
// Todos os botões dos cards usam e.stopPropagation() (lição conhecida).
// ============================================================

const formatarData = (iso) => {
  if (!iso) return "sem data";
  const [a, m, d] = iso.split("-");
  const meses = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  return `${Number(d)} ${meses[Number(m) - 1]} ${a}`;
};

// A frase de cada estado do dia (dlm_dia_estado, 083) na voz do
// cartão — partilhada pelo painel da disputa e pela linha do painel de
// recuperação, para as duas nunca divergirem. O rival sem nome (não
// devia acontecer, mas os dados mandam) fica «outra cliente» — nunca
// um «tomado por null» à frente da Nádia.
const descreveEstadoDia = (disputa) => {
  const rival = disputa.rival || "outra cliente";
  if (disputa.estado === "tomado")
    return `já está tomado por ${rival} (sinal feito)`;
  if (disputa.estado === "preferencia")
    return `está guardado para ${rival} até ${formatarData(disputa.ate)}`;
  return `está em confirmação por ${rival} (disse que já enviou o sinal)`;
};

// Soma o valor acordado de uma lista de eventos (quem não tem valor
// simplesmente não pesa — sem inventar zeros).
const somaValores = (lista) =>
  lista.reduce((acc, e) => acc + (Number(e.valor_acordado) || 0), 0);

// Os estados operacionais que movem um evento pós-sinal para a coluna
// Em Preparação ("a partir do preencher formulário em diante").
const STATUS_EM_PREPARACAO = ["Em Preparação", "Confirmado"];

// ------------------------------------------------------------
// O trilho de preparação — as marcas de relance dos cartões
// pós-sinal. Com o sinal pago o negócio está fechado; a pergunta da
// Nádia passa a ser «onde está o trabalho?» — formulário, projecto,
// contrato, materiais. Três marcas da casa (traço à mão, nunca
// glifos): vazio (por começar) · meia-lua (a meio) · visto (feito).
// As cores das marcas ficam literais: são atributos SVG (stroke/fill),
// que não aceitam var(--…) — os valores até são os da identidade
// (--ouro/--ouro-suave/--aro); seguem no relatório.
// ------------------------------------------------------------
function MarcaTrilho({ estado }) {
  if (estado === "feito") {
    return (
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="6" stroke="#C9A84C" strokeWidth="1.5" />
        <path d="M4.2 7.3 L6.2 9.2 L9.8 4.9" stroke="#C9A84C" strokeWidth="1.7"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (estado === "meio") {
    return (
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="6" stroke="#C9A84C" strokeWidth="1.5" />
        <path d="M7 1 A6 6 0 0 0 7 13 Z" fill="#E8D5A3" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="6" stroke="#E8DCC0" strokeWidth="1.5" />
    </svg>
  );
}

function TrilhoPreparacao({ itens }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "6px 12px",
        margin: "0 0 10px",
        paddingTop: "8px",
        // #F5EFE2 está fora da paleta (--borda-leve é #F5ECD7) —
        // fica literal e segue no relatório de violações.
        borderTop: "1px solid #F5EFE2",
      }}
    >
      {itens.map((it) => (
        <span
          key={it.rotulo}
          title={it.dica}
          style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
        >
          <MarcaTrilho estado={it.estado} />
          <span
            style={{
              fontSize: "9.5px",
              letterSpacing: "0.02em",
              color:
                it.estado === "vazio"
                  ? "var(--texto-apagado)"
                  : "var(--gray-mid)",
            }}
          >
            {it.rotulo}
          </span>
        </span>
      ))}
    </div>
  );
}

export default function FunilBoard({
  eventTypes = [],
  onAbrirEvento,
  onDadosMudaram,
  refrescarEm = 0,
  verPerdidos = null,
  aoConsumirVerPerdidos,
}) {
  const [eventos, setEventos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [mostrarPerdidos, setMostrarPerdidos] = useState(false);
  // { documentos, invites, comMateriais } dos pós-sinal — o trilho.
  const [preparacao, setPreparacao] = useState(null);

  // A pílula «Recuperar no funil» da Jornada aterra aqui: liga o "Ver
  // perdidos" (a coluna aparece) e consome o pedido — a recuperação em
  // si continua a ser o gesto informado de sempre, no cartão.
  useEffect(() => {
    if (!verPerdidos) return;
    setMostrarPerdidos(true);
    aoConsumirVerPerdidos?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verPerdidos]);
  const [confirmandoPerda, setConfirmandoPerda] = useState(null); // id do evento
  // { id, valorSinal } — o valor mostrado na confirmação é o do
  // PREVISTO real (lido ao abrir), não uma divisão por dois: com o
  // remanescente preso por pagamentos, o sinal sincronizado pode não
  // ser metade, e o que se confirma tem de ser o que se regista.
  const [confirmandoSinal, setConfirmandoSinal] = useState(null);
  // Recuperação informada de um perdido COM dinheiro registado:
  // { id, sinalPago, totalPago } enquanto a Nádia escolhe a saída.
  const [recuperando, setRecuperando] = useState(null);
  const pedidoRecuperacaoRef = useRef(null);
  // "Sinal recebido →" SEM valor acordado deixou de avançar em
  // silêncio: confirma-se inline, com a consequência à vista.
  const [confirmandoAvancoSemValor, setConfirmandoAvancoSemValor] =
    useState(null); // id do evento
  // A disputa do dia (083) parada num cartão, à espera da decisão:
  // { id, porta:'sinal'|'avanco', estado, rival, ate, dados } — na
  // porta 'sinal' os dados são o {metodo, data, valorSinal} recusado
  // (para o «Registar na mesma» com forcar); na 'avanco', o destino
  // {fase, opcoes} que ficou suspenso.
  const [disputaCartao, setDisputaCartao] = useState(null);
  const [atualizando, setAtualizando] = useState(null); // id do evento
  const [novoInteressado, setNovoInteressado] = useState(false); // modal aberto
  const [avisoErro, setAvisoErro] = useState(null); // toast discreto (adeus alert)
  // A oferta de aviso à cliente quando o SINAL entra por aqui (10/08)
  // — o evento a avisar, ou null; fecha-se e não volta.
  const [avisoSinalPago, setAvisoSinalPago] = useState(null);

  const carregar = async () => {
    setCarregando(true);
    setErro(null);
    // Nenhuma confirmação inline sobrevive a um reload: os dados que a
    // justificavam podem ter mudado (valor definido no drawer, fase
    // alterada) e a pergunta antiga passaria a afirmar coisas falsas.
    setConfirmandoPerda(null);
    setConfirmandoSinal(null);
    setConfirmandoAvancoSemValor(null);
    setDisputaCartao(null);
    setRecuperando(null);
    try {
      const data = await getEventosFunil();
      setEventos(data);
      // O trilho de preparação, só para os pós-sinal vivos (contrato
      // incluído: com o sinal pago a data é dela). Falhar aqui não
      // escurece o funil: os cartões pintam-se sem as marcas.
      const idsPosSinal = data
        .filter(
          (e) =>
            ["contrato", "cliente", "projecto"].includes(e.fase) &&
            e.status !== "Concluído",
        )
        .map((e) => e.id);
      try {
        setPreparacao(await getPreparacaoFunil(idsPosSinal));
      } catch (e2) {
        console.warn("Funil sem trilho de preparação:", e2);
        setPreparacao(null);
      }
    } catch (e) {
      console.error(e);
      setErro("Não foi possível carregar o funil.");
    }
    setCarregando(false);
  };

  // Um só aviso de cada vez, com um só timer — sem isto, o timer de um
  // aviso antigo apagava a mensagem seguinte a meio da leitura.
  const avisoTimerRef = useRef(null);
  const mostrarAviso = (mensagem, ms = 4500) => {
    if (avisoTimerRef.current) clearTimeout(avisoTimerRef.current);
    setAvisoErro(mensagem);
    avisoTimerRef.current = setTimeout(() => setAvisoErro(null), ms);
  };

  // Corre ao montar E sempre que o drawer altera um evento (bump do
  // refrescarEm no AdminPage) — o cartão muda de coluna sem reload.
  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refrescarEm]);

  // Fase segura: eventos antigos sem fase (não devia haver, mas há BD
  // de teste) caem em "interessado" para nunca desaparecerem do funil.
  const faseDe = (ev) => (FASE_LABEL[ev.fase] ? ev.fase : "interessado");

  // A preparação COMEÇOU? É este o sinal que atravessa um cartão de
  // Clientes para a Em Preparação — a coluna deriva da realidade do
  // trabalho, não de um clique administrativo. Conta o primeiro gesto
  // dela: formulário enviado (ou respondido), projecto em mãos, ou a
  // ficha de materiais com linhas. O contrato NÃO conta: na ordem final
  // (077) assinar é fechar o negócio, não prepará-lo — e um contrato em
  // mãos acenderia os cartões da fase contrato à nascença.
  const preparacaoComecou = (ev) => {
    if (!preparacao) return false;
    if (ev.questionario_entregue_em) return true;
    const f = estadoFormularioDoEvento(preparacao.invites, ev.id);
    if (f.estado === "pendente" || f.estado === "preenchido") return true;
    if (
      preparacao.documentos.some(
        (d) => d.submission_id === ev.id && d.tipo === "proposta",
      )
    )
      return true;
    return preparacao.comMateriais.has(ev.id);
  };

  // As quatro marcas do trilho de um evento pós-sinal — null enquanto
  // os dados não chegam, e nos cartões pré-sinal (lá o que conta é o
  // negócio, não a preparação).
  const trilhoDe = (ev) => {
    if (!preparacao) return null;
    if (!["contrato", "cliente", "projecto"].includes(faseDe(ev))) return null;
    const docs = preparacao.documentos.filter(
      (d) => d.submission_id === ev.id,
    );
    const doc = (tipo) => {
      const d = docs.filter((x) => x.tipo === tipo);
      if (d.length === 0) return "vazio";
      if (d.some((x) => x.assinado_em)) return "feito";
      return "meio";
    };
    const f = estadoFormularioDoEvento(preparacao.invites, ev.id);
    const formulario =
      ev.questionario_entregue_em || f.estado === "preenchido"
        ? "feito"
        : f.estado === "pendente"
          ? "meio"
          : "vazio";
    return [
      {
        rotulo: "formulário",
        estado: formulario,
        dica:
          formulario === "feito"
            ? "Formulário respondido"
            : formulario === "meio"
              ? "Formulário enviado, por responder"
              : "Formulário por enviar",
      },
      {
        rotulo: "projecto",
        estado: doc("proposta"),
        dica:
          doc("proposta") === "feito"
            ? "Projecto aprovado"
            : doc("proposta") === "meio"
              ? "Projecto em mãos"
              : "Projecto por desenhar",
      },
      {
        rotulo: "contrato",
        estado: doc("contrato"),
        dica:
          doc("contrato") === "feito"
            ? "Contrato assinado"
            : doc("contrato") === "meio"
              ? "Contrato em mãos"
              : "Contrato por preparar",
      },
      {
        rotulo: "materiais",
        estado: preparacao.comMateriais.has(ev.id) ? "feito" : "vazio",
        dica: preparacao.comMateriais.has(ev.id)
          ? "Ficha de materiais com linhas"
          : "Ficha de materiais vazia",
      },
    ];
  };

  // Abrir a confirmação do sinal lê o PREVISTO real primeiro: o valor
  // que a Nádia confirma é o que fica registado (com o remanescente
  // preso, o sinal sincronizado pode não ser metade do acordado). Sem
  // plano legível, cai na metade — que o registo depois sincroniza.
  const pedirSinal = async (ev) => {
    setAtualizando(ev.id);
    let valorSinal = (Number(ev.valor_acordado) || 0) / 2;
    try {
      const plano = await getPagamentosEvento(ev.id);
      const previstoSinal = (plano?.previstos || []).find(
        (p) => p.ordem === 1,
      );
      if (previstoSinal) valorSinal = Number(previstoSinal.valor) || valorSinal;
    } catch (e) {
      console.warn("Sem plano legível — a confirmação mostra a metade:", e);
    }
    setAtualizando(null);
    setConfirmandoSinal({ id: ev.id, valorSinal });
  };

  const mudarFase = async (ev, fase, opcoes = {}) => {
    setAtualizando(ev.id);
    try {
      const atualizada = await updateFase(ev.id, fase, opcoes);
      setEventos((prev) =>
        prev.map((e) =>
          e.id === ev.id ? { ...e, fase, status: atualizada.status } : e,
        ),
      );
      if (onDadosMudaram) onDadosMudaram();
    } catch (e) {
      console.error(e);
      // Só as mensagens da casa (Error traduzido em lib/clientes)
      // chegam à barra; um erro cru do Supabase/rede cai na genérica.
      mostrarAviso(
        e instanceof Error && e.message
          ? e.message
          : "Não foi possível atualizar a fase — verifica a ligação e as migrações.",
      );
    }
    setAtualizando(null);
    setConfirmandoPerda(null);
    setRecuperando(null);
    setConfirmandoAvancoSemValor(null);
    setDisputaCartao(null);
  };

  // A QUARTA porta da guarda do dia (083): avançar a fase à mão de
  // pré para pós-sinal reserva o dia aos olhos do portal — antes do
  // updateFase pergunta-se ao servidor como está o dia. 'livre' (ou a
  // lib muda porque a 083 não correu) segue sem fricção; qualquer
  // disputa pára no cartão para a decisão ser dela — o sistema avisa,
  // nunca decide. Dentro do pós-sinal não se pergunta: o dia já era
  // deste evento.
  const avancarComGuardaDia = async (ev, fase, opcoes = {}) => {
    const reservaODia =
      FASES_POS_SINAL.includes(fase) && !FASES_POS_SINAL.includes(faseDe(ev));
    if (reservaODia && ev.data_evento) {
      setAtualizando(ev.id);
      let dia = null;
      try {
        dia = await estadoDoDia(ev.data_evento, ev.id);
      } catch (e) {
        // Sem resposta não se trava o gesto — esta porta é aviso; a
        // lei dura vive na RPC do registo do sinal.
        console.warn("estadoDoDia sem resposta — o avanço segue:", e);
      }
      if (
        dia &&
        ["tomado", "preferencia", "em_confirmacao"].includes(dia.estado)
      ) {
        setAtualizando(null);
        setConfirmandoAvancoSemValor(null);
        setDisputaCartao({
          id: ev.id,
          porta: "avanco",
          estado: dia.estado,
          rival: dia.rival_nome || null,
          ate: dia.ate || null,
          dados: { fase, opcoes },
        });
        return;
      }
    }
    await mudarFase(ev, fase, opcoes);
  };

  // Recuperar um perdido — informado pelos dados, nunca em silêncio
  // quando há dinheiro (decisão do Hélio, Lote 2):
  //   sem pagamentos  → Interessados com o estado limpo ('Recebido'),
  //                     no MESMO update (o par atómico que o CHECK da
  //                     040 exige);
  //   com pagamentos  → a Nádia escolhe inline: voltar a Clientes
  //                     (mantém o estado que tinha) ou a Interessados
  //                     (limpa o estado) — o saldo do sinal destaca a
  //                     saída provável.
  const pedirRecuperacao = async (ev) => {
    // Só o pedido MAIS RECENTE conta — clicar ↩ noutro cartão com um
    // fetch em voo não pode trocar painéis nem piscar estados.
    pedidoRecuperacaoRef.current = ev.id;
    setAtualizando(ev.id);
    let plano;
    try {
      plano = await getPagamentosEvento(ev.id);
    } catch (e) {
      console.error(e);
      if (pedidoRecuperacaoRef.current !== ev.id) return;
      // Sem conseguir ver os pagamentos, não se recupera às cegas —
      // podia esconder dinheiro registado.
      setAtualizando(null);
      mostrarAviso(
        "Não foi possível verificar os pagamentos deste evento — tenta recuperar outra vez.",
      );
      return;
    }
    if (pedidoRecuperacaoRef.current !== ev.id) return;
    const pagamentos = plano?.pagamentos || [];
    if (pagamentos.length === 0) {
      await mudarFase(ev, "interessado", { status: "Recebido" });
      return;
    }
    const totalPago = pagamentos.reduce(
      (acc, p) => acc + (Number(p.valor) || 0),
      0,
    );
    // "Sinal pago" só se afirma com um previsto de sinal a existir —
    // saldoSinalPendente devolve 0 também quando não há plano nenhum,
    // e isso não é um sinal pago.
    const previstoSinal = (plano?.previstos || []).find(
      (p) => p.ordem === 1,
    );
    const sinalPago =
      !!previstoSinal &&
      saldoSinalPendente(ev.id, plano?.previstos || [], pagamentos) <= 0;
    // A disputa do dia (083) entra no painel: «Para Clientes» é um
    // regresso a pós-sinal — se a data entretanto ganhou dono, prazo ou
    // confirmação de outrem, diz-se ANTES da escolha, na mesma folha.
    // Null da lib (083 por correr) ou falha = a linha simplesmente não
    // aparece, como a casa degrada sempre.
    let dia = null;
    if (ev.data_evento) {
      try {
        dia = await estadoDoDia(ev.data_evento, ev.id);
      } catch (e2) {
        console.warn("estadoDoDia sem resposta na recuperação:", e2);
      }
      if (pedidoRecuperacaoRef.current !== ev.id) return;
    }
    setRecuperando({
      id: ev.id,
      sinalPago,
      totalPago,
      disputa:
        dia && dia.estado !== "livre"
          ? {
              estado: dia.estado,
              rival: dia.rival_nome || null,
              ate: dia.ate || null,
            }
          : null,
    });
    setAtualizando(null);
  };

  // "Sinal recebido →" é a ÚNICA transição de fase que move dinheiro a
  // sério — por isso é a única que pede método + data antes de avançar
  // (ver FormularioSinalInline). Desde a 083 a ordem INVERTEU-SE: a
  // guarda do dia corre PRIMEIRO (registarSinalComGuarda) e a fase só
  // avança depois do 'ok' — a fase sozinha já reserva o dia aos olhos
  // do portal, e não pode afirmar um sinal que a guarda ia recusar.
  const confirmarSinalRecebido = async (ev, { metodo, data }) => {
    setAtualizando(ev.id);
    try {
      // O valor confirmado é o que se regista (o previsto lido ao
      // abrir a confirmação — ver pedirSinal); a metade é só a rede.
      const valorSinal =
        confirmandoSinal?.id === ev.id
          ? confirmandoSinal.valorSinal
          : (Number(ev.valor_acordado) || 0) / 2;
      // O plano sincroniza-se como o registarSinalDoFunil fazia — o
      // previsto de ordem 1 tem de existir para o pagamento se
      // pendurar nele. Falhar não trava a guarda: a RPC aguenta um
      // pagamento solto (o saldo conta-se sempre dos pagamentos, 025).
      try {
        await sincronizarPrevistos(
          ev.id,
          Number(ev.valor_acordado) || 0,
          ev.data_evento,
        );
      } catch (e2) {
        console.warn("Plano por sincronizar antes da guarda:", e2);
      }
      const resposta = await registarSinalComGuarda({
        submissionId: ev.id,
        valor: valorSinal,
        data,
        metodo,
      });
      if (resposta === null) {
        // A 083 ainda não correu nesta BD — o fluxo de sempre, por
        // inteiro: fase primeiro, registo depois, avisos de sempre.
        await updateFase(ev.id, "contrato");
        setEventos((prev) =>
          prev.map((e) => (e.id === ev.id ? { ...e, fase: "contrato" } : e)),
        );
        try {
          const registo = await registarSinalDoFunil(
            ev.id,
            ev.valor_acordado,
            ev.data_evento,
            { metodo, data },
          );
          if (!registo) {
            // Devolveu null sem erro: sem plano utilizável ou o sinal
            // já tinha um pagamento — a fase avançou, mas nada foi
            // registado AGORA. Diz-se, em vez do silêncio.
            mostrarAviso(
              "A fase avançou, mas o sinal não ficou registado agora (sem plano utilizável ou já existia um pagamento do sinal) — confirma na ficha do evento.",
              6000,
            );
          } else {
            // O sinal entrou pelo caminho antigo — a oferta de aviso à
            // cliente é a mesma (10/08).
            setAvisoSinalPago(ev);
          }
        } catch (e2) {
          console.error("registarSinalDoFunil falhou:", e2);
          mostrarAviso(
            "A fase avançou, mas não foi possível registar o pagamento do sinal — registe-o na ficha do evento.",
            6000,
          );
        }
        if (onDadosMudaram) onDadosMudaram();
      } else if (resposta.estado === "ok") {
        // O sinal está no livro — AGORA a fase pode afirmá-lo.
        try {
          await updateFase(ev.id, "contrato");
          setEventos((prev) =>
            prev.map((e) => (e.id === ev.id ? { ...e, fase: "contrato" } : e)),
          );
        } catch (e2) {
          console.error(e2);
          mostrarAviso(
            "O sinal ficou registado, mas a fase não avançou — tenta outra vez ou acerta-a na ficha do evento.",
            6000,
          );
        }
        // O elo que faltava (10/08): o sinal entrou — oferece-se o
        // aviso à cliente. Oferece-se: o envio é gesto da Nádia.
        setAvisoSinalPago(ev);
        if (onDadosMudaram) onDadosMudaram();
      } else if (
        ["ja_registado", "dia_tomado", "prazo_alheio"].includes(resposta.estado)
      ) {
        // A guarda recusou: nada avançou, nada se escreveu — a recusa
        // fala no cartão e a decisão é dela (padrão inline da casa).
        setDisputaCartao({
          id: ev.id,
          porta: "sinal",
          estado: resposta.estado,
          rival: resposta.rival_nome || null,
          ate: resposta.ate || null,
          dados: { metodo, data, valorSinal },
        });
      } else {
        mostrarAviso(
          "Não foi possível registar o sinal — verifica a ligação e as migrações.",
        );
      }
    } catch (e) {
      console.error(e);
      mostrarAviso(
        "Não foi possível registar o sinal — verifica a ligação e as migrações.",
      );
    }
    setAtualizando(null);
    setConfirmandoSinal(null);
  };

  // O «Registar na mesma» do prazo alheio — a mesma guarda, com
  // forcar: a promessa quebra-se CONSCIENTE, nunca por acidente. Se
  // entretanto o dia ficou tomado a sério (a corrida perdeu-se), a
  // resposta nova substitui o painel.
  const forcarSinalFunil = async (ev) => {
    if (disputaCartao?.id !== ev.id || disputaCartao.porta !== "sinal") return;
    const { metodo, data, valorSinal } = disputaCartao.dados;
    setAtualizando(ev.id);
    try {
      const resposta = await registarSinalComGuarda({
        submissionId: ev.id,
        valor: valorSinal,
        data,
        metodo,
        forcar: true,
      });
      if (resposta?.estado === "ok") {
        setDisputaCartao(null);
        try {
          await updateFase(ev.id, "contrato");
          setEventos((prev) =>
            prev.map((e) => (e.id === ev.id ? { ...e, fase: "contrato" } : e)),
          );
        } catch (e2) {
          console.error(e2);
          mostrarAviso(
            "O sinal ficou registado, mas a fase não avançou — tenta outra vez ou acerta-a na ficha do evento.",
            6000,
          );
        }
        // O elo que faltava (10/08): o sinal entrou — oferece-se o
        // aviso à cliente. Oferece-se: o envio é gesto da Nádia.
        setAvisoSinalPago(ev);
        if (onDadosMudaram) onDadosMudaram();
      } else if (
        resposta &&
        ["ja_registado", "dia_tomado", "prazo_alheio"].includes(resposta.estado)
      ) {
        setDisputaCartao({
          id: ev.id,
          porta: "sinal",
          estado: resposta.estado,
          rival: resposta.rival_nome || null,
          ate: resposta.ate || null,
          dados: { metodo, data, valorSinal },
        });
      } else {
        setDisputaCartao(null);
        mostrarAviso(
          "Não foi possível registar o sinal — verifica a ligação e as migrações.",
        );
      }
    } catch (e) {
      console.error(e);
      mostrarAviso(
        "Não foi possível registar o sinal — verifica a ligação e as migrações.",
      );
    }
    setAtualizando(null);
  };

  const nomeTipo = (ev) => {
    const t = eventTypes.find((x) => x.id === ev.event_type_id);
    if (t?.nome) return t.nome;
    // Tipo "Outro" da captação — o texto do cliente com a marca ✳
    // (por classificar) até ser associado a um modelo na ficha.
    const livre = (ev.respostas?.tipoEventoOutro || "").trim();
    return livre ? `${livre} ✳` : "Evento";
  };

  // O nome no card: o cliente (a pessoa que contrata); se o evento não
  // tiver cliente ligado, o título do resumo (dupla fonte).
  // O card é do EVENTO: mostra o nome digitado na captação (resumo).
  // Só cai no nome do CLIENTE quando o evento não tem nome próprio
  // (o resumo devolveu o genérico) — importa quando a deduplicação
  // pendura um evento novo num cliente antigo: sem isto, o nome novo
  // ficava escondido atrás do antigo.
  const nomeCard = (ev) => {
    const resumo = getResumoSubmissao(ev, eventTypes);
    const tipo = eventTypes.find((t) => t.id === ev.event_type_id);
    const generico =
      !resumo.titulo ||
      resumo.titulo === "Evento" ||
      (tipo && resumo.titulo === tipo.nome);
    return generico ? ev.clientes?.nome || resumo.titulo : resumo.titulo;
  };

  // Só a PRIMEIRA carga mostra o texto; nas recargas (realtime, drawer)
  // o board anterior fica visível — sem piscar.
  if (carregando && eventos.length === 0) {
    return (
      <p style={{ color: "var(--gray-mid)", fontSize: "14px" }}>
        A carregar o funil...
      </p>
    );
  }
  if (erro) {
    return <p style={{ color: "var(--perigo)", fontSize: "14px" }}>{erro}</p>;
  }

  const perdidos = eventos.filter((e) => faseDe(e) === "perdido");

  return (
    <div>
      {/* Barra de topo: novo interessado (o caso Instagram: a Nádia
          transcreve a conversa) + filtro de perdidos */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "10px",
          marginBottom: "14px",
        }}
      >
        <button
          onClick={() => setNovoInteressado(true)}
          style={{
            padding: "9px 18px",
            borderRadius: "10px",
            fontSize: "13px",
            fontWeight: "600",
            border: "none",
            backgroundColor: "var(--gold)",
            color: "var(--texto-sobre-ouro)",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(var(--ouro-rgb), 0.3)",
            whiteSpace: "nowrap",
          }}
        >
          + Registar pedido
        </button>
        <button
          onClick={() => setMostrarPerdidos((v) => !v)}
          style={{
            padding: "7px 16px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: mostrarPerdidos ? "600" : "500",
            border: `1.5px solid ${mostrarPerdidos ? "#9CA3AF" : "var(--gold-light)"}`,
            // O estado activo (#F3F4F6/#9CA3AF) está fora da paleta —
            // como a cor do texto é partilhada pelos dois estados, o
            // par fica literal nos dois e o texto fixa-se no literal
            // claro; segue no relatório de violações.
            backgroundColor: mostrarPerdidos ? "#F3F4F6" : "white",
            color: "#6B6B6B",
            cursor: "pointer",
            transition: "all 0.2s",
            whiteSpace: "nowrap",
          }}
        >
          {mostrarPerdidos ? "✓ " : ""}Ver perdidos ({perdidos.length})
        </button>
      </div>

      {avisoErro && (
        <p
          style={{
            fontSize: "12px",
            color: "var(--perigo)",
            backgroundColor: "var(--perigo-fundo)",
            border: "1px solid var(--perigo-borda)",
            borderRadius: "10px",
            padding: "8px 14px",
            margin: "0 0 12px 0",
          }}
        >
          {avisoErro}
        </p>
      )}

      {/* A oferta de aviso à cliente — o sinal entrou pelo funil e ela
          ainda não sabe. O envio é sempre um gesto da Nádia. */}
      {avisoSinalPago && (
        <AvisoSinalRecebido
          evento={avisoSinalPago}
          aoFechar={() => setAvisoSinalPago(null)}
          style={{ margin: "0 0 12px 0" }}
        />
      )}

      {/* ===== AS TRÊS COLUNAS DA NÁDIA =====
          Interessados (pré-sinal) | Clientes (pós-sinal, status
          "Recebido") | Em Preparação (pós-sinal, status "Em Preparação"
          ou "Confirmado"). As ETAPAS viram pastilhas nos cartões;
          "Sinal recebido →" atravessa o cartão para a direita sozinho
          (é só a fase a mudar), e o clique em "Em Preparação" no drawer
          atravessa-o para a terceira (é só o status a mudar). O € vive
          nos cabeçalhos — garantido total = Clientes + Em Preparação. */}
      {(() => {
        // Ordem final (077): a fase 'sinal' é o limbo pós-aceite (50%
        // por pagar) e vive na coluna Interessados (em negociação).
        // Pós-sinal ficam contrato, cliente e projecto: é o sinal pago
        // que garante a data e o dinheiro — o contrato por assinar já
        // é um negócio garantido.
        const FASES_ESQ = ["interessado", "orcamento", "sinal"];
        const FASES_DIR = ["contrato", "cliente", "projecto"];
        const ordemFase = (f) => FASES_BOARD.indexOf(f);
        const ordenar = (lista) =>
          [...lista].sort((a, b) => {
            const df = ordemFase(faseDe(a)) - ordemFase(faseDe(b));
            if (df !== 0) return df;
            if (!a.data_evento) return 1;
            if (!b.data_evento) return -1;
            return new Date(a.data_evento) - new Date(b.data_evento);
          });
        const interessados = ordenar(
          eventos.filter((e) => FASES_ESQ.includes(faseDe(e))),
        );
        // Pós-sinal ativos, repartidos pela REALIDADE do trabalho: um
        // cartão atravessa para a Em Preparação quando o status o diz
        // (o gesto manual do drawer continua a mandar) OU quando a
        // preparação começou de facto — primeiro formulário, projecto
        // ou material. A coluna Clientes fica para o que está ganho e
        // ainda intocado; é o apanha-tudo (status nulo ou desconhecido
        // incluído) — nenhum evento desaparece do board.
        const posSinalAtivos = eventos.filter(
          (e) => FASES_DIR.includes(faseDe(e)) && e.status !== "Concluído",
        );
        const estaEmPreparacao = (e) =>
          STATUS_EM_PREPARACAO.includes(e.status) || preparacaoComecou(e);
        const emPreparacao = ordenar(posSinalAtivos.filter(estaEmPreparacao));
        const clientes = ordenar(
          posSinalAtivos.filter((e) => !estaEmPreparacao(e)),
        );

        // As COLUNAS ficam literais (ilhas claras nos dois modos): duas
        // das quatro têm fundos fora da paleta (#F6FBF6 verde, #F5F9FF
        // azul) e, como a componente é partilhada, o par inteiro
        // congela nas quatro — com os textos cinzentos fixados no
        // literal claro, para nunca ficar letra clara sobre fundo
        // claro no escuro. Os fora-de-paleta seguem no relatório.
        const Coluna = ({ titulo, cor, fundo, borda, lista, legendaEuros, comTrilho }) => (
          <div
            style={{
              backgroundColor: fundo,
              borderRadius: "14px",
              padding: "14px",
              border: `1px solid ${borda}`,
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: "700",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: cor,
                  margin: 0,
                }}
              >
                {titulo}
              </p>
              <span style={{ fontSize: "12px", color: "#6B6B6B" }}>
                {lista.length}
              </span>
            </div>
            <p
              style={{
                fontSize: "15px",
                fontWeight: "700",
                color: cor,
                margin: "2px 0 14px 0",
              }}
            >
              {formatarEuros(somaValores(lista))}{" "}
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: "400",
                  color: "#6B6B6B",
                }}
              >
                {legendaEuros}
              </span>
            </p>
            {lista.length === 0 ? (
              <p
                style={{
                  fontSize: "12px",
                  fontStyle: "italic",
                  color: "#6B6B6B",
                  textAlign: "center",
                  padding: "18px 0",
                  margin: 0,
                }}
              >
                Sem eventos nesta coluna.
              </p>
            ) : (
              lista.map((ev) => (
                <CardEvento
                  key={ev.id}
                  evento={ev}
                  fase={faseDe(ev)}
                  nome={nomeCard(ev)}
                  tipo={nomeTipo(ev)}
                  trilho={comTrilho ? trilhoDe(ev) : null}
                  aAtualizar={atualizando === ev.id}
                  aConfirmarPerda={confirmandoPerda === ev.id}
                  aConfirmarSinal={confirmandoSinal?.id === ev.id}
                  valorSinalConfirmacao={
                    confirmandoSinal?.id === ev.id
                      ? confirmandoSinal.valorSinal
                      : null
                  }
                  onAbrir={() => onAbrirEvento && onAbrirEvento(ev)}
                  onAvancar={() => avancarComGuardaDia(ev, PROXIMA_FASE[faseDe(ev)])}
                  onPedirPerda={() => setConfirmandoPerda(ev.id)}
                  onCancelarPerda={() => setConfirmandoPerda(null)}
                  onConfirmarPerda={() => mudarFase(ev, "perdido")}
                  aEscolherRecuperacao={
                    recuperando?.id === ev.id ? recuperando : null
                  }
                  onRecuperar={() => pedirRecuperacao(ev)}
                  onRecuperarPara={(fase, opcoes) =>
                    mudarFase(ev, fase, opcoes)
                  }
                  onCancelarRecuperacao={() => setRecuperando(null)}
                  aConfirmarAvancoSemValor={
                    confirmandoAvancoSemValor === ev.id
                  }
                  onPedirAvancoSemValor={() =>
                    setConfirmandoAvancoSemValor(ev.id)
                  }
                  onConfirmarAvancoSemValor={() =>
                    avancarComGuardaDia(ev, "contrato")
                  }
                  onCancelarAvancoSemValor={() =>
                    setConfirmandoAvancoSemValor(null)
                  }
                  onPedirSinal={() => pedirSinal(ev)}
                  onCancelarSinal={() => setConfirmandoSinal(null)}
                  onConfirmarSinal={(dados) => confirmarSinalRecebido(ev, dados)}
                  disputaDia={
                    disputaCartao?.id === ev.id ? disputaCartao : null
                  }
                  onForcarSinalDisputado={() => forcarSinalFunil(ev)}
                  onAvancarDisputado={() => {
                    if (disputaCartao?.id === ev.id && disputaCartao.dados)
                      mudarFase(
                        ev,
                        disputaCartao.dados.fase,
                        disputaCartao.dados.opcoes,
                      );
                  }}
                  onFecharDisputa={() => setDisputaCartao(null)}
                />
              ))
            )}
          </div>
        );

        return (
          <div
            style={{
              display: "grid",
              // 280px: 3 colunas cabem lado a lado no contentor de
              // 960px do Admin (com 300px a terceira embrulhava para
              // baixo por 16px). No telemóvel continuam empilhadas.
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "14px",
              alignItems: "start",
            }}
          >
            <Coluna
              titulo="Interessados"
              // Preso ao claro como a coluna toda: ouro-texto do tema
              // sobre uma coluna congelada ao claro morreria no escuro.
              cor="#A07830"
              fundo="#FBF7EF"
              borda="#F0EBE0"
              lista={interessados}
              legendaEuros="em negociação"
            />
            <Coluna
              titulo="Clientes"
              cor="#166534"
              fundo="#F6FBF6"
              borda="#CDEBD3"
              lista={clientes}
              legendaEuros="garantidos (sinal pago)"
            />
            <Coluna
              titulo="Em Preparação"
              cor="#3B82F6"
              fundo="#F5F9FF"
              borda="#BFDBFE"
              lista={emPreparacao}
              legendaEuros="em preparação"
              comTrilho
            />
            {mostrarPerdidos && (
              <Coluna
                titulo="Perdidos"
                cor="#6B6B6B"
                fundo="#F9FAFB"
                borda="#E5E7EB"
                lista={perdidos}
                legendaEuros=""
              />
            )}
          </div>
        );
      })()}

      {/* Modal: novo interessado — reutiliza o CaptacaoForm da página
          pública (uma UI, duas portas). Ao criar, recarrega o funil. */}
      {novoInteressado && (
        <div
          onClick={() => setNovoInteressado(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            backgroundColor: "var(--cortina)",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            padding: "24px 16px",
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--superficie)",
              borderRadius: "16px",
              padding: "22px 20px",
              width: "100%",
              maxWidth: "440px",
              border: "1px solid var(--gold-light)",
              // sombra preta fica literal (32px ≠ os 28px da
              // --sombra-flutuante — não é o token completo)
              boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "4px",
              }}
            >
              <h3
                style={{
                  fontSize: "17px",
                  fontFamily: "Playfair Display, serif",
                  color: "var(--charcoal)",
                  margin: 0,
                }}
              >
                Novo pedido
              </h3>
              <button
                onClick={() => setNovoInteressado(false)}
                aria-label="Fechar"
                style={{
                  fontSize: "18px",
                  color: "var(--gray-mid)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
            <p
              style={{
                fontSize: "12px",
                color: "var(--gray-mid)",
                margin: "0 0 16px 0",
              }}
            >
              Transcreve o que a pessoa te disse na conversa.
            </p>
            <CaptacaoForm
              modoInterno
              textoBotao="Registar pedido"
              onSubmetido={() => {
                setNovoInteressado(false);
                carregar();
                if (onDadosMudaram) onDadosMudaram();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Método + data do sinal — a única pergunta que "Sinal recebido →"
// faz antes de avançar (é dinheiro a sério, ver registarSinalDoFunil).
// Vive dentro do card (onClick já para de propagar por causa do wrap).
// ------------------------------------------------------------
function FormularioSinalInline({ valorSinal, aAtualizar, onConfirmar, onCancelar }) {
  const [metodo, setMetodo] = useState("");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));

  const inputStyle = {
    width: "100%",
    padding: "6px 8px",
    borderRadius: "6px",
    border: "1.5px solid var(--gold-light)",
    fontSize: "12px",
    marginBottom: "6px",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <p style={{ fontSize: "11px", color: "var(--gray-mid)", margin: "0 0 6px 0" }}>
        Sinal recebido — {formatarEuros(valorSinal)}
      </p>
      <input
        list="metodos-pagamento-funil"
        placeholder="Método de pagamento"
        value={metodo}
        onChange={(e) => setMetodo(e.target.value)}
        style={inputStyle}
      />
      <datalist id="metodos-pagamento-funil">
        {METODOS_SUGERIDOS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <input
        type="date"
        value={data}
        onChange={(e) => setData(e.target.value)}
        style={{ ...inputStyle, marginBottom: "8px" }}
      />
      <div style={{ display: "flex", gap: "6px" }}>
        <button
          onClick={() => metodo && onConfirmar({ metodo, data })}
          disabled={aAtualizar || !metodo}
          style={{
            flex: 1,
            padding: "7px 8px",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: "600",
            border: "none",
            backgroundColor: "var(--gold)",
            color: "var(--texto-sobre-ouro)",
            cursor: aAtualizar || !metodo ? "not-allowed" : "pointer",
          }}
        >
          {aAtualizar ? "..." : "Confirmar"}
        </button>
        <button
          onClick={onCancelar}
          disabled={aAtualizar}
          style={{
            flex: 1,
            padding: "7px 8px",
            borderRadius: "8px",
            fontSize: "12px",
            border: "1px solid var(--neutro-borda)",
            backgroundColor: "var(--superficie)",
            color: "var(--gray-mid)",
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// O painel âmbar da disputa do dia (083), dentro do cartão — a recusa
// da guarda no «Sinal recebido →» (porta 'sinal') ou o aviso do avanço
// à mão para pós-sinal (porta 'avanco'). Padrão âmbar da casa
// (FormulariosOrfaos: #FEF3E2/#F0D9B5/#92400E, linha do ⚠ a 13px/700)
// com os botões do registo ofício (12.5px/600, raio 10px — mockup 2c).
// O wrap com stopPropagation segue a lição do FormularioSinalInline:
// sem ele, o clique no texto abria o drawer do cartão.
// ------------------------------------------------------------
function PainelDisputaCartao({
  disputa,
  dataEvento,
  aAtualizar,
  onForcarSinal,
  onAvancar,
  onFechar,
}) {
  const rival = disputa.rival || "outra cliente";
  const linha = {
    fontSize: "13px",
    fontWeight: "700",
    color: "var(--aviso-texto)",
    lineHeight: 1.5,
    margin: "0 0 6px",
  };
  const corpo = {
    fontSize: "12.5px",
    color: "var(--aviso-texto)",
    lineHeight: 1.55,
    margin: "0 0 10px",
  };
  const btnBase = {
    fontSize: "12.5px",
    fontWeight: "600",
    padding: "8px 14px",
    borderRadius: "10px",
    cursor: aAtualizar ? "wait" : "pointer",
  };
  const btnCalmo = {
    ...btnBase,
    border: "1.5px solid var(--aviso-borda)",
    backgroundColor: "var(--superficie)",
    color: "var(--aviso-texto)",
  };
  const btnForte = {
    ...btnBase,
    border: "1.5px solid var(--gold)",
    backgroundColor: "var(--gold)",
    color: "var(--texto-sobre-ouro)",
  };

  // Cada porta com a sua conversa — a acção forte só existe onde a
  // decisão é mesmo dela (quebrar o prazo, avançar por cima do aviso).
  let titulo;
  let texto;
  let accao = null;
  let rotuloAccao = "";
  if (disputa.porta === "sinal") {
    if (disputa.estado === "ja_registado") {
      titulo = "⚠ Este evento já tem o sinal registado";
      texto =
        "Um segundo pagamento do sinal não entra por aqui — confirma na ficha do evento (é lá que a fase também se acerta).";
    } else if (disputa.estado === "dia_tomado") {
      titulo = `⚠ O dia ${formatarData(dataEvento)} está reservado por ${rival}`;
      texto =
        "Este registo não pode entrar — só o primeiro sinal registado reserva o dia. Combine uma nova data com esta cliente.";
    } else {
      // prazo_alheio
      titulo = `⚠ Guardou o dia a ${rival}${
        disputa.ate ? ` até ${formatarData(disputa.ate)}` : ""
      }`;
      texto =
        "Registar este sinal quebra essa promessa — o portal dela passa a mostrá-lo, com as desculpas da casa.";
      accao = onForcarSinal;
      rotuloAccao = "Registar na mesma";
    }
  } else {
    titulo = "⚠ Este avanço reserva o dia aos olhos do portal";
    texto = `O dia ${formatarData(dataEvento)} ${descreveEstadoDia(
      disputa,
    )}. Avançar não regista dinheiro nenhum — e o rival fica vivo, à espera da sua conversa.`;
    accao = onAvancar;
    rotuloAccao = "Avançar na mesma";
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        backgroundColor: "var(--aviso-fundo)",
        border: "1.5px solid var(--aviso-borda)",
        borderRadius: "12px",
        padding: "12px 14px",
      }}
    >
      <p style={linha}>{titulo}</p>
      <p style={corpo}>{texto}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {accao && (
          <button
            onClick={accao}
            disabled={aAtualizar}
            className="acao"
            style={btnForte}
          >
            {aAtualizar ? "..." : rotuloAccao}
          </button>
        )}
        <button
          onClick={onFechar}
          disabled={aAtualizar}
          className="acao"
          style={btnCalmo}
        >
          {accao ? "Voltar" : "Fechar"}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Card de um evento no funil
// ------------------------------------------------------------
function CardEvento({
  evento,
  fase,
  nome,
  tipo,
  trilho,
  aAtualizar,
  aConfirmarPerda,
  aConfirmarSinal,
  valorSinalConfirmacao,
  aEscolherRecuperacao,
  aConfirmarAvancoSemValor,
  onAbrir,
  onAvancar,
  onPedirPerda,
  onCancelarPerda,
  onConfirmarPerda,
  onRecuperar,
  onRecuperarPara,
  onCancelarRecuperacao,
  onPedirAvancoSemValor,
  onConfirmarAvancoSemValor,
  onCancelarAvancoSemValor,
  onPedirSinal,
  onCancelarSinal,
  onConfirmarSinal,
  disputaDia,
  onForcarSinalDisputado,
  onAvancarDisputado,
  onFecharDisputa,
}) {
  const proxima = PROXIMA_FASE[fase];
  const ehPerdido = fase === "perdido";
  const temValor =
    evento.valor_acordado !== null && evento.valor_acordado !== undefined;
  // Para DECIDIR o caminho do sinal, "ter valor" é > 0 — o mesmo gate
  // do registarSinalDoFunil (v <= 0 devolve null): um valor 0 abriria
  // o formulário de um sinal de 0,00 € e acabava no avanço silencioso
  // que este ramo existe para impedir. O temValor de cima continua a
  // mandar só na exibição do € no card.
  const temValorUtil = Number(evento.valor_acordado) > 0;

  return (
    <div
      onClick={onAbrir}
      style={{
        backgroundColor: "var(--superficie)",
        borderRadius: "12px",
        padding: "12px",
        marginBottom: "8px",
        // #F0EBE0 está fora da paleta (--borda é #F0E6D0) — fica
        // literal e segue no relatório de violações.
        border: "1px solid #F0EBE0",
        boxShadow: "var(--sombra-cartao)",
        cursor: "pointer",
        opacity: ehPerdido ? 0.85 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "8px",
          marginBottom: "2px",
        }}
      >
        <p
          style={{
            fontSize: "13px",
            fontWeight: "600",
            color: ehPerdido ? "var(--gray-mid)" : "var(--charcoal)",
            margin: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
          }}
        >
          {nome}
        </p>
        {/* A etapa — era uma coluna, agora é uma pastilha */}
        <span
          style={{
            flexShrink: 0,
            fontSize: "8.5px",
            fontWeight: "700",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            padding: "3px 9px",
            borderRadius: "999px",
            // O fundo de recurso #F3F4F6 está fora da paleta — o par
            // de recurso fica literal, com o texto fixado no literal
            // claro (nunca letra clara sobre fundo claro no escuro).
            backgroundColor: (FASE_COR[fase] || {}).bg || "#F3F4F6",
            color: (FASE_COR[fase] || {}).cor || "#6B6B6B",
          }}
        >
          {FASE_LABEL[fase] || fase}
        </span>
      </div>
      <p
        style={{
          fontSize: "12px",
          color: "var(--gray-mid)",
          margin: temValor ? "0 0 2px 0" : "0 0 10px 0",
        }}
      >
        {tipo} · {formatarData(evento.data_evento)}
      </p>
      {temValor && (
        <p
          style={{
            fontSize: "12px",
            fontWeight: "600",
            color: "var(--gold-dark)",
            margin: "0 0 10px 0",
          }}
        >
          {formatarEuros(evento.valor_acordado)}
          {fase === "sinal" &&
            ` · sinal (50%): ${formatarEuros(evento.valor_acordado / 2)}`}
        </p>
      )}
      {!temValor && fase === "sinal" && (
        <p
          style={{
            fontSize: "11px",
            fontStyle: "italic",
            color: "var(--gray-mid)",
            margin: "0 0 10px 0",
          }}
        >
          sem valor acordado — define-o no evento (✏️ Editar)
        </p>
      )}

      {/* O trilho de preparação — só nos cartões pós-sinal: com o
          negócio fechado, o que se quer ver de relance é o trabalho. */}
      {trilho && <TrilhoPreparacao itens={trilho} />}

      {/* Ações — dependem do estado */}
      {disputaDia ? (
        // A disputa do dia (083) fala primeiro: enquanto está de pé,
        // nenhuma outra pergunta do cartão faz sentido por baixo dela.
        <PainelDisputaCartao
          disputa={disputaDia}
          dataEvento={evento.data_evento}
          aAtualizar={aAtualizar}
          onForcarSinal={onForcarSinalDisputado}
          onAvancar={onAvancarDisputado}
          onFechar={onFecharDisputa}
        />
      ) : aConfirmarPerda ? (
        <div>
          <p
            style={{
              fontSize: "12px",
              color: "var(--gray-mid)",
              margin: "0 0 8px 0",
            }}
          >
            Marcar como perdido?
          </p>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConfirmarPerda();
              }}
              disabled={aAtualizar}
              style={{
                flex: 1,
                padding: "7px 8px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: "600",
                border: "none",
                // Botão de perigo CHEIO: o token desse papel é
                // --perigo-cheio (#EF4444), valor diferente — não se
                // aproxima; o par fica literal (branco sobre #DC2626
                // lê-se nos dois modos) e segue no relatório.
                backgroundColor: "#DC2626",
                color: "white",
                cursor: aAtualizar ? "wait" : "pointer",
              }}
            >
              {aAtualizar ? "..." : "Sim, perdido"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancelarPerda();
              }}
              style={{
                flex: 1,
                padding: "7px 8px",
                borderRadius: "8px",
                fontSize: "12px",
                border: "1px solid var(--neutro-borda)",
                backgroundColor: "var(--superficie)",
                color: "var(--gray-mid)",
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : aConfirmarSinal ? (
        <FormularioSinalInline
          valorSinal={
            valorSinalConfirmacao ?? (Number(evento.valor_acordado) || 0) / 2
          }
          aAtualizar={aAtualizar}
          onConfirmar={onConfirmarSinal}
          onCancelar={onCancelarSinal}
        />
      ) : aConfirmarAvancoSemValor && fase === "sinal" && !temValorUtil ? (
        // AUTOVALIDANTE: se os dados mudaram por baixo (valor definido
        // no drawer, fase alterada, evento perdido), a pergunta antiga
        // deixaria de ser verdade — cai-se nos ramos normais em vez de
        // afirmar coisas falsas ou contornar a recuperação informada.
        <div onClick={(e) => e.stopPropagation()}>
          <p
            style={{
              fontSize: "12px",
              color: "var(--gray-mid)",
              margin: "0 0 8px 0",
            }}
          >
            Sem valor acordado, avançar <strong>não regista dinheiro</strong> —
            o evento passa a «garantido (sinal pago)» sem um cêntimo na ficha.
            Define o valor no evento primeiro, ou avança na mesma.
          </p>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConfirmarAvancoSemValor();
              }}
              disabled={aAtualizar}
              style={{
                flex: 1,
                padding: "7px 8px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: "600",
                border: "1.5px solid var(--gold)",
                backgroundColor: "var(--superficie)",
                color: "var(--gold)",
                cursor: aAtualizar ? "wait" : "pointer",
              }}
            >
              {aAtualizar ? "..." : "Avançar na mesma"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancelarAvancoSemValor();
              }}
              style={{
                flex: 1,
                padding: "7px 8px",
                borderRadius: "8px",
                fontSize: "12px",
                border: "1px solid var(--neutro-borda)",
                backgroundColor: "var(--superficie)",
                color: "var(--gray-mid)",
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : aEscolherRecuperacao ? (
        // O perdido tem dinheiro registado: a escolha é da Nádia,
        // inline, com a saída provável destacada pelo saldo do sinal.
        // O wrap com stopPropagation segue a lição do
        // FormularioSinalInline: sem ele, um clique no texto ou entre
        // botões propagava ao onAbrir do cartão e abria o drawer.
        <div onClick={(e) => e.stopPropagation()}>
          <p
            style={{
              fontSize: "12px",
              color: "var(--gray-mid)",
              margin: "0 0 8px 0",
            }}
          >
            Este evento tem{" "}
            <strong>{formatarEuros(aEscolherRecuperacao.totalPago)}</strong>{" "}
            registados
            {aEscolherRecuperacao.sinalPago ? " — o sinal está pago" : ""}.
            Recuperar para onde?
          </p>
          {aEscolherRecuperacao.disputa && (
            // A disputa do dia (083): a data deste perdido já não está
            // simplesmente livre — diz-se antes da escolha, porque
            // «Para Clientes» volta a pôr o evento em cima do dia.
            <p
              style={{
                fontSize: "12px",
                color: "var(--aviso-texto)",
                backgroundColor: "var(--aviso-fundo)",
                border: "1px solid var(--aviso-borda)",
                borderRadius: "8px",
                padding: "7px 9px",
                lineHeight: 1.5,
                margin: "0 0 8px",
              }}
            >
              <span style={{ fontSize: "13px", fontWeight: "700" }}>⚠</span>{" "}
              O dia {formatarData(evento.data_evento)}{" "}
              {descreveEstadoDia(aEscolherRecuperacao.disputa)} — recuperar
              «Para Clientes» põe este evento em cima dessa disputa.
            </p>
          )}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "6px" }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                // A coluna Clientes, pela porta honesta da ordem final:
                // o dinheiro prova o sinal pago (fase 'contrato'); a
                // assinatura, se existir, confirma-se depois no funil.
                onRecuperarPara("contrato", {});
              }}
              disabled={aAtualizar}
              style={{
                padding: "7px 8px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: "600",
                // #D1D5DB está fora da paleta (--neutro-borda é
                // #E5E7EB) — fica literal e segue no relatório (idem
                // nos dois botões abaixo).
                border: aEscolherRecuperacao.sinalPago
                  ? "1.5px solid var(--gold)"
                  : "1px solid #D1D5DB",
                backgroundColor: aEscolherRecuperacao.sinalPago
                  ? "var(--gold)"
                  : "var(--superficie)",
                color: aEscolherRecuperacao.sinalPago
                  ? "var(--texto-sobre-ouro)"
                  : "var(--gray-mid)",
                cursor: aAtualizar ? "wait" : "pointer",
              }}
            >
              {aAtualizar ? "..." : "Para Clientes — mantém o estado"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRecuperarPara("interessado", { status: "Recebido" });
              }}
              disabled={aAtualizar}
              style={{
                padding: "7px 8px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: "600",
                border: !aEscolherRecuperacao.sinalPago
                  ? "1.5px solid var(--gold)"
                  : "1px solid #D1D5DB",
                backgroundColor: !aEscolherRecuperacao.sinalPago
                  ? "var(--gold)"
                  : "var(--superficie)",
                color: !aEscolherRecuperacao.sinalPago
                  ? "var(--texto-sobre-ouro)"
                  : "var(--gray-mid)",
                cursor: aAtualizar ? "wait" : "pointer",
              }}
            >
              {aAtualizar ? "..." : "Para Interessados — limpa o estado"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancelarRecuperacao();
              }}
              style={{
                padding: "6px 8px",
                borderRadius: "8px",
                fontSize: "12px",
                border: "1px solid var(--neutro-borda)",
                backgroundColor: "var(--superficie)",
                color: "var(--gray-mid)",
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : ehPerdido ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRecuperar();
          }}
          disabled={aAtualizar}
          style={{
            width: "100%",
            padding: "7px 8px",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: "600",
            border: "1px solid #D1D5DB",
            backgroundColor: "var(--superficie)",
            color: "var(--gray-mid)",
            cursor: aAtualizar ? "wait" : "pointer",
          }}
        >
          {aAtualizar ? "A recuperar..." : "↩ Recuperar"}
        </button>
      ) : (
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {proxima && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (fase === "sinal" && temValorUtil) {
                  onPedirSinal();
                } else if (fase === "sinal") {
                  // Sem valor acordado UTILIZÁVEL não há plano nem
                  // registo de dinheiro — o avanço confirma-se com a
                  // consequência à vista, nunca em silêncio.
                  onPedirAvancoSemValor();
                } else {
                  onAvancar();
                }
              }}
              disabled={aAtualizar}
              style={{
                flex: 1,
                padding: "7px 8px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: "600",
                border: "1.5px solid var(--gold)",
                backgroundColor: "var(--superficie)",
                color: "var(--gold)",
                cursor: aAtualizar ? "wait" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {aAtualizar ? "..." : `${AVANCO_LABEL[fase] || FASE_LABEL[proxima]} →`}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPedirPerda();
            }}
            title="Marcar como perdido"
            style={{
              padding: "7px 8px",
              borderRadius: "8px",
              fontSize: "12px",
              border: "none",
              backgroundColor: "transparent",
              color: "var(--gray-mid)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            perder
          </button>
        </div>
      )}
    </div>
  );
}