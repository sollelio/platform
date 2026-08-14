import { getAllFields } from "./camposFormulario";

// ============================================================
// pontePedido.js — a ponte pedido→formulário, pura e testável.
//
// O pedido de orçamento (captação ou reserva) escreve chaves CANÓNICAS
// no respostas do evento (nomeDoCliente, localEvento, numeroConvidados…
// ver captacao.js e reservas.js). O formulário de um tipo de evento
// tem campos com ids DERIVADOS DOS RÓTULOS dos modelos («Nº de
// Convidados» → nDeConvidados, ver EventTypeEditor). Os dois mundos
// quase nunca coincidem por id — e era a Nádia quem fazia de ponte, a
// copiar valor a valor com os botões «Copiar».
//
// Esta função é o código a assumir esse trabalho: dado o evento e um
// tipo, devolve o que ATERRA nos campos do formulário (valores +
// proveniência) e o que fica de fora (referencia — os pares do cartão
// «O PEDIDO», sempre à vista, nunca perdidos).
//
// A REGRA DA PONTE: nunca forçar. Um campo de escolha só se pré-preenche
// se o valor do pedido existir tal e qual nas opções; um campo
// estruturado (morada, paleta) nunca recebe texto solto. O que não
// couber fica na referencia — visível, não espremido.
// ============================================================

const vazio = (v) =>
  v === undefined ||
  v === null ||
  (typeof v === "string" && v.trim() === "") ||
  (Array.isArray(v) && v.length === 0);

// As chaves que só a ENTRADA (captação pública, modais internos,
// reserva provisória) escreve. A presença de qualquer uma é o sinal de
// que este evento nasceu de um pedido — um evento criado à mão não as
// tem. (O drawer de edição escreve pelos ids do MODELO, não por estas.)
const CHAVES_DO_PEDIDO = [
  "nomeDoCliente",
  "contactoPrincipal",
  "numeroWhatsapp",
  "dataEvento",
  "localEvento",
  "tipoLocal",
  "numeroConvidados",
  "tipoEventoOutro",
  "servicos",
  "servicosBuffet",
  "servicosBalcao",
  "pretende",
  "mensagemInicial",
  "imagensReferencia",
];

// O rótulo do par das notas — exportado para o composer o reconhecer e
// lhe dar a caixa lavada em itálico, em vez de um par corrido.
export const ROTULO_NOTAS = "Notas da conversa";

// ALIASES escritos à mão: chave do pedido → ids de campo de modelo que
// significam A MESMA COISA. Cada alias vem de um rótulo real que os
// modelos da casa usam (toCamelId do EventTypeEditor):
//   «Nº de Convidados» → nDeConvidados · «Número de Convidados» →
//   numeroDeConvidados · «Local do Evento» → localDoEvento ·
//   «Morada / Espaço» → moradaEspaco · «Tipo de Espaço» → tipoDeEspaco
// NUNCA por semelhança de string em runtime — adivinhar é como o dado
// do pedido de um cliente ir parar ao campo errado de outro modelo.
const ALIASES = {
  numeroConvidados: ["numeroDeConvidados", "nDeConvidados", "convidados"],
  localEvento: ["localDoEvento", "local"],
  tipoLocal: ["tipoDeLocal", "tipoDeEspaco", "tipoEspaco", "moradaEspaco"],
  nomeDoCliente: ["nome", "nomeDoResponsavel", "nomeResponsavel"],
  contactoPrincipal: ["contacto", "contactoTelefonico", "telemovel"],
  numeroWhatsapp: ["whatsapp", "numeroDeWhatsapp"],
  servicos: ["servicosPretendidos", "queServicosPretende"],
};

// Aceita-se o valor neste campo? A regra da ponte em código:
// escolha única só com opção igual; estruturados nunca; o resto passa
// (texto, número, data, telefone — são strings dos dois lados).
const aceitaValor = (campo, valor) => {
  if (campo.type === "radio")
    return (
      typeof valor === "string" &&
      Array.isArray(campo.options) &&
      campo.options.includes(valor)
    );
  if (campo.type === "morada" || campo.type === "paleta") return false;
  if (campo.type === "checkbox")
    // As escolhas múltiplas resolvem-se à parte (interseção) — aqui só
    // se recusa um valor solto que não é lista.
    return false;
  return !vazio(valor);
};

export function pontePedidoFormulario(submissao, eventType) {
  const campos = getAllFields(eventType);
  const r = submissao?.respostas || {};

  const valores = {};
  const origem = {};
  const camposAtivos = [];
  const referencia = [];

  const temPedido = CHAVES_DO_PEDIDO.some((k) => !vazio(r[k]));

  const porId = new Map(campos.map((f) => [f.id, f]));
  // Correspondência por id IGUAL primeiro; só depois os aliases.
  const acharCampo = (chave) => {
    if (porId.has(chave)) return porId.get(chave);
    for (const alias of ALIASES[chave] || []) {
      if (porId.has(alias)) return porId.get(alias);
    }
    return null;
  };

  const assentar = (campo, valor, deOnde) => {
    valores[campo.id] = valor;
    origem[campo.id] = deOnde;
    if (!camposAtivos.includes(campo.id)) camposAtivos.push(campo.id);
  };

  // ---- A DATA — o comportamento actual, preservado -------------
  // O campo type "date" recebe a data que a app já sabe: a coluna
  // data_evento primeiro (origem «evento»), o dataEvento do pedido como
  // recurso (origem «pedido»).
  const campoData = campos.find((f) => f.type === "date");
  const dataColuna = submissao?.data_evento || null;
  const dataPedido = temPedido && !vazio(r.dataEvento) ? r.dataEvento : null;
  if (campoData && (dataColuna || dataPedido)) {
    assentar(campoData, dataColuna || dataPedido, dataColuna ? "evento" : "pedido");
  } else if (!campoData && dataPedido) {
    referencia.push({ rotulo: "Data do evento", valor: dataPedido });
  }

  // Sem pedido (evento criado à mão): só a data — e diz-se que não há
  // pedido, para o composer mostrar a ausência com dignidade em vez de
  // um cartão vazio.
  if (!temPedido) {
    return { temPedido: false, valores, camposAtivos, origem, referencia };
  }

  // ---- O NOME — nunca é par de referência --------------------------
  // O cartão «O PEDIDO» mostra-o como cabeçalho (em Playfair); pô-lo
  // também nos pares seria dizê-lo duas vezes. Só se tenta assentá-lo.
  const nomePedido = !vazio(r.nomeDoCliente)
    ? r.nomeDoCliente
    : !vazio(r.nomeResponsavel)
      ? r.nomeResponsavel
      : null;
  if (nomePedido) {
    const campoNome = acharCampo("nomeDoCliente");
    if (campoNome && valores[campoNome.id] === undefined && aceitaValor(campoNome, nomePedido)) {
      assentar(campoNome, nomePedido, "pedido");
    }
  }

  // ---- OS PARES SIMPLES do pedido ----------------------------------
  // Ordem = a ordem de leitura do cartão (contacto primeiro, como no
  // resumo da captação). O nº de convidados tem coluna própria — quando
  // só a coluna existe, a proveniência é do evento, não do pedido.
  const numConvidados = !vazio(r.numeroConvidados)
    ? { valor: r.numeroConvidados, deOnde: "pedido" }
    : !vazio(submissao?.numero_convidados)
      ? { valor: submissao.numero_convidados, deOnde: "evento" }
      : null;

  const linhas = [
    { chave: "numeroWhatsapp", rotulo: "WhatsApp", valor: r.numeroWhatsapp, deOnde: "pedido" },
    { chave: "contactoPrincipal", rotulo: "Contacto", valor: r.contactoPrincipal, deOnde: "pedido" },
    numConvidados && {
      chave: "numeroConvidados",
      rotulo: "Nº de convidados",
      valor: `${numConvidados.valor}`,
      deOnde: numConvidados.deOnde,
    },
    { chave: "localEvento", rotulo: "Local", valor: r.localEvento, deOnde: "pedido" },
    { chave: "tipoLocal", rotulo: "Espaço", valor: r.tipoLocal, deOnde: "pedido" },
  ].filter(Boolean);

  for (const linha of linhas) {
    if (vazio(linha.valor)) continue;
    const campo = acharCampo(linha.chave);
    // Um campo já assente não se escreve por cima — o segundo dado com
    // o mesmo destino fica à vista na referência, nunca engolido.
    if (campo && valores[campo.id] === undefined && aceitaValor(campo, linha.valor)) {
      assentar(campo, linha.valor, linha.deOnde);
    } else {
      referencia.push({ rotulo: linha.rotulo, valor: `${linha.valor}` });
    }
  }

  // ---- OS SERVIÇOS — escolha múltipla, por interseção --------------
  // Buffet, balcão e o «pretende» antigo juntam-se numa lista só. Só
  // aterra o que existir NAS OPÇÕES do campo; o resto fica na
  // referência (nunca se inventa uma opção que o modelo não tem).
  const servicosDoPedido = [
    ...(Array.isArray(r.servicos) ? r.servicos : []),
    ...(Array.isArray(r.servicosBuffet) ? r.servicosBuffet : []),
    ...(Array.isArray(r.servicosBalcao) ? r.servicosBalcao : []),
    ...(Array.isArray(r.pretende) ? r.pretende : []),
  ];
  if (servicosDoPedido.length > 0) {
    const campoServicos = acharCampo("servicos");
    let porAterrar = servicosDoPedido;
    if (
      campoServicos &&
      campoServicos.type === "checkbox" &&
      Array.isArray(campoServicos.options) &&
      valores[campoServicos.id] === undefined
    ) {
      const acertos = servicosDoPedido.filter((s) =>
        campoServicos.options.includes(s),
      );
      if (acertos.length > 0) assentar(campoServicos, acertos, "pedido");
      porAterrar = servicosDoPedido.filter(
        (s) => !campoServicos.options.includes(s),
      );
    }
    if (porAterrar.length > 0) {
      referencia.push({ rotulo: "Serviços", valor: porAterrar.join(", ") });
    }
  }

  // ---- O QUE NUNCA ATERRA — referência directa ---------------------
  // O tipo escrito à mão, as notas da conversa e as imagens não têm
  // campo no formulário — nem devem ter: são o contexto da conversa,
  // não perguntas à cliente.
  if (!vazio(r.tipoEventoOutro)) {
    referencia.push({ rotulo: "Tipo de evento (outro)", valor: r.tipoEventoOutro });
  }
  const notas = !vazio(r.mensagemInicial)
    ? r.mensagemInicial
    : !vazio(r.maisDetalhes)
      ? r.maisDetalhes
      : null;
  if (notas) referencia.push({ rotulo: ROTULO_NOTAS, valor: notas });
  if (Array.isArray(r.imagensReferencia) && r.imagensReferencia.length > 0) {
    const n = r.imagensReferencia.length;
    referencia.push({
      rotulo: "Referências",
      valor: n === 1 ? "1 imagem no evento" : `${n} imagens no evento`,
    });
  }

  return { temPedido: true, valores, camposAtivos, origem, referencia };
}
