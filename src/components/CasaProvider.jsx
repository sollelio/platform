// ============================================================
// CasaProvider — a identidade da casa, disponível na árvore.
//
// Cada página pública embrulha-se no seu Provider e diz-lhe de onde
// vem a casa: a PortalPage passa o token que tem no useParams, a
// CaptacaoPage o slug, o admin nada (vem da sessão). A alternativa —
// um Provider no App a ler a rota para adivinhar a porta — punha a
// identidade a depender da NAVEGAÇÃO, e a casa já tem regra contra
// isso («o vínculo vem dos dados, não da navegação», 30/07).
//
// O valor inicial é a omissão do casa.js. Quem lê nunca recebe null:
// antes de a identidade chegar, recebe a de ontem; se a rede falhar,
// fica com ela. Uma folha com o cabeçalho de ontem é melhor do que
// uma folha sem cabeçalho — e, com uma casa só, são o mesmo.
//
// A CHAVE é o que identifica a casa a carregar (o token, o slug, ou
// "sessao" no admin). Existe porque a alternativa era depender de o
// Provider nunca ser remontado com outro token — verdade hoje, e um
// pressuposto por escrever à espera de quem não o conhecer. Com ela,
// trocar de token recarrega; sem ela, ficava preso em silêncio.
// ============================================================

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { comOmissao, SEM_CASA } from "../lib/casa";
import { EstadoDaCasaContext } from "./casaContexto";

const CasaContext = createContext(comOmissao(null));

export const useCasa = () => useContext(CasaContext);

export default function CasaProvider({ chave, carregar, children }) {
  const [casa, setCasa] = useState(() => comOmissao(null));
  // A resposta guarda-se COM a chave a que pertence, e o estado
  // deriva-se da comparação. Podia ser um `setEstado(null)` no início
  // do efeito — mas isso é mexer em estado durante o efeito, e o que
  // se quer aqui não é apagar nada: é dizer que a resposta que lá está
  // era de OUTRA casa, e por isso não vale para esta. Trocar de casa
  // não pode deixar o ecrã da suspensa em cima da casa seguinte.
  const [resposta, setResposta] = useState(null);
  const estado = resposta?.chave === chave ? resposta.estado : null;

  // `carregar` é uma função nova a cada render de quem nos usa; pô-la
  // nas dependências recarregaria em ciclo. A ref dá-nos sempre a
  // versão fresca sem a tornar um gatilho — o gatilho é a chave.
  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;

  useEffect(() => {
    if (!chave || !carregarRef.current) return undefined;
    let cancelado = false;
    carregarRef.current().then((r) => {
      if (cancelado) return;
      setResposta({ chave, estado: r?.estado || "sem-resposta" });
      // Quatro respostas, e só duas mexem na moldura (100 + 108).
      if (r?.estado === "conhecida") {
        setCasa(comOmissao(r.casa));
        return;
      }
      // SUSPENSA veste a casa na mesma (108). Não é contradição com a
      // regra de baixo: a casa é mesmo de quem pergunta, e o ecrã que
      // lhe explica a suspensão tem de a poder nomear. O que ela não
      // faz é deixar entrar — disso trata a porta, não o Provider.
      if (r?.estado === "suspensa") {
        setCasa(comOmissao(r.casa));
        return;
      }
      // A porta respondeu e não há casa: a moldura DESPE-SE. Nome,
      // logótipo, domínio e contacto desaparecem em vez de serem
      // emprestados à primeira casa — que é o que acontecia aqui até
      // agora, em silêncio, e o silêncio era o problema.
      if (r?.estado === "desconhecida") {
        setCasa(SEM_CASA);
        return;
      }
      // «sem-resposta» mantém a que lá está: é a de ontem, e a de ontem
      // está certa. Uma folha com o cabeçalho de ontem é melhor do que
      // uma folha sem cabeçalho — mas isso vale para a rede em baixo,
      // nunca para um endereço que não é de ninguém.
    });
    return () => {
      cancelado = true;
    };
  }, [chave]);

  return (
    <CasaContext.Provider value={casa}>
      <EstadoDaCasaContext.Provider value={estado}>
        {children}
      </EstadoDaCasaContext.Provider>
    </CasaContext.Provider>
  );
}
