// Updated LobbyScreen.tsx - Mobile-first responsive design

import React, { useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { authUserWithSignature } from '@/lib/auth';
import { toast } from 'react-toastify';

interface WaitingRoom {
  id: number;
  created_at: string;
  minimum_elo_rating: number;
  status: string;
  room_type: string;
  guest_team_id: number | null;
  host_team: {
    id: number;
    name: string;
    elo_rating: number;
    country: number;
  };
}

interface LobbyScreenProps {
  userTeamId: number;
  userTeamElo: number;
  onClose: () => void;
  onRoomSelected: (roomId: number) => void;
}

export default function LobbyScreen({
  userTeamId,
  userTeamElo,
  onClose,
  onRoomSelected
}: LobbyScreenProps) {
  const [rooms, setRooms] = useState<WaitingRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [minimumElo, setMinimumElo] = useState(0);
  const [roomType, setRoomType] = useState<'public' | 'private'>('public');
  const [updating, setUpdating] = useState(false);
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  // Fetch rooms
  const fetchRooms = async () => {
    try {
      const response = await fetch(`/api/waiting-rooms/list?team_id=${userTeamId}`);
      const data = await response.json();

      if (data.success) {
        setRooms(data.rooms);
      }
    } catch (error) {
      console.error('Error fetching rooms:', error);
      toast.error('Failed to load rooms');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 5000);
    return () => clearInterval(interval);
  }, [userTeamId]);

  const handleOpenCreateModal = () => {
    setMinimumElo(0);
    setRoomType('public');
    setShowCreateModal(true);
  };

  const handleCreateRoom = async () => {
    if (!address) {
      toast.error('Please connect your wallet');
      return;
    }

    setCreating(true);
    try {
      const { signature, message } = await authUserWithSignature(address, signMessageAsync);

      const response = await fetch('/api/waiting-rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: userTeamId,
          room_type: roomType,
          minimum_elo_rating: minimumElo * 100,
          wallet_address: address,
          signature,
          message
        })
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Room created!');
        setShowCreateModal(false);
        onRoomSelected(data.room.id);
      } else {
        toast.error(data.error || 'Failed to create room');
      }
    } catch (error) {
      console.error('Error creating room:', error);
      toast.error('Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenSettings = (roomId: number, currentMinElo: number, currentRoomType: string) => {
    setEditingRoomId(roomId);
    setMinimumElo(currentMinElo / 100);
    setRoomType(currentRoomType as 'public' | 'private');
    setShowSettingsModal(true);
  };

  const handleUpdateSettings = async () => {
    if (!address || !editingRoomId) return;

    setUpdating(true);
    try {
      const { signature, message } = await authUserWithSignature(address, signMessageAsync);

      const response = await fetch('/api/waiting-rooms/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: editingRoomId,
          room_type: roomType,
          minimum_elo_rating: minimumElo * 100,
          wallet_address: address,
          signature,
          message
        })
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Settings updated!');
        setShowSettingsModal(false);
        setEditingRoomId(null);
        setMinimumElo(0);
        setRoomType('public');
        fetchRooms();
      } else {
        toast.error(data.error || 'Failed to update settings');
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      toast.error('Failed to update settings');
    } finally {
      setUpdating(false);
    }
  };

  const handleJoinRoom = (roomId: number) => {
    onRoomSelected(roomId);
  };

  const formatElo = (elo: number) => (elo / 100).toFixed(2);

  return (
    <>
      {/* Main Lobby Modal */}
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-2 sm:p-4">
        <div className="bg-gradient-to-b from-blue-900 to-purple-900 rounded-xl w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-4 sm:p-6 border-b border-white/20">
            <div className="flex justify-between items-center gap-3">
              <div className="flex-1 min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-white mb-1 truncate">Game Lobby</h1>
                <p className="text-blue-200 text-xs sm:text-sm truncate">Find an opponent or create your own room</p>
              </div>
              <button
                onClick={onClose}
                className="text-white hover:text-blue-200 transition-colors p-2 rounded-lg hover:bg-white/10 flex-shrink-0"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-6">
            {/* Create Room Button */}
            <button
              onClick={handleOpenCreateModal}
              className="mb-4 sm:mb-6 w-full bg-green-600 text-white px-4 sm:px-6 py-3 sm:py-4 rounded-lg hover:bg-green-700 transition-colors font-semibold text-base sm:text-lg flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create New Room
            </button>

            {/* Rooms List */}
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-4 border-white mx-auto mb-4"></div>
                <p className="text-white text-sm sm:text-base">Loading rooms...</p>
              </div>
            ) : rooms.length === 0 ? (
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-8 sm:p-12 text-center">
                <svg className="w-12 h-12 sm:w-16 sm:h-16 text-white/50 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p className="text-white text-base sm:text-lg mb-2">No rooms available</p>
                <p className="text-blue-200 text-sm sm:text-base">Be the first to create a room!</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:gap-4">
                {rooms.map((room) => {
                  const canJoin = !room.guest_team_id &&
                    room.host_team.id !== userTeamId &&
                    userTeamElo >= room.minimum_elo_rating;
                  const isFull = !!room.guest_team_id;
                  const isMyRoom = room.host_team.id === userTeamId;
                  const isPrivate = room.room_type === 'private';

                  return (
                    <div
                      key={room.id}
                      className={`bg-white/10 backdrop-blur-sm rounded-lg p-4 sm:p-6 border-2 transition-all ${isFull
                          ? 'border-yellow-500/30'
                          : isPrivate
                            ? 'border-purple-500/50'
                            : 'border-white/20 hover:border-white/40'
                        }`}
                    >
                      {/* Room Header */}
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm sm:text-lg flex-shrink-0">
                          {room.host_team.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg sm:text-xl font-bold text-white truncate">{room.host_team.name}</h3>
                          <p className="text-blue-200 text-xs sm:text-sm">
                            ELO {formatElo(room.host_team.elo_rating)}
                          </p>
                        </div>
                      </div>

                      {/* Room Badges */}
                      <div className="flex flex-wrap gap-2 mb-3">
                        {isPrivate && (
                          <span className="px-2 sm:px-3 py-1 bg-purple-500/20 text-purple-200 rounded-full text-xs font-semibold flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            PRIVATE
                          </span>
                        )}
                        {isFull && (
                          <span className="px-2 sm:px-3 py-1 bg-yellow-500/20 text-yellow-200 rounded-full text-xs font-semibold">
                            WAITING FOR START
                          </span>
                        )}
                      </div>

                      {/* Room Info */}
                      <div className="flex flex-wrap gap-3 sm:gap-4 text-xs sm:text-sm text-blue-200 mb-4">
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {new Date(room.created_at).toLocaleTimeString()}
                        </span>
                        {room.minimum_elo_rating > 0 && (
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Min ELO: {formatElo(room.minimum_elo_rating)}
                          </span>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-col sm:flex-row gap-2">
                        {isMyRoom && !isFull && (
                          <button
                            onClick={() => handleOpenSettings(room.id, room.minimum_elo_rating, room.room_type)}
                            className="px-3 sm:px-4 py-2 sm:py-3 rounded-lg font-semibold text-sm sm:text-base transition-colors bg-purple-600 text-white hover:bg-purple-700 flex items-center justify-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Settings
                          </button>
                        )}
                        <button
                          onClick={() => handleJoinRoom(room.id)}
                          disabled={!canJoin && !isMyRoom}
                          className={`flex-1 px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-semibold text-sm sm:text-base transition-colors ${isMyRoom
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : canJoin
                                ? 'bg-green-600 text-white hover:bg-green-700'
                                : 'bg-gray-600 text-gray-300 cursor-not-allowed'
                            }`}
                        >
                          {isMyRoom ? 'View Room' : canJoin ? 'Join' : isFull ? 'Full' : 'Cannot Join'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-3 sm:p-4">
          <div className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">Create Room</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Room Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setRoomType('public')}
                  className={`px-3 py-3 sm:py-4 rounded-lg border-2 transition-all ${roomType === 'public'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="font-semibold text-sm sm:text-base">Public</p>
                      <p className="text-xs mt-0.5">Visible to all</p>
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => setRoomType('private')}
                  className={`px-3 py-3 sm:py-4 rounded-lg border-2 transition-all ${roomType === 'private'
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <div>
                      <p className="font-semibold text-sm sm:text-base">Private</p>
                      <p className="text-xs mt-0.5">Only for you</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum ELO Rating (Optional)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={minimumElo}
                onChange={(e) => setMinimumElo(parseFloat(e.target.value) || 0)}
                className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
                placeholder="0.00"
              />
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                {minimumElo > 0
                  ? `Only teams with ELO ≥ ${minimumElo.toFixed(2)} can join`
                  : 'No ELO restriction - anyone can join'}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors text-sm sm:text-base"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRoom}
                disabled={creating}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-3 sm:p-4">
          <div className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">Room Settings</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Room Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setRoomType('public')}
                  className={`px-3 py-3 sm:py-4 rounded-lg border-2 transition-all ${roomType === 'public'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="font-semibold text-sm sm:text-base">Public</p>
                      <p className="text-xs mt-0.5">Visible to all</p>
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => setRoomType('private')}
                  className={`px-3 py-3 sm:py-4 rounded-lg border-2 transition-all ${roomType === 'private'
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <div>
                      <p className="font-semibold text-sm sm:text-base">Private</p>
                      <p className="text-xs mt-0.5">Only for you</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum ELO Rating
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={minimumElo}
                onChange={(e) => setMinimumElo(parseFloat(e.target.value) || 0)}
                className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
                placeholder="0.00"
              />
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                {minimumElo > 0
                  ? `Only teams with ELO ≥ ${minimumElo.toFixed(2)} can join`
                  : 'No ELO restriction - anyone can join'}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  setEditingRoomId(null);
                  setMinimumElo(0);
                  setRoomType('public');
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors text-sm sm:text-base"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateSettings}
                disabled={updating}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
              >
                {updating ? 'Updating...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}