// ============================================================
// PortaDaCasa — o que acontece ANTES de o backoffice abrir.
//
// A 108 pôs a casa no endereço, e com isso o endereço passou a poder
// dizer três coisas em vez de uma:
//
//   · conhecida    → entra-se, como sempre.
//   · suspensa     → a casa é sua, mas está fechada. Até hoje isto
//                    dava um admin com TODAS as listas vazias e nada a
//                    explicar porquê (pendência da 104): a RLS calava
//                    tudo e o ecrã dizia «não há nada» — que é mentira,
//                    e a pior espécie, porque parece avaria.
//   · desconhecida → o endereço não é de quem entrou. Não é «lista
//                    vazia»: é um ecrã que o diz.
//
// E há um quarto caso, que não é do endereço mas da falta dele: os
// favoritos antigos (/admin/inicio, sem casa). Esses resolvem-se com
// `as_minhas_casas()` — uma casa, vai-se para lá; mais do que uma, o
// redirect não pode adivinhar e a escolha faz-se por NAVEGAÇÃO. Nunca
// por seletor persistente: um seletor devolvia a casa activa ao estado
// invisível, que é o problema que a 108 existe para resolver.
//
// As frases do bloco COPIA são do Hélio (aprovadas a 16/08/2026).
// Ficam num sítio só, e não espalhadas pelo JSX, porque texto de
// interface é decisão dele: mudá-lo tem de ser uma edição, não uma
// caça.
// ============================================================

import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCasa } from "./CasaProvider";
import { useEstadoDaCasa } from "./casaContexto";
import { asMinhasCasas } from "../lib/identidadeCasa";
import { caminhoComCasa, caminhoDoSeparador } from "../lib/rotasAdmin";
import { nomeDaCasa } from "../lib/casa";

// ------------------------------------------------------------
// As frases (Hélio, 16/08/2026)
// ------------------------------------------------------------
const COPIA = {
  suspensa: {
    titulo: "Esta casa está suspensa",
    corpo: (nome) =>
      `O acesso a ${nome} está temporariamente fechado. Os dados estão todos guardados — não se perdeu nada — mas enquanto a suspensão durar não há listas para mostrar nem alterações para gravar.`,
    remate: "Para reabrir, fale com quem gere a plataforma.",
  },
  desconhecida: {
    titulo: "Este endereço não é seu",
    corpo: () =>
      "A casa que este endereço nomeia não pertence à conta com que entrou — ou já não existe. Não é uma falha de permissões a resolver: é outro endereço.",
    remate: "Confirme a ligação, ou volte ao seu Início.",
  },
  semCasa: {
    titulo: "Esta conta ainda não tem casa",
    corpo: () =>
      "A sessão está aberta, mas não está ligada a nenhuma casa — por isso não há backoffice para abrir.",
    remate: "Fale com quem gere a plataforma para a ligar à sua casa.",
  },
  varias: {
    titulo: "Qual das casas?",
    corpo: () =>
      "Este endereço é dos antigos e não diz de que casa é. Como tem mais do que uma, escolha aqui — e guarde daqui em diante o endereço que já a nomeia.",
    remate: null,
  },
  semResposta: {
    titulo: "Não foi possível confirmar a casa",
    corpo: () =>
      "A ligação falhou antes de a resposta chegar, por isso não se sabe para onde levar.",
    remate: "Verifique a ligação e recarregue a página.",
  },
};

// ------------------------------------------------------------
// A cortina. Sóbria de propósito: isto não é um ecrã para se
// admirar, é um ecrã para se ler uma vez e sair dele.
// ------------------------------------------------------------
function Cortina({ titulo, corpo, remate, children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--cream)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: "440px", textAlign: "center" }}>
        <h1
          style={{
            fontSize: "clamp(19px, 4vw, 24px)",
            color: "var(--gold)",
            fontFamily: "Playfair Display, serif",
            margin: "0 0 14px",
            lineHeight: 1.25,
          }}
        >
          {titulo}
        </h1>
        <p
          style={{
            fontSize: "13.5px",
            lineHeight: 1.65,
            color: "var(--charcoal)",
            margin: "0 0 10px",
          }}
        >
          {corpo}
        </p>
        {remate && (
          <p
            style={{
              fontSize: "12.5px",
              lineHeight: 1.6,
              color: "var(--gray-mid)",
              margin: "0 0 22px",
            }}
          >
            {remate}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

// O «sair» destes ecrãs. Sem ele, quem cai num endereço que não é seu
// fica sem gesto nenhum a não ser escrever outro URL à mão — e uma
// cortina sem saída é a mesma armadilha que o `*` do App já corrigiu.
function BotaoSair() {
  const navigate = useNavigate();
  return (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
        navigate("/admin/login", { replace: true });
      }}
      className="ligacao"
      style={{ fontSize: "12.5px", color: "var(--gold-dark)" }}
    >
      Terminar sessão
    </button>
  );
}

// ------------------------------------------------------------
// A PORTA. Enquanto a resposta não chega (`null`), deixa passar — o
// admin arranca à mesma e a identidade apanha-o a meio, como sempre
// fez. Segurar o ecrã à espera da RPC atrasaria as quatro buscas de
// arranque em todas as visitas para desenhar melhor o caso raro.
//
// Que é seguro é a base que garante, não isto: uma casa que não é
// nossa não devolve linha nenhuma. Esta porta não é a fechadura — é a
// EXPLICAÇÃO da fechadura.
// ------------------------------------------------------------
export default function PortaDaCasa({ children }) {
  const estado = useEstadoDaCasa();
  const casa = useCasa();

  if (estado === "suspensa") {
    return (
      <Cortina
        titulo={COPIA.suspensa.titulo}
        corpo={COPIA.suspensa.corpo(nomeDaCasa(casa))}
        remate={COPIA.suspensa.remate}
      >
        <BotaoSair />
      </Cortina>
    );
  }

  if (estado === "desconhecida") {
    return (
      <Cortina
        titulo={COPIA.desconhecida.titulo}
        corpo={COPIA.desconhecida.corpo()}
        remate={COPIA.desconhecida.remate}
      >
        {/* Sem casa no bolso, o «Início» tem de ser o endereço antigo:
            é ele que sabe descobrir a casa de quem entrou. */}
        <Link
          to={caminhoDoSeparador(null, "inicio")}
          className="ligacao"
          style={{ fontSize: "12.5px", color: "var(--gold-dark)" }}
        >
          Ir para o meu Início
        </Link>
      </Cortina>
    );
  }

  return children;
}

// ------------------------------------------------------------
// O ENDEREÇO SEM CASA — os favoritos da Nádia.
//
// ⚠ PENDÊNCIA COM CONDIÇÃO ESCRITA: este redirect morre no dia da
// SEGUNDA casa. Enquanto houver uma só, ele acerta sempre; a partir da
// segunda passa a ser este ecrã de escolha, e a escolha faz-se
// navegando — o endereço novo é que fica.
// ------------------------------------------------------------
export function EnderecoSemCasa() {
  const { pathname, search } = useLocation();
  // `undefined` é «ainda a perguntar», `null` é «não deu para
  // perguntar», e uma lista é uma lista — a mesma escala de três do
  // resto da casa.
  const [casas, setCasas] = useState(undefined);

  useEffect(() => {
    let vivo = true;
    asMinhasCasas().then((r) => {
      if (vivo) setCasas(r);
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (casas === undefined) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "var(--cream)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "14px",
          color: "var(--gray-mid)",
        }}
      >
        A abrir a sua casa...
      </div>
    );
  }

  if (casas === null) {
    return (
      <Cortina
        titulo={COPIA.semResposta.titulo}
        corpo={COPIA.semResposta.corpo()}
        remate={COPIA.semResposta.remate}
      />
    );
  }

  // Uma casa: o endereço antigo ganha a casa e segue para o mesmo
  // sítio a que ia. `replace` porque o endereço antigo não deve ficar
  // no histórico — o «voltar» cairia nele outra vez, e outra vez.
  if (casas.length === 1) {
    return (
      <Navigate
        to={`${caminhoComCasa(pathname, casas[0].slug)}${search || ""}`}
        replace
      />
    );
  }

  if (casas.length === 0) {
    return (
      <Cortina
        titulo={COPIA.semCasa.titulo}
        corpo={COPIA.semCasa.corpo()}
        remate={COPIA.semCasa.remate}
      >
        <BotaoSair />
      </Cortina>
    );
  }

  // Duas ou mais. Ligações, não seletor: escolhe-se uma vez, ao chegar
  // por um endereço antigo, e o que fica é o endereço novo — não um
  // estado guardado que decide por nós da próxima vez.
  return (
    <Cortina
      titulo={COPIA.varias.titulo}
      corpo={COPIA.varias.corpo()}
      remate={COPIA.varias.remate}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          marginTop: "4px",
        }}
      >
        {casas.map((c) => (
          <Link
            key={c.slug}
            to={`${caminhoComCasa(pathname, c.slug)}${search || ""}`}
            replace
            style={{
              display: "block",
              padding: "12px 16px",
              borderRadius: "10px",
              border: "1px solid var(--gold-light)",
              backgroundColor: "var(--superficie)",
              color: "var(--charcoal)",
              fontSize: "13.5px",
              textDecoration: "none",
            }}
          >
            {c.nome}
            {c.estado !== "activo" && (
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--gray-mid)",
                  marginLeft: "8px",
                }}
              >
                · suspensa
              </span>
            )}
          </Link>
        ))}
      </div>
    </Cortina>
  );
}
