"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Input, Select, Textarea } from "@takemore/ui";
import { CUSTOMER_SOURCES, LEAD_SOURCE_LABELS, formatPhone, normalisePhone } from "@takemore/core";
import { byDivision, type CategoryOption } from "@/lib/catalogue";
import { createLead } from "./actions";

/**
 * "Add someone" — a form, unlike "New item".
 *
 * An item is created empty and photographed, because the first thing a worker
 * does with a machine is point a camera at it. A person is the opposite: the
 * first thing you get is a name and a number, spoken aloud, and you get them
 * once. An empty row created first would mean typing into a page that had
 * already forgotten why it existed.
 *
 * Inline rather than a route, because this happens while somebody is standing at
 * the counter waiting.
 */
export default function NewLeadButton({
  className,
  categories,
  children,
}: {
  className: string;
  categories: CategoryOption[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
    );
  }

  const normalised = normalisePhone(phone);

  return (
    <form
      action={createLead}
      className="bg-card border border-accent/30 rounded-2xl p-4 sm:p-5 w-full"
    >
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-sm font-medium tracking-tight">Who are they?</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-light text-muted hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name">
          <Input name="full_name" autoFocus placeholder="Sipho Ndlovu" />
        </Field>

        <Field
          label="Phone"
          hint={
            // Shows what will actually be stored, so a worker sees the number
            // being tidied rather than wondering whether it took.
            phone && normalised ? formatPhone(normalised) : phone ? "Not a full number" : undefined
          }
        >
          <Input
            name="phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="082 123 4567"
          />
        </Field>

        <Field label="Email">
          <Input name="email" type="email" placeholder="sipho@kitchen.co.za" />
        </Field>

        <Field label="Business">
          <Input name="business_name" placeholder="Spur, Claremont" />
        </Field>

        <Field label="How did they reach us?">
          <Select name="source" defaultValue="walk_in">
            {CUSTOMER_SOURCES.map((s) => (
              <option key={s} value={s}>
                {LEAD_SOURCE_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Kind of thing they want">
          {/* Grouped rather than cascaded: this card is a quick capture at a
              counter, and a second dropdown to reach the first one is a step
              too many. The headings do the same job of keeping the two lines
              of business apart. */}
          <Select name="category_id" defaultValue="">
            <option value="">Not sure yet</option>
            {byDivision(categories).map((group) => (
              <optgroup key={group.name} label={group.name}>
                {group.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-3">
        <Field label="What did they ask for?" hint="Their words, not yours">
          <Textarea
            name="wants"
            rows={2}
            placeholder="Six-burner with an oven under it, gas, under R30k. Opening in Woodstock in March."
          />
        </Field>
      </div>

      <p className="text-[11px] font-light text-muted mt-3 leading-relaxed">
        A name or a number is enough to start. Consent to message them is set on their
        page, once you have actually asked.
      </p>

      <Submit />
    </form>
  );
}

/** Separate so useFormStatus can see the form above it. */
function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-accent text-background
                 rounded-xl px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity
                 disabled:opacity-60 disabled:cursor-wait"
    >
      {pending ? "Saving…" : "Save and open"}
    </button>
  );
}
