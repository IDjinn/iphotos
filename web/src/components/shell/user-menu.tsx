"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logout } from "@/data/api-client";
import { useAuthStore } from "@/stores/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserMenuProps {
  /** Shows the e-mail next to the avatar (sidebar footer variant). */
  withLabel?: boolean;
}

export function UserMenu({ withLabel }: UserMenuProps) {
  const user = useAuthStore((s) => s.user);
  const signedOut = useAuthStore((s) => s.signedOut);
  const router = useRouter();
  const queryClient = useQueryClient();
  const label = user?.displayName || user?.email || "Account";
  const initial = label.charAt(0).toUpperCase();

  const signOut = () => {
    void logout().then(() => {
      queryClient.clear();
      signedOut();
      toast("Signed out");
      router.replace("/login");
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {withLabel ? (
          <Button variant="ghost" className="w-full justify-start gap-2 px-2">
            <Avatar className="size-7">
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
            <span className="truncate text-sm">{label}</span>
          </Button>
        ) : (
          <Button variant="ghost" size="icon" aria-label="Account menu">
            <Avatar className="size-7">
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={signOut}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
