export type Theme = "dark" | "light";
const THEME_KEY = "tf-viz:theme";

export function getStoredTheme(): Theme {
  if (typeof localStorage === "undefined") return "dark";
  return (localStorage.getItem(THEME_KEY) as Theme) ?? "dark";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
}

export function toggleTheme(): Theme {
  const current = (document.documentElement.getAttribute("data-theme") as Theme) ?? "dark";
  const next: Theme = current === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}
