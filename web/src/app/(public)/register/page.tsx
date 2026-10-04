import type { Metadata } from "next";
import { PublicOnly } from "@/components/auth/public-only";
import { RegisterScreen } from "@/components/auth/register-screen";

export const metadata: Metadata = {
  title: "Create account",
};

export default function RegisterPage() {
  return (
    <PublicOnly>
      <RegisterScreen />
    </PublicOnly>
  );
}
