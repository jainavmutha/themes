export const LS_AUTH_USER_KEY = "themes_auth_user_v1";

export const AUTH_USERS = [
  {
    username: "admin",
    password: "Themes@141$",
    role: "admin",
    label: "Admin",
  },
  {
    username: "staff",
    password: "staff123",
    role: "staff",
    label: "Staff",
  },
];

export const STAFF_ALLOWED_TABS = new Set([
  "quote",
  "payments",
  "settings",
  "fabric-processing",
]);

export function canAccessTab(user, tab) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "staff") {
    return STAFF_ALLOWED_TABS.has(tab);
  }
  return false;
}