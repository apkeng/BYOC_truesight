"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BackButton() {
  const router = useRouter();

  return (
    <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-3 -ml-2.5">
      <ArrowLeft data-icon="inline-start" />
      Back
    </Button>
  );
}
