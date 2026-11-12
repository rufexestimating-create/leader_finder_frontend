"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Highlight, Menu, rank, useMenu } from "./Dropdown";

/**
 * Free text tags: type and press Enter (or a comma) to add one, × or Backspace to remove. Suggestions are one click
 * away; `options` adds a dropdown of known values while typing; `labelOf` shows a friendlier name for a value.
 */
export function ChipInput({
  id,
  label,
  values,
  onChange,
  placeholder,
  suggestions = [],
  options,
  labelOf = (v) => v,
  hint,
}: {
  id: string;
  label: React.ReactNode;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  options?: string[];
  labelOf?: (v: string) => string;
  hint?: React.ReactNode;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false); // Enter picks the highlighted row
  const [active, setActive] = useState(0);
  const reveal = useRef(false); // scroll the highlighted row into view: only after keys, never for the mouse
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const close = useCallback(() => {
    setOpen(false);
    setArmed(false);
  }, []);
  const { pos, place } = useMenu(boxRef, menuRef, open, close);

  const has = (v: string) => values.some((x) => x.toLowerCase() === v.toLowerCase());
  const add = (raw: string) => {
    const typed = raw.replace(/,+$/, "").trim();
    // Typing "texas" picks "Texas" from the known list
    const v = options?.find((o) => o.toLowerCase() === typed.toLowerCase()) ?? typed;
    if (v && !has(v)) onChange([...values, v]);
    setText("");
    setActive(0);
    setArmed(false);
  };
  const unused = suggestions.filter((s) => !has(s));

  const q = text.trim().toLowerCase();
  const left = (options ?? []).filter((o) => !has(o));
  const shown = (q ? rank(left, q, labelOf) : left).slice(0, 60);
  const showMenu = open && !!pos && shown.length > 0;

  useEffect(() => {
    if (!showMenu || !reveal.current) return;
    reveal.current = false;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [showMenu, active, listId]);

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="lf-chips-box" ref={boxRef}>
        {values.map((v) => (
          <span key={v} className="lf-chip">
            {labelOf(v)}
            <button type="button" aria-label={`Remove ${labelOf(v)}`} onClick={() => onChange(values.filter((x) => x !== v))}>
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={id}
          className="lf-chips-input"
          value={text}
          autoComplete="off"
          role={options ? "combobox" : undefined}
          aria-expanded={options ? showMenu : undefined}
          aria-controls={options ? listId : undefined}
          aria-activedescendant={showMenu ? `${listId}-${active}` : undefined}
          placeholder={values.length ? "Add more…" : placeholder}
          onFocus={() => {
            if (!options) return;
            place();
            setOpen(true);
          }}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",")) return add(v);
            setText(v);
            reveal.current = true;
            setActive(0);
            setArmed(true);
            if (options && !open) {
              place();
              setOpen(true);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && showMenu) {
              e.preventDefault();
              setArmed(true);
              reveal.current = true;
              setActive((i) => Math.min(i + 1, shown.length - 1));
            } else if (e.key === "ArrowUp" && showMenu) {
              e.preventDefault();
              setArmed(true);
              reveal.current = true;
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Escape" && open) {
              e.preventDefault();
              close();
            } else if (e.key === "Enter") {
              e.preventDefault();
              add(showMenu && armed && shown[active] ? shown[active] : text);
            } else if (e.key === "Backspace" && !text && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => {
            close();
            add(text);
          }}
        />
      </div>
      {showMenu && pos && (
        <Menu id={listId} menuRef={menuRef} pos={pos}>
          {shown.map((o, i) => (
            <li
              key={o}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={false}
              className={`lf-opt${i === active ? " is-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => setActive(i)}
              onClick={() => add(o)}
            >
              <span className="lf-opt-text">
                <strong><Highlight text={o} q={q} /></strong>
                {labelOf(o) !== o && <span><Highlight text={labelOf(o)} q={q} /></span>}
              </span>
            </li>
          ))}
        </Menu>
      )}
      {unused.length > 0 && (
        <div className="lf-suggest" aria-label="Suggestions">
          {unused.map((s) => (
            <button type="button" key={s} className="lf-suggest-btn" onClick={() => onChange([...values, s])}>
              + {labelOf(s)}
            </button>
          ))}
        </div>
      )}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

/** Pick any number from a fixed list; each option is a button that stays pressed */
export function ToggleChips({
  label,
  options,
  values,
  onChange,
  labelOf = (v) => v,
  hint,
}: {
  label: React.ReactNode;
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
  labelOf?: (v: string) => string;
  hint?: React.ReactNode;
}) {
  return (
    <fieldset className="field lf-fieldset">
      <legend className="field-label">{label}</legend>
      <div className="lf-toggles">
        {options.map((o) => {
          const on = values.includes(o);
          return (
            <button
              type="button"
              key={o}
              className={`lf-toggle${on ? " on" : ""}`}
              aria-pressed={on}
              onClick={() => onChange(on ? values.filter((v) => v !== o) : [...values, o])}
            >
              {on && <Check size={12} aria-hidden="true" />}
              {labelOf(o)}
            </button>
          );
        })}
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </fieldset>
  );
}

/** Pick one, or none, from a short list (shown as a segmented control) */
export function PickOne<T extends string>({
  label,
  options,
  value,
  onChange,
  id,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  id: string;
}) {
  return (
    <div className="field">
      <span className="field-label" id={id}>{label}</span>
      <div className="segmented lf-segmented" role="group" aria-labelledby={id}>
        {options.map((o) => (
          <button key={o.value} type="button" className={value === o.value ? "active" : ""} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
