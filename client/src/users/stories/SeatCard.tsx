import type { ComponentType, SVGAttributes } from "react";
import { QRCodeSVG as QRCodeSVGTypedForReact19 } from "qrcode.react";
import type { SeatCardData } from "./seatCards";

// qrcode.react sits at the workspace root, where its types resolve the root's
// React 19 types, whose components the client's React 18 JSX types reject.
// Only the type is restated here; the component is the library's.
const QRCodeSVG = QRCodeSVGTypedForReact19 as unknown as ComponentType<
  {
    value: string;
    size?: number;
    level?: "L" | "M" | "Q" | "H";
    marginSize?: number;
    title?: string;
  } & SVGAttributes<SVGSVGElement>
>;

/** "Seat 2 of 3", or nothing for a story with one seat. */
function seatLabel(card: SeatCardData): string | null {
  return card.seatCount > 1 ? `Seat ${card.seatNumber} of ${card.seatCount}` : null;
}

/**
 * One printable seat card: the story's number and title, the seat (when the
 * story has more than one), the seat code, its join link and a QR code of the
 * link. It never breaks across printed pages.
 */
export function SeatCard({ card }: { card: SeatCardData }) {
  const seat = seatLabel(card);
  return (
    <article
      className="break-inside-avoid flex items-center gap-4 p-4 bg-white border border-primary-200 rounded-lg print:rounded-none print:border-dashed print:border-gray-400"
      aria-label={[
        "Seat card",
        `story ${card.storyNumber}`,
        seat?.toLowerCase(),
        `code ${card.code}`,
      ]
        .filter(Boolean)
        .join(", ")}
    >
      <QRCodeSVG
        value={card.joinLink}
        size={112}
        level="M"
        marginSize={0}
        title={`QR code for ${card.joinLink}`}
        className="flex-shrink-0"
      />
      <div className="min-w-0 space-y-1 font-lora">
        <p className="text-xs uppercase tracking-wide text-primary-600">
          Story {card.storyNumber}
          {seat && ` · ${seat}`}
        </p>
        <h3 className="text-sm font-medium text-primary-800 truncate">
          {card.storyTitle}
        </h3>
        <p className="font-mono text-2xl font-semibold tracking-widest text-primary-900">
          {card.code}
        </p>
        <p className="text-xs text-primary-700 break-all">{card.joinLink}</p>
        <p className="text-xs text-primary-600">
          Scan the code, or type it on the home page. No account needed.
        </p>
      </div>
    </article>
  );
}
