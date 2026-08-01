// ============================================================
// conteudo.js — o que se DIZ nas novidades e nas pendências.
//
// Regra de conteúdo, não de desenho: decide o que é novo desde a última
// visita e o que ainda depende dela. Ficheiro `.js` porque não exporta
// componentes — o linter da casa não deixa misturar.
// ============================================================

import { diaEMes } from "./base";

// ------------------------------------------------------------
// A composição das novidades e das pendências.
//
// Vive aqui, ao lado das divisões que a consomem, e não na página: é regra
// de conteúdo, não de desenho.
// ------------------------------------------------------------
export function comporNovidades(dados) {
  const desde = dados?.visita_anterior ? new Date(dados.visita_anterior).getTime() : null;
  const m = dados?.marcos_datados || {};
  const novo = (iso) => desde !== null && iso && new Date(iso).getTime() > desde;

  const novidades = [];
  if (novo(m.orcamento)) {
    novidades.push({
      chave: "orcamento",
      titulo: "O orçamento chegou",
      corpo: "Já pode vê-lo, com os valores da sua mesa. Responda quando quiser.",
    });
  }
  if (novo(m.sinal)) {
    novidades.push({
      chave: "sinal",
      titulo: "A data ficou reservada",
      corpo: "Recebemos o sinal. Ninguém mais leva este dia.",
    });
  }
  if (novo(m.projecto)) {
    novidades.push({
      chave: "projecto",
      titulo: "O projecto da mesa está pronto",
      corpo: "Desenhámos a mesa com o que nos contou.",
    });
  }
  if (novo(m.contrato)) {
    novidades.push({
      chave: "contrato",
      titulo: "O contrato ficou assinado",
      corpo: "Está tudo escrito, do seu lado e do nosso.",
    });
  }

  // ── As fases 5, 6 e 7 ────────────────────────────────────────────────
  //
  // Esta lista nasceu na fase 2 e ficou a conhecer só os quatro marcos de
  // então. Mas o que MAIS muda entre duas visitas é justamente o que veio
  // depois — e as fotografias do dia são a única coisa do portal que muda
  // de hora a hora. Uma divisão chamada «o que mudou desde a última vez»
  // que não conhece as fotografias está a falhar no seu único trabalho.
  //
  // Nada disto precisou de projecção nova: já vinha tudo.
  const q = dados?.questionario || {};
  const f = dados?.fotografias || {};
  const av = dados?.avaliacao || {};

  if (novo(q.entregue_em)) {
    novidades.push({
      chave: "questionario",
      titulo: "As suas respostas ficaram connosco",
      corpo: "É delas que sai o trabalho da equipa no dia.",
    });
  }

  // As fotografias não têm carimbo próprio na projecção — o que há é a
  // lista. Conta-se a mais recente, que é o que interessa: chegou coisa
  // nova desde que ela cá esteve.
  const ultimaFoto = (f.lista || [])
    .map((x) => x.quando)
    .filter(Boolean)
    .sort()
    .pop();
  if (novo(ultimaFoto)) {
    novidades.push({
      chave: "fotografias",
      titulo:
        f.quando === "memoria"
          ? "As fotografias do dia já cá estão"
          : "Estamos a montar, e há fotografias",
      corpo:
        f.quando === "memoria"
          ? "Ficaram aqui, para ver quando quiser."
          : "Tirámo-las no espaço, há pouco.",
    });
  }

  if (novo(av.feita_em)) {
    novidades.push({
      chave: "avaliacao",
      titulo: "Ficámos com as suas palavras",
      corpo: "A Nádia lê tudo o que nos escrevem.",
    });
  }

  // «O que já cá estava» — o que existe mas não é novo. Apagado, sem mola.
  const jaCaEstava = [];
  const nImagens = dados?.pedido?.imagens?.length || 0;
  if (nImagens > 0 && !novo(dados?.pedido?.quando)) {
    jaCaEstava.push(
      nImagens === 1 ? "A imagem do seu pedido" : `As ${nImagens} imagens do seu pedido`,
    );
  }
  if (dados?.pedido?.mensagem && !novo(dados?.pedido?.quando)) {
    jaCaEstava.push("A mensagem com que chegou");
  }
  if (m.orcamento && !novo(m.orcamento)) {
    jaCaEstava.push(`O orçamento, desde ${diaEMes(m.orcamento)}`);
  }

  return { novidades, jaCaEstava };
}

export function comporPendencias(dados, caducou = false) {
  const pendencias = [];
  const doNossoLado = [];
  const q = dados?.questionario || {};
  const m = dados?.marcos_datados || {};
  const jornada = Array.isArray(dados?.jornada) ? dados.jornada : [];
  const etapaFeita = (id) =>
    jornada.some((e) => e.etapa === id && e.estado !== "por_acontecer");

  // O questionário só se pede depois de haver negócio fechado — antes
  // disso, o que falta é o orçamento, e esse é trabalho nosso.
  // `tem_perguntas` é a guarda que faltava (069): abaixo de cinco campos o
  // modelo não tem questionário nenhum, e sem isto a pendência convidava a
  // responder — em quatro dos seis modelos — com uma ligação que devolvia a
  // pessoa ao princípio. Um convite que não leva a lado nenhum.
  if (q.tem_perguntas && !q.entregue_em && etapaFeita("sinal")) {
    pendencias.push({
      chave: "questionario",
      titulo: "O questionário",
      corpo:
        "São as perguntas que nos dizem como imagina a mesa: as cores, as horas, o que vai estar escrito à entrada. Pode responder aos poucos — fica tudo guardado.",
    });
  }

  if (m.orcamento && !etapaFeita("sinal")) {
    pendencias.push({
      chave: "orcamento",
      titulo: "O orçamento",
      corpo: `Está consigo desde ${diaEMes(m.orcamento)}, à espera de uma resposta. Sem pressa nenhuma.`,
    });
  }

  // CADUCADO: cala-se tudo o que aponta para a frente. Prometer preparar um
  // orçamento cinco meses depois da data pedida é pior do que não dizer
  // nada — e a âncora já explicou, com dignidade, o que aconteceu.
  if (caducou) return { pendencias: [], doNossoLado: [] };

  // O que não pede acção nenhuma da parte dela.
  if (!m.orcamento && !etapaFeita("orcamento")) {
    doNossoLado.push("O orçamento — estamos a prepará-lo com o que nos contou.");
  }
  if (!etapaFeita("contrato") && etapaFeita("sinal")) {
    doNossoLado.push("O contrato — passamos a escrito o que ficou combinado.");
  }
  if (!etapaFeita("projecto") && etapaFeita("sinal")) {
    doNossoLado.push("O projecto da mesa — está a ser desenhado com o que nos contou.");
  }

  return { pendencias, doNossoLado };
}
