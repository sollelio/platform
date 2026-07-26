import { supabase } from "./supabase";

// ============================================================
// materiais.js — Fase B (Ficha Operacional)
// Catálogo de materiais + materiais escolhidos por evento.
// Estilo alinhado com invites.js / eventTypes.js:
//   export const nome = async (...) => {} ; verbo inglês + nome PT.
// ============================================================

// Ordem canónica das categorias (do template Canva).
// Usada para agrupar e ordenar a UI de forma estável, já que o
// .order() do PostgREST ordena alfabeticamente e não é o que queremos.
export const CATEGORIAS_ORDEM = [
  "Mobiliários",
  "Mesa Posta",
  "Mesa Criança",
  "Painéis e Estruturas",
  "Flores e Folhagens",
  "Welcome Drink",
  "Placas",
  "Buffet",
  "Luzes",
  "Velas",
  "Balões",
];

// Ordena uma lista de materiais pela ordem canónica de categoria e,
// dentro da categoria, pela coluna "ordem".
const ordenarPorCategoria = (materiais) => {
  const rank = new Map(CATEGORIAS_ORDEM.map((c, i) => [c, i]));
  return [...materiais].sort((a, b) => {
    const ca = a.categoria ?? a.material?.categoria;
    const cb = b.categoria ?? b.material?.categoria;
    const ra = rank.has(ca) ? rank.get(ca) : 999;
    const rb = rank.has(cb) ? rank.get(cb) : 999;
    if (ra !== rb) return ra - rb;
    const oa = a.ordem ?? a.material?.ordem ?? 0;
    const ob = b.ordem ?? b.material?.ordem ?? 0;
    return oa - ob;
  });
};

// Agrupa materiais por categoria, respeitando a ordem canónica.
// Devolve [{ categoria, itens: [...] }], sem categorias vazias.
export const agruparPorCategoria = (materiais) => {
  const mapa = new Map();
  for (const cat of CATEGORIAS_ORDEM) mapa.set(cat, []);
  for (const m of materiais) {
    const cat = m.categoria ?? m.material?.categoria;
    if (!mapa.has(cat)) mapa.set(cat, []);
    mapa.get(cat).push(m);
  }
  return Array.from(mapa.entries())
    .map(([categoria, itens]) => ({ categoria, itens }))
    .filter((g) => g.itens.length > 0);
};

// ---------- CATÁLOGO: materiais ----------

// Vai buscar os materiais do catálogo, ordenados pela ordem canónica.
// incluirInativos = true traz também os soft-deleted (para o CRUD de gestão).
export const getMateriais = async ({ incluirInativos = false } = {}) => {
  let query = supabase.from("materiais").select("*");
  if (!incluirInativos) query = query.eq("ativo", true);
  const { data, error } = await query;
  if (error) throw error;
  return ordenarPorCategoria(data || []);
};

// Cria um material novo. Calcula automaticamente a próxima "ordem"
// dentro da categoria escolhida.
export const createMaterial = async ({
  categoria,
  nome,
  unidade = "un",
  quantidade_total = 0,
  codigo = null,
  tipo = null,
  cor = null,
  medida = null,
  em_higienizacao = 0,
  por_confirmar = 0,
  stock_ideal = null,
  notas = null,
  imagem_url = null,
  def_carga = true,
  def_montagem = true,
  def_higienizacao = false,
}) => {
  if (!categoria || !nome)
    throw new Error("Categoria e nome são obrigatórios.");

  const { data: ultimos, error: errOrdem } = await supabase
    .from("materiais")
    .select("ordem")
    .eq("categoria", categoria)
    .order("ordem", { ascending: false })
    .limit(1);
  if (errOrdem) throw errOrdem;
  const proximaOrdem =
    ultimos && ultimos.length ? (ultimos[0].ordem || 0) + 1 : 1;

  const { data, error } = await supabase
    .from("materiais")
    .insert([
      {
        categoria,
        nome,
        unidade,
        quantidade_total,
        codigo,
        tipo,
        cor,
        medida,
        em_higienizacao,
        por_confirmar,
        stock_ideal,
        notas,
        imagem_url,
        ordem: proximaOrdem,
        def_carga,
        def_montagem,
        def_higienizacao,
        ativo: true,
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Actualiza campos de um material. Só passa os campos presentes.
export const updateMaterial = async (id, campos) => {
  const permitidos = [
    "categoria",
    "nome",
    "unidade",
    "ordem",
    "def_carga",
    "def_montagem",
    "def_higienizacao",
    "ativo",
    "quantidade_total",
    "codigo",
    "tipo",
    "cor",
    "medida",
    "em_higienizacao",
    "por_confirmar",
    "stock_ideal",
    "notas",
    "imagem_url",
  ];
  const patch = {};
  for (const k of permitidos) {
    if (k in campos) patch[k] = campos[k];
  }
  if (Object.keys(patch).length === 0) throw new Error("Nada para actualizar.");

  const { data, error } = await supabase
    .from("materiais")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Soft-delete / reactivar. Não apaga a linha (protege fichas antigas
// que usem este material) — só marca ativo = true/false.
export const toggleMaterial = async (id, ativo) => {
  return updateMaterial(id, { ativo });
};

// ---------- FICHA POR EVENTO: evento_materiais ----------

// Vai buscar os materiais já escolhidos para um evento, com os dados
// do catálogo (join pela FK material_id), ordenados pela ordem canónica.
export const getEventoMateriais = async (submissionId) => {
  if (!submissionId) throw new Error("submissionId em falta.");

  const { data, error } = await supabase
    .from("evento_materiais")
    .select(
      // quantidade_total e por_confirmar vêm porque a ficha avisa NA LINHA
      // quando se pede mais do que há (ver `disponivel` em FichaMateriais).
      // Sem elas o cálculo do disponível dava sempre null e o aviso, que
      // existe e está escrito, nunca chegava a aparecer.
      "*, material:materiais(id, categoria, nome, unidade, ordem, ativo, quantidade_total, por_confirmar, def_carga, def_montagem, def_higienizacao)",
    )
    .eq("submission_id", submissionId);
  if (error) throw error;
  return ordenarPorCategoria(data || []);
};

// Adiciona um material a um evento, HERDANDO os defaults de lista do
// catálogo (def_* → lista_*). É aqui que a herança acontece, não na BD.
// Usa upsert com onConflict para não duplicar (UNIQUE submission_id+material_id).
export const addEventoMaterial = async (
  submissionId,
  material,
  valores = {},
) => {
  if (!submissionId) throw new Error("submissionId em falta.");
  if (!material?.id) throw new Error("Material inválido.");

  const linha = {
    submission_id: submissionId,
    material_id: material.id,
    quantidade: valores.quantidade ?? 0,
    cores: valores.cores ?? null,
    observacoes: valores.observacoes ?? null,
    lista_carga: valores.lista_carga ?? material.def_carga ?? true,
    lista_montagem: valores.lista_montagem ?? material.def_montagem ?? true,
    lista_higienizacao:
      valores.lista_higienizacao ?? material.def_higienizacao ?? false,
  };

  const { data, error } = await supabase
    .from("evento_materiais")
    .upsert(linha, { onConflict: "submission_id,material_id" })
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Actualiza uma linha de evento_materiais (quantidade, cores, obs, flags)
// — e o próprio material, quando se escolheu o errado. Trocar não é
// remover e voltar a pôr: a linha fica, com a quantidade, as cores e as
// observações que já lá estavam certas. O UNIQUE (submission_id,
// material_id) trata de recusar uma troca para um material que já esteja
// na ficha.
export const updateEventoMaterial = async (id, campos) => {
  const permitidos = [
    "material_id",
    "quantidade",
    "cores",
    "observacoes",
    "lista_carga",
    "lista_montagem",
    "lista_higienizacao",
  ];
  const patch = {};
  for (const k of permitidos) {
    if (k in campos) patch[k] = campos[k];
  }
  if (Object.keys(patch).length === 0) throw new Error("Nada para actualizar.");

  const { data, error } = await supabase
    .from("evento_materiais")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Remove um material de um evento (apaga a linha de evento_materiais).
export const removeEventoMaterial = async (id) => {
  const { error } = await supabase
    .from("evento_materiais")
    .delete()
    .eq("id", id);
  if (error) throw error;
};

// Repõe os defaults de lista de UMA linha a partir do catálogo.
// Útil para um botão "repor listas" na UI.
export const resetListasDefaults = async (eventoMaterial) => {
  const m = eventoMaterial.material;
  if (!m) throw new Error("Linha sem material associado.");
  return updateEventoMaterial(eventoMaterial.id, {
    lista_carga: m.def_carga ?? true,
    lista_montagem: m.def_montagem ?? true,
    lista_higienizacao: m.def_higienizacao ?? false,
  });
};

// ---------- GERAÇÃO DE LISTAS ----------

// A partir das linhas de evento_materiais, produz as 3 listas filtradas
// e agrupadas por categoria. Alimenta a UI e o PDF.
// Devolve { carga, montagem, higienizacao }, cada uma [{ categoria, itens }].
export const gerarListas = (eventoMateriais) => {
  const comMaterial = eventoMateriais.filter((em) => em.material);

  const construir = (flag) => {
    const filtrados = comMaterial
      .filter((em) => em[flag])
      .map((em) => ({
        nome: em.material.nome,
        categoria: em.material.categoria,
        unidade: em.material.unidade,
        quantidade: em.quantidade,
        cores: em.cores,
        observacoes: em.observacoes,
        ordem: em.material.ordem,
      }));
    return agruparPorCategoria(filtrados);
  };

  return {
    carga: construir("lista_carga"),
    montagem: construir("lista_montagem"),
    higienizacao: construir("lista_higienizacao"),
  };
};

// ============================================================
// Upload de imagens de material para o Supabase Storage.
// Bucket "materiais" (público). Comprime no browser antes de enviar,
// para não gastar espaço nem largura de banda com fotos gigantes.
// ============================================================

const BUCKET_MATERIAIS = "materiais";

// Comprime/redimensiona uma imagem no browser: máx 600px no lado maior.
// Exporta PNG para PRESERVAR TRANSPARÊNCIA (o JPEG pintaria de preto as
// zonas transparentes — bug clássico do canvas). PNG é maior que JPEG,
// mas mantém o fundo transparente das imagens recortadas.
const comprimirImagem = (file, maxLado = 600) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > height && width > maxLado) {
        height = Math.round((height * maxLado) / width);
        width = maxLado;
      } else if (height > maxLado) {
        width = Math.round((width * maxLado) / height);
        height = maxLado;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      // NÃO pintar fundo — deixa transparente onde a imagem for transparente
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Falha ao comprimir a imagem."));
        },
        "image/png", // PNG preserva transparência
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem."));
    };
    img.src = url;
  });

// Faz upload da imagem de um material e devolve a URL pública.
// Usa o código do material (ou o id) como nome do ficheiro, para ser
// estável e substituível. Acrescenta um sufixo temporal para furar a
// cache do browser quando ela troca a foto.
export const uploadImagemMaterial = async (material, file) => {
  if (!file) throw new Error("Nenhum ficheiro selecionado.");
  if (!file.type.startsWith("image/"))
    throw new Error("O ficheiro tem de ser uma imagem.");

  const blob = await comprimirImagem(file);
  const base = (material?.codigo || material?.id || "material")
    .toString()
    .replace(/[^a-zA-Z0-9_-]/g, "");
  const caminho = `${base}_${Date.now()}.png`;

  const { error: errUpload } = await supabase.storage
    .from(BUCKET_MATERIAIS)
    .upload(caminho, blob, {
      contentType: "image/png",
      upsert: true,
    });
  if (errUpload) throw errUpload;

  const { data } = supabase.storage
    .from(BUCKET_MATERIAIS)
    .getPublicUrl(caminho);
  return data.publicUrl;
};
