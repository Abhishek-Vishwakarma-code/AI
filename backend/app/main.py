import json
import uuid
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from pydantic import BaseModel

# Internal Imports
from app.core.config import settings
from app.models.database import engine, Base, get_db
from app.models.models import User, Workspace, ChatSession, Message, Document, MediaTask
from app.core.security import get_password_hash, verify_password, create_access_token, get_current_user, RoleChecker
from app.services.rag_service import RAGService
from app.agents.agent_framework import SupervisorOrchestrator
from app.agents.specialized_agents import ResearchAgent, CodingAgent, ImageAgent, VideoAgent

# Initialize DB tables
Base.metadata.create_all(bind=engine)

# Seed default test user if empty
db = next(get_db())
try:
    default_email = "admin@platform.ai"
    user_exists = db.query(User).filter(User.email == default_email).first()
    if not user_exists:
        hashed = get_password_hash("password123")
        admin_user = User(email=default_email, hashed_password=hashed, full_name="Platform Admin", role="admin")
        db.add(admin_user)
        db.commit()
        
        # Create default workspace
        workspace = Workspace(name="Default Research Hub", description="Primary workspace for AI agent investigations.", owner_id=admin_user.id)
        db.add(workspace)
        db.commit()
        print("Default user (admin@platform.ai / password123) and Workspace seeded successfully.")
finally:
    db.close()

app = FastAPI(title=settings.APP_NAME, version="1.0.0")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Expose static directory for locally generated media files
import os
os.makedirs("d:/Abhishek/AI/backend/app/static/generated", exist_ok=True)
app.mount("/static", StaticFiles(directory="d:/Abhishek/AI/backend/app/static"), name="static")

# Instantiate Core Services
rag_service = RAGService()
supervisor = SupervisorOrchestrator()

# Register Agents to Supervisor
supervisor.register_agent("ResearchAgent", ResearchAgent())
supervisor.register_agent("CodingAgent", CodingAgent())
supervisor.register_agent("ImageAgent", ImageAgent())
supervisor.register_agent("VideoAgent", VideoAgent())

# --- SCHEMAS ---
class UserLogin(BaseModel):
    email: str
    password: str

class UserRegister(BaseModel):
    email: str
    password: str
    full_name: str

class Token(BaseModel):
    access_token: str
    token_type: str

class WorkspaceCreate(BaseModel):
    name: str
    description: Optional[str] = None

class MessageSend(BaseModel):
    session_id: str
    content: str

class MediaRequest(BaseModel):
    prompt: str
    aspect_ratio: Optional[str] = "1:1"

# --- ROUTERS ---

# 1. AUTHENTICATION
@app.post(f"{settings.API_V1_STR}/auth/register", response_model=Token)
def register(user_in: UserRegister, db: Session = Depends(get_db)):
    exists = db.query(User).filter(User.email == user_in.email).first()
    if exists:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed = get_password_hash(user_in.password)
    user = User(email=user_in.email, hashed_password=hashed, full_name=user_in.full_name, role="user")
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Auto create a workspace for new user
    workspace = Workspace(name="My Workspace", description="My private AI staging workspace.", owner_id=user.id)
    db.add(workspace)
    db.commit()
    
    token = create_access_token({"sub": user.email})
    return {"access_token": token, "token_type": "bearer"}

@app.post(f"{settings.API_V1_STR}/auth/login", response_model=Token)
def login(user_in: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_in.email).first()
    if not user or not verify_password(user_in.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    
    token = create_access_token({"sub": user.email})
    return {"access_token": token, "token_type": "bearer"}

@app.get(f"{settings.API_V1_STR}/auth/me")
def read_current_user(current_user: User = Depends(get_current_user)):
    return {
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "id": current_user.id
    }

# 2. WORKSPACES
@app.get(f"{settings.API_V1_STR}/workspaces")
def list_workspaces(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Workspace).filter(Workspace.owner_id == current_user.id).all()

@app.post(f"{settings.API_V1_STR}/workspaces")
def create_workspace(ws_in: WorkspaceCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = Workspace(name=ws_in.name, description=ws_in.description, owner_id=current_user.id)
    db.add(ws)
    db.commit()
    db.refresh(ws)
    return ws

# 3. CHAT SESSIONS & MULTI-AGENT INGENUITY
@app.get(f"{settings.API_V1_STR}/workspaces/{{workspace_id}}/sessions")
def list_sessions(workspace_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Verify ownership
    ws = db.query(Workspace).filter(Workspace.id == workspace_id, Workspace.owner_id == current_user.id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return db.query(ChatSession).filter(ChatSession.workspace_id == workspace_id).all()

@app.post(f"{settings.API_V1_STR}/workspaces/{{workspace_id}}/sessions")
def create_session(workspace_id: int, title: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = db.query(Workspace).filter(Workspace.id == workspace_id, Workspace.owner_id == current_user.id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    session_id = str(uuid.uuid4())
    session = ChatSession(id=session_id, title=title, workspace_id=workspace_id)
    db.add(session)
    db.commit()
    return session

@app.get(f"{settings.API_V1_STR}/chat/sessions/{{session_id}}/messages")
def get_messages(session_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    # Verify owner
    ws = db.query(Workspace).filter(Workspace.id == session.workspace_id, Workspace.owner_id == current_user.id).first()
    if not ws:
        raise HTTPException(status_code=403, detail="Unauthorized")
        
    messages = db.query(Message).filter(Message.session_id == session_id).order_by(Message.created_at.asc()).all()
    # Parse JSON strings for UI
    result = []
    for m in messages:
        result.append({
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "thoughts": json.loads(m.thoughts) if m.thoughts else [],
            "citations": json.loads(m.citations) if m.citations else [],
            "created_at": m.created_at
        })
    return result

@app.post(f"{settings.API_V1_STR}/chat/message")
def send_message(msg_in: MessageSend, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == msg_in.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    ws = db.query(Workspace).filter(Workspace.id == session.workspace_id, Workspace.owner_id == current_user.id).first()
    if not ws:
        raise HTTPException(status_code=403, detail="Unauthorized")
        
    # Save User message
    user_msg = Message(session_id=msg_in.session_id, role="user", content=msg_in.content)
    db.add(user_msg)
    db.commit()

    # Launch Supervisor multi-agent executor
    agent_response = supervisor.plan_and_execute(msg_in.content, workspace_id=ws.id)

    # Save Assistant response with logs and citations
    assistant_msg = Message(
        session_id=msg_in.session_id,
        role="assistant",
        content=agent_response["content"],
        thoughts=json.dumps(agent_response["thoughts"]),
        citations=json.dumps(agent_response["citations"])
    )
    db.add(assistant_msg)
    db.commit()

    return {
        "user_message": {
            "role": "user",
            "content": msg_in.content
        },
        "assistant_message": {
            "role": "assistant",
            "content": agent_response["content"],
            "thoughts": agent_response["thoughts"],
            "citations": agent_response["citations"],
            "media": agent_response["media"]
        }
    }

# 4. RAG / DOCUMENT UPLOAD & QUERYING
@app.post(f"{settings.API_V1_STR}/workspaces/{{workspace_id}}/documents")
async def upload_document(
    workspace_id: int, 
    file: UploadFile = File(...), 
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    ws = db.query(Workspace).filter(Workspace.id == workspace_id, Workspace.owner_id == current_user.id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
        
    # Save file contents locally
    os.makedirs("d:/Abhishek/AI/backend/app/static/documents", exist_ok=True)
    file_id = str(uuid.uuid4())
    filepath = f"d:/Abhishek/AI/backend/app/static/documents/{file_id}_{file.filename}"
    
    contents = await file.read()
    with open(filepath, "wb") as f:
        f.write(contents)
        
    # Save document record
    doc = Document(workspace_id=workspace_id, filename=file.filename, file_path=filepath, file_size=len(contents))
    db.add(doc)
    db.commit()
    db.refresh(doc)
    
    # Process text content for Semantic Vector RAG Indexing
    try:
        text_content = contents.decode("utf-8", errors="ignore")
        rag_service.ingest_document(
            doc_id=str(doc.id), 
            workspace_id=workspace_id, 
            filename=file.filename, 
            content=text_content
        )
    except Exception as e:
        print(f"Error parsing uploaded document for RAG: {e}")
        
    return {"id": doc.id, "filename": doc.filename, "size": doc.file_size, "status": "indexed"}

@app.get(f"{settings.API_V1_STR}/workspaces/{{workspace_id}}/documents")
def list_documents(workspace_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = db.query(Workspace).filter(Workspace.id == workspace_id, Workspace.owner_id == current_user.id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return db.query(Document).filter(Document.workspace_id == workspace_id).all()

# 5. MULTIMODAL MEDIA GENERATION
@app.post(f"{settings.API_V1_STR}/generate/image")
def generate_image(req: MediaRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Create Media Task record
    task_id = str(uuid.uuid4())
    task = MediaTask(id=task_id, type="image", prompt=req.prompt, status="running")
    db.add(task)
    db.commit()
    
    try:
        result = supervisor.media_service.generate_image(req.prompt, req.aspect_ratio)
        task.status = "completed"
        task.result_url = result["url"]
        db.commit()
        return result
    except Exception as e:
        task.status = "failed"
        task.error_message = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))

@app.post(f"{settings.API_V1_STR}/generate/video")
def generate_video(req: MediaRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task_id = str(uuid.uuid4())
    task = MediaTask(id=task_id, type="video", prompt=req.prompt, status="running")
    db.add(task)
    db.commit()
    
    try:
        result = supervisor.media_service.generate_video(req.prompt)
        task.status = "completed"
        task.result_url = result["url"]
        db.commit()
        return result
    except Exception as e:
        task.status = "failed"
        task.error_message = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))

@app.post(f"{settings.API_V1_STR}/generate/audio")
def generate_audio(req: MediaRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task_id = str(uuid.uuid4())
    task = MediaTask(id=task_id, type="audio", prompt=req.prompt, status="running")
    db.add(task)
    db.commit()
    
    try:
        result = supervisor.media_service.generate_speech(req.prompt)
        task.status = "completed"
        task.result_url = result["url"]
        db.commit()
        return result
    except Exception as e:
        task.status = "failed"
        task.error_message = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))
