export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "";

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const SUPABASE_QUOTES_TABLE =
  "themes_quotes";

export const SUPABASE_SETTINGS_TABLE =
  "themes_app_settings";

export const SUPABASE_APP_STATE_TABLE =
  "app_state";

export const SUPABASE_PRICELIST_BRANDS_TABLE =
  "pricelist_brands";

export const SUPABASE_PRICELIST_CATALOGUES_TABLE =
  "pricelist_catalogues";

export const SUPABASE_PRICELIST_ITEMS_TABLE =
  "pricelist_items";

export const SUPABASE_TAILORS_TABLE =
  "tailors";

export const SUPABASE_TAILOR_SERVICES_TABLE =
  "tailor_services";

export const SUPABASE_TAILOR_JOBS_TABLE =
  "tailor_jobs";

export const SUPABASE_TAILOR_PAYMENTS_TABLE =
  "tailor_payments";

export function hasSupabaseConfig() {
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_ANON_KEY
  );
}

export function supabaseHeaders(
  extra = {}
) {
  return {
    apikey:
      SUPABASE_ANON_KEY,

    Authorization:
      `Bearer ${SUPABASE_ANON_KEY}`,

    "Content-Type":
      "application/json",

    Prefer:
      "return=representation",

    ...extra,
  };
}

export async function supabaseFetch(
  path,
  options = {}
) {
  const normalizedPath = String(path || "");

  const url =
    normalizedPath.startsWith("http://") ||
    normalizedPath.startsWith("https://")
      ? normalizedPath
      : normalizedPath.startsWith("/rest/v1/")
      ? `${SUPABASE_URL}${normalizedPath}`
      : normalizedPath.startsWith("rest/v1/")
      ? `${SUPABASE_URL}/${normalizedPath}`
      : `${SUPABASE_URL}/rest/v1/${normalizedPath.replace(/^\/+/, "")}`;

  const res = await fetch(url, {
    ...options,
    headers: supabaseHeaders(
      options.headers || {}
    ),
  });

  const text = await res
    .text()
    .catch(() => "");

  if (!res.ok) {
    throw new Error(
      text ||
        `Supabase request failed with status ${res.status}`
    );
  }

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
