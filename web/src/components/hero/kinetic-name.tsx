/** Letters rise in on load and hop when hovered (pure CSS, see .kinetic-letter). */
export function KineticName({ text }: { text: string }) {
  let index = 0;
  return (
    <span aria-label={text} role="text" className="block">
      {text.split(" ").map((word, w) => (
        <span key={w} aria-hidden className="block whitespace-nowrap">
          {word.split("").map((ch) => {
            const i = index++;
            return (
              <span
                key={i}
                className="kinetic-letter cursor-default"
                style={{ "--i": i, "--r": `${i % 2 ? 5 : -5}deg` } as React.CSSProperties}
              >
                {ch}
              </span>
            );
          })}
        </span>
      ))}
    </span>
  );
}
