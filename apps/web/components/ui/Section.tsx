import type { ReactNode } from "react";

export function Shell({
  children,
  className = "",
  width = "shell",
}: {
  children: ReactNode;
  className?: string;
  width?: "shell" | "reading";
}) {
  const max = width === "reading" ? "max-w-reading" : "max-w-shell";
  return <div className={`mx-auto w-full ${max} px-6 md:px-10 ${className}`}>{children}</div>;
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = "left",
  as: Heading = "h2",
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: "left" | "center";
  as?: "h1" | "h2" | "h3";
}) {
  const alignment = align === "center" ? "text-center mx-auto items-center" : "text-left";
  const titleSize = Heading === "h1" ? "text-hero md:text-display" : "text-3xl md:text-4xl";
  return (
    <div className={`flex max-w-reading flex-col gap-3 ${alignment}`}>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <Heading className={`font-serif ${titleSize} leading-[1.05] tracking-tight text-ink`}>
        {title}
      </Heading>
      {lede ? (
        <p className="font-sans text-base leading-7 text-ink-muted md:text-[1.05rem]">{lede}</p>
      ) : null}
    </div>
  );
}

/** Thin label used above figures, cartographic in feel. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="eyebrow text-gold-deep">{children}</p>;
}
