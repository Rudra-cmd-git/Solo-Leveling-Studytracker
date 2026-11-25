import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PanelProps {
  children: ReactNode;
  className?: string;
  /** Draw the four corner brackets that make a panel read as a System window. */
  corners?: boolean;
  /** Bright gradient outline for the focal panel on a page. */
  glow?: boolean;
  quiet?: boolean;
  style?: CSSProperties;
  id?: string;
}

export function Panel({ children, className, corners = true, glow = false, quiet = false, style, id }: PanelProps) {
  return (
    <div
      id={id}
      style={style}
      className={cn("panel", quiet && "panel-quiet", glow && "panel-glow", className)}
    >
      {corners && (
        <>
          <span className="corner corner-tl" aria-hidden />
          <span className="corner corner-tr" aria-hidden />
          <span className="corner corner-bl" aria-hidden />
          <span className="corner corner-br" aria-hidden />
        </>
      )}
      {children}
    </div>
  );
}

interface PanelHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function PanelHeader({ title, subtitle, action, icon, className }: PanelHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-4", className)}>
      <div className="flex items-start gap-3">
        {icon ? <span className="mt-0.5 text-cyan/80">{icon}</span> : null}
        <div>
          <h2 className="font-hud text-[0.78rem] text-cyan/90">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-faint">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}
