import { getStore } from "@/lib/store";
import { hasSupabase } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const snapshot = await getStore().getDashboardSnapshot();
  return (
    <main className="dashboard shell">
      <div className="dashboard-head">
        <div>
          <p className="eyebrow">Safar operations</p>
          <h1>Conversation control room</h1>
        </div>
        <span className="mode-pill">{hasSupabase ? "SUPABASE" : "MEMORY"}</span>
      </div>
      <section className="metric-grid">
        <div className="metric"><strong>{snapshot.groups.length}</strong><span>groups</span></div>
        <div className="metric"><strong>{snapshot.participants}</strong><span>participants observed</span></div>
        <div className="metric"><strong>{snapshot.pendingEvents}</strong><span>events awaiting retry</span></div>
        <div className="metric"><strong>{snapshot.plans}</strong><span>plans generated</span></div>
      </section>
      <table className="group-table">
        <thead>
          <tr>
            <th>Group</th>
            <th>Status</th>
            <th>Round</th>
            <th>Vote closes</th>
            <th>Room</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.groups.map((group) => (
            <tr key={group.id}>
              <td><strong>{group.subject}</strong><br /><small>{group.waGroupId}</small></td>
              <td><span className="status">{group.status}</span></td>
              <td>{group.votingRound}</td>
              <td>{group.votingClosesAt ? new Date(group.votingClosesAt).toLocaleString("en-IN") : "—"}</td>
              <td><a href={`/trip/${group.waGroupId}`}>open</a></td>
            </tr>
          ))}
          {snapshot.groups.length === 0 && (
            <tr><td className="empty" colSpan={5}>No rooms yet. Create one from the public page.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
