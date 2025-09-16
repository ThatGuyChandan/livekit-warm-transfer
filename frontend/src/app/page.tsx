'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const Feature = ({ icon, title, description }: { icon: string, title: string, description: string }) => (
  <div className="flex flex-col items-center text-center p-6 bg-gray-100 rounded-lg shadow-md">
    <div className="text-4xl mb-4">{icon}</div>
    <h3 className="text-xl font-bold mb-2">{title}</h3>
    <p className="text-gray-600">{description}</p>
  </div>
);

const JoinRoomModal = ({ onClose, onJoin }: { onClose: () => void, onJoin: (identity: string, roomName: string, role: string) => void }) => {
  const [identity, setIdentity] = useState('');
  const [roomName, setRoomName] = useState('');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-sm">
        <h2 className="text-2xl font-bold text-center mb-6">Join a Room</h2>
        <div className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Your Name"
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          <input
            type="text"
            placeholder="Room Name"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          <div className="flex flex-col gap-3 mt-4">
            <button
              onClick={() => onJoin(identity, roomName, 'caller')}
              className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors"
            >
              Join as Caller
            </button>
            <button
              onClick={() => onJoin(identity, roomName, 'agentA')}
              className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors"
            >
              Join as Agent
            </button>
          </div>
          <button
            onClick={onClose}
            className="mt-4 text-gray-600 hover:text-blue-600 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default function Home() {
  const [showJoinModal, setShowJoinModal] = useState(false);
  const router = useRouter();

  const handleJoin = (identity: string, roomName: string, role: string) => {
    if (identity && roomName) {
      router.push(`/room/${roomName}?identity=${identity}&role=${role}`);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white py-4 px-6 flex justify-between items-center border-b border-gray-200">
        <h1 className="text-2xl font-bold text-blue-600">Warm Transfer</h1>
        <button 
          onClick={() => setShowJoinModal(true)}
          className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors"
        >
          Join Room
        </button>
      </header>

      <main className="flex-grow">
        <section className="text-center py-20 px-6">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-5xl font-extrabold mb-4">
              Seamless Warm Transfers
            </h2>
            <p className="text-lg text-gray-600 mb-8">
              A simple and professional UI for demonstrating warm transfers in a call center environment.
            </p>
            <button 
              onClick={() => setShowJoinModal(true)}
              className="py-3 px-8 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-full transition-colors text-lg"
            >
              Get Started
            </button>
          </div>
        </section>

        <section className="py-20 bg-white">
          <div className="max-w-5xl mx-auto px-6">
            <h2 className="text-4xl font-extrabold text-center mb-12">Features</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <Feature 
                icon="🔗" 
                title="Reliable Connections" 
                description="Connect with agents and customers seamlessly."
              />
              <Feature 
                icon="🧠" 
                title="AI-Powered Summaries" 
                description="(Optional) Get call summaries powered by AI."
              />
              <Feature 
                icon="📡" 
                title="PSTN Integration" 
                description="(Optional) Transfer calls to phone numbers."
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-white py-4 px-6 mt-auto border-t border-gray-200">
        <p className="text-center text-gray-500 text-sm">
          &copy; {new Date().getFullYear()} Warm Transfer. All rights reserved.
        </p>
      </footer>

      {showJoinModal && <JoinRoomModal onClose={() => setShowJoinModal(false)} onJoin={handleJoin} />}
    </div>
  );
}