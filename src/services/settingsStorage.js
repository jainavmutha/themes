import {
  SUPABASE_SETTINGS_TABLE,
  hasSupabaseConfig,
  supabaseFetch,
} from "./supabase.js";

export const SETTINGS_ROW_ID = "pricing_settings";

export async function loadRemoteSettings() {
  if (!hasSupabaseConfig()) return null;

  const rows = await supabaseFetch(
    `/rest/v1/${SUPABASE_SETTINGS_TABLE}?select=value&key=eq.${encodeURIComponent(
      SETTINGS_ROW_ID
    )}&limit=1`
  );

  return rows?.[0]?.value || null;
}

export async function saveRemoteSettings(settings) {
  if (!hasSupabaseConfig()) return;

  await supabaseFetch(
    `/rest/v1/${SUPABASE_SETTINGS_TABLE}?on_conflict=key`,
    {
      method: "POST",

      body: JSON.stringify({
        key: SETTINGS_ROW_ID,
        value: settings,
        updated_at: new Date().toISOString(),
      }),

      headers: {
        Prefer:
          "resolution=merge-duplicates,return=minimal",
      },
    }
  );
}