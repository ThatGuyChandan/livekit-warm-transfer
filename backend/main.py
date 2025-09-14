from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from livekit import api
from dotenv import load_dotenv
import os
import uuid
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

if not all([LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL, GROQ_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER]):
    raise HTTPException(status_code=500, detail="Environment variables are not set")

livekit_api = api.LiveKitAPI(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
groq_client = Groq(api_key=GROQ_API_KEY)
twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

app = FastAPI()

# CORS middleware to allow requests from the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this to your frontend's domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/token")
async def get_token(room: str, identity: str):
    token = (
        api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(identity)
        .with_name(identity)
        .with_grant(api.VideoGrant(room=room))
    )
    return {"token": token.to_jwt()}

@app.post("/create_room")
async def create_room():
    room_name = str(uuid.uuid4())
    try:
        await livekit_api.create_room(api.CreateRoomRequest(name=room_name))
        return {"room_name": room_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/warm_transfer")
async def warm_transfer(agent_b_identity: str):
    new_room_name = str(uuid.uuid4())
    try:
        await livekit_api.create_room(api.CreateRoomRequest(name=new_room_name))
        token = (
            api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
            .with_identity(agent_b_identity)
            .with_name(agent_b_identity)
            .with_grant(api.VideoGrant(room=new_room_name))
        )
        return {"room_name": new_room_name, "token": token.to_jwt()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
async def dial_agent_b(agent_b_number: str, room_name: str):
    try:
        call = twilio_client.calls.create(
            to=agent_b_number,
            from_=TWILIO_PHONE_NUMBER,
            url=f"https://<your-ngrok-url>/twilio_voice?room_name={room_name}", # Replace with your ngrok URL
            method="POST"
        )
        return {"call_sid": call.sid}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/twilio_voice")
async def twilio_voice(room_name: str):
    response = VoiceResponse()
    start = Start()
    start.stream(url=f'wss://{LIVEKIT_URL.replace("http://", "").replace("https://", "")}')
    response.append(start)
    return Response(content=str(response), media_type="application/xml")
