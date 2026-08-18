import {
  SUPABASE_QUOTES_TABLE,
  hasSupabaseConfig,
  supabaseFetch,
} from "./supabase.js";

const LS_QUOTES_KEY = "themes_quotes_v1";
const LS_SEQ_PREFIX = "themes_seq_";

export function rowToQuoteRecord(row) {
  if (!row) return null;

  return {
    ...(row.data || {}),
    quoteNo: row.quote_no,
    createdAt:
      row.created_at ||
      row.data?.createdAt,
    updatedAt:
      row.updated_at ||
      row.data?.updatedAt,
  };
}

export function yyyymm(d = new Date()) {
  return `${d.getFullYear()}${String(
    d.getMonth() + 1
  ).padStart(2, "0")}`;
}

export async function loadAllQuotes() {
  if (hasSupabaseConfig()) {
    const rows = await supabaseFetch(
      `/rest/v1/${SUPABASE_QUOTES_TABLE}?select=quote_no,data,created_at,updated_at&order=updated_at.desc`
    );

    return (rows || []).reduce(
      (map, row) => {
        const rec =
          rowToQuoteRecord(row);

        if (rec?.quoteNo) {
          map[rec.quoteNo] = rec;
        }

        return map;
      },
      {}
    );
  }

  try {
    return JSON.parse(
      localStorage.getItem(
        LS_QUOTES_KEY
      ) || "{}"
    );
  } catch {
    return {};
  }
}

export async function saveAllQuotes(
  map
) {
  localStorage.setItem(
    LS_QUOTES_KEY,
    JSON.stringify(map)
  );
}

export async function nextMonthlySeq() {
  if (hasSupabaseConfig()) {
    const d = new Date();

    const YY = String(
      d.getFullYear()
    ).slice(-2);

    const MM = String(
      d.getMonth() + 1
    ).padStart(2, "0");

    const prefix =
      `TF-${YY}${MM}-`;

    const rows =
      await supabaseFetch(
        `/rest/v1/${SUPABASE_QUOTES_TABLE}?select=quote_no&quote_no=like.${encodeURIComponent(
          prefix + "%"
        )}&order=quote_no.desc&limit=1`
      );

    const lastNo =
      rows?.[0]?.quote_no || "";

    const lastSeq = Number(
      lastNo
        .split("-")
        .pop() || 0
    );

    return Number.isFinite(
      lastSeq
    )
      ? lastSeq + 1
      : 1;
  }

  const key =
    LS_SEQ_PREFIX + yyyymm();

  let n = +(
    localStorage.getItem(key) ||
    "0"
  );

  n += 1;

  localStorage.setItem(
    key,
    String(n)
  );

  return n;
}

export async function generateQuoteNo() {
  const d = new Date();

  const YY = String(
    d.getFullYear()
  ).slice(-2);

  const MM = String(
    d.getMonth() + 1
  ).padStart(2, "0");

  const seq = String(
    await nextMonthlySeq()
  ).padStart(4, "0");

  return `TF-${YY}${MM}-${seq}`;
}

export async function saveQuoteRecord(
  quoteNo,
  data
) {
  const now =
    new Date().toISOString();

  const record = {
    ...data,
    quoteNo,
    updatedAt: now,
  };

  if (hasSupabaseConfig()) {
    await supabaseFetch(
      `/rest/v1/${SUPABASE_QUOTES_TABLE}?on_conflict=quote_no`,
      {
        method: "POST",

        body: JSON.stringify({
          quote_no: quoteNo,
          data: record,
          updated_at: now,
        }),

        headers: {
          Prefer:
            "resolution=merge-duplicates,return=representation",
        },
      }
    );

    return record;
  }

  const map =
    await loadAllQuotes();

  map[quoteNo] = record;

  await saveAllQuotes(map);

  return record;
}

export async function deleteQuoteRecord(
  quoteNo
) {
  if (hasSupabaseConfig()) {
    await supabaseFetch(
      `/rest/v1/${SUPABASE_QUOTES_TABLE}?quote_no=eq.${encodeURIComponent(
        quoteNo
      )}`,
      {
        method: "DELETE",

        headers: {
          Prefer:
            "return=minimal",
        },
      }
    );

    return;
  }

  const map =
    await loadAllQuotes();

  delete map[quoteNo];

  await saveAllQuotes(map);
}