import RoomInvitePage from '@/app/components/RoomInvitePage';

export default function RoomPage({ params }: { params: { id: string } }) {
  return <RoomInvitePage roomId={params.id} />;
}