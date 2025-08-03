from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime

class UserBase(BaseModel):
    username: str
    company_id: str
    email: EmailStr
    full_name: str
    avatar_url: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(UserBase):
    id: int
    is_approved: bool
    is_admin: bool
    is_online: bool
    last_seen: datetime
    created_at: datetime
    
    class Config:
        from_attributes = True

class UserStatus(BaseModel):
    user_id: int
    is_online: bool
    last_seen: datetime
    typing: bool = False

class GroupBase(BaseModel):
    name: str
    description: Optional[str] = None
    avatar_url: Optional[str] = None

class GroupCreate(GroupBase):
    pass

class GroupResponse(GroupBase):
    id: int
    admin_id: int
    is_active: bool
    max_members: int
    member_count: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class GroupMember(BaseModel):
    user_id: int
    username: str
    full_name: str
    avatar_url: Optional[str]
    role: str
    joined_at: datetime

class MessageBase(BaseModel):
    content: str
    message_type: str = "text"

class MessageCreate(MessageBase):
    recipient_id: Optional[int] = None
    group_id: Optional[int] = None
    file_id: Optional[str] = None
    file_name: Optional[str] = None

class MessageResponse(BaseModel):
    id: int
    sender_id: int
    sender_name: str
    sender_avatar: Optional[str]
    recipient_id: Optional[int]
    group_id: Optional[int]
    content: str
    message_type: str
    file_id: Optional[str] = None
    file_name: Optional[str] = None
    is_delivered: bool
    is_read: bool
    delivered_at: Optional[datetime]
    read_at: Optional[datetime]
    created_at: datetime
    
    class Config:
        from_attributes = True

class RegistrationRequestCreate(BaseModel):
    username: str
    company_id: str
    email: EmailStr
    full_name: str
    password: str

class RegistrationRequestResponse(BaseModel):
    id: int
    username: str
    company_id: str
    email: str
    full_name: str
    status: str
    created_at: datetime
    reviewed_at: Optional[datetime]
    rejection_reason: Optional[str]
    
    class Config:
        from_attributes = True

class RegistrationApproval(BaseModel):
    request_id: int
    approved: bool
    rejection_reason: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class TokenData(BaseModel):
    username: Optional[str] = None

class WebSocketMessage(BaseModel):
    type: str  # message, typing, status, etc.
    data: dict

class ChatListItem(BaseModel):
    id: int
    name: str
    avatar_url: Optional[str]
    last_message: Optional[str]
    last_message_time: Optional[datetime]
    unread_count: int
    is_group: bool
    is_online: Optional[bool] = None
    last_seen: Optional[datetime] = None
