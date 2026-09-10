import { useState, useSyncExternalStore } from "react";
import { NavLink } from "react-router-dom";
import LogoDourado from "../LogoDourado";
import { useRotas } from "../../lib/rotasAdmin";
import { alternarTema, assinarTema, temaEfectivo } from "../../lib/tema";
import {
  NAV_DIARIA,
  NAV_GRUPOS,
  NAV_MOVEL,
  lerGruposAbertos,
  guardarGruposAbertos,
  lerNavCompacta,
  guardarNavCompacta,
} from "../../lib/menu";

// ============================================================
// Navegacao — a casca de navegação da app.
//
// Desktop: sidebar com o trabalho DIÁRIO sempre à vista e o resto
// arrumado por DOMÍNIOS recolhíveis (a arquitetura vive em
// lib/menu.js — uma lista só, para a app crescer sem o menu voltar
// a ser uma lista de vinte linhas). Tem um modo COMPACTO (só
// ícones) para os ecrãs que querem o palco todo — Território,
// Dashboard, Agenda.
// Telemóvel: barra inferior + folha "Mais" arrumada pelos mesmos
// domínios.
//
// Ícones de LINHA FINA desenhados à medida (stroke 1.5, dourado por
// herança de cor) — nada de emoji: a marca é "Do Luxo à Mesa", e a
// interface tem de estar à altura da etiqueta.
// Os ids dos separadores NUNCA mudam (regra de ouro).
// ============================================================

const IDS_NA_BARRA = NAV_MOVEL.map((n) => n.id);
const IDS_NO_MAIS = NAV_GRUPOS.flatMap((g) => g.itens.map((i) => i.id)).filter(
  (id) => !IDS_NA_BARRA.includes(id),
);

// ------------------------------------------------------------
// Separadores que a sessão não pode ver.
//
// Esconder não é segurança — a segurança é o RLS e o has_permission da
// base. Isto evita apenas mostrar uma porta que, ao ser aberta, daria
// um ecrã vazio. Por omissão não esconde nada: um módulo novo tem de
// pedir para ser escondido, nunca o contrário.
// ------------------------------------------------------------
const visiveis = (itens, ocultar) =>
  ocultar?.length ? itens.filter((i) => !ocultar.includes(i.id)) : itens;

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
      consultas: (
        <>
        <rect {...t} x="3.5" y="5" width="17" height="15" rx="2.5" />
        <path {...t} d="M3.5 9.5h17" />
        <path {...t} d="M8 3.5v3M16 3.5v3" />
        <path {...t} d="M8.5 15.5l2 2 4.5-4.5" />
        </>
      ),
      equipa: (
        <>
        <circle {...t} cx="9" cy="8.5" r="3" />
        <path {...t} d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
        <path {...t} d="M16 6.2a3 3 0 0 1 0 5.6" />
        <path {...t} d="M17.5 14.8c1.9.6 3 2.4 3 4.7" />
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
    // A seta de um grupo — roda 90° quando o grupo abre (via CSS).
    chevron: <path {...t} d="M9.5 6.5l5.5 5.5-5.5 5.5" />,
    // Recolher/expandir a sidebar («» — roda 180° no modo compacto).
    recolher: (
      <>
        <path {...t} d="M11.5 7l-5 5 5 5" />
        <path {...t} d="M18 7l-5 5 5 5" />
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

function ItemNav({ item, ativo, onClick, contagem, compacto = false, indentado = false }) {
  const rotas = useRotas();
  const estilo = {
    display: "flex",
    alignItems: "center",
    justifyContent: compacto ? "center" : "flex-start",
    gap: "12px",
    width: "100%",
    padding: compacto ? "10px 0" : indentado ? "9px 14px 9px 22px" : "10px 14px",
    borderRadius: "10px",
    cursor: "pointer",
    textAlign: "left",
    boxSizing: "border-box",
    border: "none",
    textDecoration: "none",
    position: "relative",
    backgroundColor: ativo ? "var(--superficie-quente)" : "transparent",
    color: ativo ? "var(--gold-dark)" : "var(--gray-mid)",
  };
  const conteudo = compacto ? (
    <>
      <Icone nome={item.icone} tamanho={19} />
      {contagem > 0 && (
        <span
          style={{
            position: "absolute",
            top: "4px",
            right: "8px",
            width: "7px",
            height: "7px",
            borderRadius: "999px",
            backgroundColor: "var(--gold)",
          }}
        />
      )}
    </>
  ) : (
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

  const no = ehSeparador(item.id) ? (
    <NavLink
      to={rotas.separador(item.id)}
      replace
      onClick={onClick}
      className="nv-item"
      style={estilo}
      aria-label={compacto ? item.label : undefined}
    >
      {conteudo}
    </NavLink>
  ) : (
    <button
      onClick={onClick}
      className="nv-item"
      style={{ ...estilo, background: "transparent" }}
      aria-label={compacto ? item.label : undefined}
    >
      {conteudo}
    </button>
  );

  if (!compacto) return no;
  // No modo compacto, o nome viaja num rótulo flutuante ao hover/foco.
  return (
    <div className="nv-porta" style={{ position: "relative" }}>
      {no}
      <div className="nv-flyout" style={estFlyout}>
        <div style={estFlyoutPainel}>
          <span style={{ whiteSpace: "nowrap", fontSize: "12.5px" }}>
            {item.label}
          </span>
          <Contagem quantos={contagem} />
        </div>
      </div>
    </div>
  );
}

// O rótulo/menu flutuante do modo compacto: ancora à direita do rail,
// com uma ponte invisível de 8px para o rato atravessar sem o fechar.
const estFlyout = {
  position: "absolute",
  left: "100%",
  top: "50%",
  translate: "0 -50%",
  paddingLeft: "8px",
  zIndex: 60,
};
const estFlyoutPainel = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  backgroundColor: "var(--superficie)",
  border: "1px solid var(--borda)",
  borderRadius: "10px",
  padding: "8px 12px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
  color: "var(--charcoal)",
};

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
// badge das não lidas encostado à direita. Coroa o menu: é o correio
// da casa, e quando há trabalho por ver é a primeira coisa que se vê
// — sem alarme (o pulso do badge acontece duas vezes e cala-se).
function ItemCaixaEntrada({ naoLidas, onClick, compacto = false }) {
  const botao = (
    <button
      onClick={onClick}
      className="nv-item"
      aria-label={compacto ? "Caixa de Entrada" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: compacto ? "center" : "flex-start",
        gap: "12px",
        width: "100%",
        padding: compacto ? "10px 0" : "10px 14px",
        borderRadius: "10px",
        cursor: "pointer",
        textAlign: "left",
        position: "relative",
        // Sem fundo-pílula: o destaque de «página ativa» é ÚNICO no
        // menu, e pertence ao separador atual. O correio por ver
        // diz-se pela cor e pelo badge — chega, e não grita.
        backgroundColor: "transparent",
        border: "none",
        color: naoLidas > 0 ? "var(--gold-dark)" : "var(--gray-mid)",
      }}
    >
      <Icone nome="sino" tamanho={compacto ? 19 : 18} />
      {!compacto && (
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
      )}
      {compacto ? (
        naoLidas > 0 && (
          <span style={{ position: "absolute", top: "2px", right: "4px" }}>
            <BadgeNaoLidas quantos={naoLidas} tamanho={15} />
          </span>
        )
      ) : (
        <BadgeNaoLidas quantos={naoLidas} />
      )}
    </button>
  );
  if (!compacto) return botao;
  return (
    <div className="nv-porta" style={{ position: "relative" }}>
      {botao}
      <div className="nv-flyout" style={estFlyout}>
        <div style={estFlyoutPainel}>
          <span style={{ whiteSpace: "nowrap", fontSize: "12.5px" }}>
            Caixa de Entrada
          </span>
          <BadgeNaoLidas quantos={naoLidas} tamanho={16} />
        </div>
      </div>
    </div>
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
function ItemTema({ compacto = false }) {
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
      compacto={compacto}
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
// UM GRUPO da sidebar (modo normal): cabeçalho clicável + corpo que
// abre e fecha com uma dobra subtil (grid-template-rows — anima a
// altura real sem números mágicos). O grupo da página atual está
// SEMPRE aberto: fechar o sítio onde se está seria desorientação.
// Fechado, o cabeçalho carrega o contexto: título em ouro quando a
// página atual vive lá dentro, e a soma das contagens dos filhos.
// ------------------------------------------------------------
function GrupoNav({ grupo, aberto, contemAtivo, contagemFechado, onToggle, children }) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="nv-item"
        aria-expanded={aberto}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          width: "100%",
          padding: "9px 10px 9px 14px",
          border: "none",
          background: "transparent",
          borderRadius: "10px",
          cursor: contemAtivo ? "default" : "pointer",
          boxSizing: "border-box",
        }}
        title={contemAtivo ? "O grupo da página atual fica aberto" : undefined}
      >
        <span
          style={{
            fontSize: "9.5px",
            fontWeight: "700",
            color: contemAtivo ? "var(--gold-dark)" : "var(--gold)",
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            whiteSpace: "nowrap",
          }}
        >
          {grupo.titulo}
        </span>
        {!aberto && contemAtivo && (
          <span
            style={{
              width: "5px",
              height: "5px",
              borderRadius: "999px",
              backgroundColor: "var(--gold-dark)",
              flexShrink: 0,
            }}
          />
        )}
        {!aberto && <Contagem quantos={contagemFechado} />}
        <span
          className={`nv-chevron${aberto ? " aberto" : ""}`}
          style={{
            marginLeft: !aberto && contagemFechado ? "0" : "auto",
            color: "var(--gold)",
            display: "flex",
          }}
        >
          <Icone nome="chevron" tamanho={12} />
        </span>
      </button>
      <div className={`nv-grupo-corpo${aberto ? " aberto" : ""}`}>
        <div>{children}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// SIDEBAR — desktop.
// Normal (248px): diário à vista, domínios recolhíveis, conta no
// fundo. Compacta (72px): um rail de ícones — cada grupo é UM ícone
// cujo flyout revela os destinos; pensada para os ecrãs largos
// (Território, Dashboard, Agenda, Logística). A preferência e o
// estado dos grupos ficam no localStorage.
// ------------------------------------------------------------
export function SidebarNav({
  activeTab,
  onNavegar,
  onSair,
  naoLidas = 0,
  onAbrirNotificacoes,
  ocultar = [],
  // { [idDoSeparador]: número } — contagens discretas ao lado dos itens.
  contagens = {},
}) {
  const [abertos, setAbertos] = useState(lerGruposAbertos);
  const [compacta, setCompacta] = useState(lerNavCompacta);

  const alternarGrupo = (id, contemAtivo) => {
    // O grupo da página atual está sempre aberto — «fechá-lo» seria
    // um clique sem efeito visual que ainda por cima corrompia a
    // preferência guardada (a paridade de cliques mortos decidia o
    // estado futuro). Com a página lá dentro, o gesto não faz nada.
    if (contemAtivo) return;
    const novos = { ...abertos, [id]: !abertos[id] };
    setAbertos(novos);
    guardarGruposAbertos(novos);
  };
  const alternarCompacta = () => {
    setCompacta((v) => {
      guardarNavCompacta(!v);
      return !v;
    });
  };

  const grupos = NAV_GRUPOS.map((g) => ({
    ...g,
    itens: visiveis(g.itens, ocultar),
  })).filter((g) => g.itens.length > 0);

  const item = (it, extra = {}) => (
    <ItemNav
      key={it.id}
      item={it}
      ativo={activeTab === it.id}
      onClick={(ev) => onNavegar(it.id, ev)}
      contagem={contagens[it.id]}
      compacto={compacta}
      {...extra}
    />
  );

  return (
    <div
      className="nv-sidebar"
      style={{
        width: compacta ? "72px" : "248px",
        flexShrink: 0,
        backgroundColor: "var(--superficie)",
        borderRight: "1px solid var(--borda)",
        height: "100vh",
        position: "sticky",
        top: 0,
        // O sticky cria stacking context: sem zIndex próprio, os
        // flyouts do rail (zIndex interno) ficavam POR BAIXO dos
        // cabeçalhos sticky do conteúdo (CabecalhoEvento z20).
        // 30 = acima dos sticky das páginas, abaixo dos drawers (40+).
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        padding: compacta ? "18px 10px 14px" : "28px 14px 18px",
        boxSizing: "border-box",
        // No rail os flyouts saem para fora da sidebar — um scroller
        // clipava-os (overflow-y:auto arrasta o eixo x para auto).
        // O rail cabe sempre; o modo normal é que pode precisar de
        // rolar em ecrãs baixos.
        overflowY: compacta ? "visible" : "auto",
      }}
    >
      <style>{CSS_NAV}</style>

      {/* O logo coroa a sidebar — mesmo tratamento de luxo do hero do
          formulário de interesse (LogoDourado.jsx). No rail, recolhe
          para a marca pequena. */}
      <div style={{ textAlign: "center", marginBottom: compacta ? "16px" : "26px" }}>
        <LogoDourado size={compacta ? 44 : 132} />
      </div>

      {/* A Caixa de Entrada coroa o menu: é o correio da casa */}
      {onAbrirNotificacoes && (
        <ItemCaixaEntrada
          naoLidas={naoLidas}
          onClick={onAbrirNotificacoes}
          compacto={compacta}
        />
      )}

      {/* O trabalho de todos os dias — sempre à vista, sem dobras */}
      {NAV_DIARIA.map((it) => item(it))}

      {compacta ? (
        // Rail: cada domínio é UM ícone; o flyout traz os destinos.
        <>
          <div
            style={{
              height: "1px",
              backgroundColor: "var(--borda)",
              margin: "10px 6px",
            }}
          />
          {grupos.map((g) => {
            const contemAtivo = g.itens.some((i) => i.id === activeTab);
            const soma = g.itens.reduce((s, i) => s + (contagens[i.id] || 0), 0);
            return (
              <div key={g.id} className="nv-porta" style={{ position: "relative" }}>
                <div
                  className="nv-item"
                  role="button"
                  tabIndex={0}
                  aria-label={g.titulo}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "10px 0",
                    borderRadius: "10px",
                    cursor: "pointer",
                    position: "relative",
                    color: contemAtivo ? "var(--gold-dark)" : "var(--gray-mid)",
                    backgroundColor: contemAtivo
                      ? "var(--superficie-quente)"
                      : "transparent",
                  }}
                >
                  <Icone nome={g.icone} tamanho={19} />
                  {soma > 0 && (
                    <span
                      style={{
                        position: "absolute",
                        top: "4px",
                        right: "8px",
                        width: "7px",
                        height: "7px",
                        borderRadius: "999px",
                        backgroundColor: "var(--gold)",
                      }}
                    />
                  )}
                </div>
                <div className="nv-flyout" style={estFlyout}>
                  <div
                    style={{
                      ...estFlyoutPainel,
                      display: "block",
                      padding: "10px 8px",
                      minWidth: "196px",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "9px",
                        fontWeight: "700",
                        color: "var(--gold)",
                        textTransform: "uppercase",
                        letterSpacing: "0.2em",
                        margin: "0 0 6px 14px",
                      }}
                    >
                      {g.titulo}
                    </p>
                    {g.itens.map((it) => (
                      <ItemNav
                        key={it.id}
                        item={it}
                        ativo={activeTab === it.id}
                        onClick={(ev) => onNavegar(it.id, ev)}
                        contagem={contagens[it.id]}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      ) : (
        // Normal: domínios recolhíveis; o da página atual nunca fecha.
        <div style={{ marginTop: "14px" }}>
          {grupos.map((g) => {
            const contemAtivo = g.itens.some((i) => i.id === activeTab);
            const aberto = !!abertos[g.id] || contemAtivo;
            const soma = g.itens.reduce((s, i) => s + (contagens[i.id] || 0), 0);
            return (
              <GrupoNav
                key={g.id}
                grupo={g}
                aberto={aberto}
                contemAtivo={contemAtivo}
                contagemFechado={soma}
                onToggle={() => alternarGrupo(g.id, contemAtivo)}
              >
                {g.itens.map((it) => item(it, { indentado: true }))}
              </GrupoNav>
            );
          })}
        </div>
      )}

      {/* Conta e sistema — no fundo, fora da conversa dos módulos */}
      <div
        style={{
          marginTop: "auto",
          borderTop: "1px solid var(--borda)",
          paddingTop: "8px",
        }}
      >
        <button
          onClick={alternarCompacta}
          className="nv-item"
          aria-label={compacta ? "Expandir menu" : "Recolher menu"}
          title={compacta ? "Expandir menu" : "Recolher menu"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: compacta ? "center" : "flex-start",
            gap: "12px",
            width: "100%",
            padding: compacta ? "9px 0" : "8px 14px",
            border: "none",
            background: "transparent",
            borderRadius: "10px",
            cursor: "pointer",
            color: "var(--gray-mid)",
          }}
        >
          <span
            className={`nv-recolhe${compacta ? " compacta" : ""}`}
            style={{ display: "flex" }}
          >
            <Icone nome="recolher" tamanho={17} />
          </span>
          {!compacta && (
            <span style={{ fontSize: "12.5px", letterSpacing: "0.02em" }}>
              Recolher
            </span>
          )}
        </button>
        <ItemTema compacto={compacta} />
        <ItemNav
          item={{ id: "__sair", label: "Sair", icone: "sair" }}
          ativo={false}
          onClick={onSair}
          compacto={compacta}
        />
      </div>
    </div>
  );
}

// As microinterações da navegação — só o que os estilos inline não
// dizem (hover, foco, dobras, flyouts). 140–220 ms, sem bounce.
const CSS_NAV = `
.nv-sidebar{transition:width .22s ease,padding .22s ease}
.nv-item{transition:background-color .16s ease,color .16s ease}
.nv-item:hover{background-color:var(--superficie-quente)}
.nv-item:focus-visible{outline:2px solid var(--gold);outline-offset:-2px}
.nv-grupo-corpo{display:grid;grid-template-rows:0fr;transition:grid-template-rows .22s ease}
.nv-grupo-corpo.aberto{grid-template-rows:1fr}
.nv-grupo-corpo>div{overflow:hidden;min-width:0}
.nv-chevron{transition:transform .2s ease}
.nv-chevron.aberto{transform:rotate(90deg)}
.nv-flyout{opacity:0;margin-left:-4px;pointer-events:none;transition:opacity .14s ease,margin-left .14s ease}
.nv-porta:hover .nv-flyout,.nv-porta:focus-within .nv-flyout{opacity:1;margin-left:0;pointer-events:auto}
.nv-recolhe{transition:transform .25s ease}
.nv-recolhe.compacta{transform:rotate(180deg)}
@media (prefers-reduced-motion:reduce){
  .nv-sidebar,.nv-item,.nv-grupo-corpo,.nv-chevron,.nv-flyout,.nv-recolhe{transition:none}
}
`;

// ------------------------------------------------------------
// BARRA INFERIOR — telemóvel
// ------------------------------------------------------------
export function BottomNavMovel({ activeTab, onNavegar, onAbrirMais }) {
  const rotas = useRotas();
  const maisAtivo = IDS_NO_MAIS.includes(activeTab);
  const itens = [
    ...NAV_MOVEL.map((n) => ({ ...n, acao: (ev) => onNavegar(n.id, ev) })),
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
            to={rotas.separador(item.id)}
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
export function SheetMais({ activeTab, onNavegar, onSair, onFechar, contagens = {}, ocultar = [] }) {
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
          maxHeight: "80vh",
          overflowY: "auto",
          boxSizing: "border-box",
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
        {/* Os mesmos domínios da sidebar — na folha ficam sempre
            abertos (é um menu pontual; dobrar aqui seria atrito), e
            os destinos que já vivem na barra inferior não se repetem. */}
        {NAV_GRUPOS.map((g) => {
          const itens = visiveis(g.itens, ocultar).filter(
            (i) => !IDS_NA_BARRA.includes(i.id),
          );
          if (!itens.length) return null;
          return (
            <div key={g.id}>
              <TituloSeccao>{g.titulo}</TituloSeccao>
              {itens.map((item) => (
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
            </div>
          );
        })}
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
