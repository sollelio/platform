import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  overline, playfair, diaMesAno, semanaEDia,
  HACHURA, ehCodigoDeCor, naoVazio,
} from "./base";
import {
  FileteComLosango, FileteComRotulo, CartaoBranco, Medalhao, EngasteVazio,
  CabecalhoDivisao, CitacaoDela, ListaDaCasa, FraseDeFecho, Divisao,
} from "./pecas";

// ============================================================
// divisoes.jsx — as sete divisões da fase 2 do acompanhamento.
//
// A REGRA QUE GOVERNA TUDO (folha de decisões): o portal monta-se com o que
// existe. Não é um molde com buracos. Cada divisão só existe se tiver
// matéria; quando falta, não deixa espaço, não deixa rótulo, não deixa nada.
// A ordem é fixa — o que varia é quantas aparecem.
//
// Por isso cada componente aqui devolve `null` sem cerimónia quando não tem
// de que falar. Só duas fazem excepção, e por boa razão: «o que falta de si»
// e «as novidades» existem mesmo vazias, porque a ausência ali é uma notícia
// boa que vale a pena dar.
//
// O CASO COMUM é só o pedido respondido: 8 de 13 eventos não têm
// questionário. As quatro últimas divisões faltam nesses.
//
// Nenhuma destas peças conhece um `id` de campo. O que vem do questionário
// chega já resolvido pela RPC (054), com o rótulo do próprio modelo — porque
// os ids divergem entre modelos para o mesmo conceito.
// ============================================================

// ------------------------------------------------------------
// A ligação sublinhada dos cartões — pendências e novidades.
//
// O alvo de toque cresce para ≥44px com padding compensado por margem
// negativa; o sublinhado vive num <span> interior para ficar colado ao
// texto (no elemento exterior, o traço descia com o padding).
// ------------------------------------------------------------
function LigacaoDeCartao({ to, rotulo }) {
  return (
    <Link
      to={to}
      style={{
        display: "inline-block",
        padding: "12px 10px",
        margin: "0 -10px -12px",
        fontSize: "12px",
        letterSpacing: "0.03em",
        color: "var(--charcoal)",
        textDecoration: "none",
      }}
    >
      <span style={{ borderBottom: "1px solid #E8D5A3", paddingBottom: "3px" }}>
        {rotulo}
      </span>
    </Link>
  );
}

// ------------------------------------------------------------
// 4 · O QUE FALTA DE SI
//
// Diz-se pelo alívio, não pela cobrança. E a ausência de pendências diz
// sempre alguma coisa boa — nunca fica em branco.
// ------------------------------------------------------------
export function OQueFaltaDeSi({ pendencias = [], doNossoLado = [] }) {
  const vazia = pendencias.length === 0;

  return (
    <Divisao>
      {vazia ? (
        <>
          <h2 style={{ ...overline(), textAlign: "center" }}>O que falta de si</h2>
          <div style={{ position: "relative", marginTop: "22px" }}>
            <CartaoBranco padding="30px 18px" style={{ textAlign: "center" }}>
              <Medalhao />
              <p style={{ ...playfair, fontSize: "21px", lineHeight: 1.32, marginTop: "6px", textWrap: "balance" }}>
                Nada. Está tudo entregue.
              </p>
              <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "11px 0 0", textWrap: "pretty" }}>
                Daqui até ao dia, o trabalho é nosso. Se precisarmos de alguma
                coisa, aparece aqui e receberá um aviso.
              </p>
            </CartaoBranco>
          </div>
        </>
      ) : (
        <>
          <CabecalhoDivisao
            rotulo="O que falta de si"
            frase={
              pendencias.length === 1
                ? "Uma coisa depende de si. O resto está connosco."
                : `${pendencias.length === 2 ? "Duas" : pendencias.length} coisas dependem de si. O resto está connosco.`
            }
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "26px" }}>
            {pendencias.map((p) => (
              <CartaoBranco key={p.chave} padding="22px 20px">
                <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
                  <EngasteVazio />
                  <p style={{ ...playfair, fontSize: "19px", lineHeight: 1.25 }}>{p.titulo}</p>
                </div>
                <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "11px 0 0", textWrap: "pretty" }}>
                  {p.corpo}
                </p>
                {p.href && <LigacaoDeCartao to={p.href} rotulo={p.hrefRotulo || "Abrir"} />}
              </CartaoBranco>
            ))}
          </div>
        </>
      )}

      <ListaDaCasa rotulo="O que está connosco" itens={doNossoLado} />
    </Divisao>
  );
}

// ------------------------------------------------------------
// 5 · AS NOVIDADES
//
// A única divisão com movimento: o que é novo desde a última visita entra
// com a mola. Tudo o resto da página está imóvel desde o primeiro pixel.
//
// Com `prefers-reduced-motion`, as novidades continuam a distinguir-se pelo
// ponto dourado e pelo cartão — o movimento reforça, nunca é o único sinal.
//
// Não se pinta na PRIMEIRA visita: sem visita anterior não há «desde a
// última vez».
// ------------------------------------------------------------
export function AsNovidades({ visitaAnterior, novidades = [], jaCaEstava = [], reduzir }) {
  // A mola corre UMA vez por janela de visita (o roteiro é explícito). A
  // divisão remonta a cada regresso à jornada; o timestamp da visita
  // anterior identifica a janela sem precisar do token.
  const chaveMola = `dlm_mola_${visitaAnterior || ""}`;
  const [molaJaCorreu] = useState(() => {
    try {
      return !!sessionStorage.getItem(chaveMola);
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!visitaAnterior) return;
    try {
      sessionStorage.setItem(chaveMola, "1");
    } catch {
      /* privado/cheio — a mola repete, que é o mal menor */
    }
  }, [chaveMola, visitaAnterior]);

  if (!visitaAnterior) return null;
  const quando = semanaEDia(visitaAnterior);
  const vazia = novidades.length === 0;
  const animar = !reduzir && !molaJaCorreu;

  return (
    <Divisao>
      {vazia ? (
        <>
          <h2 style={{ ...overline(), textAlign: "center" }}>O que mudou desde a última vez</h2>
          <FraseDeFecho
            frase={quando ? `Desde ${quando.split(",")[0]}, nada mudou por aqui.` : "Nada mudou por aqui."}
            corpo="O trabalho continua do nosso lado, sem novidade para dar. Quando houver, esta divisão acende-se primeiro."
          />
        </>
      ) : (
        <>
          <CabecalhoDivisao
            rotulo="O que mudou desde a última vez"
            meta={quando ? `Esteve cá ${quando}.` : null}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "22px" }}>
            {novidades.map((n, i) => (
              <CartaoBranco
                key={n.chave}
                padding="19px 20px"
                style={
                  !animar
                    ? undefined
                    : {
                        // Ease luxo, não o ressalto: uma novidade não é um
                        // clímax. Escalonada 90ms, no máximo três.
                        animation: "portal-mola 520ms cubic-bezier(0.22,1,0.36,1) both",
                        animationDelay: `${Math.min(i, 2) * 90}ms`,
                      }
                }
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div aria-hidden="true" style={{
                    width: "7px", height: "7px", borderRadius: "50%",
                    backgroundColor: "var(--gold)",
                    boxShadow: "0 0 0 4px rgba(201,168,76,0.16)", flex: "none",
                  }} />
                  <p style={{ ...playfair, fontSize: "18px", lineHeight: 1.25 }}>{n.titulo}</p>
                </div>
                {n.corpo && (
                  <p style={{ fontSize: "12.5px", lineHeight: 1.65, color: "var(--gray-mid)", margin: "9px 0 0", textWrap: "pretty" }}>
                    {n.corpo}
                  </p>
                )}
                {n.href && <LigacaoDeCartao to={n.href} rotulo={n.hrefRotulo || "Abrir"} />}
              </CartaoBranco>
            ))}
          </div>
        </>
      )}

      <ListaDaCasa rotulo="O que já cá estava" itens={jaCaEstava} apagada />
    </Divisao>
  );
}

// ------------------------------------------------------------
// 6 · COMO COMEÇOU — a peça central
//
// As imagens são as DELA: sem molduras, sem sombras. Não são cartões nossos.
// ------------------------------------------------------------
export function ComoComecou({ imagens = [], mensagem, assinatura }) {
  const temImagens = imagens.length > 0;
  if (!temImagens && !naoVazio(mensagem)) return null;

  // A partir da sétima, corta e conta.
  const visiveis = imagens.slice(0, 6);
  const aMais = imagens.length - visiveis.length;
  const uma = visiveis.length === 1;

  return (
    <Divisao>
      <CabecalhoDivisao
        rotulo="Como começou"
        frase="O que imaginou, no dia em que nos escreveu."
      />

      {temImagens && (
        <>
          <div style={{
            display: "grid",
            gridTemplateColumns: uma ? "1fr" : "1fr 1fr",
            gap: "8px",
            marginTop: "22px",
          }}>
            {visiveis.map((url, i) => (
              <img
                key={i}
                src={url}
                alt=""
                loading="lazy"
                // Uma imagem que falhe RETIRA-SE. Os URLs do Storage são
                // permanentes, mas um ficheiro apagado à mão deixaria o
                // ícone de imagem partida no meio da peça central da
                // página — e um buraco assumido é melhor do que um erro
                // do browser à vista da cliente.
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
                style={{
                  width: "100%",
                  aspectRatio: uma ? "4 / 3" : "1",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            ))}
          </div>
          <p style={{ fontSize: "11px", color: "#9B9B9B", margin: "10px 0 0", textAlign: "center", letterSpacing: "0.02em" }}>
            {aMais > 0
              ? `e mais ${aMais}`
              : imagens.length === 1
                ? "A imagem que nos enviou"
                : `As ${imagens.length} imagens que nos enviou`}
          </p>
        </>
      )}

      {naoVazio(mensagem) && (
        <CartaoBranco padding="24px 22px" style={{ marginTop: "26px" }}>
          <FileteComRotulo>Nas suas palavras</FileteComRotulo>
          <CitacaoDela texto={mensagem} assinatura={assinatura} />
        </CartaoBranco>
      )}
    </Divisao>
  );
}

// ------------------------------------------------------------
// 7 · AS SUAS CORES
//
// A amostra aguenta código de cor OU nome. Se vier só o nome, o círculo
// enche-se com a hachura de ausência e o nome fica igual — NUNCA se adivinha
// a cor a partir da palavra.
// ------------------------------------------------------------
export function AsSuasCores({ paleta = [] }) {
  if (paleta.length === 0) return null;
  const algumaComCor = paleta.some(ehCodigoDeCor);

  return (
    <Divisao>
      <CabecalhoDivisao rotulo="As suas cores" frase="A paleta que escolheu." />
      <div style={{ display: "flex", justifyContent: "center", gap: "22px", marginTop: "26px", flexWrap: "wrap" }}>
        {paleta.map((c, i) => {
          const cor = ehCodigoDeCor(c);
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "11px", width: "64px" }}>
              <div style={{
                width: "58px", height: "58px", borderRadius: "50%",
                background: cor ? String(c).trim() : HACHURA,
                border: "1px solid #E8DCC0",
                boxShadow: "inset 0 1px 3px rgba(45,33,10,0.10)",
              }} />
              <p style={{ ...overline("var(--gray-mid)", "0.14em", "8.5px"), textAlign: "center", lineHeight: 1.5 }}>
                {String(c).trim()}
              </p>
            </div>
          );
        })}
      </div>
      {!algumaComCor && (
        <p style={{ fontSize: "11.5px", lineHeight: 1.7, color: "#9B9B9B", margin: "24px 0 0", textAlign: "center", textWrap: "pretty" }}>
          Os tons exactos combinam-se consigo antes da montagem.
        </p>
      )}
    </Divisao>
  );
}

// ------------------------------------------------------------
// 8 · HORA A HORA
//
// Sem hora de fecho, a linha some e as outras encostam. O fim marca-se com
// um filete curto, para o traço nunca acabar a direito.
// ------------------------------------------------------------
export function HoraAHora({ horas = [] }) {
  if (horas.length === 0) return null;

  return (
    <Divisao>
      <CabecalhoDivisao rotulo="O seu dia, hora a hora" frase="Está tudo pensado ao minuto." />
      <div style={{ marginTop: "26px", display: "flex", flexDirection: "column" }}>
        {horas.map((h, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: "14px" }}>
            <p style={{
              fontFamily: "'Playfair Display', serif", fontSize: "20px", lineHeight: 1,
              color: "var(--charcoal)", fontVariantNumeric: "tabular-nums",
              textAlign: "right", paddingTop: "2px", margin: 0,
            }}>
              {String(h.valor).slice(0, 5)}
            </p>
            <div style={{ position: "relative", padding: "0 0 22px 20px", borderLeft: "1px solid #EFE3CB" }}>
              {/* Cheio só na primeira — a que começa. */}
              <div aria-hidden="true" style={{
                position: "absolute", left: "-4px", top: "5px", width: "7px", height: "7px",
                backgroundColor: i === 0 ? "var(--gold)" : "var(--cream)",
                border: "1px solid var(--gold)", transform: "rotate(45deg)",
              }} />
              <p style={{ fontSize: "13px", fontWeight: 500, lineHeight: 1.35, color: "var(--charcoal)", margin: 0 }}>
                {h.rotulo}
              </p>
            </div>
          </div>
        ))}
        <div style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: "14px" }}>
          <div />
          <div aria-hidden="true" style={{
            height: "1px", width: "26px", marginLeft: "-1px",
            background: "linear-gradient(90deg, #E8D5A3, rgba(232,213,163,0))",
          }} />
        </div>
      </div>
    </Divisao>
  );
}

// ------------------------------------------------------------
// 9 · A PLACA
//
// Objecto, não cartão: moldura dupla e CANTOS VIVOS. É a única peça sem
// raio, porque é uma coisa impressa.
// ------------------------------------------------------------
export function APlaca({ principal, secundario, deCasal, titulo, data }) {
  if (!naoVazio(principal)) return null;

  return (
    <Divisao>
      <CabecalhoDivisao rotulo="A placa" frase="O que vai estar à entrada." />

      <div style={{
        marginTop: "24px", backgroundColor: "#FDFBF5", border: "1px solid #E8D5A3",
        padding: "9px", boxShadow: "0 6px 20px -10px rgba(45,33,10,0.30)",
      }}>
        <div style={{ border: "1px solid #F0E6D0", padding: "36px 22px", textAlign: "center" }}>
          <p style={{ ...playfair, fontSize: "27px", lineHeight: 1.28, textWrap: "balance" }}>
            {principal}
          </p>
        </div>
      </div>
      <p style={{ fontSize: "11px", color: "#9B9B9B", margin: "12px 0 0", textAlign: "center", letterSpacing: "0.02em" }}>
        Composta como vai ser impressa.
      </p>

      {/* A segunda linha é dos casais: nomes, filete e data. */}
      {deCasal && (naoVazio(secundario) || naoVazio(titulo)) && (
        <div style={{ marginTop: "28px", paddingTop: "20px", borderTop: "1px solid #F0E6D0" }}>
          <div style={{ backgroundColor: "#FDFBF5", border: "1px solid #E8DCC0", padding: "6px" }}>
            <div style={{ border: "1px solid #F3EBDA", padding: "22px 18px", textAlign: "center" }}>
              <p style={{ ...playfair, fontSize: "19px", lineHeight: 1.3, textWrap: "balance" }}>
                {naoVazio(secundario) ? secundario : titulo}
              </p>
              {data && (
                <>
                  <FileteComLosango margem="12px 0 11px" largura={30} ponto={4} />
                  <p style={overline()}>{diaMesAno(data)}</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Divisao>
  );
}

// ------------------------------------------------------------
// 10 · A SUA VISÃO
//
// As descrições longas, nas palavras dela. Cada uma com o rótulo do próprio
// modelo — a página não sabe nem precisa de saber que campos são.
// ------------------------------------------------------------
export function ASuaVisao({ visao = [], entregueEm }) {
  const uteis = visao.filter((v) => naoVazio(v.texto));
  if (uteis.length === 0) return null;

  return (
    <Divisao>
      <CabecalhoDivisao
        rotulo="A sua visão, nas suas palavras"
        frase={
          entregueEm
            ? "Escreveu isto quando respondeu ao questionário."
            : "Escreveu isto quando nos contou como imagina o dia."
        }
      />
      {uteis.map((v, i) => (
        <div key={i}>
          {i > 0 && <FileteComLosango margem="24px 0" />}
          <div style={{ marginTop: i === 0 ? "26px" : 0 }}>
            <p style={overline("#9B9B9B", "0.22em", "9px")}>{v.rotulo}</p>
            <div style={{ marginTop: "10px" }}>
              <CitacaoDela texto={v.texto} tamanho="15.5px" alturaLinha={1.78} />
            </div>
          </div>
        </div>
      ))}
    </Divisao>
  );
}
