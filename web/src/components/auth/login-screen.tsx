"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { login } from "@/data/api-client";
import { authErrorMessage } from "@/data/auth-errors";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BrandRow,
  BrandIcon,
  Card,
  Field,
  FieldError,
  Form,
  FormError,
  SwitchLine,
} from "./auth-screen.styles";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): string | null {
  if (!email) return "Enter your e-mail address.";
  if (!EMAIL_PATTERN.test(email)) return "Enter a valid e-mail address.";
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return "Enter your password.";
  return null;
}

export function LoginScreen() {
  const router = useRouter();
  const signedIn = useAuthStore((s) => s.signedIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const runFieldValidation = (field: "email" | "password", value: string) => {
    const error =
      field === "email" ? validateEmail(value) : validatePassword(value);
    setErrors((prev) => ({ ...prev, [field]: error }));
    return error;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    setErrors({ email: emailError, password: passwordError });
    setTouched({ email: true, password: true });
    if (emailError || passwordError) return;

    setSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      signedIn(user);
      router.replace("/photos");
    } catch (error) {
      setFormError(authErrorMessage(error));
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <BrandRow>
        <BrandIcon aria-hidden />
        <h1>Sign in to iPhotos</h1>
        <p>Your photos, everywhere.</p>
      </BrandRow>
      <Form onSubmit={submit} noValidate>
        <Field>
          <label htmlFor="login-email">E-mail</label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={(event) => {
              setTouched((prev) => ({ ...prev, email: true }));
              runFieldValidation("email", event.target.value);
            }}
            aria-invalid={Boolean(touched.email && errors.email)}
            aria-describedby={touched.email && errors.email ? "login-email-error" : undefined}
            placeholder="you@example.com"
          />
          {touched.email && errors.email ? (
            <FieldError id="login-email-error">{errors.email}</FieldError>
          ) : null}
        </Field>
        <Field>
          <label htmlFor="login-password">Password</label>
          <div className="relative">
            <Input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onBlur={(event) => {
                setTouched((prev) => ({ ...prev, password: true }));
                runFieldValidation("password", event.target.value);
              }}
              aria-invalid={Boolean(touched.password && errors.password)}
              aria-describedby={touched.password && errors.password ? "login-password-error" : undefined}
              className="pr-10"
              placeholder="Your password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {showPassword ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
            </button>
          </div>
          {touched.password && errors.password ? (
            <FieldError id="login-password-error">{errors.password}</FieldError>
          ) : null}
        </Field>
        {formError ? <FormError role="alert">{formError}</FormError> : null}
        <Button type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? (
            <>
              <Loader2Icon aria-hidden className="animate-spin" />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </Form>
      <SwitchLine>
        New to iPhotos?{" "}
        <Link href="/register">Create an account</Link>
      </SwitchLine>
    </Card>
  );
}
