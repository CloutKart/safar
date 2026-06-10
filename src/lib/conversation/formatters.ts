import type { GeneratedPlan } from "@/lib/domain";
import type { VoteResult } from "@/lib/store/types";

const inr = (value: number) => `₹${value.toLocaleString("en-IN")}`;

function formatDay(day: GeneratedPlan["itinerary"][number]): string {
  const stops = day.stops
    .map((stop) => {
      const gem = stop.kind === "hidden-gem" ? "💎 " : "";
      const cost = stop.approxInr != null ? ` (~${inr(stop.approxInr)})` : "";
      const note = stop.note ? ` — ${stop.note}` : "";
      return `   • ${gem}${stop.name}${note}${cost}`;
    })
    .join("\n");
  const stay = day.stay
    ? `\n   🛏 Stay: ${day.stay.name}${day.stay.area ? `, ${day.stay.area}` : ""}${day.stay.approxInrPerNight != null ? ` (~${inr(day.stay.approxInrPerNight)}/night)` : ""}`
    : "";
  return `*Day ${day.day}: ${day.title}*\n${stops}${stay}`;
}

function formatCost(cost: GeneratedPlan["cost"]): string {
  const range = `Estimated per person: ${inr(cost.lowInr)}–${inr(cost.highInr)} (likely ${inr(cost.likelyInr)})`;
  const breakdown = cost.breakdown
    ? `\nWhere it goes: transport ${inr(cost.breakdown.transportInr)} · stay ${inr(cost.breakdown.stayInr)} · activities ${inr(cost.breakdown.activitiesInr)} · food ${inr(cost.breakdown.foodInr)}`
    : "";
  const note = cost.live
    ? "\nLive supplier prices checked."
    : "\nTransparent estimate; live inventory was unavailable.";
  return `${range}${breakdown}${note}`;
}

export function formatPlans(plans: GeneratedPlan[]): string {
  return plans
    .map(
      (plan) => `*${plan.optionNumber}. ${plan.title}*
${plan.destinationName} · ${plan.angle}
${plan.summary}

Matches: ${plan.preferenceCoverage.join(", ")}
Trade-offs: ${plan.tradeoffs.join("; ")}
${formatCost(plan.cost)}

${plan.itinerary.map(formatDay).join("\n\n")}

Sources: ${plan.sources.map((source) => source.url).join(" ")}`,
    )
    .join("\n\n——————————\n\n")
    .concat(
      "\n\nReply *vote 1*, *vote 2*, or *vote 3*. You can change your vote until voting closes.",
    );
}

export function formatVoteTally(result: VoteResult): string {
  const lines = result.tally.map(
    (item) => `${item.optionNumber}: ${"■".repeat(item.count)}${"□".repeat(Math.max(0, result.activeParticipants - item.count))} ${item.count}`,
  );
  return `*Live vote tally* (${result.votesCast}/${result.activeParticipants} voted)\n${lines.join("\n")}`;
}
