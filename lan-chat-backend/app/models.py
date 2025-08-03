from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ForeignKey, Table
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime

Base = declarative_base()

group_members = Table(
    'group_members',
    Base.metadata,
    Column('group_id', Integer, ForeignKey('groups.id'), primary_key=True),
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('role', String(20), default='member'),
    Column('joined_at', DateTime, default=datetime.utcnow)
)

user_contacts = Table(
    'user_contacts',
    Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('contact_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('added_at', DateTime, default=datetime.utcnow)
)

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    company_id = Column(String(20), nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    avatar_url = Column(String(255), nullable=True)
    
    public_key = Column(Text, nullable=True)
    private_key_encrypted = Column(Text, nullable=True)
    
    is_approved = Column(Boolean, default=False)
    is_admin = Column(Boolean, default=False)
    is_online = Column(Boolean, default=False)
    last_seen = Column(DateTime, default=datetime.utcnow)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    sent_messages = relationship("Message", foreign_keys="Message.sender_id", back_populates="sender")
    groups = relationship("Group", secondary=group_members, back_populates="members")
    contacts = relationship("User", 
                          secondary=user_contacts,
                          primaryjoin=id == user_contacts.c.user_id,
                          secondaryjoin=id == user_contacts.c.contact_id,
                          back_populates="contacted_by")
    contacted_by = relationship("User",
                              secondary=user_contacts,
                              primaryjoin=id == user_contacts.c.contact_id,
                              secondaryjoin=id == user_contacts.c.user_id,
                              back_populates="contacts")

class Group(Base):
    __tablename__ = "groups"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    avatar_url = Column(String(255), nullable=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    is_active = Column(Boolean, default=True)
    max_members = Column(Integer, default=100)
    
    group_key_encrypted = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    admin = relationship("User", foreign_keys=[admin_id])
    members = relationship("User", secondary=group_members, back_populates="groups")
    messages = relationship("Message", back_populates="group")

class Message(Base):
    __tablename__ = "messages"
    
    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)
    
    encrypted_content = Column(Text, nullable=False)
    message_type = Column(String(20), default="text")  # text, image, file, etc.
    file_id = Column(String(255), nullable=True)
    file_name = Column(String(255), nullable=True)
    
    is_delivered = Column(Boolean, default=False)
    is_read = Column(Boolean, default=False)
    delivered_at = Column(DateTime, nullable=True)
    read_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    sender = relationship("User", foreign_keys=[sender_id], back_populates="sent_messages")
    recipient = relationship("User", foreign_keys=[recipient_id])
    group = relationship("Group", back_populates="messages")

class MessageStatus(Base):
    __tablename__ = "message_status"
    
    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("messages.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    is_delivered = Column(Boolean, default=False)
    is_read = Column(Boolean, default=False)
    delivered_at = Column(DateTime, nullable=True)
    read_at = Column(DateTime, nullable=True)
    
    message = relationship("Message")
    user = relationship("User")

class RegistrationRequest(Base):
    __tablename__ = "registration_requests"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), nullable=False)
    company_id = Column(String(20), nullable=False)
    email = Column(String(100), nullable=False)
    full_name = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)
    
    status = Column(String(20), default="pending")  # pending, approved, rejected
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    rejection_reason = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    reviewer = relationship("User", foreign_keys=[reviewed_by])
