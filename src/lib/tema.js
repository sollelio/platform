// ============================================================
// O tema do backoffice — claro ou escuro.
//
// É preferência de PESSOA, não de casa: vive no navegador
// (localStorage), como a ordem dos cartões de Documentos
// (decisão de 10/08) — sem migração, sem app_config. Na omissão
// segue o sistema (prefers-color-scheme); ao primeiro toque no
// interruptor passa a escolha explícita e o sistema deixa de
// mandar.
//
// O atributo vive no <html> (data-tema="escuro") e SÓ nas rotas
// do backoffice: as vitrinas públicas nunca o recebem, por isso
// os tokens ficam lá sempre com os valores claros. O /briefing
// também fica de fora de propósito — é superfície de papel, e o
// papel não escurece.
//
// ⚠ O guião de arranque em index.html repete esta lógica em
// miniatura (não pode importar módulos): quem mudar a chave, o
// atributo ou as rotas, muda NOS DOIS sítios.
// ============================================================

const CHAVE = "dlm.backoffice.tema";
const ATRIBUTO = "data-tema";

// O mesmo prefixo que o guião do index.html verifica.
export function rotaDoBackoffice(pathname) {
  return pathname.startsWith("/admin") || pathname.startsWith("/evento");
}

// Modo privado apertado atira em qualquer acesso ao localStorage;
// sem memória, o tema vive só até fechar o separador — como o
// rascunho da ordem dos cartões.
function guardado() {
  try {
    const t = localStorage.getItem(CHAVE);
    return t === "escuro" || t === "claro" ? t : null;
  } catch {
    return null;
  }
}

// O tema que a pessoa vê: a escolha explícita, ou o sistema.
export function temaEfectivo() {
  const t = guardado();
  if (t) return t;
  return window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "escuro"
    : "claro";
}

function aplicar(tema) {
  const raiz = document.documentElement;
  if (tema === "escuro") raiz.setAttribute(ATRIBUTO, "escuro");
  else raiz.removeAttribute(ATRIBUTO);
}

// Chamada a cada mudança de rota: põe o atributo dentro do
// backoffice, tira-o fora dele. É o que faz uma navegação
// interna admin → página pública voltar ao claro sem recarregar.
export function aplicarTemaNaRota(pathname) {
  aplicar(rotaDoBackoffice(pathname) ? temaEfectivo() : "claro");
}

// ------------------------------------------------------------
// O interruptor. Guardar SEMPRE ao alternar é deliberado: quem
// toca no interruptor está a escolher, e uma escolha que se
// perde ao mudar o tema do sistema seria o interruptor a mentir.
// ------------------------------------------------------------
const ouvintes = new Set();

export function alternarTema() {
  const novo = temaEfectivo() === "escuro" ? "claro" : "escuro";
  try {
    localStorage.setItem(CHAVE, novo);
  } catch {
    // Sem memória, o gesto vale na mesma — só não sobrevive.
  }
  aplicar(novo);
  ouvintes.forEach((cb) => cb());
}

// Para useSyncExternalStore no item do menu.
export function assinarTema(cb) {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
}
