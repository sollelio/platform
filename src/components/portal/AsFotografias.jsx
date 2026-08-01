import { useEffect, useRef, useState } from "react";
import { overline, playfair, diaEMes } from "./base";
import { FileteComLosango } from "./pecas";

// ============================================================
// AsFotografias — a divisão das fotografias do dia (fase 6).
//
// É a única vez que a cliente vê o evento ANTES do evento.
//
// ⚠ SEM FOTOGRAFIAS NÃO HÁ DIVISÃO. Nem rótulo, nem espaço reservado, nem
// «ainda sem fotografias». A maior parte do tempo é assim que está — e um
// lugar reservado transforma uma surpresa numa promessa por cumprir.
//
// DOIS ENQUADRAMENTOS, A MESMA DIVISÃO. Antes do dia é presente: o dourado,
// a contagem em horas, as legendas com o tempo de cada uma. Depois do dia é
// memória: o overline passa a cinzento com a data, o título cresce e
// encolhe para duas palavras, e AS LEGENDAS CAEM TODAS — no passado ninguém
// pergunta há quanto tempo foi tirada; pergunta o que lá está.
//
// A CAPA É A PRIMEIRA e sangra de margem a margem. A casa escolhe-a na aba
// das fotografias, e a regra da casa é que seja a mais adiantada: o
// trabalho a acontecer aparece por baixo, nunca primeiro. Ninguém precisa
// de ver o espaço a meio às onze da manhã.
// ============================================================

const LADO = "26px";

// «há 12 minutos» — o tempo relativo da legenda. Acima de um dia passa a
// data, porque «há 37 horas» não é como as pessoas falam.
const tempoRelativo = (iso) => {
  if (!iso) return null;
  const seg = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seg < 90) return "agora mesmo";
  const min = Math.floor(seg / 60);
  if (min < 60) return min === 1 ? "há um minuto" : `há ${min} minutos`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} ${h === 1 ? "hora" : "horas"}`;
  return diaEMes(iso);
};

const EXTENSO = ["", "uma", "duas", "três", "quatro", "cinco", "seis", "sete",
  "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze",
  "dezasseis", "dezassete", "dezoito", "dezanove", "vinte"];

const porExtenso = (n) => (n > 0 && n <= 20 ? EXTENSO[n] : String(n));

// NADA ANIMA AO ABRIR — é a regra da página desde a fase 1, e vale aqui
// como no resto. A tela mostra a divisão a entrar com mola, mas isso é o
// que se veria se ela estivesse com a página aberta no instante em que a
// primeira fotografia chega; ao recarregar, já lá está.
export default function AsFotografias({ fotografias, dataEvento, horas, jaAvaliou }) {
  const [ampliada, setAmpliada] = useState(null); // índice
  const lista = fotografias?.lista || [];

  // A regra da ausência, e é a mais importante desta divisão.
  if (lista.length === 0) return null;

  const memoria = fotografias.quando === "memoria";
  const [capa, ...resto] = lista;
  const noMosaico = resto.slice(0, 6);
  const escondidas = resto.length - noMosaico.length;

  return (
    <div style={{ marginTop: memoria ? "42px" : "34px", paddingBottom: memoria ? "34px" : "30px" }}>
      <div style={{ textAlign: "center", padding: `0 ${LADO}` }}>
        {/* O dourado é do PRESENTE. A memória fica em cinzento — não é uma
            cor mais fraca, é outra temperatura. */}
        <p style={memoria ? overline("#9B9B9B") : overline()}>
          {memoria
            ? `O seu evento · ${diaEMes(dataEvento)}`
            : "Hoje · a montagem"}
        </p>
        <p
          style={{
            ...playfair,
            fontSize: memoria ? "27px" : "23px",
            lineHeight: memoria ? 1.24 : 1.28,
            marginTop: memoria ? "14px" : "12px",
            textWrap: "balance",
          }}
        >
          {memoria ? "Foi assim." : "Estamos no espaço a montar a sua mesa."}
        </p>
        <p style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--gray-mid)", margin: memoria ? "12px 0 0" : "11px 0 0", textWrap: "pretty" }}>
          {memoria
            ? lista.length === 1
              ? "Uma fotografia do dia."
              : `${porExtenso(lista.length).replace(/^./, (c) => c.toUpperCase())} fotografias do dia, da montagem ao fim da noite.`
            : `Tirámos estas há pouco.${faltamHoras(horas) ? ` ${faltamHoras(horas)}` : ""}`}
        </p>
      </div>

      {/* A capa sangra: sem borda, sem raio, sem sombra. */}
      <button
        onClick={() => setAmpliada(0)}
        style={{
          display: "block", width: "100%", marginTop: memoria ? "28px" : "22px",
          padding: 0, border: "none", background: "none", cursor: "pointer",
        }}
      >
        <img
          src={capa.pequena}
          alt={capa.assunto || (memoria ? "Fotografia do seu evento" : "O espaço a ficar pronto")}
          style={{ display: "block", width: "100%", aspectRatio: "4 / 3", objectFit: "cover" }}
        />
      </button>

      {/* No passado as legendas caem todas. */}
      {!memoria && (capa.assunto || capa.quando) && (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "14px", margin: `11px ${LADO} 0` }}>
          <span style={{ fontSize: "12.5px", color: "var(--charcoal)", minWidth: 0 }}>
            {capa.assunto}
          </span>
          <span style={{ fontSize: "11px", color: "#9B9B9B", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 }}>
            {tempoRelativo(capa.quando)}
          </span>
        </div>
      )}

      {noMosaico.length > 0 && (
        <div
          style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px",
            margin: `${memoria ? "8px" : "18px"} ${LADO} 0`,
          }}
        >
          {noMosaico.map((f, i) => (
            <div key={f.pequena}>
              <button
                onClick={() => setAmpliada(i + 1)}
                style={{ display: "block", width: "100%", padding: 0, border: "1px solid #EFE7D6", background: "none", cursor: "pointer", lineHeight: 0 }}
              >
                <img
                  src={f.pequena}
                  alt={f.assunto || (memoria ? "Fotografia do seu evento" : "O espaço a ficar pronto")}
                  style={{ display: "block", width: "100%", aspectRatio: "1", objectFit: "cover" }}
                />
              </button>
              {/* Nas pequenas cai o assunto e fica só o tempo. */}
              {!memoria && f.quando && (
                <p style={{ fontSize: "11px", color: "#9B9B9B", fontVariantNumeric: "tabular-nums", margin: "8px 0 0" }}>
                  {tempoRelativo(f.quando)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* As escondidas abrem-se na vista ampliada, a partir da primeira que
          o mosaico não mostra (capa 0 + seis do mosaico = índice 7). */}
      {escondidas > 0 && (
        <button
          onClick={() => setAmpliada(7)}
          style={{
            display: "block", margin: "10px auto 0", fontSize: "11px",
            color: "var(--gray-mid)", background: "none", border: "none",
            borderBottom: "1px solid #E8D5A3", padding: "0 0 2px",
            cursor: "pointer", fontFamily: "Inter, sans-serif",
          }}
        >
          e mais {porExtenso(escondidas)} — ver todas
        </button>
      )}

      {/* É instrução, não legenda — vale nos dois enquadramentos. */}
      <p style={{ fontSize: "11px", lineHeight: 1.6, color: "#9B9B9B", margin: `20px ${LADO} 0`, textAlign: "center" }}>
        Toque numa fotografia para a ver em grande.
      </p>

      {memoria && <FileteComLosango margem="26px 0 0" />}

      {/* A frase de fecho é a única coisa em Playfair dourado da divisão: é
          a casa a falar, não a página a informar. */}
      {(memoria || ateQueHoras(horas)) && (
        <p style={{ ...playfair, fontSize: "16px", lineHeight: 1.62, color: "var(--gold-dark)", margin: memoria ? "20px 30px 0" : "22px 30px 0", textAlign: "center", textWrap: "balance" }}>
          {memoria
            ? jaAvaliou
              // Já a deu. Continuar a prometer pedi-la é a página a
              // esquecer-se do que ela acabou de fazer.
              ? "Obrigado por nos ter contado como correu."
              : "Daqui a uns dias pedimos-lhe a sua preferida."
            : `Ficamos no espaço até às ${ateQueHoras(horas)}.`}
        </p>
      )}

      {ampliada !== null && (
        <VistaAmpliada
          lista={lista}
          indice={ampliada}
          aoFechar={() => setAmpliada(null)}
          aoMudar={setAmpliada}
        />
      )}
    </div>
  );
}

// ---------- As horas, quando se conseguem resolver ----------
//
// «Faltam cinco horas» e «Ficamos no espaço até às 18h30» pedem horas que a
// tela não liga a campo nenhum. As horas existem na projecção, mas com os
// rótulos que a Nádia escreveu, e ZERO dos 192 campos tem `papel` marcado.
//
// Por isso resolve-se pelo rótulo e, quando não dá, A FRASE NÃO APARECE.
// Uma hora adivinhada num ecrã que diz «estamos no espaço» é pior do que
// silêncio: manda alguém sair de casa à hora errada.
const semAcentos = (t) =>
  String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const horaPorRotulo = (horas, ...palavras) => {
  const achada = (horas || []).find((h) => {
    const r = semAcentos(h.rotulo);
    return palavras.some((p) => r.includes(p));
  });
  return achada?.valor ? String(achada.valor).slice(0, 5) : null;
};

function faltamHoras(horas) {
  const inicio = horaPorRotulo(horas, "inicio", "comeco");
  if (!inicio) return null;
  const [h, m] = inicio.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  const agora = new Date();
  const faltam = Math.round((h * 60 + (m || 0) - (agora.getHours() * 60 + agora.getMinutes())) / 60);
  if (faltam <= 0 || faltam > 12) return null;
  return `${faltam === 1 ? "Falta" : "Faltam"} ${porExtenso(faltam)} ${faltam === 1 ? "hora" : "horas"}.`;
}

function ateQueHoras(horas) {
  const fim = horaPorRotulo(horas, "fim", "termino", "recolha", "saida");
  return fim ? fim.replace(":", "h") : null;
}

// ---------- Ecrã 2 · A fotografia em grande ----------
//
// UMA CAMADA, não uma rota. Não se sai da página: fechar devolve-a
// exactamente ao sítio onde estava, com o mesmo scroll.
//
// Uma só acção lá dentro — guardar —, porque o gesto real é virar o
// aparelho a outra pessoa antes de chegar ao espaço.

// O atributo download é ignorado em ligações cross-origin — o Storage
// responde ao parâmetro `download` com Content-Disposition: attachment,
// e o gesto passa a guardar de verdade.
const urlDescarga = (u) =>
  `${u}${u.includes("?") ? "&" : "?"}download=fotografia-do-evento.jpg`;

function VistaAmpliada({ lista, indice, aoFechar, aoMudar }) {
  const f = lista[indice];
  const camadaRef = useRef(null);
  const fecharRef = useRef(null);
  const toqueX = useRef(null);

  // A pequena já está em cache e segura a moldura; a grande entra por cima
  // quando chegar. O reset faz-se DURANTE o render (padrão do react.dev
  // para estado derivado de prop) — um efeito repunha um quadro tarde.
  const [carregada, setCarregada] = useState(false);
  const [indiceVisto, setIndiceVisto] = useState(indice);
  if (indiceVisto !== indice) {
    setIndiceVisto(indice);
    setCarregada(false);
  }

  // Escape fecha, setas navegam. O teclado é de quem vê isto no computador,
  // e não custa nada oferecê-lo.
  useEffect(() => {
    const aoTeclar = (e) => {
      if (e.key === "Escape") aoFechar();
      if (e.key === "ArrowRight" && indice < lista.length - 1) aoMudar(indice + 1);
      if (e.key === "ArrowLeft" && indice > 0) aoMudar(indice - 1);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [indice, lista.length, aoFechar, aoMudar]);

  // O corpo não rola por trás da camada. overflow:hidden não trava o iOS
  // Safari — position:fixed trava; e ao fechar devolve-se o mesmo scroll.
  useEffect(() => {
    const y = window.scrollY;
    const b = document.body.style;
    const antes = { position: b.position, top: b.top, width: b.width };
    b.position = "fixed";
    b.top = `-${y}px`;
    b.width = "100%";
    return () => {
      b.position = antes.position;
      b.top = antes.top;
      b.width = antes.width;
      window.scrollTo(0, y);
    };
  }, []);

  // O foco entra com a camada e, ao fechar, volta a quem a abriu.
  useEffect(() => {
    const origem = document.activeElement;
    fecharRef.current?.focus();
    return () => {
      if (origem && typeof origem.focus === "function") origem.focus();
    };
  }, []);

  // Tab não sai da camada — anda em círculo pelos botões e pela ligação.
  const prenderTab = (e) => {
    if (e.key !== "Tab") return;
    const focaveis = camadaRef.current?.querySelectorAll("button, a");
    if (!focaveis || focaveis.length === 0) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  };

  return (
    <div
      ref={camadaRef}
      role="dialog"
      aria-modal="true"
      aria-label={f.assunto || "Fotografia"}
      onKeyDown={prenderTab}
      // O deslize é o gesto principal no telemóvel: 40px de arrasto
      // horizontal mudam de fotografia, dentro dos limites.
      onTouchStart={(e) => {
        toqueX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (toqueX.current === null) return;
        const delta = (e.changedTouches[0]?.clientX ?? toqueX.current) - toqueX.current;
        toqueX.current = null;
        if (Math.abs(delta) < 40) return;
        if (delta < 0 && indice < lista.length - 1) aoMudar(indice + 1);
        if (delta > 0 && indice > 0) aoMudar(indice - 1);
      }}
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        backgroundColor: "#241C13",
        padding: "16px 0 26px",
        overflowY: "auto", WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
      }}
    >
      {/* Em ecrãs baixos rola-se até ao «Guardar»; no computador a imagem
          fica na coluna pública de ~480px. */}
      <div style={{ width: "100%", maxWidth: "480px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 11px 0 22px" }}>
          <span style={{ font: "700 9px Inter, sans-serif", letterSpacing: "0.18em", textTransform: "uppercase", color: "#A08C6C", fontVariantNumeric: "tabular-nums" }}>
            {indice + 1} de {lista.length}
          </span>
          {/* 44×44 de alvo; a margem negativa mantém a linha do cabeçalho. */}
          <button
            ref={fecharRef}
            onClick={aoFechar}
            aria-label="Fechar"
            style={{ width: "44px", height: "44px", margin: "-9px 0", background: "none", border: "none", cursor: "pointer", position: "relative", padding: 0 }}
          >
            <span style={{ position: "absolute", top: "21.5px", left: "14px", width: "16px", height: "1px", backgroundColor: "rgba(243,238,228,0.6)", transform: "rotate(45deg)" }} />
            <span style={{ position: "absolute", top: "21.5px", left: "14px", width: "16px", height: "1px", backgroundColor: "rgba(243,238,228,0.6)", transform: "rotate(-45deg)" }} />
          </button>
        </div>

        <div style={{ position: "relative", marginTop: "16px" }}>
          <img
            src={f.pequena}
            alt=""
            aria-hidden="true"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
          <img
            src={f.grande}
            alt={f.assunto || "Fotografia do dia"}
            onLoad={() => setCarregada(true)}
            style={{ position: "relative", display: "block", width: "100%", aspectRatio: "4 / 5", objectFit: "cover", opacity: carregada ? 1 : 0, transition: "opacity 140ms ease" }}
          />
        </div>

        <div style={{ textAlign: "center", padding: "18px 24px 0" }}>
          {f.assunto && (
            <p style={{ ...playfair, fontSize: "18px", lineHeight: 1.3, color: "#F3EEE4", margin: 0 }}>
              {f.assunto}
            </p>
          )}
          {f.quando && (
            <p style={{ fontSize: "11px", color: "#A08C6C", fontVariantNumeric: "tabular-nums", margin: f.assunto ? "7px 0 0" : 0 }}>
              {tempoRelativo(f.quando)}
            </p>
          )}

          {/* Losangos a marcar a posição — sem setas. O losango continua com
              5px; o alvo à volta é que cresce até ao toque real (~29px). */}
          {lista.length > 1 && (
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 0, rowGap: "4px", marginTop: "6px" }}>
              {lista.map((_, i) => (
                <button
                  key={i}
                  onClick={() => aoMudar(i)}
                  aria-label={`Fotografia ${i + 1}`}
                  style={{ padding: "12px", background: "none", border: "none", cursor: "pointer", lineHeight: 0 }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: "block", width: "5px", height: "5px",
                      transform: "rotate(45deg)",
                      backgroundColor: i === indice ? "var(--gold)" : "rgba(243,238,228,0.24)",
                    }}
                  />
                </button>
              ))}
            </div>
          )}

          <p style={{ marginTop: lista.length > 1 ? "10px" : "22px" }}>
            <a
              href={urlDescarga(f.grande)}
              download
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: "12px", color: "#D9BE79", textDecoration: "none",
                borderBottom: "1px solid rgba(217,190,121,0.5)", paddingBottom: "3px",
              }}
            >
              Guardar a fotografia
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
