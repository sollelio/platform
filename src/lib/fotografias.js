import { supabase } from "./supabase";
import { comprimirFotoParaJpeg } from "./captacao";

// ============================================================
// fotografias.js — as fotografias do dia (fase 6).
//
// No dia da montagem alguém da equipa fotografa o espaço a ficar pronto, e
// a cliente vê-o horas antes de lá chegar. Depois do evento a mesma divisão
// muda de sentido: passa a ser memória.
//
// ⚠ O NOME DO FICHEIRO NÃO LEVA O ID DO EVENTO, nem nada derivável dele —
// `foto_{carimbo}_{aleatório}.jpg`, como as imagens de referência. A razão
// está escrita na migração 054: organizar os caminhos «por evento» é que
// exporia o id na página pública.
//
// ⚠ TUDO O QUE AQUI SE CARREGA É PARA A CLIENTE VER. Não há visibilidade
// por fotografia, de propósito: uma opção que se decide a cada carregamento
// é uma opção que vai ser ignorada ou enganada.
// ============================================================

const BALDE = "fotografias";

// Duas versões, e nenhuma delas é o ficheiro original. Uma fotografia de
// telemóvel são 3 a 5 MB e vai ser vista a 390px de largura, muitas vezes
// na rua e com dados móveis. A poupança é de mais de dez para um.
//
// PEQUENA serve a capa e o mosaico (a capa a 390 CSS px pede ~1000 reais
// num ecrã de três vezes); GRANDE serve a vista ampliada, com folga para
// aproximar com os dedos.
const LADO_PEQUENA = 1000;
const LADO_GRANDE = 1800;

// A BASE é UMA por fotografia, e as duas versões partilham-na
// (`{base}_p.jpg` / `{base}_g.jpg`). É o que permite apagar a grande a
// partir da pequena — com bases sorteadas à parte, o caminho derivado
// não existia e a versão grande ficava órfã no balde para sempre.
const nomeBase = () =>
  `foto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// O momento por omissão sai da data: carregada no dia do evento ou antes, é
// montagem; depois, é do evento. É só a omissão — o campo existe porque
// carregar as fotografias da montagem no dia seguinte não é o caso raro.
export const momentoPorOmissao = (dataEvento) => {
  if (!dataEvento) return "montagem";
  const hoje = new Date();
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  return hojeISO > String(dataEvento).slice(0, 10) ? "evento" : "montagem";
};

const enviar = async (blob, caminho) => {
  const { error } = await supabase.storage
    .from(BALDE)
    .upload(caminho, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(BALDE).getPublicUrl(caminho);
  return { caminho, url: data.publicUrl };
};

// Carrega UMA fotografia: comprime duas vezes, envia as duas, grava a linha.
// Devolve a linha criada.
export const carregarFotografia = async (eventoId, ficheiro, { momento, ordem = 0 } = {}) => {
  const [pequena, grande] = await Promise.all([
    comprimirFotoParaJpeg(ficheiro, LADO_PEQUENA),
    comprimirFotoParaJpeg(ficheiro, LADO_GRANDE),
  ]);
  const base = nomeBase();
  const [p, g] = await Promise.all([
    enviar(pequena, `${base}_p.jpg`),
    enviar(grande, `${base}_g.jpg`),
  ]);

  const { data: sessao } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("evento_fotografias")
    .insert({
      submission_id: eventoId,
      caminho: p.caminho,
      url_pequena: p.url,
      url_grande: g.url,
      momento: momento || "montagem",
      ordem,
      criado_por: sessao?.user?.id || null,
    })
    .select("id, url_pequena, url_grande, assunto, momento, ordem, criado_em, caminho, publicavel")
    .single();
  if (error) throw error;
  // O caminho da grande guarda-se junto, para a poder apagar com a linha.
  return { ...data, caminho_grande: g.caminho };
};

export const getFotografias = async (eventoId) => {
  const { data, error } = await supabase
    .from("evento_fotografias")
    .select("id, url_pequena, url_grande, assunto, momento, ordem, criado_em, caminho, publicavel")
    .eq("submission_id", eventoId)
    .order("ordem")
    .order("criado_em");
  if (error) throw error;
  return data || [];
};

// Apagar tira a linha E os ficheiros. Sem isto, apagar do ecrã deixava lixo
// no armazenamento para sempre — e ninguém volta lá para o limpar.
//
// A linha sai PRIMEIRO: se o apagar dos ficheiros falhar, fica um ficheiro
// órfão que ninguém vê. Pela ordem contrária ficava uma linha a apontar
// para uma imagem que já não existe, que é o que a cliente veria partida.
export const apagarFotografia = async (foto) => {
  const { error } = await supabase
    .from("evento_fotografias")
    .delete()
    .eq("id", foto.id);
  if (error) throw error;

  // O caminho da grande deriva-se do URL público — apanha também as
  // linhas antigas, cujos dois nomes NÃO partilham a base (as bases
  // eram sorteadas à parte antes desta correcção). A substituição do
  // sufixo fica como último recurso.
  const grandeDaUrl = (() => {
    try {
      const parte = String(foto.url_grande || "").split(`/${BALDE}/`)[1];
      return parte ? decodeURIComponent(parte.split("?")[0]) : null;
    } catch {
      return null;
    }
  })();
  const caminhos = [
    foto.caminho,
    grandeDaUrl || String(foto.caminho || "").replace(/_p\.jpg$/, "_g.jpg"),
  ].filter(Boolean);
  // A linha já saiu — um erro no ecrã diria que falhou o que a Nádia viu
  // desaparecer. Mas engolir em silêncio absoluto também não: fica rasto.
  try {
    const { error: erroFicheiros } = await supabase.storage
      .from(BALDE)
      .remove(caminhos);
    if (erroFicheiros) throw erroFicheiros;
  } catch (e) {
    console.warn("A linha saiu, mas ficaram ficheiros por apagar:", e);
  }
};

export const mudarFotografia = async (id, campos) => {
  const { error } = await supabase
    .from("evento_fotografias")
    .update(campos)
    .eq("id", id);
  if (error) throw error;
};

// Reordenar: grava a posição de todas de uma vez. A CAPA é a primeira — a
// casa escolhe-a, e a regra da casa é que seja a mais adiantada. O código
// não adivinha o que é «mais adiantada»; ela decide, arrastando.
export const reordenarFotografias = async (idsPorOrdem) => {
  // O supabase-js devolve { error } em vez de lançar — sem esta
  // verificação, uma ordem meio-gravada passava por sucesso e a capa da
  // cliente podia divergir da do ecrã em silêncio.
  const resultados = await Promise.all(
    idsPorOrdem.map((id, i) =>
      supabase.from("evento_fotografias").update({ ordem: i }).eq("id", id),
    ),
  );
  const falha = resultados.find((r) => r.error);
  if (falha) throw falha.error;
};
