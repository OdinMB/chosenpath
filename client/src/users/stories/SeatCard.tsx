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

/**
 * One printable seat card: the story, the group, the seat code, its join link
 * and a QR code of the link. It never breaks across printed pages.
 */
export function SeatCard({ card }: { card: SeatCardData }) {
  return (
    <article
      className="break-inside-avoid flex items-center gap-4 p-4 bg-white border border-primary-200 rounded-lg print:rounded-none print:border-dashed print:border-gray-400"
      aria-label={`Seat card, group ${card.groupNumber}, code ${card.code}`}
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
          Group {card.groupNumber}
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
