"use client";

import {
  type CSSProperties,
  type MouseEvent,
  type PropsWithChildren
} from "react";
import {
  compileYiiyaTheme,
  mergeYiiyaTheme,
  type CompiledYiiyaTheme,
  type YiiyaTheme
} from "@/lib/designSystem";
import {
  type SectionContent,
  type YiiyaSection,
  useYiiyaStore
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

function textFrom(content: Record<string, unknown>, keys: string[], fallback: string) {
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
  fallback: string[]
): FeatureItem[] {
  const value = content[key];

  if (!Array.isArray(value)) {
    return fallback.map((item) => ({
      heading: item,
      subtext: "Generated from your voice prompt."
    }));
  }

  return value.map((item) => {
    if (typeof item === "string" || typeof item === "number") {
      return { heading: String(item), subtext: "Generated from your voice prompt." };
    }

    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      return {
        heading: textFrom(record, ["heading", "title", "name"], "Feature"),
        subtext: textFrom(
          record,
          ["subtext", "description", "body", "text"],
          "Generated from your voice prompt."
        )
      };
    }

    return { heading: "Feature", subtext: "Generated from your voice prompt." };
  });
}

function stringListFrom(
  content: SectionContent,
  key: string,
  fallback: string[]
) {
  const value = content[key];

  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .map((item) =>
      typeof item === "string" || typeof item === "number" ? String(item) : null
    )
    .filter((item): item is string => Boolean(item));
}

function recordsFrom(
  content: SectionContent,
  key: string,
  fallback: Array<Record<string, unknown>>
) {
  const value = content[key];

  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .map((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null
    )
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function Selectable({
  as = "div",
  id,
  className,
  style,
  type,
  children
}: SelectableProps) {
  const selectedElementId = useYiiyaStore((state) => state.selectedElementId);
  const hoveredElementId = useYiiyaStore((state) => state.hoveredElementId);
  const setSelectedElementId = useYiiyaStore((state) => state.setSelectedElementId);
  const setHoveredElementId = useYiiyaStore((state) => state.setHoveredElementId);
  const isHovered = hoveredElementId === id;
  const isSelected = selectedElementId === id;
  const Component = as;

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setSelectedElementId(id);
  };

  return (
    <Component
      data-yiiya-id={id}
      data-yiiya-active={isHovered || isSelected ? "true" : "false"}
      className={`yiiya-element relative ${className ?? ""}`}
      style={style}
      type={type}
      onMouseEnter={() => setHoveredElementId(id)}
      onMouseLeave={() => {
        if (useYiiyaStore.getState().hoveredElementId === id) {
          setHoveredElementId(null);
        }
      }}
      onClick={handleClick}
    >
      {children}
      {isHovered || isSelected ? (
        <span
          data-yiiya-id={`${id}-label`}
          className="pointer-events-none absolute right-1 top-1 z-30 bg-amber px-1.5 py-0.5 font-mono text-[10px] leading-none text-ink shadow-[0_8px_20px_rgba(0,0,0,0.24)]"
        >
          {id}
        </span>
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

  return compileYiiyaTheme(mergeYiiyaTheme(themeState, sectionOverrides));
}

function sectionShellStyle(theme: CompiledYiiyaTheme): CSSProperties {
  return {
    backgroundColor: theme.background,
    color: theme.foreground,
    padding: `${theme.spacing.sectionY}px ${theme.spacing.sectionX}px`
  };
}

function ButtonLike({
  id,
  children,
  theme,
  variant = "filled"
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
        backgroundColor: variant === "filled" ? theme.primaryAccent : "transparent",
        color: variant === "filled" ? theme.background : theme.primaryAccent,
        fontSize: theme.type.body,
        padding: `${theme.spacing.sm}px ${theme.spacing.md}px`
      }}
    >
      {children}
    </Selectable>
  );
}

function NavbarSection({
  section,
  index,
  theme
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const projectName = useYiiyaStore((state) => state.projectName);
  const brand = textFrom(section.content, ["brand", "heading", "title"], projectName);
  const links = stringListFrom(section.content, "links", ["Work", "About", "Contact"]);
  const cta = textFrom(section.content, ["cta", "button", "buttonText"], "Start");

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
        padding: `${theme.spacing.sm}px ${theme.spacing.sectionX}px`
      }}
    >
      <Selectable
        id={`navbar-brand-${index}`}
        className="shrink-0 font-bold"
        style={{ color: theme.foreground, fontSize: theme.type.body }}
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
            style={{ color: theme.mutedForeground, fontSize: theme.type.body }}
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
  theme
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const heading = textFrom(section.content, ["heading", "title"], "Build by speaking.");
  const subtext = textFrom(
    section.content,
    ["subtext", "subtitle", "body", "description"],
    "Create websites and 3D scenes with plain language."
  );
  const cta = textFrom(section.content, ["cta", "button", "buttonText"], "Start creating");
  const variant = section.layoutVariant ?? "CENTERED_IMPACT";

  if (variant === "EDITORIAL_SPLIT") {
    return (
      <Selectable
        as="section"
        id={`hero-section-${index}`}
        className="grid min-h-[80svh] items-center md:grid-cols-[minmax(0,0.6fr)_minmax(280px,0.4fr)]"
        style={{ ...sectionShellStyle(theme), gap: theme.spacing.xl }}
      >
        <Selectable id={`hero-copy-${index}`} className="self-center">
          <Selectable
            as="h1"
            id={`hero-title-${index}`}
            className="leading-[0.98] tracking-[0]"
            style={{ fontSize: theme.type.hero, fontWeight: theme.fontWeight }}
          >
            {heading}
          </Selectable>
          <Selectable
            as="p"
            id={`hero-subtext-${index}`}
            className="max-w-2xl leading-8"
            style={{
              marginTop: theme.spacing.md,
              color: theme.mutedForeground,
              fontSize: theme.type.body
            }}
          >
            {subtext}
          </Selectable>
          <Selectable id={`hero-cta-wrap-${index}`} style={{ marginTop: theme.spacing.lg }}>
            <ButtonLike id={`hero-cta-${index}`} theme={theme}>
              {cta}
            </ButtonLike>
          </Selectable>
        </Selectable>
        <Selectable
          id={`hero-visual-${index}`}
          className="grid min-h-[520px] place-items-center border"
          style={{
            borderColor: theme.border,
            borderRadius: theme.borderRadius,
            color: theme.mutedForeground,
            fontSize: theme.type.body
          }}
        >
          Visual
        </Selectable>
      </Selectable>
    );
  }

  if (variant === "BENTO_GRID") {
    return (
      <Selectable
        as="section"
        id={`hero-section-${index}`}
        className="grid min-h-[86svh] grid-cols-1 md:grid-cols-3"
        style={{ ...sectionShellStyle(theme), gap: theme.spacing.md }}
      >
        <Selectable
          id={`hero-title-cell-${index}`}
          className="border md:col-span-2"
          style={{
            borderColor: theme.border,
            borderRadius: theme.borderRadius,
            padding: theme.spacing.lg
          }}
        >
          <Selectable
            as="h1"
            id={`hero-title-${index}`}
            className="leading-[0.96] tracking-[0]"
            style={{ fontSize: theme.type.hero, fontWeight: theme.fontWeight }}
          >
            {heading}
          </Selectable>
        </Selectable>
        <Selectable
          id={`hero-stats-${index}`}
          className="grid border"
          style={{
            borderColor: theme.border,
            borderRadius: theme.borderRadius,
            gap: theme.spacing.sm,
            padding: theme.spacing.lg
          }}
        >
          {[
            ["4x", "faster drafts"],
            ["11", "section types"],
            ["3D", "spatial layer"]
          ].map(([value, label], statIndex) => (
            <Selectable key={value} id={`hero-stat-${index}-${statIndex + 1}`}>
              <Selectable
                as="h2"
                id={`hero-stat-value-${index}-${statIndex + 1}`}
                style={{
                  color: theme.primaryAccent,
                  fontSize: theme.type.title,
                  fontWeight: theme.fontWeight
                }}
              >
                {value}
              </Selectable>
              <Selectable
                as="p"
                id={`hero-stat-label-${index}-${statIndex + 1}`}
                style={{ color: theme.mutedForeground, fontSize: theme.type.body }}
              >
                {label}
              </Selectable>
            </Selectable>
          ))}
        </Selectable>
        <Selectable
          id={`hero-visual-${index}`}
          className="grid min-h-[340px] place-items-center border md:col-span-2"
          style={{
            borderColor: theme.border,
            borderRadius: theme.borderRadius,
            color: theme.mutedForeground,
            fontSize: theme.type.body
          }}
        >
          Visual
        </Selectable>
        <Selectable
          id={`hero-cta-cell-${index}`}
          className="border"
          style={{
            borderColor: theme.border,
            borderRadius: theme.borderRadius,
            padding: theme.spacing.lg
          }}
        >
          <Selectable
            as="p"
            id={`hero-subtext-${index}`}
            className="leading-7"
            style={{ color: theme.mutedForeground, fontSize: theme.type.body }}
          >
            {subtext}
          </Selectable>
          <Selectable id={`hero-cta-wrap-${index}`} style={{ marginTop: theme.spacing.md }}>
            <ButtonLike id={`hero-cta-${index}`} theme={theme}>
              {cta}
            </ButtonLike>
          </Selectable>
        </Selectable>
      </Selectable>
    );
  }

  return (
    <Selectable
      as="section"
      id={`hero-section-${index}`}
      className="grid min-h-svh place-items-center text-center"
      style={sectionShellStyle(theme)}
    >
      <Selectable id={`hero-copy-${index}`} className="mx-auto max-w-4xl">
        <Selectable
          as="h1"
          id={`hero-title-${index}`}
          className="leading-[0.94] tracking-[0]"
          style={{
            fontSize: theme.type.hero * 1.08,
            fontWeight: theme.fontWeight
          }}
        >
          {heading}
        </Selectable>
        <Selectable
          as="p"
          id={`hero-subtext-${index}`}
          className="mx-auto max-w-2xl leading-8"
          style={{
            marginTop: theme.spacing.md,
            color: theme.mutedForeground,
            fontSize: theme.type.body
          }}
        >
          {subtext}
        </Selectable>
        <Selectable id={`hero-cta-wrap-${index}`} style={{ marginTop: theme.spacing.lg }}>
          <ButtonLike id={`hero-cta-${index}`} theme={theme}>
            {cta}
          </ButtonLike>
        </Selectable>
      </Selectable>
    </Selectable>
  );
}

function AboutSection({
  section,
  index,
  theme
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const heading = textFrom(section.content, ["heading", "title"], "Designed for fast iteration.");
  const subtext = textFrom(
    section.content,
    ["subtext", "body", "description"],
    "Describe the structure, mood, and details you want. Yiiya turns intent into editable website sections."
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
          style={{ fontSize: theme.type.title, fontWeight: theme.fontWeight }}
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
            fontSize: theme.type.body
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
          backgroundColor: theme.surface
        }}
      />
    </Selectable>
  );
}

function FeaturesSection({
  section,
  index,
  theme
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const heading = textFrom(section.content, ["heading", "title"], "Everything stays editable.");
  const features = listFrom(section.content, "features", [
    "Voice instructions",
    "Live sections",
    "3D-ready canvas"
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
        style={{ fontSize: theme.type.title, fontWeight: theme.fontWeight }}
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
        {features.slice(0, variant === "FEATURES_HORIZONTAL" ? 6 : 3).map((feature, featureIndex) => (
          <Selectable
            key={`${feature.heading}-${featureIndex}`}
            id={`feature-card-${index}-${featureIndex + 1}`}
            className="min-h-[180px] shrink-0 border"
            style={{
              width: variant === "FEATURES_HORIZONTAL" ? 320 : undefined,
              borderRadius: theme.borderRadius,
              borderColor: theme.border,
              padding: theme.spacing.md,
              backgroundColor: theme.surface
            }}
          >
            <Selectable
              as="h2"
              id={`feature-title-${index}-${featureIndex + 1}`}
              style={{
                fontSize: theme.type.body * 1.22,
                fontWeight: theme.fontWeight
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
                fontSize: theme.type.body
              }}
            >
              {feature.subtext}
            </Selectable>
          </Selectable>
        ))}
      </Selectable>
    </Selectable>
  );
}

function ServicesSection({
  section,
  index,
  theme
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const heading = textFrom(section.content, ["heading", "title"], "Services built for momentum.");
  const services = listFrom(section.content, "services", [
    "Launch strategy",
    "Visual system",
    "Conversion page"
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
        style={{ fontSize: theme.type.title, fontWeight: theme.fontWeight }}
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
              backgroundColor: theme.surface
            }}
          >
            <Selectable
              id={`service-icon-${index}-${serviceIndex + 1}`}
              className="border"
              style={{
                width: theme.spacing.lg,
                height: theme.spacing.lg,
                borderColor: theme.primaryAccent,
                borderRadius: Math.max(2, theme.borderRadius * 0.35)
              }}
            />
            <Selectable
              as="h2"
              id={`service-title-${index}-${serviceIndex + 1}`}
              style={{
                marginTop: theme.spacing.md,
                fontSize: theme.type.body * 1.2,
                fontWeight: theme.fontWeight
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
                fontSize: theme.type.body
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
  theme
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const metrics = recordsFrom(section.content, "metrics", [
    { value: "2,400+", label: "Projects created" },
    { value: "18k", label: "Voice edits" },
    { value: "96%", label: "Faster drafts" },
    { value: "11", label: "Section types" }
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
              textAlign: "center"
            }}
          >
            <Selectable
              as="h2"
              id={`metric-value-${index}-${metricIndex + 1}`}
              style={{
                color: theme.primaryAccent,
                fontSize: theme.type.body * 2.5,
                fontWeight: theme.fontWeight
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
                fontSize: theme.type.body
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
  theme
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
    "Kepler"
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
        style={{ borderTop: `1px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}` }}
      >
        {logos.slice(0, 6).map((logo, logoIndex) => (
          <Selectable
            key={`${logo}-${logoIndex}`}
            id={`logo-strip-item-${index}-${logoIndex + 1}`}
            className="border-r uppercase last:border-r-0"
            style={{
              borderColor: theme.border,
              color: theme.mutedForeground,
              fontSize: theme.type.body,
              padding: `${theme.spacing.md}px ${theme.spacing.sm}px`
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
  theme
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const heading = textFrom(section.content, ["heading", "title"], "Proof from real buyers.");
  const testimonials = recordsFrom(section.content, "testimonials", [
    {
      quote:
        "The first draft gave us enough clarity to pitch the direction immediately. Every edit stayed structured and fast.",
      name: "Amina Cole",
      role: "Founder"
    },
    {
      quote:
        "It felt like a creative director and front-end team in the same room. The canvas made iteration visible.",
      name: "David Lin",
      role: "Agency lead"
    },
    {
      quote:
        "We moved from a rough brief to a page we could review with clients. The voice loop changed the meeting.",
      name: "Nia Brooks",
      role: "Producer"
    }
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
        style={{ fontSize: theme.type.title, fontWeight: theme.fontWeight }}
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
                backgroundColor: theme.surface
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
                  fontSize: theme.type.body,
                  fontWeight: theme.fontWeight
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
                  fontSize: theme.type.body
                }}
              >
                {textFrom(testimonial, ["quote", "text"], "Strong signal from the market.")}
              </Selectable>
              <Selectable
                as="h2"
                id={`testimonial-name-${index}-${testimonialIndex + 1}`}
                style={{
                  marginTop: theme.spacing.md,
                  fontSize: theme.type.body,
                  fontWeight: theme.fontWeight
                }}
              >
                {name}
              </Selectable>
              <Selectable
                as="p"
                id={`testimonial-role-${index}-${testimonialIndex + 1}`}
                style={{ color: theme.mutedForeground, fontSize: theme.type.body }}
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
  theme
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const heading = textFrom(section.content, ["heading", "title"], "Simple pricing.");
  const plans = recordsFrom(section.content, "plans", [
    {
      name: "Starter",
      price: "$49",
      features: ["One project", "Voice editing", "Local drafts", "Publish link"]
    },
    {
      name: "Pro",
      price: "$149",
      features: ["Unlimited projects", "3D scenes", "Reference images", "Sync history"]
    },
    {
      name: "Studio",
      price: "$399",
      features: ["Team projects", "Client review", "Custom themes", "Priority support"]
    }
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
        style={{ fontSize: theme.type.title, fontWeight: theme.fontWeight }}
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
                    : null
                )
                .filter((item): item is string => Boolean(item))
            : ["Design system", "Production handoff", "Fast publish", "Support"];

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
                backgroundColor: theme.surface
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
                    fontSize: theme.type.body,
                    padding: `${theme.spacing.xs / 2}px ${theme.spacing.sm}px`
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
                  fontWeight: theme.fontWeight
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
                  fontSize: theme.type.title,
                  fontWeight: theme.fontWeight
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
                      fontSize: theme.type.body
                    }}
                  >
                    <span style={{ color: theme.primaryAccent }}>✓</span> {feature}
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
  theme
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const heading = textFrom(section.content, ["heading", "title"], "Questions before launch.");
  const faqs = recordsFrom(section.content, "faqs", [
    {
      question: "Can this be edited after publish?",
      answer: "Yes. Yiiya keeps project state structured so future edits can target sections and elements."
    },
    {
      question: "Can I mix websites and 3D?",
      answer: "Yes. The spatial layer can sit behind, above, or beside the generated web sections."
    },
    {
      question: "Does reference imagery affect the theme?",
      answer: "Dropped images immediately update the palette before the model responds."
    },
    {
      question: "Do guests get the full canvas?",
      answer: "Guest users can use the full canvas, with local drafts and watermarked publishing."
    },
    {
      question: "Is there an accordion?",
      answer: "Not yet. Answers stay visible so the first pass remains simple and editable."
    }
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
        style={{ fontSize: theme.type.title, fontWeight: theme.fontWeight }}
      >
        {heading}
      </Selectable>
      <Selectable id={`faq-list-${index}`} style={{ marginTop: theme.spacing.lg }}>
        {faqs.slice(0, 5).map((faq, faqIndex) => (
          <Selectable
            key={`${textFrom(faq, ["question"], "question")}-${faqIndex}`}
            id={`faq-item-${index}-${faqIndex + 1}`}
            className="border-b"
            style={{
              borderColor: theme.border,
              padding: `${theme.spacing.md}px 0`
            }}
          >
            <Selectable
              as="h2"
              id={`faq-question-${index}-${faqIndex + 1}`}
              style={{ fontSize: theme.type.body, fontWeight: 400 }}
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
                fontSize: theme.type.body
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
  theme
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const heading = textFrom(section.content, ["heading", "title"], "Start a conversation.");
  const subtext = textFrom(
    section.content,
    ["subtext", "body", "description"],
    "Leave a note and the next step can become part of the canvas."
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
          style={{ fontSize: theme.type.title, fontWeight: theme.fontWeight }}
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
            fontSize: theme.type.body
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
              fontSize: theme.type.body
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
            fontSize: theme.type.body
          }}
        >
          Message
        </Selectable>
        <ButtonLike id={`contact-submit-${index}`} theme={theme}>
          Send
        </ButtonLike>
      </Selectable>
    </Selectable>
  );
}

function FooterSection({
  section,
  index,
  theme
}: {
  section: YiiyaSection;
  index: number;
  theme: CompiledYiiyaTheme;
}) {
  const projectName = useYiiyaStore((state) => state.projectName);
  const brand = textFrom(section.content, ["brand", "heading", "title"], projectName);
  const subtext = textFrom(section.content, ["subtext", "body"], "Built with Yiiya.");
  const links = stringListFrom(section.content, "links", [
    "Work",
    "About",
    "Services",
    "Pricing",
    "Contact"
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
        padding: `${theme.spacing.lg}px ${theme.spacing.sectionX}px`
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
            style={{ fontSize: theme.type.body }}
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
              fontSize: theme.type.body
            }}
          >
            {subtext}
          </Selectable>
        </Selectable>
        <Selectable id={`footer-links-column-${index}`}>
          <Selectable
            as="h2"
            id={`footer-links-title-${index}`}
            style={{ fontSize: theme.type.body, fontWeight: theme.fontWeight }}
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
                style={{ color: theme.mutedForeground, fontSize: theme.type.body }}
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
            style={{ fontSize: theme.type.body, fontWeight: theme.fontWeight }}
          >
            Contact
          </Selectable>
          <Selectable
            as="p"
            id={`footer-email-${index}`}
            style={{
              marginTop: theme.spacing.sm,
              color: theme.mutedForeground,
              fontSize: theme.type.body
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
                style={{ color: theme.primaryAccent, fontSize: theme.type.body }}
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
          fontSize: theme.type.body
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
  theme
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
    return <TestimonialsSection section={section} index={index} theme={theme} />;
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

export function WebsiteLayer() {
  const sections = useYiiyaStore((state) => state.sections);
  const themeState = useYiiyaStore((state) => state.themeState);
  const canvasMode = useYiiyaStore((state) => state.canvasMode);
  const setSelectedElementId = useYiiyaStore((state) => state.setSelectedElementId);
  const setHoveredElementId = useYiiyaStore((state) => state.setHoveredElementId);
  const baseTheme = compileYiiyaTheme(themeState);

  return (
    <div
      className="absolute inset-0 z-10 overflow-auto px-5 pb-28 pt-6 transition-opacity sm:px-8"
      style={{
        opacity: canvasMode === "3D" ? 0 : 1,
        pointerEvents: canvasMode === "3D" ? "none" : "auto"
      }}
    >
      {sections.length === 0 ? (
        <div className="grid h-full place-items-center">
          <p className="text-sm font-medium text-white/42">
            Start speaking to begin
          </p>
        </div>
      ) : (
        <div
          data-yiiya-publish-root
          className="pointer-events-auto mx-auto min-h-full w-full max-w-5xl overflow-hidden rounded-[18px] border border-white/10 bg-white/5 shadow-[0_30px_120px_rgba(0,0,0,0.45)]"
          onClick={() => setSelectedElementId(null)}
          onMouseLeave={() => setHoveredElementId(null)}
        >
          <div className="flex h-9 items-center gap-2 border-b border-black/10 bg-[#f5f5f0] px-4 text-xs text-black/45">
            <span className="h-2 w-2 rounded-full bg-black/18" />
            <span className="h-2 w-2 rounded-full bg-black/18" />
            <span className="h-2 w-2 rounded-full bg-black/18" />
            <span className="ml-2 font-mono">yiiya.app - landing page</span>
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
    </div>
  );
}
