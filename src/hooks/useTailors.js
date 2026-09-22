import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchTailors,
  createTailor,
  deleteTailor as deleteTailorRecord,
  createTailorService,
  deleteTailorService,
  createTailorJob,
  deleteTailorJob,
  createTailorPayment,
  deleteTailorPayment,
} from "../services/tailorService.js";

const today = () => new Date().toISOString().slice(0, 10);

function normalizeTailorData(tailors) {
  return (tailors || []).map((tailor) => ({
    ...tailor,
    services: (tailor.services || []).map((service) => ({
      ...service,
      rate: Number(service.rate || 0),
    })),
    jobs: (tailor.jobs || []).map((job) => ({
      ...job,
      date: job.work_date,
      serviceId: job.service_id,
      serviceName: job.service_name,
      qty: Number(job.quantity || 0),
      rate: Number(job.rate || 0),
      amount: Number(job.amount || 0),
      note: job.notes || "",
    })),
    payments: (tailor.payments || []).map((payment) => ({
      ...payment,
      date: payment.payment_date,
      amount: Number(payment.amount || 0),
      note: payment.notes || "",
    })),
  }));
}

export default function useTailors() {
  const [tailors, setTailors] = useState([]);
  const [selectedTailorId, setSelectedTailorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [newTailor, setNewTailor] = useState({ name: "", phone: "" });
  const [newService, setNewService] = useState({
    name: "",
    unit: "Piece",
    rate: "",
  });
  const [newWork, setNewWork] = useState({
    serviceId: "",
    date: today(),
    qty: 1,
    rate: "",
    note: "",
  });
  const [newPayment, setNewPayment] = useState({
    date: today(),
    amount: "",
    note: "",
  });

  const loadTailors = useCallback(async ({ preserveSelection = true } = {}) => {
    setLoading(true);
    setError("");

    try {
      const data = normalizeTailorData(await fetchTailors());
      setTailors(data);

      setSelectedTailorId((currentId) => {
        if (
          preserveSelection &&
          currentId &&
          data.some((tailor) => tailor.id === currentId)
        ) {
          return currentId;
        }

        return data[0]?.id || "";
      });
    } catch (err) {
      console.error("Failed to load tailors:", err);
      setError(err?.message || "Failed to load tailors.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTailors({ preserveSelection: false });
  }, [loadTailors]);

  const selectedTailor =
    tailors.find((tailor) => tailor.id === selectedTailorId) || null;

  const totals = useMemo(() => {
    if (!selectedTailor) {
      return { work: 0, paid: 0, balance: 0 };
    }

    const work = (selectedTailor.jobs || []).reduce(
      (sum, job) => sum + Number(job.amount || 0),
      0
    );

    const paid = (selectedTailor.payments || []).reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    );

    return {
      work,
      paid,
      balance: work - paid,
    };
  }, [selectedTailor]);

  const runMutation = async (action) => {
    setSaving(true);
    setError("");

    try {
      const result = await action();
      await loadTailors();
      return result;
    } catch (err) {
      console.error("Tailor operation failed:", err);
      setError(err?.message || "Tailor operation failed.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const addTailor = async () => {
    const name = newTailor.name.trim();
    if (!name || saving) return;

    setSaving(true);
    setError("");

    try {
      const created = await createTailor({
        name,
        phone: newTailor.phone.trim(),
      });

      setNewTailor({ name: "", phone: "" });

      const data = normalizeTailorData(await fetchTailors());
      setTailors(data);
      setSelectedTailorId(created?.id || data[0]?.id || "");
    } catch (err) {
      console.error("Failed to add tailor:", err);
      setError(err?.message || "Failed to add tailor.");
    } finally {
      setSaving(false);
      setLoading(false);
    }
  };

  const deleteTailor = async (tailorId) => {
    if (saving) return;

    if (
      !window.confirm(
        "Delete this tailor and all their work/payment history?"
      )
    ) {
      return;
    }

    const wasSelected = selectedTailorId === tailorId;

    await runMutation(async () => {
      await deleteTailorRecord(tailorId);
      if (wasSelected) {
        setSelectedTailorId("");
      }
    });
  };

  const addService = async () => {
    if (
      !selectedTailor ||
      !newService.name.trim() ||
      Number(newService.rate) < 0 ||
      saving
    ) {
      return;
    }

    const created = await runMutation(() =>
      createTailorService({
        tailorId: selectedTailor.id,
        name: newService.name.trim(),
        unit: newService.unit.trim() || "Piece",
        rate: Number(newService.rate || 0),
      })
    );

    if (created) {
      setNewService({ name: "", unit: "Piece", rate: "" });
    }
  };

  const removeService = async (serviceId) => {
    if (!selectedTailor || saving) return;

    await runMutation(() => deleteTailorService(serviceId));
  };

  const chooseService = (serviceId) => {
    const service = selectedTailor?.services?.find(
      (item) => item.id === serviceId
    );

    setNewWork((previous) => ({
      ...previous,
      serviceId,
      rate: service ? String(service.rate) : "",
    }));
  };

  const addWork = async () => {
    if (!selectedTailor || !newWork.serviceId || saving) return;

    const service = selectedTailor.services?.find(
      (item) => item.id === newWork.serviceId
    );
    const qty = Number(newWork.qty || 0);
    const rate = Number(newWork.rate || 0);

    if (!service || qty <= 0 || rate < 0) return;

    const created = await runMutation(() =>
      createTailorJob({
        tailorId: selectedTailor.id,
        serviceId: service.id,
        serviceName: service.name,
        unit: service.unit,
        workDate: newWork.date || today(),
        quantity: qty,
        rate,
        notes: newWork.note.trim(),
      })
    );

    if (created) {
      setNewWork({
        serviceId: "",
        date: today(),
        qty: 1,
        rate: "",
        note: "",
      });
    }
  };

  const removeWork = async (jobId) => {
    if (!selectedTailor || saving) return;

    await runMutation(() => deleteTailorJob(jobId));
  };

  const addPayment = async () => {
    if (!selectedTailor || saving) return;

    const amount = Number(newPayment.amount || 0);
    if (amount <= 0) return;

    const created = await runMutation(() =>
      createTailorPayment({
        tailorId: selectedTailor.id,
        paymentDate: newPayment.date || today(),
        amount,
        notes: newPayment.note.trim(),
      })
    );

    if (created) {
      setNewPayment({
        date: today(),
        amount: "",
        note: "",
      });
    }
  };

  const removePayment = async (paymentId) => {
    if (!selectedTailor || saving) return;

    await runMutation(() => deleteTailorPayment(paymentId));
  };

  return {
    tailors,
    selectedTailorId,
    selectedTailor,
    totals,
    loading,
    saving,
    error,
    newTailor,
    newService,
    newWork,
    newPayment,
    setSelectedTailorId,
    setNewTailor,
    setNewService,
    setNewWork,
    setNewPayment,
    addTailor,
    deleteTailor,
    addService,
    removeService,
    chooseService,
    addWork,
    removeWork,
    addPayment,
    removePayment,
    reloadTailors: loadTailors,
  };
}