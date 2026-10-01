import * as React from "react";
import { cn } from "@/lib/utils";

/** Adapted from React Bits SpotlightCard (TS/Tailwind), MIT + Commons Clause.
 * Source: https://reactbits.dev/r/SpotlightCard-TS-TW.json
 * License: desktop/renderer/components/react-bits/LICENSE.md
 * Pointer coordinates stay in CSS rather than rerendering the card's contents.
 */
export function SpotlightCard({
  className, children, onPointerMove, onPointerLeave, ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn("spotlight-card relative isolate", className)}
      onPointerMove={(event) => {
        if (event.pointerType !== "touch") {
          const bounds = event.currentTarget.getBoundingClientRect();
          event.currentTarget.style.setProperty("--spotlight-x", `${event.clientX - bounds.left}px`);
          event.currentTarget.style.setProperty("--spotlight-y", `${event.clientY - bounds.top}px`);
        }
        onPointerMove?.(event);
      }}
      onPointerLeave={onPointerLeave}
    >
      <div aria-hidden="true" className="spotlight-glow pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />
      {children}
    </div>
  );
}
