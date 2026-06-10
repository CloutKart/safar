import { formatVoteTally } from "@/lib/conversation/formatters";
import { getStore } from "@/lib/store";
import { sendWeb } from "@/lib/transport/web";

async function send(groupId: string, text: string) {
  const store = getStore();
  const occurredAt = new Date().toISOString();
  const messageId = await sendWeb(groupId, text, occurredAt);
  await store.logOutboundMessage({
    groupId,
    waMessageId: messageId,
    text,
    occurredAt,
  });
}

export async function runCoordinator(): Promise<{
  reminders: number;
  closed: number;
}> {
  const store = getStore();
  const snapshot = await store.getDashboardSnapshot();
  let reminders = 0;
  let closed = 0;

  for (const group of snapshot.groups.filter(
    (candidate) => candidate.status === "voting" && candidate.votingClosesAt,
  )) {
    const closesAt = new Date(group.votingClosesAt as string).getTime();
    const remaining = closesAt - Date.now();
    const result = await store.getVoteResult(group.id, group.votingRound);

    if (remaining > 0) {
      const reminderThreshold =
        group.reminderCount === 0
          ? 16 * 60 * 60 * 1000
          : 6 * 60 * 60 * 1000;
      if (
        group.reminderCount < 2 &&
        remaining <= reminderThreshold &&
        result.votesCast < result.activeParticipants
      ) {
        await send(
          group.id,
          `${formatVoteTally(result)}\n\nVoting closes in about ${Math.max(1, Math.ceil(remaining / 3_600_000))} hours.`,
        );
        await store.updateGroup(group.id, {
          reminderCount: group.reminderCount + 1,
        });
        reminders += 1;
      }
      continue;
    }

    const highest = Math.max(...result.tally.map((item) => item.count), 0);
    const topOptions = result.tally
      .filter((item) => item.count === highest)
      .map((item) => item.optionNumber);
    const plans = await store.getPlans(group.id);
    if (topOptions.length === 1 && highest > 0) {
      const winner = plans.find(
        (plan) => plan.optionNumber === topOptions[0],
      );
      await store.updateGroup(group.id, {
        status: "completed",
        runoffOptions: [],
      });
      await send(
        group.id,
        `Voting is closed. *Plan ${topOptions[0]} wins${winner ? `: ${winner.content.title}` : ""}.*`,
      );
      closed += 1;
      continue;
    }

    const runoffOptions =
      topOptions.length > 1
        ? topOptions
        : group.runoffOptions.length > 0
          ? group.runoffOptions
          : plans.map((plan) => plan.optionNumber);
    await store.updateGroup(group.id, {
      votingRound: group.votingRound + 1,
      runoffOptions,
      votingClosesAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      reminderCount: 0,
    });
    await send(
      group.id,
      `No single winner at the deadline. Runoff round ${group.votingRound + 1} is open between options ${runoffOptions.join(", ")} for 12 hours.`,
    );
  }

  return { reminders, closed };
}
