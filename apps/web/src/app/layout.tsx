import type { Metadata } from "next";
import ClientShell from "@/components/layout/ClientShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Terraform Viz",
  description: "Visualize, price, and compare Terraform plans before you apply",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
