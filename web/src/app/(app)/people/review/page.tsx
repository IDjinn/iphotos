import type { Metadata } from "next";
import { ReviewScreen } from "@/components/people/review-screen";

export const metadata: Metadata = {
  title: "Review faces",
};

export default function ReviewFacesPage() {
  return <ReviewScreen />;
}
