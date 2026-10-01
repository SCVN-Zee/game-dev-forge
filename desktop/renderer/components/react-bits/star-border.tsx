import * as React from "react";
import { cn } from "@/lib/utils";

/** Adapted from React Bits StarBorder (TS/Tailwind), MIT + Commons Clause.
 * Source: https://reactbits.dev/r/StarBorder-TS-TW.json
 * License: desktop/renderer/components/react-bits/LICENSE.md
 * A semantic button with pointer-inert glints; motion runs only on interaction.
 */
export function StarBorder({ className, children, ...props }: React.ComponentProps<"button">) {
  return (
    <button {...props} className={cn("star-border relative isolate", className)}>
      <span aria-hidden="true" className="star-glint star-glint-top pointer-events-none absolute -z-10" />
      <span aria-hidden="true" className="star-glint star-glint-bottom pointer-events-none absolute -z-10" />
      {children}
    </button>
  );
}
