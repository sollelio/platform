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
// 108 · O MODO INTERNO TAMBÉM MANDA O SLUG. Mandava `null`, e a função
// caía no `tenant_actual()` — que com duas memberships escolhia a casa
// mais antiga em silêncio, e o interessado nascia na casa errada. Agora
// o slug vem da rota do backoffice (/admin/:casa/…) e o servidor
// confirma-o contra a membership: CASA_ERRADA se não for de quem pede.
//
// Um `null` que ainda chegue aqui já não escolhe casa nenhuma — para em
// CASA_AMBIGUA. É a conversão que a 108 fez por toda a parte: de
// «mente» para «parte».
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

// ============================================================
// getTiposParaCaptacaoInterna MORREU AQUI (108) — e vale a pena dizer
// porquê, porque a razão dela era boa.
//
// A 093 pôs slug obrigatório na porta pública dos modelos. O modo
// interno não tinha slug nenhum, por isso o select dos tipos
// desapareceu — em silêncio, durante semanas — e os pedidos que a
// Nádia criava ficavam sem modelo. A correcção foi abrir uma porta de
// DENTRO ao lado da pública: um select autenticado, entregue pela RLS
// da casa (091).
//
// Só que a RLS da casa entrega TODAS as casas da sessão. Com uma
// membership é a casa certa; com duas, misturava os modelos das duas —
// e ficou registado como pendência «⚠ 108», com a condição escrita:
// «quando a casa vier do endereço, este sítio passa a filtrar pela
// casa pedida».
//
// A condição cumpriu-se. O modo interno tem slug — vem da rota do
// backoffice — e com slug a porta pública faz exactamente o que é
// preciso: mesma projecção, mesma ordem, filtrada pelo tenant do slug.
// A porta de dentro deixou de ter razão de existir, e duas portas para
// a mesma lista era justamente o que as fazia divergir.
//
// Quem procurar o nome: é `getTiposParaCaptacao(slug)` aqui em cima.
// ============================================================