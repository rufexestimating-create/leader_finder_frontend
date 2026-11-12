"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type Option = { value: string; label: string };

type Pos = { left: number; width: number; maxHeight: number; top?: number; bottom?: number };

const GAP = 6;
const MAX_HEIGHT = 300;

/**
 * Where a menu sits: under its anchor, or above when there is no room below. It is drawn on <body>, so a card with
 * overflow hidden can't cut it off, and it follows the anchor while the page scrolls.
 */
export function useMenu(anchorRef: React.RefObject<HTMLElement | null>, menuRef: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  const [pos, setPos] = useState<Pos | null>(null);

  const place = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - GAP - 12;
    const above = r.top - GAP - 12;
    const up = below < 200 && above > below;
    const maxHeight = Math.max(140, Math.min(MAX_HEIGHT, up ? above : below));
    setPos(up ? { left: r.left, width: r.width, maxHeight, bottom: window.innerHeight - r.top + GAP } : { left: r.left, width: r.width, maxHeight, top: r.bottom + GAP });
  }, [anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => place();
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      place();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, place, close, anchorRef, menuRef]);

  return { pos, place };
}

export function Menu({ id, menuRef, pos, label, children }: { id: string; menuRef: React.RefObject<HTMLUListElement | null>; pos: Pos; label?: string; children: React.ReactNode }) {
  return createPortal(
    <ul
      ref={menuRef}
      id={id}
      role="listbox"
      aria-label={label}
      className={`lf-menu${pos.bottom !== undefined ? " is-up" : ""}`}
      style={{ left: pos.left, width: pos.width, maxHeight: pos.maxHeight, top: pos.top, bottom: pos.bottom }}
    >
      {children}
    </ul>,
    document.body,
  );
}

/** Bolds the part of a row that matches what was typed */
export function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

/** Rows that start with the text first, then rows that only contain it */
export function rank(options: string[], q: string, labelOf: (v: string) => string = (v) => v) {
  const starts = (o: string) => o.toLowerCase().startsWith(q) || labelOf(o).toLowerCase().startsWith(q);
  const has = (o: string) => o.toLowerCase().includes(q) || labelOf(o).toLowerCase().includes(q);
  return [...options.filter(starts), ...options.filter((o) => !starts(o) && has(o))];
}

/** A text box with a list of known values to pick from. Anything else can still be typed. */
export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder,
  invalid,
  required,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  invalid?: boolean;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false); // the list is filtered by what was typed
  const [armed, setArmed] = useState(false); // Enter picks the highlighted row
  const [active, setActive] = useState(0);
  const reveal = useRef(false); // scroll the highlighted row into view: only after keys or on opening, never for the mouse
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const close = useCallback(() => {
    setOpen(false);
    setTyped(false);
    setArmed(false);
  }, []);
  const { pos, place } = useMenu(anchorRef, menuRef, open, close);

  const q = value.trim().toLowerCase();
  const shown = typed && q ? rank(options, q) : options;

  const show = () => {
    if (open) return;
    place();
    reveal.current = true;
    setActive(Math.max(0, options.indexOf(value)));
    setOpen(true);
  };
  const choose = (o: string) => {
    onChange(o);
    close();
  };

  useEffect(() => {
    if (!open || !reveal.current) return;
    reveal.current = false;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  return (
    <div ref={anchorRef} className="lf-combo">
      <input
        id={id}
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onFocus={show}
        onClick={show}
        onChange={(e) => {
          onChange(e.target.value);
          setTyped(true);
          setArmed(true);
          reveal.current = true;
          setActive(0);
          if (!open) {
            place();
            setOpen(true);
          }
        }}
        onBlur={close}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) show();
            else {
              setArmed(true);
              reveal.current = true;
              setActive((i) => Math.min(i + 1, shown.length - 1));
            }
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (open) {
              setArmed(true);
              reveal.current = true;
              setActive((i) => Math.max(i - 1, 0));
            }
          } else if (e.key === "Enter") {
            if (open && armed && shown[active]) {
              e.preventDefault();
              choose(shown[active]);
            }
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            close();
          }
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className={`lf-combo-chev${open ? " is-open" : ""}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (open) return close();
          anchorRef.current?.querySelector("input")?.focus();
          show();
        }}
      >
        <ChevronDown size={16} />
      </button>
      {open && pos && (
        <Menu id={listId} menuRef={menuRef} pos={pos}>
          {shown.length === 0 ? (
            <li className="lf-menu-empty" role="presentation">No match. We&apos;ll use what you typed.</li>
          ) : (
            shown.map((o, i) => (
              <li
                key={o}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o === value}
                className={`lf-opt${i === active ? " is-active" : ""}${o === value ? " is-selected" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(o)}
              >
                <span><Highlight text={o} q={typed ? q : ""} /></span>
                {o === value && <Check size={15} aria-hidden="true" />}
              </li>
            ))
          )}
        </Menu>
      )}
    </div>
  );
}

/** A dropdown that only offers its own choices (replaces the browser's plain select) */
export function Select({
  id,
  value,
  onChange,
  options,
  ariaLabel,
  placeholder = "Select…",
  className = "",
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const reveal = useRef(false); // scroll the highlighted row into view: only after keys or on opening, never for the mouse
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const search = useRef({ text: "", at: 0 });
  const spaceHandled = useRef(false);
  const listId = useId();
  const close = useCallback(() => setOpen(false), []);
  const { pos, place } = useMenu(anchorRef, menuRef, open, close);
  const current = options.find((o) => o.value === value);

  const show = () => {
    place();
    reveal.current = true;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const choose = (o: Option) => {
    onChange(o.value);
    close();
  };

  useEffect(() => {
    if (!open || !reveal.current) return;
    reveal.current = false;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key !== "Tab") reveal.current = true;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (e.key === " ") spaceHandled.current = true;
      if (options[active]) choose(options[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      // Typing a letter jumps to the first choice that starts with it
      const now = Date.now();
      search.current.text = (now - search.current.at > 900 ? "" : search.current.text) + e.key.toLowerCase();
      search.current.at = now;
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(search.current.text));
      if (hit >= 0) setActive(hit);
    }
  };

  return (
    <>
      <button
        ref={anchorRef}
        id={id}
        type="button"
        className={`input lf-select ${className}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => {
          if (e.key === " " && spaceHandled.current) {
            e.preventDefault();
            spaceHandled.current = false;
          }
        }}
        onBlur={close}
      >
        <span className={current ? undefined : "is-placeholder"}>{current?.label ?? placeholder}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && pos && (
        <Menu id={listId} menuRef={menuRef} pos={pos} label={ariaLabel}>
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={`lf-opt${i === active ? " is-active" : ""}${o.value === value ? " is-selected" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => setActive(i)}
              onClick={() => choose(o)}
            >
              <span>{o.label}</span>
              {o.value === value && <Check size={15} aria-hidden="true" />}
            </li>
          ))}
        </Menu>
      )}
    </>
  );
}
