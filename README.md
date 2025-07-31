# LAN Chat Application

A comprehensive secure chat application for internal team communication on local networks.

## Features
- Support for 100 users and 100 groups
- End-to-end encryption for secure messaging
- All WhatsApp features: last seen, online status, delivery indicators, read receipts
- User registration with admin approval
- Username and company ID validation
- Real-time messaging on LAN network
- Group chat functionality
- Contact management

## Architecture
- FastAPI backend with WebSocket support
- React frontend with real-time UI
- SQLite database for local deployment
- Signal Protocol for end-to-end encryption
- Admin dashboard for user management

## Security
- End-to-end encryption prevents MITM attacks
- All messages encrypted before transmission
- No internet dependency - works purely on LAN
