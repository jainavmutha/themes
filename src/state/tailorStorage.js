

const LS_TAILORS_KEY = "curtain_quote_tailors_v1";

export function loadTailors() {
  try {
    return JSON.parse(localStorage.getItem(LS_TAILORS_KEY) || "[]");
  } catch (error) {
    console.error("Failed to load tailors from localStorage:", error);
    return [];
  }
}

export function saveTailors(tailors) {
  try {
    localStorage.setItem(LS_TAILORS_KEY, JSON.stringify(tailors));
  } catch (error) {
    console.error("Failed to save tailors to localStorage:", error);
  }
}