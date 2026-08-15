import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { comporFolha } from "../lib/comunicados";
import { realce } from "../lib/realce";
import {
  linkWhatsAppCasa,
  numeroLegivel,
  logoDe,
  assinaturaFolha,
  siteDe,
} from "../lib/casa";
import CasaProvider, { useCasa } from "../components/CasaProvider";
import { casaPorTokenDeComunicado } from "../lib/identidadeCasa";

// ============================================================
// ComunicadoPage — /comunicado/:token, a folha pública de um comunicado.
//
// NÃO é o portal. A folha existe para ser passada adiante — dos noivos
// para o espaço, para a wedding planner, para os fornecedores — e por
// isso não leva UM dado pessoal e não importa nada de components/portal.
//
// Uma única chamada, à única porta que o público tem: a RPC
// dlm_comunicado_ver (079), concedida SÓ ao anon. Conta uma leitura de
// cada vez que corre — é por isso que o backoffice nunca a chama e a
// pré-visualização dele compõe dos dados locais.
//
// Três estados: o esqueleto (a forma da folha, nunca um spinner), a
// cortina (token terminado E erro de rede — a mesma peça, palavras
// diferentes, como a do portal) e a folha. Inexistente, retirada e
// expirada são indistinguíveis de propósito: a resposta é a mesma.
//
// A folha tem um REGISTO (080): 'aviso' ou 'oferta' — a MESMA página
// com dois temperamentos, nunca dois componentes. O registo decide o
// desenho (centrado, maior, à sangria); o conteúdo é o mesmo.
//
// O PDF nasce da impressão da própria página — o padrão dos geradores
// da casa: um <style> de impressão dentro da página e a troca do
// document.title durante o print (o molde do GerarOrcamento).
// ============================================================

// ---------- O estilo de impressão ----------
// O papel A4 despe a folha (sem borda, sombra nem largura máxima) e põe
// os grupos de cláusulas em duas colunas — no ecrã a coluna única lê-se
// melhor ao telemóvel, no papel a folha inteira quer caber numa página.
// Os !important existem porque os estilos em linha ganham sempre à
// folha de estilos; aqui é o papel que tem de ganhar. A .sangria (a
// imagem da oferta, que no ecrã fura as margens do cartão) volta a
// caber na coluna: o A4 não tem sangria — sem esta regra a imagem
// saía do papel. A .so-print é o inverso da .no-print: o que só
// existe no papel (o número da casa no rodapé — a frase impressa tem
// de funcionar sem toque).
const ESTILO_IMPRESSAO = `
@page { size: A4; margin: 13mm 15mm 12mm; }
@media print {
  body { background: #FFFFFF !important; }
  .no-print { display: none !important; }
  .so-print { display: inline !important; }
  #pagina-comunicado { padding: 0 !important; }
  #marca-comunicado { padding-top: 0 !important; }
  #folha-comunicado { border: none !important; box-shadow: none !important; border-radius: 0 !important; max-width: none !important; padding: 14px 2px 0 !important; margin-top: 8px !important; }
  #folha-comunicado .atos { display: grid !important; grid-template-columns: 1fr 1fr; column-gap: 32px; }
  #folha-comunicado .bloco { break-inside: avoid; }
  #folha-comunicado .sangria { margin-left: 0 !important; margin-right: 0 !important; }
  #folha-comunicado .clausula { padding: 12px 0 10px !important; }
  #folha-comunicado .par { font-size: 12.5px !important; line-height: 1.6 !important; }
  #folha-comunicado .texto-final { font-size: 15px !important; }
  * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
`;

// ---------- Peças locais ----------
// Nenhuma outra página as usa; ficam aqui.

// A cápsula da casa (o botão de imprimir, o «Falar pelo WhatsApp», o
// «Tentar novamente», a chamada do registo aviso). Hover por estado
// porque :hover não se escreve em linha — e a folha de estilos desta
// página é só de impressão.
function Capsula({ href, onClick, children, style }) {
  const [sobre, setSobre] = useState(false);
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    padding: "9px 16px",
    border: `1.5px solid ${sobre ? "#C9A84C" : "#E8D5A3"}`,
    borderRadius: "999px",
    backgroundColor: sobre ? "#FBF7EF" : "#FFFFFF",
    color: "#A07830",
    fontFamily: "'Inter', sans-serif",
    fontSize: "11.5px",
    fontWeight: 600,
    letterSpacing: "0.04em",
    cursor: "pointer",
    whiteSpace: "nowrap",
    textDecoration: "none",
    transition: "background-color 140ms ease, border-color 140ms ease",
    ...style,
  };
  const eventos = {
    onMouseEnter: () => setSobre(true),
    onMouseLeave: () => setSobre(false),
  };
  return href ? (
    <a href={href} style={base} {...eventos}>{children}</a>
  ) : (
    <button type="button" onClick={onClick} style={base} {...eventos}>{children}</button>
  );
}

// O botão dourado cheio — só a chamada do registo oferta o usa: a
// oferta pede, o aviso informa, e o peso do botão diz qual é qual.
// Hover por estado, como a Capsula e pela mesma razão.
function BotaoDourado({ href, children }) {
  const [sobre, setSobre] = useState(false);
  return (
    <a
      href={href}
      onMouseEnter={() => setSobre(true)}
      onMouseLeave={() => setSobre(false)}
      style={{
        display: "inline-block",
        padding: "15px 34px",
        borderRadius: "12px",
        backgroundColor: sobre ? "#B9973E" : "#C9A84C",
        color: "#1A1A1A",
        fontFamily: "'Inter', sans-serif",
        fontSize: "14px",
        fontWeight: 600,
        textDecoration: "none",
        boxShadow: "0 4px 12px rgba(201,168,76,0.30)",
        transition: "background-color 140ms ease",
      }}
    >
      {children}
    </a>
  );
}

// O filete rotulado: filete — overline — filete. Abre os grupos de
// cláusulas e o remate.
function FileteRotulado({ children, margem }) {
  const filete = { flex: 1, height: "1px", backgroundColor: "#F0E6D0" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: margem }}>
      <div style={filete} />
      <div
        style={{
          fontSize: "9.5px",
          fontWeight: 700,
          letterSpacing: "0.22em",
          color: "#A07830",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          flex: "none",
        }}
      >
        {children}
      </div>
      <div style={filete} />
    </div>
  );
}

// O cabeçalho de marca: halo (só no ecrã), logo e overline. A cortina e
// a folha partilham-no — é a mesma casa a falar.
function Marca({ altura = 118 }) {
  const casa = useCasa();
  return (
    <header
      id="marca-comunicado"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "9px",
        paddingTop: "8px",
      }}
    >
      <div
        className="no-print"
        aria-hidden
        style={{
          position: "absolute",
          top: "-36px",
          left: "50%",
          marginLeft: "-170px",
          width: "340px",
          height: "230px",
          background: "radial-gradient(closest-side, rgba(232,213,163,0.52), rgba(250,250,248,0))",
          pointerEvents: "none",
        }}
      />
      <img
        src={logoDe(casa)}
        alt={casa.nome}
        style={{ position: "relative", height: `${altura}px`, width: "auto", display: "block" }}
      />
      <div
        style={{
          position: "relative",
          fontSize: "9.5px",
          fontWeight: 700,
          letterSpacing: "0.22em",
          color: "#A07830",
          textTransform: "uppercase",
          marginTop: "5px",
          whiteSpace: "nowrap",
          textAlign: "center",
        }}
      >
        {casa.linha_actividade}
      </div>
    </header>
  );
}

// Um bloco do esqueleto — a classe global .esqueleto (index.css) traz a
// ondulação calma e pára sozinha com prefers-reduced-motion.
function Esq({ w = "100%", h = 12, r = 8, style }) {
  return (
    <div
      aria-hidden
      className="esqueleto"
      style={{ width: w, height: h, borderRadius: r, ...style }}
    />
  );
}

// ---------- A cortina ----------
// Serve o endereço terminado E o erro de rede: a mesma peça, palavras
// diferentes. As palavras do terminado NUNCA dizem «já»: servem
// igualmente quem recebeu um endereço retirado e quem nunca teve
// ligação nenhuma — não se confirma nem se desmente que existiu.
// A saída (o WhatsApp da casa + o domínio) está nas DUAS cortinas —
// quem cai aqui é quem pior conhece a casa; só o erro soma o botão
// de repetir, primeiro.
function Cortina({ titulo, corpo, aoRepetir, mensagemWhatsApp }) {
  const casa = useCasa();
  const ligacao = {
    color: "#A07830",
    textDecorationColor: "#E8D5A3",
    textUnderlineOffset: "3px",
  };
  return (
    <div
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        backgroundColor: "#FAFAF8",
        color: "#1A1A1A",
        fontFamily: "'Inter', sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "48px 26px",
      }}
    >
      <Marca altura={112} />

      <div
        style={{
          marginTop: "52px",
          fontSize: "9.5px",
          fontWeight: 700,
          letterSpacing: "0.22em",
          color: "#A07830",
        }}
      >
        COMUNICADO
      </div>
      <h1
        style={{
          margin: "14px 0 0",
          maxWidth: "340px",
          fontFamily: "'Playfair Display', serif",
          fontSize: "22px",
          lineHeight: 1.42,
          fontWeight: 400,
          textWrap: "balance",
        }}
      >
        {titulo}
      </h1>
      <p
        style={{
          margin: "16px 0 0",
          maxWidth: "320px",
          fontSize: "13px",
          lineHeight: 1.7,
          color: "#6B6B6B",
          textWrap: "pretty",
        }}
      >
        {corpo}
      </p>

      {aoRepetir && (
        <div style={{ marginTop: "32px" }}>
          <Capsula onClick={aoRepetir} style={{ gap: "8px", padding: "11px 20px", fontSize: "12.5px" }}>
            Tentar novamente
          </Capsula>
        </div>
      )}

      {/* O meio de contacto é o WhatsApp da casa (correcção do dono)
          — nada de mailto em lado nenhum desta página. O texto
          pré-escrito é de cada estado: conta o que a leitora viu, com
          a voz dela. */}
      <div style={{ marginTop: aoRepetir ? "16px" : "32px" }}>
        <Capsula
          href={linkWhatsAppCasa(casa, mensagemWhatsApp)}
          style={{ gap: "8px", padding: "11px 20px", fontSize: "12.5px" }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4.5 11A5 5 0 1 1 6.3 12.2L2.8 13.6Z" />
          </svg>
          Falar pelo WhatsApp
        </Capsula>
      </div>
      <p style={{ margin: "18px 0 0", fontSize: "12px", color: "#6B6B6B" }}>
        E se procura a {casa.nome}, está em{" "}
        <a href={siteDe(casa)} style={ligacao}>{casa.dominio}</a>.
      </p>
    </div>
  );
}

// ---------- As peças da folha ----------

function Clausula({ peca, ultima }) {
  return (
    <div
      className="bloco clausula"
      style={{
        display: "flex",
        gap: "14px",
        padding: "15px 2px 13px",
        // A última cláusula de cada grupo fecha sem hairline — o filete
        // do grupo seguinte (ou o remate) já desenha a fronteira.
        borderBottom: ultima ? "none" : "1px solid #F5ECD7",
      }}
    >
      <div
        style={{
          flex: "none",
          width: "22px",
          textAlign: "center",
          fontFamily: "'Playfair Display', serif",
          fontSize: "15px",
          color: "#C9A84C",
          paddingTop: "1px",
        }}
      >
        {peca.num}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "13.5px", fontWeight: 600 }}>{peca.rotulo}</div>
        <p
          className="par"
          style={{ margin: "6px 0 0", fontSize: "13.5px", lineHeight: 1.7, whiteSpace: "pre-line", textWrap: "pretty" }}
        >
          {realce(peca.texto)}
        </p>
      </div>
    </div>
  );
}

function Peca({ peca, oferta }) {
  if (peca.papel === "prosa") {
    return (
      <div className="bloco">
        <p
          className="par"
          style={
            oferta
              ? {
                  // O registo oferta: centrada, maior, mais arejada e
                  // apertada à medida do desenho — a coluna estreita é
                  // o que faz a prosa curta parecer intencional.
                  margin: "24px auto 0",
                  maxWidth: "330px",
                  textAlign: "center",
                  fontSize: "14.5px",
                  lineHeight: 1.85,
                  whiteSpace: "pre-line",
                  textWrap: "pretty",
                }
              : {
                  margin: "22px 0 0",
                  fontSize: "13.5px",
                  lineHeight: 1.75,
                  whiteSpace: "pre-line",
                  textWrap: "pretty",
                }
          }
        >
          {realce(peca.texto)}
        </p>
      </div>
    );
  }
  // A imagem: no aviso, uma moldura dentro da coluna; na oferta, à
  // sangria — as margens negativas anulam o padding do cartão e o
  // recorte é do PRÓPRIO bloco (overflow no cartão arriscava cortar
  // conteúdo na fronteira de página do papel).
  if (peca.papel === "imagem") {
    // Sem endereço não há moldura vazia — o bloco não sai na folha.
    if (!peca.url) return null;
    const legenda = peca.legenda ? (
      <p
        style={{
          margin: oferta ? "10px auto 0" : "8px 0 0",
          textAlign: oferta ? "center" : undefined,
          fontSize: "11px",
          fontStyle: "italic",
          color: "#6B6B6B",
        }}
      >
        {peca.legenda}
      </p>
    ) : null;
    // alt vazio de propósito: quando há legenda, ela é visível e é a
    // única voz da imagem — o leitor de ecrã não lê o mesmo duas vezes.
    const imagem = (
      <img
        src={peca.url}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    );
    // A legenda mora no mesmo .bloco da imagem para o papel nunca as
    // separar (break-inside: avoid é por bloco).
    return oferta ? (
      <div className="bloco">
        <div className="sangria" style={{ margin: "26px -26px 0", height: "320px", overflow: "hidden" }}>
          {imagem}
        </div>
        {legenda}
      </div>
    ) : (
      <div className="bloco">
        <div style={{ margin: "22px 0 0", height: "200px", border: "1px solid #E8D5A3", borderRadius: "12px", overflow: "hidden" }}>
          {imagem}
        </div>
        {legenda}
      </div>
    );
  }
  // A chamada: botão dourado cheio na oferta, cápsula de contorno no
  // aviso — o mesmo destino com dois pesos. A nota em itálico por baixo
  // situa o botão com as palavras de quem escreveu a folha.
  if (peca.papel === "chamada") {
    // Um botão sem palavras ou sem destino não é botão — não sai.
    if (!peca.rotulo || !peca.url) return null;
    return (
      <div
        className="bloco"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: oferta ? "26px" : "22px" }}
      >
        {oferta ? (
          <BotaoDourado href={peca.url}>{peca.rotulo}</BotaoDourado>
        ) : (
          <Capsula href={peca.url} style={{ padding: "11px 22px", fontSize: "12.5px", letterSpacing: "normal" }}>
            {peca.rotulo}
          </Capsula>
        )}
        {peca.nota && (
          <p style={{ margin: oferta ? "10px 0 0" : "9px 0 0", fontSize: "11px", fontStyle: "italic", color: "#6B6B6B", textAlign: "center" }}>
            {peca.nota}
          </p>
        )}
      </div>
    );
  }
  if (peca.papel === "nota") {
    return (
      <aside
        className="bloco"
        style={{
          marginTop: "22px",
          backgroundColor: "#FEF9EC",
          border: "1px solid #E8D5A3",
          borderRadius: "12px",
          padding: "16px 18px",
        }}
      >
        <div
          style={{
            fontSize: "9.5px",
            fontWeight: 700,
            letterSpacing: "0.18em",
            color: "#A07830",
            textTransform: "uppercase",
          }}
        >
          {peca.rotulo}
        </div>
        <p
          className="par"
          style={{ margin: "8px 0 0", fontSize: "13.5px", lineHeight: 1.7, whiteSpace: "pre-line", textWrap: "pretty" }}
        >
          {realce(peca.texto)}
        </p>
      </aside>
    );
  }
  if (peca.papel === "remate") {
    return (
      <div className="bloco" style={{ marginTop: "26px" }}>
        <FileteRotulado margem="0">{peca.rotulo}</FileteRotulado>
        <p
          className="texto-final"
          style={{
            margin: "16px auto 0",
            maxWidth: "370px",
            textAlign: "center",
            fontFamily: "'Playfair Display', serif",
            fontSize: "16.5px",
            lineHeight: 1.72,
            whiteSpace: "pre-line",
            textWrap: "pretty",
          }}
        >
          {realce(peca.texto)}
        </p>
      </div>
    );
  }
  // Uma cláusula órfã (sem grupo aberto antes dela) desenha-se igual às
  // outras, sozinha e sem hairline. O grupo solto nunca chega aqui.
  if (peca.papel === "clausula") return <Clausula peca={peca} ultima />;
  return null;
}

// Os grupos e as suas cláusulas agrupam-se em secções, e as secções
// consecutivas num só embrulho .atos — é a esse embrulho que o papel A4
// aplica as duas colunas («A folha em A4»). No ecrã não muda nada.
const estruturar = (pecas) => {
  const itens = [];
  for (const p of pecas) {
    if (p.papel === "vazio") continue;
    const ultimo = itens[itens.length - 1];
    if (p.papel === "grupo") {
      const seccao = { grupo: p, clausulas: [] };
      if (ultimo?.tipo === "atos") ultimo.seccoes.push(seccao);
      else itens.push({ tipo: "atos", seccoes: [seccao] });
    } else if (p.papel === "clausula" && ultimo?.tipo === "atos") {
      ultimo.seccoes[ultimo.seccoes.length - 1].clausulas.push(p);
    } else {
      itens.push({ tipo: "peca", peca: p });
    }
  }
  return itens;
};

// ---------- A folha ----------

function Folha({ dados }) {
  const casa = useCasa();
  const itens = estruturar(comporFolha(dados.blocos));
  const assinatura = assinaturaFolha(casa);

  // O registo é temperamento, não outra página: 'oferta' centra, cresce
  // e enche; qualquer outro valor (ou nenhum — as folhas da fase 1)
  // desenha o 'aviso' de sempre. Nota destaque, remate e assinatura não
  // mudam de registo.
  const oferta = dados.registo === "oferta";
  const subtitulo = (dados.subtitulo || "").trim();
  // A saudação vive na COLUNA (085), não nos blocos: a composição já
  // não a conhece e ela desenha-se UMA vez, aqui no topo. Se a RPC em
  // produção ainda não a devolver (a 085 por correr), simplesmente não
  // sai — nunca um crash.
  const saudacao = (dados.saudacao || "").trim();

  // O browser põe o <title> no nome do PDF; trocamo-lo durante a
  // impressão para o título da folha e repomos logo a seguir — o padrão
  // do GerarOrcamento.
  const imprimir = () => {
    const anterior = document.title;
    document.title = `${dados.titulo || "Comunicado"} — ${casa.nome}`;
    window.print();
    document.title = anterior;
  };

  return (
    <div
      id="pagina-comunicado"
      style={{
        minHeight: "100vh",
        backgroundColor: "#FAFAF8",
        color: "#1A1A1A",
        fontFamily: "'Inter', sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "42px 12px 56px",
      }}
    >
      <style>{ESTILO_IMPRESSAO}</style>

      <Marca />

      <div className="no-print" style={{ marginTop: "22px" }}>
        <Capsula onClick={imprimir}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4.5 6V2.5h7V6" />
            <rect x="2.5" y="6" width="11" height="5.5" rx="1.2" />
            <path d="M4.5 9.5h7V14h-7" />
          </svg>
          Imprimir / Guardar PDF
        </Capsula>
      </div>

      <main
        id="folha-comunicado"
        style={{
          backgroundColor: "#FFFFFF",
          border: "1.5px solid #E8D5A3",
          borderRadius: "16px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
          maxWidth: "480px",
          width: "100%",
          boxSizing: "border-box",
          marginTop: "24px",
          padding: "34px 26px 34px",
        }}
      >
        {/* Na oferta o subtítulo SOBE para a overline («DIA DA MÃE») e
            não repete em parágrafo — a folha ganha um assunto em vez de
            um resumo; sem subtítulo fica o «COMUNICADO» de sempre. */}
        <div
          style={{
            textAlign: "center",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.22em",
            color: "#A07830",
            textTransform: "uppercase",
          }}
        >
          {oferta && subtitulo ? subtitulo : "COMUNICADO"}
        </div>
        <h1
          style={{
            margin: oferta ? "14px 0 0" : "12px 0 0",
            textAlign: "center",
            fontFamily: "'Playfair Display', serif",
            fontSize: oferta ? "27px" : "24px",
            lineHeight: oferta ? 1.35 : 1.32,
            fontWeight: 400,
            textWrap: "balance",
          }}
        >
          {dados.titulo}
        </h1>
        {!oferta && dados.subtitulo && (
          <p
            style={{
              margin: "13px auto 0",
              maxWidth: "350px",
              textAlign: "center",
              fontSize: "12px",
              lineHeight: 1.6,
              color: "#6B6B6B",
            }}
          >
            {dados.subtitulo}
          </p>
        )}

        {/* O filete central é do aviso; na oferta o título respira
            sozinho — é a imagem ou a prosa que abrem a seguir. */}
        {!oferta && (
          <div style={{ display: "flex", justifyContent: "center", margin: "22px 0 0" }}>
            <div style={{ width: "56px", height: "1px", backgroundColor: "#E8D5A3" }} />
          </div>
        )}

        {/* A saudação de cerimónia, antes da primeira peça. Na oferta
            tudo se centra — a saudação é convite, não carta. */}
        {saudacao && (
          <p
            style={{
              margin: "22px 0 0",
              textAlign: oferta ? "center" : undefined,
              fontFamily: "'Playfair Display', serif",
              fontStyle: "italic",
              fontSize: "17px",
              color: "#A07830",
            }}
          >
            {saudacao}
          </p>
        )}

        {itens.map((item, i) =>
          item.tipo === "atos" ? (
            <div className="atos" key={`atos-${i}`} style={{ marginTop: "6px" }}>
              {item.seccoes.map((s) => (
                <section key={s.grupo.id}>
                  {/* Na oferta o grupo não separa: anuncia — a overline
                      dourada centrada («Mesas a partir de seis pessoas»)
                      respira com line-height em vez de filetes. */}
                  {oferta ? (
                    <div
                      style={{
                        margin: "20px auto 0",
                        textAlign: "center",
                        fontSize: "10px",
                        fontWeight: 700,
                        letterSpacing: "0.16em",
                        lineHeight: 1.9,
                        color: "#A07830",
                        textTransform: "uppercase",
                        whiteSpace: "pre-line",
                      }}
                    >
                      {s.grupo.rotulo}
                    </div>
                  ) : (
                    <FileteRotulado margem="24px 0 2px">{s.grupo.rotulo}</FileteRotulado>
                  )}
                  {s.clausulas.map((c, j) => (
                    <Clausula key={c.id} peca={c} ultima={j === s.clausulas.length - 1} />
                  ))}
                </section>
              ))}
            </div>
          ) : (
            <Peca key={item.peca.id} peca={item.peca} oferta={oferta} />
          )
        )}

        {/* A assinatura fixa da casa — não vem dos blocos: toda a folha
            fecha assim, seja qual for o assunto. */}
        <div
          className="bloco"
          style={{ marginTop: "30px", display: "flex", flexDirection: "column", alignItems: "center" }}
        >
          <svg width="7" height="7" viewBox="0 0 8 8" aria-hidden="true">
            <rect x="1.75" y="1.75" width="4.5" height="4.5" transform="rotate(45 4 4)" fill="#C9A84C" />
          </svg>
          <p
            style={{
              margin: "14px 0 0",
              fontFamily: "'Playfair Display', serif",
              fontStyle: "italic",
              fontSize: "16px",
              color: "#A07830",
            }}
          >
            {assinatura.despedida}
          </p>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "21px", marginTop: "4px" }}>
            {assinatura.nome}
          </div>
          <div
            style={{
              fontSize: "8.5px",
              fontWeight: 700,
              letterSpacing: "0.22em",
              color: "#9B9B9B",
              marginTop: "9px",
            }}
          >
            {casa.dominio.toUpperCase()}
          </div>
        </div>

        {/* «esta folha», e não «estas orientações»: o desenho falava do
            exemplo; a pergunta tem de servir qualquer assunto. E a
            resposta é o WhatsApp da casa (correcção do dono) — o email
            saiu de todas as folhas: é pelo WhatsApp que a casa fala.
            O pré-escrito leva o título quando a folha o tem — com
            várias folhas no ar, a Nádia não tem de perguntar «qual?»;
            e no papel a frase ganha o número à vista (.so-print). */}
        <div
          className="bloco"
          style={{ marginTop: "28px", borderTop: "1px solid #F5ECD7", paddingTop: "14px", textAlign: "center" }}
        >
          <p style={{ margin: 0, fontSize: "11.5px", lineHeight: 1.6, color: "#6B6B6B" }}>
            Alguma questão sobre esta folha?{" "}
            <a
              href={linkWhatsAppCasa(
                casa,
                dados.titulo
                  ? `Olá! Escrevo sobre a folha «${dados.titulo}» da ${casa.nome}.`
                  : `Olá! Escrevo sobre uma folha da ${casa.nome}.`
              )}
              style={{ color: "#A07830", textDecorationColor: "#E8D5A3", textUnderlineOffset: "3px" }}
            >
              Fale connosco pelo WhatsApp
            </a>
            <span className="so-print" style={{ display: "none" }}>: {numeroLegivel(casa)}</span>
            .
          </p>
        </div>
      </main>
    </div>
  );
}

// ---------- O esqueleto ----------
// A forma da folha antes da folha: a marca é local e pinta logo; o
// cartão espera com blocos calmos no lugar do texto. Nunca um spinner.
function EsqueletoDaFolha() {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#FAFAF8",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "42px 12px 56px",
      }}
    >
      <Marca />
      <Esq w={172} h={33} r={999} style={{ marginTop: "22px" }} />
      <div
        style={{
          backgroundColor: "#FFFFFF",
          border: "1.5px solid #E8D5A3",
          borderRadius: "16px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
          maxWidth: "480px",
          width: "100%",
          boxSizing: "border-box",
          marginTop: "24px",
          padding: "34px 26px 34px",
        }}
      >
        <Esq w={96} h={10} style={{ margin: "0 auto" }} />
        <Esq w="72%" h={24} style={{ margin: "14px auto 0" }} />
        <Esq w="52%" h={12} style={{ margin: "13px auto 0" }} />
        <Esq w={56} h={2} r={0} style={{ margin: "22px auto 0" }} />
        <Esq w={130} h={15} style={{ marginTop: "24px" }} />
        <Esq w="100%" h={12} style={{ marginTop: "14px" }} />
        <Esq w="100%" h={12} style={{ marginTop: "8px" }} />
        <Esq w="68%" h={12} style={{ marginTop: "8px" }} />
        <Esq w="100%" h={76} r={12} style={{ marginTop: "22px" }} />
        <Esq w={140} h={10} style={{ margin: "26px auto 0" }} />
        <Esq w="100%" h={54} style={{ marginTop: "16px" }} />
        <Esq w="100%" h={54} style={{ marginTop: "12px" }} />
      </div>
    </div>
  );
}

// ---------- A página ----------

// A casa vem do token do comunicado (098). O Provider fica por FORA do
// conteúdo de propósito: quem cai nas cortinas é quem pior conhece a
// casa, e é aí que o cabeçalho tem de estar certo — um Provider por
// dentro deixaria o estado terminado a assinar com a casa errada.
export default function ComunicadoPage() {
  const { token } = useParams();
  return (
    <CasaProvider chave={token} carregar={() => casaPorTokenDeComunicado(token)}>
      <ComunicadoConteudo />
    </CasaProvider>
  );
}

function ComunicadoConteudo() {
  const { token } = useParams();
  const casa = useCasa();
  const [resultado, setResultado] = useState(null);
  // O «Tentar novamente» da cortina de erro incrementa-a e o efeito
  // refaz o pedido — sem window.location.reload (o padrão do portal).
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let cancelado = false;
    supabase
      .rpc("dlm_comunicado_ver", { p_token: token })
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) {
          console.error(error);
          setResultado({ estado: "erro" });
          return;
        }
        setResultado(
          data?.estado === "activo"
            ? { estado: "activo", dados: data }
            : { estado: "terminado" }
        );
      })
      // O supabase-js devolve os erros no objecto, mas se alguma coisa
      // rebentar fora desse contrato o esqueleto não pode ficar no ecrã
      // para sempre — cai na mesma cortina de erro, com o mesmo botão.
      .catch((e) => {
        console.error(e);
        if (!cancelado) setResultado({ estado: "erro" });
      });
    return () => {
      cancelado = true;
    };
  }, [token, tentativa]);

  // O título do separador é o da folha — é também o que dá nome ao PDF
  // se alguém imprimir sem passar pelo botão. Fora da folha fica o
  // neutro do index.html, que a pré-visualização das conversas usa.
  useEffect(() => {
    if (resultado?.estado === "activo") {
      document.title = `${resultado.dados.titulo || "Comunicado"} — ${casa.nome}`;
    } else {
      document.title = casa.nome;
    }
  }, [resultado, casa.nome]);

  if (resultado === null) return <EsqueletoDaFolha />;

  if (resultado.estado === "erro") {
    return (
      <Cortina
        titulo="Não foi possível abrir o comunicado."
        corpo="Verifique a ligação à internet."
        mensagemWhatsApp={`Olá! Tentei abrir um comunicado da ${casa.nome} e não consegui.`}
        aoRepetir={() => {
          setResultado(null);
          setTentativa((t) => t + 1);
        }}
      />
    );
  }

  if (resultado.estado === "terminado") {
    return (
      <Cortina
        titulo="Não há nenhum comunicado neste endereço."
        corpo="Se este endereço lhe foi enviado numa conversa, peça um novo a quem o enviou."
        mensagemWhatsApp={`Olá! Abri o endereço que me enviaram e diz que não há nenhum comunicado da ${casa.nome}.`}
      />
    );
  }

  return <Folha dados={resultado.dados} />;
}
