// ============================================================
// realce — *negrito* e _itálico_ nos textos que a Nádia escreve.
//
// A sintaxe é a do WhatsApp, de propósito: é a que ela já usa todos
// os dias nas mensagens da loja — uma só regra em toda a casa (e na
// mensagem que acompanha o endereço é o próprio WhatsApp que a lê,
// sem código nenhum).
//
// As regras, mínimas e à WhatsApp: o marcador abraça o texto
// (*assim*, nunca * assim *), não salta linhas, e um marcador sem
// par fica tal e qual se escreveu — nunca desaparece texto. Nada de
// dangerouslySetInnerHTML: devolvem-se nós de React e o texto
// continua escapado como sempre esteve.
//
// O negrito sai a 600 — o semibold da casa; o 700 grita. O itálico é
// o do próprio tipo de letra. Dentro de um negrito ainda cabe um
// _itálico_; mais fundo que isso ninguém precisa.
// ============================================================

const NEGRITO = /\*(\S(?:[^*\n]*\S)?)\*/;
const ITALICO = /_(\S(?:[^_\n]*\S)?)_/;

// Parte o texto pelo primeiro par de marcadores, embrulha o miolo e
// repete no resto — o que não emparelha segue como está.
function partir(texto, re, embrulhar) {
  const nos = [];
  let resto = texto;
  let n = 0;
  while (resto) {
    const m = resto.match(re);
    if (!m) {
      nos.push(resto);
      break;
    }
    if (m.index > 0) nos.push(resto.slice(0, m.index));
    nos.push(embrulhar(m[1], n++));
    resto = resto.slice(m.index + m[0].length);
  }
  return nos;
}

const italico = (texto, chave) =>
  partir(texto, ITALICO, (miolo, i) => <em key={`${chave}i${i}`}>{miolo}</em>);

// Devolve o texto como nós de React: *…* a <strong>, _…_ a <em>.
// Aceita vazio sem drama — os campos opcionais chamam-na igual.
export function realce(texto) {
  if (!texto) return texto;
  return partir(texto, NEGRITO, (miolo, i) => (
    <strong key={`n${i}`} style={{ fontWeight: 600 }}>
      {italico(miolo, `n${i}`)}
    </strong>
  )).flatMap((no, i) => (typeof no === "string" ? italico(no, `t${i}`) : [no]));
}
