// ============================================================
// autoria.js — quem escreveu, e como se chama.
//
// A 105 pôs `criado_por` em quinze tabelas e trocou o
// `notas_evento.autor` (texto) por um uuid. O uuid não se mostra a
// ninguém: pergunta-se o nome à base. São duas perguntas diferentes —
// `nome_do_utilizador()` diz quem TEM a sessão, `nome_do_autor(uuid)`
// diz quem escreveu aquilo, e só responde de quem partilha casa com
// quem pergunta.
//
// PORQUÊ MEMÓRIA E NÃO UM PROVIDER, como o da casa: o nome de quem tem
// sessão lê-se num sítio só (a saudação do Início), e o dos autores é
// por uuid — um Provider teria de carregar um Map e quem lê passava-lhe
// o uuid na mesma, portanto não poupava nada e obrigava as páginas
// todas a montá-lo. O CasaProvider existe porque a identidade se lê em
// trinta sítios; isto lê-se em dois.
//
// ⚠ A MEMÓRIA LIMPA-SE AO TROCAR DE UTILIZADOR, e é essa a parte que
// não se vê. Entrar e sair NÃO recarrega a página — o sessao.js ouve o
// onAuthStateChange e a árvore continua montada. Sem esta limpeza, a
// saudação tratava o segundo utilizador pelo nome do primeiro, e os
// nomes de autores lidos numa casa ficavam à vista da seguinte. Seria o
// mesmo erro da 100 noutra roupa: um nome plausível, e errado, sem nada
// que o denuncie.
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

let utilizadorDaMemoria = null; // o uuid a que o que está guardado pertence
let promessaDoUtilizador = null; // Promise<string|null>
const nomesDeAutores = new Map(); // uuid → Promise<string|null>

supabase.auth.onAuthStateChange((_evento, sessao) => {
  const quem = sessao?.user?.id || null;
  // O TOKEN_REFRESHED chega de hora a hora com o MESMO utilizador —
  // comparar o uuid em vez de reagir ao evento evita deitar fora uma
  // memória que continua boa.
  if (quem === utilizadorDaMemoria) return;
  utilizadorDaMemoria = quem;
  promessaDoUtilizador = null;
  nomesDeAutores.clear();
});

// Um nome que não vem não é erro: pode ser um autor de outra casa (a
// função devolve null de propósito), pode ser uma linha antiga sem
// autor, pode ser a rede. Em todos os casos quem desenha omite o nome —
// nunca inventa um.
const pedirNome = async (rpc, args) => {
  try {
    const { data, error } = await supabase.rpc(rpc, args);
    if (error) throw error;
    return data || null;
  } catch (e) {
    console.error(`autoria (${rpc}):`, e);
    return null;
  }
};

// O nulo NÃO se guarda. Guardá-lo faria de uma falha de rede de um
// segundo um nome calado para o resto da sessão. Um autor de outra casa
// volta a perguntar e volta a receber nulo — é uma chamada barata para
// um caso raro, e é preferível ao contrário.
const memorizar = (guardar, ler, fabricar) => {
  const guardada = ler();
  if (guardada) return guardada;
  const promessa = fabricar().then((nome) => {
    if (nome === null) guardar(null);
    return nome;
  });
  guardar(promessa);
  return promessa;
};

export const nomeDoUtilizador = () =>
  memorizar(
    (p) => {
      promessaDoUtilizador = p;
    },
    () => promessaDoUtilizador,
    () => pedirNome("nome_do_utilizador", {}),
  );

export const nomeDoAutor = (uuid) => {
  if (!uuid) return Promise.resolve(null);
  return memorizar(
    (p) => (p ? nomesDeAutores.set(uuid, p) : nomesDeAutores.delete(uuid)),
    () => nomesDeAutores.get(uuid),
    () => pedirNome("nome_do_autor", { p_user: uuid }),
  );
};

// ---------- Os hooks ----------
// Devolvem null enquanto o nome não chega E quando ele não existe: para
// quem desenha, as duas situações pedem a mesma coisa — não mostrar
// autor. Um esqueleto para um nome de três palavras seria mais ruído do
// que o silêncio.

export function useNomeDoUtilizador() {
  const [nome, setNome] = useState(null);
  useEffect(() => {
    let vivo = true;
    nomeDoUtilizador().then((n) => {
      if (vivo) setNome(n);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return nome;
}

export function useNomeDeAutor(criadoPor) {
  const [nome, setNome] = useState(null);
  useEffect(() => {
    let vivo = true;
    nomeDoAutor(criadoPor).then((n) => {
      if (vivo) setNome(n);
    });
    return () => {
      vivo = false;
    };
  }, [criadoPor]);
  return nome;
}
