import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const styles: Record<Variant, string> = {
  primary: "bg-emerald-500 text-slate-950 active:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400",
  secondary: "bg-slate-700 text-slate-100 active:bg-slate-600 disabled:opacity-40",
  ghost: "bg-transparent text-slate-200 active:bg-slate-800 disabled:opacity-40",
  danger: "bg-rose-600 text-white active:bg-rose-500 disabled:opacity-40",
};

export function Button({ variant = "primary", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={`min-h-11 min-w-11 rounded-xl px-4 text-[15px] font-semibold transition-colors ${styles[variant]} ${className}`} {...rest} />;
}
