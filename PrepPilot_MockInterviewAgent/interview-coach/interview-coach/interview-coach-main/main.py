from dotenv import load_dotenv
import os

load_dotenv()

print("OpenAI:", bool(os.getenv("OPENAI_API_KEY")))
print("LiveKit Key:", bool(os.getenv("LIVEKIT_API_KEY")))
print("LiveKit Secret:", bool(os.getenv("LIVEKIT_API_SECRET")))
print("LiveKit URL:", bool(os.getenv("LIVEKIT_URL")))