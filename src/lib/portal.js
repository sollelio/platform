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
// ⚠ ESTA TABELA ESTÁ TAMBÉM NO `docs/glossario.md`, que é a fonte única.
// Se mudares um rótulo aqui, muda lá primeiro.
//
// Nota sobre a etapa 1: a chave da base é 'interessada', no feminino. O
// rótulo descreve o GESTO de quem chega — «O seu pedido», o nome que o
// glossário dá a esse gesto — e resolve de caminho a exclusão que o
// glossário assinala na pendência #2, sem esperar pela decisão de
// renomear a chave.
export const ROTULO_ETAPA = {
  interessada: "O seu pedido",
  orcamento: "O orçamento",
  sinal: "A data reservada",
  projecto: "O projecto",
  contrato: "O contrato",
  preparacao: "A preparação",
  grande_dia: "O grande dia",
};

// ---------- O que se diz de cada etapa ----------
//
// Duas vozes por etapa, porque o ecrã mostra sempre duas:
//   AGORA  — quando é a etapa em que o evento está («Onde estamos agora»)
//   SEGUIR — quando é a etapa que se avizinha («A seguir»)
//
// A mesma etapa lê-se ao contrário conforme o lado do tempo em que está:
// «A sua mesa já está desenhada» vs. «Vamos desenhar a sua mesa consigo».
export const TEXTO_AGORA = {
  interessada: "O seu pedido chegou até nós e já tem um evento com o seu nome.",
  orcamento: "Já tem em mãos os valores da sua mesa. Sem pressa para decidir.",
  sinal: "A data ficou sua. Ninguém mais a leva.",
  projecto: "A sua mesa já está desenhada — cores, louça, flores, o cenário todo.",
  contrato: "Está tudo escrito e assinado, do seu lado e do nosso.",
  preparacao: "A casa já está em marcha: compras feitas, listas fechadas, tudo a caminho.",
  grande_dia: "É hoje.",
};

export const TEXTO_SEGUIR = {
  orcamento: "Estamos a prepará-lo. Assim que estiver pronto, aparece aqui e receberá um aviso.",
  sinal: "Está tudo pronto do nosso lado. É o passo que guarda a data.",
  projecto: "Vamos desenhar a sua mesa consigo: cores, louça, flores, o cenário todo.",
  contrato: "Passamos a escrito o que ficou combinado, para não haver dúvidas.",
  preparacao: "A casa põe-se em marcha: compras, listas e a montagem ao detalhe.",
  grande_dia: "Chegamos cedo, pomos a mesa e só saímos quando estiver tudo no sítio.",
};

// O desenho previu a véspera e o próprio dia, não o dia seguinte. Sem esta
// linha, um evento já passado ficava a dizer «É hoje.» para sempre.
export const TEXTO_GRANDE_DIA_PASSADO = "Foi um gosto pôr a sua mesa.";

// A frase de cerimónia da casa: Playfair REDONDO, sem aspas — o itálico e
// as «» ficam reservados, juntos, para a fala de uma pessoa com nome.
export const FRASE_DE_CERIMONIA = "Já começou. Daqui até ao dia, o caminho é connosco.";

// Sem data marcada, a frase de cima prometia «daqui até ao dia» duas
// linhas abaixo de a âncora dizer «ainda por marcar» — falava de um dia
// que não existe. Esta mantém os dois tempos do original (já começou · nós
// tratamos) e nomeia o que falta sem repetir as palavras da âncora.
//
// Não explica que a página se actualiza, de propósito: isso é trabalho do
// cartão «a seguir», não de uma linha de cerimónia.
export const FRASE_DE_CERIMONIA_SEM_DATA =
  "Já começou. Falta marcar o dia — e a partir daí, o caminho é connosco.";

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

// A porta VIVA de um evento, ou null se não houver nenhuma. Vai à tabela
// directamente porque a RLS já a fecha ao público (só `authenticated`
// lê), e porque a RPC de leitura precisa de um token que aqui ainda não
// existe.
//
// ⚠ NÃO usar `dlm_portal_ver` para pré-visualizar do lado do backoffice:
// essa função INCREMENTA `n_acessos` e carimba `ultimo_acesso_em`. Uma
// espreitadela da Nádia passaria a contar como visita da cliente, e o
// sinal de vida — a única coisa que lhe diz se vale a pena insistir —
// deixava de valer nada.
export const getAcessoDoEvento = async (eventoId) => {
  const { data, error } = await supabase
    .from("portal_acessos")
    .select("token, criado_em, expira_em, ultimo_acesso_em, n_acessos")
    .eq("submission_id", eventoId)
    .is("revogado_em", null)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

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

// O endereço a partilhar. Único sítio onde o caminho se escreve — se o
// slug mudar, muda aqui (e o antigo passa a redirecionar, regra da casa
// para slugs já circulados).
//
// «acompanhar» e não «portal»: portal é a palavra que usamos entre nós, e
// a cortina fala à cliente em «o acompanhamento». Nenhuma ligação tinha
// sido partilhada quando isto mudou, por isso não ficou slug antigo a
// redirecionar.
export const enderecoDoPortal = (token) =>
  `${window.location.origin}/acompanhar/${token}`;
