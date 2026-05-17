from dotenv import load_dotenv
import os

load_dotenv(".env", override=True)

print("DEBUG LIVEKIT_URL:", os.getenv("LIVEKIT_URL"))
from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import AgentServer, AgentSession, Agent, room_io
from livekit.plugins import openai, noise_cancellation

load_dotenv()

class InterviewCoach(Agent):
    def __init__(self) -> None:
        super().__init__(instructions="""You are an interview preparation coach.

Your role:
1. Start with a warm greeting
2. Ask behavioral interview questions one at a time:
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
5. After their answer, ask if they'd like another question or to refine this one""")

server = AgentServer()

@server.rtc_session()
async def interview_agent(ctx: agents.JobContext):
    session = AgentSession(
        llm=openai.realtime.RealtimeModel(voice="coral")
    )

    await session.start(
        room=ctx.room,
        agent=InterviewCoach(),
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
        instructions="Greet the user warmly and introduce yourself as their interview coach. Ask if they're ready to practice a behavioral interview."
    )

if __name__ == "__main__":
    agents.cli.run_app(server)