/** Contract status → the one state colour, word and icon that represent it. */
export type DealState = "created" | "funded" | "released" | "refunded" | "disputed";

export function dealState(status: string | null | undefined): DealState {
  switch (status) {
    case "Funded":
      return "funded";
    case "Delivered":
    case "Released":
      return "released";
    case "Expired":
    case "Refunded":
      return "refunded";
    case "Disputed":
      return "disputed";
    default:
      return "created";
  }
}

export const STATUS_WORD: Record<string, string> = {
  Created: "Created",
  Funded: "Locked",
  Delivered: "Delivered",
  Released: "Released",
  Expired: "Expired",
  Refunded: "Refunded",
  Disputed: "Manual review",
};
