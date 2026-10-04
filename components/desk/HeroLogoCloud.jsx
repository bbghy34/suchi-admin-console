/** Decorative wall of source logos drifting behind the dashboard hero. Purely visual. */

const Gmail = () => (
  <svg viewBox="0 0 48 48" width="30" height="30" aria-hidden="true">
    <path fill="#4285F4" d="M6 40h7V22L4 15v22a3 3 0 0 0 2 3z" />
    <path fill="#34A853" d="M35 40h7a3 3 0 0 0 2-3V15l-9 7z" />
    <path fill="#FBBC04" d="M35 11v11l9-7v-4c0-3.7-4.2-5.8-7.2-3.6z" />
    <path fill="#EA4335" d="M13 22V11l11 8.3L35 11v11l-11 8.3z" />
    <path fill="#C5221F" d="M4 11v4l9 7V11l-1.8-1.6C8.2 7.2 4 9.3 4 11z" />
  </svg>
);

const Drive = () => (
  <svg viewBox="0 0 48 48" width="30" height="30" aria-hidden="true">
    <path fill="#0066DA" d="M7.6 38.4 9.7 42c.4.8 1.1 1.3 1.8 1.7L19 30.8H4c0 .8.2 1.6.6 2.3z" />
    <path fill="#00AC47" d="M24 17.2 16.5 4.3c-.7.4-1.4 1-1.8 1.7L4.6 28.5c-.4.7-.6 1.5-.6 2.3h15z" />
    <path fill="#EA4335" d="M36.5 43.7c.7-.4 1.4-1 1.8-1.7l.9-1.5 4.2-7.3c.4-.7.6-1.5.6-2.3H29l3.2 6.3z" />
    <path fill="#00832D" d="M24 17.2 31.5 4.3C30.8 3.9 30 3.7 29.2 3.7H18.8c-.8 0-1.6.2-2.3.6z" />
    <path fill="#2684FC" d="M29 30.8H19l-7.5 12.9c.7.4 1.5.6 2.3.6h20.4c.8 0 1.6-.2 2.3-.6z" />
    <path fill="#FFBA00" d="m36.4 17.9-7-12.1c-.4-.7-1.1-1.3-1.8-1.7L24 17.2l5 13.6h15c0-.8-.2-1.6-.6-2.3z" />
  </svg>
);

const DocFile = ({ color, label }) => (
  <svg viewBox="0 0 48 48" width="30" height="30" aria-hidden="true">
    <path fill={color} d="M12 4h17l11 11v27a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    <path fill="#fff" fillOpacity=".45" d="M29 4v9a2 2 0 0 0 2 2h9z" />
    <text x="25" y="36" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">{label}</text>
  </svg>
);

const Globe = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="#60a5fa" strokeWidth="1.6">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
  </svg>
);

const Mono = ({ text, color }) => (
  <span className="text-[11px] font-bold tracking-tight" style={{ color }}>{text}</span>
);

const ROWS = [
  [
    ['Gmail', <Gmail key="g" />],
    ['PDF', <DocFile key="p" color="#E5252A" label="PDF" />],
    ['GeM', <Mono key="gem" text="GeM" color="#f97316" />],
    ['Web', <Globe key="w" />],
    ['Drive', <Drive key="d" />],
    ['CPPP', <Mono key="cppp" text="CPPP" color="#38bdf8" />],
    ['Excel', <DocFile key="x" color="#1D6F42" label="XLS" />],
  ],
  [
    ['Assam', <Mono key="as" text="Assam" color="#34d399" />],
    ['Word', <DocFile key="w2" color="#2B579A" label="DOC" />],
    ['IOCL', <Mono key="io" text="IOCL" color="#fb923c" />],
    ['Gmail', <Gmail key="g2" />],
    ['PMGSY', <Mono key="pm" text="PMGSY" color="#a78bfa" />],
    ['PDF', <DocFile key="p2" color="#E5252A" label="PDF" />],
    ['NTPC', <Mono key="nt" text="NTPC" color="#60a5fa" />],
  ],
  [
    ['Drive', <Drive key="d2" />],
    ['CIL', <Mono key="cil" text="CIL" color="#facc15" />],
    ['Web', <Globe key="w3" />],
    ['BOQ', <DocFile key="b" color="#1D6F42" label="BOQ" />],
    ['Tripura', <Mono key="tr" text="Tripura" color="#f472b6" />],
    ['PDF', <DocFile key="p3" color="#E5252A" label="PDF" />],
    ['NBCC', <Mono key="nb" text="NBCC" color="#2dd4bf" />],
  ],
];

export function HeroLogoCloud() {
  return (
    <div className="d-logo-cloud" aria-hidden="true">
      {ROWS.map((row, r) => (
        <div key={r} className="d-marquee" data-reverse={r % 2 ? 'true' : undefined} style={{ animationDuration: `${46 + r * 8}s` }}>
          {[...row, ...row].map(([name, icon], i) => (
            <span key={`${name}-${i}`} className="d-logo-tile">{icon}</span>
          ))}
        </div>
      ))}
    </div>
  );
}
