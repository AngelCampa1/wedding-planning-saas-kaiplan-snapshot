interface BrandLogoProps {
  compact?: boolean;
  className?: string;
}

export function BrandLogo({ compact = false, className }: BrandLogoProps) {
  const label = compact ? "Kaiplan" : "Kaiplan wedding planning";

  if (compact) {
    return (
      <img
        src="/logo-mark.svg"
        alt={label}
        className={className ?? "h-8 w-8"}
        width="32"
        height="32"
      />
    );
  }

  return (
    <img
      src="/logo-light.svg"
      alt={label}
      className={className ?? "h-10 w-auto"}
      width="150"
      height="40"
    />
  );
}
