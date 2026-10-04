"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { SearchBox } from "./app-shell.styles";

/**
 * Live search that drives the gallery filters through URL search params
 * (`replace` while typing — never one history entry per keystroke — and a
 * real history entry on submit). Typing anywhere navigates to /photos.
 */
export function SearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = pathname === "/photos" ? (searchParams.get("q") ?? "") : "";
  const [value, setValue] = useState(urlQuery);
  const [prevUrlQuery, setPrevUrlQuery] = useState(urlQuery);

  // Keep the input in sync when the URL changes externally (back, palette):
  // render-phase adjustment, no effect needed.
  if (urlQuery !== prevUrlQuery) {
    setPrevUrlQuery(urlQuery);
    setValue(urlQuery);
  }

  const apply = (next: string, push: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("q", next);
    else params.delete("q");
    const qs = params.toString();
    const target = qs ? `/photos?${qs}` : "/photos";
    if (push) router.push(target);
    else router.replace(target, { scroll: false });
  };

  return (
    <form
      role="search"
      className="w-full max-w-[32rem]"
      onSubmit={(event) => {
        event.preventDefault();
        apply(value, true);
      }}
    >
      <SearchBox>
        <SearchIcon aria-hidden />
        <input
          type="search"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            apply(event.target.value, false);
          }}
          placeholder="Search photos by file name"
          aria-label="Search photos by file name"
        />
        <kbd aria-hidden>/</kbd>
      </SearchBox>
    </form>
  );
}
