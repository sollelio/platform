import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getClientes } from "../../lib/clientes";
import { caminhoDoContacto } from "../../lib/rotasAdmin";
import { FASE_LABEL, FASE_COR } from "./faseConfig";
import FunilBoard from "./FunilBoard";
import { Icone } from "./Navegacao";

// Memória da última vista escolhida (dura a sessão). Continua a existir,
// mas mudou de papel: agora a vista vive no URL (?vista=funil) e esta
// memória só decide o que fazer quando o URL NÃO diz nada — que é o caso
// de clicar «Clientes» no menu.
//
// Assim as duas coisas deixam de brigar (antes, uma variável de módulo
// ganhava sempre a corrida ao URL no primeiro render):
//   • um link partilhado com ?vista=... manda SEMPRE, é o que se prometeu
//     a quem o recebeu;
//   • sem indicação no URL, ela volta ao sítio onde estava — o hábito
//     dela não se perde;
//   • e o URL é normalizado logo a seguir, para a barra de endereço
//     nunca mentir sobre o que está no ecrã.
let ultimaVista = "lista";

// Memória da pesquisa, pela mesma razão e no mesmo idioma: entrar na
// ficha de uma cliente DESMONTA esta lista (são ramos exclusivos da
// mesma secção), por isso sem isto o texto procurado evaporava-se e ela
// tinha de o escrever outra vez a cada ida e volta. Não vai para o URL
// de propósito: um endereço partilhado não deve levar a pesquisa de
// quem o partilhou.
let ultimaBusca = "";

// ============================================================
// ClientesLista — a vista de Clientes: PESSOAS (não eventos), em duas
// vistas alternáveis:
//   • Lista  — cartões de pessoas
//   • Funil  — a esteira comercial por fases (FunilBoard)
//
// NA LISTA, clicar numa pessoa vai DIRECTO ao destino: ao evento dela
// se só tiver um vivo, à casa dela (/admin/contactos/:id) em qualquer
// outro caso. O painel lateral que abria aqui — com os eventos, o
// «+ Novo evento» e a remoção — mudou-se para essa casa, que tem
// endereço próprio e sobrevive a um F5.
//
// NO FUNIL, os cartões são EVENTOS e continuam a abrir o
// SubmissionDrawer pelo onAbrirEvento — de propósito: aquele cartão
// tem dez botões de confirmação inline a viver de stopPropagation, e
// transformá-lo numa navegação faria a página sair de baixo de uma
// confirmação de «marcar como perdido» a meio.
// ============================================================

const iniciais = (nome) =>
  (nome || "?")
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");

const tiposDoCliente = (c, eventTypes) => {
  const nomes = [
    ...new Set(
      (c.submissions || [])
        .map(
          (e) =>
            (eventTypes || []).find((t) => t.id === e.event_type_id)?.nome ||
            (e.tipoEventoOutro || e.respostas?.tipoEventoOutro || "").trim() ||
            null,
        )
        .filter(Boolean),
    ),
  ];
  if (nomes.length === 0)
    return `${c.totalEventos} ${c.totalEventos === 1 ? "evento" : "eventos"}`;
  const visiveis = nomes.slice(0, 2).join(" + ");
  const resto = nomes.length - 2;
  const contagem =
    c.totalEventos > nomes.length ? ` (${c.totalEventos} eventos)` : "";
  return `${visiveis}${resto > 0 ? ` +${resto}` : ""}${contagem}`;
};

// Data e hora de criação do contacto — visível no card (os cards
// vêm ordenados do mais recente para o mais antigo).
const formatarCriado = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
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
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${meses[d.getMonth()]} · ${hh}:${mm}`;
};

// A fase "mais avançada" de uma pessoa, para a pastilha do card da
// lista: um cliente fechado sobrepõe-se a tudo; senão, o ponto mais
// adiantado da negociação; só "perdido" quando todos os eventos o são.
// Torna visível, sem cliques, quem é cliente e quem é interessado.
const faseDaPessoa = (c) => {
  const fases = (c.submissions || []).map((e) => e.fase).filter(Boolean);
  if (fases.length === 0) return null;
  // Da mais adiantada para a mais recuada — a ordem final (077: o
  // sinal reserva a data antes do contrato; o projecto é o terminal).
  for (const f of [
    "projecto",
    "cliente",
    "contrato",
    "sinal",
    "orcamento",
    "interessado",
  ]) {
    if (fases.includes(f)) return f;
  }
  if (fases.every((f) => f === "perdido")) return "perdido";
  return null;
};

export default function ClientesLista({
  eventTypes = [],
  onAbrirEvento,
  onDadosMudaram,
  refrescarEm = 0,
  verPerdidos = null,
  aoConsumirVerPerdidos,
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const vistaDoUrl = searchParams.get("vista");
  const vista =
    vistaDoUrl === "funil" || vistaDoUrl === "lista" ? vistaDoUrl : ultimaVista;

  // Normaliza o endereço quando ele não diz (ou diz mal) qual é a vista.
  // `replace` de propósito: isto é uma correcção do URL, não um passo de
  // navegação — não deve ficar no histórico nem exigir dois «voltar».
  useEffect(() => {
    if (vistaDoUrl !== vista) {
      setSearchParams({ vista }, { replace: true });
    }
  }, [vistaDoUrl, vista, setSearchParams]);

  const trocarVista = (v) => {
    ultimaVista = v;
    setSearchParams({ vista: v }, { replace: true });
  };

  // Um pedido "ver perdidos" força a vista do funil (e fica na memória
  // da sessão, como qualquer troca manual) — o resto é com o FunilBoard.
  useEffect(() => {
    if (!verPerdidos) return;
    trocarVista("funil");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verPerdidos]);
  const [clientes, setClientes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [busca, setBusca] = useState(ultimaBusca);

  const carregar = async () => {
    setCarregando(true);
    setErro(null);
    try {
      const data = await getClientes();
      setClientes(data);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível carregar os clientes.");
    }
    setCarregando(false);
  };

  // Corre ao montar E sempre que se volta à vista Lista (trocar para o
  // Funil e voltar NÃO desmonta este componente — sem isto, um
  // interessado novo só aparecia depois de um refresh à página) ou
  // quando o AdminPage sinaliza uma mudança (refrescarEm).
  useEffect(() => {
    if (vista === "lista") carregar();
  }, [vista, refrescarEm]);

  // ------------------------------------------------------------
  // UM CLIQUE, E ACABOU — quando não há ambiguidade.
  //
  // A regra: se a pessoa tem exactamente UM evento vivo, o cartão leva
  // lá directamente. Tudo o resto leva à casa dela, onde escolhe.
  //
  // «Vivo» é fase !== "perdido" (decisão do Hélio, 29/07/2026): um
  // casamento que se perdeu no ano passado não deve roubar o atalho a
  // um aniversário a decorrer. Repare-se que os casos-limite caem todos
  // do lado seguro, sem becos:
  //   • 0 eventos          -> a casa dela, com o convite para criar o 1.º;
  //   • só eventos perdidos -> a casa dela, que os LISTA na mesma (é o
  //     único caminho para os recuperar — se o clique não abrisse nada,
  //     um cliente com um só evento perdido ficava inalcançável);
  //   • 2+ vivos           -> a casa dela, para escolher qual.
  //
  // A contagem não custa uma ida à base: a lista de clientes já traz os
  // eventos aninhados, com o id de cada um.
  // ------------------------------------------------------------
  const abrirCliente = (c) => {
    const vivos = (c.submissions || []).filter((e) => e.fase !== "perdido");
    navigate(
      vivos.length === 1
        ? `/evento/${vivos[0].id}`
        : caminhoDoContacto(c.id),
    );
  };

  // Pesquisa NORMALIZADA (Lote 3A, antecipada por decisão do Hélio na
  // Fase 1 — "ajuda a revelar duplicados"): acentos fora nos nomes
  // ("joao" encontra "João") e telefones comparados só por dígitos
  // ("912345678" encontra "912 345 678" e "+351 912 345 678").
  const semAcentos = (s) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const filtrados = clientes.filter((c) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    const texto = semAcentos(
      [c.nome, c.contacto, c.email].filter(Boolean).join(" ").toLowerCase(),
    );
    if (texto.includes(semAcentos(q))) return true;
    const qDigitos = q.replace(/\D/g, "");
    if (qDigitos.length >= 3) {
      // O número pode viver na ficha OU nas respostas dos eventos
      // (numeroWhatsapp/contactoPrincipal) — é onde o dedupe também o
      // procura; a pesquisa vê o mesmo que o sistema sabe.
      const numeros = [
        c.contacto,
        ...(c.submissions || []).flatMap((e) => [
          e.respostas?.contactoPrincipal,
          e.respostas?.numeroWhatsapp,
        ]),
      ]
        .filter(Boolean)
        .map((n) => String(n).replace(/\D/g, ""));
      if (numeros.some((n) => n.includes(qDigitos))) return true;
    }
    return false;
  });

  // Alternador Lista ↔ Funil — vive acima de tudo, nas duas vistas
  const alternador = (
    <div style={{ display: "flex", gap: "8px", marginBottom: "18px" }}>
      {[
        { id: "lista", label: "Lista", icone: "contactos" },
        { id: "funil", label: "Funil", icone: "funil" },
      ].map((v) => {
        const ativo = vista === v.id;
        return (
          <button
            key={v.id}
            onClick={() => {
              trocarVista(v.id);
            }}
            style={{
              padding: "8px 20px",
              borderRadius: "999px",
              fontSize: "13px",
              fontWeight: ativo ? "700" : "500",
              border: `1.5px solid ${ativo ? "var(--gold)" : "var(--gold-light)"}`,
              backgroundColor: ativo ? "var(--gold)" : "var(--superficie)",
              color: ativo ? "var(--texto-sobre-ouro)" : "var(--charcoal)",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Icone nome={v.icone} tamanho={15} />
              {v.label}
            </span>
          </button>
        );
      })}
    </div>
  );

  // ===== VISTA FUNIL =====
  if (vista === "funil") {
    return (
      <div>
        {alternador}
        <FunilBoard
          verPerdidos={verPerdidos}
          aoConsumirVerPerdidos={aoConsumirVerPerdidos}
          eventTypes={eventTypes}
          onAbrirEvento={onAbrirEvento}
          refrescarEm={refrescarEm}
          onDadosMudaram={() => {
            carregar(); // a lista de pessoas
            if (onDadosMudaram) onDadosMudaram(); // Agenda/Início (AdminPage)
          }}
        />
      </div>
    );
  }

  // ===== VISTA LISTA =====
  if (carregando) {
    return (
      <div>
        {alternador}
        <p style={{ color: "var(--gray-mid)", fontSize: "14px" }}>
          A carregar clientes...
        </p>
      </div>
    );
  }
  if (erro) {
    return (
      <div>
        {alternador}
        <p style={{ color: "var(--perigo)", fontSize: "14px" }}>{erro}</p>
      </div>
    );
  }

  return (
    <div>
      {alternador}
      <div>
        {/* ===== LISTA DE CLIENTES (pessoas) ===== */}
        <div>
          <input
            style={{
              width: "100%",
              padding: "11px 14px",
              borderRadius: "10px",
              border: "1.5px solid var(--gold-light)",
              fontSize: "13px",
              outline: "none",
              marginBottom: "14px",
              boxSizing: "border-box",
            }}
            placeholder="Procurar por nome, contacto ou email..."
            value={busca}
            onChange={(e) => {
              ultimaBusca = e.target.value;
              setBusca(e.target.value);
            }}
          />

          {filtrados.length === 0 && (
            <p style={{ color: "var(--gray-mid)", fontSize: "13px" }}>
              Nenhum cliente encontrado.
            </p>
          )}

          {filtrados.map((c) => {
            const fase = faseDaPessoa(c);
            const corFase = fase ? FASE_COR[fase] : null;
            return (
              <div
                key={c.id}
                onClick={() => abrirCliente(c)}
                style={{
                  backgroundColor: "var(--superficie)",
                  borderRadius: "14px",
                  padding: "14px 16px",
                  marginBottom: "10px",
                  // #F0EBE0 está fora da paleta (--borda é #F0E6D0) —
                  // fica literal e segue no relatório de violações.
                  border: "1px solid #F0EBE0",
                  boxShadow: "var(--sombra-cartao)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  transition: "border 0.15s",
                }}
              >
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "50%",
                    backgroundColor: "var(--superficie-quente)",
                    border: "1px solid var(--gold-light)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "Playfair Display, serif",
                    fontSize: "15px",
                    color: "var(--gold)",
                    flexShrink: 0,
                  }}
                >
                  {iniciais(c.nome)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: "14px",
                      fontWeight: "600",
                      color: "var(--charcoal)",
                      margin: 0,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {c.nome}
                  </p>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--gray-mid)",
                      margin: 0,
                    }}
                  >
                    {tiposDoCliente(c, eventTypes)}
                    {c.created_at ? ` · ${formatarCriado(c.created_at)}` : ""}
                  </p>
                </div>
                {corFase && (
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: "11px",
                      fontWeight: "600",
                      padding: "3px 10px",
                      borderRadius: "999px",
                      backgroundColor: corFase.bg,
                      color: corFase.cor,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {FASE_LABEL[fase]}
                  </span>
                )}
                {/* A SEGUNDA PORTA. O atalho de um clique é bom, mas
                    deixava a ficha da pessoa inalcançável justamente no
                    caso mais comum — a cliente de um só evento vivo ia
                    direita ao evento e nunca mais havia caminho para o
                    NIF, para o «+ Novo evento» nem para remover um
                    evento criado por engano. Discreto de propósito: o
                    gesto principal continua a ser abrir o evento. */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(caminhoDoContacto(c.id));
                  }}
                  title="Ficha da cliente"
                  aria-label={`Ficha de ${c.nome}`}
                  style={{
                    flexShrink: 0,
                    padding: "3px 10px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    fontWeight: "600",
                    border: "1px solid var(--gold-light)",
                    backgroundColor: "var(--superficie)",
                    color: "var(--gold-dark)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Ficha
                </button>
              </div>
            );
          })}
        </div>

      </div>

    </div>
  );
}
