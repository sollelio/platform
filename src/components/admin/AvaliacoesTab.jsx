import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAvaliacoes } from "../../lib/avaliacao";
import { Esqueleto } from "./acabamento";

// ============================================================
// AvaliacoesTab — o que as clientes escreveram (fase 7).
//
// Registo de OFÍCIO, não vitrina: sem Playfair, sem cerimónia, sem
// movimento. É a bancada onde ela lê o que chegou e decide o que um dia
// vai para o site.
//
// ⚠ AQUI NÃO HÁ VÉU. Mostra-se tudo, incluindo as que ficaram só para a
// casa — são precisamente essas que dizem o que melhorar, e são as que uma
// vista «só as publicáveis» esconderia.
//
// PUBLICAR NO SITE fica de fora de propósito: o site está em reconstrução e
// ainda não há para onde publicar. `publicada_em` existe e fica por
// preencher — a ponte faz-se quando o site existir.
// ============================================================

const overline = {
  fontSize: "10px",
  fontWeight: "700",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--gold-dark)",
  margin: 0,
};

const dataHora = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" })} às ${d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`;
};

const ROTULO_NOME = {
  completo: "nome completo",
  primeiro: "só o primeiro nome",
  anonimo: "sem nome",
};

// Estas cores pintam texto DENTRO da Pastilha, cujo fundo #FBF9F4 está
// fora da paleta: o par inteiro fica literal — pastilha clara com letra
// escura nos dois modos (o var(--gray-mid) fixa-se no claro #6B6B6B,
// senão era letra clara sobre fundo claro no escuro). O castanho
// #9C5A3C também não tem token; segue tudo no relatório.
const ESTADO_FOTO = {
  por_rever: { texto: "por rever", cor: "#6B6B6B" },
  sem_convidados: { texto: "pode ir para o site", cor: "#166534" },
  com_convidados: { texto: "com convidados — fica cá", cor: "#9C5A3C" },
};

export default function AvaliacoesTab() {
  const [lista, setLista] = useState([]);
  const [estado, setEstado] = useState("a-carregar");

  useEffect(() => {
    let cancelado = false;
    getAvaliacoes()
      .then((l) => {
        if (cancelado) return;
        setLista(l);
        setEstado("pronto");
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado) setEstado("erro");
      });
    return () => {
      cancelado = true;
    };
  }, []);

  if (estado === "a-carregar") {
    // A forma do que vem — três cartões empilhados —, não uma frase.
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          maxWidth: "820px",
        }}
      >
        {[0, 1, 2].map((i) => (
          <Esqueleto key={i} h={120} r={12} />
        ))}
      </div>
    );
  }

  if (estado === "erro") {
    return (
      <p style={{ fontSize: "13px", color: "var(--perigo-texto)" }}>
        Não foi possível carregar as avaliações. Recarregue a página.
      </p>
    );
  }

  return (
    <div>
      <p style={overline}>Avaliações</p>
      <p style={{ fontSize: "13px", lineHeight: 1.7, color: "var(--gray-mid)", margin: "8px 0 0", maxWidth: "62ch" }}>
        O que as clientes escreveram depois do evento. Aparecem todas — as que
        autorizaram publicação e as que ficaram só para a casa, que são as que
        dizem o que melhorar.
      </p>

      {lista.length === 0 ? (
        <p
          style={{
            // O lavado #FBF9F4 está fora da paleta: o par fica literal,
            // com o var(--gray-mid) fixado no claro #6B6B6B — senão era
            // letra clara sobre fundo claro no escuro. Vai no relatório.
            fontSize: "12.5px", lineHeight: 1.7, color: "#6B6B6B",
            margin: "22px 0 0", padding: "16px 18px",
            backgroundColor: "#FBF9F4",
            border: "1px solid var(--borda)",
            borderRadius: "10px", maxWidth: "62ch",
          }}
        >
          Ainda não chegou nenhuma. O convite aparece à cliente três dias
          depois do evento, e só a quem fechou negócio.
        </p>
      ) : (
        <div style={{ marginTop: "22px", display: "flex", flexDirection: "column", gap: "14px", maxWidth: "820px" }}>
          {lista.map((a) => {
            const foto = a.evento_fotografias;
            const estadoFoto = foto ? ESTADO_FOTO[foto.publicavel] : null;
            return (
              <div
                key={a.id}
                style={{
                  border: "1px solid var(--borda)",
                  borderRadius: "12px",
                  backgroundColor: "var(--superficie)",
                  padding: "16px 18px",
                  display: "flex",
                  gap: "16px",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                }}
              >
                {foto && (
                  <img
                    src={foto.url_pequena}
                    alt={foto.assunto || "A preferida da cliente"}
                    style={{
                      width: "110px", height: "110px", objectFit: "cover",
                      borderRadius: "8px", flexShrink: 0,
                      border: "1px solid var(--borda)",
                    }}
                  />
                )}

                <div style={{ flex: 1, minWidth: "260px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--charcoal)" }}>
                      {a.submissions?.clientes?.nome || "Sem nome de contacto"}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--gray-mid)" }}>
                      {dataHora(a.criada_em)}
                    </span>
                  </div>

                  {a.frase ? (
                    <p style={{ fontSize: "13.5px", lineHeight: 1.7, color: "var(--charcoal)", margin: "9px 0 0", whiteSpace: "pre-wrap" }}>
                      {a.frase}
                    </p>
                  ) : (
                    <p style={{ fontSize: "12.5px", lineHeight: 1.6, color: "var(--gray-mid)", margin: "9px 0 0", fontStyle: "italic" }}>
                      Passou a frase à frente — só respondeu às linhas.
                    </p>
                  )}

                  {/* Os eixos, com a barra a dizer a posição. Sem números
                      aqui também: o que se pediu foi uma impressão, e
                      pô-la em percentagem dava-lhe uma precisão que não tem. */}
                  {Array.isArray(a.eixos) && a.eixos.length > 0 && (
                    <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "7px" }}>
                      {a.eixos.map((e) => (
                        <div key={e.chave} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontSize: "11.5px", color: "var(--gray-mid)", width: "160px", flexShrink: 0 }}>
                            {e.rotulo || e.chave}
                          </span>
                          <span style={{ position: "relative", flex: 1, height: "4px", backgroundColor: "var(--borda)", borderRadius: "999px", minWidth: "80px" }}>
                            <span
                              style={{
                                position: "absolute", top: 0, left: 0, height: "4px",
                                width: `${Math.max(0, Math.min(100, Number(e.valor) || 0))}%`,
                                backgroundColor: "var(--gold)", borderRadius: "999px",
                              }}
                            />
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "13px", alignItems: "center" }}>
                    <Pastilha
                      // Par da Pastilha (fundo #FBF9F4 fora da paleta):
                      // literal, com o gray-mid fixado no claro #6B6B6B.
                      cor={a.publicacao_autorizada ? "#166534" : "#6B6B6B"}
                      texto={
                        a.publicacao_autorizada
                          ? `Autorizou publicação · ${ROTULO_NOME[a.nome_como] || a.nome_como}`
                          : "Fica só para a casa"
                      }
                    />
                    {estadoFoto && (
                      <Pastilha cor={estadoFoto.cor} texto={`Fotografia: ${estadoFoto.texto}`} />
                    )}
                    <span style={{ flex: 1 }} />
                    {/* A etiqueta diz o gesto que a ligação faz: com
                        fotografia, vai rever-se a aba Fotografias (é lá
                        que se marca «pode ir para o site»); sem ela, a
                        ligação abre mesmo o evento. */}
                    <Link
                      to={
                        foto
                          ? `/evento/${a.submission_id}/fotografias`
                          : `/evento/${a.submission_id}`
                      }
                      style={{
                        fontSize: "12px", color: "var(--gold-dark)",
                        textDecoration: "none",
                        borderBottom: "1px solid var(--gold-light)",
                        paddingBottom: "2px",
                      }}
                    >
                      {foto ? "Rever as fotografias →" : "Abrir o evento →"}
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Pastilha({ cor, texto }) {
  return (
    <span
      style={{
        fontSize: "11px", lineHeight: 1.6, color: cor,
        border: `1px solid var(--borda)`,
        borderRadius: "999px", padding: "3px 10px",
        // fora da paleta — o par (ver ESTADO_FOTO) fica literal
        backgroundColor: "#FBF9F4",
      }}
    >
      {texto}
    </span>
  );
}
