// Data-access layer: thin wrappers around supabase-js for the workshop schema.
// Keeping queries here keeps the views focused on presentation.
import { supabase, CONFIG } from "./supabase.js";

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// ---- Box types ------------------------------------------------------
export const boxTypes = {
  list: (includeInactive = false) => {
    let q = supabase.from("box_types").select("*").order("name");
    if (!includeInactive) q = q.eq("is_active", true);
    return q.then(unwrap);
  },
  get: (id) =>
    supabase.from("box_types").select("*").eq("id", id).single().then(unwrap),
  create: (row) =>
    supabase.from("box_types").insert(row).select().single().then(unwrap),
  update: (id, patch) =>
    supabase.from("box_types").update(patch).eq("id", id).select().single().then(unwrap),
};

// ---- Categories / subcategories ------------------------------------
export const categories = {
  list: (includeInactive = false) => {
    let q = supabase.from("categories").select("*").order("sort_order");
    if (!includeInactive) q = q.eq("is_active", true);
    return q.then(unwrap);
  },
  create: (row) =>
    supabase.from("categories").insert(row).select().single().then(unwrap),
  update: (id, patch) =>
    supabase.from("categories").update(patch).eq("id", id).select().single().then(unwrap),
};

export const subcategories = {
  list: (includeInactive = false) => {
    let q = supabase.from("subcategories").select("*").order("sort_order");
    if (!includeInactive) q = q.eq("is_active", true);
    return q.then(unwrap);
  },
  create: (row) =>
    supabase.from("subcategories").insert(row).select().single().then(unwrap),
  update: (id, patch) =>
    supabase.from("subcategories").update(patch).eq("id", id).select().single().then(unwrap),
};

// ---- Units ----------------------------------------------------------
export const units = {
  list: (includeInactive = false) => {
    let q = supabase.from("units").select("*").order("sort_order");
    if (!includeInactive) q = q.eq("is_active", true);
    return q.then(unwrap);
  },
  create: (row) =>
    supabase.from("units").insert(row).select().single().then(unwrap),
  update: (id, patch) =>
    supabase.from("units").update(patch).eq("id", id).select().single().then(unwrap),
};

// ---- Locations ------------------------------------------------------
export const locations = {
  list: (includeInactive = false) => {
    let q = supabase.from("locations").select("*").order("sort_order");
    if (!includeInactive) q = q.eq("is_active", true);
    return q.then(unwrap);
  },
  paths: () =>
    supabase.from("location_paths").select("*").order("full_path").then(unwrap),
  create: (row) =>
    supabase.from("locations").insert(row).select().single().then(unwrap),
  update: (id, patch) =>
    supabase.from("locations").update(patch).eq("id", id).select().single().then(unwrap),
};

// ---- Boxes ----------------------------------------------------------
export const boxes = {
  list: () =>
    supabase
      .from("boxes")
      .select("*, box_type:box_types(name)")
      .order("created_at", { ascending: false })
      .then(unwrap),
  get: (id) =>
    supabase
      .from("boxes")
      .select("*, box_type:box_types(*), location:locations(name)")
      .eq("id", id)
      .single()
      .then(unwrap),
  byCode: (code) =>
    supabase
      .from("boxes")
      .select("*, box_type:box_types(name)")
      .eq("box_code", code)
      .maybeSingle()
      .then(unwrap),
  create: (box_type_id) =>
    supabase.from("boxes").insert({ box_type_id }).select("*").single().then(unwrap),
  update: (id, patch) =>
    supabase.from("boxes").update(patch).eq("id", id).select().single().then(unwrap),
  notPrinted: () =>
    supabase
      .from("boxes")
      .select("*, box_type:box_types(name)")
      .is("label_printed_at", null)
      .order("created_at", { ascending: false })
      .then(unwrap),
};

// ---- Items ----------------------------------------------------------
export const items = {
  create: (row) =>
    supabase.from("items").insert(row).select().single().then(unwrap),
  get: (id) =>
    supabase
      .from("items")
      .select("*, category:categories(name), subcategory:subcategories(name)")
      .eq("id", id)
      .single()
      .then(unwrap),
  update: (id, patch) =>
    supabase.from("items").update(patch).eq("id", id).select().single().then(unwrap),
  recent: (limit = 25) =>
    supabase
      .from("items")
      .select("*, category:categories(name), subcategory:subcategories(name)")
      .order("created_at", { ascending: false })
      .limit(limit)
      .then(unwrap),
};

// ---- Images ---------------------------------------------------------
export const images = {
  forItem: (item_id) =>
    supabase.from("images").select("*").eq("item_id", item_id).then(unwrap),
  forBoxType: (box_type_id) =>
    supabase.from("images").select("*").eq("box_type_id", box_type_id).then(unwrap),
  create: (row) =>
    supabase.from("images").insert(row).select().single().then(unwrap),
  remove: (id) => supabase.from("images").delete().eq("id", id).then(unwrap),
};

// ---- Placements + movements ----------------------------------------
export const placements = {
  forItem: (item_id) =>
    supabase
      .from("item_placements")
      .select("*, box:boxes(box_code), location:locations(name), unit:units(name)")
      .eq("item_id", item_id)
      .then(unwrap),
  forBox: (box_id) =>
    supabase
      .from("item_placements")
      .select("*, item:items(name), unit:units(name)")
      .eq("box_id", box_id)
      .then(unwrap),
  forLocation: (location_id) =>
    supabase
      .from("item_placements")
      .select("*, item:items(name), unit:units(name)")
      .eq("location_id", location_id)
      .then(unwrap),
  // Upsert-style: if a row for this item+target exists, add to it; else insert.
  async place({ item_id, box_id = null, location_id = null, quantity, unit_id }) {
    let existing = supabase
      .from("item_placements")
      .select("*")
      .eq("item_id", item_id);
    existing = box_id
      ? existing.eq("box_id", box_id)
      : existing.eq("location_id", location_id);
    const rows = await existing.then(unwrap);
    if (rows.length) {
      const row = rows[0];
      return supabase
        .from("item_placements")
        .update({ quantity: Number(row.quantity) + Number(quantity), unit_id })
        .eq("id", row.id)
        .select()
        .single()
        .then(unwrap);
    }
    return supabase
      .from("item_placements")
      .insert({ item_id, box_id, location_id, quantity, unit_id })
      .select()
      .single()
      .then(unwrap);
  },
  update: (id, patch) =>
    supabase.from("item_placements").update(patch).eq("id", id).select().single().then(unwrap),
  remove: (id) =>
    supabase.from("item_placements").delete().eq("id", id).then(unwrap),
};

export const movements = {
  record: (row) => supabase.from("stock_movements").insert(row).then(unwrap),
};

// ---- Print jobs + heartbeat ----------------------------------------
export const printJobs = {
  enqueue: (box_code, box_id = null, payload = {}) =>
    supabase
      .from("print_jobs")
      .insert({ box_code, box_id, payload })
      .select()
      .single()
      .then(unwrap),
  get: (id) =>
    supabase.from("print_jobs").select("*").eq("id", id).single().then(unwrap),
  forBox: (box_id) =>
    supabase
      .from("print_jobs")
      .select("*")
      .eq("box_id", box_id)
      .order("created_at", { ascending: false })
      .then(unwrap),
};

export const heartbeats = {
  latest: () => supabase.from("service_heartbeats").select("*").then(unwrap),
};

// ---- Search ---------------------------------------------------------
export async function searchItems(term) {
  const like = `%${term}%`;
  // Search across common item fields.
  const data = await supabase
    .from("items")
    .select(
      "*, category:categories(name), subcategory:subcategories(name), " +
        "placements:item_placements(quantity, box:boxes(box_code), " +
        "location:locations(name), unit:units(name))"
    )
    .or(
      [
        `name.ilike.${like}`,
        `brand.ilike.${like}`,
        `model.ilike.${like}`,
        `part_number.ilike.${like}`,
        `description.ilike.${like}`,
        `markings.ilike.${like}`,
      ].join(",")
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (data.error) throw data.error;
  return data.data;
}

// ---- Storage (images) ----------------------------------------------
export const storage = {
  upload: async (path, file) => {
    const { error } = await supabase.storage
      .from(CONFIG.IMAGE_BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    return path;
  },
  signedUrl: async (path, expires = 3600) => {
    const { data, error } = await supabase.storage
      .from(CONFIG.IMAGE_BUCKET)
      .createSignedUrl(path, expires);
    if (error) throw error;
    return data.signedUrl;
  },
  remove: (path) => supabase.storage.from(CONFIG.IMAGE_BUCKET).remove([path]),
};
