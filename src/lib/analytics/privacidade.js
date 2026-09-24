// ============================================================
// privacidade.js — o que pode sair para a analytics, e em que forma.
//
// Três guardas, todas puras (testadas em src/lib/analytics.test.mjs):
//
//   1. ONDE se mede — só nas superfícies desta fatia: o /interesse e o
//      backoffice interno. As páginas por TOKEN (portal, contribuir,
//      comunicado, disponibilidade, formulário por convite) nunca: o
//      token no endereço É a chave de acesso de uma cliente.
//   2. O ENDEREÇO que sai — sem query, sem hash, ids e tokens trocados
//      por marcadores. Vale para os eventos nossos E para o que o SDK
//      junta sozinho ($current_url, $referrer, $pathname…).
//   3. AS PROPRIEDADES — lista de permissão por evento (eventos.js).
//      Uma chave não declarada, ou um valor fora da forma, cai.
// ============================================================

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

// As superfícies medidas nesta fatia (prefixos de caminho).
const MEDIDAS = ["/interesse", "/admin", "/evento", "/briefing"];

// Rotas cujo 2.º segmento é um token/segredo de acesso.
const COM_TOKEN = ["acompanhar", "contribuir", "comunicado", "disponibilidade"];

export const rotaMedida = (caminho) => {
  const p = String(caminho || "");
  return MEDIDAS.some((m) => p === m || p.startsWith(`${m}/`));
};

export const superficieDaRota = (caminho) => {
  const p = String(caminho || "");
  if (p === "/interesse" || p.startsWith("/interesse/")) return "public_form";
  if (rotaMedida(p)) return "admin";
  return "other";
};

// O caminho em forma de MOLDE: ids → :id, tokens → :token. O slug da
// casa fica (é a empresa, não uma pessoa) — mas só se for um slug.
export const moldeDoCaminho = (caminho) => {
  const limpo = String(caminho || "/").split(/[?#]/)[0] || "/";
  const partes = limpo.split("/");
  return partes
    .map((seg, i) => {
      if (!seg) return seg;
      if (UUID.test(seg)) return ":id";
      if (i === 2 && COM_TOKEN.includes(partes[1])) return ":token";
      if (/^\d+$/.test(seg)) return ":n";
      // Um segmento com cara de segredo (longo, misto) também cai.
      if (seg.length > 24 && /[A-Z]/.test(seg) && /[a-z]/.test(seg)) return ":token";
      return seg;
    })
    .join("/");
};

// Um URL completo → origem + molde do caminho. Sem query nem hash: a
// query do backoffice é inofensiva hoje, mas a de amanhã pode não ser.
export const urlSegura = (valor) => {
  if (typeof valor !== "string" || !valor) return valor;
  try {
    const u = new URL(valor);
    return `${u.origin}${moldeDoCaminho(u.pathname)}`;
  } catch {
    // Não é URL absoluto — tratar como caminho.
    return valor.startsWith("/") ? moldeDoCaminho(valor) : valor;
  }
};

// As chaves que o SDK junta com endereços dentro.
const CHAVE_DE_ENDERECO = /(url|pathname|referrer|href|referring_domain)$/i;

// Passa por um objecto de propriedades do SDK e limpa cada endereço.
export const limparEnderecos = (props) => {
  if (!props || typeof props !== "object") return props;
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    if (CHAVE_DE_ENDERECO.test(k) && typeof v === "string") {
      out[k] = /referring_domain$/i.test(k) ? v : urlSegura(v);
    } else {
      out[k] = v;
    }
  }
  return out;
};

const valorValido = (forma, v) => {
  if (forma === "bool") return typeof v === "boolean";
  if (forma === "int") return Number.isInteger(v) && v >= 0 && v < 1e6;
  if (forma === "uuid") return typeof v === "string" && UUID.test(v);
  if (forma === "slug") return typeof v === "string" && SLUG.test(v);
  if (forma === "rota") return typeof v === "string" && v.startsWith("/") && v.length < 200;
  if (forma && Array.isArray(forma.enum)) return forma.enum.includes(v);
  if (forma && Array.isArray(forma.lista))
    return Array.isArray(v) && v.length <= forma.lista.length && v.every((x) => forma.lista.includes(x));
  return false;
};

// Filtra propriedades por um esquema { chave: forma }. Devolve também
// as chaves recusadas, para o modo de depuração as poder mostrar.
export const filtrarPropriedades = (esquema, props) => {
  const aceites = {};
  const recusadas = [];
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null) continue;
    if (Object.hasOwn(esquema, k) && valorValido(esquema[k], v)) aceites[k] = v;
    else recusadas.push(k);
  }
  return { aceites, recusadas };
};
