import { supabase } from "./supabase";

// ============================================================
// avaliacao.js — a avaliação e a despedida (fase 7).
//
// O único momento de todo o portal em que é ELA que dá.
//
// ⚠ A FOTOGRAFIA VIAJA PELO URL, nunca pelo id da linha. O URL já é
// público — devolvê-lo não revela nada de novo. Mandar o id interno seria
// abrir uma porta que a casa fechou na 049.
//
// ⚠ GRAVAR A AVALIAÇÃO NÃO FECHA O ACESSO. Estava no plano e mudou: fechar
// a porta a quem acabou de dar uma frase e uma fotografia é o gesto errado
// no momento errado. O portal entra em despedida e vive até o prazo acabar.
// ============================================================

// O que se pergunta a ESTE evento: os eixos que saem dos serviços que ela
// contratou, as fotografias por onde escolhe a preferida, e o que já
// respondeu (se já respondeu).
//
// `convidada: false` quer dizer que ainda não passaram os três dias, ou que
// o evento não chegou a fechar — e aí o portal não fala do assunto.
export const verAvaliacao = async (token) => {
  const { data, error } = await supabase.rpc("dlm_portal_avaliacao", {
    p_token: token,
  });
  if (error) throw error;
  return data;
};

// Grava — ou actualiza, se ela mudar de ideias. O ecrã do obrigado promete-
// -lhe por escrito que sai do site no mesmo dia, e é esta função que torna
// essa promessa cumprível.
//
// `autorizar` é só sobre AS PALAVRAS. A fotografia não se lhe pergunta: se
// tiver convidados reconhecíveis, essas pessoas não consentiram, e a
// anfitriã não pode consentir por elas. Quem marca isso é a casa.
export const enviarAvaliacao = async (token, {
  frase, eixos, fotografia, autorizar, nomeComo,
}) => {
  const { data, error } = await supabase.rpc("dlm_portal_avaliar", {
    p_token: token,
    p_frase: frase || null,
    p_eixos: eixos || [],
    p_fotografia: fotografia || null,
    p_autorizar: !!autorizar,
    p_nome_como: nomeComo || "completo",
  });
  if (error) throw error;
  return data;
};

// ---------- O lado da Nádia ----------

// As avaliações que chegaram. Aqui não há véu nenhum: é registo de ofício,
// e ela precisa de ver tudo — incluindo as que ficaram só para a casa, que
// são as que dizem o que melhorar.
export const getAvaliacoes = async () => {
  const { data, error } = await supabase
    .from("avaliacoes")
    .select(
      "id, submission_id, frase, eixos, publicacao_autorizada, nome_como, criada_em, publicada_em, " +
        "evento_fotografias(url_pequena, url_grande, assunto, publicavel), " +
        // O nome vem de `clientes`, nunca de uma coluna de `submissions`:
        // `nome_cliente` é de `reservas` e não existe aqui.
        "submissions(data_evento, clientes(nome))",
    )
    .order("criada_em", { ascending: false });
  if (error) throw error;
  return data || [];
};

export const getAvaliacaoDoEvento = async (eventoId) => {
  const { data, error } = await supabase
    .from("avaliacoes")
    .select(
      "id, frase, eixos, publicacao_autorizada, nome_como, criada_em, publicada_em, " +
        "evento_fotografias(url_pequena, url_grande, assunto, publicavel)",
    )
    .eq("submission_id", eventoId)
    .maybeSingle();
  if (error) throw error;
  return data;
};

// Em que estado está a fotografia para efeitos de site. Decisão DA CASA —
// só quem lá esteve sabe se há convidados reconhecíveis, e a anfitriã não
// pode consentir por eles.
//
// TRÊS estados e não dois: «por rever» não é «com convidados». Dizer que é
// punha a página a afirmar à cliente uma coisa que ninguém verificou.
export const ESTADOS_FOTO = ["por_rever", "sem_convidados", "com_convidados"];

export const marcarEstadoDaFoto = async (fotografiaId, estado) => {
  if (!ESTADOS_FOTO.includes(estado)) throw new Error("Estado desconhecido");
  const { error } = await supabase
    .from("evento_fotografias")
    .update({ publicavel: estado })
    .eq("id", fotografiaId);
  if (error) throw error;
};

// ---------- O que o ecrã diz ----------

// O NOME NÃO SE CALCULA AQUI. A projecção já traz `nome_publicado` pronto
// (067) e é de propósito: fazer a conta no browser obrigava o servidor a
// mandar o nome inteiro, e quem escolheu «sem nome» ficava com ele a viajar
// na resposta na mesma. Duas implementações do mesmo nome também acabariam
// por divergir — esta era a que ia ficar para trás.

// Os eixos por responder ficam por responder, e não faz mal nenhum: é o
// desenho que o diz. Só se envia o que ela tocou.
//
// COM o mapa de eixos em mão, cada resposta leva o `rotulo` — é ele que
// o separador Avaliações mostra; sem rótulo gravado, a Nádia via chaves
// de máquina. O mapa dá também a ordem. Sem o segundo argumento (chamada
// antiga), o comportamento fica o de sempre: só chave e valor.
export const eixosRespondidos = (valores, eixos = []) => {
  const v = valores || {};
  if (Array.isArray(eixos) && eixos.length > 0) {
    return eixos
      .filter((e) => v[e.chave] !== null && v[e.chave] !== undefined)
      .map((e) => ({
        chave: e.chave,
        rotulo: e.rotulo,
        valor: Math.round(Number(v[e.chave])),
      }));
  }
  return Object.entries(v)
    .filter(([, x]) => x !== null && x !== undefined)
    .map(([chave, x]) => ({ chave, valor: Math.round(Number(x)) }));
};
