// Layout for public-facing published sites — no sidebar, no app chrome
export default function PublicSiteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
