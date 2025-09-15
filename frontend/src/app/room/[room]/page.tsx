'use client';

import {
  LiveKitRoom,
  VideoConference,
  useRoomContext,
  useDataChannel,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

// This component handles the data channel messages for moving rooms.
function DataChannelHandler({ setRoomName, setToken }: { setRoomName: (room: string) => void, setToken: (token: string) => void }) {
  const roomContext = useRoomContext();
  useDataChannel("move_room", (msg) => {
    const { room: newRoomName, token: newToken } = JSON.parse(new TextDecoder().decode(msg.payload));
    // Disconnect from the current room before updating the state
    roomContext.disconnect().then(() => {
      setRoomName(newRoomName);
      setToken(newToken);
    });
  });
  return null; // This component doesn't render anything
}

// This is the main component for the room page.
// It handles the logic for both the caller and the agents.
function RoomFlow({ params }: { params: { room: string } }) {
  const searchParams = useSearchParams();
  const identity = searchParams.get('identity');
  const role = searchParams.get('role');
  const fromRoom = searchParams.get('from_room');

  const room = useRoomContext();
  const [transferCompleted, setTransferCompleted] = useState(false);

  const handleInitiateTransfer = async () => {
    if (role === 'agentA') {
      try {
        const res = await fetch(
          `http://localhost:8000/initiate_transfer?current_room=${params.room}`,
          {
            method: 'POST',
          }
        );
        if (res.ok) {
          const data = await res.json();
          const newRoomName = data.new_room_name;
          await room.disconnect();
          // Pass the original room name to the new room
          window.location.href = `/room/${newRoomName}?identity=${identity}&role=agentA&from_room=${params.room}`;
        } else {
          // Handle error silently or with a user-friendly message
        }
      } catch (error) {
        // Handle error silently or with a user-friendly message
      }
    }
  };

  const handleCompleteTransfer = async () => {
    if (role === 'agentA' && fromRoom) {
      try {
        const res = await fetch(
          `http://localhost:8000/complete_transfer?from_room=${fromRoom}&to_room=${params.room}`,
          {
            method: 'POST',
          }
        );
        if (res.ok) {
          setTransferCompleted(true);
        } else {
          // Handle error silently or with a user-friendly message
        }
      } catch (error) {
        // Handle error silently or with a user-friendly message
      }
    }
  };

  const handleLeaveCall = async () => {
    await room.disconnect();
    window.location.href = '/';
  };

  const handleCopyToClipboard = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('identity', 'agentB');
    url.searchParams.set('role', 'agentB');
    navigator.clipboard.writeText(url.toString());
    alert('Link for Agent B copied to clipboard!');
  }

  // UI for Agent A after completing the transfer
  if (transferCompleted) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Transfer Complete!</h1>
          <p className="mb-4">The caller has been connected with Agent B.</p>
          <button onClick={handleLeaveCall} className="px-4 py-2 bg-red-500 text-white rounded">
            Leave Call
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100dvh' }}>
      <VideoConference />
      {/* UI for Agent A in the initial call */}
      {role === 'agentA' && !fromRoom && (
        <div className="absolute top-4 right-4 flex flex-col gap-2">
          <button onClick={handleInitiateTransfer} className="px-4 py-2 bg-yellow-500 text-white rounded">
            Initiate Warm Transfer
          </button>
        </div>
      )}
      {/* UI for Agent A in the new (private) room */}
      {role === 'agentA' && fromRoom && (
         <div className="absolute top-4 right-4 flex flex-col gap-2">
          <button onClick={handleCopyToClipboard} className="px-4 py-2 bg-green-500 text-white rounded">
            Invite Agent B
          </button>
          <button onClick={handleCompleteTransfer} className="px-4 py-2 bg-blue-500 text-white rounded">
            Transfer Caller
          </button>
        </div>
      )}
    </div>
  );
}

// This is the main page component that wraps the flow in LiveKitRoom
export default function RoomPage({ params }: { params: { room: string } }) {
  const searchParams = useSearchParams();
  const identity = searchParams.get('identity');
  const [roomName, setRoomName] = useState(params.room);
  const [token, setToken] = useState('');

  useEffect(() => {
    // Only fetch a token if we don't have one
    if (identity && roomName && !token) {
      fetch(`http://localhost:8000/token?room=${roomName}&identity=${identity}`,
        {
          method: 'POST',
        }
      )
        .then((res) => res.json())
        .then((data) => setToken(data.token));
    }
  }, [identity, roomName, token]);

  if (!token) {
    return <div>Getting token...</div>;
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
      audio={true}
      video={true}
      data-lk-theme="default"
    >
      {roomName.startsWith('hold-') ? (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Please hold, we are transferring you...</h1>
          </div>
        </div>
      ) : (
        <RoomFlow params={{ room: roomName }} />
      )}
      <DataChannelHandler setRoomName={setRoomName} setToken={setToken} />
    </LiveKitRoom>
  );
}