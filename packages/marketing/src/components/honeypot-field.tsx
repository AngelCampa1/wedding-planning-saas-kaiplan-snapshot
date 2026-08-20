interface HoneypotFieldProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Hidden honeypot input named "company_website". Real users never see or fill
 * it — automated bots that fill every field will populate it, letting the
 * server reject the submission.
 *
 * It is hidden VISUALLY only (positioned off-screen). The wrapper deliberately
 * carries no `aria-hidden`: the input is focusable, and placing a focusable
 * element inside an `aria-hidden` subtree violates the axe "aria-hidden-focus"
 * rule. Instead the input is removed from the tab order via `tabIndex={-1}`,
 * has `autoComplete="off"`, and is given an empty accessible name so it adds
 * nothing meaningful for assistive tech.
 */
export function HoneypotField({ value, onChange }: HoneypotFieldProps) {
  return (
    <div
      style={{
        position: "absolute",
        left: "-9999px",
        top: "-9999px",
        width: "1px",
        height: "1px",
        overflow: "hidden",
      }}
    >
      <input
        id="company_website"
        name="company_website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-label=""
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
