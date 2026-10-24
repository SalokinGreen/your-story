"use client";

// Mounts the one feedback form, once, in the root layout. An entry point calls
// openFeedback() (feedbackLauncher.ts); this listens, remembers what had focus
// so it can give it back, and renders the form. It renders nothing until asked.

import { useCallback, useEffect, useRef, useState } from "react";
import FeedbackModal from "./FeedbackModal";
import { FEEDBACK_OPEN_EVENT, type FeedbackRequest } from "../misc/feedbackLauncher";

export default function FeedbackHost() {
  const [request, setRequest] = useState<FeedbackRequest | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<FeedbackRequest>).detail;
      if (!detail) return;
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement ? active : null;
      setRequest(detail);
    };
    window.addEventListener(FEEDBACK_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(FEEDBACK_OPEN_EVENT, onOpen);
  }, []);

  const close = useCallback(() => {
    setRequest(null);
    const opener = openerRef.current;
    openerRef.current = null;
    // After the form has unmounted, so the browser does not hand focus back to it.
    if (opener) requestAnimationFrame(() => opener.isConnected && opener.focus());
  }, []);

  if (!request) return null;
  return (
    <FeedbackModal
      key={`${request.kind}:${request.target}`}
      request={request}
      onClose={close}
    />
  );
}
