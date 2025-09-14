'use client';

import {
  LiveKitRoom,
  VideoConference,
  useRoomContext,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Room, RoomEvent } from 'livekit-client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

// This is the main component for the room page.
// It handles the logic for both the caller and the agents.
function RoomFlow({ params }: { params: { room: string } }) {
  const searchParams = useSearchParams();
  const identity = searchParams.get('identity');
  const role = searchParams.get('role');
  const fromRoom = searchParams.get('from_room');

  const room = useRoomContext();
  const [isWaitingForTransfer, setIsWaitingForTransfer] = useState(false);
  const [transferCompleted, setTransferCompleted] = useState(false);

  // Effect for the caller to listen for transfer events
  useEffect(() => {
    const onParticipantDisconnected = (participant: any) => {
      // If the agent disconnects, the caller starts waiting for a transfer
      // Guard against a torn-down room object during disconnect
      if (room && room.participants && room.participants.size === 1 && role !== 'agentA') {
        console.log('Agent disconnected, starting transfer wait state.');
        setIsWaitingForTransfer(true);
      }
    };

    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    return () => {
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    };
  }, [room, role]);

  // Effect to start long-polling when waiting for transfer
  useEffect(() => {
    if (isWaitingForTransfer) {
      const poll = async () => {
        console.log(`Polling for events in room: ${params.room}`);
        try {
          const res = await fetch(
            `http://localhost:8000/listen_for_events?room_name=${params.room}`
          );
          if (res.ok) {
            const event = await res.json();
            console.log('Received event:', event);
            if (event && event.action === 'move' && event.new_room) {
              console.log(`Received move event, redirecting to ${event.new_room}`);
              await room.disconnect();
              window.location.href = `/room/${event.new_room}?identity=${identity}`;
            } else {
              console.log('No move event found, polling again...');
              // If no event, poll again
              setTimeout(poll, 1000);
            }
          } else {
            console.error('Polling request failed with status:', res.status);
            // If server error, wait and poll again
            setTimeout(poll, 5000);
          }
        } catch (e) {
          // If network error, wait and poll again
          console.error("Polling error:", e);
          setTimeout(poll, 5000);
        }
      };
      poll();
    }
  }, [isWaitingForTransfer, params.room, identity, room]);

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
          console.log(`Initiated transfer, moving Agent A to ${newRoomName}`);
          await room.disconnect();
          // Pass the original room name to the new room
          window.location.href = `/room/${newRoomName}?identity=${identity}&role=agentA&from_room=${params.room}`;
        } else {
          console.error("Initiate transfer failed:", res.status, res.statusText);
        }
      } catch (error) {
        console.error("Error during initiate transfer:", error);
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
          console.log("Successfully triggered caller move.");
          setTransferCompleted(true);
        } else {
          console.error("Complete transfer failed:", res.status, res.statusText);
        }
      } catch (error) {
        console.error("Error during complete transfer:", error);
      }
    }
  };

  const handleLeaveCall = async () => {
    await room.disconnect();
    window.location.href = '/';
  };

  const handleCopyToClipboard = () => {
    const url = window.location.href.replace('role=agentA', 'role=agentB').replace(`identity=${identity}`, 'identity=agentB');
    navigator.clipboard.writeText(url);
    alert('Link for Agent B copied to clipboard!');
  }

  // UI for the caller who is waiting for a transfer
  if (isWaitingForTransfer) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Please hold, we are transferring you...</h1>
        </div>
      </div>
    );
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
  const [token, setToken] = useState('');

  useEffect(() => {
    if (identity && params.room) {
      fetch(`http://localhost:8000/token?room=${params.room}&identity=${identity}`,
        {
          method: 'POST',
        }
      )
        .then((res) => res.json())
        .then((data) => setToken(data.token));
    }
  }, [identity, params.room]);

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
      <RoomFlow params={params} />
    </LiveKitRoom>
  );
}
