/**
 * Starting points offered when a visitor lands on a missing page or on a page
 * that failed to render. Every path must be a real public page: the test
 * checks each one against the sitemap list in lib/seo/site-url.mjs, so a
 * recovery page can never send a visitor to another dead route.
 */
export type RecoveryLink = {
  href: string;
  label: string;
  description: string;
};

export const recoveryLinks: readonly RecoveryLink[] = [
  {
    href: "/photo-studio",
    label: "Build from two photos",
    description: "Front and right photos of one object. Photos stay on your device."
  },
  {
    href: "/app",
    label: "Open the hosted studio",
    description: "Describe an object with text, voice or a reference photo."
  },
  {
    href: "/how-it-works",
    label: "How it works",
    description: "Compare the two creation paths, the exports and their limits."
  },
  {
    href: "/",
    label: "Back to YIIYA",
    description: "Return to the home page."
  }
];
