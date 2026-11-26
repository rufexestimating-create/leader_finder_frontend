"use client";

import React, { useEffect, useRef, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Once per browser session: a full-screen 0-100% counter, then the panel lifts away */
export function Preloader() {
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState<"off" | "count" | "lift">("off");

  useEffect(() => {
    let seen = true;
    try { seen = sessionStorage.getItem("ra-intro") === "1"; } catch { seen = true; }
    if (seen || reduced()) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 1400);
      setPct(Math.round(100 * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
      else setTimeout(() => setPhase("lift"), 180);
    };
    const start = setTimeout(() => {
      try { sessionStorage.setItem("ra-intro", "1"); } catch { /* private mode: the intro just plays again */ }
      setPhase("count");
      raf = requestAnimationFrame(tick);
    }, 0);
    return () => { clearTimeout(start); cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => {
    if (phase !== "lift") return;
    const t = setTimeout(() => setPhase("off"), 900);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "off") return null;
  return (
    <div className={`st-loader${phase === "lift" ? " is-lift" : ""}`} aria-hidden="true">
      <span className="st-loader-brand">ReachAgent<i>.</i></span>
      <span className="st-loader-line"><i style={{ transform: `scaleX(${pct / 100})` }} /></span>
      <strong className="st-loader-pct">{pct}<small>%</small></strong>
      <span className="st-loader-note">Finding the people who sign the contract</span>
    </div>
  );
}

/** Words slide up out of a mask, one after another */
export function SplitWords({ text, delay = 0 }: { text: string; delay?: number }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((w, i) => (
        <React.Fragment key={i}>
          <span className="sw"><span className="sw-i" style={{ animationDelay: `${delay + i * 90}ms` }}>{w}</span></span>
          {i < words.length - 1 ? " " : null}
        </React.Fragment>
      ))}
    </>
  );
}

/** A number that counts up when it scrolls into view, and glides to its new value when it changes */
export function CountUp({ value, suffix = "", duration = 1300 }: { value: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  const [n, setN] = useState(0);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced()) { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!seen) return;
    if (reduced()) { shown.current = value; setN(value); return; }
    const from = shown.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      const v = Math.round(from + (value - from) * (1 - Math.pow(2, -10 * k)));
      shown.current = v;
      setN(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, value, duration]);

  return <span ref={ref} className="countup">{n.toLocaleString()}{suffix}</span>;
}

const REVEAL = [
  ".kpi-grid > li", ".aw", ".ins-head", ".sp-head", ".sp-label", ".fr-list > li", ".sp-empty", ".dash2-section-head",
  ".dash2-tiles > li", ".viz-card", ".dash-head", ".ag-console", ".ag-home-agents > *", ".ar-head", ".ar-notice", ".ar-steps", ".ar-stats > li", ".ag-panel", ".lf-set-nav li", ".lf-set-panel",
  ".table tbody tr", ".card",
].join(", ");

/** Scroll reveals for cards and sections, a trailing cursor ring, and magnetic pull on [data-magnetic] buttons */
export function MotionLayer() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced()) return;
    let batch: HTMLElement[] = [];
    let flush = 0;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        batch.push(e.target as HTMLElement);
      }
      cancelAnimationFrame(flush);
      flush = requestAnimationFrame(() => {
        batch.forEach((el, i) => {
          const d = Math.min(i, 10) * 70;
          el.style.transitionDelay = `${d}ms`;
          el.classList.add("is-in");
          setTimeout(() => { el.style.transitionDelay = ""; }, d + 1100);
        });
        batch = [];
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });

    const mark = (root: ParentNode) => {
      root.querySelectorAll<HTMLElement>(REVEAL).forEach((el) => {
        if (el.dataset.rv) return;
        el.dataset.rv = "1";
        el.classList.add("rv");
        io.observe(el);
      });
    };
    mark(document);
    const mo = new MutationObserver((muts) => { for (const m of muts) m.addedNodes.forEach((n) => { if (n instanceof HTMLElement) mark(n.parentElement ?? n); }); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); cancelAnimationFrame(flush); };
  }, []);

  useEffect(() => {
    if (reduced() || !window.matchMedia("(pointer: fine)").matches) return;
    document.documentElement.classList.add("has-cursor");
    const p = { x: -100, y: -100 }, r = { x: -100, y: -100 };
    let raf = 0;
    let mag: HTMLElement | null = null;
    const loop = () => {
      r.x += (p.x - r.x) * 0.18;
      r.y += (p.y - r.y) * 0.18;
      if (dot.current) dot.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      if (ring.current) ring.current.style.transform = `translate3d(${r.x}px, ${r.y}px, 0)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const move = (e: PointerEvent) => {
      p.x = e.clientX; p.y = e.clientY;
      const t = e.target as Element | null;
      const hot = !!t?.closest("a, button, [role=button], input, select, textarea, label, summary");
      ring.current?.classList.toggle("is-hot", hot);
      const m = t?.closest<HTMLElement>("[data-magnetic]") ?? null;
      if (mag && mag !== m) { mag.style.transform = ""; }
      mag = m;
      if (m) {
        const b = m.getBoundingClientRect();
        const dx = e.clientX - (b.left + b.width / 2), dy = e.clientY - (b.top + b.height / 2);
        m.style.transform = `translate(${dx * 0.22}px, ${dy * 0.3}px)`;
      }
    };
    const leave = () => { p.x = p.y = -100; if (mag) mag.style.transform = ""; mag = null; };
    const down = () => ring.current?.classList.add("is-down");
    const up = () => ring.current?.classList.remove("is-down");
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    return () => {
      cancelAnimationFrame(raf);
      document.documentElement.classList.remove("has-cursor");
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  return (
    <>
      <div ref={ring} className="st-cursor-ring" aria-hidden="true" />
      <div ref={dot} className="st-cursor-dot" aria-hidden="true" />
    </>
  );
}
