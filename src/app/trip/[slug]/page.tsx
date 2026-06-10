import { notFound } from "next/navigation";
import { TripRoom } from "@/components/trip-room";
import { loadRoomState } from "@/lib/trip/room";

export const dynamic = "force-dynamic";

export default async function TripPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const state = await loadRoomState(slug);
  if (!state) notFound();
  return <TripRoom slug={slug} initialState={state} />;
}
