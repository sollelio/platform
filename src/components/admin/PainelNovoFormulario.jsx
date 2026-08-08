import { useEffect, useState } from "react";
import CampoSeletor from "./CampoSeletor";
import FormField from "../form/FormField";
import { estadoFormularioDoEvento } from "../../lib/invites";
import { getResumoSubmissao } from "../../lib/submissionFields";
import { irmaosDoDia } from "../../lib/disputaDia";
import AvisoDiaDisputado from "../AvisoDiaDisputado";
import {
  dataDoRascunho,
  getAllFields,
  getCamposActivosInfo,
  getDefaultCampos,
} from "../../lib/camposFormulario";

// ============================================================
// PainelNovoFormulario — o painel onde a Nádia compõe um formulário.
//
// EXTRAÍDO da AdminPage SEM MUDAR COMPORTAMENTO (o mesmo contrato da
// InvitesList, que saiu de lá da mesma maneira). Eram 608 linhas dentro
// do bloco do separador Formulários, num IIFE.
//
// O ESTADO CONTINUA IÇADO na AdminPage, de propósito: este passo é uma
// mudança de sítio, não de comportamento — o painel meio preenchido tem
// de continuar a sobreviver à troca de separador exactamente como antes.
// Por isso os setters chegam por props COM OS NOMES ORIGINAIS: o JSX
// movido fica byte a byte igual, e o diff da AdminPage é quase todo
// remoções. A consolidação da posse (um só dono, um só gesto de
// abertura) é o passo seguinte, e é aí que os nomes se arrumam.
//
// A <style> do scrollbar viaja DENTRO do componente: é CSS global
// injectado, não scoped, e sem ela o corpo do painel perde a barra fina
// dourada e passa à nativa, grossa.
//
// O bloco «Dados da captação» viaja intacto — nome e conteúdo. O
// glossário diz que ele desaparece com a ponte pedido→formulário, mas
// isso é projecto separado: aqui só muda de ficheiro.
// ============================================================

function DadosCaptacao({ submissao }) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(null);
  if (!submissao) return null;
  const r = submissao.respostas || {};
  const linhas = [
    ["Nome", r.nomeDoCliente || r.nomeResponsavel],
    ["Tipo de evento (outro)", r.tipoEventoOutro],
    ["WhatsApp", r.numeroWhatsapp],
    ["Contacto", r.contactoPrincipal],
    ["Data do evento", submissao.data_evento || r.dataEvento],
    [
      "Nº convidados",
      submissao.numero_convidados ?? r.numeroConvidados ?? null,
    ],
    ["Local", r.localEvento],
    ["Espaço", r.tipoLocal],
    [
      "Serviços",
      [
        ...(Array.isArray(r.servicos) ? r.servicos : []),
        ...(Array.isArray(r.servicosBuffet) ? r.servicosBuffet : []),
        ...(Array.isArray(r.servicosBalcao) ? r.servicosBalcao : []),
      ].join(", ") || null,
    ],
    ["Notas da conversa", r.mensagemInicial || r.maisDetalhes || null],
  ].filter(([, v]) => v !== null && v !== undefined && `${v}`.trim() !== "");
  if (linhas.length === 0) return null;

  const copiar = async (rotulo, valor) => {
    try {
      await navigator.clipboard.writeText(`${valor}`);
      setCopiado(rotulo);
      setTimeout(() => setCopiado(null), 1600);
    } catch {
      /* clipboard indisponível — sem drama */
    }
  };

  return (
    <div style={{ marginTop: "10px" }}>
      <button
        onClick={() => setAberto(!aberto)}
        style={{
          border: "none",
          background: "none",
          cursor: "pointer",
          fontSize: "11px",
          fontWeight: "600",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--gold-dark)",
          padding: 0,
        }}
      >
        {aberto ? "▾" : "▸"} Dados da captação ({linhas.length})
      </button>
      {aberto && (
        <div
          style={{
            marginTop: "8px",
            borderTop: "1px solid var(--gold-light)",
            paddingTop: "8px",
          }}
        >
          {linhas.map(([rotulo, valor]) => (
            <div
              key={rotulo}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                padding: "4px 0",
              }}
            >
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--charcoal)",
                  minWidth: 0,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: "var(--gray-mid)" }}>{rotulo}: </span>
                {`${valor}`}
              </span>
              <button
                onClick={() => copiar(rotulo, valor)}
                style={{
                  flexShrink: 0,
                  border: "1px solid var(--gold-light)",
                  backgroundColor: "white",
                  borderRadius: "999px",
                  padding: "3px 10px",
                  fontSize: "11px",
                  color:
                    copiado === rotulo ? "#166534" : "var(--gold-dark)",
                  cursor: "pointer",
                }}
              >
                {copiado === rotulo ? "✓ Copiado" : "Copiar"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PainelNovoFormulario({
  // visibilidade e estado do formulário — içados na AdminPage (ver acima)
  showNewInvite,
  setShowNewInvite,
  newInvite,
  setNewInvite,
  newInviteErrors,
  setNewInviteErrors,
  creatingInvite,
  // as listas partilhadas
  eventTypes,
  submissions,
  invites,
  // A lista para o selector «Formulário para». `null` = o alvo é fixo
  // (não se escolhe) e o selector não se pinta — é a configuração de
  // dentro de um evento.
  eventosParaEscolher,
  // contexto de abertura (de onde a intenção veio)
  eventoContexto,
  setEventoContexto,
  // acções que atravessam a fronteira (ficam no anfitrião)
  handleCreateInvite,
}) {
  // ------------------------------------------------------------
  // A disputa do dia na criação (Bloco 4; absorve a decisão pendente
  // de 30/07): quando a data preenchida no campo da data já tem
  // pedidos vivos, um banner âmbar informa — e NUNCA trava a criação
  // (o dia só muda de mãos no registo do sinal). O evento-alvo
  // escolhido sai da conta: ninguém é rival de si mesmo.
  //
  // A data lê-se por dataDoRascunho — o leitor canónico (os ids dos
  // campos são gerados da etiqueta; a chave literal "dataEvento" é só
  // rede para convites antigos). Foi exactamente esta divergência que
  // já deu um bug (camposFormulario.js) — não se repete aqui.
  // ------------------------------------------------------------
  const dataDoPainel = showNewInvite
    ? dataDoRascunho(newInvite, eventTypes)
    : null;
  const dataEscolhida = /^\d{4}-\d{2}-\d{2}$/.test(dataDoPainel || "")
    ? dataDoPainel
    : null;
  const alvoAExcluir = newInvite?.submissionAlvoId || null;
  // Guarda-se {data, alvo, irmaos} e só se pinta quando data e alvo
  // guardados SÃO os actuais: uma resposta atrasada de uma data antiga
  // nunca aparece, e mudar a data apaga o aviso sem precisar de
  // limpeza síncrona no efeito.
  const [disputaDia, setDisputaDia] = useState(null);

  // Debounce leve (o input de data dispara a meio da escrita). Se a
  // 083 ainda não correu, irmaosDoDia devolve [] em silêncio e o
  // banner não existe — degradação graciosa da casa.
  useEffect(() => {
    if (!dataEscolhida) return undefined;
    let cancelado = false;
    const temporizador = setTimeout(async () => {
      const lista = await irmaosDoDia(dataEscolhida, alvoAExcluir);
      if (!cancelado)
        setDisputaDia({
          data: dataEscolhida,
          alvo: alvoAExcluir,
          irmaos: lista || [],
        });
    }, 350);
    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [dataEscolhida, alvoAExcluir]);

  // Os irmãos VÁLIDOS para a data e o alvo que estão no painel agora.
  const irmaosDia =
    disputaDia &&
    disputaDia.data === dataEscolhida &&
    disputaDia.alvo === alvoAExcluir
      ? disputaDia.irmaos
      : [];
  // ------------------------------------------------------------
  // As mutações do rascunho vivem AQUI, num sítio só.
  //
  // Estavam espalhadas pela AdminPage e o rascunho é um objecto com
  // quatro campos interdependentes (tipo, campos activos, valores,
  // alvo): mexer num sem limpar os outros é como as respostas de uma
  // cliente foram dar ao evento de outra. O valor continua guardado
  // pelo anfitrião (para o painel meio preenchido sobreviver à troca de
  // separador, como sempre) — o que se consolidou foi QUEM o altera.
  // ------------------------------------------------------------
  const handleChangeEventType = (novoId) => {
    const tipo = eventTypes.find((et) => et.id === novoId);
    setNewInvite((prev) => ({
      ...prev,
      eventTypeId: novoId,
      camposAtivos: getDefaultCampos(tipo),
      valores: {},
    }));
    setNewInviteErrors({});
  };

  const handleAddCampo = (fieldId) => {
    setNewInvite((prev) => ({
      ...prev,
      camposAtivos: [...prev.camposAtivos, fieldId],
    }));
  };

  const handleRemoveCampo = (fieldId) => {
    setNewInvite((prev) => {
      const valoresSemEste = { ...prev.valores };
      delete valoresSemEste[fieldId];
      return {
        ...prev,
        camposAtivos: prev.camposAtivos.filter((id) => id !== fieldId),
        valores: valoresSemEste,
      };
    });
    setNewInviteErrors((prev) => {
      const n = { ...prev };
      delete n[fieldId];
      return n;
    });
  };

  const handleChangeValorCampo = (fieldId, valor) => {
    setNewInvite((prev) => ({
      ...prev,
      valores: { ...prev.valores, [fieldId]: valor },
    }));
    setNewInviteErrors((prev) => {
      if (!prev[fieldId]) return prev;
      const n = { ...prev };
      delete n[fieldId];
      return n;
    });
  };
  return (
    <>
            {/* Formulário novo Formulário */}
            <style>{`
              .painel-convite-scroll::-webkit-scrollbar { width: 6px; }
              .painel-convite-scroll::-webkit-scrollbar-thumb {
                background-color: var(--gold-light);
                border-radius: 999px;
              }
              .painel-convite-scroll::-webkit-scrollbar-track { background: transparent; }
            `}</style>

            {showNewInvite &&
              (() => {
                const tipoActual = eventTypes.find(
                  (et) => et.id === newInvite.eventTypeId,
                );
                const todosOsCampos = getAllFields(tipoActual);
                const camposActivosInfo = getCamposActivosInfo(
                  eventTypes,
                  newInvite,
                );
                const camposDisponiveis = todosOsCampos.filter(
                  (f) => !newInvite.camposAtivos.includes(f.id),
                );
                // O campo a que o aviso da disputa se cola: o primeiro
                // campo de data com a data escolhida — o mesmo critério
                // do leitor canónico, para o banner aparecer debaixo do
                // campo que efectivamente deu a data.
                const campoAncoraDisputa = dataEscolhida
                  ? camposActivosInfo.find(
                      (f) =>
                        f.type === "date" &&
                        newInvite.valores[f.id] === dataEscolhida,
                    ) || null
                  : null;
                // O evento-alvo escolhido e o estado do formulário
                // DELE — para avisar quando já existe um convite
                // (pendente, respondido, ou desviado para um duplicado)
                // antes de se criar mais um.
                const alvoSelecionado = newInvite.submissionAlvoId
                  ? submissions.find(
                      (s) => s.id === newInvite.submissionAlvoId,
                    ) || null
                  : null;
                const estadoDoAlvo = alvoSelecionado
                  ? estadoFormularioDoEvento(invites, alvoSelecionado.id)
                  : null;

                return (
                  <div
                    style={{
                      backgroundColor: "white",
                      borderRadius: "16px",
                      boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
                      marginBottom: "20px",
                      border: "1px solid var(--gold-light)",
                      display: "flex",
                      flexDirection: "column",
                      maxHeight: "min(640px, 80vh)",
                    }}
                  >
                    {/* Corpo — ganha scroll próprio quando há muitos campos.
                        A barra de scroll é estilizada (mais fina, dourada)
                        para ficar claro que esta zona desliza */}
                    <div
                      className="painel-convite-scroll"
                      style={{
                        padding: "24px",
                        overflowY: "auto",
                        flex: 1,
                        scrollbarWidth: "thin",
                        scrollbarColor: "var(--gold-light) transparent",
                      }}
                    >
                      <h3
                        style={{
                          fontSize: "14px",
                          color: "var(--charcoal)",
                          margin: "0 0 20px 0",
                          fontFamily: "Playfair Display, serif",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        Novo Formulário
                      </h3>


                      {eventoContexto && (
                        <div
                          style={{
                            backgroundColor: "#FBF7EF",
                            border: "1px solid var(--gold-light)",
                            borderRadius: "10px",
                            padding: "12px 14px",
                            marginBottom: "16px",
                          }}
                        >
                          {/* «Vai atualizar o evento de X» responde a uma
                              pergunta que só existe quando há escolha de
                              alvo. Dentro do próprio evento, dizê-lo é
                              dizer à Nádia onde ela está — por isso o
                              cabeçalho segue o mesmo sinal que o
                              selector. Os Dados do pedido ficam nas duas
                              configurações: ali são confirmação, aqui são
                              consulta. */}
                          {eventosParaEscolher && (
                            <>
                              <p
                                style={{
                                  fontSize: "10px",
                                  color: "var(--gold-dark)",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                  margin: "0 0 4px 0",
                                }}
                              >
                                Vai atualizar o evento de
                              </p>
                              <p
                                style={{
                                  fontSize: "14px",
                                  fontWeight: "600",
                                  color: "var(--charcoal)",
                                  margin: 0,
                                }}
                              >
                                {eventoContexto.titulo}
                                {eventoContexto.tipoNome
                                  ? ` · ${eventoContexto.tipoNome}`
                                  : ""}
                              </p>
                            </>
                          )}
                          <DadosCaptacao
                            submissao={submissions.find(
                              (x) => x.id === newInvite.submissionAlvoId,
                            )}
                          />
                        </div>
                      )}

                      {/* O ALVO do formulário — a diferença entre
                          ATUALIZAR um evento existente e criar cliente +
                          evento novos. Antes só se chegava a um convite
                          apontado por caminhos programáticos (drawer,
                          Jornada, página do evento); criado à mão, o
                          convite nascia sempre órfão — a porta da
                          duplicação. Escolher "nenhum" limpa o alvo. */}
                      {/* O selector só existe quando HÁ o que escolher.
                          `eventosParaEscolher === null` é a configuração
                          de dentro de um evento: o alvo já é conhecido, e
                          um selector de evento dentro de um evento seria
                          UI morta. */}
                      {eventosParaEscolher && (
                        <div style={{ marginBottom: "14px" }}>
                          <label
                            style={{
                              fontSize: "11px",
                              fontWeight: "600",
                              textTransform: "uppercase",
                              letterSpacing: "0.07em",
                              color: "var(--charcoal)",
                              display: "block",
                              marginBottom: "6px",
                            }}
                          >
                            Formulário para
                          </label>
                          <select
                            value={newInvite.submissionAlvoId || ""}
                            onChange={(e) => {
                              const alvoId = e.target.value;
                              if (!alvoId) {
                                setEventoContexto(null);
                                setNewInvite((prev) => ({
                                  ...prev,
                                  submissionAlvoId: null,
                                }));
                                return;
                              }
                              const submissao = submissions.find(
                                (s) => s.id === alvoId,
                              );
                              if (!submissao) return;
                              // Só muda o ALVO — o tipo, os campos e o
                              // que já está escrito no painel ficam
                              // como estão (mudar de ideias não pode
                              // apagar trabalho).
                              const tipoDoAlvo = eventTypes.find(
                                (et) => et.id === submissao.event_type_id,
                              );
                              const resumoDoAlvo = getResumoSubmissao(
                                submissao,
                                eventTypes,
                              );
                              setEventoContexto({
                                id: submissao.id,
                                titulo: resumoDoAlvo.titulo,
                                tipoNome: tipoDoAlvo?.nome || "",
                                data: submissao.data_evento || null,
                              });
                              setNewInvite((prev) => ({
                                ...prev,
                                submissionAlvoId: submissao.id,
                              }));
                            }}
                            style={{
                              width: "100%",
                              padding: "10px 14px",
                              borderRadius: "8px",
                              border: "1.5px solid var(--gold-light)",
                              fontSize: "13px",
                              outline: "none",
                              fontFamily: "Inter, sans-serif",
                              boxSizing: "border-box",
                            }}
                          >
                            <option value="">
                              Cliente novo — cria cliente e evento
                            </option>
                            {eventosParaEscolher.map((s) => {
                              const r = getResumoSubmissao(s, eventTypes);
                              return (
                                <option key={s.id} value={s.id}>
                                  {r.titulo}
                                  {s.data_evento ? ` · ${s.data_evento}` : ""}
                                  {" — atualiza este evento"}
                                </option>
                              );
                            })}
                          </select>
                          {/* Decisão de 27/07 (docs/decisoes-de-produto.md):
                              a RPC NÃO recusa convite sem alvo — recusaria
                              no ecrã da cliente, que não tem como corrigir.
                              O aviso vive AQUI, na criação, não-bloqueante. */}
                          {/* Quando há convites órfãos, o bloco deles
                              (abaixo) já pede exatamente esta ação —
                              dois blocos âmbar iguais diluíam-se. */}
                          {!newInvite.submissionAlvoId && (
                              <p
                                style={{
                                  fontSize: "11.5px",
                                  color: "#92400E",
                                  backgroundColor: "#FEF3E2",
                                  border: "1px solid #F0D9B5",
                                  borderRadius: "8px",
                                  padding: "8px 12px",
                                  margin: "8px 0 0 0",
                                  lineHeight: 1.6,
                                }}
                              >
                                Sem evento escolhido, quando ela submeter
                                nasce sempre um <strong>evento novo</strong>.
                                O cartão de cliente só é reaproveitado se o
                                telefone que ela preencher coincidir com o já
                                registado — com um número novo, em falta ou
                                incompleto, nasce também um cartão em
                                duplicado. Se este formulário é para alguém
                                que já está no funil, escolhe o evento dela
                                aqui em cima.
                              </p>
                            )}
                        </div>
                      )}

                      {/* O estado do formulário do ALVO escolhido — já
                          tem convite pendente? respondido? desviado
                          para um duplicado? Diz-se ANTES de se criar
                          mais um. */}
                      {estadoDoAlvo && estadoDoAlvo.estado !== "nenhum" && (
                        <p
                          style={{
                            fontSize: "12px",
                            color: "#92400E",
                            backgroundColor: "#FEF3E2",
                            border: "1px solid #F0D9B5",
                            borderRadius: "10px",
                            padding: "10px 14px",
                            margin: "0 0 16px 0",
                            lineHeight: "1.6",
                          }}
                        >
                          {estadoDoAlvo.estado === "pendente"
                            ? `⚠ Este evento já tem um formulário por preencher (código ${estadoDoAlvo.convite.code}). Partilha ou preenche esse — criar um segundo deixa dois códigos vivos para a mesma cliente.`
                            : estadoDoAlvo.estado === "preenchido"
                              ? `ℹ Este evento já tem um formulário respondido (código ${estadoDoAlvo.convite.code}). Um novo formulário volta a atualizar o evento por cima das respostas existentes.`
                              : `⚠ O convite ${estadoDoAlvo.convite.code} apontado a este evento foi preenchido, mas as respostas ficaram noutro evento (o rasto de um duplicado por reparar). Criar aqui um formulário novo apontado é o caminho certo.`}
                        </p>
                      )}


                      {eventTypes.length > 1 && (
                        <div
                          id="tour-novo-convite-tipo"
                          style={{ marginBottom: "14px" }}
                        >
                          <label
                            style={{
                              fontSize: "11px",
                              fontWeight: "600",
                              textTransform: "uppercase",
                              letterSpacing: "0.07em",
                              color: "var(--charcoal)",
                              display: "block",
                              marginBottom: "6px",
                            }}
                          >
                            Tipo de Evento
                          </label>
                          <select
                            value={newInvite.eventTypeId}
                            onChange={(e) =>
                              handleChangeEventType(e.target.value)
                            }
                            style={{
                              width: "100%",
                              padding: "10px 14px",
                              borderRadius: "8px",
                              border: "1.5px solid var(--gold-light)",
                              fontSize: "13px",
                              outline: "none",
                              fontFamily: "Inter, sans-serif",
                              boxSizing: "border-box",
                            }}
                          >
                            {eventTypes.map((et) => (
                              <option key={et.id} value={et.id}>
                                {et.nome}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Campos escolhidos pela irmã para este convite —
                          variam por tipo de evento, e até de convite para
                          convite. Não há nenhum campo fixo: tudo o que
                          aparece aqui (incluindo a Data do Evento, quando
                          o tipo de evento a tiver definida) pode ser
                          removido. */}
                      {camposActivosInfo.length > 0 ? (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "16px",
                          }}
                        >
                          {camposActivosInfo.map((field) => (
                            <div
                              key={field.id}
                              style={{ position: "relative" }}
                            >
                              <p
                                style={{
                                  fontSize: "10px",
                                  color: "var(--gray-mid)",
                                  margin: "0 0 2px 0",
                                }}
                              >
                                {field.stepTitle}
                              </p>
                              <button
                                type="button"
                                onClick={() => handleRemoveCampo(field.id)}
                                title="Remover campo"
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  right: 0,
                                  fontSize: "11px",
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  color: "var(--gray-mid)",
                                  padding: "2px 4px",
                                }}
                              >
                                ✕ remover
                              </button>
                              <FormField
                                field={{ ...field, required: false }}
                                value={newInvite.valores[field.id]}
                                onChange={(id, val) =>
                                  handleChangeValorCampo(id, val)
                                }
                                error={newInviteErrors[field.id]}
                                onClearError={(id) =>
                                  setNewInviteErrors((prev) => {
                                    const n = { ...prev };
                                    delete n[id];
                                    return n;
                                  })
                                }
                              />
                              {/* O aviso da disputa vive colado ao campo
                                  que lhe dá origem — por baixo da Data
                                  do Evento, e só quando há rivais. */}
                              {campoAncoraDisputa &&
                                field.id === campoAncoraDisputa.id &&
                                irmaosDia.length > 0 && (
                                  <AvisoDiaDisputado
                                    dataISO={dataEscolhida}
                                    irmaos={irmaosDia}
                                    estilo={{ marginTop: "8px" }}
                                  />
                                )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p
                          style={{
                            fontSize: "12px",
                            color: "var(--gray-mid)",
                            margin: 0,
                          }}
                        >
                          Ainda não escolheste nenhum campo — usa a busca em
                          baixo para adicionar o que quiseres preencher já.
                        </p>
                      )}
                    </div>

                    {/* Rodapé — fica sempre visível, mesmo que o corpo
                        acima tenha scroll */}
                    <div
                      style={{
                        padding: "16px 24px",
                        borderTop: "1px solid var(--gold-light)",
                        backgroundColor: "#FBF7EF",
                        borderRadius: "0 0 16px 16px",
                        flexShrink: 0,
                      }}
                    >
                      <div
                        id="tour-campo-seletor"
                        style={{ marginBottom: "14px" }}
                      >
                        <CampoSeletor
                          camposDisponiveis={camposDisponiveis}
                          onAdd={handleAddCampo}
                        />
                      </div>
                      {/* ⚠ CORRECÇÃO DE BUG 2/3 (a outra metade) — a casa
                          que faltava ao erro geral. O `geral` era escrito
                          em dois sítios e nunca desenhado em nenhum: o
                          painel só lia os erros POR CAMPO. Fica aqui, no
                          rodapé, ao lado do botão que falhou — e viaja com
                          o painel quando ele mudar de casa, em vez de
                          depender da barra de avisos do separador. */}
                      {newInviteErrors.geral && (
                        <p
                          style={{
                            fontSize: "12.5px",
                            color: "#B91C1C",
                            backgroundColor: "#FEF2F2",
                            border: "1px solid #FECACA",
                            borderRadius: "8px",
                            padding: "10px 12px",
                            margin: "0 0 12px",
                            lineHeight: 1.5,
                          }}
                        >
                          ⚠ {newInviteErrors.geral}
                        </p>
                      )}
                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          onClick={() => {
                            setShowNewInvite(false);
                            setNewInviteErrors({});
                            setEventoContexto(null);
                            setNewInvite((prev) => ({
                              ...prev,
                              submissionAlvoId: null,
                            }));
                          }}
                          style={{
                            padding: "10px 20px",
                            borderRadius: "8px",
                            fontSize: "13px",
                            border: "1.5px solid var(--gold-light)",
                            color: "var(--gray-mid)",
                            backgroundColor: "white",
                            cursor: "pointer",
                          }}
                        >
                          Cancelar
                        </button>
                        <button
                          id="tour-criar-convite"
                          onClick={handleCreateInvite}
                          disabled={creatingInvite}
                          style={{
                            padding: "10px 24px",
                            borderRadius: "8px",
                            fontSize: "13px",
                            fontWeight: "600",
                            cursor: "pointer",
                            backgroundColor: creatingInvite
                              ? "var(--gold-light)"
                              : "var(--gold)",
                            color: "white",
                            border: "none",
                          }}
                        >
                          {creatingInvite ? "A criar..." : "Criar Formulário"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
    </>
  );
}
