// Theme Editor configuration.
//
// FONT_OPTIONS are ready-to-use CSS font-family stacks. Two groups:
//   1. "Bundled" fonts are self-hosted (SIL OFL) in public/fonts/ via
//      @font-face rules in index.css, so they render identically offline on any
//      kiosk regardless of what the OS has installed. License texts live in
//      public/fonts/licenses/.
//   2. "System" fonts ship with Windows (the kiosk OS) and need no files.
// Every stack ends in a generic fallback. For anything outside this list, pick
// "Custom…" in the editor and type the family name. To bundle another OFL/Apache
// font later: drop its .woff2 into public/fonts/, add an @font-face rule in
// index.css, add its LICENSE to public/fonts/licenses/, then add an entry here.

// Sentinel select value that reveals the free-text font input in the editor.
export const CUSTOM_FONT_VALUE = "__custom__";

export const FONT_OPTIONS = [
  // Bundled, self-hosted open fonts (offline-safe) — sans-serif
  { label: "Roboto (bundled)", value: "Roboto, Arial, sans-serif" },
  { label: "Open Sans (bundled)", value: "'Open Sans', Arial, sans-serif" },
  { label: "Lato (bundled)", value: "Lato, Arial, sans-serif" },
  { label: "Montserrat (bundled)", value: "Montserrat, Arial, sans-serif" },
  { label: "Poppins (bundled)", value: "Poppins, Arial, sans-serif" },
  { label: "Nunito (bundled)", value: "Nunito, Arial, sans-serif" },
  // Bundled — serif
  { label: "Merriweather (bundled serif)", value: "Merriweather, Georgia, serif" },
  { label: "Playfair Display (bundled serif)", value: "'Playfair Display', Georgia, serif" },
  // Bundled — monospace
  { label: "Source Code Pro (bundled mono)", value: "'Source Code Pro', Consolas, monospace" },
  { label: "JetBrains Mono (bundled mono)", value: "'JetBrains Mono', Consolas, monospace" },
  // System sans-serif
  { label: "Inter (sans-serif)", value: "Inter, Arial, sans-serif" },
  { label: "Segoe UI (sans-serif)", value: "'Segoe UI', Arial, sans-serif" },
  { label: "Arial (sans-serif)", value: "Arial, Helvetica, sans-serif" },
  { label: "Calibri (sans-serif)", value: "Calibri, 'Segoe UI', sans-serif" },
  { label: "Candara (sans-serif)", value: "Candara, 'Segoe UI', sans-serif" },
  { label: "Corbel (sans-serif)", value: "Corbel, 'Segoe UI', sans-serif" },
  { label: "Tahoma (sans-serif)", value: "Tahoma, Geneva, sans-serif" },
  { label: "Verdana (sans-serif)", value: "Verdana, Geneva, sans-serif" },
  { label: "Trebuchet MS (sans-serif)", value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: "Century Gothic (sans-serif)", value: "'Century Gothic', 'Segoe UI', sans-serif" },
  { label: "Franklin Gothic (sans-serif)", value: "'Franklin Gothic Medium', Arial, sans-serif" },
  { label: "Comic Sans MS (casual)", value: "'Comic Sans MS', 'Segoe UI', sans-serif" },
  // System serif
  { label: "Georgia (serif)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Cambria (serif)", value: "Cambria, Georgia, serif" },
  { label: "Constantia (serif)", value: "Constantia, Georgia, serif" },
  { label: "Palatino Linotype (serif)", value: "'Palatino Linotype', Palatino, serif" },
  { label: "Times New Roman (serif)", value: "'Times New Roman', Times, serif" },
  // System monospace
  { label: "Consolas (monospace)", value: "Consolas, 'Courier New', monospace" },
  { label: "Courier New (monospace)", value: "'Courier New', monospace" },
  { label: "Lucida Console (monospace)", value: "'Lucida Console', Monaco, monospace" },
];

// Editable color tokens shown in the Theme Editor, in display order.
// Ordered so each row of the two-column grid pairs a color with its matching
// text color (e.g. Neutral | Neutral Text, Button | Button Text).
// fontFamily is handled separately (font dropdown); logoOverlay is not part of
// the MVP editor.
export const THEME_COLOR_FIELDS = [
  { key: "background", label: "Background" },
  { key: "placeholderBackground", label: "Placeholder Background" },
  { key: "surface", label: "Surface" },
  { key: "surfaceSecondary", label: "Surface (Secondary)" },
  { key: "textPrimary", label: "Text (Primary)" },
  { key: "textSecondary", label: "Text (Secondary)" },
  { key: "primary", label: "Primary" },
  { key: "primaryText", label: "Primary Text" },
  { key: "success", label: "Success" },
  { key: "successText", label: "Success Text" },
  { key: "neutral", label: "Neutral" },
  { key: "neutralText", label: "Neutral Text" },
  { key: "buttonColor", label: "Button" },
  { key: "buttonText", label: "Button Text" },
  { key: "danger", label: "Danger" },
  { key: "dangerText", label: "Danger Text" },
  { key: "label", label: "Label" },
  { key: "border", label: "Border" },
];
