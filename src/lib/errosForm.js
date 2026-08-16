import { supabase } from "./supabase";

// ============================================================
// errosForm — registo de erros dos formulários públicos na BD.
//
// Quando uma submissão falha no browser de um cliente, o erro real
// morre na consola dele e ninguém o vê. Este módulo grava o erro na
// tabela form_errors, COM as respostas que o cliente tinha preenchido:
// permite investigar a causa E recuperar os dados sem pedir ao cliente
// para preencher tudo de novo.
//
// A gravação é "fire-and-forget": nunca lança, nunca bloqueia o fluxo
// do formulário, e se a própria BD estiver em baixo falha em silêncio
// (o cliente já está a ver a mensagem de erro; não o piorar).
//
// A tabela nasceu em docs/migracoes/form_errors.sql e a 106 pô-la em
// ordem: ganhou `tenant_id` e `respostas_ate`, e o INSERT directo do
// anónimo deixou de passar — a política nova só deixa escrever quem tem
// casa. A porta é agora a `registar_erro_formulario`, que devolve
// boolean: `false` quando o travão de 20 por hora e por casa dispara.
//
// Sobre o travão: um `false` NÃO é erro. É o limite a fazer o que foi
// posto para fazer, e a razão de ele existir está registada — a tabela
// aceitava insert anónimo sem limite e era o caminho mais fácil para
// encher os 500 MB do plano gratuito. Quem regista um erro não tem de
// saber disto; vai para a consola e a vida segue.
//
// A CASA vem por `p_tenant_slug`, o padrão da 093 — quem a sabe passa-a.
// A captação sabe (tem o slug no endereço); o formulário de convite não,
// porque resolve a casa pelo CÓDIGO. Aí vai null, a função cai no
// `tenant_actual()`, que sem sessão também é null, e a linha fica sem
// casa. É o comportamento desenhado: um erro sem casa identificada
// continua a ser diagnóstico válido, e perdê-lo por não saber de quem é
// seria perder justamente o que se queria ver.
// ============================================================

// Serializa um erro (Error de JS ou erro do Supabase/PostgREST) num
// objeto plano com tudo o que interessa para diagnóstico.
const serializarErro = (erro) => {
  if (!erro) return { message: "Erro desconhecido" };
  return {
    message: erro.message || String(erro),
    // Campos específicos do PostgREST/Supabase — é aqui que vive a
    // causa real (coluna inexistente, tipo errado, RLS, constraint...)
    code: erro.code ?? null,
    details: erro.details ?? null,
    hint: erro.hint ?? null,
    status: erro.status ?? null,
    name: erro.name ?? null,
  };
};

// Regista um erro de formulário. Devolve sempre (nunca lança).
//   origem    — "onboarding" | "captacao" | ...
//   erro      — a exceção apanhada
//   contexto  — objeto livre (invite, event_type_id, passo...)
//   respostas — o formData no momento da falha (recuperação de dados)
//   tenantSlug— a casa, quando quem chama a sabe (106)
export const registarErroFormulario = async ({
  origem,
  erro,
  contexto = {},
  respostas = null,
  tenantSlug = null,
}) => {
  try {
    const detalhe = serializarErro(erro);
    const { data, error } = await supabase.rpc("registar_erro_formulario", {
      p_origem: origem || "desconhecida",
      p_mensagem: detalhe.message,
      p_detalhe: detalhe,
      p_contexto: {
        ...contexto,
        url: typeof window !== "undefined" ? window.location.href : null,
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
        online: typeof navigator !== "undefined" ? navigator.onLine : null,
      },
      p_respostas: respostas,
      p_tenant_slug: tenantSlug,
    });
    if (error) throw error;
    // `false` é o travão, não uma avaria: a casa já registou 20 erros
    // nesta hora. Diz-se na consola de quem está a ver e não se insiste
    // — vinte iguais dizem o mesmo que vinte e um.
    if (data === false) {
      console.warn(
        "errosForm: limite de registos desta hora atingido — erro não gravado.",
      );
    }
  } catch (e) {
    // Última linha de defesa: nunca deixar o registo de erros
    // rebentar o formulário. Fica ao menos na consola.
    console.warn("errosForm: não foi possível registar o erro", e);
  }
};

// Lê os erros recentes (para o painel de administração). Continua a ler
// a tabela directamente: aqui há sessão, e a RLS da 106 já a filtra pela
// casa de quem pergunta — o que antes era uma lista global passou a ser
// a lista da casa, sem uma linha de código a mudar. O mesmo vale para o
// apagar, aqui em baixo.
export const getErrosFormulario = async (dias = 30) => {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const { data, error } = await supabase
    .from("form_errors")
    .select("*")
    .gte("created_at", desde.toISOString())
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
};

// Apaga um erro já investigado/resolvido.
export const apagarErroFormulario = async (id) => {
  const { error } = await supabase.from("form_errors").delete().eq("id", id);
  if (error) throw error;
};
