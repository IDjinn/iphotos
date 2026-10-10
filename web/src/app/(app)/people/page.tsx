import type { Metadata } from "next";
import { PeopleScreen } from "@/components/people/people-screen";

export const metadata: Metadata = {
  title: "People",
};

export default function PeoplePage() {
  return <PeopleScreen />;
}
