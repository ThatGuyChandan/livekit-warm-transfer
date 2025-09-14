from fastapi import FastAPI, HTTPException, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from livekit import api
from dotenv import load_dotenv
import os
import uuid
import jwt
import asyncio
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
    raise HTTPException(status_code=500, detail="Environment variables are not set")

livekit_api = api.LiveKitAPI(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
groq_client = Groq(api_key=GROQ_API_KEY)
twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

app = FastAPI()

# In-memory storage for transfers
transfers = {}

# CORS middleware to allow requests from the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/token")
async def get_token(room: str, identity: str):
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
    jwt_token = token.to_jwt()
    return {"token": jwt_token}

@app.post("/initiate_transfer")
async def initiate_transfer(current_room: str):
    new_room_name = str(uuid.uuid4())
    transfers[current_room] = {"new_room": new_room_name, "event": None}
    return {"new_room_name": new_room_name}

@app.get("/listen_for_events")
async def listen_for_events(room_name: str):
    # Long-polling endpoint
    for _ in range(30): # Poll for 30 seconds
        if room_name in transfers and transfers[room_name].get("event"):
            event = transfers[room_name]["event"]
            # Clean up the event after sending it
            transfers[room_name]["event"] = None
            return event
        await asyncio.sleep(1)
    return {}

@app.post("/complete_transfer")
async def complete_transfer(from_room: str, to_room: str):
    if from_room in transfers and transfers[from_room]["new_room"] == to_room:
        transfers[from_room]["event"] = {"action": "move", "new_room": to_room}
        return {"status": "ok", "message": f"Transfer event posted for room {from_room}"}
    else:
        raise HTTPException(status_code=404, detail="Transfer not found or rooms do not match")


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