/**
 * Application footer. Intentionally lightweight — branding and meta links.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t bg-background">
      <div className="mx-auto flex max-w-screen-2xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
        <p>&copy; {year} FPL App. Built for fans, not affiliated with the Premier League.</p>
        <p className="text-xs">
          Foundations scaffold &middot; v0.1.0
        </p>
      </div>
    </footer>
  );
}
