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
  const res = await fetch(
    `${SUPABASE_URL}${path}`,
    {
      ...options,

      headers:
        supabaseHeaders(
          options.headers || {}
        ),
    }
  );

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
