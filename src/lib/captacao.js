import { supabase } from "./supabase";
import { otimizarImagem } from "./imagemOtimizada";

// ============================================================
// captacao.js — a porta de entrada do funil.
// O interessado (ou a Nádia, a transcrever uma conversa de Instagram)
// preenche o formulário leve → nasce a PESSOA (clientes) + o EVENTO
// (submission) em fase "interessado".
//
// As respostas usam as chaves camelCase CANÓNICAS (nomeDoCliente,
// contactoPrincipal, localEvento, numeroConvidados, dataEvento...)
// para o drawer, o resumo e os documentos pré-preenchidos lerem tudo
// sem código novo (dupla fonte via getValorAtual).
// ============================================================

const BUCKET_REFERENCIAS = "referencias";
export const MAX_IMAGENS_REFERENCIA = 5;

const limpar = (v) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};

// Faz upload de uma imagem de referência e devolve a URL pública.
// A otimização é a do mecanismo único (imagemOtimizada.js): 1200px no
// lado maior chega de sobra para as vinhetas de inspiração.
export const uploadImagemReferencia = async (file) => {
  if (!file) throw new Error("Nenhum ficheiro selecionado.");
  if (!file.type.startsWith("image/"))
    throw new Error("O ficheiro tem de ser uma imagem.");

  const { blob, tipo, extensao } = await otimizarImagem(file, { ladoMax: 1200 });
  const caminho = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extensao}`;

  const { error: errUpload } = await supabase.storage
    .from(BUCKET_REFERENCIAS)
    .upload(caminho, blob, {
      contentType: tipo,
      upsert: false,
    });
  if (errUpload) throw errUpload;

  const { data } = supabase.storage
    .from(BUCKET_REFERENCIAS)
    .getPublicUrl(caminho);
  return data.publicUrl;
};

// ============================================================
// submeterCaptacao — cria cliente + evento em fase "interessado".
// Gémea da submeterQuestionario (clientes.js), mas para a captação.
//
// A CASA vem de fora, e é obrigatória do lado público (093): o slug
// chega pelo endereço (/interesse/:slug) e o Postgres resolve-o em
// tenant_por_slug(). Nunca se envia um uuid de casa daqui — um uuid
// vindo do browser é um pedido para escrever na casa alheia.
//
// tenantSlug null = modo interno: a Nádia cria o interessado a partir
// do admin, tem sessão, e a função cai no tenant_actual().
//
// O rollback manual desapareceu com a 093: o insert do cliente e o do
// evento passaram a viver na mesma transação dentro da função. Se o
// segundo falha, o primeiro desfaz-se sozinho — que é o que uma
// transação faz, e o que o código antigo imitava à mão.
//
// payload:
//   nome*                    — a pessoa (contacto é OPCIONAL: nos
//                              modais internos a conversa de Instagram
//                              já existe; o telemóvel é um bónus)
//   eventTypeId | tipoOutro  — o tipo (modelo existente OU texto livre)
//   dataEvento, numeroConvidados, local, servicos[], servicosBuffet[],
//   servicosBalcao[],
//   mensagem, ficheiros[]    — File[] de imagens de referência (máx 5)
// ============================================================
export const submeterCaptacao = async (payload, tenantSlug = null) => {
  const nome = limpar(payload.nome);
  const contacto = limpar(payload.contacto);
  if (!nome) throw new Error("O nome é obrigatório.");

  // 1) Upload das imagens de referência (antes de criar registos;
  //    se a submissão falhar, ficam órfãs no bucket — aceitável)
  const ficheiros = (payload.ficheiros || []).slice(
    0,
    MAX_IMAGENS_REFERENCIA,
  );
  const imagens = [];
  for (const f of ficheiros) {
    imagens.push(await uploadImagemReferencia(f));
  }

  // 2) As respostas nas chaves canónicas (o resto do sistema lê-as
  //    sem código novo)
  const respostas = { nomeDoCliente: nome };
  if (contacto) respostas.contactoPrincipal = contacto;
  const whatsapp = limpar(payload.whatsapp);
  if (whatsapp) respostas.numeroWhatsapp = whatsapp;
  const dataEvento = limpar(payload.dataEvento);
  if (dataEvento) respostas.dataEvento = dataEvento;
  const local = limpar(payload.local);
  if (local) respostas.localEvento = local;
  const tipoLocal = limpar(payload.tipoLocal);
  if (tipoLocal) respostas.tipoLocal = tipoLocal;
  const convidados = limpar(payload.numeroConvidados);
  if (convidados) respostas.numeroConvidados = convidados;
  const tipoOutro = limpar(payload.tipoOutro);
  if (tipoOutro) respostas.tipoEventoOutro = tipoOutro;
  // Serviços (a taxonomia nova) + pacote de buffet + tipo de balcão;
  // o "pretende" antigo continua aceite por retrocompatibilidade.
  if (Array.isArray(payload.servicos) && payload.servicos.length > 0) {
    respostas.servicos = payload.servicos;
  }
  if (
    Array.isArray(payload.servicosBuffet) &&
    payload.servicosBuffet.length > 0
  ) {
    respostas.servicosBuffet = payload.servicosBuffet;
  }
  if (
    Array.isArray(payload.servicosBalcao) &&
    payload.servicosBalcao.length > 0
  ) {
    respostas.servicosBalcao = payload.servicosBalcao;
  }
  if (Array.isArray(payload.pretende) && payload.pretende.length > 0) {
    respostas.pretende = payload.pretende;
  }
  const mensagem = limpar(payload.mensagem);
  if (mensagem) respostas.mensagemInicial = mensagem;
  if (imagens.length > 0) respostas.imagensReferencia = imagens;

  // 3) Dedupe, pessoa e evento numa transação só no Postgres.
  //
  //    O caminho antigo por passos (inserts directos em clientes e
  //    submissions) MORREU na 093 e não volta como fallback: a RLS
  //    por casa bloqueia-o, e um fallback que a política nega falha
  //    em silêncio — o pior modo de falhar. Erro é para lançar.
  //
  //    A resposta é projecção explícita — { id, duplicado,
  //    clienteReutilizado } — e não a linha inteira: a submissão tem
  //    56 colunas, incluindo morada e contactos, e o anon não tem
  //    nada que ver isso de volta.
  const rpc = await supabase.rpc("captacao_submeter", {
    p_payload: {
      nome,
      contacto,
      whatsapp: limpar(payload.whatsapp),
      dataEvento,
      numeroConvidados: convidados,
      eventTypeId: payload.eventTypeId || null,
      respostas,
    },
    p_tenant_slug: tenantSlug,
  });
  if (rpc.error) throw rpc.error;
  return rpc.data;
};

// Lê os tipos de evento para o select do formulário público.
//
// Passou a RPC na 093. Antes era um SELECT anónimo directo à tabela,
// que com mais do que uma casa mostrava os modelos de todas — e uma
// política de RLS não tem como saber de que casa é o pedido, porque o
// anon não traz identidade nenhuma. Só uma função sabe, porque recebe
// o slug como argumento.
//
// A projecção é mínima: id e nome. Os `steps` NÃO saem — são o desenho
// do formulário da casa, e escolher um tipo não precisa deles.
//
// Sem slug devolve [] e o formulário degrada para texto livre, tal
// como degradava quando a política falhava.
export const getTiposParaCaptacao = async (tenantSlug) => {
  if (!tenantSlug) return [];
  const { data, error } = await supabase.rpc("tipos_de_evento_publicos", {
    p_tenant_slug: tenantSlug,
  });
  if (error) {
    console.error("Sem tipos de evento para", tenantSlug, error);
    return [];
  }
  return data || [];
};

// Os MESMOS tipos, pela porta de DENTRO — o modo interno, a casa a
// registar um pedido no próprio admin. Aqui não há slug nem faz
// falta: a sessão é autenticada e a RLS por casa (091) entrega só os
// modelos da casa da sessão — o padrão das outras leituras do admin
// (invites, comunicados). Mesma projecção e mesma ordem que a porta
// pública: as duas portas têm de mostrar a mesma lista.
//
// Nasceu de uma regressão da 093: a porta pública passou a exigir
// slug, o modo interno não tem nenhum, e o select dos tipos
// desapareceu em silêncio — o formulário degradava para texto livre
// e o pedido interno ficava sem modelo (eventTypeId a null).
//
// ⚠ 108: com duas memberships isto devolve os modelos das duas casas
// misturados. Quando a casa vier do endereço, este sítio passa a
// filtrar pela casa pedida (pendência registada no desenho da 108).
export const getTiposParaCaptacaoInterna = async () => {
  const { data, error } = await supabase
    .from("event_types")
    .select("id, nome")
    .order("nome");
  // Como na porta pública: sem tipos o formulário degrada para texto
  // livre — a leitura nunca trava um pedido.
  if (error) {
    console.error("Sem tipos de evento no modo interno", error);
    return [];
  }
  return data || [];
};