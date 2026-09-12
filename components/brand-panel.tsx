"use client";

import { MerchivaLogo } from "@/components/logo";
import { useT } from "@/lib/i18n/context";

export function BrandPanel() {
  const t = useT();
  return (
    <div className="hidden lg:flex flex-col flex-1 min-w-0 h-full bg-muted border-r border-border p-7">
      {/* Top — Logo */}
      <div className="flex items-center gap-2">
        <MerchivaLogo size={22} className="text-foreground" />
        <span className="text-[13px] font-semibold text-foreground tracking-tight">
          Merchiva
        </span>
      </div>

      {/* Middle — Tagline */}
      <div className="flex-1 flex flex-col justify-center max-w-md">
        <span className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          {t("components.brandPanel.tagline")}
        </span>
        <h2 className="text-[28px] font-semibold text-foreground leading-tight tracking-tight">
          {t("components.brandPanel.heroLine1")}
          <br />
          {t("components.brandPanel.heroLine2")}
        </h2>
        <p className="text-[13px] text-muted-foreground mt-3 leading-relaxed">
          {t("components.brandPanel.description")}
        </p>

        {/* Mini inventory preview */}
        <div className="mt-8 rounded border border-border bg-background overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t("components.brandPanel.liveInventory")}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">
              {t("components.brandPanel.itemCount")}
            </span>
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="px-3 py-1.5">{t("components.brandPanel.sku")}</th>
                <th className="px-3 py-1.5">{t("components.brandPanel.product")}</th>
                <th className="px-3 py-1.5 text-right">{t("components.brandPanel.qty")}</th>
              </tr>
            </thead>
            <tbody className="text-foreground font-mono">
              <tr className="border-t border-border">
                <td className="px-3 py-1.5 text-muted-foreground">BEV-001</td>
                <td className="px-3 py-1.5 font-sans">Oat Milk Latte</td>
                <td className="px-3 py-1.5 text-right">124</td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-3 py-1.5 text-muted-foreground">BEV-012</td>
                <td className="px-3 py-1.5 font-sans">Cold Brew 16oz</td>
                <td className="px-3 py-1.5 text-right">87</td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-3 py-1.5 text-muted-foreground">FD-034</td>
                <td className="px-3 py-1.5 font-sans">Almond Croissant</td>
                <td className="px-3 py-1.5 text-right">32</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom — Footer */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{t("components.brandPanel.copyright")}</span>
        <div className="flex items-center gap-3">
          <a href="#" className="hover:text-muted-foreground transition-colors">
            {t("components.brandPanel.privacy")}
          </a>
          <a href="#" className="hover:text-muted-foreground transition-colors">
            {t("components.brandPanel.terms")}
          </a>
          <a href="#" className="hover:text-muted-foreground transition-colors">
            {t("components.brandPanel.status")}
          </a>
        </div>
      </div>
    </div>
  );
}
