// app/room/[id]/page.tsx
import RoomInvitePage from '@/app/components/RoomInvitePage';

export default async function RoomPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  // Await params in Next.js 15+
  const { id } = await params;

  return <RoomInvitePage roomId={id} />;
}