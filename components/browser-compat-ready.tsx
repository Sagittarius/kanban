"use client";

import { useEffect } from "react";
import { browserCompatPolicy } from "@/lib/browser-compat";

export default function BrowserCompatReady() {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(browserCompatPolicy.readyEvent));
  }, []);

  return null;
}
