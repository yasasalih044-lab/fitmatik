import Chrome from "@/components/Chrome";
import DashboardClient from "./DashboardClient";

export const metadata = { title: "Günlük · Fit-matik" };

export default function DashboardPage() {
  return (
    <Chrome>
      <DashboardClient />
    </Chrome>
  );
}
