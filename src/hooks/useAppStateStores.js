import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  loadGlobalFabricProcessing,
  saveGlobalFabricProcessing,
  loadRemoteFabricProcessing,
  saveRemoteFabricProcessing,
  loadPaymentsStore,
  savePaymentsStore,
  loadRemotePaymentsStore,
  saveRemotePaymentsStore,
} from "../services/appStateStorage.js";

import {
  hasSupabaseConfig,
} from "../services/supabase.js";

export default function useAppStateStores() {
  const [
    paymentsStore,
    setPaymentsStoreRaw,
  ] = useState(() =>
    loadPaymentsStore()
  );

  const [
    globalFabricItems,
    setGlobalFabricItemsRaw,
  ] = useState(() =>
    loadGlobalFabricProcessing()
  );

  useEffect(() => {
    let cancelled = false;

    async function hydratePaymentsStore() {
      if (!hasSupabaseConfig()) {
        return;
      }

      try {
        const remotePayments =
          await loadRemotePaymentsStore();

        if (cancelled) return;

        if (
          remotePayments &&
          typeof remotePayments === "object"
        ) {
          setPaymentsStoreRaw(
            remotePayments
          );

          savePaymentsStore(
            remotePayments
          );
        } else {
          const localPayments =
            loadPaymentsStore();

          await saveRemotePaymentsStore(
            localPayments
          );
        }
      } catch (err) {
        console.error(
          "Could not load payments online",
          err
        );
      }
    }

    hydratePaymentsStore();

    return () => {
      cancelled = true;
    };
  }, []);

  const setPaymentsStore =
    useCallback((updater) => {
      setPaymentsStoreRaw((prev) => {
        const next =
          typeof updater === "function"
            ? updater(prev)
            : updater;

        savePaymentsStore(next);

        if (hasSupabaseConfig()) {
          saveRemotePaymentsStore(
            next
          ).catch((err) =>
            console.error(
              "Could not save payments online",
              err
            )
          );
        }

        return next;
      });
    }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateFabricProcessing() {
      if (!hasSupabaseConfig()) {
        return;
      }

      try {
        const remoteItems =
          await loadRemoteFabricProcessing();

        if (cancelled) return;

        if (
          Array.isArray(remoteItems)
        ) {
          setGlobalFabricItemsRaw(
            remoteItems
          );

          saveGlobalFabricProcessing(
            remoteItems
          );
        } else {
          const localItems =
            loadGlobalFabricProcessing();

          await saveRemoteFabricProcessing(
            localItems
          );
        }
      } catch (err) {
        console.error(
          "Could not load fabric processing online",
          err
        );
      }
    }

    hydrateFabricProcessing();

    return () => {
      cancelled = true;
    };
  }, []);

  const setGlobalFabricItems =
    useCallback((updater) => {
      setGlobalFabricItemsRaw(
        (prev) => {
          const next =
            typeof updater ===
            "function"
              ? updater(prev)
              : updater;

          saveGlobalFabricProcessing(
            next
          );

          if (
            hasSupabaseConfig()
          ) {
            saveRemoteFabricProcessing(
              next
            ).catch((err) =>
              console.error(
                "Could not save fabric processing online",
                err
              )
            );
          }

          return next;
        }
      );
    }, []);

  return {
    paymentsStore,
    setPaymentsStore,

    globalFabricItems,
    setGlobalFabricItems,
  };
}