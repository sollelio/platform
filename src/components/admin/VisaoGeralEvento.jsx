import { useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  getValorAtual,
  seccoesPreenchidas,
  FIELD_MAP_INVERSO,
} from "../../lib/submissionFields";
import { AmostraPaleta, normalizarCores } from "./SeletorPaleta";
import CampoEdicao from "./CampoEdicao";
import FaixaOperacional from "./FaixaOperacional";

// ============================================================
// VisaoGeralEvento — o briefing no ecrã.
//
// Fonte única: as secções nascem dos steps do modelo do evento, as
// mesmas que geram a folha impressa. Uma "visão geral" desenhada à
// parte seria uma segunda leitura dos mesmos dados, e duas leituras
// divergem sempre.
//
// No ecrã não pode ser o papel esticado: a folha é uma coluna de
// 720 px, que num ecrã de 1600 px seria uma tira magra no meio do
// vazio. Aqui é mosaico; no papel volta à coluna, igual à de hoje.
//
// Três regras que a arquitectura fixou:
//   • as duas primeiras secções abertas, as restantes recolhidas —
//     um modelo com muitos passos gerava uma folha longa, e a Visão
//     geral inteira aberta recriava o problema que estamos a resolver;
//   • recolhido ≠ escondido: cada secção fechada mostra a linha que a
//     resume, e a IMPRESSÃO ignora o estado recolhido (a folha sai
//     sempre completa);
//   • se está no ecrã, edita-se no ecrã: cada campo corrige-se no
//     lugar. É a diferença entre um relatório e uma ferramenta.
//
// No drawer continua a servir em coluna e só de leitura (`mosaico` e
// `onSaved` desligados) — lá é uma vista rápida, não um sítio de
// trabalho.
// ============================================================

const ABERTAS_POR_OMISSAO = 2;

// A linha que resume uma secção fechada: o que dela se quer saber sem
// abrir. Prefere os campos com peso visual (paleta), depois os
// primeiros preenchidos.
function resumoDaSeccao(seccao) {
  const paleta = seccao.campos.find(({ campo }) => campo.type === "paleta");
  const outros = seccao.campos
    .filter(({ campo }) => campo.type !== "paleta")
    .slice(0, 2)
    .map(({ valor }) => String(valor))
    .filter(Boolean);
  return { paleta: paleta ? paleta.valor : null, textos: outros };
}

// Um campo: lê-se; ao clicar, edita-se ali mesmo.
function Campo({ submissao, campo, valor, editavel, onGuardar }) {
  const [aEditar, setAEditar] = useState(false);
  const [rascunho, setRascunho] = useState(null);
  const [aGravar, setAGravar] = useState(false);

  const valorBruto = getValorAtual(submissao, campo.id);

  const abrir = () => {
    if (!editavel) return;
    setRascunho(Array.isArray(valorBruto) ? valorBruto : (valorBruto ?? ""));
    setAEditar(true);
  };

  const confirmar = async () => {
    setAGravar(true);
    const ok = await onGuardar(campo, rascunho);
    setAGravar(false);
    if (ok) setAEditar(false);
  };

  return (
    <div style={{ marginBottom: "10px" }}>
      <p
        style={{
          fontSize: "11px",
          color: "var(--gray-mid)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          margin: "0 0 2px 0",
        }}
      >
        {campo.label}
      </p>

      {aEditar ? (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <CampoEdicao campo={campo} valor={rascunho} onChange={setRascunho} />
          </div>
          <div style={{ display: "flex", gap: "4px", paddingTop: "4px" }}>
            <button
              onClick={confirmar}
              disabled={aGravar}
              title="Guardar"
              style={botaoMini("var(--gold)", "white")}
            >
              ✓
            </button>
            <button
              onClick={() => setAEditar(false)}
              disabled={aGravar}
              title="Cancelar"
              style={botaoMini("white", "var(--gray-mid)")}
            >
              ✕
            </button>
          </div>
        </div>
      ) : campo.type === "paleta" ? (
        <div onClick={abrir} style={{ cursor: editavel ? "pointer" : "default" }}>
          <AmostraPaleta value={valorBruto} />
        </div>
      ) : (
        <p
          onClick={abrir}
          title={editavel ? "Clica para corrigir" : undefined}
          style={{
            fontSize: "14px",
            color: "var(--charcoal)",
            margin: 0,
            textWrap: "pretty",
            cursor: editavel ? "pointer" : "default",
            borderBottom: editavel ? "1px dotted transparent" : "none",
          }}
          onMouseEnter={(e) => {
            if (editavel) e.currentTarget.style.borderBottomColor =
              "var(--gold-light)";
          }}
          onMouseLeave={(e) => {
            if (editavel) e.currentTarget.style.borderBottomColor = "transparent";
          }}
        >
          {valor}
        </p>
      )}
    </div>
  );
}

const botaoMini = (fundo, cor) => ({
  width: "26px",
  height: "26px",
  borderRadius: "7px",
  border:
    fundo === "white" ? "1px solid var(--gold-light)" : "1px solid var(--gold)",
  backgroundColor: fundo,
  color: cor,
  fontSize: "12px",
  cursor: "pointer",
  flexShrink: 0,
});

export default function VisaoGeralEvento({
  submissao,
  seccoes,
  mosaico = false,
  onSaved,
  onImprimir,
}) {
  const preenchidas = useMemo(
    () => seccoesPreenchidas(submissao, seccoes),
    [submissao, seccoes],
  );
  const [abertas, setAbertas] = useState(() =>
    preenchidas.slice(0, ABERTAS_POR_OMISSAO).map((s) => s.titulo),
  );
  const [erro, setErro] = useState(null);

  const editavel = mosaico && typeof onSaved === "function";

  // Guarda UM campo. Escreve nas duas fontes (respostas + coluna antiga
  // equivalente, quando existe) — o mesmo contrato de sempre, só que a
  // um campo de cada vez em vez do formulário inteiro.
  const guardarCampo = async (campo, valor) => {
    setErro(null);
    const update = {
      respostas: { ...(submissao.respostas || {}), [campo.id]: valor },
    };
    const coluna = FIELD_MAP_INVERSO[campo.id];
    if (coluna) update[coluna] = valor;
    // O campo marcado com papel "data" É a data do evento, seja qual
    // for o seu id.
    if (campo.papel === "data") update.data_evento = valor || null;

    const { data, error } = await supabase
      .from("submissions")
      .update(update)
      .eq("id", submissao.id)
      .select()
      .single();

    if (error) {
      console.error(error);
      setErro("Não foi possível guardar. Tenta outra vez.");
      return false;
    }
    onSaved(data);
    return true;
  };

  const alternar = (titulo) =>
    setAbertas((atuais) =>
      atuais.includes(titulo)
        ? atuais.filter((t) => t !== titulo)
        : [...atuais, titulo],
    );

  const irPara = (titulo) => {
    setAbertas((atuais) =>
      atuais.includes(titulo) ? atuais : [...atuais, titulo],
    );
    const alvo = document.getElementById(`seccao-${slug(titulo)}`);
    if (alvo) alvo.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (preenchidas.length === 0) {
    return (
      <>
        {mosaico && <FaixaOperacional submissao={submissao} seccoes={seccoes} />}
        <p
          style={{
            fontSize: "13px",
            color: "var(--gray-mid)",
            fontStyle: "italic",
            textAlign: "center",
            padding: "20px",
          }}
        >
          Este evento ainda não tem detalhes preenchidos.
        </p>
      </>
    );
  }

  const seccoesRender = preenchidas.map((sec) => {
    const aberta = abertas.includes(sec.titulo);
    const resumo = aberta ? null : resumoDaSeccao(sec);
    return (
      <div
        key={sec.titulo}
        id={`seccao-${slug(sec.titulo)}`}
        style={
          mosaico
            ? {
                backgroundColor: "white",
                border: "1px solid #F0E6D0",
                borderRadius: "14px",
                padding: aberta ? "16px 20px 8px" : "14px 20px",
                breakInside: "avoid",
              }
            : { marginBottom: "24px" }
        }
      >
        <button
          onClick={() => mosaico && alternar(sec.titulo)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            width: "100%",
            border: "none",
            background: "none",
            padding: 0,
            cursor: mosaico ? "pointer" : "default",
            textAlign: "left",
            fontSize: "11px",
            fontWeight: "600",
            color: "var(--gold)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            borderBottom: "1px solid var(--gold-light)",
            paddingBottom: "6px",
            marginBottom: aberta ? "12px" : "8px",
          }}
        >
          <span>{sec.titulo}</span>
          {mosaico && (
            <span style={{ color: "var(--gold-light)", fontSize: "10px" }}>
              {aberta ? "▾" : "▸"}
            </span>
          )}
        </button>

        {aberta ? (
          sec.campos.map(({ campo, valor }) => (
            <Campo
              key={campo.id}
              submissao={submissao}
              campo={campo}
              valor={valor}
              editavel={editavel}
              onGuardar={guardarCampo}
            />
          ))
        ) : (
          // Recolhido ≠ escondido: a linha que resume a secção.
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            {resumo.paleta && (
              <span style={{ display: "flex", gap: "3px" }}>
                {normalizarCores(
                  Array.isArray(resumo.paleta)
                    ? resumo.paleta
                    : String(resumo.paleta).split(",").map((t) => t.trim()),
                ).map((c) => (
                  <span
                    key={c.nome}
                    title={c.nome}
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: c.hex,
                      border: "1px solid rgba(0,0,0,0.12)",
                      display: "block",
                    }}
                  />
                ))}
              </span>
            )}
            <span
              style={{
                fontSize: "12.5px",
                color: "var(--gray-mid)",
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {resumo.textos.join(" · ")}
            </span>
            <span style={{ fontSize: "11px", color: "#B0A88F" }}>
              {sec.campos.length}{" "}
              {sec.campos.length === 1 ? "campo" : "campos"}
            </span>
          </div>
        )}
      </div>
    );
  });

  // No drawer é só a coluna, como sempre foi.
  if (!mosaico) return <>{seccoesRender}</>;

  return (
    <>
      <FaixaOperacional submissao={submissao} seccoes={seccoes} />

      {erro && (
        <p
          style={{
            fontSize: "12.5px",
            color: "#B91C1C",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "10px",
            padding: "10px 14px",
            margin: "0 0 16px",
          }}
        >
          {erro}
        </p>
      )}

      <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "16px",
            alignItems: "start",
          }}
        >
          {seccoesRender}
        </div>

        {/* Nesta folha — o índice que salta e imprime */}
        <div style={{ width: "220px", flexShrink: 0, position: "sticky", top: "180px" }}>
          <p
            style={{
              fontSize: "9px",
              fontWeight: "700",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--gold)",
              margin: "0 0 10px",
            }}
          >
            Nesta folha
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1px",
              marginBottom: "14px",
            }}
          >
            {preenchidas.map((sec) => (
              <button
                key={sec.titulo}
                onClick={() => irPara(sec.titulo)}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: "8px",
                  padding: "6px 9px",
                  borderRadius: "7px",
                  border: "none",
                  backgroundColor: abertas.includes(sec.titulo)
                    ? "#FBF7EF"
                    : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    color: abertas.includes(sec.titulo)
                      ? "var(--gold-dark)"
                      : "var(--gray-mid)",
                  }}
                >
                  {sec.titulo}
                </span>
                <span style={{ fontSize: "10px", color: "#C0B79F" }}>
                  {sec.campos.length}
                </span>
              </button>
            ))}
          </div>

          {onImprimir && (
            <button
              onClick={onImprimir}
              style={{
                width: "100%",
                padding: "9px 14px",
                borderRadius: "10px",
                border: "1.5px solid var(--gold)",
                backgroundColor: "white",
                color: "var(--gold)",
                fontSize: "12px",
                fontWeight: "500",
                cursor: "pointer",
                marginBottom: "10px",
              }}
            >
              Imprimir / Guardar PDF
            </button>
          )}
          <p
            style={{
              fontSize: "10.5px",
              color: "#9B9B9B",
              lineHeight: 1.5,
              margin: 0,
              borderTop: "1px solid #F0E6D0",
              paddingTop: "12px",
            }}
          >
            A folha sai sempre completa — com a ficha de materiais e sem
            pagamentos. Cada campo corrige-se aqui mesmo; o endereço
            /briefing/:id continua a abrir só a folha.
          </p>
        </div>
      </div>
    </>
  );
}

const slug = (t) =>
  String(t)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
