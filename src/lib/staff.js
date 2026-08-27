import { supabase } from "./supabase";

// ============================================================
// A EQUIPA OPERACIONAL — camada de dados.
//
// Uma pessoa da equipa é uma PESSOA que trabalha nos eventos, não um
// papel de autorização; uma função é uma CAPACIDADE («o que é que esta
// pessoa sabe fazer?»), não uma permissão. Quase ninguém da equipa tem
// conta na plataforma — por isso `user_id` é opcional e nunca se exige.
//
// A casa vai SEMPRE explícita nas escritas, pela mesma razão da 108: a
// casa activa invisível é o que faz escritas caírem no sítio errado. A
// leitura não precisa de filtro porque o RLS já o faz — mas o filtro
// fica na mesma, para o pedido dizer o que quer.
// ============================================================

const ENGAGEMENTS = ["responsible", "core", "occasional"];

// Rótulos da casa. O código é inglês, o que a Nádia lê é português.
export const ENGAGEMENT_LABELS = {
  responsible: "Responsável",
  core: "Equipa base",
  occasional: "Pontual",
};

export const isEngagement = (value) => ENGAGEMENTS.includes(value);

// ---------- Funções operacionais ----------

export const listStaffFunctions = async (organizationId) => {
  const { data, error } = await supabase
    .from("staff_functions")
    .select("id, organization_id, name, area, is_active, sort_order")
    .eq("organization_id", organizationId)
    .order("area", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const createStaffFunction = async ({
  organizationId,
  name,
  area,
  sortOrder = 0,
}) => {
  const { data, error } = await supabase
    .from("staff_functions")
    .insert([
      {
        organization_id: organizationId,
        name: name.trim(),
        area: area.trim(),
        sort_order: sortOrder,
      },
    ])
    .select("id, organization_id, name, area, is_active, sort_order")
    .single();
  if (error) throw error;
  return data;
};

export const updateStaffFunction = async ({ id, name, area, sortOrder }) => {
  const { data, error } = await supabase
    .from("staff_functions")
    .update({
      name: name.trim(),
      area: area.trim(),
      sort_order: sortOrder,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, organization_id, name, area, is_active, sort_order")
    .single();
  if (error) throw error;
  return data;
};

// Desactivar e não apagar: o histórico que aponta para a função tem de
// continuar legível. É por isso que não há política de DELETE na base.
export const setStaffFunctionActive = async ({ id, isActive }) => {
  const { data, error } = await supabase
    .from("staff_functions")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, organization_id, name, area, is_active, sort_order")
    .single();
  if (error) throw error;
  return data;
};

// ---------- Pessoas da equipa ----------

// Uma leitura só, com as funções embebidas: dez pessoas não justificam
// duas viagens nem paginação.
export const listStaffMembers = async (organizationId) => {
  const { data, error } = await supabase
    .from("staff_members")
    .select(
      `id, organization_id, display_name, email, phone, engagement,
       is_active, may_be_consulted, notes, user_id,
       staff_member_functions ( staff_function_id )`,
    )
    .eq("organization_id", organizationId)
    .order("display_name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m) => ({
    ...m,
    functionIds: (m.staff_member_functions ?? []).map(
      (a) => a.staff_function_id,
    ),
  }));
};

export const createStaffMember = async ({
  organizationId,
  displayName,
  email,
  phone,
  engagement,
  mayBeConsulted,
  notes,
}) => {
  const { data, error } = await supabase
    .from("staff_members")
    .insert([
      {
        organization_id: organizationId,
        display_name: displayName.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        engagement,
        may_be_consulted: mayBeConsulted,
        notes: notes?.trim() || null,
      },
    ])
    .select("id, organization_id, display_name, engagement")
    .single();
  if (error) throw error;
  return data;
};

export const updateStaffMember = async ({
  id,
  displayName,
  email,
  phone,
  engagement,
  mayBeConsulted,
  notes,
}) => {
  const { data, error } = await supabase
    .from("staff_members")
    .update({
      display_name: displayName.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      engagement,
      may_be_consulted: mayBeConsulted,
      notes: notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, organization_id, display_name, engagement")
    .single();
  if (error) throw error;
  return data;
};

export const setStaffMemberActive = async ({ id, isActive }) => {
  const { data, error } = await supabase
    .from("staff_members")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, display_name, is_active")
    .single();
  if (error) throw error;
  return data;
};

// ---------- Atribuição de funções ----------
//
// A associação leva a casa explícita porque as duas chaves estrangeiras
// são compostas: é isso que impede uma pessoa de uma casa de receber a
// função de outra.

export const assignFunction = async ({
  organizationId,
  staffMemberId,
  staffFunctionId,
}) => {
  const { error } = await supabase.from("staff_member_functions").insert([
    {
      organization_id: organizationId,
      staff_member_id: staffMemberId,
      staff_function_id: staffFunctionId,
    },
  ]);
  if (error) throw error;
};

export const removeFunction = async ({ staffMemberId, staffFunctionId }) => {
  const { error } = await supabase
    .from("staff_member_functions")
    .delete()
    .eq("staff_member_id", staffMemberId)
    .eq("staff_function_id", staffFunctionId);
  if (error) throw error;
};

// Agrupar por área para a lista — a área é o que dá ordem à leitura
// quando são vinte funções e não três.
export const groupFunctionsByArea = (functions) => {
  const groups = new Map();
  for (const fn of functions) {
    if (!groups.has(fn.area)) groups.set(fn.area, []);
    groups.get(fn.area).push(fn);
  }
  return [...groups.entries()].map(([area, items]) => ({ area, items }));
};
