"use client";

import { useEffect } from "react";
import { initializeFonts } from "./FontSettingsTab";

/**
 * Client-side component that initializes custom fonts on app load.
 * Should be placed near the root of the app.
 */
export default function FontInitializer() {
  useEffect(() => {
    initializeFonts();
  }, []);

  return null;
}
