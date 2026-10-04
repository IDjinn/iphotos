"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  CloudUploadIcon,
  CreditCardIcon,
  ImagesIcon,
  MenuIcon,
  SettingsIcon,
  SparklesIcon,
  SquareArrowOutUpRightIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useUploadDialogStore } from "@/stores/ui";
import { SearchBar } from "./search-bar";
import { CommandPalette } from "./command-palette";
import { UserMenu } from "./user-menu";
import { UploadDialog } from "@/components/upload/upload-dialog";
import { UploadProcessor } from "@/components/upload/upload-processor";
import {
  Brand,
  Content,
  Main,
  Nav,
  NavItem,
  Shell,
  Sidebar,
  SidebarFooter,
  TopBar,
  TopBarActions,
} from "./app-shell.styles";

const NAV_ITEMS = [
  { href: "/photos", label: "Photos", icon: ImagesIcon },
  { href: "/import", label: "Import", icon: SquareArrowOutUpRightIcon },
  { href: "/subscription", label: "Subscription", icon: CreditCardIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
        <NavItem
          key={href}
          href={href}
          $active={pathname === href || pathname.startsWith(`${href}/`)}
          onClick={onNavigate}
        >
          <Icon aria-hidden />
          {label}
        </NavItem>
      ))}
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const showUpload = useUploadDialogStore((s) => s.show);
  const searchRef = useRef<HTMLDivElement>(null);

  // "/" focuses search, unless the user is already typing somewhere.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
          target.isContentEditable);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.querySelector("input")?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Shell>
      <Sidebar aria-label="Primary">
        <Brand>
          <SparklesIcon aria-hidden />
          iPhotos
        </Brand>
        <Nav aria-label="Sections">
          <NavLinks />
        </Nav>
        <SidebarFooter>
          <UserMenu withLabel />
        </SidebarFooter>
      </Sidebar>
      <Main>
        <TopBar>
          <MobileMenu />
          <div ref={searchRef} className="flex min-w-0 flex-1 justify-center">
            <Suspense fallback={null}>
              <SearchBar />
            </Suspense>
          </div>
          <TopBarActions>
            <Button onClick={showUpload}>
              <CloudUploadIcon aria-hidden />
              <span className="hidden sm:inline">Upload</span>
            </Button>
            <div className="lg:hidden">
              <UserMenu />
            </div>
          </TopBarActions>
        </TopBar>
        <Content>{children}</Content>
      </Main>
      <CommandPalette />
      <UploadProcessor />
      <UploadDialog />
    </Shell>
  );
}

function MobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Open menu"
        >
          <MenuIcon aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetHeader className="px-4 pt-5">
          <SheetTitle>
            <span className="flex items-center gap-2">
              <SparklesIcon aria-hidden className="text-primary" />
              iPhotos
            </span>
          </SheetTitle>
        </SheetHeader>
        <nav aria-label="Sections" className="flex flex-col gap-1 px-3 py-2">
          <NavLinks onNavigate={() => setOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/** Skeleton matching the app shell layout — shown while the session restores. */
export function ShellSkeleton() {
  return (
    <Shell aria-busy="true">
      <Sidebar aria-hidden>
        <Brand>iPhotos</Brand>
        <Nav>
          {NAV_ITEMS.map((item) => (
            <Skeleton key={item.href} className="h-9 rounded-md" />
          ))}
        </Nav>
        <SidebarFooter>
          <Skeleton className="h-9 rounded-md" />
        </SidebarFooter>
      </Sidebar>
      <Main>
        <TopBar>
          <Skeleton className="size-9 rounded-md lg:hidden" />
          <div className="flex min-w-0 flex-1 justify-center">
            <Skeleton className="h-9 w-full max-w-[32rem] rounded-md" />
          </div>
          <TopBarActions>
            <Skeleton className="h-9 w-24 rounded-md" />
          </TopBarActions>
        </TopBar>
        <Content>
          <div className="flex-1 overflow-y-auto p-4 lg:p-8">
            <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-8">
              {Array.from({ length: 32 }, (_, i) => (
                <Skeleton key={i} className="aspect-square rounded-md" />
              ))}
            </div>
          </div>
        </Content>
      </Main>
    </Shell>
  );
}
