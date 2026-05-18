from dotenv import load_dotenv
import os

from fastapi import FastAPI
from livekit import api
import os
import uvicorn
app = FastAPI()


@app.get("/token")
def get_token(identity: str = "misty"):
    at = api.AccessToken(
        os.getenv("LIVEKIT_API_KEY"),
        os.getenv("LIVEKIT_API_SECRET"),
    )

    at.with_identity(identity)
    at.with_name(identity)
    at.with_grants(
        api.VideoGrants(
            room_join=True,
            room="interview-room"
        )
    )

    return {"token": at.to_jwt()}


from livekit import agents, rtc
from livekit.agents import AgentServer, AgentSession, Agent, room_io
from livekit.plugins import openai, noise_cancellation
from voice_profiles import VOICE_PROFILES
from profiles import add_session
conversation_state = {
    "started": False
} 
import json
def get_user_profile(username="misty"):
    try:
        with open("data/users.json", "r") as f:
            data = json.load(f)
        return data.get(username, {"sessions": []})
    except:
        return {"sessions": []}
# Load environment variables
load_dotenv(".env", override=True)

print("DEBUG LIVEKIT_URL:", os.getenv("LIVEKIT_URL"))


class InterviewCoach(Agent):
    def __init__(self, mode="alloy") -> None:

        profile = get_user_profile("misty")
        session_count = len(profile["sessions"])
        voice_profile = VOICE_PROFILES.get(mode, VOICE_PROFILES["alloy"])
        voice_name = voice_profile["voice"]
        style = voice_profile["style"]
        difficulty = voice_profile["difficulty"]
        self.voice_name = voice_name
        super().__init__(instructions=f"""
                         
You are an interview preparation coach.
                         
MODE SETTINGS:
- Style: {style}
- Difficulty: {difficulty}

USER:
- Name: misty
- Previous sessions: {session_count}

CRITICAL FLOW RULE:
- After greeting, you MUST stop and wait for user input.
- Do NOT assume the user responded.
- Do NOT continue unless the user explicitly says they are ready.

SESSION LOGIC:
- First message: greet user and ask "Are you ready to start your interview practice?"
- Then STOP and wait.
- Only begin interview questions after user says yes or confirms readiness.

If the user has not spoken, do nothing beyond the readiness question.

LANGUAGE RULE:
- Start in English
- Match user language after they respond

STYLE:
- Professional but friendly
- One question at a time
                         
USER PROFILE:
- User name: misty
- Previous interview sessions: {session_count}

LANGUAGE RULE:  
- You MUST begin every session in English regardless of anything else.                                          
- Always START the conversation in English.
- After the user speaks, detect their language from their message.
- If the user clearly uses another language, respond in that same language.
- If the language is unclear, stay in English.
- Do NOT guess or randomly switch languages.
- Do NOT mention this rule to the user.

Your role:
1. Greet the user by name: misty
2. If session_count > 0, briefly acknowledge progress (example: "Welcome back")
3. Ask if they are ready to continue practice
4. Then proceed with behavioral questions (STAR method)
   - Tell me about a time you faced a challenging deadline. How did you handle it?
   - Describe a situation where you had to work with someone difficult. How did you manage it?
   - Give an example of when you had to learn a new skill quickly. What was your approach?
   - Tell me about a time you failed. What did you learn?
   - Describe when you took initiative without being asked. What was the outcome?

3. As they answer:
   - Listen actively and acknowledge their response
   - Ask follow-up questions to understand the situation, action, and result (STAR)
   - Provide constructive feedback
   - Point out strengths and areas to improve
   - Give tips to structure their answer better

4. Be encouraging and keep responses conversational (it's a voice interview)
5. After their answer, ask if they'd like another question or to refine this one
""")


# IMPORTANT: server MUST be defined BEFORE decorator
server = AgentServer()


@server.rtc_session()
async def interview_agent(ctx: agents.JobContext):

    agent_instance = InterviewCoach(mode="fable")

    session = AgentSession(
        llm=openai.realtime.RealtimeModel(
            voice=agent_instance.voice_name
        )
    )

    await session.start(
        room=ctx.room,
        agent=agent_instance,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: (
                    noise_cancellation.BVCTelephony()
                    if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                    else noise_cancellation.BVC()
                ),
            ),
        ),
    )

    await session.generate_reply(
        instructions="""
Greet the user warmly as their interview coach.

IMPORTANT FLOW RULE:
- After greeting, STOP and WAIT for the user to respond.
- Ask ONLY one question: "Are you ready to start your interview practice?"
- Do NOT ask interview questions until the user explicitly says they are ready.
"""
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

if __name__ == "__main__":
    agents.cli.run_app(server)
if __name__ == "__main__":
    agents.cli.run_app(server)

 