/**
 * Application footer. Intentionally lightweight — branding and meta links.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t bg-background pb-20 md:pb-0">
      <div className="mx-auto max-w-screen-2xl space-y-2 px-4 py-6 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
        <p className="text-xs leading-relaxed">
          myFPLScout is an independent fantasy football tool and is not
          affiliated with, endorsed by, or associated with the Premier League
          or Fantasy Premier League.
        </p>
        <p className="text-xs">&copy; {year} myFPLScout</p>
      </div>
    </footer>
  );
}
