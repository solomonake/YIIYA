"use client";

import {
  type CSSProperties,
  type MouseEvent,
  type PropsWithChildren
} from "react";
import { compileYiiyaTheme, type CompiledYiiyaTheme } from "@/lib/designSystem";
import {
  type SectionContent,
  type YiiyaSection,
  useYiiyaStore
} from "@/lib/store";

type SelectableProps = PropsWithChildren<{
  as?: "section" | "div" | "h1" | "h2" | "p" | "button" | "form";
  id: string;
  className?: string;
  style?: CSSProperties;
  type?: "button" | "submit";
}>;

function textFrom(content: SectionContent, keys: string[], fallback: string) {
  for (const key of keys) {
    const value = content[key];

    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
  }

  return fallback;
}

type FeatureItem = {
  heading: string;
  subtext: string;
};

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

function sectionShellStyle(theme: CompiledYiiyaTheme): CSSProperties {
  return {
    backgroundColor: theme.background,
    color: theme.foreground,
    padding: `${theme.spacing.sectionY}px ${theme.spacing.sectionX}px`
  };
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

  return (
    <Selectable
      as="section"
      id={`hero-section-${index}`}
      className="min-h-[420px] overflow-hidden"
      style={sectionShellStyle(theme)}
    >
      <Selectable
        id={`hero-kicker-${index}`}
        className="inline-flex border uppercase tracking-[0.18em]"
        style={{
          marginBottom: theme.spacing.md,
          borderColor: theme.primaryAccent,
          borderRadius: theme.borderRadius,
          color: theme.primaryAccent,
          padding: `${theme.spacing.xs / 2}px ${theme.spacing.sm}px`,
          fontSize: theme.type.small
        }}
      >
        Yiiya canvas
      </Selectable>
      <Selectable
        as="h1"
        id={`hero-title-${index}`}
        className="max-w-3xl leading-[0.95] tracking-[0]"
        style={{
          fontSize: theme.type.hero,
          fontWeight: theme.fontWeight
        }}
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
          fontSize: theme.type.body * 1.12
        }}
      >
        {subtext}
      </Selectable>
      <Selectable
        as="button"
        id={`hero-cta-${index}`}
        type="button"
        className="font-semibold"
        style={{
          marginTop: theme.spacing.lg,
          borderRadius: theme.borderRadius * 2,
          padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
          fontSize: theme.type.small,
          backgroundColor: theme.primaryAccent,
          color: theme.background
        }}
      >
        {cta}
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
      style={{
        ...sectionShellStyle(theme),
        gap: theme.spacing.lg
      }}
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
          borderRadius: theme.borderRadius * 1.35,
          borderColor: theme.border,
          background:
            `linear-gradient(135deg, ${theme.primaryAccent}33, transparent 60%), repeating-linear-gradient(45deg, rgba(0,0,0,0.08) 0 1px, transparent 1px 16px)`
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
        className="grid md:grid-cols-3"
        style={{
          marginTop: theme.spacing.lg,
          gap: theme.spacing.md
        }}
      >
        {features.slice(0, 3).map((feature, featureIndex) => (
          <Selectable
            key={`${feature.heading}-${featureIndex}`}
            id={`feature-card-${index}-${featureIndex + 1}`}
            className="min-h-[180px] border"
            style={{
              borderRadius: theme.borderRadius * 1.2,
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
                fontSize: theme.type.small
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
      style={{
        ...sectionShellStyle(theme),
        gap: theme.spacing.lg
      }}
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
        <Selectable
          id={`contact-name-${index}`}
          className="flex h-12 w-full items-center border"
          style={{
            borderRadius: theme.borderRadius,
            borderColor: theme.border,
            backgroundColor: theme.surface,
            color: theme.mutedForeground,
            padding: `0 ${theme.spacing.md}px`,
            fontSize: theme.type.small
          }}
        >
          Name
        </Selectable>
        <Selectable
          id={`contact-email-${index}`}
          className="flex h-12 w-full items-center border"
          style={{
            borderRadius: theme.borderRadius,
            borderColor: theme.border,
            backgroundColor: theme.surface,
            color: theme.mutedForeground,
            padding: `0 ${theme.spacing.md}px`,
            fontSize: theme.type.small
          }}
        >
          Email
        </Selectable>
        <Selectable
          id={`contact-message-${index}`}
          className="min-h-[120px] w-full border"
          style={{
            borderRadius: theme.borderRadius,
            borderColor: theme.border,
            backgroundColor: theme.surface,
            color: theme.mutedForeground,
            padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
            fontSize: theme.type.small
          }}
        >
          Message
        </Selectable>
        <Selectable
          as="button"
          id={`contact-submit-${index}`}
          type="button"
          className="font-semibold"
          style={{
            borderRadius: theme.borderRadius * 2,
            padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
            backgroundColor: theme.primaryAccent,
            color: theme.background,
            fontSize: theme.type.small
          }}
        >
          Send
        </Selectable>
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
  if (section.sectionType === "ABOUT") {
    return <AboutSection section={section} index={index} theme={theme} />;
  }

  if (section.sectionType === "FEATURES") {
    return <FeaturesSection section={section} index={index} theme={theme} />;
  }

  if (section.sectionType === "CONTACT") {
    return <ContactSection section={section} index={index} theme={theme} />;
  }

  return <HeroSection section={section} index={index} theme={theme} />;
}

export function WebsiteLayer() {
  const sections = useYiiyaStore((state) => state.sections);
  const themeState = useYiiyaStore((state) => state.themeState);
  const setSelectedElementId = useYiiyaStore((state) => state.setSelectedElementId);
  const setHoveredElementId = useYiiyaStore((state) => state.setHoveredElementId);
  const theme = compileYiiyaTheme(themeState);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-auto px-5 pb-28 pt-6 sm:px-8">
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
            <span className="ml-2 font-mono">yiiya.app — landing page</span>
          </div>
          {sections.map((section, index) => (
            <RenderSection
              key={section.id}
              section={section}
              index={index + 1}
              theme={theme}
            />
          ))}
        </div>
      )}
    </div>
  );
}
