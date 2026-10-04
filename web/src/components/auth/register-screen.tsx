"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { register } from "@/data/api-client";
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

export function RegisterScreen() {
  const router = useRouter();
  const signedIn = useAuthStore((s) => s.signedIn);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const runFieldValidation = (field: "email" | "password", value: string) => {
    let error: string | null = null;
    if (field === "email") {
      if (!value) error = "Enter your e-mail address.";
      else if (!EMAIL_PATTERN.test(value)) error = "Enter a valid e-mail address.";
    } else {
      if (!value) error = "Choose a password.";
      else if (value.length < 8) error = "Use at least 8 characters.";
    }
    setErrors((prev) => ({ ...prev, [field]: error }));
    return error;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const emailError = email === "" ? "Enter your e-mail address." : EMAIL_PATTERN.test(email) ? null : "Enter a valid e-mail address.";
    const passwordError = password.length < 8 ? "Use at least 8 characters." : null;
    setErrors({ email: emailError, password: passwordError });
    setTouched({ email: true, password: true });
    if (emailError || passwordError) return;

    setSubmitting(true);
    try {
      const user = await register(email.trim(), password, displayName.trim() || undefined);
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
        <h1>Create your account</h1>
        <p>Back up your photos and reach them from any device.</p>
      </BrandRow>
      <Form onSubmit={submit} noValidate>
        <Field>
          <label htmlFor="register-name">Name (optional)</label>
          <Input
            id="register-name"
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="How should we call you?"
          />
        </Field>
        <Field>
          <label htmlFor="register-email">E-mail</label>
          <Input
            id="register-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={(event) => {
              setTouched((prev) => ({ ...prev, email: true }));
              runFieldValidation("email", event.target.value);
            }}
            aria-invalid={Boolean(touched.email && errors.email)}
            aria-describedby={touched.email && errors.email ? "register-email-error" : undefined}
            placeholder="you@example.com"
          />
          {touched.email && errors.email ? (
            <FieldError id="register-email-error">{errors.email}</FieldError>
          ) : null}
        </Field>
        <Field>
          <label htmlFor="register-password">Password</label>
          <div className="relative">
            <Input
              id="register-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onBlur={(event) => {
                setTouched((prev) => ({ ...prev, password: true }));
                runFieldValidation("password", event.target.value);
              }}
              aria-invalid={Boolean(touched.password && errors.password)}
              aria-describedby={touched.password && errors.password ? "register-password-error" : undefined}
              className="pr-10"
              placeholder="At least 8 characters"
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
            <FieldError id="register-password-error">{errors.password}</FieldError>
          ) : null}
        </Field>
        {formError ? <FormError role="alert">{formError}</FormError> : null}
        <Button type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? (
            <>
              <Loader2Icon aria-hidden className="animate-spin" />
              Creating account…
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </Form>
      <SwitchLine>
        Already have an account?{" "}
        <Link href="/login">Sign in</Link>
      </SwitchLine>
    </Card>
  );
}
