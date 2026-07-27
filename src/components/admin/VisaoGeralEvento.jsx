import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { MarcaVisto, MarcaCruz } from "./marcas";
import { getValorAtual, seccoesPreenchidas } from "../../lib/submissionFields";
import { codigoErroRpc } from "../../lib/rpc";
import {
  camposAlterados,
  guardarAlteracoes,
  valorGuardado,
  vazio,
} from "../../lib/briefingEdicao";
import { AmostraPaleta, normalizarCores } from "./SeletorPaleta";
import { Convite } from "./acabamento";
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
// DOIS MODOS, e o que os separa é a pergunta a que respondem:
//   leitura — o que já foi respondido, com cada campo a corrigir-se no
//     lugar (clica, escreve, Enter). É o modo de sempre.
//   edição  — o briefing INTEIRO, incluindo o que ainda está POR
//     PREENCHER: todos os campos do modelo, todas as secções abertas,
//     tudo em caixa de escrita, e uma barra que guarda tudo de uma vez.
//
// O modo de edição existe porque a leitura só mostra o que está
// preenchido — e o que falta é precisamente o que se vai lá pôr. O
// "Editar" do cabeçalho liga-o; o mesmo botão, já ligado, passa a
// "Concluir edição" e guarda (daí o ref: o cabeçalho não conhece os
// rascunhos, mas tem de guardar exactamente o mesmo que a barra).
//
// Serviu o drawer em coluna até ao redesenho; desde que o drawer
// ficou espreitadela, só a página chama isto — a variante `mosaico`
// deixou de ser variante e passou a ser a única forma.
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

const rotuloCampo = {
  fontSize: "11px",
  color: "var(--gray-mid)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  margin: "0 0 2px 0",
};

const cartao = (aberta) => ({
  backgroundColor: "white",
  border: "1px solid #F0E6D0",
  borderRadius: "14px",
  padding: aberta ? "16px 20px 8px" : "14px 20px",
  breakInside: "avoid",
});

const tituloSeccao = (aberta, interactivo) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
  width: "100%",
  border: "none",
  background: "none",
  padding: 0,
  cursor: interactivo ? "pointer" : "default",
  textAlign: "left",
  fontSize: "11px",
  fontWeight: "600",
  color: "var(--gold)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  borderBottom: "1px solid var(--gold-light)",
  paddingBottom: "6px",
  marginBottom: aberta ? "12px" : "8px",
});

// A identidade dos botões (cor, hover, foco) vive nas classes .acao--*
// do index.css; aqui ficam só as medidas.
// Centrar uma marca desenhada num botão de medida fixa
const centraMarca = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const medidaBotaoMini = {
  width: "26px",
  height: "26px",
  borderRadius: "7px",
  padding: 0,
  fontSize: "12px",
  flexShrink: 0,
};

const medidaBotaoBarra = {
  padding: "9px 16px",
  borderRadius: "10px",
  fontSize: "12.5px",
  fontWeight: "500",
  whiteSpace: "nowrap",
};

const caixaErro = {
  fontSize: "12.5px",
  color: "#B91C1C",
  backgroundColor: "#FEF2F2",
  border: "1px solid #FECACA",
  borderRadius: "10px",
  padding: "10px 14px",
  margin: "0 0 16px",
};

const grelha = {
  flex: 1,
  minWidth: 0,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
  gap: "16px",
  alignItems: "start",
};

const slug = (t) =>
  String(t)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

const irParaSeccao = (titulo) => {
  const alvo = document.getElementById(`seccao-${slug(titulo)}`);
  if (alvo) alvo.scrollIntoView({ behavior: "smooth", block: "center" });
};

// ============================================================
// Um campo em LEITURA: lê-se; ao clicar, edita-se ali mesmo.
// ============================================================
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

  // O cursor entra no campo ao abrir. Sem isto era preciso clicar duas
  // vezes — uma para abrir, outra para escrever — e o gesto que o
  // desenho promete ("clica e corrige") ficava a meio.
  const caixa = useRef(null);
  useEffect(() => {
    if (!aEditar) return;
    caixa.current?.querySelector("input, textarea, select")?.focus();
  }, [aEditar]);

  // Enter confirma, Escape desiste — as mesmas duas teclas que a ficha
  // de materiais já obedecia. Excepções: num textarea o Enter é
  // parágrafo (confirma-se com Ctrl/Cmd+Enter), e num botão de escolha
  // múltipla o Enter é do botão, senão alternar uma opção fechava o
  // campo.
  const aoTeclar = (evento) => {
    if (evento.key === "Escape") {
      evento.stopPropagation();
      setAEditar(false);
      return;
    }
    if (evento.key !== "Enter" || aGravar) return;
    const alvo = evento.target.tagName;
    if (alvo === "BUTTON") return;
    if (alvo === "TEXTAREA" && !(evento.ctrlKey || evento.metaKey)) return;
    evento.preventDefault();
    confirmar();
  };

  return (
    <div style={{ marginBottom: "10px" }}>
      <p style={rotuloCampo}>{campo.label}</p>

      {aEditar ? (
        <div
          ref={caixa}
          onKeyDown={aoTeclar}
          style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <CampoEdicao campo={campo} valor={rascunho} onChange={setRascunho} />
          </div>
          <div style={{ display: "flex", gap: "4px", paddingTop: "4px" }}>
            <button
              onClick={confirmar}
              disabled={aGravar}
              title="Guardar"
              className="acao acao--cheia"
              style={{ ...medidaBotaoMini, ...centraMarca }}
            >
              <MarcaVisto />
            </button>
            <button
              onClick={() => setAEditar(false)}
              disabled={aGravar}
              title="Cancelar"
              className="acao acao--neutra"
              style={{ ...medidaBotaoMini, ...centraMarca }}
            >
              <MarcaCruz />
            </button>
          </div>
        </div>
      ) : campo.type === "paleta" ? (
        <div onClick={abrir} className={editavel ? "toca" : undefined}>
          <AmostraPaleta value={valorBruto} />
        </div>
      ) : (
        <p
          onClick={abrir}
          title={editavel ? "Clica para corrigir" : undefined}
          className={editavel ? "campo-editavel" : undefined}
          style={{
            fontSize: "14px",
            color: "var(--charcoal)",
            margin: 0,
            textWrap: "pretty",
          }}
        >
          {valor}
        </p>
      )}
    </div>
  );
}

// ============================================================
// O mesmo campo em EDIÇÃO: já aberto, sem clique nenhum pelo meio. O
// ponto dourado ao lado da etiqueta é o que ainda não foi guardado; o
// "por preencher" é o que nunca teve resposta — e é por causa desses
// que este modo existe.
// ============================================================
function CampoEmEdicao({ campo, valor, alterado, porPreencher, onChange }) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <p style={{ ...rotuloCampo, display: "flex", alignItems: "center", gap: "7px" }}>
        <span>{campo.label}</span>
        {alterado ? (
          <span
            title="Por guardar"
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: "var(--gold)",
              flexShrink: 0,
            }}
          />
        ) : (
          porPreencher && (
            <span
              style={{
                fontSize: "9px",
                letterSpacing: "0.08em",
                color: "#C0B79F",
                textTransform: "uppercase",
              }}
            >
              por preencher
            </span>
          )
        )}
      </p>
      <CampoEdicao campo={campo} valor={valor} onChange={onChange} />
    </div>
  );
}

// ============================================================
// IndiceLateral — "Nesta folha": o índice que salta, e o que se pode
// fazer à folha inteira. O mesmo em leitura e em edição; muda o que
// cada linha mostra à direita e a nota do fim.
// ============================================================
function IndiceLateral({ titulo, itens, onIr = irParaSeccao, onImprimir, nota }) {
  return (
    <div className="coluna-lateral">
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
        {titulo}
      </p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1px",
          marginBottom: "14px",
        }}
      >
        {itens.map((item) => (
          <button
            key={item.titulo}
            onClick={() => onIr(item.titulo)}
            className={`indice-item${item.activa ? " indice-item--activa" : ""}`}
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "8px",
              padding: "6px 9px",
              borderRadius: "7px",
              textAlign: "left",
            }}
          >
            <span
              style={{
                fontSize: "12px",
                color: item.activa ? "var(--gold-dark)" : "var(--gray-mid)",
              }}
            >
              {item.titulo}
            </span>
            <span style={{ fontSize: "10px", color: "#C0B79F" }}>
              {item.direita}
            </span>
          </button>
        ))}
      </div>

      {onImprimir && (
        <button
          onClick={onImprimir}
          className="acao acao--ouro"
          style={{
            width: "100%",
            padding: "9px 14px",
            borderRadius: "10px",
            fontSize: "12px",
            fontWeight: "500",
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
        {nota}
      </p>
    </div>
  );
}

// ============================================================
// BriefingEmEdicao — o briefing inteiro em caixas de escrita.
//
// Os rascunhos NÃO vivem aqui: vivem na EventoPage, e este componente
// só os desenha e devolve alterados. A razão é uma limitação que se
// sentia a usar — ir a Documentos e voltar deitava fora tudo o que
// estivesse escrito, porque sair do separador desmonta este componente.
// Com o estado um andar acima, mudar de separador deixa de custar nada:
// volta-se e está tudo como ficou.
//
// Enquanto ninguém escreveu, os rascunhos chegam a `null` e são os
// valores guardados que se mostram — assim não é preciso ninguém
// preparar nada para entrar em edição, e a primeira tecla passa a mandar
// o mapa completo para cima.
//
// Guarda TUDO o que mudou de uma vez, e SÓ o que mudou: um campo que
// estava por preencher e assim ficou não vai lá pôr um vazio por cima
// de nada.
// ============================================================
function BriefingEmEdicao({
  ref,
  submissao,
  seccoes,
  rascunhos: rascunhosGuardados,
  onRascunhos,
  onSaved,
  onFechar,
}) {
  const [aGravar, setAGravar] = useState(false);
  const [aDescartar, setADescartar] = useState(false);
  const [erro, setErro] = useState(null);

  const iniciais = useMemo(() => {
    const inicial = {};
    for (const sec of seccoes)
      for (const campo of sec.campos)
        inicial[campo.id] = valorGuardado(submissao, campo);
    return inicial;
  }, [seccoes, submissao]);

  const rascunhos = rascunhosGuardados ?? iniciais;

  const alterados = useMemo(
    () => camposAlterados(submissao, seccoes, rascunhos),
    [seccoes, submissao, rascunhos],
  );

  const porGuardar = new Set(alterados.map(({ campo }) => campo.id));

  const aGravarRef = useRef(false);
  const guardar = async () => {
    if (aGravarRef.current) return;
    if (alterados.length === 0) {
      onFechar?.();
      return;
    }
    aGravarRef.current = true;
    setAGravar(true);
    setErro(null);

    const { data, error } = await guardarAlteracoes(submissao, alterados);

    aGravarRef.current = false;
    setAGravar(false);

    if (error) {
      console.error(error);
      setErro(
        codigoErroRpc(error) === "EVENTO_EM_FALTA"
          ? "Este evento já não existe — volta à lista de clientes e recarrega."
          : "Não foi possível guardar. Tenta outra vez.",
      );
      return;
    }
    onSaved(data);
    onFechar?.();
  };

  // O "Concluir edição" do cabeçalho guarda exactamente isto. Sem
  // dependências: a ligação refaz-se a cada render, para nunca gravar
  // por um rascunho velho.
  useImperativeHandle(ref, () => ({ guardar: () => guardar() }));

  return (
    <>
      {erro && <p style={caixaErro}>{erro}</p>}

      <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
        <div style={grelha}>
          {seccoes.map((sec) => {
            const mudadosAqui = sec.campos.filter((c) =>
              porGuardar.has(c.id),
            ).length;
            return (
              <div
                key={sec.titulo}
                id={`seccao-${slug(sec.titulo)}`}
                style={{
                  ...cartao(true),
                  borderColor: mudadosAqui ? "var(--gold-light)" : "#F0E6D0",
                }}
              >
                <div style={tituloSeccao(true, false)}>
                  <span>{sec.titulo}</span>
                  {mudadosAqui > 0 && (
                    <span style={{ fontSize: "10px", color: "var(--gold-dark)" }}>
                      {mudadosAqui} por guardar
                    </span>
                  )}
                </div>
                {sec.campos.map((campo) => (
                  <CampoEmEdicao
                    key={campo.id}
                    campo={campo}
                    valor={rascunhos[campo.id]}
                    alterado={porGuardar.has(campo.id)}
                    porPreencher={vazio(getValorAtual(submissao, campo.id))}
                    // Sobe sempre o mapa INTEIRO (o rascunho em mão já
                    // o é, venha ele de cima ou dos valores guardados) —
                    // um mapa só com o campo tocado faria os outros
                    // parecer apagados.
                    onChange={(v) => onRascunhos({ ...rascunhos, [campo.id]: v })}
                  />
                ))}
              </div>
            );
          })}
        </div>

        <IndiceLateral
          titulo="A editar"
          itens={seccoes.map((sec) => ({
            titulo: sec.titulo,
            activa: true,
            direita: `${
              sec.campos.filter((c) => !vazio(getValorAtual(submissao, c.id)))
                .length
            }/${sec.campos.length}`,
          }))}
          nota="Estão à vista todos os campos do modelo, incluindo os que ninguém respondeu. Escreve à vontade — nada muda na base de dados enquanto não guardares, e podes ir a outro separador e voltar sem perder o que escreveste."
        />
      </div>

      {/* A barra que fica sempre à mão, por mais longa que seja a folha */}
      <div
        style={{
          position: "sticky",
          bottom: "18px",
          zIndex: 15,
          marginTop: "18px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
          flexWrap: "wrap",
          backgroundColor: "white",
          border: "1.5px solid var(--gold)",
          borderRadius: "14px",
          padding: "12px 16px",
          boxShadow: "0 10px 28px rgba(26,26,26,0.12)",
        }}
      >
        {aDescartar ? (
          <>
            <span style={{ fontSize: "13px", color: "var(--charcoal)" }}>
              Descartar {alterados.length}{" "}
              {alterados.length === 1 ? "alteração" : "alterações"}?
            </span>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => setADescartar(false)}
              className="acao acao--neutra"
              style={medidaBotaoBarra}
            >
              Continuar a editar
            </button>
            <button
              onClick={() => {
                setADescartar(false);
                onFechar?.();
              }}
              className="acao acao--perigo"
              style={medidaBotaoBarra}
            >
              Descartar
            </button>
          </>
        ) : (
          <>
            <span
              style={{
                fontSize: "9.5px",
                fontWeight: "700",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--gold-dark)",
                backgroundColor: "#FEF9EC",
                border: "1px solid var(--gold-light)",
                borderRadius: "999px",
                padding: "4px 9px",
                whiteSpace: "nowrap",
              }}
            >
              A editar o briefing
            </span>
            <span style={{ fontSize: "13px", color: "var(--gray-mid)" }}>
              {alterados.length === 0
                ? "Escreve em qualquer campo — inclusive nos que estão por preencher."
                : `${alterados.length} ${
                    alterados.length === 1 ? "alteração" : "alterações"
                  } por guardar.`}
            </span>
            <div style={{ flex: 1 }} />
            <button
              onClick={() =>
                alterados.length ? setADescartar(true) : onFechar?.()
              }
              disabled={aGravar}
              className="acao acao--neutra"
              style={medidaBotaoBarra}
            >
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={aGravar}
              className="acao acao--cheia"
              style={medidaBotaoBarra}
            >
              {aGravar
                ? "A guardar…"
                : alterados.length
                  ? "Guardar alterações"
                  : "Concluir"}
            </button>
          </>
        )}
      </div>
    </>
  );
}

export default function VisaoGeralEvento({
  submissao,
  seccoes,
  editando = false,
  rascunhos = null,
  onRascunhos,
  controloEdicaoRef,
  onFecharEdicao,
  onAbrirEdicao,
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

  const editavel = typeof onSaved === "function";
  const emEdicao = editavel && editando;

  // Em edição são TODAS as secções do modelo, e não só as que já têm
  // resposta — o que falta é precisamente o que se vem cá pôr.
  const seccoesModelo = useMemo(
    () => (seccoes || []).filter((sec) => (sec.campos || []).length > 0),
    [seccoes],
  );

  // Guarda UM campo (modo de leitura), com o mesmo contrato da edição
  // inteira — só que a um campo de cada vez.
  const guardarCampo = async (campo, valor) => {
    setErro(null);
    const { data, error } = await guardarAlteracoes(submissao, [
      { campo, valor },
    ]);
    if (error) {
      console.error(error);
      setErro(
        codigoErroRpc(error) === "EVENTO_EM_FALTA"
          ? "Este evento já não existe — volta à lista de clientes e recarrega."
          : "Não foi possível guardar. Tenta outra vez.",
      );
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
    irParaSeccao(titulo);
  };

  // Sem modelo associado não há campos nenhuns para preencher — e é
  // isso que é preciso dizer, senão o modo de edição abre vazio e
  // parece avariado.
  if (emEdicao && seccoesModelo.length === 0) {
    return (
      <>
        <FaixaOperacional submissao={submissao} seccoes={seccoes} />
        <div
          style={{
            backgroundColor: "white",
            border: "1px solid #F0E6D0",
            borderRadius: "14px",
            padding: "20px 24px",
            fontSize: "13px",
            color: "var(--gray-mid)",
            lineHeight: 1.6,
            maxWidth: "560px",
          }}
        >
          <p style={{ margin: "0 0 6px", color: "var(--charcoal)" }}>
            Este evento ainda não tem um modelo associado.
          </p>
          <p style={{ margin: "0 0 14px" }}>
            Os campos do briefing são os do modelo do tipo de evento — sem
            modelo não há o que preencher. Associa um modelo ao evento e volta
            aqui.
          </p>
          <button
            onClick={() => onFecharEdicao?.()}
            className="acao acao--neutra"
            style={medidaBotaoBarra}
          >
            Voltar à leitura
          </button>
        </div>
      </>
    );
  }

  if (!emEdicao && preenchidas.length === 0) {
    const podeEditar = editavel && seccoesModelo.length > 0 && onAbrirEdicao;
    return (
      <>
        <FaixaOperacional submissao={submissao} seccoes={seccoes} />
        {/* Havendo modelo há sempre o que preencher — e o convite abre
            a edição aqui mesmo, em vez de apontar para um botão longe. */}
        <Convite
          titulo="O briefing está por preencher."
          texto={
            podeEditar
              ? "Todos os campos do modelo abrem-se de uma vez, em caixas de escrita — o que souberes agora, guarda-se agora."
              : "As respostas do formulário e o que fores combinando com a cliente vão aparecer aqui."
          }
          accao="Preencher o briefing"
          onAccao={podeEditar ? onAbrirEdicao : undefined}
        />
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
        style={cartao(aberta)}
      >
        <button
          onClick={() => alternar(sec.titulo)}
          className="toca"
          style={tituloSeccao(aberta, true)}
        >
          <span>{sec.titulo}</span>
          <span style={{ color: "var(--gold-light)", fontSize: "10px" }}>
            {aberta ? "▾" : "▸"}
          </span>
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

  return (
    <>
      <FaixaOperacional submissao={submissao} seccoes={seccoes} />

      {emEdicao ? (
        <BriefingEmEdicao
          key={submissao.id}
          ref={controloEdicaoRef}
          submissao={submissao}
          seccoes={seccoesModelo}
          rascunhos={rascunhos}
          onRascunhos={onRascunhos}
          onSaved={onSaved}
          onFechar={onFecharEdicao}
        />
      ) : (
        <>
          {erro && <p style={caixaErro}>{erro}</p>}

          <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
            <div style={grelha}>{seccoesRender}</div>

            <IndiceLateral
              titulo="Nesta folha"
              itens={preenchidas.map((sec) => ({
                titulo: sec.titulo,
                activa: abertas.includes(sec.titulo),
                direita: sec.campos.length,
              }))}
              onIr={irPara}
              onImprimir={onImprimir}
              nota="A folha sai sempre completa — com a ficha de materiais e sem pagamentos. Cada campo corrige-se aqui mesmo; o endereço /briefing/:id continua a abrir só a folha."
            />
          </div>
        </>
      )}
    </>
  );
}
