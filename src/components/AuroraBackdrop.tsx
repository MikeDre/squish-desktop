import "./AuroraBackdrop.css";

interface AuroraBackdropProps {
  active: boolean;
}

export function AuroraBackdrop({ active }: AuroraBackdropProps): JSX.Element {
  return (
    <div
      className={`aurora-backdrop${active ? " aurora-backdrop--active" : ""}`}
      role="presentation"
      aria-hidden="true"
    >
      <span className="aurora-backdrop__glow aurora-backdrop__glow--one" />
      <span className="aurora-backdrop__glow aurora-backdrop__glow--two" />
      <span className="aurora-backdrop__glow aurora-backdrop__glow--three" />
    </div>
  );
}
