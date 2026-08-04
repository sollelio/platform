import { supabase } from "./supabase";

// ============================================================
// mensagens.js — a biblioteca de mensagens-tipo da Nádia (Instagram).
// CRUD sobre a tabela mensagens_tipo (migração 015) + resolução dos
// {PLACEHOLDERS} com os dados de um evento (getDadosParaDocumento).
// ============================================================

// Lista as mensagens ativas, pela ordem definida.
export const getMensagens = async () => {
  const { data, error } = await supabase
    .from("mensagens_tipo")
    .select("*")
    .eq("ativo", true)
    .order("ordem");
  if (error) throw error;
  return data || [];
};

// Cria uma mensagem nova. A chave é gerada (única) — o seed da 015
// usa chaves fixas; as da Nádia usam um sufixo temporal.
export const createMensagem = async ({ titulo, corpo }) => {
  if (!titulo?.trim() || !corpo?.trim()) {
    throw new Error("Título e texto são obrigatórios.");
  }
  // próxima ordem no fim da lista
  const { data: ultimas, error: errOrdem } = await supabase
    .from("mensagens_tipo")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1);
  if (errOrdem) throw errOrdem;
  const proximaOrdem =
    ultimas && ultimas.length ? (ultimas[0].ordem || 0) + 1 : 1;

  const chave = `custom_${Date.now()}`;
  const { data, error } = await supabase
    .from("mensagens_tipo")
    .insert([
      { chave, titulo: titulo.trim(), corpo: corpo.trim(), ordem: proximaOrdem },
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Atualiza uma mensagem (whitelist — lição 3).
export const updateMensagem = async (id, campos) => {
  const permitidos = ["titulo", "corpo", "ordem", "ativo"];
  const patch = {};
  for (const k of permitidos) {
    if (k in campos) patch[k] = campos[k];
  }
  if (Object.keys(patch).length === 0) throw new Error("Nada para atualizar.");

  const { data, error } = await supabase
    .from("mensagens_tipo")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Remover = desativar (soft-delete, padrão da casa) — reversível na BD.
export const removerMensagem = async (id) => updateMensagem(id, { ativo: false });

// ---- Resolução de placeholders ----

// Formatadores locais (mínimos, para a lib não depender de componentes)
const dataPT = (iso) => {
  if (!iso) return null;
  const [a, m, d] = iso.split("-");
  if (!a || !m || !d) return iso;
  return `${d}/${m}/${a}`;
};

const euros = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (Number.isInteger(n)) return `${n}€`;
  return `${n.toFixed(2).replace(".", ",")}€`;
};

// Placeholders suportados (documentados na UI):
//   {NOME} {TIPO_EVENTO} {DATA} {VALOR} {SINAL} {LINK_INTERESSE} {LINK_FOLHA}
// Sem dados (ou sem evento), ficam "___" — a Nádia vê logo o que
// falta preencher à mão antes de enviar.
export const resolverMensagem = (corpo, dados = null) => {
  const valorNum =
    dados && dados.valor !== "" && dados.valor !== null && dados.valor !== undefined
      ? Number(dados.valor)
      : null;
  const temValor = valorNum !== null && Number.isFinite(valorNum);

  const mapa = {
    "{NOME}": dados?.nomeCliente || "___",
    "{TIPO_EVENTO}": dados?.tipoEvento || "___",
    "{DATA}": dataPT(dados?.dataEvento) || "___",
    "{VALOR}": temValor ? euros(valorNum) : "___",
    "{SINAL}": temValor ? euros(valorNum / 2) : "___",
    "{LINK_INTERESSE}": `${window.location.origin}/interesse`,
    // O endereço da folha de um comunicado (fase 2) — vem nos dados,
    // porque cada folha tem o seu; sem ele fica «___» como os restantes.
    "{LINK_FOLHA}": dados?.linkFolha || "___",
  };
  return Object.entries(mapa).reduce(
    (texto, [chave, valor]) => texto.split(chave).join(valor),
    corpo,
  );
};

// ============================================================
// linkWhatsApp — constrói o link wa.me com a mensagem pronta.
// Normalização: só dígitos; "00" inicial cai; 9 dígitos = número
// português → ganha o 351. Com indicativo já lá (>9 dígitos),
// respeita-se. Menos de 9 dígitos: não há link (devolve null).
// ============================================================
export const linkWhatsApp = (numero, texto = "") => {
  let d = String(numero || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9) d = `351${d}`;
  if (d.length < 9) return null;
  const query = texto ? `?text=${encodeURIComponent(texto)}` : "";
  return `https://wa.me/${d}${query}`;
};