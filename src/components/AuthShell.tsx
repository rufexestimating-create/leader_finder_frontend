"use client";

import React, { useId, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { BRAND_NAME, PRODUCT_NAME } from "@/lib/brand";
import { ThemeToggle } from "./ThemeToggle";

/** Radar mark: two range rings, a sweep arm and one found lead */
export function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.9" />
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.9" opacity="0.5" />
        <path d="M12 12 19 5.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <circle cx="17" cy="15.5" r="1.9" fill="var(--mark-accent)" />
      </svg>
    </div>
  );
}

export function Brand() {
  return (
    <div className="auth-brand">
      <BrandMark />
      <div className="brand-text">
        <span className="brand-name">{BRAND_NAME}</span>
        <span className="brand-product">{PRODUCT_NAME}</span>
      </div>
    </div>
  );
}

/** Decorative radar: range rings, a rotating sweep and companies pinging as they are found */
const BLIPS: [number, number, string][] = [
  [62, 34, "0s"],
  [28, 58, "1.1s"],
  [71, 66, "2.2s"],
  [40, 24, "3.1s"],
];

function Radar() {
  return (
    <div className="auth-radar" aria-hidden="true">
      <svg viewBox="0 0 100 100" fill="none">
        {[46, 34, 22, 10].map((r) => <circle key={r} cx="50" cy="50" r={r} />)}
        <path d="M50 4v92M4 50h92" strokeDasharray="1 2.5" />
      </svg>
      <div className="auth-radar-sweep" />
      {BLIPS.map(([x, y, delay]) => (
        <span key={`${x}-${y}`} className="auth-radar-blip" style={{ left: `${x}%`, top: `${y}%`, animationDelay: delay }} />
      ))}
    </div>
  );
}

const FEATURES = [
  ["Discover", "Search by trade, city and size, or drop in a list of company names."],
  ["Enrich", "We read each website and find the decision makers behind it."],
  ["Verify", "Every email is checked before it reaches your outreach list."],
];

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <aside className="auth-aside">
        <Radar />
        <Brand />
        <div className="auth-hero">
          <span className="auth-eyebrow">B2B prospecting</span>
          {/* A styled paragraph, not a heading: the page's own <h1> ("Welcome back") must come first for screen readers */}
          <p className="auth-hero-title">Find the people who <em>actually sign the contract.</em></p>
          <p>Name a company or a market. ReachAgent reads the web, finds the decision makers and verifies their email.</p>
        </div>

        <ol className="auth-features">
          {FEATURES.map(([title, text], i) => (
            <li key={title} className="auth-feature" style={{ animationDelay: `${0.15 + i * 0.1}s` }}>
              <span className="auth-feature-num">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <strong>{title}</strong>
                <span>{text}</span>
              </div>
            </li>
          ))}
        </ol>

        <div className="auth-mock" aria-hidden="true">
          <div className="auth-mock-head">
            <span className="auth-mock-company"><span className="auth-mock-avatar">N</span>Northline Builders</span>
            <span className="auth-mock-status">Ready</span>
          </div>
          <div className="auth-mock-stats">
            <div><strong>5</strong><span>People found</span></div>
            <div><strong>3</strong><span>Emails verified</span></div>
            <div><strong>8/8</strong><span>Steps done</span></div>
          </div>
          <div className="auth-mock-bar"><span /></div>
        </div>
      </aside>

      <section className="auth-main">
        <ThemeToggle className="auth-theme" />
        <div className="auth-card animate-fade-in">
          <Brand />
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          {children}
          {footer && <div className="auth-footer">{footer}</div>}
        </div>
      </section>
    </main>
  );
}

export function AuthAlert({ type, children }: { type: "error" | "success"; children: React.ReactNode }) {
  return (
    <div className={`alert ${type === "error" ? "alert-danger" : "alert-success"}`} role={type === "error" ? "alert" : "status"}>
      {type === "error" ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
      <div>{children}</div>
    </div>
  );
}

export function Field({
  label,
  hint,
  type,
  ...props
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  const input = (
    <input
      id={id}
      className="input"
      type={isPassword && visible ? "text" : type}
      aria-describedby={hint ? `${id}-hint` : undefined}
      {...props}
    />
  );
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      {isPassword ? (
        <div className="password-wrap">
          {input}
          <button
            type="button"
            className="password-toggle"
            onClick={() => setVisible(!visible)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
          >
            {visible ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
      ) : (
        input
      )}
      {hint && <span id={`${id}-hint`} className="field-hint" style={{ fontWeight: 400 }}>{hint}</span>}
    </div>
  );
}
