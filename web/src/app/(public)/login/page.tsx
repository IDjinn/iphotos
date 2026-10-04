import type { Metadata } from "next";
import { PublicOnly } from "@/components/auth/public-only";
import { LoginScreen } from "@/components/auth/login-screen";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <PublicOnly>
      <LoginScreen />
    </PublicOnly>
  );
}
