import { PlanUpload } from "@/components/upload/PlanUpload";

export default function UploadPage() {
  return (
    <div className="page-container">
      <h1 className="page-title">Upload Terraform Plan</h1>
      <p className="page-subtitle">
        Paste or upload the JSON output from <code>terraform show -json</code> to generate a visual
        graph.
      </p>
      <PlanUpload />
    </div>
  );
}
