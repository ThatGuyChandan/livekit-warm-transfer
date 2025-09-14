'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  LiveKitRoom,
  VideoConference,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { RoomOptions } from 'livekit-client';

export default function RoomPage({ params }: { params: { room: string } }) {
  const searchParams = useSearchParams();
  const identity = searchParams.get('identity');
  const role = searchParams.get('role');
  const [token, setToken] = useState('');
  const [agentBNumber, setAgentBNumber] = useState('');

  useEffect(() => {
    if (identity && params.room) {
      fetch(`http://localhost:8000/token?room=${params.room}&identity=${identity}`, {
        method: 'POST',
      })
        .then((res) => res.json())
        .then((data) => setToken(data.token));
    }
  }, [identity, params.room]);

  const handleWarmTransfer = async () => {
    if (role === 'agentA') {
      const agentBIdentity = 'agentB'; // In a real app, you would select Agent B
      const res = await fetch(`http://localhost:8000/warm_transfer?agent_b_identity=${agentBIdentity}`, {
        method: 'POST',
      });
      const data = await res.json();
      const newRoomName = data.room_name;
      // Redirect Agent A to the new room
      window.location.href = `/room/${newRoomName}?identity=${identity}&role=agentA`;
    }
  };

  const handleDialAgentB = async () => {
    if (role === 'agentA' && agentBNumber) {
      await fetch(`http://localhost:8000/dial_agent_b?agent_b_number=${agentBNumber}&room_name=${params.room}`, {
        method: 'POST',
      });
    }
  };

  if (!token) {
    return <div>Loading...</div>;
  }

  const roomOptions: RoomOptions = {
    // Add any room options here
  };

  return (
    <LiveKitRoom
      token={token}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
      options={roomOptions}
      data-lk-theme="default"
      style={{ height: '100dvh' }}
    >
      <VideoConference />
      {role === 'agentA' && (
        <div className="absolute top-4 right-4 flex flex-col gap-2">
          <button onClick={handleWarmTransfer} className="px-4 py-2 bg-yellow-500 text-white rounded">
            Warm Transfer to Agent B
          </button>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Agent B Number"
              value={agentBNumber}
              onChange={(e) => setAgentBNumber(e.target.value)}
              className="px-4 py-2 border rounded"
            />
            <button onClick={handleDialAgentB} className="px-4 py-2 bg-blue-500 text-white rounded">
              Dial Agent B
            </button>
          </div>
        </div>
      )}
    </LiveKitRoom>
  );
}