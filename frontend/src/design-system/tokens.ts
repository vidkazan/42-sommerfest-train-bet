export type ThemeMode = "light" | "dark";
export type TransportType = "bus" | "ice" | "re" | "s" | "ship" | "taxi" | "tram" | "u";

export const colors = {
  fill: {
    primary: "var(--chew-fill-primary)", secondary: "var(--chew-fill-secondary)", tertiary: "var(--chew-fill-tertiary)",
    accent: "var(--chew-fill-accent)", magenta: "var(--chew-fill-magenta)", blue: "var(--chew-fill-blue-primary)",
    green: "var(--chew-fill-green-primary)", greenSecondary: "var(--chew-fill-green-secondary)", yellow: "var(--chew-fill-yellow-primary)", red: "var(--chew-fill-red-primary)",
  },
  transport: {
    bus: "var(--transport-bus-magenta)", ice: "var(--transport-ice-gray)", re: "var(--transport-re-gray)", s: "var(--transport-s-green)",
    ship: "var(--transport-ship-cyan)", taxi: "var(--transport-taxi-yellow)", tram: "var(--transport-tram-red)", u: "var(--transport-u-blue)",
  } satisfies Record<TransportType, string>,
  map: {
    route: "var(--ds-map-route)", routeSelected: "var(--ds-map-route-selected)", station: "var(--ds-map-station)",
    train: "var(--ds-map-train)", trainBorder: "var(--ds-map-train-border)", trainSelected: "var(--ds-map-train-selected)", trainSelectedBorder: "var(--ds-map-train-selected-border)",
  },
} as const;

export const typography = {
  small: { fontSize: "0.5625rem", lineHeight: 1.2, fontWeight: 600 }, medium: { fontSize: "0.75rem", lineHeight: 1.25, fontWeight: 600 },
  big: { fontSize: "1.0625rem", lineHeight: 1.25, fontWeight: 600 }, huge: { fontSize: "1.25rem", lineHeight: 1.2, fontWeight: 600 },
} as const;
export const spacing = { xs: "0.25rem", sm: "0.5rem", md: "0.75rem", lg: "1rem", xl: "1.25rem" } as const;
export const radii = { badge: "0.5rem", control: "0.75rem", card: "1.25rem", pill: "999px" } as const;
export const transportIcons: Record<TransportType, string> = {
  bus: "/design-system/icons/bus.svg", ice: "/design-system/icons/ice.svg", re: "/design-system/icons/re.svg", s: "/design-system/icons/s.svg",
  ship: "/design-system/icons/ship.svg", taxi: "/design-system/icons/taxi.svg", tram: "/design-system/icons/tram.svg", u: "/design-system/icons/u.svg",
};
