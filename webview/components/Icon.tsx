import React from "react";

export type IconName =
  | "search" | "more" | "plus" | "send" | "grip" | "check"
  | "chevron" | "close" | "cloud" | "cloud-check" | "cloud-off"
  | "sync" | "folder" | "warn" | "trash" | "bold" | "italic" | "code";

interface Props {
  name: IconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function Icon({ name, size = 16, className, style }: Props) {
  const base: React.SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.3,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className,
    style,
  };
  switch (name) {
    case "search":
      return <svg {...base}><circle cx="7" cy="7" r="4.2" /><path d="M10.2 10.2 14 14" /></svg>;
    case "more":
      return <svg {...base} strokeWidth={0} fill="currentColor"><circle cx="3" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="13" cy="8" r="1.3" /></svg>;
    case "plus":
      return <svg {...base}><path d="M8 3v10M3 8h10" /></svg>;
    case "send":
      return <svg {...base}><path d="M2.5 8h9M8 4.5 11.5 8 8 11.5" /></svg>;
    case "grip":
      return <svg {...base} strokeWidth={0} fill="currentColor"><circle cx="6" cy="4" r="1" /><circle cx="10" cy="4" r="1" /><circle cx="6" cy="8" r="1" /><circle cx="10" cy="8" r="1" /><circle cx="6" cy="12" r="1" /><circle cx="10" cy="12" r="1" /></svg>;
    case "check":
      return <svg {...base} strokeWidth={1.8}><path d="M3.2 8.4 6.4 11.5 12.8 4.8" /></svg>;
    case "chevron":
      return <svg {...base}><path d="M6 4l4 4-4 4" /></svg>;
    case "close":
      return <svg {...base}><path d="M4 4l8 8M12 4l-8 8" /></svg>;
    case "cloud":
      return <svg {...base}><path d="M4.5 12.5a3 3 0 0 1-.3-5.98A3.5 3.5 0 0 1 11 6.2a2.8 2.8 0 0 1 .3 5.6z" /></svg>;
    case "cloud-check":
      return <svg {...base}><path d="M4.6 11.5a2.7 2.7 0 0 1-.3-5.38A3.2 3.2 0 0 1 10.6 6a2.55 2.55 0 0 1 .3 5.1" /><path d="M6.2 9.2 7.6 10.6 10.4 7.6" strokeWidth={1.5} /></svg>;
    case "cloud-off":
      return <svg {...base}><path d="M4.5 12.5a3 3 0 0 1-.3-5.98 3.5 3.5 0 0 1 1.1-1.97M9.2 4.4A3.5 3.5 0 0 1 11 6.2a2.8 2.8 0 0 1 .3 5.6H6.5" /><path d="M2 2l12 12" /></svg>;
    case "sync":
      return <svg {...base}><path d="M12.5 4.5A5 5 0 0 0 3.6 6M3 3v3h3M3.5 11.5A5 5 0 0 0 12.4 10M13 13v-3h-3" /></svg>;
    case "folder":
      return <svg {...base}><path d="M2 4.5A1 1 0 0 1 3 3.5h3l1.3 1.4H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" /></svg>;
    case "warn":
      return <svg {...base}><path d="M8 2.5 14.5 13.5H1.5z" /><path d="M8 6.5v3.2M8 11.4v.1" strokeWidth={1.5} /></svg>;
    case "trash":
      return <svg {...base}><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" /></svg>;
    case "bold":
      return <svg {...base} strokeWidth={1.5}><path d="M5 3.5h3.2a2.2 2.2 0 0 1 0 4.4H5zM5 7.9h3.8a2.3 2.3 0 0 1 0 4.6H5z" /></svg>;
    case "italic":
      return <svg {...base} strokeWidth={1.5}><path d="M6.5 3.5h4M5 12.5h4M9.5 3.5 7 12.5" /></svg>;
    case "code":
      return <svg {...base}><path d="M6 5 3 8l3 3M10 5l3 3-3 3" /></svg>;
    default:
      return null;
  }
}
