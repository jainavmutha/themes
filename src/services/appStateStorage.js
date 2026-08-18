import {
  SUPABASE_APP_STATE_TABLE,
  hasSupabaseConfig,
  supabaseFetch,
} from "./supabase.js";

export const LS_FABRIC_PROCESSING_KEY =
  "themes_fabric_processing_global_v1";

export const LS_PAYMENTS_KEY =
  "themes_payments_v1";

export function loadGlobalFabricProcessing() {
  try {
    return JSON.parse(
      localStorage.getItem(
        LS_FABRIC_PROCESSING_KEY
      ) || "[]"
    );
  } catch {
    return [];
  }
}

export function saveGlobalFabricProcessing(
  items
) {
  localStorage.setItem(
    LS_FABRIC_PROCESSING_KEY,
    JSON.stringify(items)
  );
}

export async function loadRemoteFabricProcessing() {
  if (!hasSupabaseConfig()) {
    return null;
  }

  const rows = await supabaseFetch(
    `/rest/v1/${SUPABASE_APP_STATE_TABLE}?select=value&key=eq.${encodeURIComponent(
      LS_FABRIC_PROCESSING_KEY
    )}&limit=1`
  );

  return Array.isArray(
    rows?.[0]?.value
  )
    ? rows[0].value
    : null;
}

export async function saveRemoteFabricProcessing(
  items
) {
  if (!hasSupabaseConfig()) {
    return null;
  }

  const payload = {
    key: LS_FABRIC_PROCESSING_KEY,

    value:
      Array.isArray(items)
        ? items
        : [],

    updated_at:
      new Date().toISOString(),
  };

  const result =
    await supabaseFetch(
      `/rest/v1/${SUPABASE_APP_STATE_TABLE}?on_conflict=key`,
      {
        method: "POST",

        body:
          JSON.stringify(
            payload
          ),

        headers: {
          Prefer:
            "resolution=merge-duplicates,return=representation",
        },
      }
    );

  return result;
}

export function loadPaymentsStore() {
  try {
    return JSON.parse(
      localStorage.getItem(
        LS_PAYMENTS_KEY
      ) || "{}"
    );
  } catch {
    return {};
  }
}

export function savePaymentsStore(
  value
) {
  localStorage.setItem(
    LS_PAYMENTS_KEY,
    JSON.stringify(
      value || {}
    )
  );
}

export async function loadRemotePaymentsStore() {
  if (!hasSupabaseConfig()) {
    return null;
  }

  const rows = await supabaseFetch(
    `/rest/v1/${SUPABASE_APP_STATE_TABLE}?select=value&key=eq.${encodeURIComponent(
      LS_PAYMENTS_KEY
    )}&limit=1`
  );

  return rows?.[0]?.value || null;
}

export async function saveRemotePaymentsStore(
  value
) {
  if (!hasSupabaseConfig()) {
    return null;
  }

  const payload = {
    key: LS_PAYMENTS_KEY,
    value: value || {},
    updated_at:
      new Date().toISOString(),
  };

  return await supabaseFetch(
    `/rest/v1/${SUPABASE_APP_STATE_TABLE}?on_conflict=key`,
    {
      method: "POST",

      body:
        JSON.stringify(
          payload
        ),

      headers: {
        Prefer:
          "resolution=merge-duplicates,return=representation",
      },
    }
  );
}