"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useThemeStore, type ThemeMode } from "@/stores/theme";
import { useAuthStore } from "@/stores/auth";
import { useUploadDialogStore } from "@/stores/ui";
import { logout } from "@/data/api-client";
import { toast } from "sonner";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useQueryClient } from "@tanstack/react-query";

const PLACES = [
  { href: "/photos", label: "Photos" },
  { href: "/people", label: "People" },
  { href: "/import", label: "Import archive" },
  { href: "/subscription", label: "Subscription" },
  { href: "/settings", label: "Settings" },
];

const THEMES: { mode: ThemeMode; label: string }[] = [
  { mode: "dark", label: "Dark" },
  { mode: "light", label: "Light" },
  { mode: "system", label: "System" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const setMode = useThemeStore((s) => s.setMode);
  const signedOut = useAuthStore((s) => s.signedOut);
  const showUpload = useUploadDialogStore((s) => s.show);

  const toggle = useCallback(() => setOpen((value) => !value), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  const signOut = () => {
    void logout().then(() => {
      queryClient.clear();
      signedOut();
      toast("Signed out");
      router.replace("/login");
    });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No matching commands.</CommandEmpty>
        <CommandGroup heading="Places">
          {PLACES.map((place) => (
            <CommandItem
              key={place.href}
              onSelect={() => run(() => router.push(place.href))}
            >
              {place.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => run(showUpload)}>Upload photos</CommandItem>
          <CommandItem onSelect={() => run(signOut)}>Sign out</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Theme">
          {THEMES.map((theme) => (
            <CommandItem
              key={theme.mode}
              onSelect={() => run(() => setMode(theme.mode))}
            >
              {theme.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
