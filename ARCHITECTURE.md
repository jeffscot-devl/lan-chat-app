# LAN Chat Application Architecture

## System Overview
A secure, real-time chat application designed for local area networks with enterprise-grade features.

## Core Requirements
- **Users**: Support for exactly 100 users
- **Groups**: Support for exactly 100 groups  
- **Security**: End-to-end encryption to prevent MITM attacks
- **Network**: LAN-only operation (no internet dependency)
- **Features**: All WhatsApp functionality (last seen, online status, delivery indicators, read receipts)
- **Registration**: Admin approval system with username/company ID validation

## Technology Stack

### Backend
- **Framework**: FastAPI (Python)
- **Database**: SQLite (for local deployment)
- **Real-time**: WebSockets for instant messaging
- **Encryption**: Signal Protocol implementation
- **Authentication**: JWT tokens with admin approval workflow

### Frontend  
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS
- **Real-time**: WebSocket client
- **State Management**: React hooks + Context API
- **UI Components**: shadcn/ui components

### Security Layer
- **Encryption**: Signal Protocol for end-to-end encryption
- **Key Exchange**: X3DH (Extended Triple Diffie-Hellman)
- **Message Encryption**: Double Ratchet Algorithm
- **Transport Security**: WSS (WebSocket Secure)

## Database Schema

### Users Table
- id, username, company_id, email, password_hash
- public_key, identity_key, signed_prekey, one_time_prekeys
- last_seen, online_status, is_approved, created_at

### Groups Table  
- id, name, description, admin_id, created_at
- group_key, member_count, is_active

### Messages Table
- id, sender_id, recipient_id, group_id, encrypted_content
- message_type, timestamp, delivery_status, read_status

### Group Members Table
- group_id, user_id, role, joined_at

## API Endpoints

### Authentication
- POST /api/auth/register - User registration
- POST /api/auth/login - User login
- GET /api/auth/pending - Admin: pending approvals
- POST /api/auth/approve - Admin: approve user

### Users
- GET /api/users - Get all users
- GET /api/users/me - Get current user
- PUT /api/users/status - Update online status
- GET /api/users/{id}/keys - Get user's public keys

### Messages
- POST /api/messages - Send message
- GET /api/messages/{chat_id} - Get chat messages
- PUT /api/messages/{id}/read - Mark as read
- WebSocket /ws/{user_id} - Real-time messaging

### Groups
- POST /api/groups - Create group
- GET /api/groups - Get user's groups
- POST /api/groups/{id}/members - Add member
- DELETE /api/groups/{id}/members/{user_id} - Remove member

## Real-time Features
- **WebSocket Connections**: Persistent connections for each user
- **Online Status**: Real-time presence indicators
- **Message Delivery**: Instant delivery with status updates
- **Typing Indicators**: Show when users are typing
- **Last Seen**: Track and display last activity time

## Encryption Flow
1. **Key Generation**: Each user generates identity keys and prekeys
2. **Key Exchange**: X3DH protocol for initial key agreement
3. **Message Encryption**: Double Ratchet for forward secrecy
4. **Group Encryption**: Sender keys for efficient group messaging

## Deployment
- **Local Network**: SQLite database with file-based storage
- **Configuration**: Environment variables for network settings
- **Setup**: Docker containers for easy deployment
- **Admin Interface**: Web-based admin panel for user management
