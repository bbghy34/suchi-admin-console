const KINDS = {
  pdf: { label: 'PDF', color: '#E5252A' },
  image: { label: 'IMG', color: '#8B5CF6' },
  word: { label: 'DOC', color: '#2B579A' },
  sheet: { label: 'XLS', color: '#1D6F42' },
  archive: { label: 'ZIP', color: '#B7791F' },
  text: { label: 'TXT', color: '#64748B' },
  file: { label: 'FILE', color: '#64748B' },
};

/** Works out the file family from the MIME type first, then the extension. */
export function fileKind(fileName = '', mime = '') {
  const m = String(mime || '').toLowerCase();
  const ext = String(fileName || '').toLowerCase().split('.').pop();
  if (m.includes('pdf') || ext === 'pdf') return 'pdf';
  if (m.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp', 'tif', 'tiff'].includes(ext)) return 'image';
  if (m.includes('word') || ['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'word';
  if (m.includes('sheet') || m.includes('excel') || m.includes('csv') || ['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'sheet';
  if (m.includes('zip') || m.includes('compressed') || ['zip', 'rar', '7z', 'gz'].includes(ext)) return 'archive';
  if (m.startsWith('text/') || ['txt', 'md', 'json', 'xml'].includes(ext)) return 'text';
  return 'file';
}

export function FileTypeIcon({ fileName, mime, size = 28, className = '' }) {
  const kind = fileKind(fileName, mime);
  const { label, color } = KINDS[kind];
  return (
    <svg viewBox="0 0 32 40" width={size * 0.8} height={size} className={`shrink-0 ${className}`} role="img" aria-label={`${label} file`}>
      <path d="M4 1h17l10 10v26a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z" fill={color} />
      <path d="M21 1v8a2 2 0 0 0 2 2h8z" fill="#fff" fillOpacity=".4" />
      <text x="16" y="31" textAnchor="middle" fontSize={label.length > 3 ? 7 : 8.5} fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">{label}</text>
    </svg>
  );
}

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
