"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { useState } from "react";

export function SearchBar({
  basePath,
  placeholder = "Search...",
}: {
  /** where to navigate on submit; defaults to the current path (in-place filtering) */
  basePath?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const target = basePath || pathname;
  const [value, setValue] = useState(target === pathname ? searchParams.get("q") || "" : "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(target === pathname ? searchParams.toString() : "");
    if (value) params.set("q", value);
    else params.delete("q");
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${target}?${qs}` : target!);
  }

  return (
    <form onSubmit={submit} className="w-full max-w-xs">
      <InputGroup className="rounded-full">
        <InputGroupAddon>
          <Search className="size-4" />
        </InputGroupAddon>
        <InputGroupInput
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </InputGroup>
    </form>
  );
}
