/** Small "made by" mark for the Settings page. Hovering reveals a short note. */
export default function MakerMark() {
  return (
    <a href="https://boatbrothers.in" target="_blank" rel="noopener noreferrer" className="maker-mark" aria-label="Luit, made by Boat Brothers">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v11" />
        <path d="M12 4.5 18 12h-6" />
        <path d="M12 6.5 7.5 12H12" />
        <path d="M3.5 15h17l-2.2 3.4a2 2 0 0 1-1.7.9H7.4a2 2 0 0 1-1.7-.9z" />
        <path d="M3 21c1.2 0 1.8-.8 3-.8s1.8.8 3 .8 1.8-.8 3-.8 1.8.8 3 .8 1.8-.8 3-.8 1.8.8 3 .8" />
      </svg>
      <span>Luit · made by Boat Brothers</span>
      <span className="maker-note">· every river needs a boat</span>
    </a>
  );
}
