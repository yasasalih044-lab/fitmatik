import Chrome from "@/components/Chrome";
import SettingsClient from "./SettingsClient";

export const metadata = { title: "Ayarlar · Fit-matik" };

export default function AyarlarPage() {
  return (
    <Chrome>
      <SettingsClient />
    </Chrome>
  );
}
