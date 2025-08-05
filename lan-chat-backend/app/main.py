from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional, Dict
from datetime import datetime, timedelta
import json
import asyncio
import aiofiles
import uuid
import os

from .database import create_tables, get_db
from .models import User, Group, Message, RegistrationRequest, group_members
from .schemas import *
from .auth import *
from .encryption import encryption_manager

app = FastAPI(title="LAN Chat Application", version="1.0.0")

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for public access
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],  # Explicit methods
    allow_headers=["*"],  # Allows all headers
)

@app.on_event("startup")
async def startup_event():
    create_tables()
    db = next(get_db())
    
    admin_user = db.query(User).filter(User.username == "admin").first()
    if not admin_user:
        public_key, private_key = encryption_manager.generate_user_keypair()
        encrypted_private_key = encryption_manager.encrypt_private_key(private_key, "admin123")
        
        admin_user = User(
            username="admin",
            company_id="ADMIN",
            email="admin@company.com",
            full_name="System Administrator",
            password_hash=get_password_hash("admin123"),
            public_key=public_key,
            private_key_encrypted=encrypted_private_key,
            is_approved=True,
            is_admin=True
        )
        db.add(admin_user)
        db.commit()
        print("Default admin user created: admin/admin123")

    demo_users_data = [
        {"username": "alice", "full_name": "Alice Johnson", "email": "alice@company.com"},
        {"username": "bob", "full_name": "Bob Smith", "email": "bob@company.com"},
        {"username": "charlie", "full_name": "Charlie Brown", "email": "charlie@company.com"},
        {"username": "diana", "full_name": "Diana Wilson", "email": "diana@company.com"},
        {"username": "eve", "full_name": "Eve Davis", "email": "eve@company.com"}
    ]
    
    demo_users = []
    for user_data in demo_users_data:
        existing_user = db.query(User).filter(User.username == user_data["username"]).first()
        if not existing_user:
            public_key, private_key = encryption_manager.generate_user_keypair()
            encrypted_private_key = encryption_manager.encrypt_private_key(private_key, "demo123")
            
            new_user = User(
                username=user_data["username"],
                company_id="DEMO",
                email=user_data["email"],
                full_name=user_data["full_name"],
                password_hash=get_password_hash("demo123"),
                public_key=public_key,
                private_key_encrypted=encrypted_private_key,
                is_approved=True
            )
            db.add(new_user)
            demo_users.append(new_user)
        else:
            demo_users.append(existing_user)
    
    db.commit()

    demo_groups_data = [
        {"name": "Project Team", "description": "Main project discussion"},
        {"name": "Marketing", "description": "Marketing team coordination"},
        {"name": "Development", "description": "Development team chat"}
    ]
    
    for group_data in demo_groups_data:
        existing_group = db.query(Group).filter(Group.name == group_data["name"]).first()
        if not existing_group:
            group_key = encryption_manager.generate_group_key()
            
            new_group = Group(
                name=group_data["name"],
                description=group_data["description"],
                admin_id=admin_user.id,
                group_key_encrypted=group_key
            )
            db.add(new_group)
            db.commit()
            db.refresh(new_group)
            
            for user in [admin_user] + demo_users:
                if user not in new_group.members:
                    new_group.members.append(user)
            db.commit()
            
            demo_messages = [
                "Hello everyone! Welcome to the team.",
                "Great to be here! Looking forward to working together.",
                "What's our first priority for this week?",
                "I think we should focus on the user interface improvements.",
                "Agreed! The current design needs some updates.",
                "I can work on the frontend components.",
                "Perfect! I'll handle the backend API changes.",
                "Should we schedule a meeting to discuss the timeline?",
                "How about tomorrow at 2 PM?",
                "That works for me!",
                "Same here, I'll be there.",
                "Great! I'll send out the calendar invite.",
                "Thanks! Looking forward to it.",
                "By the way, has anyone reviewed the latest requirements?",
                "Yes, I went through them yesterday. They look comprehensive.",
                "Any concerns or questions about the scope?",
                "I think the timeline might be a bit tight for the mobile version.",
                "We could prioritize the web version first.",
                "That makes sense. Mobile can be phase 2.",
                "Sounds like a plan! I'll update the project roadmap.",
                "Perfect! Communication is key for this project.",
                "Absolutely! Let's keep this chat active.",
                "I'll post daily updates here.",
                "Great idea! Transparency helps everyone stay aligned.",
                "Speaking of updates, how's the database design coming along?",
                "It's almost ready. Just finalizing the user permissions.",
                "Excellent! Security is definitely important.",
                "I've been working on the authentication flow too.",
                "Nice! Are we using JWT tokens?",
                "Yes, with refresh token rotation for better security.",
                "Perfect! That's exactly what we need.",
                "I'll have the API documentation ready by Friday.",
                "Thanks! That will help with frontend integration.",
                "No problem! Collaboration makes everything smoother.",
                "This team is amazing! 🚀",
                "Couldn't agree more! 💪",
                "Let's keep this momentum going!",
                "Definitely! Quality and speed together.",
                "I love working with such dedicated people.",
                "The feeling is mutual! 😊",
                "Alright, let's get back to coding!",
                "Time to make some magic happen! ✨",
                "See you all in the meeting tomorrow!",
                "Looking forward to it!",
                "Have a great rest of your day everyone!",
                "You too! Happy coding! 💻",
                "Thanks team! This is going to be awesome!",
                "Absolutely! We've got this! 🎉",
                "Best team ever! 🌟",
                "Let's build something incredible together!"
            ]
            
            for i, message_content in enumerate(demo_messages):
                sender = demo_users[i % len(demo_users)]
                encrypted_content = encryption_manager.encrypt_group_message(message_content, group_key)
                
                message = Message(
                    sender_id=sender.id,
                    group_id=new_group.id,
                    encrypted_content=encrypted_content,
                    message_type="text",
                    is_delivered=True,
                    is_read=True,
                    delivered_at=datetime.utcnow() - timedelta(days=7-i//10, hours=i%24),
                    read_at=datetime.utcnow() - timedelta(days=7-i//10, hours=i%24),
                    created_at=datetime.utcnow() - timedelta(days=7-i//10, hours=i%24)
                )
                db.add(message)
            
            db.commit()
            print(f"Demo group '{group_data['name']}' created with 50 messages")
        else:
            print(f"Demo group '{group_data['name']}' already exists")

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}
        self.user_status: Dict[int, dict] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        self.user_status[user_id] = {
            "online": True,
            "last_seen": datetime.utcnow(),
            "typing": False
        }
        await self.broadcast_user_status(user_id)

    def disconnect(self, user_id: int):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        if user_id in self.user_status:
            self.user_status[user_id]["online"] = False
            self.user_status[user_id]["last_seen"] = datetime.utcnow()

    async def send_personal_message(self, message: str, user_id: int):
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_text(message)

    async def broadcast_user_status(self, user_id: int):
        status_message = {
            "type": "user_status",
            "user_id": user_id,
            "status": self.user_status.get(user_id, {})
        }
        for connection_user_id, websocket in self.active_connections.items():
            if connection_user_id != user_id:
                await websocket.send_text(json.dumps(status_message))

    async def broadcast_to_group(self, group_id: int, message: str, sender_id: int, db: Session):
        group = db.query(Group).filter(Group.id == group_id).first()
        if group:
            member_ids = [member.id for member in group.members]
            for member_id in member_ids:
                if member_id != sender_id and member_id in self.active_connections:
                    await self.active_connections[member_id].send_text(message)

manager = ConnectionManager()

@app.post("/api/auth/register", response_model=dict)
async def register_user(user_data: RegistrationRequestCreate, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(
        (User.username == user_data.username) | (User.email == user_data.email)
    ).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username or email already registered")
    
    existing_request = db.query(RegistrationRequest).filter(
        (RegistrationRequest.username == user_data.username) | 
        (RegistrationRequest.email == user_data.email)
    ).first()
    if existing_request:
        raise HTTPException(status_code=400, detail="Registration request already pending")
    
    hashed_password = get_password_hash(user_data.password)
    registration_request = RegistrationRequest(
        username=user_data.username,
        company_id=user_data.company_id,
        email=user_data.email,
        full_name=user_data.full_name,
        password_hash=hashed_password
    )
    
    db.add(registration_request)
    db.commit()
    
    return {"message": "Registration request submitted. Waiting for admin approval."}

@app.post("/api/auth/login", response_model=Token)
async def login(user_credentials: UserLogin, db: Session = Depends(get_db)):
    user = authenticate_user(db, user_credentials.username, user_credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    if not user.is_approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account not approved by admin",
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    user.is_online = True
    user.last_seen = datetime.utcnow()
    db.commit()
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": UserResponse.from_orm(user)
    }

@app.get("/api/auth/pending", response_model=List[RegistrationRequestResponse])
async def get_pending_registrations(current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    pending_requests = db.query(RegistrationRequest).filter(RegistrationRequest.status == "pending").all()
    return pending_requests

@app.post("/api/auth/approve", response_model=dict)
async def approve_registration(approval: RegistrationApproval, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    request = db.query(RegistrationRequest).filter(RegistrationRequest.id == approval.request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Registration request not found")
    
    if approval.approved:
        public_key, private_key = encryption_manager.generate_user_keypair()
        encrypted_private_key = encryption_manager.encrypt_private_key(private_key, "default_password")
        
        new_user = User(
            username=request.username,
            company_id=request.company_id,
            email=request.email,
            full_name=request.full_name,
            password_hash=request.password_hash,
            public_key=public_key,
            private_key_encrypted=encrypted_private_key,
            is_approved=True
        )
        db.add(new_user)
        
        request.status = "approved"
        request.reviewed_by = current_user.id
        request.reviewed_at = datetime.utcnow()
    else:
        request.status = "rejected"
        request.reviewed_by = current_user.id
        request.reviewed_at = datetime.utcnow()
        request.rejection_reason = approval.rejection_reason
    
    db.commit()
    
    return {"message": f"Registration request {'approved' if approval.approved else 'rejected'}"}

@app.get("/api/users/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    return current_user

@app.get("/api/users", response_model=List[UserResponse])
async def get_all_users(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    users = db.query(User).filter(User.is_approved == True).all()
    return users

@app.put("/api/users/status", response_model=dict)
async def update_user_status(status_data: UserStatus, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.is_online = status_data.is_online
    current_user.last_seen = status_data.last_seen
    db.commit()
    
    await manager.broadcast_user_status(current_user.id)
    
    return {"message": "Status updated"}

@app.get("/api/chats", response_model=List[ChatListItem])
async def get_user_chats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chats = []
    
    direct_messages = db.query(Message).filter(
        ((Message.sender_id == current_user.id) | (Message.recipient_id == current_user.id)) &
        (Message.group_id == None)
    ).all()
    
    user_chats = {}
    for msg in direct_messages:
        other_user_id = msg.recipient_id if msg.sender_id == current_user.id else msg.sender_id
        if other_user_id not in user_chats:
            user_chats[other_user_id] = []
        user_chats[other_user_id].append(msg)
    
    for user_id, messages in user_chats.items():
        other_user = db.query(User).filter(User.id == user_id).first()
        if other_user:
            latest_message = max(messages, key=lambda x: x.created_at)
            unread_count = len([m for m in messages if not m.is_read and m.sender_id != current_user.id])
            
            chats.append(ChatListItem(
                id=other_user.id,
                name=other_user.full_name,
                avatar_url=other_user.avatar_url,
                last_message=encryption_manager.decrypt_message(latest_message.encrypted_content, 
                                                              encryption_manager.decrypt_private_key(current_user.private_key_encrypted, "default_password")),
                last_message_time=latest_message.created_at,
                unread_count=unread_count,
                is_group=False,
                is_online=other_user.is_online,
                last_seen=other_user.last_seen
            ))
    
    for group in current_user.groups:
        latest_message = db.query(Message).filter(Message.group_id == group.id).order_by(Message.created_at.desc()).first()
        unread_count = db.query(Message).filter(
            Message.group_id == group.id,
            Message.sender_id != current_user.id,
            Message.is_read == False
        ).count()
        
        chats.append(ChatListItem(
            id=group.id,
            name=group.name,
            avatar_url=group.avatar_url,
            last_message=encryption_manager.decrypt_group_message(latest_message.encrypted_content, group.group_key_encrypted) if latest_message else None,
            last_message_time=latest_message.created_at if latest_message else group.created_at,
            unread_count=unread_count,
            is_group=True
        ))
    
    return sorted(chats, key=lambda x: x.last_message_time or datetime.min, reverse=True)

@app.get("/api/chats/{chat_id}/messages", response_model=List[MessageResponse])
async def get_chat_messages(chat_id: int, is_group: bool = False, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if is_group:
        messages = db.query(Message).filter(Message.group_id == chat_id).order_by(Message.created_at).all()
        group = db.query(Group).filter(Group.id == chat_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        
        db.query(Message).filter(
            Message.group_id == chat_id,
            Message.sender_id != current_user.id
        ).update({"is_read": True, "read_at": datetime.utcnow()})
        db.commit()
        
        decrypted_messages = []
        print(f"DEBUG: Found {len(messages)} messages for group {chat_id}")
        for msg in messages:
            try:
                decrypted_content = encryption_manager.decrypt_group_message(msg.encrypted_content, group.group_key_encrypted)
                decrypted_messages.append(MessageResponse(
                    id=msg.id,
                    sender_id=msg.sender_id,
                    sender_name=msg.sender.full_name,
                    sender_avatar=msg.sender.avatar_url,
                    recipient_id=None,
                    group_id=msg.group_id,
                    content=decrypted_content,
                    message_type=msg.message_type,
                    is_delivered=msg.is_delivered,
                    is_read=msg.is_read,
                    delivered_at=msg.delivered_at,
                    read_at=msg.read_at,
                    created_at=msg.created_at
                ))
            except Exception as e:
                print(f"DEBUG: Decryption failed for message {msg.id}: {e}")
                continue
        
        return decrypted_messages
    else:
        messages = db.query(Message).filter(
            ((Message.sender_id == current_user.id) & (Message.recipient_id == chat_id)) |
            ((Message.sender_id == chat_id) & (Message.recipient_id == current_user.id))
        ).order_by(Message.created_at).all()
        
        db.query(Message).filter(
            Message.sender_id == chat_id,
            Message.recipient_id == current_user.id
        ).update({"is_read": True, "read_at": datetime.utcnow()})
        db.commit()
        
        decrypted_messages = []
        private_key = encryption_manager.decrypt_private_key(current_user.private_key_encrypted, "default_password")
        
        for msg in messages:
            try:
                decrypted_content = encryption_manager.decrypt_message(msg.encrypted_content, private_key)
                decrypted_messages.append(MessageResponse(
                    id=msg.id,
                    sender_id=msg.sender_id,
                    sender_name=msg.sender.full_name,
                    sender_avatar=msg.sender.avatar_url,
                    recipient_id=msg.recipient_id,
                    content=decrypted_content,
                    message_type=msg.message_type,
                    is_delivered=msg.is_delivered,
                    is_read=msg.is_read,
                    delivered_at=msg.delivered_at,
                    read_at=msg.read_at,
                    created_at=msg.created_at
                ))
            except:
                continue
        
        return decrypted_messages

@app.post("/api/messages", response_model=MessageResponse)
async def send_message(message_data: MessageCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if message_data.group_id:
        group = db.query(Group).filter(Group.id == message_data.group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        
        if current_user not in group.members:
            raise HTTPException(status_code=403, detail="Not a member of this group")
        
        encrypted_content = encryption_manager.encrypt_group_message(message_data.content, group.group_key_encrypted)
        
        new_message = Message(
            sender_id=current_user.id,
            group_id=message_data.group_id,
            encrypted_content=encrypted_content,
            message_type=message_data.message_type,
            is_delivered=True,
            delivered_at=datetime.utcnow()
        )
        
        db.add(new_message)
        db.commit()
        db.refresh(new_message)
        
        message_json = {
            "type": "new_message",
            "message": {
                "id": new_message.id,
                "sender_id": current_user.id,
                "sender_name": current_user.full_name,
                "sender_avatar": current_user.avatar_url,
                "group_id": message_data.group_id,
                "content": message_data.content,
                "message_type": message_data.message_type,
                "created_at": new_message.created_at.isoformat()
            }
        }
        await manager.broadcast_to_group(message_data.group_id, json.dumps(message_json), current_user.id, db)
        
        return MessageResponse(
            id=new_message.id,
            sender_id=current_user.id,
            sender_name=current_user.full_name,
            sender_avatar=current_user.avatar_url,
            recipient_id=None,
            group_id=message_data.group_id,
            content=message_data.content,
            message_type=message_data.message_type,
            is_delivered=True,
            is_read=False,
            delivered_at=new_message.delivered_at,
            read_at=None,
            created_at=new_message.created_at
        )
    else:
        recipient = db.query(User).filter(User.id == message_data.recipient_id).first()
        if not recipient:
            raise HTTPException(status_code=404, detail="Recipient not found")
        
        encrypted_content = encryption_manager.encrypt_message(message_data.content, recipient.public_key)
        
        new_message = Message(
            sender_id=current_user.id,
            recipient_id=message_data.recipient_id,
            encrypted_content=encrypted_content,
            message_type=message_data.message_type,
            is_delivered=True,
            delivered_at=datetime.utcnow()
        )
        
        db.add(new_message)
        db.commit()
        db.refresh(new_message)
        
        message_json = {
            "type": "new_message",
            "message": {
                "id": new_message.id,
                "sender_id": current_user.id,
                "sender_name": current_user.full_name,
                "sender_avatar": current_user.avatar_url,
                "recipient_id": message_data.recipient_id,
                "content": message_data.content,
                "message_type": message_data.message_type,
                "created_at": new_message.created_at.isoformat()
            }
        }
        await manager.send_personal_message(json.dumps(message_json), message_data.recipient_id)
        
        return MessageResponse(
            id=new_message.id,
            sender_id=current_user.id,
            sender_name=current_user.full_name,
            sender_avatar=current_user.avatar_url,
            recipient_id=message_data.recipient_id,
            group_id=None,
            content=message_data.content,
            message_type=message_data.message_type,
            is_delivered=True,
            is_read=False,
            delivered_at=new_message.delivered_at,
            read_at=None,
            created_at=new_message.created_at
        )

@app.post("/api/groups", response_model=GroupResponse)
async def create_group(group_data: GroupCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    group_key = encryption_manager.generate_group_key()
    
    new_group = Group(
        name=group_data.name,
        description=group_data.description,
        avatar_url=group_data.avatar_url,
        admin_id=current_user.id,
        group_key_encrypted=group_key
    )
    
    db.add(new_group)
    db.commit()
    db.refresh(new_group)
    
    new_group.members.append(current_user)
    db.commit()
    
    return GroupResponse(
        id=new_group.id,
        name=new_group.name,
        description=new_group.description,
        avatar_url=new_group.avatar_url,
        admin_id=new_group.admin_id,
        is_active=new_group.is_active,
        max_members=new_group.max_members,
        member_count=len(new_group.members),
        created_at=new_group.created_at
    )

@app.get("/api/groups", response_model=List[GroupResponse])
async def get_user_groups(current_user: User = Depends(get_current_user)):
    groups = []
    for group in current_user.groups:
        groups.append(GroupResponse(
            id=group.id,
            name=group.name,
            description=group.description,
            avatar_url=group.avatar_url,
            admin_id=group.admin_id,
            is_active=group.is_active,
            max_members=group.max_members,
            member_count=len(group.members),
            created_at=group.created_at
        ))
    return groups

@app.post("/api/groups/{group_id}/members", response_model=dict)
async def add_group_member(group_id: int, user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if group.admin_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only group admin can add members")
    
    user_to_add = db.query(User).filter(User.id == user_id).first()
    if not user_to_add:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user_to_add in group.members:
        raise HTTPException(status_code=400, detail="User already in group")
    
    if len(group.members) >= group.max_members:
        raise HTTPException(status_code=400, detail="Group is full")
    
    group.members.append(user_to_add)
    db.commit()
    
    return {"message": "User added to group"}

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_approved:
        await websocket.close(code=1008)
        return
    
    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            if message_data["type"] == "typing":
                typing_message = {
                    "type": "typing",
                    "user_id": user_id,
                    "typing": message_data["typing"]
                }
                if message_data.get("recipient_id"):
                    await manager.send_personal_message(json.dumps(typing_message), message_data["recipient_id"])
                elif message_data.get("group_id"):
                    await manager.broadcast_to_group(message_data["group_id"], json.dumps(typing_message), user_id, db)
            
    except WebSocketDisconnect:
        manager.disconnect(user_id)
        user.is_online = False
        user.last_seen = datetime.utcnow()
        db.commit()

@app.post("/api/admin/create-user", response_model=dict)
async def create_user_directly(user_data: UserCreate, current_user: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(
        (User.username == user_data.username) | (User.email == user_data.email)
    ).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username or email already exists")
    
    public_key, private_key = encryption_manager.generate_user_keypair()
    encrypted_private_key = encryption_manager.encrypt_private_key(private_key, user_data.password)
    
    new_user = User(
        username=user_data.username,
        company_id=user_data.company_id,
        email=user_data.email,
        full_name=user_data.full_name,
        password_hash=get_password_hash(user_data.password),
        public_key=public_key,
        private_key_encrypted=encrypted_private_key,
        is_approved=True
    )
    
    db.add(new_user)
    db.commit()
    
    return {"message": "User created successfully"}

@app.post("/api/upload", response_model=dict)
async def upload_file(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    file_id = str(uuid.uuid4())
    file_extension = os.path.splitext(file.filename)[1] if file.filename else ""
    file_path = f"uploads/{file_id}{file_extension}"
    
    os.makedirs("uploads", exist_ok=True)
    
    async with aiofiles.open(file_path, 'wb') as f:
        content = await file.read()
        await f.write(content)
    
    return {
        "file_id": file_id,
        "filename": file.filename,
        "file_path": file_path,
        "file_size": len(content)
    }

@app.get("/api/files/{file_id}")
async def download_file(file_id: str, current_user: User = Depends(get_current_user)):
    file_pattern = f"uploads/{file_id}*"
    import glob
    matching_files = glob.glob(file_pattern)
    
    if not matching_files:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_path = matching_files[0]
    filename = os.path.basename(file_path)
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type='application/octet-stream'
    )

@app.delete("/api/messages/{message_id}")
async def delete_message(message_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    if message.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Can only delete your own messages")
    
    db.delete(message)
    db.commit()
    return {"message": "Message deleted successfully"}

@app.put("/api/chats/{chat_id}/archive")
async def archive_chat(chat_id: int, is_group: bool = False, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"message": "Chat archived successfully"}

@app.delete("/api/chats/{chat_id}")
async def delete_chat(chat_id: int, is_group: bool = False, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if is_group:
        group = db.query(Group).filter(Group.id == chat_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        
        if group.admin_id != current_user.id:
            raise HTTPException(status_code=403, detail="Only group admin can delete group")
        
        db.query(Message).filter(Message.group_id == chat_id).delete()
        db.delete(group)
    else:
        db.query(Message).filter(
            ((Message.sender_id == current_user.id) & (Message.recipient_id == chat_id)) |
            ((Message.sender_id == chat_id) & (Message.recipient_id == current_user.id))
        ).delete()
    
    db.commit()
    return {"message": "Chat deleted successfully"}

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
