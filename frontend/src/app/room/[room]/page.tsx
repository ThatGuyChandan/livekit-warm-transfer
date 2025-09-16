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

function DataChannelHandler({ setRoomName, setToken }: { setRoomName: (room: string) => void, setToken: (token: string) => void }) {
  const roomContext = useRoomContext();
  useDataChannel("move_room", (msg) => {
    const { room: newRoomName, token: newToken } = JSON.parse(new TextDecoder().decode(msg.payload));
    roomContext.disconnect().then(() => {
      setRoomName(newRoomName);
      setToken(newToken);
    });
  });
  return null;
}

function RoomFlow({ params }: { params: { room: string } }) {
  const searchParams = useSearchParams();
  const identity = searchParams.get('identity');
  const role = searchParams.get('role');
  const fromRoom = searchParams.get('from_room');

  const room = useRoomContext();
  const [transferCompleted, setTransferCompleted] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [showCopyLinkModal, setShowCopyLinkModal] = useState(false);
  const [agentBLink, setAgentBLink] = useState('');
  const [error, setError] = useState<string | null>(null);

  const ErrorDisplay = ({ message, onClose }: { message: string, onClose: () => void }) => (
    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
      <span>{message}</span>
      <button onClick={onClose} className="absolute top-0 bottom-0 right-0 px-4 py-3">
        &times;
      </button>
    </div>
  );

  const handleInitiateTransfer = async () => {
    if (role === 'agentA') {
      setIsTransferring(true);
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
          window.location.href = `/room/${newRoomName}?identity=${identity}&role=agentA&from_room=${params.room}`;
        } else {
          const errorData = await res.json();
          setError(errorData.detail || 'Failed to initiate transfer.');
        }
      } catch (error) {
        setError('An unexpected error occurred.');
      } finally {
        setIsTransferring(false);
      }
    }
  };

  const handleCompleteTransfer = async () => {
    if (role === 'agentA' && fromRoom) {
      setIsTransferring(true);
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
          const errorData = await res.json();
          setError(errorData.detail || 'Failed to complete transfer.');
        }
      } catch (error) {
        setError('An unexpected error occurred.');
      } finally {
        setIsTransferring(false);
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
    setAgentBLink(url.toString());
    setShowCopyLinkModal(true);
  }

  const handleGetTranscript = () => {
    const hardcodedTranscript = `Caller: Hi, I'm having trouble with my internet connection. It keeps dropping every few minutes.\nAgent A: I'm sorry to hear that. Can you tell me what troubleshooting steps you've already tried?\nCaller: I've restarted my router and my computer several times. I also checked the cables.\nAgent A: Okay, thank you for that information. Let me check the status of the network in your area. It looks like there is a known outage that we are working to resolve. I can transfer you to our outage specialist, Agent B, who can give you more details and an estimated time for resolution.\nCaller: Okay, that would be great.`;
    setTranscript(hardcodedTranscript);
  };

  const handleSummarize = async () => {
    if (!transcript) return;
    setIsSummarizing(true);
    try {
      const res = await fetch('http://localhost:8000/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcript }),
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
      } else {
        const errorData = await res.json();
        setError(errorData.detail || 'Failed to generate summary.');
      }
    } catch (error) {
      setError('An unexpected error occurred.');
    } finally {
      setIsSummarizing(false);
    }
  };

  if (transferCompleted) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center p-8 bg-white rounded-lg shadow-md">
          <h1 className="text-2xl font-bold mb-4">Transfer Complete!</h1>
          <p className="mb-6">The caller has been connected with Agent B.</p>
          <button onClick={handleLeaveCall} className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
            Leave Call
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 h-screen bg-gray-100">
      <div className="md:col-span-3 bg-white">
        <VideoConference />
      </div>
      <div className="md:col-span-1 bg-gray-50 p-6 flex flex-col gap-6 overflow-y-auto">
        {error && <ErrorDisplay message={error} onClose={() => setError(null)} />}
        
        {role === 'agentA' && !fromRoom && (
          <button 
            onClick={handleInitiateTransfer} 
            disabled={isTransferring}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md transition-colors disabled:bg-blue-400"
          >
            {isTransferring ? 'Initiating...' : 'Initiate Warm Transfer'}
          </button>
        )}

        {role === 'agentA' && fromRoom && (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-bold">Transfer Controls</h2>
            <button 
              onClick={handleCopyToClipboard} 
              className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-md transition-colors"
            >
              Invite Agent B
            </button>
            <button 
              onClick={handleCompleteTransfer} 
              disabled={isTransferring}
              className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition-colors disabled:bg-indigo-400"
            >
              {isTransferring ? 'Transferring...' : 'Transfer Caller'}
            </button>
          </div>
        )}

        {(role === 'agentA' && fromRoom) && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="text-xl font-bold mb-4">Call Context</h3>
              {!transcript ? (
                <button 
                  onClick={handleGetTranscript} 
                  className="w-full py-2 px-4 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold rounded-lg shadow-md transition-colors"
                >
                  Get Transcript
                </button>
              ) : (
                <div className="flex flex-col gap-4">
                  <textarea 
                    readOnly 
                    value={transcript} 
                    className="w-full h-32 p-2 border rounded bg-gray-100"
                  />
                  <button 
                    onClick={handleSummarize} 
                    disabled={isSummarizing} 
                    className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg shadow-md transition-colors disabled:bg-purple-400"
                  >
                    {isSummarizing ? 'Summarizing...' : 'Generate Summary'}
                  </button>
                </div>
              )}
              {summary && (
                <div className="mt-4">
                  <h4 className="text-lg font-bold">Summary</h4>
                  <textarea 
                    readOnly 
                    value={summary} 
                    className="w-full h-28 p-2 mt-2 border rounded bg-gray-100"
                  />
                </div>
              )}
            </div>
        )}

        {showCopyLinkModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">Invite Agent B</h2>
              <p className="text-gray-600 mb-4">Share this link with Agent B.</p>
              <input 
                type="text" 
                readOnly 
                value={agentBLink} 
                className="w-full p-2 border rounded bg-gray-100"
              />
              <div className="mt-4 flex justify-end gap-4">
                <button 
                  onClick={() => setShowCopyLinkModal(false)} 
                  className="py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-lg transition-colors"
                >
                  Close
                </button>
                <button 
                  onClick={() => {navigator.clipboard.writeText(agentBLink); setShowCopyLinkModal(false);}}
                  className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md transition-colors"
                >
                  Copy Link
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RoomPage({ params }: { params: { room: string } }) {
  const searchParams = useSearchParams();
  const identity = searchParams.get('identity');
  const [roomName, setRoomName] = useState(params.room);
  const [token, setToken] = useState('');

  useEffect(() => {
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
    return <div className="flex items-center justify-center h-screen"><div>Loading...</div></div>;
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
        <div className="flex items-center justify-center h-screen bg-gray-100">
          <div className="text-center p-8 bg-white rounded-lg shadow-md">
            <h1 className="text-xl font-bold">Please hold, we are transferring you...</h1>
          </div>
        </div>
      ) : (
        <RoomFlow params={{ room: roomName }} />
      )}
      <DataChannelHandler setRoomName={setRoomName} setToken={setToken} />
    </LiveKitRoom>
  );
}