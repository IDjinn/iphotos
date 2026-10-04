import type { Metadata } from "next";
import { GalleryScreen } from "@/components/gallery/gallery-screen";

export const metadata: Metadata = {
  title: "Photos",
};

export default function PhotosPage() {
  return <GalleryScreen />;
}
