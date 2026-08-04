import { supabase } from "./supabase";

// ============================================================
// comunicados.js — a camada de dados dos comunicados (migração 079).
//
// A FOLHA de um comunicado: uma página com endereço próprio, pública e
// reencaminhável, sem um único dado pessoal. A equipa lê e escreve a
// tabela directamente (é o que a RLS lhe dá); publicar e retirar passam
// pelas RPCs; a leitura pública é a dlm_comunicado_ver — que este
// ficheiro NÃO chama de propósito: está concedida só ao anon, porque
// conta uma leitura de cada vez que corre. A pré-visualização do
// backoffice lê a tabela, nunca a porta pública.
//
// Vocabulário (glossário): RETIRAR uma folha (pública) não é REVOGAR um
// acesso (pessoal, o portal). Actos diferentes, objectos diferentes.
// ============================================================

// Lista os comunicados, os mais recentes primeiro. A ordenação fina
// (por publicar à cabeça) é da lista no ecrã — regra de desenho, não de
// dados.
export const listarComunicados = async () => {
  const { data, error } = await supabase
    .from("comunicados")
    .select("id, titulo, subtitulo, blocos, token, publicado_em, retirado_em, expira_em, n_acessos, created_at, actualizado_em")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

export const getComunicado = async (id) => {
  const { data, error } = await supabase
    .from("comunicados")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
};

// Nasce vazio, com um bloco em branco à espera — o editor abre logo
// com onde escrever. O id do bloco gera-se aqui, no cliente, e nunca
// mais se regenera (a lição do EventTypeEditor).
export const criarComunicado = async () => {
  const { data, error } = await supabase
    .from("comunicados")
    .insert([{ titulo: "", blocos: [{ id: idDeBloco(), rotulo: "", texto: "" }] }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Atualiza uma folha (whitelist — lição 3, o molde do updateMensagem).
export const guardarComunicado = async (id, campos) => {
  const permitidos = ["titulo", "subtitulo", "blocos", "mensagem", "expira_em"];
  const patch = {};
  for (const k of permitidos) {
    if (k in campos) patch[k] = campos[k];
  }
  if (Object.keys(patch).length === 0) throw new Error("Nada para atualizar.");
  patch.actualizado_em = new Date().toISOString();

  const { data, error } = await supabase
    .from("comunicados")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Publicar dá (ou volta a dar) o endereço; a RPC devolve o token — o
// MESMO de antes se a folha já teve um, porque o endereço é a
// identidade da folha.
export const publicarComunicado = async (id) => {
  const { data, error } = await supabase.rpc("dlm_comunicado_publicar", {
    p_id: id,
  });
  if (error) throw error;
  return data;
};

export const retirarComunicado = async (id) => {
  const { error } = await supabase.rpc("dlm_comunicado_retirar", {
    p_id: id,
  });
  if (error) throw error;
};

// O endereço completo da folha, a partir de onde a app está a correr —
// em teste dá o endereço de teste, em produção o real.
export const enderecoDoComunicado = (token) =>
  `${window.location.origin}/comunicado/${token}`;

// Um id de bloco novo: curto, único o suficiente para uma folha, e
// gerado no cliente — como o brief manda.
export const idDeBloco = () =>
  `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ------------------------------------------------------------
// comporFolha — o papel de cada bloco, derivado.
//
// O editor guarda blocos {id, rotulo, texto} sem tipo nenhum; é a
// posição e o conteúdo que dizem o que cada um é NA FOLHA (a regra que
// o Design fixou, escrita na própria linha de instrução do editor):
//   · só texto           → prosa
//   · só rótulo          → abre um grupo (separador com filete)
//   · rótulo + texto     → cláusula, numerada em romano
//   · o 1.º com ambos    → a nota em destaque (não é cláusula)
//   · o último com ambos → o remate (não é cláusula)
//
// Vive aqui, e não no componente, porque há DUAS folhas a compor — a
// pré-visualização do editor e a página pública — e uma regra com duas
// cópias é uma regra com duas versões.
//
// Na prosa, uma primeira linha curta terminada em vírgula é a saudação
// («Queridos noivos,») e leva o tratamento de cerimónia — é assim que a
// folha do Design abre, sem pedir um campo a mais a quem escreve.
// ------------------------------------------------------------
const ROMANOS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
export const romano = (n) => ROMANOS[n - 1] || String(n);

export const comporFolha = (blocos) => {
  const lista = Array.isArray(blocos) ? blocos : [];
  const comAmbos = lista.filter((b) => b.rotulo?.trim() && b.texto?.trim());
  const notaId = comAmbos.length ? comAmbos[0].id : null;
  const ultimo = lista[lista.length - 1];
  const remateId =
    ultimo && ultimo.rotulo?.trim() && ultimo.texto?.trim() && ultimo.id !== notaId
      ? ultimo.id
      : null;

  let n = 0;
  return lista.map((b) => {
    const rotulo = (b.rotulo || "").trim();
    const texto = (b.texto || "").trim();
    if (!rotulo && !texto) return { id: b.id, papel: "vazio", rotulo, texto };
    if (b.id === notaId) return { id: b.id, papel: "nota", rotulo, texto };
    if (b.id === remateId) return { id: b.id, papel: "remate", rotulo, texto };
    if (!rotulo) {
      // A saudação: primeira linha curta a acabar em vírgula.
      const linhas = texto.split("\n");
      const primeira = linhas[0].trim();
      const saudacao =
        primeira.endsWith(",") && primeira.length <= 60 && linhas.length > 1
          ? primeira
          : null;
      const resto = saudacao ? linhas.slice(1).join("\n").trim() : texto;
      return { id: b.id, papel: "prosa", rotulo, texto: resto, saudacao };
    }
    if (!texto) return { id: b.id, papel: "grupo", rotulo, texto };
    n += 1;
    return { id: b.id, papel: "clausula", rotulo, texto, num: romano(n) };
  });
};
