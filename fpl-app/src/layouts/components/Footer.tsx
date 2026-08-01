/**
 * Application footer. Intentionally lightweight — branding and meta links.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="hidden border-t bg-background md:block">
      <div className="mx-auto flex max-w-screen-2xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
        <p>&copy; {year} myFPLScout. Built for fans, not affiliated with the Premier League.</p>
        <p className="text-xs">Fantasy Premier League companion</p>
      </div>
    </footer>
  );
}
