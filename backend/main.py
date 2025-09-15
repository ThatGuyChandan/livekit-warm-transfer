from fastapi import FastAPI, HTTPException, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from livekit import api
from dotenv import load_dotenv
import os
import uuid
import jwt
import json
from groq import Groq
from twilio.rest import Client
from twilio.twiml.voice_response import VoiceResponse, Start

load_dotenv()

LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")
LIVEKIT_URL = os.getenv("LIVEKIT_URL")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")
NGROK_URL = os.getenv("NGROK_URL")

if not all([LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL, GROQ_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, NGROK_URL]):
    raise RuntimeError("Environment variables are not set")

livekit_api = api.LiveKitAPI(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
groq_client = Groq(api_key=GROQ_API_KEY)
twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

app = FastAPI()

@app.on_event("shutdown")
async def shutdown_event():
    await livekit_api.aclose()

transfers = {}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def create_token(room: str, identity: str):
    grants = api.VideoGrants(
        room_join=True,
        room=room,
        can_publish=True,
        can_subscribe=True
    )
    token = (
        api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(identity)
        .with_name(identity)
        .with_grants(grants)
    )
    return token.to_jwt()

async def get_caller_identity(room_name: str):
    req = api.ListParticipantsRequest(room=room_name)
    participants = await livekit_api.room.list_participants(req)
    for p in participants.participants:
        if p.identity != 'agentA':
            return p.identity
    return None

@app.post("/token")
async def get_token(room: str, identity: str):
    return {"token": create_token(room, identity)}

@app.post("/initiate_transfer")
async def initiate_transfer(current_room: str):
    caller_identity = await get_caller_identity(current_room)
    if not caller_identity:
        raise HTTPException(status_code=404, detail="Caller not found in the room")

    hold_room_name = f"hold-{uuid.uuid4()}"
    new_room_name = f"transfer-{uuid.uuid4()}"
    hold_token = create_token(hold_room_name, caller_identity)
    agent_b_token = create_token(new_room_name, "agentB")

    # Create hold room on LiveKit
    hold_room_req = api.CreateRoomRequest(name=hold_room_name)
    await livekit_api.room.create_room(hold_room_req)

    # Create the new room for Agent A and B
    new_room_req = api.CreateRoomRequest(name=new_room_name)
    await livekit_api.room.create_room(new_room_req)

    req = api.SendDataRequest(
        room=current_room,
        data=json.dumps({"action": "move", "room": hold_room_name, "token": hold_token}).encode('utf-8'),
        kind="RELIABLE",
        destination_identities=[caller_identity],
        topic="move_room",
    )
    await livekit_api.room.send_data(req)

    transfers[current_room] = {
        "new_room": new_room_name,
        "hold_room": hold_room_name,
        "caller_identity": caller_identity,
    }
    return {"new_room_name": new_room_name, "agent_b_token": agent_b_token}

@app.post("/complete_transfer")
async def complete_transfer(from_room: str, to_room: str):
    if from_room not in transfers:
        raise HTTPException(status_code=404, detail="Transfer not found")

    transfer_info = transfers[from_room]
    hold_room = transfer_info["hold_room"]
    caller_identity = transfer_info["caller_identity"]
    new_room = transfer_info["new_room"]
    new_room_token = create_token(new_room, caller_identity)

    req = api.SendDataRequest(
        room=hold_room,
        data=json.dumps({"action": "move", "room": new_room, "token": new_room_token}).encode('utf-8'),
        kind="RELIABLE",
        destination_identities=[caller_identity],
        topic="move_room",
    )
    await livekit_api.room.send_data(req)
    
    del transfers[from_room]
    return {"status": "ok", "message": "Transfer completed"}

@app.post("/create_room")
async def create_room():
    room_name = str(uuid.uuid4())
    return {"room_name": room_name}


@app.post("/summarize")
async def summarize(transcript: str):
    try:
        chat_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that summarizes call transcripts.",
                },
                {
                    "role": "user",
                    "content": f'Summarize the following call transcript:\n\n{transcript}',
                },
            ],
            model="llama3-8b-8192",
        )
        return {"summary": chat_completion.choices[0].message.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/dial_agent_b")
async def dial_agent_b(agent_b_number: str = Query(...), room_name: str = Query(...)):
    try:
        call = twilio_client.calls.create(
            to=agent_b_number,
            from_=TWILIO_PHONE_NUMBER,
            url=f"{NGROK_URL}/twilio_voice?room_name={room_name}",
            method="POST"
        )
        return {"call_sid": call.sid}
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/twilio_voice")
async def twilio_voice(room_name: str):
    response = VoiceResponse()
    response.connect().stream(
        url=f"wss://{LIVEKIT_URL.replace('http://', '').replace('https://', '')}/twilio?room_name={room_name}"
    )
    return Response(content=str(response), media_type="application/xml")
