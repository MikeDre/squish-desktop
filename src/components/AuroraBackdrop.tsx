import "./AuroraBackdrop.css";

interface AuroraBackdropProps {
  active: boolean;
}

export function AuroraBackdrop({ active }: AuroraBackdropProps): JSX.Element {
  return (
    <div className={`aurora${active ? " aurora--active" : ""}`} aria-hidden="true">
      <span className="aurora__glow aurora__glow--1" />
      <span className="aurora__glow aurora__glow--2" />
      <span className="aurora__glow aurora__glow--3" />
    </div>
  );
}
