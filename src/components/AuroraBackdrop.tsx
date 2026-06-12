import "./AuroraBackdrop.css";

interface AuroraBackdropProps {
  active: boolean;
}

export function AuroraBackdrop({ active }: AuroraBackdropProps) {
  return (
    <div
      className={`aurora-backdrop${active ? " aurora-backdrop--active" : ""}`}
      role="presentation"
      aria-hidden="true"
    >
      <div className="aurora-backdrop__glow aurora-backdrop__glow--one" />
      <div className="aurora-backdrop__glow aurora-backdrop__glow--two" />
      <div className="aurora-backdrop__glow aurora-backdrop__glow--three" />
    </div>
  );
}
