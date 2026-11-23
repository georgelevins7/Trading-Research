import os

from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()

model = ChatGoogleGenerativeAI(model=os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite"), temperature=0)
