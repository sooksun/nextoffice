"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUser } from "@/lib/auth";

const MANAGER_ROLES = ["DIRECTOR", "VICE_DIRECTOR", "ADMIN"];

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const user = getUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    if (MANAGER_ROLES.includes(user.roleCode)) {
      router.replace("/director");
    } else {
      router.replace("/inbox");
    }
  }, [router]);

  return null;
}
