/**
 * "Skip to content" link for keyboard and screen-reader users.
 *
 * Rendered as the very first focusable element in the document so that
 * tabbing once lets a keyboard user jump straight past repeated header
 * navigation into the page's main content (`#main`). Visually hidden until
 * it receives focus.
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      Skip to content
    </a>
  );
}
