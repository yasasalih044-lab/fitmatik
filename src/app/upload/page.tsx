import Chrome from "@/components/Chrome";
import UploadClient from "./UploadClient";

export const metadata = { title: "Ekle · Fit-matik" };

export default function UploadPage() {
  return (
    <Chrome>
      <UploadClient />
    </Chrome>
  );
}
