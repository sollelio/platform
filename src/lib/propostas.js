import { supabase } from "./supabase";
import { otimizarImagem } from "./imagemOtimizada";

// ============================================================
// propostas.js — upload das imagens da PROPOSTA (as da Nádia:
// portefólio / visão para o evento). Bucket "propostas" (migração
// 014, INSERT só para autenticados).
// ============================================================

const BUCKET_PROPOSTAS = "propostas";

// Faz upload de uma imagem da proposta e devolve a URL pública.
export const uploadImagemProposta = async (file) => {
  if (!file) throw new Error("Nenhum ficheiro selecionado.");
  if (!file.type.startsWith("image/"))
    throw new Error("O ficheiro tem de ser uma imagem.");

  const { blob, tipo, extensao } = await otimizarImagem(file, { ladoMax: 1200 });
  const caminho = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extensao}`;

  const { error: errUpload } = await supabase.storage
    .from(BUCKET_PROPOSTAS)
    .upload(caminho, blob, {
      contentType: tipo,
      upsert: false,
    });
  if (errUpload) throw errUpload;

  const { data } = supabase.storage
    .from(BUCKET_PROPOSTAS)
    .getPublicUrl(caminho);
  return data.publicUrl;
};