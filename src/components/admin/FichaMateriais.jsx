import { useEffect, useMemo, useRef, useState } from "react";
import {
  getMateriais,
  getEventoMateriais,
  addEventoMaterial,
  updateEventoMaterial,
  removeEventoMaterial,
  agruparPorCategoria,
} from "../../lib/materiais";
import { imprimirFicha } from "../../lib/imprimirFicha";
import { Convite, Esqueleto } from "./acabamento";
import SeletorPaleta from "./SeletorPaleta";
import {
  GRUPOS_PALETA,
  coresDeTexto,
  textoDeCores,
} from "../../lib/paletaCores";

// ============================================================
// FichaMateriais — a ficha do evento, em tabela.
//
// O problema não era o número de campos: era cada material ser um
// CARTÃO. Quantidade, cores, observações e três estados empilhados
// davam ~280 px por item — 20 materiais eram seis ecrãs de scroll, e
// nenhum deles mostrava o conjunto.
//
// Uma ficha operacional é uma tabela. Uma linha por material, ~44 px,
// tudo editável na linha. 20 materiais passam a caber num ecrã.
//
// Quatro regras que vieram do desenho:
//   • vazio é um travessão — nada de "Sem cores definidas" nem caixas
//     vazias; o olho salta para o que está preenchido;
//   • as cores abrem em popover, que não empurra a lista;
//   • adicionar sem sair da ficha: uma linha de procura no fim de cada
//     categoria, Enter adiciona e deixa o cursor na quantidade. Nunca
//     um modal para adicionar 15 itens seguidos;
//   • o stock avisa NA LINHA — aqui decide-se, em Logística gere-se.
//
// Remover é sempre por selecção múltipla + barra de acções, nunca um
// botão solto que apague à primeira.
// ============================================================

const LISTAS = [
  { campo: "lista_carga", label: "Carga", curto: "C" },
  { campo: "lista_montagem", label: "Montagem", curto: "M" },
  { campo: "lista_higienizacao", label: "Higienização", curto: "H" },
];

const GRELHA = "28px minmax(180px, 1fr) 76px 44px 80px minmax(140px, 1.2fr) 52px 52px 52px 28px";

// O que há para dar a um evento futuro: o total menos o que está
// reservado por confirmar. O que está em higienização hoje volta a
// estar disponível até lá — a mesma definição do motor de conflitos.
const disponivel = (material) => {
  const total = Number(material?.quantidade_total);
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.max(0, total - (Number(material?.por_confirmar) || 0));
};

// ---------- Cores em popover ----------
//
// É o SeletorPaleta do formulário, tal e qual — catálogo, cor
// personalizada com color picker, e as personalizadas que já andam pela
// ficha à mão para as repetir noutra linha. Havia aqui uma segunda
// grelha de cores, só com o catálogo: quem inventava uma cor no
// onboarding não a conseguia pôr no material que a leva.
//
// Só o formato muda: aqui a coluna é TEXTO, e é o paletaCores que sabe
// escrevê-la e lê-la sem perder o hex das cores inventadas.
//
// O painel ALARGA em vez de ganhar barra de scroll: uma paleta é para se
// ver de uma vez, e rolar para procurar uma cor é o contrário disso.
// Quantas cabem por linha é o espaço que decide — daí a largura sair de
// uma conta e não de um número fixo. Em oito por linha o catálogo inteiro
// cabe em três linhas e a caixa da cor personalizada deixa de partir ao
// meio. A altura máxima fica como rede: com muitas personalizadas, ou
// numa janela baixa, mais vale rolar do que transbordar.
// Cada amostra compacta ocupa 52px, com 6px de gap entre elas; mais os
// 24px de padding do painel. Os 6 de folga não são enfeite: sem eles a
// conta dá a largura exacta, e uma fracção de pixel manda a última cor
// para a linha seguinte — que era justamente o que se queria evitar.
const CORES_POR_LINHA = 8;
const larguraDoPainel = (colunas) => 58 * colunas + 24;

function PopoverCores({ valor, extras, posicao, onEscolher, onFechar }) {
  const escolhidas = coresDeTexto(valor);

  // Escape fecha. O clique fora já fechava, mas quem está a percorrer a
  // linha com o teclado não tem para onde clicar — e o véu que apanha o
  // clique fora cobre a página inteira, por isso um popover que só
  // fecha ao rato deixa a ficha toda quieta até se acertar nele.
  useEffect(() => {
    const aoTeclar = (evento) => {
      if (evento.key === "Escape") {
        evento.stopPropagation();
        onFechar();
      }
    };
    document.addEventListener("keydown", aoTeclar, true);
    return () => document.removeEventListener("keydown", aoTeclar, true);
  }, [onFechar]);

  return (
    <>
      <div
        onClick={onFechar}
        style={{ position: "fixed", inset: 0, zIndex: 60 }}
      />
      <div
        style={{
          position: "absolute",
          // Abre para baixo, ou para cima nas linhas do fundo da ficha:
          // com o catálogo todo à vista o painel é alto, e uma linha
          // baixa mandava metade dele para fora da janela.
          ...(posicao.acima
            ? { bottom: "calc(100% + 6px)" }
            : { top: "calc(100% + 6px)" }),
          // Alinhado pela esquerda da célula, ou pela direita quando é
          // desse lado que há espaço para o painel abrir.
          ...(posicao.aDireita ? { right: 0 } : { left: 0 }),
          zIndex: 61,
          width: `${posicao.largura}px`,
          maxHeight: `${posicao.altura}px`,
          overflowY: "auto",
          backgroundColor: "white",
          border: "1px solid var(--gold-light)",
          borderRadius: "12px",
          boxShadow: "0 8px 28px rgba(0,0,0,0.12)",
          padding: "12px",
        }}
      >
        <SeletorPaleta
          value={escolhidas}
          extras={extras}
          onChange={(cores) => onEscolher(textoDeCores(cores))}
          compact
        />
      </div>
    </>
  );
}

// ---------- Uma linha ----------
function Linha({
  linha,
  seleccionada,
  onSeleccionar,
  onActualizar,
  onTrocar,
  aoTabular,
  catalogo = [],
  idsNaFicha,
  coresDaFicha = [],
}) {
  // O popover das cores guarda para que lado abriu e com que altura —
  // medido no clique, que é o único momento em que a linha está no sítio
  // onde vai ficar.
  const [popover, setPopover] = useState(null);
  const [aTrocar, setATrocar] = useState(false);
  const material = linha.material || {};
  const cores = coresDeTexto(linha.cores);
  const stock = disponivel(material);
  const quantidade = Number(linha.quantidade) || 0;
  const semQuantidade = quantidade <= 0;
  const faltaStock = stock !== null && quantidade > stock;

  const aviso = semQuantidade
    ? "quantidade por definir"
    : faltaStock
      ? `só ${stock} disponíveis`
      : null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: GRELHA,
        gap: "8px",
        alignItems: "center",
        minHeight: "44px",
        padding: "0 12px",
        borderBottom: "1px solid #F5ECD7",
        backgroundColor: seleccionada
          ? "#FBF7EF"
          : aviso
            ? "#FFFDF6"
            : "transparent",
        fontSize: "12.5px",
      }}
    >
      <input
        type="checkbox"
        checked={seleccionada}
        onChange={onSeleccionar}
        aria-label={`Seleccionar ${material.nome}`}
        style={{ accentColor: "var(--gold)", cursor: "pointer" }}
      />

      {aTrocar ? (
        <TrocaDeMaterial
          actual={material.nome}
          catalogo={catalogo}
          idsNaFicha={idsNaFicha}
          onTrocar={onTrocar}
          onFechar={() => setATrocar(false)}
        />
      ) : (
        <button
          onClick={() => setATrocar(true)}
          title="Trocar de material — a quantidade, as cores e as observações ficam"
          className="campo-editavel"
          style={{
            minWidth: 0,
            textAlign: "left",
            padding: 0,
            font: "inherit",
            color: "inherit",
          }}
        >
          {material.nome}
          {material.tipo && (
            <span style={{ color: "#9B9B9B", fontSize: "11px" }}>
              {" "}
              {material.tipo}
            </span>
          )}
        </button>
      )}

      <input
        type="number"
        min="0"
        value={linha.quantidade ?? ""}
        onChange={(e) => onActualizar({ quantidade: Number(e.target.value) })}
        onKeyDown={aoTabular}
        className="caixa-texto"
        style={{
          width: "100%",
          padding: "5px 7px",
          borderRadius: "6px",
          border: `1.5px solid ${semQuantidade ? "var(--gold-light)" : "#EFE7D6"}`,
          fontSize: "12.5px",
          fontFamily: "inherit",
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      />

      <span style={{ fontSize: "11.5px", color: "#9B9B9B" }}>
        {material.unidade || "un"}
      </span>

      <div style={{ position: "relative" }}>
        <button
          onClick={(evento) => {
            if (popover) {
              setPopover(null);
              return;
            }
            // A janela é a mesma para todos, mas a linha não: a medição
            // faz-se aqui, com a célula no sítio onde vai ficar.
            const caixa = evento.currentTarget.getBoundingClientRect();

            const aDireita = window.innerWidth - caixa.left - 16;
            const aEsquerda = caixa.right - 16;
            const espaco = Math.max(aDireita, aEsquerda);
            const colunas = Math.max(
              4,
              Math.min(CORES_POR_LINHA, Math.floor((espaco - 18) / 58)),
            );
            const largura = larguraDoPainel(colunas);

            const abaixo = window.innerHeight - caixa.bottom - 16;
            const acima = caixa.top - 16;
            // Quanto ocupa o painel nesta largura: cada grupo do
            // catálogo mais o rodapé (botão da cor personalizada,
            // resumo, margens). Serve para escolher o lado, não para
            // fixar a altura.
            const alto =
              GRUPOS_PALETA.reduce(
                (linhas, g) => linhas + Math.ceil(g.cores.length / colunas),
                0,
              ) *
                52 +
              170;

            const paraCima = abaixo < alto && acima > abaixo;
            setPopover({
              acima: paraCima,
              aDireita: aDireita < largura && aEsquerda >= largura,
              largura,
              altura: Math.max(240, paraCima ? acima : abaixo),
            });
          }}
          title="Cores"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "3px",
            border: "none",
            background: "none",
            padding: "2px",
            cursor: "pointer",
            minHeight: "20px",
          }}
        >
          {cores.length === 0 ? (
            <span style={{ color: "#C4C4C4" }}>—</span>
          ) : (
            cores.map((c) => (
              <span
                key={c.nome}
                title={c.nome}
                style={{
                  width: "13px",
                  height: "13px",
                  borderRadius: "50%",
                  backgroundColor: c.hex,
                  border: "1px solid rgba(0,0,0,0.12)",
                  display: "block",
                }}
              />
            ))
          )}
        </button>
        {popover && (
          <PopoverCores
            valor={linha.cores}
            extras={coresDaFicha}
            posicao={popover}
            onEscolher={(texto) => onActualizar({ cores: texto })}
            onFechar={() => setPopover(null)}
          />
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <input
          value={linha.observacoes || ""}
          onChange={(e) => onActualizar({ observacoes: e.target.value })}
          placeholder="—"
          className="caixa-fantasma"
          style={{
            width: "100%",
            padding: "5px 7px",
            borderRadius: "6px",
            fontSize: "12px",
            fontFamily: "inherit",
          }}
        />
        {aviso && (
          <span
            style={{
              display: "block",
              fontSize: "10.5px",
              color: "var(--gold-dark)",
              padding: "0 7px",
            }}
          >
            {aviso}
          </span>
        )}
      </div>

      {LISTAS.map((l) => {
        const activa = !!linha[l.campo];
        return (
          <button
            key={l.campo}
            onClick={() => onActualizar({ [l.campo]: !activa })}
            title={l.label}
            className={`alternador${activa ? " alternador--activo" : ""}`}
            style={{
              padding: "4px 0",
              borderRadius: "6px",
              fontSize: "10.5px",
              fontWeight: activa ? "600" : "400",
            }}
          >
            {l.curto}
          </button>
        );
      })}

      <span />
    </div>
  );
}

// ---------- Adicionar sem sair da ficha ----------
// ---------- Procurar no catálogo ----------
//
// A mesma pergunta serve duas coisas — acrescentar uma linha à ficha e
// trocar o material de uma que já lá está — e por isso é feita num sítio
// só. O que já está na ficha nunca aparece: não se acrescenta duas vezes
// nem se troca por aquilo que já lá está noutra linha (a base de dados
// também não deixaria).
const sugerirMateriais = (catalogo, idsNaFicha, texto) => {
  const t = texto.trim().toLowerCase();
  if (!t) return [];
  return catalogo
    .filter(
      (m) => !idsNaFicha.has(m.id) && (m.nome || "").toLowerCase().includes(t),
    )
    .slice(0, 6);
};

function Sugestoes({ lista, indice, largura, esquerda, nota, onPassar, onEscolher }) {
  if (lista.length === 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% - 4px)",
        left: esquerda,
        zIndex: 40,
        width: largura,
        backgroundColor: "white",
        border: "1px solid var(--gold-light)",
        borderRadius: "10px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
        overflow: "hidden",
      }}
    >
      {lista.map((m, i) => {
        const stock = disponivel(m);
        return (
          <button
            key={m.id}
            onMouseEnter={() => onPassar(i)}
            // Sem isto, o clique tirava primeiro o cursor da caixa de
            // procura — e quem fecha ao perder o cursor fechava antes de
            // o clique chegar.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onEscolher(m)}
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "10px",
              width: "100%",
              padding: "8px 12px",
              border: "none",
              backgroundColor: i === indice ? "#FBF7EF" : "white",
              cursor: "pointer",
              textAlign: "left",
              fontSize: "12.5px",
            }}
          >
            <span>{m.nome}</span>
            <span style={{ fontSize: "11px", color: "#9B9B9B" }}>
              {m.categoria}
              {stock !== null && ` · ${stock} disponíveis`}
            </span>
          </button>
        );
      })}
      {nota && (
        <p
          style={{
            fontSize: "10.5px",
            color: "#9B9B9B",
            margin: 0,
            padding: "7px 12px",
            borderTop: "1px solid #F5ECD7",
            backgroundColor: "#FCFBF7",
          }}
        >
          {nota}
        </p>
      )}
    </div>
  );
}

// ---------- Trocar o material de uma linha ----------
//
// Enganar-se no material é o erro mais fácil de cometer aqui, e até
// agora só havia uma saída: remover a linha e recomeçar — levando com
// ela a quantidade, as cores e as observações, que estavam certas. A
// linha era removível mas não editável. Agora troca-se o material no
// lugar e fica tudo o resto.
function TrocaDeMaterial({ actual, catalogo, idsNaFicha, onTrocar, onFechar }) {
  const [texto, setTexto] = useState("");
  const [indice, setIndice] = useState(0);
  const caixa = useRef(null);
  const sugestoes = sugerirMateriais(catalogo, idsNaFicha, texto);

  const escolher = (material) => {
    if (!material) return;
    onTrocar(material);
    onFechar();
  };

  return (
    <div ref={caixa} style={{ position: "relative", minWidth: 0 }}>
      <input
        autoFocus
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setIndice(0);
        }}
        // Sair da caixa fecha a troca — excepto quando se sai PARA uma
        // sugestão, que é o contrário de desistir. O preventDefault no
        // rato já tenta segurar o cursor aqui; isto é o segundo travão,
        // para a escolha nunca se perder entre o carregar e o largar.
        onBlur={(evento) => {
          if (caixa.current?.contains(evento.relatedTarget)) return;
          onFechar();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndice((i) => Math.min(i + 1, sugestoes.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndice((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            escolher(sugestoes[indice]);
          } else if (e.key === "Escape") {
            e.stopPropagation();
            onFechar();
          }
        }}
        placeholder={`trocar ${actual} por…`}
        className="caixa-texto"
        style={{
          width: "100%",
          padding: "4px 8px",
          borderRadius: "6px",
          border: "1.5px solid var(--gold-light)",
          fontSize: "12.5px",
          fontFamily: "inherit",
          outline: "none",
          backgroundColor: "white",
          boxSizing: "border-box",
        }}
      />
      <Sugestoes
        lista={sugestoes}
        indice={indice}
        largura="340px"
        esquerda={0}
        nota="A quantidade, as cores e as observações ficam como estão."
        onPassar={setIndice}
        onEscolher={escolher}
      />
    </div>
  );
}

function Typeahead({ categoria, catalogo, idsNaFicha, onAdicionar, autoFoco }) {
  const [texto, setTexto] = useState("");
  const [indice, setIndice] = useState(0);
  const inputRef = useRef(null);

  // A aterragem da pílula "preparar o evento" numa ficha vazia: o
  // cursor já está na procura — o primeiro material está a uma tecla.
  useEffect(() => {
    if (autoFoco) inputRef.current?.focus();
  }, [autoFoco]);

  const sugestoes = useMemo(
    () => sugerirMateriais(catalogo, idsNaFicha, texto),
    [texto, catalogo, idsNaFicha],
  );

  const escolher = async (material) => {
    if (!material) return;
    setTexto("");
    setIndice(0);
    await onAdicionar(material);
    inputRef.current?.focus();
  };

  return (
    <div style={{ position: "relative", padding: "6px 12px 10px 40px" }}>
      <input
        ref={inputRef}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setIndice(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndice((i) => Math.min(i + 1, sugestoes.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndice((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            escolher(sugestoes[indice]);
          } else if (e.key === "Escape") {
            setTexto("");
          }
        }}
        placeholder={`＋  adicionar material em ${categoria}`}
        className="caixa-texto"
        style={{
          width: "100%",
          maxWidth: "340px",
          padding: "6px 10px",
          borderRadius: "8px",
          border: "1px dashed var(--gold-light)",
          fontSize: "12px",
          fontFamily: "inherit",
          backgroundColor: "transparent",
          color: "var(--charcoal)",
        }}
      />
      <Sugestoes
        lista={sugestoes}
        indice={indice}
        largura="340px"
        esquerda="40px"
        nota="Enter adiciona e deixa o cursor na quantidade."
        onPassar={setIndice}
        onEscolher={escolher}
      />
    </div>
  );
}

export default function FichaMateriais({
  submissionId,
  submissao,
  onFichaAlterada,
  realce = null,
  onRealceConsumido,
  onContagem,
}) {
  const [catalogo, setCatalogo] = useState([]);
  const [linhas, setLinhas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [estadoGravacao, setEstadoGravacao] = useState("idle");
  const [filtro, setFiltro] = useState("tudo");
  const [recolhidas, setRecolhidas] = useState([]);
  const [seleccao, setSeleccao] = useState([]);
  const [aRemover, setARemover] = useState(false);
  // Contador, não booleano: cada pedido de foco (aterragem da pílula,
  // botão do convite) volta a pôr o cursor na procura, vezes sem conta.
  const [focarProcura, setFocarProcura] = useState(0);

  // A ficha inteira é o destino do gesto "preparar o evento" — só numa
  // ficha vazia há um sítio melhor para pousar: a caixa de procura.
  useEffect(() => {
    if (!realce || realce.alvo !== "ficha" || loading) return;
    if (linhas.length === 0) setFocarProcura((n) => n + 1);
    if (onRealceConsumido) onRealceConsumido();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realce, loading]);

  // A contagem do separador: quantas linhas tem a ficha.
  useEffect(() => {
    if (!loading && onContagem) onContagem(linhas.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, linhas]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [cat, ems] = await Promise.all([
          getMateriais(),
          getEventoMateriais(submissionId),
        ]);
        if (cancelado) return;
        setCatalogo(cat);
        setLinhas(ems);
        setLoading(false);
      } catch (e) {
        if (cancelado) return;
        console.error("Erro ao carregar ficha:", e);
        setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [submissionId]);

  const marcarGuardado = () => {
    setEstadoGravacao("saved");
    setTimeout(() => setEstadoGravacao("idle"), 1600);
    onFichaAlterada?.();
  };

  const idsNaFicha = useMemo(
    () => new Set(linhas.map((l) => l.material_id)),
    [linhas],
  );

  // Todas as cores já usadas nesta ficha, para o seletor as oferecer em
  // qualquer linha: uma cor inventada uma vez raramente é para uma linha
  // só, e reinventá-la no color picker nunca daria o mesmo hex.
  const coresDaFicha = useMemo(() => {
    const porNome = new Map();
    for (const linha of linhas)
      for (const cor of coresDeTexto(linha.cores))
        if (!porNome.has(cor.nome.toLowerCase()))
          porNome.set(cor.nome.toLowerCase(), cor);
    return [...porNome.values()];
  }, [linhas]);

  const contagens = useMemo(() => {
    const conta = (f) => linhas.filter(f).length;
    return {
      tudo: linhas.length,
      lista_carga: conta((l) => l.lista_carga),
      lista_montagem: conta((l) => l.lista_montagem),
      lista_higienizacao: conta((l) => l.lista_higienizacao),
      semQuantidade: conta((l) => !(Number(l.quantidade) > 0)),
    };
  }, [linhas]);

  const visiveis = useMemo(() => {
    if (filtro === "tudo") return linhas;
    if (filtro === "semQuantidade")
      return linhas.filter((l) => !(Number(l.quantidade) > 0));
    return linhas.filter((l) => l[filtro]);
  }, [linhas, filtro]);

  const grupos = useMemo(
    () =>
      agruparPorCategoria(
        visiveis.map((l) => ({ ...l, categoria: l.material?.categoria })),
      ),
    [visiveis],
  );

  const totalUnidades = useMemo(
    () => linhas.reduce((acc, l) => acc + (Number(l.quantidade) || 0), 0),
    [linhas],
  );

  // --- acções ---

  const actualizar = async (linhaId, campos) => {
    setLinhas((prev) =>
      prev.map((l) => (l.id === linhaId ? { ...l, ...campos } : l)),
    );
    setEstadoGravacao("saving");
    try {
      await updateEventoMaterial(linhaId, campos);
      marcarGuardado();
    } catch (e) {
      console.error(e);
      setEstadoGravacao("idle");
    }
  };

  // Trocar o material de uma linha. Ao contrário de um retoque na
  // quantidade, isto muda o que a linha É — por isso, se a escrita
  // falhar, a linha volta ao que era em vez de ficar a mostrar um
  // material que a base de dados não tem.
  const trocarMaterial = async (linhaId, material) => {
    const anterior = linhas.find((l) => l.id === linhaId);
    if (!anterior || anterior.material_id === material.id) return;
    setLinhas((prev) =>
      prev.map((l) =>
        l.id === linhaId ? { ...l, material_id: material.id, material } : l,
      ),
    );
    setEstadoGravacao("saving");
    try {
      await updateEventoMaterial(linhaId, { material_id: material.id });
      marcarGuardado();
    } catch (e) {
      console.error(e);
      setLinhas((prev) => prev.map((l) => (l.id === linhaId ? anterior : l)));
      setEstadoGravacao("idle");
    }
  };

  const adicionar = async (material) => {
    setEstadoGravacao("saving");
    try {
      const nova = await addEventoMaterial(submissionId, material);
      setLinhas((prev) => [
        ...prev.filter((l) => l.material_id !== material.id),
        { ...nova, material },
      ]);
      marcarGuardado();
    } catch (e) {
      console.error(e);
      setEstadoGravacao("idle");
    }
  };

  const aplicarLista = async (campo, valor) => {
    setEstadoGravacao("saving");
    const alvos = linhas.filter((l) => seleccao.includes(l.id));
    setLinhas((prev) =>
      prev.map((l) =>
        seleccao.includes(l.id) ? { ...l, [campo]: valor } : l,
      ),
    );
    try {
      await Promise.all(
        alvos.map((l) => updateEventoMaterial(l.id, { [campo]: valor })),
      );
      marcarGuardado();
    } catch (e) {
      console.error(e);
      setEstadoGravacao("idle");
    }
  };

  const removerSeleccionadas = async () => {
    setEstadoGravacao("saving");
    try {
      await Promise.all(seleccao.map((id) => removeEventoMaterial(id)));
      setLinhas((prev) => prev.filter((l) => !seleccao.includes(l.id)));
      setSeleccao([]);
      setARemover(false);
      marcarGuardado();
    } catch (e) {
      console.error(e);
      setEstadoGravacao("idle");
    }
  };

  // Tab desce a coluna da quantidade em vez de saltar para o campo
  // seguinte da linha — quem preenche uma ficha preenche quantidades.
  const aoTabular = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const inputs = [
      ...e.currentTarget.closest("[data-ficha]").querySelectorAll("input[type=number]"),
    ];
    const i = inputs.indexOf(e.currentTarget);
    inputs[i + 1]?.focus();
    inputs[i + 1]?.select();
  };

  if (loading) {
    return (
      <div>
        <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
          {[72, 68, 84, 92, 104].map((w, i) => (
            <Esqueleto key={i} w={w} h={30} r={999} />
          ))}
        </div>
        <Esqueleto h={38} r="14px 14px 0 0" style={{ marginBottom: 2 }} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Esqueleto key={i} h={44} r={0} style={{ marginBottom: 2 }} />
        ))}
      </div>
    );
  }

  const filtros = [
    { id: "tudo", label: "Tudo", n: contagens.tudo },
    { id: "lista_carga", label: "Carga", n: contagens.lista_carga },
    { id: "lista_montagem", label: "Montagem", n: contagens.lista_montagem },
    {
      id: "lista_higienizacao",
      label: "Higienização",
      n: contagens.lista_higienizacao,
    },
    {
      id: "semQuantidade",
      label: "Falta quantidade",
      n: contagens.semQuantidade,
    },
  ];

  return (
    <div data-ficha style={{ paddingBottom: seleccao.length ? "72px" : 0 }}>
      {/* Filtros + totais */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
          marginBottom: "14px",
        }}
      >
        {filtros.map((f) => {
          const activo = filtro === f.id;
          const alerta = f.id === "semQuantidade" && f.n > 0;
          return (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={`pastilha-escolha${
                activo ? " pastilha-escolha--activa" : ""
              }`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 13px",
                borderRadius: "999px",
                fontSize: "12px",
              }}
            >
              {f.label}
              <span
                style={{
                  fontSize: "10px",
                  color: activo
                    ? "rgba(255,255,255,0.8)"
                    : alerta
                      ? "var(--gold-dark)"
                      : "#C0B79F",
                  fontWeight: alerta ? "700" : "400",
                }}
              >
                {f.n}
              </span>
            </button>
          );
        })}

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: "12px", color: "var(--gray-mid)" }}>
          {linhas.length} {linhas.length === 1 ? "material" : "materiais"} ·{" "}
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {totalUnidades}
          </span>{" "}
          un
        </span>
        {estadoGravacao !== "idle" && (
          <span style={{ fontSize: "11.5px", color: "var(--gold-dark)" }}>
            {estadoGravacao === "saving" ? "A guardar…" : "✓ Guardado"}
          </span>
        )}
        {linhas.length > 0 && (
          <button
            onClick={() => imprimirFicha(linhas, submissao)}
            className="acao acao--ouro"
            style={{
              padding: "7px 14px",
              borderRadius: "10px",
              fontSize: "12px",
              fontWeight: "500",
            }}
          >
            Imprimir listas
          </button>
        )}
      </div>

      {/* A tabela */}
      <div
        style={{
          backgroundColor: "white",
          border: "1px solid #F0E6D0",
          borderRadius: "14px",
          overflow: "visible",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: GRELHA,
            gap: "8px",
            alignItems: "end",
            padding: "10px 12px",
            borderBottom: "1px solid var(--gold-light)",
          }}
        >
          <span />
          {["Material", "Qtd", "Un", "Cores", "Observações"].map((h) => (
            <span key={h} style={cabecalho}>
              {h}
            </span>
          ))}
          {LISTAS.map((l) => (
            <span key={l.campo} style={{ ...cabecalho, textAlign: "center" }}>
              {l.curto}
            </span>
          ))}
          <span />
        </div>

        {grupos.length === 0 &&
          (filtro === "tudo" ? (
            <Convite
              titulo="A ficha está por compor."
              texto="Procura o primeiro material — o Enter adiciona e deixa o cursor na quantidade, pronto para o seguinte."
              accao="Procurar material"
              onAccao={() => setFocarProcura((n) => n + 1)}
            />
          ) : (
            <p
              style={{
                fontSize: "13px",
                color: "var(--gray-mid)",
                fontStyle: "italic",
                padding: "24px",
                textAlign: "center",
              }}
            >
              Nenhum material com este filtro.
            </p>
          ))}

        {grupos.map((grupo) => {
          const fechada = recolhidas.includes(grupo.categoria);
          const un = grupo.itens.reduce(
            (acc, l) => acc + (Number(l.quantidade) || 0),
            0,
          );
          return (
            <div key={grupo.categoria}>
              <button
                onClick={() =>
                  setRecolhidas((r) =>
                    r.includes(grupo.categoria)
                      ? r.filter((c) => c !== grupo.categoria)
                      : [...r, grupo.categoria],
                  )
                }
                className="toca"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  height: "34px",
                  padding: "0 12px",
                  border: "none",
                  borderTop: "1px solid #F0E6D0",
                  borderBottom: "1px solid #F0E6D0",
                  backgroundColor: "#FBF7EF",
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: "700",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--gold-dark)",
                  }}
                >
                  {fechada ? "▸" : "▾"} {grupo.categoria}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--gold-dark)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {grupo.itens.length}{" "}
                  {grupo.itens.length === 1 ? "item" : "itens"} · {un} un
                </span>
              </button>

              {!fechada && (
                <>
                  {grupo.itens.map((linha) => (
                    <Linha
                      key={linha.id}
                      linha={linha}
                      seleccionada={seleccao.includes(linha.id)}
                      onSeleccionar={() =>
                        setSeleccao((s) =>
                          s.includes(linha.id)
                            ? s.filter((x) => x !== linha.id)
                            : [...s, linha.id],
                        )
                      }
                      onActualizar={(campos) => actualizar(linha.id, campos)}
                      onTrocar={(material) => trocarMaterial(linha.id, material)}
                      aoTabular={aoTabular}
                      catalogo={catalogo}
                      idsNaFicha={idsNaFicha}
                      coresDaFicha={coresDaFicha}
                    />
                  ))}
                  {filtro === "tudo" && (
                    <Typeahead
                      categoria={grupo.categoria}
                      catalogo={catalogo}
                      idsNaFicha={idsNaFicha}
                      onAdicionar={adicionar}
                    />
                  )}
                </>
              )}
            </div>
          );
        })}

        {/* Uma última procura, para categorias que ainda não existem na ficha */}
        {filtro === "tudo" && (
          <Typeahead
            categoria="qualquer categoria"
            catalogo={catalogo}
            idsNaFicha={idsNaFicha}
            onAdicionar={adicionar}
            autoFoco={focarProcura}
          />
        )}
      </div>

      {/* Barra de acções da selecção — remover nunca é um botão solto
          na linha; escolhe-se primeiro, confirma-se depois. */}
      {seleccao.length > 0 && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: "24px",
            transform: "translateX(-50%)",
            zIndex: 80,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 16px",
            borderRadius: "14px",
            backgroundColor: "white",
            border: "1px solid var(--gold-light)",
            boxShadow: "0 10px 34px rgba(26,26,26,0.16)",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "12.5px", color: "var(--charcoal)" }}>
            {seleccao.length}{" "}
            {seleccao.length === 1
              ? "linha seleccionada"
              : "linhas seleccionadas"}
          </span>
          {aRemover ? (
            <>
              <span style={{ fontSize: "12.5px", color: "var(--gray-mid)" }}>
                Remover da ficha?
              </span>
              <button
                onClick={() => setARemover(false)}
                className="acao acao--neutra"
                style={medidaBtnBarra}
              >
                Cancelar
              </button>
              <button
                onClick={removerSeleccionadas}
                className="acao acao--perigo-cheia"
                style={{ ...medidaBtnBarra, fontWeight: "600" }}
              >
                Remover {seleccao.length}
              </button>
            </>
          ) : (
            <>
              <span style={{ fontSize: "12px", color: "#9B9B9B" }}>aplicar</span>
              {LISTAS.map((l) => (
                <button
                  key={l.campo}
                  onClick={() => aplicarLista(l.campo, true)}
                  className="acao acao--neutra"
                  style={medidaBtnBarra}
                >
                  {l.label}
                </button>
              ))}
              <button
                onClick={() => setARemover(true)}
                className="acao acao--perigo"
                style={medidaBtnBarra}
              >
                Remover
              </button>
              <button
                onClick={() => setSeleccao([])}
                className="acao acao--neutra"
                style={medidaBtnBarra}
              >
                ✕
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const cabecalho = {
  fontSize: "9px",
  fontWeight: "600",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#9B9B9B",
};

// A identidade dos botões da barra vive nas classes .acao--* do
// index.css; aqui fica só a medida.
const medidaBtnBarra = {
  padding: "6px 12px",
  borderRadius: "8px",
  fontSize: "12px",
};
