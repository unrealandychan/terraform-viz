import { LlmSettings } from "@/components/settings/LlmSettings";

export default function SettingsPage() {
  return (
    <div className="page-container">
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">Configure providers and preferences for Terraform Viz.</p>
      <div className="settings-page">
        <LlmSettings />
      </div>
    </div>
  );
}
