import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header flex shrink-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold leading-6 tracking-tight text-foreground">{title}</h2>
        {description ? <div className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
