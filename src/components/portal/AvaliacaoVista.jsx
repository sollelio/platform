import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Esqueleto } from "../admin/acabamento";
import { overline, playfair, diaMesAno } from "./base";
import { FileteComLosango, Medalhao } from "./pecas";
import { useCasa } from "../CasaProvider";
import { CapsulaVazada, CapsulaCheia, LigacaoDiscreta } from "./documentos-pecas";
import { verAvaliacao, enviarAvaliacao, eixosRespondidos } from "../../lib/avaliacao";

// ============================================================
// AvaliacaoVista — a avaliação (fase 7).
//
// /acompanhar/:token/avaliar
//
// O ÚNICO MOMENTO DE TODO O PORTAL EM QUE É ELA QUE DÁ. Três gestos em vez
// de um formulário: uma frase, algumas linhas para puxar, e a fotografia
// preferida. Cada um tem saída, e nenhuma é obrigatória.
//
// OS EIXOS SAEM DOS SERVIÇOS que ela contratou (066): há eventos sem
// comida, e perguntar pelo sabor a quem comprou um cenário é dizer que não
// se sabe o que se lhe vendeu. Só a tranquilidade se repete em todos —
// é o que a casa vende de facto.
//
// A AUTORIZAÇÃO É SÓ SOBRE AS PALAVRAS. A fotografia não se lhe pergunta:
// se tiver convidados reconhecíveis, essas pessoas não consentiram, e a
// anfitriã não pode consentir por elas.
// ============================================================

const PASSOS = ["frase", "eixos", "foto", "autorizar", "obrigado"];

export default function AvaliacaoVista({ token }) {
  const navigate = useNavigate();
  const [dados, setDados] = useState(null);
  const [estado, setEstado] = useState("a-carregar");
  const [passo, setPasso] = useState("frase");

  const [frase, setFrase] = useState("");
  const [valores, setValores] = useState({});   // chave -> 0..100
  const [foto, setFoto] = useState(null);       // url_pequena
  const [autorizar, setAutorizar] = useState(null); // null | true | false
  const [nomeComo, setNomeComo] = useState("completo");
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState(null);
  const [recibo, setRecibo] = useState(null);

  useEffect(() => {
    let cancelado = false;
    verAvaliacao(token)
      .then((d) => {
        if (cancelado) return;
        setDados(d);
        setEstado(d?.estado === "ok" ? "pronto" : "erro");

        // MUDAR DE IDEIAS TEM DE TER POR ONDE. O ecrã do obrigado promete
        // que sai do site no mesmo dia — e a promessa só se cumpre se ela
        // reencontrar o que respondeu em vez de um ecrã em branco. A
        // projecção já o trazia e nenhum ecrã o lia.
        const j = d?.feita;
        if (!j) return;
        setFrase(j.frase || "");
        setFoto(j.fotografia || null);
        setAutorizar(!!j.autorizada);
        setNomeComo(j.nome_como || "completo");
        setValores(
          Object.fromEntries(
            (Array.isArray(j.eixos) ? j.eixos : []).map((e) => [e.chave, e.valor]),
          ),
        );
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado) setEstado("erro");
      });
    return () => {
      cancelado = true;
    };
  }, [token]);

  // Cada passo abre no topo, com a pergunta à vista. Seco, sem smooth —
  // respeita o movimento reduzido por natureza. Cobre seguir, voltar e o
  // obrigado.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [passo]);

  if (estado === "a-carregar") {
    return (
      <div style={{ padding: "34px 26px 32px" }}>
        <Esqueleto w="40%" h={11} r={2} />
        <Esqueleto w="90%" h={26} r={2} style={{ marginTop: "14px" }} />
        <Esqueleto w="100%" h={150} r={2} style={{ marginTop: "22px" }} />
      </div>
    );
  }

  // Uma falha de rede não é falta de convite: tem ecrã próprio e o gesto de
  // tentar de novo — o padrão do formulário. O redirect fica só para quem
  // não foi mesmo convidada.
  if (estado === "erro") {
    return (
      <div style={{ padding: "34px 26px 32px" }}>
        <p style={overline()}>A avaliação</p>
        <p style={{ ...playfair, fontSize: "23px", lineHeight: 1.28, margin: "14px 0 0", textWrap: "balance" }}>
          Não conseguimos abrir agora.
        </p>
        <p style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--gray-mid)", margin: "11px 0 0", textWrap: "pretty" }}>
          Nada se perdeu. Verifique a ligação e volte a tentar.
        </p>
        <CapsulaVazada onClick={() => navigate(0)} style={{ marginTop: "26px" }}>
          Tentar outra vez
        </CapsulaVazada>
      </div>
    );
  }

  // Ainda não passaram os três dias, ou o negócio não fechou. Não há convite
  // nenhum — e quem chega aqui de endereço directo volta ao acompanhamento
  // em vez de ver um ecrã a explicar-se.
  if (!dados?.convidada) {
    return <Navigate to={`/acompanhar/${token}`} replace />;
  }

  const eixos = dados.eixos || [];
  const fotos = dados.fotografias || [];
  const fotoEscolhida = fotos.find((f) => f.pequena === foto) || null;

  const seguinte = () => {
    const i = PASSOS.indexOf(passo);
    let prox = PASSOS[i + 1];
    // Sem fotografias não há ecrã de fotografia. Um ecrã a dizer «não há
    // nenhuma para escolher» é um lugar vazio, e a casa não os põe.
    if (prox === "foto" && fotos.length === 0) prox = "autorizar";
    setPasso(prox);
  };

  // O caminho inverso, com o mesmo salto sobre o ecrã da fotografia.
  const anterior = () => {
    const i = PASSOS.indexOf(passo);
    let ant = PASSOS[i - 1];
    if (ant === "foto" && fotos.length === 0) ant = "eixos";
    setPasso(ant);
  };

  const enviar = async () => {
    if (aEnviar) return;
    setAEnviar(true);
    setErro(null);
    try {
      const r = await enviarAvaliacao(token, {
        frase: frase.trim(),
        // Com o mapa em mão cada resposta leva o rótulo — sem ele, o
        // separador Avaliações mostrava chaves de máquina à Nádia.
        eixos: eixosRespondidos(valores, eixos),
        fotografia: foto,
        // Sem frase não há nada para publicar — nunca se grava autorização
        // do vazio.
        autorizar: frase.trim() !== "" && autorizar === true,
        nomeComo,
      });
      if (r?.estado !== "ok") {
        setErro("Não foi possível enviar. Tente outra vez.");
        return;
      }
      setRecibo({ quando: new Date() });
      setPasso("obrigado");
    } catch (e) {
      console.error(e);
      setErro("Não foi possível enviar. Verifique a ligação e tente outra vez.");
    } finally {
      setAEnviar(false);
    }
  };

  if (passo === "obrigado") {
    return (
      <Obrigado
        frase={frase.trim()}
        autorizada={autorizar === true}
        nomeComo={nomeComo}
        foto={fotoEscolhida}
        quando={recibo?.quando || new Date()}
        aoSair={() => navigate(`/acompanhar/${token}`)}
      />
    );
  }

  return (
    <div style={{ padding: "30px 26px 32px" }}>
      <Percurso passo={passo} temFotos={fotos.length > 0} />

      {passo === "frase" && (
        <AFrase
          jaRespondeu={!!dados.feita}
          valor={frase}
          aoMudar={setFrase}
          aoSeguir={seguinte}
          aoSaltar={seguinte}
        />
      )}

      {passo === "eixos" && (
        <OsEixos
          eixos={eixos}
          valores={valores}
          aoMudar={(chave, v) => setValores((x) => ({ ...x, [chave]: v }))}
          aoSeguir={seguinte}
          aoVoltar={anterior}
        />
      )}

      {passo === "foto" && (
        <AFotografia
          fotos={fotos}
          escolhida={foto}
          aoEscolher={setFoto}
          aoSeguir={seguinte}
          aoSaltar={() => {
            setFoto(null);
            seguinte();
          }}
          aoVoltar={anterior}
        />
      )}

      {passo === "autorizar" && (
        <AAutorizacao
          frase={frase.trim()}
          foto={fotoEscolhida}
          autorizar={autorizar}
          aoAutorizar={setAutorizar}
          nomeComo={nomeComo}
          aoNome={setNomeComo}
          aEnviar={aEnviar}
          erro={erro}
          aoEnviar={enviar}
          aoVoltar={anterior}
          aoCorrigirFrase={() => setPasso("frase")}
        />
      )}
    </div>
  );
}

// ---------- O percurso: losangos, sem números e sem barra ----------
//
// A ordem inclui a autorização — senão o percurso apagava-se no último
// passo e parecia que o fluxo tinha reiniciado — e só conta o ecrã da
// fotografia quando ele existe.
function Percurso({ passo, temFotos }) {
  const ordem = temFotos
    ? ["frase", "eixos", "foto", "autorizar"]
    : ["frase", "eixos", "autorizar"];
  const i = ordem.indexOf(passo);
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: "7px" }}>
      {ordem.map((p, n) => (
        <span
          key={p}
          aria-hidden="true"
          style={{
            width: "5px", height: "5px", transform: "rotate(45deg)",
            backgroundColor: n === i ? "var(--gold)" : "#E8DCC0",
          }}
        />
      ))}
    </div>
  );
}

// ---------- Ecrã 2 · A frase ----------
//
// O campo é o mesmo do pedido de alteração — Playfair itálico, sem caixa de
// formulário — porque é o mesmo destino: o que ela escreve fica citado, tal
// e qual.
function AFrase({ valor, aoMudar, aoSeguir, aoSaltar, jaRespondeu }) {
  return (
    <>
      <div style={{ textAlign: "center", marginTop: "22px" }}>
        <p style={{ ...playfair, fontSize: "23px", lineHeight: 1.28, margin: 0, textWrap: "balance" }}>
          {jaRespondeu
            ? "Mudou de ideias?"
            : "O que ficou na memória dos seus convidados?"}
        </p>
        <p style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--gray-mid)", margin: "11px 0 0", textWrap: "pretty" }}>
          {jaRespondeu
            ? "Está aqui o que nos escreveu. Mude o que quiser — fica valendo o último."
            : "Uma frase chega. Escreva como falaria de nós a uma amiga."}
        </p>
      </div>

      <div
        style={{
          marginTop: "22px", backgroundColor: "white",
          border: "1.5px solid #F0E6D0", borderRadius: "14px",
          padding: "19px 20px 16px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
        }}
      >
        <p style={overline("#9B9B9B", "0.22em", "9px")}>Por palavras suas</p>
        {/* Sem autoFocus — o teclado não salta à chegada — e a 16px o iOS
            não dá zoom ao focar. O Playfair itálico mantém a voz. */}
        <textarea
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          rows={3}
          placeholder="Ninguém se queria sentar, para não desfazer a mesa…"
          style={{
            ...playfair, fontStyle: "italic", fontSize: "16px", lineHeight: 1.75,
            color: "var(--charcoal)", width: "100%", boxSizing: "border-box",
            minHeight: "88px", marginTop: "12px", padding: "0 0 10px",
            background: "transparent", border: "none",
            borderBottom: "1px solid #F0E6D0", outline: "none", resize: "vertical",
          }}
        />
      </div>

      <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: "12px 0 0", textWrap: "pretty" }}>
        Mais à frente perguntamos-lhe se a podemos publicar. Sem essa
        autorização, fica só para nós.
      </p>

      <CapsulaVazada onClick={aoSeguir} style={{ marginTop: "24px" }}>
        Continuar
      </CapsulaVazada>
      <div style={{ textAlign: "center", marginTop: "15px" }}>
        <LigacaoDiscreta onClick={aoSaltar} apagada>
          Passar à frente
        </LigacaoDiscreta>
      </div>
    </>
  );
}

// ---------- Ecrãs 3 e 4 · Os eixos ----------
//
// O MESMO ECRÃ, com perguntas diferentes: muda o que se pergunta, nunca a
// forma. A tranquilidade fecha sempre, depois de um filete e maior que as
// outras — é a resposta que vale mais.
function OsEixos({ eixos, valores, aoMudar, aoSeguir, aoVoltar }) {
  const doServico = eixos.filter((e) => !e.sempre);
  const sempre = eixos.filter((e) => e.sempre);

  return (
    <>
      <div style={{ textAlign: "center", marginTop: "22px" }}>
        <p style={{ ...playfair, fontSize: "23px", lineHeight: 1.28, margin: 0, textWrap: "balance" }}>
          Agora as coisas que contratou.
        </p>
        <p style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--gray-mid)", margin: "11px 0 0" }}>
          Puxe cada linha para onde lhe parecer.
        </p>
      </div>

      {doServico.map((e, i) => (
        <Eixo
          key={e.chave}
          eixo={e}
          valor={valores[e.chave]}
          aoMudar={(v) => aoMudar(e.chave, v)}
          style={{ marginTop: i === 0 ? "30px" : "30px" }}
        />
      ))}

      {sempre.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", margin: "32px 0 0" }}>
            <span aria-hidden="true" style={{ height: "1px", width: "34px", background: "linear-gradient(90deg, rgba(232,213,163,0), #E8D5A3)" }} />
            <span style={{ font: "700 9px Inter, sans-serif", letterSpacing: "0.18em", textTransform: "uppercase", color: "#9B9B9B" }}>
              e a que mais nos interessa
            </span>
            <span aria-hidden="true" style={{ height: "1px", width: "34px", background: "linear-gradient(90deg, #E8D5A3, rgba(232,213,163,0))" }} />
          </div>
          {sempre.map((e) => (
            <Eixo
              key={e.chave}
              eixo={e}
              valor={valores[e.chave]}
              aoMudar={(v) => aoMudar(e.chave, v)}
              grande
              style={{ marginTop: "18px" }}
            />
          ))}
        </>
      )}

      <CapsulaVazada onClick={aoSeguir} style={{ marginTop: "30px" }}>
        Continuar
      </CapsulaVazada>
      <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: "15px 0 0", textAlign: "center", textWrap: "pretty" }}>
        As linhas em que não tocar ficam por responder. Não faz mal nenhum.
      </p>
      <div style={{ textAlign: "center", marginTop: "15px" }}>
        <LigacaoDiscreta onClick={aoVoltar} apagada>
          voltar
        </LigacaoDiscreta>
      </div>
    </>
  );
}

// Sem números, sem estrelas, sem escala à vista. Só as duas pontas por
// palavras — porque o que se pede é uma impressão, não uma nota.
function Eixo({ eixo, valor, aoMudar, grande, style }) {
  const respondido = valor !== undefined && valor !== null;
  return (
    <div style={style}>
      <p style={{ ...playfair, fontSize: grande ? "19px" : "17px", lineHeight: 1.3, margin: 0, textWrap: "balance" }}>
        {eixo.rotulo}
      </p>
      <input
        className="dlm-eixo"
        data-respondido={respondido ? "sim" : "nao"}
        type="range"
        min={0}
        max={100}
        value={respondido ? valor : 50}
        aria-label={`${eixo.rotulo} — de «${eixo.esquerda}» a «${eixo.direita}»`}
        // As palavras das pontas, não «50 de 100» — o número fica só para o
        // servidor.
        aria-valuetext={
          !respondido
            ? "por responder"
            : valor < 25
              ? eixo.esquerda
              : valor > 75
                ? eixo.direita
                : `entre ${eixo.esquerda} e ${eixo.direita}`
        }
        onChange={(e) => aoMudar(Number(e.target.value))}
        style={{ marginTop: "4px" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginTop: "-3px" }}>
        <span style={{ fontSize: "11px", lineHeight: 1.5, color: "#9B9B9B", maxWidth: "46%" }}>
          {eixo.esquerda}
        </span>
        <span style={{ fontSize: "11px", lineHeight: 1.5, color: "#9B9B9B", maxWidth: "46%", textAlign: "right" }}>
          {eixo.direita}
        </span>
      </div>
    </div>
  );
}

// ---------- Ecrã 5 · A fotografia preferida ----------
//
// TODAS as fotografias são escolhíveis — a preferida real pode ser a
// décima. A grelha 2×N rola, como o mosaico.
function AFotografia({ fotos, escolhida, aoEscolher, aoSeguir, aoSaltar, aoVoltar }) {
  const mostradas = fotos;
  const escolhidaComConvidados = fotos.find(
    (f) => f.pequena === escolhida && f.com_convidados,
  );

  return (
    <>
      <div style={{ textAlign: "center", marginTop: "22px" }}>
        <p style={{ ...playfair, fontSize: "23px", lineHeight: 1.28, margin: 0, textWrap: "balance" }}>
          Qual foi a sua preferida?
        </p>
        <p style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--gray-mid)", margin: "11px 0 0", textWrap: "pretty" }}>
          Das {fotos.length} do dia. Se autorizar, é esta que fica ao lado das
          suas palavras.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "22px" }}>
        {mostradas.map((f) => {
          const activa = f.pequena === escolhida;
          return (
            <button
              key={f.pequena}
              onClick={() => aoEscolher(activa ? null : f.pequena)}
              style={{
                position: "relative", padding: 0, lineHeight: 0, cursor: "pointer",
                border: activa ? "2px solid var(--gold)" : "1px solid #EFE7D6",
                background: "none",
              }}
            >
              <img
                src={f.pequena}
                alt={f.assunto || "Fotografia do dia"}
                style={{ display: "block", width: "100%", aspectRatio: "1", objectFit: "cover" }}
              />
              {/* A pastilha é da casa, não dela: alguém olhou e disse que há
                  gente reconhecível. Uma fotografia por rever não leva
                  pastilha nenhuma — dizer que tem convidados sem ninguém ter
                  olhado seria afirmar o que não se sabe. */}
              {f.com_convidados && (
                <span
                  style={{
                    position: "absolute", left: "6px", bottom: "6px",
                    fontSize: "9.5px", letterSpacing: "0.06em",
                    color: "#8A6626", backgroundColor: "rgba(255,253,246,0.94)",
                    border: "1px solid #E8D5A3", borderRadius: "999px",
                    padding: "2px 8px", lineHeight: 1.5,
                  }}
                >
                  com convidados
                </span>
              )}
            </button>
          );
        })}
      </div>

      {escolhidaComConvidados && (
        <p style={{ fontSize: "11.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "16px 0 0", textWrap: "pretty" }}>
          Escolheu uma com convidados: essa fica só para nós. As pessoas que lá
          estão não nos deram autorização, e a sua não chega por elas. As suas
          palavras podem continuar a ser publicadas.
        </p>
      )}

      <CapsulaVazada onClick={aoSeguir} style={{ marginTop: "24px" }}>
        Continuar
      </CapsulaVazada>
      <div style={{ textAlign: "center", marginTop: "15px" }}>
        <LigacaoDiscreta onClick={aoSaltar} apagada>
          Prefiro não escolher
        </LigacaoDiscreta>
      </div>
      <div style={{ textAlign: "center", marginTop: "15px" }}>
        <LigacaoDiscreta onClick={aoVoltar} apagada>
          voltar
        </LigacaoDiscreta>
      </div>
    </>
  );
}

// ---------- Ecrã 6 · A autorização ----------
//
// Os dois engastes estão vazios de propósito: NADA VEM MARCADO. E a cápsula
// é a única CHEIA da fase — publicar vincula, como aceitar e assinar —,
// inerte até ela escolher.
function AAutorizacao({
  frase, foto, autorizar, aoAutorizar, nomeComo, aoNome, aEnviar, erro, aoEnviar,
  aoVoltar, aoCorrigirFrase,
}) {
  const NOMES = [
    { valor: "completo", label: "Nome completo" },
    { valor: "primeiro", label: "Só o primeiro" },
    { valor: "anonimo", label: "Sem nome" },
  ];

  return (
    <>
      <div style={{ marginTop: "22px" }}>
        <p style={overline()}>A autorização</p>
        <p style={{ ...playfair, fontSize: "22px", lineHeight: 1.3, margin: "11px 0 0", textWrap: "balance" }}>
          Podemos publicar as suas palavras?
        </p>
      </div>

      {frase && (
        <div
          style={{
            marginTop: "20px", backgroundColor: "white",
            border: "1.5px solid #F0E6D0", borderRadius: "14px",
            padding: "16px 18px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
          }}
        >
          <p style={overline("#9B9B9B", "0.22em", "9px")}>o que escreveu</p>
          <p style={{ ...playfair, fontStyle: "italic", fontSize: "15.5px", lineHeight: 1.75, color: "var(--charcoal)", margin: "11px 0 0", textWrap: "pretty" }}>
            {frase}
          </p>
          {/* A frase vista daqui pode ter a vírgula a mais — corrige-se sem
              recomeçar o fluxo. */}
          <p style={{ margin: "12px 0 0" }}>
            <LigacaoDiscreta onClick={aoCorrigirFrase} apagada style={{ fontSize: "10.5px" }}>
              corrigir
            </LigacaoDiscreta>
          </p>
        </div>
      )}

      {/* SEM FRASE NÃO HÁ NADA PARA PUBLICAR — nem nome, nem escolha de
          publicação: autorizar o vazio não se grava. */}
      {frase ? (
        <>
          <p style={{ ...overline("#9B9B9B", "0.22em", "9px"), marginTop: "22px" }}>
            O nome por baixo
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginTop: "10px" }}>
            {NOMES.map((n) => (
              <button
                key={n.valor}
                onClick={() => aoNome(n.valor)}
                style={{
                  fontSize: "11px", fontFamily: "Inter, sans-serif",
                  borderRadius: "999px", padding: "12px 15px", cursor: "pointer",
                  color: nomeComo === n.valor ? "#A07830" : "var(--gray-mid)",
                  backgroundColor: nomeComo === n.valor ? "#FEF9EC" : "white",
                  border: `1px solid ${nomeComo === n.valor ? "var(--gold)" : "#E8DCC0"}`,
                }}
              >
                {n.label}
              </button>
            ))}
          </div>

          <p style={{ ...overline("#9B9B9B", "0.22em", "9px"), marginTop: "22px" }}>
            A publicação
          </p>
          <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <Escolha
              activa={autorizar === true}
              titulo="Pode aparecer no nosso site"
              corpo="Com o nome que escolher, e nunca mais do que a frase."
              aoTocar={() => aoAutorizar(true)}
            />
            <Escolha
              activa={autorizar === false}
              titulo="Fica só para a casa"
              corpo="Serve-nos para saber o que melhorar, e não sai daqui."
              aoTocar={() => aoAutorizar(false)}
            />
          </div>
        </>
      ) : (
        <>
          <p style={{ fontSize: "12.5px", lineHeight: 1.75, color: "var(--gray-mid)", margin: "20px 0 0", textWrap: "pretty" }}>
            Não escreveu nenhuma frase — não há nada para publicar. O resto
            segue na mesma.
          </p>
          <p style={{ margin: "12px 0 0" }}>
            <LigacaoDiscreta onClick={aoCorrigirFrase}>
              escrever uma frase
            </LigacaoDiscreta>
          </p>
        </>
      )}

      {foto?.com_convidados && (
        <p style={{ fontSize: "11.5px", lineHeight: 1.7, color: "#9B9B9B", margin: "14px 0 0", textWrap: "pretty" }}>
          A fotografia que escolheu tem convidados, por isso fica sempre só
          para nós.
        </p>
      )}

      {erro && (
        <p style={{ fontSize: "12px", lineHeight: 1.7, color: "#9C5A3C", margin: "14px 0 0" }}>
          {erro}
        </p>
      )}

      {/* A ÚNICA CÁPSULA CHEIA DA FASE. Publicar vincula, como aceitar e
          assinar — e é a MESMA peça que eles usam, com o mesmo dourado.
          Estava escrita à mão e saía noutro amarelo. */}
      <CapsulaCheia
        onClick={aoEnviar}
        inerte={frase ? autorizar === null : false}
        aTrabalhar={aEnviar}
        style={{ marginTop: "22px" }}
      >
        {aEnviar ? "A enviar…" : "Enviar a avaliação"}
      </CapsulaCheia>
      <div style={{ textAlign: "center", marginTop: "15px" }}>
        <LigacaoDiscreta onClick={aoVoltar} apagada>
          voltar
        </LigacaoDiscreta>
      </div>
    </>
  );
}

function Escolha({ activa, titulo, corpo, aoTocar }) {
  return (
    <button
      onClick={aoTocar}
      style={{
        display: "flex", gap: "11px", alignItems: "flex-start", width: "100%",
        textAlign: "left", cursor: "pointer",
        backgroundColor: activa ? "#FEF9EC" : "white",
        border: `1.5px solid ${activa ? "var(--gold)" : "#F0E6D0"}`,
        borderRadius: "14px", padding: "14px 16px",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "20px", height: "20px", borderRadius: "50%", flexShrink: 0,
          marginTop: "1px",
          backgroundColor: activa ? "var(--gold)" : "#FDFBF5",
          border: `1px solid ${activa ? "var(--gold)" : "#E8DCC0"}`,
        }}
      />
      <span>
        <span style={{ display: "block", fontSize: "13px", fontWeight: 500, lineHeight: 1.4, color: "var(--charcoal)" }}>
          {titulo}
        </span>
        <span style={{ display: "block", fontSize: "11.5px", lineHeight: 1.6, color: "var(--gray-mid)", marginTop: "4px" }}>
          {corpo}
        </span>
      </span>
    </button>
  );
}

// ---------- Ecrã 7 · O obrigado ----------
//
// Sem confetes e sem exclamação. O que se mostra é o REGISTO — e a promessa
// que a torna reversível, que é o que dá confiança a quem acabou de
// autorizar alguma coisa.
function Obrigado({ frase, autorizada, nomeComo, foto, quando, aoSair }) {
  const casa = useCasa();
  const nome = autorizada
    ? nomeComo === "anonimo" ? "sem nome" : "com o seu nome"
    : null;

  return (
    <div style={{ padding: "34px 26px 32px" }}>
      <div
        style={{
          position: "relative", marginTop: "18px", backgroundColor: "white",
          border: "1.5px solid #F0E6D0", borderRadius: "14px",
          padding: "30px 20px 22px", textAlign: "center",
          boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
        }}
      >
        <Medalhao />
        <p style={overline()}>A sua avaliação</p>
        <p style={{ ...playfair, fontSize: "22px", lineHeight: 1.3, margin: "10px 0 0", textWrap: "balance" }}>
          Ficámos com as suas palavras.
        </p>
        <p style={{ fontSize: "12.5px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "11px 0 0" }}>
          A {casa.nome} lê tudo o que nos escrevem.
        </p>
      </div>

      <div style={{ marginTop: "26px" }}>
        <Linha
          rotulo="Publicação"
          valor={autorizada ? `No site, ${nome}` : "Fica só para a casa"}
        />
        {foto && (
          <Linha
            rotulo="Fotografia"
            valor={foto.pode_site ? "Vai com as suas palavras" : "Fica só para a casa"}
          />
        )}
        <Linha rotulo="Enviado" valor={`${diaMesAno(quando.toISOString())}, às ${String(quando.getHours()).padStart(2, "0")}:${String(quando.getMinutes()).padStart(2, "0")}`} />
      </div>

      {autorizada && (
        <p style={{ fontSize: "11.5px", lineHeight: 1.7, color: "#9B9B9B", margin: "22px 0 0", textWrap: "pretty" }}>
          Se mudar de ideias, diga-nos: sai do site no mesmo dia, sem ter de
          explicar porquê.
        </p>
      )}

      <FileteComLosango margem="26px 0 0" />

      <div style={{ textAlign: "center", marginTop: "20px" }}>
        <LigacaoDiscreta onClick={aoSair} apagada>
          Voltar ao acompanhamento
        </LigacaoDiscreta>
      </div>

      {/* Guarda contra o esquecimento: se ela escreveu e não autorizou, é
          bom que veja a frase ficou registada na mesma. */}
      {!autorizada && frase && (
        <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: "18px 0 0", textAlign: "center", textWrap: "pretty" }}>
          As suas palavras ficaram connosco.
        </p>
      )}
    </div>
  );
}

function Linha({ rotulo, valor }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "92px 1fr", gap: "14px", padding: "12px 0", borderTop: "1px solid #F0E6D0" }}>
      <span style={{ font: "700 8.5px Inter, sans-serif", letterSpacing: "0.16em", textTransform: "uppercase", color: "#9B9B9B", lineHeight: 1.6, paddingTop: "2px" }}>
        {rotulo}
      </span>
      <span style={{ fontSize: "12px", lineHeight: 1.65, color: "var(--charcoal)", textWrap: "pretty" }}>
        {valor}
      </span>
    </div>
  );
}
