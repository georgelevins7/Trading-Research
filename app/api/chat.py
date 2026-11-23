from typing import Literal
from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from app.ai.agent import agent
from app.security import (get_current_user, bearer_scheme)

router = APIRouter(prefix="/ai", tags=["AI"])

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=5000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)

@router.post("/chat")
async def chat(data: ChatRequest, user=Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    messages = [
        {"role": item.role, "content": item.content}
        for item in data.history[-10:]
    ]

    messages.append({
        "role": "user",
        "content": data.message})

    result = await agent.ainvoke(
        {"messages": messages},
        context={"token": credentials.credentials},
        config={"recursion_limit": 20})

    content = result["messages"][-1].content

    if isinstance(content, list):
        content = "\n".join(
            item.get("text", "")
            if isinstance(item, dict)
            else str(item)
            for item in content)

    return {"reply": str(content)}