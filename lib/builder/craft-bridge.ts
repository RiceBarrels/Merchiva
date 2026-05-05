/**
 * Bridge between SiteElement[] (DB format) and Craft.js serialized state.
 *
 * - siteElementsToCraftState: converts SiteElement[] → Craft.js JSON string
 * - craftStateToSiteElements: converts Craft.js serialized nodes → SiteElement[]
 */

import type { SiteElement, ElementType } from "@/lib/types";

// ─── Type name mapping ──────────────────────────────────────────────────────

const TYPE_TO_CRAFT: Record<string, string> = {
  text: "CraftText",
  image: "CraftImage",
  button: "CraftButton",
  hero: "CraftHero",
  nav: "CraftNav",
  footer: "CraftFooter",
  divider: "CraftDivider",
  spacer: "CraftSpacer",
  layout: "CraftLayout",
  fixed: "CraftFixed",
  container: "CraftLayout", // legacy alias
  viewport: "CraftViewport",
  columns: "CraftColumns",
  "product-card": "CraftProductCard",
  "booking-form": "CraftBookingForm",
  "coupon-banner": "CraftCouponBanner",
  "pricing-table": "CraftPricingTable",
  testimonial: "CraftTestimonial",
  faq: "CraftFaq",
  gallery: "CraftGallery",
  "custom-html": "CraftCustomHtml",
  "login-form": "CraftLoginForm",
  "code-block": "CraftCodeBlock",
  "membership-widget": "CraftMembershipWidget",
  cart: "CraftCart",
  checkout: "CraftCheckout",
  reward: "CraftReward",
  icon: "CraftIcon",
  "menu-grid": "CraftMenuGrid",
};

const CRAFT_TO_TYPE: Record<string, ElementType> = {};
for (const [k, v] of Object.entries(TYPE_TO_CRAFT)) {
  if (k !== "container") CRAFT_TO_TYPE[v] = k as ElementType;
}

// Droppable component types (accept children)
const CANVAS_TYPES = new Set(["CraftLayout", "CraftFixed", "CraftViewport"]);

// ─── SiteElement[] → Craft.js JSON ─────────────────────────────────────────

interface CraftNode {
  type: { resolvedName: string };
  isCanvas: boolean;
  props: Record<string, unknown>;
  displayName: string;
  custom: Record<string, unknown>;
  parent: string | null;
  nodes: string[];
  linkedNodes: Record<string, string>;
  hidden: boolean;
}

export function siteElementsToCraftState(elements: SiteElement[]): string {
  const nodes: Record<string, CraftNode> = {};

  // ROOT node — always present in Craft.js
  nodes.ROOT = {
    type: { resolvedName: "CraftCanvas" },
    isCanvas: true,
    props: {},
    displayName: "Canvas",
    custom: {},
    parent: null,
    nodes: [],
    linkedNodes: {},
    hidden: false,
  };

  function processElement(el: SiteElement, parentId: string) {
    const craftType = TYPE_TO_CRAFT[el.type] || "CraftText";
    const isCanvas = CANVAS_TYPES.has(craftType);

    // Strip children from props (they become Craft.js child nodes)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { children: _children, ...restProps } = el.props as Record<string, unknown> & { children?: unknown };

    nodes[el.id] = {
      type: { resolvedName: craftType },
      isCanvas,
      props: { ...restProps },
      displayName: craftType.replace("Craft", ""),
      custom: {
        elementType: el.type,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        locked: el.locked,
        lockLabel: el.lockLabel,
      },
      parent: parentId,
      nodes: [],
      linkedNodes: {},
      hidden: false,
    };

    // Add this node to parent's children
    nodes[parentId].nodes.push(el.id);

    // Process children recursively
    if (el.children) {
      for (const child of el.children) {
        processElement(child, el.id);
      }
    }
  }

  for (const el of elements) {
    processElement(el, "ROOT");
  }

  return JSON.stringify(nodes);
}

// ─── Craft.js serialized nodes → SiteElement[] ─────────────────────────────

function nodeToElement(nodes: Record<string, CraftNode>, nodeId: string): SiteElement {
  const node = nodes[nodeId];
  const elementType = (node.custom?.elementType as ElementType) ||
    CRAFT_TO_TYPE[node.type.resolvedName] ||
    "text";

  const children: SiteElement[] = node.nodes
    .filter((childId) => nodes[childId])
    .map((childId) => nodeToElement(nodes, childId));

  return {
    id: nodeId,
    type: elementType,
    props: { ...node.props },
    ...(children.length > 0 ? { children } : {}),
    ...(node.custom?.x != null ? { x: node.custom.x as number } : {}),
    ...(node.custom?.y != null ? { y: node.custom.y as number } : {}),
    ...(node.custom?.width != null ? { width: node.custom.width as number } : {}),
    ...(node.custom?.height != null ? { height: node.custom.height as number } : {}),
    ...(node.custom?.locked ? { locked: true as const } : {}),
    ...(node.custom?.lockLabel ? { lockLabel: node.custom.lockLabel as string } : {}),
  };
}

export function craftStateToSiteElements(serializedJson: string): SiteElement[] {
  const nodes: Record<string, CraftNode> = JSON.parse(serializedJson);

  const root = nodes.ROOT;
  if (!root) return [];

  return root.nodes
    .filter((id) => nodes[id])
    .map((id) => nodeToElement(nodes, id));
}

/**
 * Extract a single node subtree as a SiteElement (for saving as component).
 */
export function craftNodeToSiteElement(serializedJson: string, nodeId: string): SiteElement | null {
  const nodes: Record<string, CraftNode> = JSON.parse(serializedJson);
  if (!nodes[nodeId]) return null;
  return nodeToElement(nodes, nodeId);
}
