"use client";

import {
  type CSSProperties,
  type MouseEvent,
  type PropsWithChildren,
  useEffect,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import {
  compileYiiyaTheme,
  mergeYiiyaTheme,
  type CompiledYiiyaTheme,
  type YiiyaTheme,
} from "@/lib/designSystem";
import {
  type SectionContent,
  type YiiyaSection,
  useYiiyaStore,
} from "@/lib/store";

type SelectableProps = PropsWithChildren<{
  as?:
    | "section"
    | "div"
    | "h1"
    | "h2"
    | "p"
    | "button"
    | "form"
    | "nav"
    | "footer"
    | "span"
    | "ul"
    | "li";
  id: string;
  className?: string;
  style?: CSSProperties;
  type?: "button" | "submit";
}>;

type FeatureItem = {
  heading: string;
  subtext: string;
};

function hexToRgba(color: string, alpha: number) {
  const hex = color.trim();
  const normalized =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;

  if (!/^#[0-9a-f]{6}$/i.test(normalized)) {
    return color;
  }

  const value = Number.parseInt(normalized.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function colorBrightness(color: string) {
  const hex = color.trim();
  const normalized =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;

  if (!/^#[0-9a-f]{6}$/i.test(normalized)) {
    return null;
  }

  const value = Number.parseInt(normalized.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;

  return r * 0.299 + g * 0.587 + b * 0.114;
}

function textFrom(
  content: Record<string, unknown>,
  keys: string[],
  fallback: string,
) {
  for (const key of keys) {
    const value = content[key];

    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
  }

  return fallback;
}

function listFrom(
  content: SectionContent,
  key: string,
  fallback: string[],
): FeatureItem[] {
  const value = content[key];

  if (!Array.isArray(value)) {
    return fallback.map((item) => ({
      heading: item,
      subtext: "Generated from your voice prompt.",
    }));
  }

  return value.map((item) => {
    if (typeof item === "string" || typeof item === "number") {
      return {
        heading: String(item),
        subtext: "Generated from your voice prompt.",
      };
    }

    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      return {
        heading: textFrom(record, ["heading", "title", "name"], "Feature"),
        subtext: textFrom(
          record,
          ["subtext", "description", "body", "text"],
          "Generated from your voice prompt.",
        ),
      };
    }

    return { heading: "Feature", subtext: "Generated from your voice prompt." };
  });
}

function stringListFrom(
  content: SectionContent,
  key: string,
  fallback: string[],
) {
  const value = content[key];

  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .map((item) =>
      typeof item === "string" || typeof item === "number"
        ? String(item)
        : null,
    )
    .filter((item): item is string => Boolean(item));
}

function recordsFrom(
  content: SectionContent,
  key: string,
  fallback: Array<Record<string, unknown>>,
) {
  const value = content[key];

  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .map((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null,
    )
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function objectFrom(content: SectionContent, key: string) {
  const value = content[key];

  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function visualImageUrl(content: SectionContent, fallback?: string) {
  const visual = objectFrom(content, "visual");
  const imageUrl = visual.imageUrl;

  return typeof imageUrl === "string" && imageUrl.length > 0
    ? imageUrl
    : fallback;
}

function Selectable({
  as = "div",
  id,
  className,
  style,
  type,
  children,
}: SelectableProps) {
  const selectedElementId = useYiiyaStore((state) => state.selectedElementId);
  const selectedElements = useYiiyaStore((state) => state.selectedElements);
  const hoveredElementId = useYiiyaStore((state) => state.hoveredElementId);
  const setSelectedElementId = useYiiyaStore(
    (state) => state.setSelectedElementId,
  );
  const setSelectedElements = useYiiyaStore(
    (state) => state.setSelectedElements,
  );
  const isHovered = hoveredElementId === id;
  const isSelected = selectedElementId === id || selectedElements.includes(id);
  const Component = as;

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setSelectedElementId(id);
    setSelectedElements([id]);
  };

  if (as === "div") {
    return (
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.7 }}
        data-yiiya-id={id}
        data-yiiya-active={isHovered || isSelected ? "true" : "false"}
        data-yiiya-selected={isSelected ? "true" : "false"}
        className={`yiiya-element relative ${className ?? ""}`}
        style={style}
        onClick={handleClick}
      >
        {children}
        {isSelected ? (
          <span className="pointer-events-none absolute left-0 top-0 h-1.5 w-1.5 rounded-full bg-amber" />
        ) : null}
      </motion.div>
    );
  }

  return (
    <Component
      data-yiiya-id={id}
      data-yiiya-active={isHovered || isSelected ? "true" : "false"}
      data-yiiya-selected={isSelected ? "true" : "false"}
      className={`yiiya-element relative ${className ?? ""}`}
      style={style}
      type={type}
      onClick={handleClick}
    >
      {children}
      {isSelected ? (
        <span className="pointer-events-none absolute left-0 top-0 h-1.5 w-1.5 rounded-full bg-amber" />
      ) : null}
    </Component>
  );
}

function sectionTheme(section: YiiyaSection, themeState: YiiyaTheme) {
  const sectionOverrides: Partial<YiiyaTheme> = {};
  const background =
    section.theme.background ??
    section.theme.backgroundColor ??
    section.theme.backgroundColour;
  const foreground =
    section.theme.color ??
    section.theme.textColor ??
    section.theme.textColour ??
    section.theme["text colour"];
  const accent =
    section.theme.accentColor ??
    section.theme.accentColour ??
    section.theme["accent colour"];

  if (typeof background === "string") {
    sectionOverrides.background = background;
  }

  if (typeof foreground === "string") {
    sectionOverrides.foreground = foreground;
  }

  if (typeof accent === "string") {
    sectionOverrides.primaryAccent = accent;
  }

  const compiled = compileYiiyaTheme(
    mergeYiiyaTheme(themeState, sectionOverrides),
  );
  const backgroundBrightness = colorBrightness(compiled.background);
  const foregroundBrightness = colorBrightness(compiled.foreground);

  if (
    backgroundBrightness !== null &&
    foregroundBrightness !== null &&
    Math.abs(backgroundBrightness - foregroundBrightness) < 92
  ) {
    return {
      ...compiled,
      foreground: backgroundBrightness < 128 ? "#F7F2E8" : "#050505",
      mutedForeground:
        backgroundBrightness < 128
          ? "rgba(247, 242, 232, 0.68)"
          : "rgba(5, 5, 5, 0.64)",
    };
  }

  return compiled;
}

function sectionShellStyle(theme: CompiledYiiyaTheme): CSSProperties {
  return {
    "--yiiya-bg": theme.background,
    "--yiiya-fg": theme.foreground,
    "--yiiya-muted": theme.mutedForeground,
    "--yiiya-surface": theme.surface,
    "--yiiya-border": theme.border,
    "--yiiya-accent": theme.primaryAccent,
    "--yiiya-section-x": `${theme.spacing.sectionX}px`,
    "--yiiya-section-y": `${theme.spacing.sectionY}px`,
    "--yiiya-radius": `${theme.borderRadius}px`,
    backgroundColor: "var(--yiiya-bg)",
    color: "var(--yiiya-fg)",
    padding: "var(--yiiya-section-y) var(--yiiya-section-x)",
  } as CSSProperties;
}

function fluid(min: number, preferredVw: number, max: number) {
  return `clamp(${min}px, ${preferredVw}vw, ${max}px)`;
}

function editorialCtaStyle(theme: CompiledYiiyaTheme): CSSProperties {
  return {
    borderRadius: Math.min(2, theme.borderRadius),
    border: "none",
    backgroundColor: "var(--yiiya-accent)",
    color: "var(--yiiya-bg)",
    fontFamily: "inherit",
    fontSize: fluid(13, 1.1, 15),
    padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
  };
}

function ButtonLike({
  id,
  children,
  theme,
  variant = "filled",
}: PropsWithChildren<{
  id: string;
  theme: CompiledYiiyaTheme;
  variant?: "filled" | "outline";
}>) {
  return (
    <Selectable
      as="button"
      id={id}
      type="button"
      className="font-semibold"
      style={{
        borderRadius: theme.borderRadius,
        border: `1px solid ${theme.primaryAccent}`,
        backgroundColor:
          variant === "filled" ? theme.primaryAccent : "transparent",
        color: variant === "filled" ? theme.background : theme.primaryAccent,
        fontSize: fluid(16, 1.3, 18),
        padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
      }}
    >
      {children}
    </Selectable>
  );
}

function InteractiveBlock({
  id,
  content,
  theme,
}: {
  id: string;
  content: SectionContent;
  theme: CompiledYiiyaTheme;
}) {
  const interaction = objectFrom(content, "interaction");
  const type = typeof interaction.type === "string" ? interaction.type : "";
  const [value, setValue] = useState(56);

  if (!type) {
    return null;
  }

  const label =
    typeof interaction.label === "string"
      ? interaction.label
      : type === "booking"
        ? "Availability"
        : type === "quote-builder"
          ? "Quote builder"
          : "Concept tuner";

  return (
    <Selectable
      id={`${id}-interaction`}
      className="mt-8 border"
      style={{
        borderColor: theme.border,
        backgroundColor: theme.surface,
        padding: theme.spacing.md,
      }}
    >
      <Selectable
        id={`${id}-interaction-label`}
        className="uppercase"
        style={{
          color: theme.primaryAccent,
          fontSize: fluid(11, 1, 13),
          letterSpacing: "0.16em",
        }}
      >
        {label}
      </Selectable>
      <div className="mt-4 grid gap-3">
        <div className="flex items-center justify-between gap-4 text-sm text-white/64">
          <span>{type === "booking" ? "Priority" : "Intensity"}</span>
          <span style={{ color: theme.foreground }}>{value}%</span>
        </div>
        <input
          aria-label={label}
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(event) => setValue(Number(event.target.value))}
          className="accent-amber"
        />
        <div className="grid grid-cols-3 gap-2">
          {["Calm", "Sharp", "Wild"].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() =>
                setValue(option === "Calm" ? 24 : option === "Sharp" ? 62 : 92)
              }
              className="h-8 border border-terminalBorder text-[11px] uppercase tracking-[0.12em] text-white/55 transition hover:border-amber/70 hover:text-amber"
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </Selectable>
  );
}

function NavbarSection({
  section,
  index,
  theme,
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const projectName = useYiiyaStore((state) => state.projectName);
  const brand = textFrom(
    section.content,
    ["brand", "heading", "title"],
    projectName,
  );
  const links = stringListFrom(section.content, "links", [
    "Work",
    "About",
    "Contact",
  ]);
  const cta = textFrom(
    section.content,
    ["cta", "button", "buttonText"],
    "Start",
  );

  return (
    <Selectable
      as="nav"
      id={`navbar-section-${index}`}
      className="sticky top-0 z-50 flex items-center border-b backdrop-blur"
      style={{
        backgroundColor: hexToRgba(theme.background, 0.8),
        color: theme.foreground,
        borderColor: theme.border,
        gap: theme.spacing.md,
        padding: `${theme.spacing.sm}px ${theme.spacing.sectionX}px`,
      }}
    >
      <Selectable
        id={`navbar-brand-${index}`}
        className="shrink-0 font-bold"
        style={{ color: theme.foreground, fontSize: fluid(16, 1.3, 18) }}
      >
        {brand}
      </Selectable>
      <Selectable
        id={`navbar-links-${index}`}
        className="hidden flex-1 items-center justify-center md:flex"
        style={{ gap: theme.spacing.md }}
      >
        {links.slice(0, 3).map((link, linkIndex) => (
          <Selectable
            key={`${link}-${linkIndex}`}
            id={`navbar-link-${index}-${linkIndex + 1}`}
            style={{
              color: theme.mutedForeground,
              fontSize: fluid(16, 1.3, 18),
            }}
          >
            {link}
          </Selectable>
        ))}
      </Selectable>
      <ButtonLike id={`navbar-cta-${index}`} theme={theme}>
        {cta}
      </ButtonLike>
    </Selectable>
  );
}

function HeroSection({
  section,
  index,
  theme,
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const referencePreviewUrl = useYiiyaStore(
    (state) => state.referenceImage?.previewUrl,
  );
  const heading = textFrom(
    section.content,
    ["heading", "title"],
    "Build by speaking.",
  );
  const eyebrow = textFrom(section.content, ["eyebrow", "kicker"], "");
  const subtext = textFrom(
    section.content,
    ["subtext", "subtitle", "body", "description"],
    "Create websites and 3D scenes with plain language.",
  );
  const cta = textFrom(
    section.content,
    ["cta", "button", "buttonText"],
    "Start creating",
  );
  const variant = section.layoutVariant ?? "CENTERED_IMPACT";
  const imageUrl = visualImageUrl(section.content, referencePreviewUrl);
  const visual = objectFrom(section.content, "visual");
  const overlay =
    typeof visual.overlay === "number"
      ? Math.max(0.25, Math.min(0.82, visual.overlay))
      : 0.58;
  const heroBackground = imageUrl
    ? {
        backgroundImage: `linear-gradient(90deg, rgba(5,5,5,${overlay}) 0%, rgba(5,5,5,${Math.max(0.28, overlay - 0.22)}) 45%, rgba(5,5,5,0.18) 100%), url(${imageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : { background: "var(--yiiya-bg)" };

  if (variant === "EDITORIAL_SPLIT") {
    return (
      <Selectable
        as="section"
        id={`hero-section-${index}`}
        className="yiiya-section grid items-center md:grid-cols-[58%_42%]"
        style={{
          ...sectionShellStyle(theme),
          ...heroBackground,
          gap: 80,
          paddingTop: 120,
          paddingBottom: 80,
        }}
      >
        <Selectable id={`hero-copy-${index}`} className="self-center">
          {eyebrow ? (
            <Selectable
              id={`hero-eyebrow-${index}`}
              className="mb-5 uppercase"
              style={{
                color: "var(--yiiya-accent)",
                fontSize: fluid(11, 1, 13),
                letterSpacing: "0.16em",
              }}
            >
              {eyebrow}
            </Selectable>
          ) : null}
          <Selectable
            as="h1"
            id={`hero-title-${index}`}
            className="tracking-[0]"
            style={{
              fontSize: fluid(60, 7, 80),
              fontWeight: 800,
              lineHeight: 0.9,
              letterSpacing: "-0.03em",
            }}
          >
            {heading}
          </Selectable>
          <Selectable
            as="p"
            id={`hero-subtext-${index}`}
            className="max-w-2xl leading-8"
            style={{
              marginTop: 24,
              color: "var(--yiiya-muted)",
              fontSize: fluid(16, 1.6, 18),
              fontWeight: 300,
              maxWidth: 480,
            }}
          >
            {subtext}
          </Selectable>
          <Selectable id={`hero-cta-wrap-${index}`} style={{ marginTop: 40 }}>
            <Selectable
              as="button"
              id={`hero-cta-${index}`}
              type="button"
              style={editorialCtaStyle(theme)}
            >
              {cta}
            </Selectable>
          </Selectable>
        </Selectable>
        <Selectable
          id={`hero-visual-${index}`}
          className="grid min-h-[480px] place-items-center overflow-hidden border"
          style={{
            borderColor: "var(--yiiya-border)",
            color: "var(--yiiya-muted)",
            fontSize: fluid(13, 1.2, 15),
            backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          {imageUrl ? (
            <span className="bg-black/45 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-white/70 backdrop-blur">
              Reference
            </span>
          ) : (
            "[ VISUAL ]"
          )}
        </Selectable>
      </Selectable>
    );
  }

  if (variant === "BENTO_GRID") {
    return (
      <Selectable
        as="section"
        id={`hero-section-${index}`}
        className="yiiya-section grid min-h-[86svh]"
        style={{
          ...sectionShellStyle(theme),
          ...heroBackground,
          display: "grid",
          gridTemplateAreas:
            '"headline headline visual" "stat1 stat2 visual" "cta cta visual"',
          gridTemplateColumns: "1.1fr 0.9fr 1fr",
          gridTemplateRows: "auto minmax(130px, 0.6fr) auto",
          gap: 16,
        }}
      >
        <Selectable
          id={`hero-title-cell-${index}`}
          className="border"
          style={{
            gridArea: "headline",
            borderColor: "var(--yiiya-border)",
            padding: theme.spacing.lg,
          }}
        >
          <Selectable
            as="h1"
            id={`hero-title-${index}`}
            style={{
              fontSize: fluid(56, 8, 104),
              fontWeight: 800,
              lineHeight: 0.9,
              letterSpacing: "-0.03em",
            }}
          >
            {heading}
          </Selectable>
        </Selectable>
        {[
          ["4x", "faster drafts", "stat1"],
          ["11", "section types", "stat2"],
        ].map(([value, label, area], statIndex) => (
          <Selectable
            key={value}
            id={`hero-stat-${index}-${statIndex + 1}`}
            className="border"
            style={{
              gridArea: area,
              borderColor: "var(--yiiya-border)",
              padding: theme.spacing.md,
            }}
          >
            <Selectable
              as="h2"
              id={`hero-stat-value-${index}-${statIndex + 1}`}
              style={{
                color: "var(--yiiya-accent)",
                fontSize: fluid(36, 4, 56),
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              {value}
            </Selectable>
            <Selectable
              as="p"
              id={`hero-stat-label-${index}-${statIndex + 1}`}
              style={{
                color: "var(--yiiya-muted)",
                fontSize: fluid(13, 1.2, 16),
                marginTop: theme.spacing.xs,
              }}
            >
              {label}
            </Selectable>
          </Selectable>
        ))}
        <Selectable
          id={`hero-visual-${index}`}
          className="grid place-items-center overflow-hidden border"
          style={{
            gridArea: "visual",
            minHeight: 520,
            borderColor: "var(--yiiya-border)",
            color: "var(--yiiya-muted)",
            fontSize: fluid(13, 1.2, 15),
            backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          {imageUrl ? "" : "[ VISUAL ]"}
        </Selectable>
        <Selectable
          id={`hero-cta-cell-${index}`}
          className="border"
          style={{
            gridArea: "cta",
            borderColor: "var(--yiiya-border)",
            padding: theme.spacing.lg,
          }}
        >
          <Selectable
            as="p"
            id={`hero-subtext-${index}`}
            className="leading-7"
            style={{
              color: "var(--yiiya-muted)",
              fontSize: fluid(16, 1.4, 18),
            }}
          >
            {subtext}
          </Selectable>
          <Selectable
            id={`hero-cta-wrap-${index}`}
            style={{ marginTop: theme.spacing.md }}
          >
            <Selectable
              as="button"
              id={`hero-cta-${index}`}
              type="button"
              style={editorialCtaStyle(theme)}
            >
              {cta}
            </Selectable>
          </Selectable>
        </Selectable>
      </Selectable>
    );
  }

  return (
    <Selectable
      as="section"
      id={`hero-section-${index}`}
      className="yiiya-section flex min-h-screen flex-col items-center justify-center text-center"
      style={{ ...sectionShellStyle(theme), ...heroBackground }}
    >
      <Selectable id={`hero-copy-${index}`} className="mx-auto max-w-4xl">
        {eyebrow ? (
          <Selectable
            id={`hero-eyebrow-${index}`}
            className="mb-5 uppercase"
            style={{
              color: "var(--yiiya-accent)",
              fontSize: fluid(11, 1, 13),
              letterSpacing: "0.16em",
            }}
          >
            {eyebrow}
          </Selectable>
        ) : null}
        <Selectable
          as="h1"
          id={`hero-title-${index}`}
          style={{
            fontSize: "clamp(72px, 10vw, 140px)",
            fontWeight: 800,
            lineHeight: 0.9,
            letterSpacing: "-0.03em",
          }}
        >
          {heading}
        </Selectable>
        <Selectable
          as="p"
          id={`hero-subtext-${index}`}
          className="mx-auto max-w-2xl leading-8"
          style={{
            marginTop: 24,
            color: "var(--yiiya-muted)",
            fontSize: fluid(16, 1.5, 20),
            fontWeight: 300,
            maxWidth: 480,
          }}
        >
          {subtext}
        </Selectable>
        <Selectable id={`hero-cta-wrap-${index}`} style={{ marginTop: 40 }}>
          <Selectable
            as="button"
            id={`hero-cta-${index}`}
            type="button"
            style={editorialCtaStyle(theme)}
          >
            {cta}
          </Selectable>
        </Selectable>
      </Selectable>
    </Selectable>
  );
}

function AboutSection({
  section,
  index,
  theme,
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const heading = textFrom(
    section.content,
    ["heading", "title"],
    "Designed for fast iteration.",
  );
  const subtext = textFrom(
    section.content,
    ["subtext", "body", "description"],
    "Describe the structure, mood, and details you want. Yiiya turns intent into editable website sections.",
  );

  return (
    <Selectable
      as="section"
      id={`about-section-${index}`}
      className="grid md:grid-cols-[1fr_0.8fr]"
      style={{ ...sectionShellStyle(theme), gap: theme.spacing.lg }}
    >
      <Selectable id={`about-copy-${index}`} className="self-center">
        <Selectable
          as="h2"
          id={`about-title-${index}`}
          style={{ fontSize: fluid(32, 4, 56), fontWeight: theme.fontWeight }}
        >
          {heading}
        </Selectable>
        <Selectable
          as="p"
          id={`about-subtext-${index}`}
          className="leading-7"
          style={{
            marginTop: theme.spacing.md,
            color: theme.mutedForeground,
            fontSize: fluid(16, 1.3, 18),
          }}
        >
          {subtext}
        </Selectable>
      </Selectable>
      <Selectable
        id={`about-image-${index}`}
        className="min-h-[260px] border"
        style={{
          borderRadius: theme.borderRadius,
          borderColor: theme.border,
          backgroundColor: theme.surface,
        }}
      />
    </Selectable>
  );
}

function FeaturesSection({
  section,
  index,
  theme,
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const heading = textFrom(
    section.content,
    ["heading", "title"],
    "Everything stays editable.",
  );
  const features = listFrom(section.content, "features", [
    "Voice instructions",
    "Live sections",
    "3D-ready canvas",
  ]);
  const variant = section.layoutVariant ?? "FEATURES_GRID";

  return (
    <Selectable
      as="section"
      id={`features-section-${index}`}
      style={sectionShellStyle(theme)}
    >
      <Selectable
        as="h2"
        id={`features-title-${index}`}
        style={{ fontSize: fluid(32, 4, 56), fontWeight: theme.fontWeight }}
      >
        {heading}
      </Selectable>
      <Selectable
        id={`features-grid-${index}`}
        className={
          variant === "FEATURES_HORIZONTAL"
            ? "flex overflow-x-auto"
            : "grid md:grid-cols-3"
        }
        style={{ marginTop: theme.spacing.lg, gap: theme.spacing.md }}
      >
        {features
          .slice(0, variant === "FEATURES_HORIZONTAL" ? 6 : 3)
          .map((feature, featureIndex) => (
            <Selectable
              key={`${feature.heading}-${featureIndex}`}
              id={`feature-card-${index}-${featureIndex + 1}`}
              className="min-h-[180px] shrink-0 border"
              style={{
                width: variant === "FEATURES_HORIZONTAL" ? 320 : undefined,
                borderRadius: theme.borderRadius,
                borderColor: theme.border,
                padding: theme.spacing.md,
                backgroundColor: theme.surface,
              }}
            >
              <Selectable
                as="h2"
                id={`feature-title-${index}-${featureIndex + 1}`}
                style={{
                  fontSize: theme.type.body * 1.22,
                  fontWeight: theme.fontWeight,
                }}
              >
                {feature.heading}
              </Selectable>
              <Selectable
                as="p"
                id={`feature-subtext-${index}-${featureIndex + 1}`}
                className="leading-6"
                style={{
                  marginTop: theme.spacing.sm,
                  color: theme.mutedForeground,
                  fontSize: fluid(16, 1.3, 18),
                }}
              >
                {feature.subtext}
              </Selectable>
            </Selectable>
          ))}
      </Selectable>
      <InteractiveBlock
        id={`features-${index}`}
        content={section.content}
        theme={theme}
      />
    </Selectable>
  );
}

function ServicesSection({
  section,
  index,
  theme,
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const heading = textFrom(
    section.content,
    ["heading", "title"],
    "Services built for momentum.",
  );
  const services = listFrom(section.content, "services", [
    "Launch strategy",
    "Visual system",
    "Conversion page",
  ]);

  return (
    <Selectable
      as="section"
      id={`services-section-${index}`}
      style={sectionShellStyle(theme)}
    >
      <Selectable
        as="h2"
        id={`services-title-${index}`}
        style={{ fontSize: fluid(32, 4, 56), fontWeight: theme.fontWeight }}
      >
        {heading}
      </Selectable>
      <Selectable
        id={`services-grid-${index}`}
        className="grid md:grid-cols-3"
        style={{ marginTop: theme.spacing.lg, gap: theme.spacing.md }}
      >
        {services.slice(0, 3).map((service, serviceIndex) => (
          <Selectable
            key={`${service.heading}-${serviceIndex}`}
            id={`service-card-${index}-${serviceIndex + 1}`}
            className="border"
            style={{
              borderColor: theme.border,
              borderRadius: theme.borderRadius,
              padding: theme.spacing.lg,
              backgroundColor: theme.surface,
            }}
          >
            <Selectable
              id={`service-icon-${index}-${serviceIndex + 1}`}
              className="border"
              style={{
                width: theme.spacing.lg,
                height: theme.spacing.lg,
                borderColor: theme.primaryAccent,
                borderRadius: Math.max(2, theme.borderRadius * 0.35),
              }}
            />
            <Selectable
              as="h2"
              id={`service-title-${index}-${serviceIndex + 1}`}
              style={{
                marginTop: theme.spacing.md,
                fontSize: theme.type.body * 1.2,
                fontWeight: theme.fontWeight,
              }}
            >
              {service.heading}
            </Selectable>
            <Selectable
              as="p"
              id={`service-subtext-${index}-${serviceIndex + 1}`}
              className="leading-6"
              style={{
                marginTop: theme.spacing.sm,
                color: theme.mutedForeground,
                fontSize: fluid(16, 1.3, 18),
              }}
            >
              {service.subtext}
            </Selectable>
          </Selectable>
        ))}
      </Selectable>
    </Selectable>
  );
}

function MetricsSection({
  section,
  index,
  theme,
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const metrics = recordsFrom(section.content, "metrics", [
    { value: "2,400+", label: "Projects created" },
    { value: "18k", label: "Voice edits" },
    { value: "96%", label: "Faster drafts" },
    { value: "11", label: "Section types" },
  ]);

  return (
    <Selectable
      as="section"
      id={`metrics-section-${index}`}
      style={sectionShellStyle(theme)}
    >
      <Selectable id={`metrics-row-${index}`} className="grid md:grid-cols-4">
        {metrics.slice(0, 4).map((metric, metricIndex) => (
          <Selectable
            key={`${String(metric.value)}-${metricIndex}`}
            id={`metric-block-${index}-${metricIndex + 1}`}
            className="border-r last:border-r-0"
            style={{
              borderColor: theme.border,
              padding: theme.spacing.md,
              textAlign: "center",
            }}
          >
            <Selectable
              as="h2"
              id={`metric-value-${index}-${metricIndex + 1}`}
              style={{
                color: theme.primaryAccent,
                fontSize: theme.type.body * 2.5,
                fontWeight: theme.fontWeight,
              }}
            >
              {textFrom(metric, ["value", "number"], "10x")}
            </Selectable>
            <Selectable
              as="p"
              id={`metric-label-${index}-${metricIndex + 1}`}
              style={{
                marginTop: theme.spacing.xs,
                color: theme.mutedForeground,
                fontSize: fluid(16, 1.3, 18),
              }}
            >
              {textFrom(metric, ["label", "caption"], "Projects created")}
            </Selectable>
          </Selectable>
        ))}
      </Selectable>
    </Selectable>
  );
}

function LogoStripSection({
  section,
  index,
  theme,
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const logos = stringListFrom(section.content, "logos", [
    "Aster",
    "Northline",
    "Vanta",
    "Echelon",
    "Monarch",
    "Kepler",
  ]);

  return (
    <Selectable
      as="section"
      id={`logo-strip-section-${index}`}
      style={sectionShellStyle(theme)}
    >
      <Selectable
        id={`logo-strip-row-${index}`}
        className="grid text-center md:grid-cols-6"
        style={{
          borderTop: `1px solid ${theme.border}`,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        {logos.slice(0, 6).map((logo, logoIndex) => (
          <Selectable
            key={`${logo}-${logoIndex}`}
            id={`logo-strip-item-${index}-${logoIndex + 1}`}
            className="border-r uppercase last:border-r-0"
            style={{
              borderColor: theme.border,
              color: theme.mutedForeground,
              fontSize: fluid(16, 1.3, 18),
              padding: `${theme.spacing.md}px ${theme.spacing.sm}px`,
            }}
          >
            {logo}
          </Selectable>
        ))}
      </Selectable>
    </Selectable>
  );
}

function TestimonialsSection({
  section,
  index,
  theme,
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const heading = textFrom(
    section.content,
    ["heading", "title"],
    "Proof from real buyers.",
  );
  const testimonials = recordsFrom(section.content, "testimonials", [
    {
      quote:
        "The first draft gave us enough clarity to pitch the direction immediately. Every edit stayed structured and fast.",
      name: "Amina Cole",
      role: "Founder",
    },
    {
      quote:
        "It felt like a creative director and front-end team in the same room. The canvas made iteration visible.",
      name: "David Lin",
      role: "Agency lead",
    },
    {
      quote:
        "We moved from a rough brief to a page we could review with clients. The voice loop changed the meeting.",
      name: "Nia Brooks",
      role: "Producer",
    },
  ]);

  return (
    <Selectable
      as="section"
      id={`testimonials-section-${index}`}
      style={sectionShellStyle(theme)}
    >
      <Selectable
        as="h2"
        id={`testimonials-title-${index}`}
        style={{ fontSize: fluid(32, 4, 56), fontWeight: theme.fontWeight }}
      >
        {heading}
      </Selectable>
      <Selectable
        id={`testimonials-grid-${index}`}
        className="grid md:grid-cols-3"
        style={{ marginTop: theme.spacing.lg, gap: theme.spacing.md }}
      >
        {testimonials.slice(0, 3).map((testimonial, testimonialIndex) => {
          const name = textFrom(testimonial, ["name", "author"], "Customer");
          const initials = name
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          return (
            <Selectable
              key={`${name}-${testimonialIndex}`}
              id={`testimonial-card-${index}-${testimonialIndex + 1}`}
              className="border"
              style={{
                borderColor: theme.border,
                borderRadius: theme.borderRadius,
                padding: theme.spacing.md,
                backgroundColor: theme.surface,
              }}
            >
              <Selectable
                id={`testimonial-avatar-${index}-${testimonialIndex + 1}`}
                className="grid place-items-center rounded-full"
                style={{
                  width: theme.spacing.xl,
                  height: theme.spacing.xl,
                  backgroundColor: theme.primaryAccent,
                  color: theme.background,
                  fontSize: fluid(16, 1.3, 18),
                  fontWeight: theme.fontWeight,
                }}
              >
                {initials}
              </Selectable>
              <Selectable
                as="p"
                id={`testimonial-quote-${index}-${testimonialIndex + 1}`}
                className="leading-7"
                style={{
                  marginTop: theme.spacing.md,
                  color: theme.foreground,
                  fontSize: fluid(16, 1.3, 18),
                }}
              >
                {textFrom(
                  testimonial,
                  ["quote", "text"],
                  "Strong signal from the market.",
                )}
              </Selectable>
              <Selectable
                as="h2"
                id={`testimonial-name-${index}-${testimonialIndex + 1}`}
                style={{
                  marginTop: theme.spacing.md,
                  fontSize: fluid(16, 1.3, 18),
                  fontWeight: theme.fontWeight,
                }}
              >
                {name}
              </Selectable>
              <Selectable
                as="p"
                id={`testimonial-role-${index}-${testimonialIndex + 1}`}
                style={{
                  color: theme.mutedForeground,
                  fontSize: fluid(16, 1.3, 18),
                }}
              >
                {textFrom(testimonial, ["role", "title"], "Customer")}
              </Selectable>
            </Selectable>
          );
        })}
      </Selectable>
    </Selectable>
  );
}

function PricingSection({
  section,
  index,
  theme,
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const heading = textFrom(
    section.content,
    ["heading", "title"],
    "Simple pricing.",
  );
  const plans = recordsFrom(section.content, "plans", [
    {
      name: "Starter",
      price: "$49",
      features: [
        "One project",
        "Voice editing",
        "Local drafts",
        "Publish link",
      ],
    },
    {
      name: "Pro",
      price: "$149",
      features: [
        "Unlimited projects",
        "3D scenes",
        "Reference images",
        "Sync history",
      ],
    },
    {
      name: "Studio",
      price: "$399",
      features: [
        "Team projects",
        "Client review",
        "Custom themes",
        "Priority support",
      ],
    },
  ]);

  return (
    <Selectable
      as="section"
      id={`pricing-section-${index}`}
      style={sectionShellStyle(theme)}
    >
      <Selectable
        as="h2"
        id={`pricing-title-${index}`}
        style={{ fontSize: fluid(32, 4, 56), fontWeight: theme.fontWeight }}
      >
        {heading}
      </Selectable>
      <Selectable
        id={`pricing-grid-${index}`}
        className="grid md:grid-cols-3"
        style={{ marginTop: theme.spacing.lg, gap: theme.spacing.md }}
      >
        {plans.slice(0, 3).map((plan, planIndex) => {
          const isPro = planIndex === 1;
          const features = Array.isArray(plan.features)
            ? plan.features
                .map((item) =>
                  typeof item === "string" || typeof item === "number"
                    ? String(item)
                    : null,
                )
                .filter((item): item is string => Boolean(item))
            : [
                "Design system",
                "Production handoff",
                "Fast publish",
                "Support",
              ];

          return (
            <Selectable
              key={`${textFrom(plan, ["name"], "plan")}-${planIndex}`}
              id={`pricing-card-${index}-${planIndex + 1}`}
              className="border"
              style={{
                borderColor: isPro ? theme.primaryAccent : theme.border,
                borderWidth: isPro ? 1.5 : 1,
                borderRadius: theme.borderRadius,
                padding: theme.spacing.md,
                backgroundColor: theme.surface,
              }}
            >
              {isPro ? (
                <Selectable
                  id={`pricing-badge-${index}`}
                  className="inline-flex"
                  style={{
                    borderRadius: theme.borderRadius,
                    backgroundColor: theme.primaryAccent,
                    color: theme.background,
                    fontSize: fluid(16, 1.3, 18),
                    padding: `${theme.spacing.xs / 2}px ${theme.spacing.sm}px`,
                  }}
                >
                  Most popular
                </Selectable>
              ) : null}
              <Selectable
                as="h2"
                id={`pricing-name-${index}-${planIndex + 1}`}
                style={{
                  marginTop: isPro ? theme.spacing.md : 0,
                  fontSize: theme.type.body * 1.25,
                  fontWeight: theme.fontWeight,
                }}
              >
                {textFrom(plan, ["name", "title"], "Plan")}
              </Selectable>
              <Selectable
                as="h2"
                id={`pricing-price-${index}-${planIndex + 1}`}
                style={{
                  marginTop: theme.spacing.sm,
                  color: theme.primaryAccent,
                  fontSize: fluid(32, 4, 56),
                  fontWeight: theme.fontWeight,
                }}
              >
                {textFrom(plan, ["price", "cost"], "$149")}
              </Selectable>
              <Selectable
                as="ul"
                id={`pricing-features-${index}-${planIndex + 1}`}
                className="grid"
                style={{ marginTop: theme.spacing.md, gap: theme.spacing.xs }}
              >
                {features.slice(0, 4).map((feature, featureIndex) => (
                  <Selectable
                    key={`${feature}-${featureIndex}`}
                    as="li"
                    id={`pricing-feature-${index}-${planIndex + 1}-${featureIndex + 1}`}
                    style={{
                      color: theme.mutedForeground,
                      fontSize: fluid(16, 1.3, 18),
                    }}
                  >
                    <span style={{ color: theme.primaryAccent }}>✓</span>{" "}
                    {feature}
                  </Selectable>
                ))}
              </Selectable>
              <Selectable
                id={`pricing-cta-wrap-${index}-${planIndex + 1}`}
                style={{ marginTop: theme.spacing.md }}
              >
                <ButtonLike
                  id={`pricing-cta-${index}-${planIndex + 1}`}
                  theme={theme}
                  variant={isPro ? "filled" : "outline"}
                >
                  Choose {textFrom(plan, ["name", "title"], "Plan")}
                </ButtonLike>
              </Selectable>
            </Selectable>
          );
        })}
      </Selectable>
    </Selectable>
  );
}

function FAQSection({
  section,
  index,
  theme,
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const heading = textFrom(
    section.content,
    ["heading", "title"],
    "Questions before launch.",
  );
  const faqs = recordsFrom(section.content, "faqs", [
    {
      question: "Can this be edited after publish?",
      answer:
        "Yes. Yiiya keeps project state structured so future edits can target sections and elements.",
    },
    {
      question: "Can I mix websites and 3D?",
      answer:
        "Yes. The spatial layer can sit behind, above, or beside the generated web sections.",
    },
    {
      question: "Does reference imagery affect the theme?",
      answer:
        "Dropped images immediately update the palette before the model responds.",
    },
    {
      question: "Do guests get the full canvas?",
      answer:
        "Guest users can use the full canvas, with local drafts and watermarked publishing.",
    },
    {
      question: "Is there an accordion?",
      answer:
        "Not yet. Answers stay visible so the first pass remains simple and editable.",
    },
  ]);

  return (
    <Selectable
      as="section"
      id={`faq-section-${index}`}
      style={sectionShellStyle(theme)}
    >
      <Selectable
        as="h2"
        id={`faq-title-${index}`}
        style={{ fontSize: fluid(32, 4, 56), fontWeight: theme.fontWeight }}
      >
        {heading}
      </Selectable>
      <Selectable
        id={`faq-list-${index}`}
        style={{ marginTop: theme.spacing.lg }}
      >
        {faqs.slice(0, 5).map((faq, faqIndex) => (
          <Selectable
            key={`${textFrom(faq, ["question"], "question")}-${faqIndex}`}
            id={`faq-item-${index}-${faqIndex + 1}`}
            className="border-b"
            style={{
              borderColor: theme.border,
              padding: `${theme.spacing.md}px 0`,
            }}
          >
            <Selectable
              as="h2"
              id={`faq-question-${index}-${faqIndex + 1}`}
              style={{ fontSize: fluid(16, 1.3, 18), fontWeight: 400 }}
            >
              {textFrom(faq, ["question", "heading"], "Question")}
            </Selectable>
            <Selectable
              as="p"
              id={`faq-answer-${index}-${faqIndex + 1}`}
              className="leading-6"
              style={{
                marginTop: theme.spacing.xs,
                color: theme.mutedForeground,
                fontSize: fluid(16, 1.3, 18),
              }}
            >
              {textFrom(faq, ["answer", "subtext", "body"], "Answer")}
            </Selectable>
          </Selectable>
        ))}
      </Selectable>
    </Selectable>
  );
}

function ContactSection({
  section,
  index,
  theme,
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const heading = textFrom(
    section.content,
    ["heading", "title"],
    "Start a conversation.",
  );
  const subtext = textFrom(
    section.content,
    ["subtext", "body", "description"],
    "Leave a note and the next step can become part of the canvas.",
  );

  return (
    <Selectable
      as="section"
      id={`contact-section-${index}`}
      className="grid md:grid-cols-[0.8fr_1fr]"
      style={{ ...sectionShellStyle(theme), gap: theme.spacing.lg }}
    >
      <Selectable id={`contact-copy-${index}`}>
        <Selectable
          as="h2"
          id={`contact-title-${index}`}
          style={{ fontSize: fluid(32, 4, 56), fontWeight: theme.fontWeight }}
        >
          {heading}
        </Selectable>
        <Selectable
          as="p"
          id={`contact-subtext-${index}`}
          className="leading-7"
          style={{
            marginTop: theme.spacing.md,
            color: theme.mutedForeground,
            fontSize: fluid(16, 1.3, 18),
          }}
        >
          {subtext}
        </Selectable>
      </Selectable>
      <Selectable
        as="form"
        id={`contact-form-${index}`}
        style={{ display: "grid", gap: theme.spacing.sm }}
      >
        {["Name", "Email"].map((label) => (
          <Selectable
            key={label}
            id={`contact-${label.toLowerCase()}-${index}`}
            className="flex h-12 w-full items-center border"
            style={{
              borderRadius: theme.borderRadius,
              borderColor: theme.border,
              backgroundColor: theme.surface,
              color: theme.mutedForeground,
              padding: `0 ${theme.spacing.md}px`,
              fontSize: fluid(16, 1.3, 18),
            }}
          >
            {label}
          </Selectable>
        ))}
        <Selectable
          id={`contact-message-${index}`}
          className="min-h-[120px] w-full border"
          style={{
            borderRadius: theme.borderRadius,
            borderColor: theme.border,
            backgroundColor: theme.surface,
            color: theme.mutedForeground,
            padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
            fontSize: fluid(16, 1.3, 18),
          }}
        >
          Message
        </Selectable>
        <ButtonLike id={`contact-submit-${index}`} theme={theme}>
          Send
        </ButtonLike>
      </Selectable>
      <InteractiveBlock
        id={`contact-${index}`}
        content={section.content}
        theme={theme}
      />
    </Selectable>
  );
}

function FooterSection({
  section,
  index,
  theme,
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const projectName = useYiiyaStore((state) => state.projectName);
  const brand = textFrom(
    section.content,
    ["brand", "heading", "title"],
    projectName,
  );
  const subtext = textFrom(
    section.content,
    ["subtext", "body"],
    "Built with Yiiya.",
  );
  const links = stringListFrom(section.content, "links", [
    "Work",
    "About",
    "Services",
    "Pricing",
    "Contact",
  ]);

  return (
    <Selectable
      as="footer"
      id={`footer-section-${index}`}
      className="border-t"
      style={{
        backgroundColor: theme.background,
        color: theme.foreground,
        borderColor: theme.border,
        padding: `${theme.spacing.lg}px ${theme.spacing.sectionX}px`,
      }}
    >
      <Selectable
        id={`footer-grid-${index}`}
        className="grid md:grid-cols-3"
        style={{ gap: theme.spacing.lg }}
      >
        <Selectable id={`footer-brand-column-${index}`}>
          <Selectable
            id={`footer-brand-${index}`}
            className="font-bold"
            style={{ fontSize: fluid(16, 1.3, 18) }}
          >
            {brand}
          </Selectable>
          <Selectable
            as="p"
            id={`footer-subtext-${index}`}
            className="leading-6"
            style={{
              marginTop: theme.spacing.sm,
              color: theme.mutedForeground,
              fontSize: fluid(16, 1.3, 18),
            }}
          >
            {subtext}
          </Selectable>
        </Selectable>
        <Selectable id={`footer-links-column-${index}`}>
          <Selectable
            as="h2"
            id={`footer-links-title-${index}`}
            style={{
              fontSize: fluid(16, 1.3, 18),
              fontWeight: theme.fontWeight,
            }}
          >
            Links
          </Selectable>
          <Selectable
            id={`footer-links-${index}`}
            className="grid"
            style={{ marginTop: theme.spacing.sm, gap: theme.spacing.xs }}
          >
            {links.slice(0, 5).map((link, linkIndex) => (
              <Selectable
                key={`${link}-${linkIndex}`}
                id={`footer-link-${index}-${linkIndex + 1}`}
                style={{
                  color: theme.mutedForeground,
                  fontSize: fluid(16, 1.3, 18),
                }}
              >
                {link}
              </Selectable>
            ))}
          </Selectable>
        </Selectable>
        <Selectable id={`footer-contact-column-${index}`}>
          <Selectable
            as="h2"
            id={`footer-contact-title-${index}`}
            style={{
              fontSize: fluid(16, 1.3, 18),
              fontWeight: theme.fontWeight,
            }}
          >
            Contact
          </Selectable>
          <Selectable
            as="p"
            id={`footer-email-${index}`}
            style={{
              marginTop: theme.spacing.sm,
              color: theme.mutedForeground,
              fontSize: fluid(16, 1.3, 18),
            }}
          >
            hello@example.com
          </Selectable>
          <Selectable
            id={`footer-socials-${index}`}
            className="flex"
            style={{ marginTop: theme.spacing.sm, gap: theme.spacing.sm }}
          >
            {["TW", "IG", "LI"].map((social) => (
              <Selectable
                key={social}
                id={`footer-social-${index}-${social.toLowerCase()}`}
                style={{
                  color: theme.primaryAccent,
                  fontSize: fluid(16, 1.3, 18),
                }}
              >
                {social}
              </Selectable>
            ))}
          </Selectable>
        </Selectable>
      </Selectable>
      <Selectable
        as="p"
        id={`footer-copyright-${index}`}
        className="border-t"
        style={{
          marginTop: theme.spacing.lg,
          paddingTop: theme.spacing.sm,
          borderColor: theme.border,
          color: theme.mutedForeground,
          fontSize: fluid(16, 1.3, 18),
        }}
      >
        Copyright 2026 {brand}. All rights reserved.
      </Selectable>
    </Selectable>
  );
}

function RenderSection({
  section,
  index,
  theme,
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  if (section.sectionType === "NAVBAR") {
    return <NavbarSection section={section} index={index} theme={theme} />;
  }

  if (section.sectionType === "ABOUT") {
    return <AboutSection section={section} index={index} theme={theme} />;
  }

  if (section.sectionType === "SERVICES") {
    return <ServicesSection section={section} index={index} theme={theme} />;
  }

  if (section.sectionType === "FEATURES") {
    return <FeaturesSection section={section} index={index} theme={theme} />;
  }

  if (section.sectionType === "METRICS") {
    return <MetricsSection section={section} index={index} theme={theme} />;
  }

  if (section.sectionType === "LOGO_STRIP") {
    return <LogoStripSection section={section} index={index} theme={theme} />;
  }

  if (section.sectionType === "TESTIMONIALS") {
    return (
      <TestimonialsSection section={section} index={index} theme={theme} />
    );
  }

  if (section.sectionType === "PRICING") {
    return <PricingSection section={section} index={index} theme={theme} />;
  }

  if (section.sectionType === "FAQ") {
    return <FAQSection section={section} index={index} theme={theme} />;
  }

  if (section.sectionType === "CONTACT") {
    return <ContactSection section={section} index={index} theme={theme} />;
  }

  if (section.sectionType === "FOOTER") {
    return <FooterSection section={section} index={index} theme={theme} />;
  }

  return <HeroSection section={section} index={index} theme={theme} />;
}

function closestYiiyaElement(element: Element | null) {
  return element?.closest<HTMLElement>("[data-yiiya-id]") ?? null;
}

function closestBlockYiiyaElement(element: HTMLElement | null) {
  return (
    element?.closest<HTMLElement>(
      "section[data-yiiya-id], nav[data-yiiya-id], footer[data-yiiya-id], form[data-yiiya-id], div[data-yiiya-id]",
    ) ?? null
  );
}

function rectsIntersect(a: DOMRect, b: DOMRect) {
  return !(
    b.left > a.right ||
    b.right < a.left ||
    b.top > a.bottom ||
    b.bottom < a.top
  );
}

export function WebsiteLayer() {
  const sections = useYiiyaStore((state) => state.sections);
  const themeState = useYiiyaStore((state) => state.themeState);
  const canvasMode = useYiiyaStore((state) => state.canvasMode);
  const setSelectedElementId = useYiiyaStore(
    (state) => state.setSelectedElementId,
  );
  const setSelectedElements = useYiiyaStore(
    (state) => state.setSelectedElements,
  );
  const setHoveredElementId = useYiiyaStore(
    (state) => state.setHoveredElementId,
  );
  const addLog = useYiiyaStore((state) => state.addLog);
  const sceneObjects = useYiiyaStore((state) => state.sceneObjects);
  const addSpatialAnchor = useYiiyaStore((state) => state.addSpatialAnchor);
  const baseTheme = compileYiiyaTheme(themeState);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<CSSProperties | null>(null);

  useEffect(() => {
    const anchoredObjects = sceneObjects.filter(
      (object) => object.anchorSection,
    );

    if (anchoredObjects.length === 0 || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateAnchors = () => {
      anchoredObjects.forEach((object) => {
        if (!object.anchorSection) {
          return;
        }

        const element = document.querySelector<HTMLElement>(
          `[data-yiiya-id="${CSS.escape(object.anchorSection)}"]`,
        );

        if (!element) {
          return;
        }

        const rect = element.getBoundingClientRect();
        const x =
          ((rect.left + rect.width / 2) / window.innerWidth - 0.5) * 5.2;
        const y =
          (0.5 - (rect.top + rect.height / 2) / window.innerHeight) * 3.4;

        addSpatialAnchor({
          objectId: object.id,
          elementId: object.anchorSection,
          placement: "behind",
          worldPosition: [x, y, -0.8],
        });
      });
    };
    const observer = new ResizeObserver(updateAnchors);

    anchoredObjects.forEach((object) => {
      if (!object.anchorSection) {
        return;
      }

      const element = document.querySelector<HTMLElement>(
        `[data-yiiya-id="${CSS.escape(object.anchorSection)}"]`,
      );

      if (element) {
        observer.observe(element);
      }
    });
    updateAnchors();

    return () => observer.disconnect();
  }, [addSpatialAnchor, sceneObjects]);

  const clearBlockActive = () => {
    document
      .querySelectorAll("[data-yiiya-block-active='true']")
      .forEach((element) => element.removeAttribute("data-yiiya-block-active"));
  };

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const target = closestYiiyaElement(
      document.elementFromPoint(event.clientX, event.clientY),
    );
    const block = closestBlockYiiyaElement(target);

    setHoveredElementId(target?.dataset.yiiyaId ?? null);
    clearBlockActive();

    if (block) {
      block.setAttribute("data-yiiya-block-active", "true");
    }

    if (dragStartRef.current) {
      const left = Math.min(dragStartRef.current.x, event.clientX);
      const top = Math.min(dragStartRef.current.y, event.clientY);
      const width = Math.abs(event.clientX - dragStartRef.current.x);
      const height = Math.abs(event.clientY - dragStartRef.current.y);

      setDragRect({ left, top, width, height });
    }
  };

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    dragStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleMouseUp = (event: MouseEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    dragStartRef.current = null;

    if (!start) {
      return;
    }

    const width = Math.abs(event.clientX - start.x);
    const height = Math.abs(event.clientY - start.y);
    setDragRect(null);

    if (width < 8 && height < 8) {
      return;
    }

    const dragBox = new DOMRect(
      Math.min(start.x, event.clientX),
      Math.min(start.y, event.clientY),
      width,
      height,
    );
    const selected = Array.from(
      document.querySelectorAll<HTMLElement>("[data-yiiya-id]"),
    )
      .filter((element) =>
        rectsIntersect(dragBox, element.getBoundingClientRect()),
      )
      .map((element) => element.dataset.yiiyaId)
      .filter((id): id is string => Boolean(id));

    setSelectedElements(selected);
    setSelectedElementId(selected[0] ?? null);
    addLog(`[CONTEXT]: ${selected.length} elements selected`);
  };

  if (canvasMode === "3D") {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-10 overflow-auto px-5 pb-28 pt-6 transition-opacity sm:px-8"
      style={{
        opacity: 1,
        pointerEvents: "auto",
      }}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setHoveredElementId(null);
        clearBlockActive();
        dragStartRef.current = null;
        setDragRect(null);
      }}
    >
      {sections.length === 0 ? (
        <div className="grid h-full place-items-center">
          <p className="text-sm font-medium text-white/42">
            {canvasMode === "HYBRID"
              ? "Use this presentation layer only after the model direction is clear"
              : "Optional web mode: describe a page or upload a presentation reference"}
          </p>
        </div>
      ) : (
        <div
          data-yiiya-publish-root
          className="pointer-events-auto mx-auto min-h-full w-full max-w-[1480px] overflow-hidden rounded-[22px] border border-white/10 bg-[#050505]/76 shadow-[0_30px_120px_rgba(0,0,0,0.42)] backdrop-blur-[1px]"
          onClick={() => setSelectedElementId(null)}
          onMouseDown={(event) => {
            if (!closestYiiyaElement(event.target as Element)) {
              setSelectedElementId(null);
              setSelectedElements([]);
            }
          }}
          onMouseLeave={() => setHoveredElementId(null)}
        >
          <div
            className="flex h-9 items-center gap-2 border-b px-4 text-xs"
            style={{
              backgroundColor: baseTheme.background,
              borderColor: baseTheme.border,
              color: baseTheme.mutedForeground,
            }}
          >
            <span className="h-2 w-2 rounded-full bg-black/18" />
            <span className="h-2 w-2 rounded-full bg-black/18" />
            <span className="h-2 w-2 rounded-full bg-black/18" />
            <span className="ml-2 font-mono">
              yiiya.app - presentation layer
            </span>
          </div>
          {sections.map((section, index) => (
            <RenderSection
              key={section.id}
              section={section}
              index={index + 1}
              theme={sectionTheme(section, themeState) ?? baseTheme}
            />
          ))}
        </div>
      )}
      {dragRect ? (
        <div
          className="pointer-events-none fixed z-[70] border border-amber/70 bg-amber/10"
          style={dragRect}
        />
      ) : null}
    </div>
  );
}
