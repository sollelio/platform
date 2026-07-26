import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// ============================================================
// sessao.js — quem está lá dentro, para quem precisa de decidir.
//
// Dois sítios fazem a mesma pergunta e têm de responder o mesmo, senão
// ficam a atirar um para o outro: o ProtectedRoute ("sem sessão, vai ao
// login") e o próprio login ("com sessão, não tens nada a fazer aqui").
// Por isso a pergunta faz-se num sítio só.
//
// TRÊS estados, e o do meio é o que interessa: `undefined` é «ainda não
// sei». Sem ele, cada visita começava por assumir que não há sessão — o
// login piscava a quem já entrou e o painel saltava para o login antes
// de a sessão ser lida.
// ============================================================

export function useSessao() {
  const [sessao, setSessao] = useState(undefined);

  useEffect(() => {
    let vivo = true;

    supabase.auth.getSession().then(({ data }) => {
      if (vivo) setSessao(data.session);
    });

    // Entrar ou sair noutro separador chega aqui sozinho.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evento, nova) => {
      if (vivo) setSessao(nova);
    });

    return () => {
      vivo = false;
      subscription.unsubscribe();
    };
  }, []);

  return sessao;
}

// O destino depois de entrar: o sítio de onde se veio, que o
// ProtectedRoute manda à boleia no `state` da navegação, ou o painel.
// Um link directo para um evento tem de voltar ao evento — foi por isso
// que se abriu o link.
export function destinoDepoisDoLogin(localizacao) {
  const veioDe = localizacao?.state?.from;
  if (!veioDe?.pathname) return "/admin";
  return `${veioDe.pathname}${veioDe.search || ""}`;
}
