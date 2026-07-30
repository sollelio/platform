import { supabase } from "./supabase";

// ============================================================
// portal.js — a camada de dados do Portal do Cliente (migrações 049–052).
//
// Três chamadas, dois públicos:
//   · getPortal(token)         — ANÓNIMA. A leitura da vitrina.
//   · abrirPortal(eventoId)    — só autenticada. Abre (ou devolve) a porta.
//   · revogarPortal(eventoId)  — só autenticada. Fecha a porta.
//
// 🔴 O RPC devolve uma PROJECÇÃO EXPLÍCITA e o id do evento NUNCA sai.
// Não acrescentes campos do lado de cá: acrescentam-se na migração, onde
// cada campo que sai é uma decisão consciente e revisível. Se precisares
// de mais um dado no portal, é SQL, não JavaScript.
// ============================================================

// ---------- Os rótulos ----------
//
// Vivem AQUI, e não na base, por decisão da migração 050: com o rótulo no
// servidor era preciso uma migração para mudar uma palavra que uma pessoa
// lê. É a regra de ouro do glossário — «os nomes que as pessoas leem podem
// mudar; os nomes que a máquina usa ficam quietos».
//
// ⚠ TEXTO PROVISÓRIO, à espera do mockup da vitrina. Está tudo num sítio
// só de propósito: mudar qualquer um destes é uma linha.
//
// Nota sobre a etapa 1: a chave da base é 'interessada', no feminino. O
// rótulo descreve o MOMENTO e não a pessoa («O primeiro contacto»), o que
// resolve aqui a exclusão que o glossário assinala na pendência #2 — sem
// esperar pela decisão de renomear a chave.
export const ROTULO_ETAPA = {
  interessada: "O primeiro contacto",
  orcamento: "O orçamento",
  sinal: "A data reservada",
  projecto: "O projecto",
  contrato: "O contrato",
  preparacao: "A preparação",
  grande_dia: "O grande dia",
};

// Os três estados que o RPC devolve por etapa. `feito_sem_data` existe
// porque metade dos carimbos é marcada à mão pela Nádia, e a ausência de
// uma marcação nunca prova a ausência do facto.
export const ETAPA_POR_ACONTECER = "por_acontecer";
export const ETAPA_FEITA_SEM_DATA = "feito_sem_data";
export const ETAPA_FEITA_DATADA = "feito_datado";

// ---------- A leitura pública ----------

// Devolve o objecto da RPC:
//   { estado: 'terminado' }                       → link morto/revogado/expirado
//   { estado: 'activo', evento: {…}, jornada: […] }
//
// Inexistente, revogado e expirado devolvem TODOS 'terminado', de
// propósito: não se confirma nem se desmente a existência de um token.
export const getPortal = async (token) => {
  const { data, error } = await supabase.rpc("dlm_portal_ver", {
    p_token: token,
  });
  if (error) throw error;
  return data || null;
};

// ---------- A porta, do lado da Nádia ----------

// Devolve o token. Se já houver acesso vivo, devolve esse — nunca cria
// dois (há um índice único parcial na base a garanti-lo).
export const abrirPortal = async (eventoId) => {
  const { data, error } = await supabase.rpc("dlm_portal_abrir", {
    p_submission_id: eventoId,
  });
  if (error) throw error;
  return data || null;
};

// Motivos aceites pela base: 'avaliado' | 'prazo' | 'manual'.
export const revogarPortal = async (eventoId, motivo = "manual") => {
  const { error } = await supabase.rpc("dlm_portal_revogar", {
    p_submission_id: eventoId,
    p_motivo: motivo,
  });
  if (error) throw error;
};

// O endereço a partilhar. Único sítio onde o caminho do portal se escreve
// — se o slug mudar, muda aqui (e o antigo passa a redirecionar, regra da
// casa para slugs já circulados).
export const enderecoDoPortal = (token) =>
  `${window.location.origin}/portal/${token}`;
