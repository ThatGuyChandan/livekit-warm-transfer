'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [identity, setIdentity] = useState('');
  const [roomName, setRoomName] = useState('');
  const router = useRouter();

  const handleJoin = (role: string) => {
    if (identity && roomName) {
      router.push(`/room/${roomName}?identity=${identity}&role=${role}`);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-8">Warm Transfer MVP</h1>
      <div className="flex flex-col gap-4">
        <input
          type="text"
          placeholder="Your Name"
          value={identity}
          onChange={(e) => setIdentity(e.target.value)}
          className="px-4 py-2 border rounded"
        />
        <input
          type="text"
          placeholder="Room Name"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          className="px-4 py-2 border rounded"
        />
        <button
          onClick={() => handleJoin('caller')}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Join as Caller
        </button>
        <button
          onClick={() => handleJoin('agentA')}
          className="px-4 py-2 bg-green-500 text-white rounded"
        >
          Join as Agent A
        </button>
      </div>
    </main>
  );
}
