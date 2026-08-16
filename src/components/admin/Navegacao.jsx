import { useSyncExternalStore } from "react";
import { NavLink } from "react-router-dom";
import LogoDourado from "../LogoDourado";
import { caminhoDoSeparador } from "../../lib/rotasAdmin";
import { alternarTema, assinarTema, temaEfectivo } from "../../lib/tema";

// ============================================================
// Navegacao — a casca de navegação da app.
// Desktop: sidebar lateral coroada pelo logo, tudo visível.
// Telemóvel: barra inferior + folha "Mais".
//
// Ícones de LINHA FINA desenhados à medida (stroke 1.5, dourado por
// herança de cor) — nada de emoji: a marca é "Do Luxo à Mesa", e a
// interface tem de estar à altura da etiqueta.
// Os ids dos separadores NUNCA mudam (regra de ouro).
// ============================================================

const NAV_PRINCIPAL = [
  { id: "inicio", label: "Início", icone: "inicio" },
  { id: "clientes", label: "Contactos", icone: "contactos" },
  { id: "calendario", label: "Agenda", icone: "agenda" },
  { id: "orcamentos", label: "Documentos", icone: "documentos" },
];

const NAV_GESTAO = [
  { id: "operacional", label: "Logística", icone: "logistica" },
  { id: "convites", label: "Formulários", icone: "formularios" },
  { id: "mensagens", label: "Mensagens", icone: "mensagens" },
  { id: "comunicados", label: "Envios", icone: "comunicados" },
  { id: "dashboard", label: "Dashboard", icone: "dashboard" },
  { id: "avaliacoes", label: "Avaliações", icone: "avaliacoes" },
];

const NAV_CONFIG = [
  { id: "tiposEvento", label: "Modelos de Evento", icone: "modelos" },
  { id: "importar", label: "Importar clientes", icone: "importar" },
];

const IDS_NO_MAIS = [...NAV_GESTAO, ...NAV_CONFIG].map((n) => n.id);

// ------------------------------------------------------------
// Ícones de linha fina (herdam a cor do texto via currentColor)
// ------------------------------------------------------------
export function Icone({ nome, tamanho = 18 }) {
  const t = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  const desenhos = {
    inicio: (
      <>
        <path {...t} d="M3.5 11.5 12 4.5l8.5 7" />
        <path {...t} d="M5.5 10v10h13V10" />
      </>
    ),
    contactos: (
      <>
        <circle {...t} cx="9" cy="8" r="3.2" />
        <path {...t} d="M3.5 19.5c0-3.1 2.5-4.8 5.5-4.8s5.5 1.7 5.5 4.8" />
        <circle {...t} cx="17" cy="9" r="2.4" />
        <path {...t} d="M16.5 14.7c2.4.4 4 1.8 4 4.3" />
      </>
    ),
    agenda: (
      <>
        <rect {...t} x="4" y="5.5" width="16" height="14.5" rx="2" />
        <path {...t} d="M4 9.5h16M8 3.5v4M16 3.5v4" />
      </>
    ),
    documentos: (
      <>
        <path {...t} d="M7 3.5h7l4 4V20.5H7z" />
        <path {...t} d="M14 3.5V8h4M9.5 12.5h5M9.5 16h5" />
      </>
    ),
    orcamento: (
      <>
        <path {...t} d="M7 3.5h7l4 4V20.5H7z" />
        <path {...t} d="M14 3.5V8h4" />
        <path {...t} d="M14.8 11.7a3 3 0 100 4.6" />
        <path {...t} d="M9.6 13h3.6M9.6 15h3.6" />
      </>
    ),
    contrato: (
      <>
        <path {...t} d="M7 3.5h7l4 4V20.5H7z" />
        <path {...t} d="M14 3.5V8h4M9.5 12h5" />
        <path {...t} d="M9.5 16.5c.9-1 1.6.7 2.5 0s1.6.7 2.5 0" />
      </>
    ),
    proposta: (
      <>
        <path {...t} d="M7 3.5h7l4 4V20.5H7z" />
        <path {...t} d="M14 3.5V8h4" />
        <circle {...t} cx="10.4" cy="12" r="1.1" />
        <path {...t} d="M9.5 17l2.3-2.3 1.5 1.5 1.2-1.2 1 1" />
      </>
    ),
    logistica: (
      <>
        <path {...t} d="M12 3l8 4v10l-8 4-8-4V7z" />
        <path {...t} d="M4 7l8 4 8-4M12 11v10" />
      </>
    ),
    formularios: (
      <>
        <rect {...t} x="6" y="4.5" width="12" height="16" rx="2" />
        <rect {...t} x="9" y="3" width="6" height="3" rx="1" />
        <path {...t} d="M9 11h6M9 14.5h6" />
      </>
    ),
    funil: (
      <>
        <path {...t} d="M4.5 5h15l-5.5 6.5V17l-4 2.5v-8z" />
      </>
    ),
    mensagens: (
      <>
        <path
          {...t}
          d="M12 5c-4.1 0-7.5 2.6-7.5 5.9 0 1.5.7 2.9 1.9 3.9L5.5 18.5l3.7-1.6c.9.3 1.8.4 2.8.4 4.1 0 7.5-2.6 7.5-5.9S16.1 5 12 5z"
        />
      </>
    ),
    // Um megafone — uma folha que se diz a muitos de uma vez.
    comunicados: (
      <>
        <path {...t} d="M4.5 10.2v3.6h3.1l6.6 3.9V6.3l-6.6 3.9z" />
        <path {...t} d="M17.6 9.6a3.7 3.7 0 010 4.8" />
      </>
    ),
    // Aspas — o que chega desta área são PALAVRAS de quem lá esteve.
    avaliacoes: (
      <>
        <path {...t} d="M9 7.5C7 7.5 5.5 9 5.5 11S7 14.5 9 14.5c0 1.6-1 2.7-2.4 3.2" />
        <path {...t} d="M17.5 7.5c-2 0-3.5 1.5-3.5 3.5s1.5 3.5 3.5 3.5c0 1.6-1 2.7-2.4 3.2" />
      </>
    ),
    dashboard: (
      <>
        <path {...t} d="M5.5 19.5V12M11 19.5V6.5M16.5 19.5V10" />
        <path {...t} d="M4 20.5h16" />
      </>
    ),
    modelos: (
      <>
        <path {...t} d="M12 3.5l8 4.2-8 4.2-8-4.2z" />
        <path {...t} d="M4.5 12.5l7.5 4 7.5-4" />
        <path {...t} d="M4.5 16.5l7.5 4 7.5-4" />
      </>
    ),
    sair: (
      <>
        <path {...t} d="M14 4.5H7A1.5 1.5 0 005.5 6v12A1.5 1.5 0 007 19.5h7" />
        <path {...t} d="M16.5 8.5 20 12l-3.5 3.5M10 12h10" />
      </>
    ),
    // A lua e o sol do interruptor do tema. A lua é um QUARTO
    // crescente de traço, não a meia-lua preenchida — essa já tem
    // significado na casa («a meio») e não se empresta.
    lua: (
      <path
        {...t}
        d="M20 13.6A8.4 8.4 0 0110.4 4a7.2 7.2 0 109.6 9.6z"
      />
    ),
    sol: (
      <>
        <circle {...t} cx="12" cy="12" r="3.6" />
        <path
          {...t}
          d="M12 3.2v2.1M12 18.7v2.1M3.2 12h2.1M18.7 12h2.1M5.8 5.8l1.5 1.5M16.7 16.7l1.5 1.5M18.2 5.8l-1.5 1.5M7.3 16.7l-1.5 1.5"
        />
      </>
    ),
    mais: (
      <>
        <circle cx="5" cy="12" r="1.6" fill="currentColor" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" />
        <circle cx="19" cy="12" r="1.6" fill="currentColor" />
      </>
    ),
    importar: (
      <>
        <path {...t} d="M12 3.5v9M8.5 9l3.5 3.5L15.5 9" />
        <path {...t} d="M4.5 14.5v4a2 2 0 002 2h11a2 2 0 002-2v-4" />
      </>
    ),
    sino: (
      <>
        <path
          {...t}
          d="M12 4a5.5 5.5 0 00-5.5 5.5c0 4-1.5 5.5-2.5 6.5h16c-1-1-2.5-2.5-2.5-6.5A5.5 5.5 0 0012 4z"
        />
        <path {...t} d="M10 19.5a2 2 0 004 0" />
      </>
    ),
    lixo: (
      <>
        <path {...t} d="M5 7h14" />
        <path {...t} d="M9.5 7V5a1.5 1.5 0 011.5-1.5h2A1.5 1.5 0 0114.5 5v2" />
        <path {...t} d="M7 7l.8 12.2A2 2 0 009.8 21h4.4a2 2 0 002-1.8L17 7" />
        <path {...t} d="M10.2 11v6M13.8 11v6" />
      </>
    ),
    alerta: (
      <>
        <path {...t} d="M12 3.8L21.5 20H2.5z" />
        <path {...t} d="M12 9.5v5" />
        <circle cx="12" cy="17.3" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    check: <path {...t} d="M4.5 12.5l5 5 10-10" />,
    olhoFechado: (
      <>
        <path
          {...t}
          d="M3.5 12S6.8 5.5 12 5.5 20.5 12 20.5 12 17.2 18.5 12 18.5 3.5 12 3.5 12z"
        />
        <circle {...t} cx="12" cy="12" r="2.6" />
        <path {...t} d="M4 20L20 4" />
      </>
    ),
    setaBaixo: <path {...t} d="M12 4.5v14M6 13l6 5.5 6-5.5" />,
    pin: (
      <>
        <path {...t} d="M12 21s-7-6.1-7-11a7 7 0 0114 0c0 4.9-7 11-7 11z" />
        <circle {...t} cx="12" cy="10" r="2.5" />
      </>
    ),
    lapis: (
      <>
        <path {...t} d="M4 20l.9-4L16 4.9a1.6 1.6 0 012.3 0l.8.8a1.6 1.6 0 010 2.3L8 19l-4 1z" />
        <path {...t} d="M14 6.9L17.1 10" />
      </>
    ),
  };
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}
    >
      {desenhos[nome] || null}
    </svg>
  );
}

// ------------------------------------------------------------
// Item de navegação (partilhado entre sidebar e folha Mais)
// ------------------------------------------------------------
// Os separadores a sério viajam como LIGAÇÕES de verdade (<a href>),
// não como botões: é o que dá o clique-do-meio, o «abrir em novo
// separador» e o «copiar endereço da ligação» — metade da razão de ter
// URL próprio. `replace` porque um separador do menu é um LADO da app,
// não um passo de uma viagem: o «voltar» do browser deve desfazer o
// último salto com significado (o evento de onde ela veio), não os dez
// cliques de menu que deu pelo caminho.
//
// Os itens de acção (`__sair`, `__mais`) continuam botões — não são
// sítios, são gestos. A convenção do prefixo `__` é o que os distingue.
//
// O OBJECTO DO EVENTO É ENTREGUE AO onNavegar, e isso não é detalhe: uma
// ligação a sério navega sozinha, e a ÚNICA forma de a travar é
// preventDefault(). Quem monta este menu por cima de um ecrã com
// trabalho por guardar (a página do evento) precisa do evento em mão
// para poder dizer «agora não». Enquanto isto era um <button>, bastava
// não chamar nada; com um <a href>, não chamar nada deixa o browser ir.
const ehSeparador = (id) => typeof id === "string" && !id.startsWith("__");

// ------------------------------------------------------------
// A CONTAGEM ao lado de um item do menu. Não pulsa, não anima, não pede
// atenção: só está lá. É a diferença entre uma secção que se esquece e
// uma que se vê — e a regra da casa é que o movimento marca
// acontecimentos, não estados. Um estado permanente na visão periférica
// é imposição, não aviso.
// ------------------------------------------------------------
function Contagem({ quantos }) {
  if (!quantos) return null;
  return (
    <span
      style={{
        marginLeft: "auto",
        minWidth: "18px",
        height: "18px",
        padding: "0 5px",
        borderRadius: "999px",
        backgroundColor: "var(--aviso-fundo)",
        border: "1px solid var(--aviso-borda)",
        color: "var(--aviso-texto)",
        fontSize: "10px",
        fontWeight: "700",
        lineHeight: "16px",
        textAlign: "center",
        boxSizing: "border-box",
        flexShrink: 0,
      }}
    >
      {quantos > 99 ? "99+" : quantos}
    </span>
  );
}

function ItemNav({ item, ativo, onClick, contagem }) {
  const estilo = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    padding: "10px 14px",
    borderRadius: "10px",
    cursor: "pointer",
    textAlign: "left",
    boxSizing: "border-box",
    border: "none",
    textDecoration: "none",
    backgroundColor: ativo ? "var(--superficie-quente)" : "transparent",
    color: ativo ? "var(--gold-dark)" : "var(--gray-mid)",
    transition: "all 0.15s",
  };
  const conteudo = (
    <>
      <Icone nome={item.icone} tamanho={18} />
      <span
        style={{
          fontSize: "14px",
          fontWeight: ativo ? "600" : "400",
          letterSpacing: "0.02em",
          whiteSpace: "nowrap",
        }}
      >
        {item.label}
      </span>
      <Contagem quantos={contagem} />
    </>
  );

  if (ehSeparador(item.id)) {
    return (
      <NavLink
        to={caminhoDoSeparador(item.id)}
        replace
        onClick={onClick}
        style={estilo}
      >
        {conteudo}
      </NavLink>
    );
  }

  return (
    <button onClick={onClick} style={{ ...estilo, background: "transparent" }}>
      {conteudo}
    </button>
  );
}

// ------------------------------------------------------------
// Badge dourado com o nº de notificações por ler. Pulsa uma vez
// discretamente quando há novidades — chama a atenção sem gritar.
// ------------------------------------------------------------
export function BadgeNaoLidas({ quantos, tamanho = 18 }) {
  if (!quantos) return null;
  return (
    <>
      <style>{`
        @keyframes dlm-badge-pulso {
          0% { box-shadow: 0 0 0 0 rgba(var(--ouro-rgb), 0.5); }
          100% { box-shadow: 0 0 0 8px rgba(var(--ouro-rgb), 0); }
        }
      `}</style>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: `${tamanho}px`,
          height: `${tamanho}px`,
          padding: "0 5px",
          borderRadius: "999px",
          backgroundColor: "var(--gold)",
          color: "var(--texto-sobre-ouro)",
          fontSize: `${tamanho <= 16 ? 9 : 10.5}px`,
          fontWeight: "700",
          fontFamily: "Inter, sans-serif",
          lineHeight: 1,
          boxSizing: "border-box",
          animation: "dlm-badge-pulso 1.8s ease-out 2",
        }}
      >
        {quantos > 99 ? "99+" : quantos}
      </span>
    </>
  );
}

// Item especial da Caixa de Entrada — como um ItemNav, mas com o
// badge das não lidas encostado à direita.
function ItemCaixaEntrada({ naoLidas, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        width: "100%",
        padding: "10px 14px",
        borderRadius: "10px",
        cursor: "pointer",
        textAlign: "left",
        backgroundColor: naoLidas > 0 ? "var(--superficie-atenta)" : "transparent",
        border: "none",
        color: naoLidas > 0 ? "var(--gold-dark)" : "var(--gray-mid)",
        transition: "all 0.15s",
      }}
    >
      <Icone nome="sino" tamanho={18} />
      <span
        style={{
          fontSize: "14px",
          fontWeight: naoLidas > 0 ? "600" : "400",
          letterSpacing: "0.02em",
          whiteSpace: "nowrap",
          flex: 1,
        }}
      >
        Caixa de Entrada
      </span>
      <BadgeNaoLidas quantos={naoLidas} />
    </button>
  );
}

// ------------------------------------------------------------
// O interruptor do tema — um gesto, como «Sair», e mora na mesma
// arrumação: o fundo da sidebar e da folha «Mais», onde já vivem
// as coisas de configurar (Modelos, Importar). A casa não tem
// ecrã de definições, e um interruptor sozinho não justifica
// construir um.
// O rótulo é «Aspecto» — a palavra que a casa já fixou para «o
// temperamento de uma superfície» (fase A dos comunicados,
// registo → aspecto; grafia da casa, pré-acordo). Fixo nos dois
// modos de propósito: ao lado do «Sair», um rótulo que mudasse
// («Modo escuro»/«Modo claro») lia-se como acção sem se saber se
// dizia o estado ou o destino. Quem diz o estado é o ícone: a
// lua convida ao escuro, o sol ao claro. (Decisão do Hélio,
// 16/08.)
// useSyncExternalStore e não useState: o tema vive fora do React
// (lib/tema.js), e a sidebar e a folha «Mais» têm de ler o MESMO
// valor sem se conhecerem.
// ------------------------------------------------------------
function ItemTema() {
  const tema = useSyncExternalStore(assinarTema, temaEfectivo);
  const escuro = tema === "escuro";
  return (
    <ItemNav
      item={{
        id: "__tema",
        label: "Aspecto",
        icone: escuro ? "sol" : "lua",
      }}
      ativo={false}
      onClick={alternarTema}
    />
  );
}

function TituloSeccao({ children }) {
  return (
    <p
      style={{
        fontSize: "9px",
        fontWeight: "600",
        color: "var(--gold)",
        textTransform: "uppercase",
        letterSpacing: "0.22em",
        margin: "22px 0 8px 14px",
      }}
    >
      {children}
    </p>
  );
}

// ------------------------------------------------------------
// SIDEBAR — desktop
// ------------------------------------------------------------
export function SidebarNav({
  activeTab,
  onNavegar,
  onSair,
  naoLidas = 0,
  onAbrirNotificacoes,
  // { [idDoSeparador]: número } — contagens discretas ao lado dos itens.
  contagens = {},
}) {
  return (
    <div
      style={{
        width: "248px",
        flexShrink: 0,
        backgroundColor: "var(--superficie)",
        borderRight: "1px solid var(--borda)",
        height: "100vh",
        position: "sticky",
        top: 0,
        display: "flex",
        flexDirection: "column",
        padding: "28px 14px 18px",
        boxSizing: "border-box",
        overflowY: "auto",
      }}
    >
      {/* O logo coroa a sidebar — mesmo tratamento de luxo (halo,
          raio de relógio, poeira de ouro, brilho nas letras) do hero
          do formulário de interesse, ver LogoDourado.jsx */}
      <div style={{ textAlign: "center", marginBottom: "26px" }}>
        <LogoDourado size={132} />
      </div>

      {/* A Caixa de Entrada coroa o menu: é o correio da casa */}
      {onAbrirNotificacoes && (
        <ItemCaixaEntrada naoLidas={naoLidas} onClick={onAbrirNotificacoes} />
      )}

      {NAV_PRINCIPAL.map((item) => (
        <ItemNav
          key={item.id}
          item={item}
          ativo={activeTab === item.id}
          onClick={(ev) => onNavegar(item.id, ev)}
          contagem={contagens[item.id]}
        />
      ))}

      <TituloSeccao>Gestão</TituloSeccao>
      {NAV_GESTAO.map((item) => (
        <ItemNav
          key={item.id}
          item={item}
          ativo={activeTab === item.id}
          onClick={(ev) => onNavegar(item.id, ev)}
          contagem={contagens[item.id]}
        />
      ))}

      <div
        style={{
          marginTop: "auto",
          borderTop: "1px solid var(--borda)",
          paddingTop: "10px",
        }}
      >
        {NAV_CONFIG.map((item) => (
          <ItemNav
            key={item.id}
            item={item}
            ativo={activeTab === item.id}
            onClick={(ev) => onNavegar(item.id, ev)}
            contagem={contagens[item.id]}
          />
        ))}
        <ItemTema />
        <ItemNav
          item={{ id: "__sair", label: "Sair", icone: "sair" }}
          ativo={false}
          onClick={onSair}
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// BARRA INFERIOR — telemóvel
// ------------------------------------------------------------
export function BottomNavMovel({ activeTab, onNavegar, onAbrirMais }) {
  const maisAtivo = IDS_NO_MAIS.includes(activeTab);
  const itens = [
    ...NAV_PRINCIPAL.map((n) => ({ ...n, acao: (ev) => onNavegar(n.id, ev) })),
    { id: "__mais", label: "Mais", icone: "mais", acao: onAbrirMais },
  ];
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        backgroundColor: "var(--superficie)",
        borderTop: "1px solid var(--borda)",
        display: "flex",
        padding: "8px 4px calc(8px + env(safe-area-inset-bottom))",
      }}
    >
      {itens.map((item) => {
        const ativo = item.id === "__mais" ? maisAtivo : activeTab === item.id;
        // Mesma regra da sidebar: separador é ligação, acção é botão.
        const estilo = {
          flex: 1,
          border: "none",
          background: "none",
          cursor: "pointer",
          padding: "2px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "3px",
          textDecoration: "none",
          color: ativo ? "var(--gold-dark)" : "var(--gray-mid)",
        };
        const conteudo = (
          <>
            <Icone nome={item.icone} tamanho={19} />
            <span
              style={{
                fontSize: "10px",
                fontWeight: ativo ? "600" : "400",
                letterSpacing: "0.02em",
              }}
            >
              {item.label}
            </span>
          </>
        );
        return ehSeparador(item.id) ? (
          <NavLink
            key={item.id}
            to={caminhoDoSeparador(item.id)}
            replace
            onClick={item.acao}
            style={estilo}
          >
            {conteudo}
          </NavLink>
        ) : (
          <button key={item.id} onClick={item.acao} style={estilo}>
            {conteudo}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------
// FOLHA "MAIS" — telemóvel
// ------------------------------------------------------------
export function SheetMais({ activeTab, onNavegar, onSair, onFechar, contagens = {} }) {
  return (
    <div
      onClick={onFechar}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 45,
        backgroundColor: "var(--cortina)",
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          backgroundColor: "var(--superficie)",
          borderRadius: "18px 18px 0 0",
          padding: "10px 14px calc(18px + env(safe-area-inset-bottom))",
          boxShadow: "0 -6px 24px rgba(0,0,0,0.12)",
        }}
      >
        <div
          style={{
            width: "38px",
            height: "4px",
            borderRadius: "999px",
            backgroundColor: "var(--borda)",
            margin: "0 auto 12px",
          }}
        />
        {[...NAV_GESTAO, ...NAV_CONFIG].map((item) => (
          <ItemNav
            key={item.id}
            item={item}
            ativo={activeTab === item.id}
            onClick={(ev) => {
              onNavegar(item.id, ev);
              onFechar();
            }}
            contagem={contagens[item.id]}
          />
        ))}
        <div
          style={{
            borderTop: "1px solid var(--borda)",
            marginTop: "8px",
            paddingTop: "8px",
          }}
        >
          <ItemTema />
          <ItemNav
            item={{ id: "__sair", label: "Sair", icone: "sair" }}
            ativo={false}
            onClick={onSair}
          />
        </div>
      </div>
    </div>
  );
}
