import PrintButton from "@/app/(print)/items/[id]/label/PrintButton";

/** One page per identity works on an A4 sheet or a custom label paper size. */
export default function UnitLabels({ labels, backHref, backLabel }: {
  labels: { code: string; title: string; descriptor?: string }[];
  backHref: string;
  backLabel: string;
}) {
  return <>
    <style>{`
      @page { margin: 8mm; }
      @media print {
        .no-print { display: none !important; }
        .unit-label { break-after: page; page-break-after: always; padding: 0; }
        .unit-label:last-child { break-after: auto; page-break-after: auto; }
      }
    `}</style>
    <div className="no-print flex items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
      <a href={backHref} className="text-xs text-black/50 hover:text-black">← {backLabel}</a>
      <PrintButton />
    </div>
    {labels.length === 0 ? <p className="p-6 text-sm">No unit labels to print.</p> : labels.map(label =>
      <article key={label.code} className="unit-label flex flex-col items-center justify-center text-center px-6 py-10 border-b border-black/10 print:border-0">
        <p className="font-mono tabular-nums leading-none text-5xl sm:text-7xl font-medium break-all">{label.code}</p>
        <p className="mt-4 text-lg font-medium max-w-md leading-snug">{label.title}</p>
        {label.descriptor && <p className="mt-1 text-sm text-black/60">{label.descriptor}</p>}
      </article>)}
  </>;
}
