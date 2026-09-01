"use client";

import { useEffect } from "react";
import { browserCompatPolicy } from "@/lib/browser-compat";

export default function BrowserCompatReady() {
  useEffect(() => {
    const root = document.documentElement;

    function markPointerInput() {
      root.setAttribute("data-input-mode", "pointer");
    }

    function markKeyboardInput(event: KeyboardEvent) {
      if (event.key === "Tab") {
        root.setAttribute("data-input-mode", "keyboard");
      }
    }

    markPointerInput();
    window.addEventListener("mousedown", markPointerInput, true);
    window.addEventListener("pointerdown", markPointerInput, true);
    window.addEventListener("touchstart", markPointerInput, true);
    window.addEventListener("keydown", markKeyboardInput, true);
    window.dispatchEvent(new CustomEvent(browserCompatPolicy.readyEvent));

    return () => {
      window.removeEventListener("mousedown", markPointerInput, true);
      window.removeEventListener("pointerdown", markPointerInput, true);
      window.removeEventListener("touchstart", markPointerInput, true);
      window.removeEventListener("keydown", markKeyboardInput, true);
    };
  }, []);

  return null;
}
