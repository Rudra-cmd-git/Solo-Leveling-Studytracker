import { PublicHeader } from "@/components/app/public-header";

export const dynamic = "force-dynamic";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <PublicHeader />
      <main className="mx-auto w-full max-w-[86rem] px-4 py-5 sm:px-6 sm:py-7">{children}</main>
      <footer className="border-t border-line/50 px-4 py-5 sm:px-6">
        <p className="mx-auto max-w-[86rem] text-[0.62rem] text-faint">
          Public hunter records show study statistics only — never email addresses or private notes.
        </p>
      </footer>
    </div>
  );
}
