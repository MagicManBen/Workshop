// Validate pasted ChatGPT JSON against the live categories/subcategories.
// Returns { ok, errors:[], warnings:[], value:{normalised fields} }.
// Rules from the brief:
//  * must be valid JSON
//  * category/subcategory IDs must exist AND be active
//  * the subcategory must belong to the selected category
//  * meaningful errors, never silent failure
//  * AI must not invent categories — we only accept known IDs.

export function validateItemJson(text, cats, subs) {
  const result = { ok: false, errors: [], warnings: [], value: null };

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    result.errors.push("Not valid JSON: " + e.message);
    return result;
  }
  if (typeof data !== "object" || Array.isArray(data) || data === null) {
    result.errors.push("JSON must be a single object describing one item.");
    return result;
  }

  const catById = Object.fromEntries(cats.map((c) => [c.id, c]));
  const subById = Object.fromEntries(subs.map((s) => [s.id, s]));

  const catId = data.category_id ?? null;
  const subId = data.subcategory_id ?? null;

  // Category checks (optional but validated if present).
  if (catId != null) {
    const c = catById[catId];
    if (!c) {
      result.errors.push(`category_id "${catId}" does not exist.`);
    } else if (c.is_active === false) {
      result.errors.push(`Category "${c.name}" is inactive.`);
    } else if (data.category_name && data.category_name !== c.name) {
      result.warnings.push(
        `category_name "${data.category_name}" does not match stored name "${c.name}"; the stored name will be used.`
      );
    }
  }

  if (subId != null) {
    const s = subById[subId];
    if (!s) {
      result.errors.push(`subcategory_id "${subId}" does not exist.`);
    } else {
      if (s.is_active === false) result.errors.push(`Subcategory "${s.name}" is inactive.`);
      if (catId != null && s.category_id !== catId) {
        result.errors.push(
          `Subcategory "${s.name}" does not belong to the selected category.`
        );
      }
      if (catId == null) {
        result.warnings.push("subcategory_id provided without category_id; category will be inferred.");
      }
      if (data.subcategory_name && data.subcategory_name !== s.name) {
        result.warnings.push(
          `subcategory_name "${data.subcategory_name}" does not match stored name "${s.name}".`
        );
      }
    }
  }

  if (!data.name || !String(data.name).trim()) {
    result.warnings.push("No item name provided — you will need to enter one.");
  }

  // Normalise into item fields for the review form.
  result.value = {
    name: str(data.name),
    category_id: catById[catId] ? catId : null,
    subcategory_id: subById[subId] ? subId : null,
    brand: str(data.brand ?? data.manufacturer),
    model: str(data.model ?? data.make_or_model),
    part_number: str(data.part_number),
    description: str(data.description),
    markings: str(data.visible_markings ?? data.markings),
    specifications: asObject(data.specifications ?? data.attributes),
    notes: str(data.notes),
    confidence: data.identification_confidence ?? data.confidence ?? null,
    undetermined: data.fields_undetermined ?? data.undetermined ?? null,
  };

  result.ok = result.errors.length === 0;
  return result;
}

function str(v) {
  return v == null ? "" : String(v).trim();
}
function asObject(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) return v;
  return {};
}
