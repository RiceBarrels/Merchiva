"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

// Container for the blog index hero. Fades + drops in once on mount.
export function BlogHero({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      className="mx-auto max-w-5xl px-5 pt-16 pb-12"
      initial={reduced ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.section>
  );
}

// Each card on the blog index. Fades up as it scrolls into view; staggered by
// list index so the page settles in a single graceful sweep instead of all at
// once.
export function BlogCard({ children, index }: { children: ReactNode; index: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.li
      initial={reduced ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{
        duration: 0.5,
        ease: [0.2, 0.8, 0.2, 1],
        delay: Math.min(index, 6) * 0.05,
      }}
    >
      {children}
    </motion.li>
  );
}

// Blog detail page entrance. Header drops in first, then the cover image, then
// the body content — a small choreography that signals "you have arrived".
export function BlogArticle({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.article
      className="mx-auto max-w-3xl px-5 pt-12 pb-24"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {children}
    </motion.article>
  );
}

export function BlogArticleHeader({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function BlogArticleCover({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1], delay: 0.15 }}
    >
      {children}
    </motion.div>
  );
}

export function BlogArticleBody({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="mt-12 prose-merchiva"
      initial={reduced ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1], delay: 0.3 }}
    >
      {children}
    </motion.div>
  );
}
