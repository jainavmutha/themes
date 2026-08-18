

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  SETTINGS_KEY,
  DEFAULT_SETTINGS,
  loadSettings,
  mergeSettingsWithDefaults,
} from "../constants/settings.js";

import {
  loadRemoteSettings,
  saveRemoteSettings,
} from "../services/settingsStorage.js";

export default function useSettingsManager() {
  const [settings, setSettings] = useState(() => loadSettings());
  const [settingsReady, setSettingsReady] = useState(false);
  const settingsHydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSettings() {
      const localSettings = mergeSettingsWithDefaults(loadSettings());

      try {
        const remoteSettings = await loadRemoteSettings();

        if (cancelled) return;

        if (remoteSettings) {
          setSettings(
            mergeSettingsWithDefaults(remoteSettings)
          );
        } else {
          setSettings(localSettings);
        }
      } catch (error) {
        console.error("Could not load remote settings", error);

        if (!cancelled) {
          setSettings(localSettings);
        }
      } finally {
        if (!cancelled) {
          settingsHydratedRef.current = true;
          setSettingsReady(true);
        }
      }
    }

    hydrateSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsHydratedRef.current) return;

    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify(settings)
      );
    } catch (error) {
      console.error("Could not save local settings", error);
    }

    saveRemoteSettings(settings).catch((error) => {
      console.error("Could not save remote settings", error);
    });
  }, [settings]);

  const handleAddStitch = useCallback(() => {
    setSettings((current) => ({
      ...current,
      stitchingTypes: [
        ...(current.stitchingTypes || []),
        {
          id: crypto.randomUUID(),
          label: "New Stitching",
          ratePerPanel: 0,
        },
      ],
    }));
  }, []);

  const handleStitchChange = useCallback((index, patch) => {
    setSettings((current) => ({
      ...current,
      stitchingTypes: (current.stitchingTypes || []).map(
        (item, itemIndex) =>
          itemIndex === index
            ? { ...item, ...patch }
            : item
      ),
    }));
  }, []);

  const handleDeleteStitch = useCallback((index) => {
    setSettings((current) => ({
      ...current,
      stitchingTypes: (current.stitchingTypes || []).filter(
        (_, itemIndex) => itemIndex !== index
      ),
    }));
  }, []);

  const handleAddLining = useCallback(() => {
    setSettings((current) => ({
      ...current,
      linings: [
        ...(current.linings || []),
        {
          id: crypto.randomUUID(),
          label: "New Lining",
          ratePerMeter: 0,
        },
      ],
    }));
  }, []);

  const handleLiningChange = useCallback((index, patch) => {
    setSettings((current) => ({
      ...current,
      linings: (current.linings || []).map(
        (item, itemIndex) =>
          itemIndex === index
            ? { ...item, ...patch }
            : item
      ),
    }));
  }, []);

  const handleDeleteLining = useCallback((index) => {
    setSettings((current) => ({
      ...current,
      linings: (current.linings || []).filter(
        (_, itemIndex) => itemIndex !== index
      ),
    }));
  }, []);

  const handleAddTrack = useCallback(() => {
    setSettings((current) => ({
      ...current,
      tracks: [
        ...(current.tracks || []),
        {
          id: crypto.randomUUID(),
          label: "New Track",
          ratePerFt: current.trackRatePerFt || 0,
        },
      ],
    }));
  }, []);

  const handleTrackChange = useCallback((index, patch) => {
    setSettings((current) => ({
      ...current,
      tracks: (current.tracks || []).map(
        (item, itemIndex) =>
          itemIndex === index
            ? { ...item, ...patch }
            : item
      ),
    }));
  }, []);

  const handleDeleteTrack = useCallback((index) => {
    setSettings((current) => ({
      ...current,
      tracks: (current.tracks || []).filter(
        (_, itemIndex) => itemIndex !== index
      ),
    }));
  }, []);

  const handleAddGstCategory = useCallback(() => {
    setSettings((current) => ({
      ...current,
      gstCategories: [
        ...(current.gstCategories || []),
        {
          id: crypto.randomUUID(),
          label: "New GST Category",
          rate: 18,
        },
      ],
    }));
  }, []);

  const handleGstCategoryChange = useCallback((index, patch) => {
    setSettings((current) => ({
      ...current,
      gstCategories: (current.gstCategories || []).map(
        (item, itemIndex) =>
          itemIndex === index
            ? { ...item, ...patch }
            : item
      ),
    }));
  }, []);

  const handleDeleteGstCategory = useCallback((index) => {
    setSettings((current) => {
      const next = (current.gstCategories || []).filter(
        (_, itemIndex) => itemIndex !== index
      );

      return {
        ...current,
        gstCategories:
          next.length > 0
            ? next
            : DEFAULT_SETTINGS.gstCategories,
      };
    });
  }, []);

  return {
    settings,
    setSettings,
    settingsReady,

    handleAddStitch,
    handleStitchChange,
    handleDeleteStitch,

    handleAddLining,
    handleLiningChange,
    handleDeleteLining,

    handleAddTrack,
    handleTrackChange,
    handleDeleteTrack,

    handleAddGstCategory,
    handleGstCategoryChange,
    handleDeleteGstCategory,
  };
}