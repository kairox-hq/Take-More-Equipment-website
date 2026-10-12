import Link from "next/link";
import Subheading from "./Subheading";
import { published, testimonials as testimonialFacts } from "@/data/launch";

/**
 * What customers say — once a customer has actually said it.
 *
 * The mockup carried nine invented quotes with real-sounding names and Cape
 * Town suburbs attached. Those are still in launch.ts, unverified, and nothing
 * here renders until somebody sets a date against one. Attributing words to a
 * named person who never said them is an advertising standards and consumer
 * protection problem, not a content nit, so the default is silence.
 *
 * The avatars used to be generated stock faces standing in for customers, which
 * is the same lie in picture form. Initials instead: no external request, no
 * invented face, and it reads as a deliberate choice rather than a missing
 * image.
 */

/**
 * Below this many quotes the masonry looks broken rather than sparse — one card
 * in a three-column layout reads as a rendering failure — so the section shows
 * the proof panel instead. Three is the point where it looks intentional.
 */
const ENOUGH_FOR_A_WALL = 3;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

export default function Testimonials() {
  const reviews = published(testimonialFacts);

  if (reviews.length < ENOUGH_FOR_A_WALL) return <Proof />;

  return (
    <section className="py-14 md:py-24 px-6 md:px-12 w-full max-w-[1440px] mx-auto relative overflow-hidden">
      <div className="flex flex-col items-center text-center mb-10 md:mb-16 relative z-10">
        <Subheading text="Testimonials" />
        <h2 className="text-2xl sm:text-3xl lg:text-5xl font-medium tracking-tight">
          Kitchens Running On
          <br />
          Take More Kit
        </h2>
      </div>

      {/* The fade only makes sense over a wall tall enough to be cut off. With a
          handful of quotes the fixed height would strand them in a box of empty
          space, so the overflow treatment is applied only once there are enough
          to overflow. */}
      <div
        className={
          reviews.length > 6
            ? "relative h-[440px] sm:h-[520px] md:h-[600px] overflow-hidden"
            : "relative"
        }
      >
        {reviews.length > 6 && (
          <>
            <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none"></div>
            <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-background to-transparent z-10 pointer-events-none"></div>
          </>
        )}

        <div
          className={`columns-1 md:columns-2 lg:columns-3 gap-4 md:gap-6 space-y-4 md:space-y-6 ${
            reviews.length > 6 ? "pb-32" : ""
          }`}
        >
          {reviews.map((review) => (
            <div
              key={`${review.name}-${review.loc}`}
              className="bg-card rounded-[2rem] p-6 sm:p-8 border border-border break-inside-avoid shadow-lg"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-border flex items-center justify-center mb-5 sm:mb-6">
                  <span
                    aria-hidden="true"
                    className="text-sm font-medium tracking-wider text-white/70"
                  >
                    {initials(review.name)}
                  </span>
                </div>
                <p className="text-xs sm:text-sm font-light text-white/80 leading-relaxed mb-5 sm:mb-6">
                  &quot;{review.text}&quot;
                </p>
                <div className="w-8 h-[1px] bg-border mb-6"></div>
                <h4 className="font-medium text-sm tracking-tight">{review.name}</h4>
                <span className="text-xs text-muted font-light mt-1">{review.loc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * What stands in for testimonials until there are testimonials.
 *
 * Every line here is checkable by the reader on this same website, which is the
 * point: it is stronger than an anonymous five-star quote anyway, and it cannot
 * become false. Nothing in it needs verifying because nothing in it is a claim
 * about a customer — it is a description of how the site itself works.
 */
function Proof() {
  const points = [
    {
      icon: "solar:gallery-wide-linear",
      title: "Photos of the actual item",
      copy: "The photos show the item you’re buying, including any visible signs of use.",
      href: "/#catalogue",
      link: "See the stock",
    },
    {
      icon: "solar:map-point-linear",
      title: "See it in person",
      copy: "View the equipment at our warehouse and choose what suits your needs. Collect your purchase or arrange delivery.",
      href: "/about#visit",
      link: "Plan your visit",
    },
    {
      icon: "solar:list-check-linear",
      title: "Clear condition descriptions",
      copy: "Each item is listed as New, Like New, Used or Fair, so you know what to expect before you visit. Read the product description for more details about its condition.",
      href: "/conditions",
      link: "Our condition guide",
    },
  ];

  return (
    <section className="py-14 md:py-24 px-6 md:px-12 w-full max-w-[1440px] mx-auto">
      <div className="flex flex-col items-center text-center mb-10 md:mb-16">
        <h2 className="text-2xl sm:text-3xl lg:text-5xl font-medium tracking-tight">
          Buy with confidence
        </h2>
        <p className="text-muted font-light text-sm md:text-base leading-relaxed mt-5 max-w-xl">
          Browse photos, read product descriptions and check each item’s condition online.
          Visit our warehouse to see the equipment in person and ask our team any questions before you buy.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {points.map((point) => (
          <div
            key={point.title}
            className="bg-card rounded-[2rem] p-6 sm:p-8 md:p-10 border border-border flex flex-col"
          >
            <div className="w-14 h-14 rounded-2xl bg-background border border-border flex items-center justify-center text-accent mb-8">
              <iconify-icon icon={point.icon} width="24" height="24"></iconify-icon>
            </div>
            <h3 className="text-xl font-medium tracking-tight mb-4">{point.title}</h3>
            <p className="text-muted font-light text-sm leading-relaxed mb-8">{point.copy}</p>
            <Link
              href={point.href}
              className="mt-auto inline-flex items-center gap-3 text-sm font-light hover:text-accent transition-colors"
            >
              <span>{point.link}</span>
              <iconify-icon icon="solar:arrow-right-linear" width="14" height="14"></iconify-icon>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
