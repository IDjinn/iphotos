import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <h1 className="text-lg font-semibold leading-tight">Page not found</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The page you were looking for doesn&apos;t exist.
        </p>
        <Link
          href="/photos"
          className="rounded-md text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
        >
          Go to your photos
        </Link>
      </div>
    </div>
  );
}
