"use client";

import { useTheme } from "../layout/ThemeProvider";

export function ThemeSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <section className="settings-section">
      <h2 className="settings-section__title">Appearance</h2>
      <p className="settings-section__subtitle">
        Choose how TerraViz looks to you.
      </p>

      <div className="settings-field">
        <label>Theme</label>
        <div className="settings-presets">
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={`settings-preset-btn${theme === "light" ? " settings-preset-btn--active" : ""}`}
          >
            Light
          </button>
          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={`settings-preset-btn${theme === "dark" ? " settings-preset-btn--active" : ""}`}
          >
            Dark
          </button>
        </div>
      </div>
    </section>
  );
}
