"use client";

/**
 * An inline script that runs once, from the server HTML, before first paint.
 * React warns when it renders a <script> on the client (and would not run it
 * anyway), so the client render marks it text/plain; suppressHydrationWarning
 * covers the type mismatch. The pattern from Next's "preventing flash before
 * hydration" guide.
 */
export default function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
