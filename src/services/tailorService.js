

import {
  SUPABASE_TAILORS_TABLE,
  SUPABASE_TAILOR_SERVICES_TABLE,
  SUPABASE_TAILOR_JOBS_TABLE,
  SUPABASE_TAILOR_PAYMENTS_TABLE,
  supabaseFetch,
} from "./supabase.js";

function encode(value) {
  return encodeURIComponent(String(value));
}

function singleRow(result) {
  if (Array.isArray(result)) return result[0] || null;
  return result || null;
}

// =========================
// LOAD FULL TAILOR LEDGER
// =========================
export async function fetchTailors() {
  const [tailors, services, jobs, payments] = await Promise.all([
    supabaseFetch(
      `${SUPABASE_TAILORS_TABLE}?select=*&order=name.asc`
    ),
    supabaseFetch(
      `${SUPABASE_TAILOR_SERVICES_TABLE}?select=*&order=name.asc`
    ),
    supabaseFetch(
      `${SUPABASE_TAILOR_JOBS_TABLE}?select=*&order=work_date.desc,created_at.desc`
    ),
    supabaseFetch(
      `${SUPABASE_TAILOR_PAYMENTS_TABLE}?select=*&order=payment_date.desc,created_at.desc`
    ),
  ]);

  const safeTailors = Array.isArray(tailors) ? tailors : [];
  const safeServices = Array.isArray(services) ? services : [];
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const safePayments = Array.isArray(payments) ? payments : [];

  return safeTailors.map((tailor) => ({
    ...tailor,
    services: safeServices.filter(
      (service) => service.tailor_id === tailor.id
    ),
    jobs: safeJobs.filter((job) => job.tailor_id === tailor.id),
    payments: safePayments.filter(
      (payment) => payment.tailor_id === tailor.id
    ),
  }));
}

// =========================
// TAILORS
// =========================
export async function createTailor({ name, phone = "", notes = "" }) {
  const result = await supabaseFetch(SUPABASE_TAILORS_TABLE, {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      name,
      phone: phone || null,
      notes: notes || null,
    }),
  });

  return singleRow(result);
}

export async function updateTailor(tailorId, changes) {
  const result = await supabaseFetch(
    `${SUPABASE_TAILORS_TABLE}?id=eq.${encode(tailorId)}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(changes),
    }
  );

  return singleRow(result);
}

export async function deleteTailor(tailorId) {
  await supabaseFetch(
    `${SUPABASE_TAILORS_TABLE}?id=eq.${encode(tailorId)}`,
    {
      method: "DELETE",
    }
  );
}

// =========================
// SERVICES
// =========================
export async function createTailorService({
  tailorId,
  name,
  unit = "Piece",
  rate = 0,
}) {
  const result = await supabaseFetch(SUPABASE_TAILOR_SERVICES_TABLE, {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      tailor_id: tailorId,
      name,
      unit,
      rate: Number(rate || 0),
    }),
  });

  return singleRow(result);
}

export async function updateTailorService(serviceId, changes) {
  const result = await supabaseFetch(
    `${SUPABASE_TAILOR_SERVICES_TABLE}?id=eq.${encode(serviceId)}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(changes),
    }
  );

  return singleRow(result);
}

export async function deleteTailorService(serviceId) {
  await supabaseFetch(
    `${SUPABASE_TAILOR_SERVICES_TABLE}?id=eq.${encode(serviceId)}`,
    {
      method: "DELETE",
    }
  );
}

// =========================
// JOBS / WORK
// =========================
export async function createTailorJob({
  tailorId,
  serviceId = null,
  serviceName,
  unit = "Piece",
  workDate,
  dueDate = null,
  quantity,
  rate,
  status = "sent",
  quoteNo = null,
  orderReference = null,
  notes = "",
}) {
  const result = await supabaseFetch(SUPABASE_TAILOR_JOBS_TABLE, {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      tailor_id: tailorId,
      service_id: serviceId || null,
      service_name: serviceName,
      unit,
      work_date: workDate,
      due_date: dueDate || null,
      quantity: Number(quantity || 0),
      rate: Number(rate || 0),
      status,
      quote_no: quoteNo || null,
      order_reference: orderReference || null,
      notes: notes || null,
    }),
  });

  return singleRow(result);
}

export async function updateTailorJob(jobId, changes) {
  const result = await supabaseFetch(
    `${SUPABASE_TAILOR_JOBS_TABLE}?id=eq.${encode(jobId)}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(changes),
    }
  );

  return singleRow(result);
}

export async function deleteTailorJob(jobId) {
  await supabaseFetch(
    `${SUPABASE_TAILOR_JOBS_TABLE}?id=eq.${encode(jobId)}`,
    {
      method: "DELETE",
    }
  );
}

// =========================
// PAYMENTS
// =========================
export async function createTailorPayment({
  tailorId,
  paymentDate,
  amount,
  paymentMethod = "",
  paymentReference = "",
  notes = "",
}) {
  const result = await supabaseFetch(SUPABASE_TAILOR_PAYMENTS_TABLE, {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      tailor_id: tailorId,
      payment_date: paymentDate,
      amount: Number(amount || 0),
      payment_method: paymentMethod || null,
      payment_reference: paymentReference || null,
      notes: notes || null,
    }),
  });

  return singleRow(result);
}

export async function updateTailorPayment(paymentId, changes) {
  const result = await supabaseFetch(
    `${SUPABASE_TAILOR_PAYMENTS_TABLE}?id=eq.${encode(paymentId)}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify(changes),
    }
  );

  return singleRow(result);
}

export async function deleteTailorPayment(paymentId) {
  await supabaseFetch(
    `${SUPABASE_TAILOR_PAYMENTS_TABLE}?id=eq.${encode(paymentId)}`,
    {
      method: "DELETE",
    }
  );
}