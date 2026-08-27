// ============================================================
// identidadeCasa.js — as portas por onde a casa se conhece.
//
// A 097 pôs a identidade na tabela `tenants`; a 098 abriu as portas.
// Aqui fica o lado de cá: uma função por porta, cada uma a dizer o
// que tem na mão.
//
// PORQUÊ UMA POR PORTA, e não uma que adivinhe: a página SABE o que
// tem — a PortalPage tem um token de portal, a ComunicadoPage um de
// comunicado. Uma função que aceitasse os três e tentasse por ordem
// seria a mesma "porta que adivinha" que o resto do sistema evita, e
// devolveria a casa errada ao primeiro token que coincidisse por
// acaso.
//
// A identidade NÃO é segredo — são os dados que a casa imprime nas
// folhas que entrega. O que se protege é o contrário: que a casa
// errada apareça. Por isso nenhuma porta adivinha.
//
// A 100 mudou a FORMA da resposta: as portas devolvem {estado, casa} e
// dizem o que sabem, em vez de um objecto ou null. Aqui traduz-se isso
// nas respostas que o lado de cá precisa de distinguir.
// ============================================================

import { supabase } from "./supabase";
import { comOrganizacao } from "./identidadeBackoffice";

// ---------- As respostas ----------
// Duas vêm da base desde a 100: «conhecida», com a casa dentro, e
// «desconhecida», que é resposta legítima e não falha — a porta
// perguntou e não há casa nenhuma naquele endereço.
//
// A 108 trouxe a terceira, e só a porta do backoffice a dá:
// «suspensa» — a casa é de quem pergunta, mas está fechada. Vem COM a
// identidade dentro, de propósito: o ecrã que explica precisa de dizer
// de quem é a casa que parou. É o contrário da desconhecida, que não
// veste nada.
//
// A última é nossa: quando a pergunta não chega ao fim, não há
// resposta. Antes da 100 as três chegavam como o mesmo `null` e a
// distinção morria neste ficheiro — e «não há casa» e «não deu para
// perguntar» pedem coisas opostas, porque uma delas apaga a marca.
const SEM_RESPOSTA = { estado: "sem-resposta" };

const pedir = async (rpc, args) => {
  try {
    const { data, error } = await supabase.rpc(rpc, args);
    if (error) throw error;
    if (data?.estado === "conhecida" && data.casa)
      return { estado: "conhecida", casa: data.casa };
    if (data?.estado === "suspensa" && data.casa)
      return { estado: "suspensa", casa: data.casa };
    if (data?.estado === "desconhecida") return { estado: "desconhecida" };
    // Um envelope que não se reconhece é uma porta por migrar, não uma
    // casa que não existe. Cai em «sem resposta» de propósito: apagar a
    // marca por causa de uma forma inesperada seria destruir justamente
    // o que se está a tentar proteger.
    console.error(`identidade (${rpc}): resposta de forma inesperada`, data);
    return SEM_RESPOSTA;
  } catch (e) {
    console.error(`identidade (${rpc}):`, e);
    return SEM_RESPOSTA;
  }
};

// Sem chave não se perguntou — e não perguntar não é ouvir «não há
// casa». O formulário aberto sem ?codigo= vive aqui.
const naoPerguntado = () => Promise.resolve(SEM_RESPOSTA);

// O pedido de orçamento — a única porta sem registo de onde deduzir a
// casa. O slug vem do endereço (/interesse/:slug).
export const casaPorSlug = (slug) =>
  slug
    ? pedir("identidade_da_casa_por_slug", { p_slug: slug })
    : naoPerguntado();

// O portal do noivo, a folha de comunicado, a campanha. A 098 aceita
// os três num coalesce; passar por aqui mantém o front honesto sobre
// qual é qual, e prepara o dia em que a 098 se partir em três.
export const casaPorTokenDePortal = (token) =>
  token
    ? pedir("identidade_por_token", { p_token: token })
    : naoPerguntado();

export const casaPorTokenDeComunicado = (token) =>
  token
    ? pedir("identidade_por_token", { p_token: token })
    : naoPerguntado();

export const casaPorTokenDeCampanha = (token) =>
  token
    ? pedir("identidade_por_token", { p_token: token })
    : naoPerguntado();

// O formulário de convite — a casa vem da linha do convite, não do
// prefixo do código (ler o prefixo seria confiar no formato).
export const casaPorCodigo = (codigo) =>
  codigo
    ? pedir("identidade_por_codigo", { p_codigo: codigo })
    : naoPerguntado();

// O backoffice. A casa vem do ENDEREÇO (108) — a sessão já não a
// escolhe, só confirma que é de quem entrou.
//
// A porta antiga (`identidade_da_minha_casa()` sem argumentos) lia a
// membership mais antiga e devolvia-a como se fosse «a» casa. Com uma
// membership por pessoa acertava sempre; com duas, escolhia — em
// silêncio, que é o modo de falhar que a 108 veio fechar.
//
// Sem slug não se pergunta: é o /admin antigo, ainda a caminho da casa
// certa, e uma pergunta sem endereço voltaria a pedir à base que
// adivinhasse.
// O id da organização vem SÓ por aqui — e por isso não vai em nenhuma
// das portas acima. `tenant_do_pedido` confirma o slug contra a
// membership de quem pergunta e devolve NULL se a casa não existir,
// estiver suspensa, ou não for dele: o endereço sozinho nunca
// autoriza nada. A pergunta é separada, e não uma alteração à
// identidade, precisamente para a projecção pública ficar intacta.
const organizacaoDaCasa = async (slug) => {
  try {
    const { data, error } = await supabase.rpc("tenant_do_pedido", {
      p_slug: slug,
    });
    if (error) throw error;
    return data ?? null;
  } catch (e) {
    // Falha fechada: a identidade segue sem id, o backoffice legado não
    // dá por nada, e a Equipa fica escondida em vez de meio aberta.
    console.error("identidade (tenant_do_pedido):", e);
    return null;
  }
};

export const casaDoBackoffice = async (slug) => {
  if (!slug) return naoPerguntado();
  const resposta = await pedir("identidade_da_minha_casa", { p_slug: slug });
  // Só se pergunta o id quando há casa conhecida para o vestir: uma
  // suspensa ou desconhecida sai daqui exactamente como entrou.
  if (resposta.estado !== "conhecida") return resposta;
  return comOrganizacao(resposta, await organizacaoDaCasa(slug));
};

// ---------- As casas de quem entrou ----------
// Só para o redirect dos endereços antigos: uma casa → vai-se para
// lá; mais do que uma → o redirect não adivinha, e a escolha faz-se
// por navegação (nunca por seletor persistente — a casa activa
// invisível é o problema que a 108 resolve).
//
// TRÊS respostas outra vez, e pela mesma razão: `null` é «não deu para
// perguntar», `[]` é «esta conta não tem casa nenhuma», e uma lista é
// uma lista. Um `[]` a fazer de falha mandaria quem entrou para o ecrã
// errado sempre que a rede tossisse.
export const asMinhasCasas = async () => {
  try {
    const { data, error } = await supabase.rpc("as_minhas_casas");
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("identidade (as_minhas_casas):", e);
    return null;
  }
};
