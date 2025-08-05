import React, { useState, useEffect, useRef } from 'react';
import { Send, Phone, Video, MoreVertical, Search, Paperclip, Smile, Mic, Users, LogOut, UserPlus, Shield, Check, CheckCheck, Copy, Upload, Download, X, Menu, MessageCircle, Trash2, Archive, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

interface User {
  id: number;
  username: string;
  full_name: string;
  email: string;
  company_id: string;
  avatar_url?: string;
  is_online: boolean;
  last_seen: string;
  is_admin: boolean;
}

interface Message {
  id: number;
  sender_id: number;
  sender_name: string;
  sender_avatar?: string;
  recipient_id?: number;
  group_id?: number;
  content: string;
  message_type: string;
  file_id?: string;
  file_name?: string;
  is_delivered: boolean;
  is_read: boolean;
  delivered_at?: string;
  read_at?: string;
  created_at: string;
}

interface Chat {
  id: number;
  name: string;
  avatar_url?: string;
  last_message?: string;
  last_message_time?: string;
  unread_count: number;
  is_group: boolean;
  is_online?: boolean;
  last_seen?: string;
}

interface Group {
  id: number;
  name: string;
  description?: string;
  avatar_url?: string;
  admin_id: number;
  is_active: boolean;
  max_members: number;
  member_count: number;
  created_at: string;
}

interface RegistrationRequest {
  id: number;
  username: string;
  company_id: string;
  email: string;
  full_name: string;
  status: string;
  created_at: string;
  reviewed_at?: string;
  rejection_reason?: string;
}

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageCache, setMessageCache] = useState<{[key: string]: Message[]}>({});
  const [newMessage, setNewMessage] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [pendingRequests, setPendingRequests] = useState<RegistrationRequest[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<number>>(new Set());
  const [showLogin, setShowLogin] = useState(!token);
  const [showRegister, setShowRegister] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const login = async (username: string, password: string) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setToken(data.access_token);
        setCurrentUser(data.user);
        localStorage.setItem('token', data.access_token);
        setShowLogin(false);
        toast.success('Logged in successfully!');
        return true;
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Login failed');
        return false;
      }
    } catch (error) {
      toast.error('Network error during login');
      return false;
    }
  };

  const register = async (userData: any) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });
      
      if (response.ok) {
        toast.success('Registration request submitted! Waiting for admin approval.');
        setShowRegister(false);
        return true;
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Registration failed');
        return false;
      }
    } catch (error) {
      toast.error('Network error during registration');
      return false;
    }
  };

  const logout = () => {
    setToken(null);
    setCurrentUser(null);
    localStorage.removeItem('token');
    setShowLogin(true);
    if (ws) {
      ws.close();
      setWs(null);
    }
  };

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  };

  const loadChats = async () => {
    try {
      const response = await fetchWithAuth(`${API_URL}/api/chats`);
      if (response.ok) {
        const data = await response.json();
        setChats(data);
      }
    } catch (error) {
      console.error('Error loading chats:', error);
    }
  };

  const loadMessages = async (chatId: number, isGroup: boolean) => {
    try {
      const cacheKey = `${isGroup ? 'group' : 'user'}_${chatId}`;
      
      if (messageCache[cacheKey]) {
        setMessages(messageCache[cacheKey]);
        return;
      }

      const response = await fetchWithAuth(`${API_URL}/api/chats/${chatId}/messages?is_group=${isGroup}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
        setMessageCache(prev => ({ ...prev, [cacheKey]: data }));
      } else {
        setMessages([]);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      setMessages([]);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChat) return;

    try {
      const messageData = {
        content: newMessage,
        message_type: 'text',
        ...(selectedChat.is_group ? { group_id: selectedChat.id } : { recipient_id: selectedChat.id })
      };

      const response = await fetchWithAuth(`${API_URL}/api/messages`, {
        method: 'POST',
        body: JSON.stringify(messageData),
      });

      if (response.ok) {
        const newMsg = await response.json();
        const cacheKey = `${selectedChat.is_group ? 'group' : 'user'}_${selectedChat.id}`;
        const updatedMessages = [...messages, newMsg];
        setMessages(updatedMessages);
        setMessageCache(prev => ({ ...prev, [cacheKey]: updatedMessages }));
        setNewMessage('');
        loadChats(); // Refresh chat list
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    }
  };

  const loadUsers = async () => {
    try {
      const response = await fetchWithAuth(`${API_URL}/api/users`);
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadGroups = async () => {
    try {
      const response = await fetchWithAuth(`${API_URL}/api/groups`);
      if (response.ok) {
        const data = await response.json();
        setGroups(data);
      }
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  };

  const loadPendingRequests = async () => {
    if (!currentUser?.is_admin) return;
    
    try {
      const response = await fetchWithAuth(`${API_URL}/api/auth/pending`);
      if (response.ok) {
        const data = await response.json();
        setPendingRequests(data);
      }
    } catch (error) {
      console.error('Error loading pending requests:', error);
    }
  };

  const approveRequest = async (requestId: number, approved: boolean, reason?: string) => {
    try {
      const response = await fetchWithAuth(`${API_URL}/api/auth/approve`, {
        method: 'POST',
        body: JSON.stringify({
          request_id: requestId,
          approved,
          rejection_reason: reason
        }),
      });

      if (response.ok) {
        toast.success(`Request ${approved ? 'approved' : 'rejected'} successfully`);
        loadPendingRequests();
      }
    } catch (error) {
      console.error('Error processing request:', error);
      toast.error('Failed to process request');
    }
  };

  const createGroup = async (name: string, description: string) => {
    try {
      const response = await fetchWithAuth(`${API_URL}/api/groups`, {
        method: 'POST',
        body: JSON.stringify({ name, description }),
      });

      if (response.ok) {
        toast.success('Group created successfully!');
        setShowCreateGroup(false);
        loadGroups();
        loadChats();
      }
    } catch (error) {
      console.error('Error creating group:', error);
      toast.error('Failed to create group');
    }
  };

  const createUser = async (userData: any) => {
    try {
      const response = await fetchWithAuth(`${API_URL}/api/admin/create-user`, {
        method: 'POST',
        body: JSON.stringify(userData),
      });
      
      if (response.ok) {
        toast.success('User created successfully!');
        setShowAdminPanel(false);
        loadUsers();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to create user');
      }
    } catch (error) {
      toast.error('Network error creating user');
    }
  };
  
  const deleteUser = async (userId: number) => {
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }
    
    try {
      const response = await fetchWithAuth(`${API_URL}/api/admin/delete-user/${userId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        toast.success('User deleted successfully!');
        loadUsers();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to delete user');
      }
    } catch (error) {
      toast.error('Failed to delete user');
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Message copied to clipboard!');
    } catch (error) {
      toast.error('Failed to copy message');
    }
  };

  const uploadFile = async (file: File) => {
    if (!selectedChat) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploadProgress(0);
      setShowFileUpload(true);

      const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (response.ok) {
        const fileData = await response.json();
        
        const messageData = {
          content: `📎 ${fileData.filename}`,
          message_type: 'file',
          file_id: fileData.file_id,
          file_name: fileData.filename,
          ...(selectedChat.is_group ? { group_id: selectedChat.id } : { recipient_id: selectedChat.id })
        };

        const messageResponse = await fetchWithAuth(`${API_URL}/api/messages`, {
          method: 'POST',
          body: JSON.stringify(messageData),
        });

        if (messageResponse.ok) {
          toast.success('File uploaded successfully!');
          loadMessages(selectedChat.id, selectedChat.is_group);
        }
      } else {
        toast.error('Failed to upload file');
      }
    } catch (error) {
      toast.error('Network error uploading file');
    } finally {
      setShowFileUpload(false);
      setUploadProgress(0);
    }
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadFile(file);
    }
  };

  const insertEmoji = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const deleteMessage = async (messageId: number) => {
    try {
      const response = await fetchWithAuth(`${API_URL}/api/messages/${messageId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setMessages(prev => prev.filter(msg => msg.id !== messageId));
        const cacheKey = `${selectedChat?.is_group ? 'group' : 'user'}_${selectedChat?.id}`;
        setMessageCache(prev => ({
          ...prev,
          [cacheKey]: prev[cacheKey]?.filter(msg => msg.id !== messageId) || []
        }));
        toast.success('Message deleted');
      }
    } catch (error) {
      console.error('Error deleting message:', error);
      toast.error('Failed to delete message');
    }
  };

  const archiveChat = async (chatId: number, isGroup: boolean) => {
    try {
      const response = await fetchWithAuth(`${API_URL}/api/chats/${chatId}/archive?is_group=${isGroup}`, {
        method: 'PUT',
      });
      
      if (response.ok) {
        toast.success('Chat archived');
        loadChats();
      }
    } catch (error) {
      console.error('Error archiving chat:', error);
      toast.error('Failed to archive chat');
    }
  };

  const deleteChat = async (chatId: number, isGroup: boolean) => {
    try {
      const response = await fetchWithAuth(`${API_URL}/api/chats/${chatId}?is_group=${isGroup}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setChats(prev => prev.filter(chat => chat.id !== chatId));
        if (selectedChat?.id === chatId) {
          setSelectedChat(null);
          setMessages([]);
        }
        toast.success('Chat deleted');
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
      toast.error('Failed to delete chat');
    }
  };

  const connectWebSocket = () => {
    if (!currentUser || ws) return;

    const websocket = new WebSocket(`${WS_URL}/ws/${currentUser.id}`);
    
    websocket.onopen = () => {
      console.log('WebSocket connected');
      setWs(websocket);
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'new_message') {
        const message = data.message;
        setMessages(prev => [...prev, message]);
        loadChats(); // Refresh chat list for unread counts
      } else if (data.type === 'typing') {
        if (data.typing) {
          setTypingUsers(prev => new Set([...prev, data.user_id]));
        } else {
          setTypingUsers(prev => {
            const newSet = new Set(prev);
            newSet.delete(data.user_id);
            return newSet;
          });
        }
      } else if (data.type === 'user_status') {
        setUsers(prev => prev.map(user => 
          user.id === data.user_id 
            ? { ...user, is_online: data.status.online, last_seen: data.status.last_seen }
            : user
        ));
      }
    };

    websocket.onclose = () => {
      console.log('WebSocket disconnected');
      setWs(null);
      setTimeout(connectWebSocket, 3000);
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  };

  const handleTyping = (typing: boolean) => {
    if (!ws || !selectedChat) return;

    const message = {
      type: 'typing',
      typing,
      ...(selectedChat.is_group ? { group_id: selectedChat.id } : { recipient_id: selectedChat.id })
    };

    ws.send(JSON.stringify(message));
  };

  useEffect(() => {
    if (token && !currentUser) {
      fetchWithAuth(`${API_URL}/api/users/me`)
        .then(response => {
          if (response.ok) {
            return response.json();
          } else {
            throw new Error('Invalid token');
          }
        })
        .then(user => {
          setCurrentUser(user);
          setShowLogin(false);
        })
        .catch(() => {
          logout();
        });
    }
  }, [token]);

  useEffect(() => {
    if (currentUser) {
      loadChats();
      loadUsers();
      loadGroups();
      loadPendingRequests();
      connectWebSocket();
    }
  }, [currentUser]);

  useEffect(() => {
    if (selectedChat) {
      loadMessages(selectedChat.id, selectedChat.is_group);
    }
  }, [selectedChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showEmojiPicker && emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatLastSeen = (lastSeen: string) => {
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const getMessageStatus = (message: Message) => {
    if (message.sender_id !== currentUser?.id) return null;
    
    if (message.is_read) {
      return <CheckCheck className="w-4 h-4 text-blue-500" />;
    } else if (message.is_delivered) {
      return <CheckCheck className="w-4 h-4 text-gray-400" />;
    } else {
      return <Check className="w-4 h-4 text-gray-400" />;
    }
  };

  const LoginForm = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      await login(username, password);
      setLoading(false);
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-10 left-10 w-32 h-32 bg-white/10 rounded-full blur-xl"></div>
          <div className="absolute top-40 right-20 w-24 h-24 bg-white/5 rounded-full blur-lg"></div>
          <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-white/5 rounded-full blur-2xl"></div>
          <div className="absolute bottom-10 right-10 w-28 h-28 bg-white/10 rounded-full blur-xl"></div>
        </div>
        <Card className="w-full max-w-md relative z-10 backdrop-blur-sm bg-white/95 shadow-2xl border-0">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg transform rotate-3">
                <MessageCircle className="w-10 h-10 text-white" />
              </div>
            </div>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">Local Chat</CardTitle>
            <CardDescription className="text-gray-600 font-medium">Secure team communication</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Logging in...' : 'Login'}
              </Button>
            </form>
            <div className="mt-4 text-center">
              <Button 
                variant="link" 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('Register button clicked');
                  setShowRegister(true);
                  setShowLogin(false);
                }}
                className="text-emerald-600 hover:text-emerald-700"
              >
                Need an account? Register here
              </Button>
            </div>
            <div className="mt-2 text-xs text-gray-500 text-center">
              Default admin: admin / admin123
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const RegistrationForm = () => {
    const [formData, setFormData] = useState({
      username: '',
      company_id: '',
      email: '',
      full_name: '',
      password: ''
    });
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      await register(formData);
      setLoading(false);
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-10 left-10 w-32 h-32 bg-white/10 rounded-full blur-xl"></div>
          <div className="absolute top-40 right-20 w-24 h-24 bg-white/5 rounded-full blur-lg"></div>
          <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-white/5 rounded-full blur-2xl"></div>
          <div className="absolute bottom-10 right-10 w-28 h-28 bg-white/10 rounded-full blur-xl"></div>
        </div>
        <Card className="w-full max-w-md relative z-10 backdrop-blur-sm bg-white/95 shadow-2xl border-0">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg transform rotate-3">
                <MessageCircle className="w-10 h-10 text-white" />
              </div>
            </div>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">Register</CardTitle>
            <CardDescription className="text-gray-600 font-medium">Request access to Local Chat</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({...formData, username: e.target.value})}
                  required
                />
              </div>
              <div>
                <Label htmlFor="company_id">Company ID</Label>
                <Input
                  id="company_id"
                  type="text"
                  value={formData.company_id}
                  onChange={(e) => setFormData({...formData, company_id: e.target.value})}
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  required
                />
              </div>
              <div>
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                  required
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Submitting...' : 'Submit Registration'}
              </Button>
            </form>
            <div className="mt-4 text-center">
              <Button variant="link" onClick={() => {
                setShowRegister(false);
                setShowLogin(true);
              }}>
                Back to Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  if (showLogin) {
    return <LoginForm />;
  }

  if (showRegister) {
    return <RegistrationForm />;
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Mobile Header */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 p-4 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="text-white hover:bg-white/20 p-2"
              >
                <Menu className="w-5 h-5" />
              </Button>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                  <span className="text-sm font-bold">LC</span>
                </div>
                <h1 className="text-lg font-bold">Local Chat</h1>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className={`${isMobile ? 'fixed inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out' : 'relative'} ${
        isMobile && !sidebarOpen ? '-translate-x-full' : 'translate-x-0'
      } ${isMobile ? 'w-80' : 'w-80'} bg-white border-r border-gray-200 flex flex-col shadow-xl`}>
        {/* Header */}
        <div className={`bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 p-4 text-white shadow-lg ${isMobile ? 'mt-16' : ''}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Avatar className="ring-2 ring-white/30">
                  <AvatarImage src={currentUser?.avatar_url} />
                  <AvatarFallback className="bg-gradient-to-br from-emerald-600 to-teal-600 text-white font-bold">
                    {currentUser?.full_name?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 border-2 border-white rounded-full"></div>
              </div>
              <div>
                <h2 className="font-bold text-lg">{currentUser?.full_name}</h2>
                <p className="text-xs text-emerald-100">@{currentUser?.username}</p>
              </div>
            </div>
            {!isMobile && (
              <div className="flex space-x-1">
                {currentUser?.is_admin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAdminPanel(true)}
                    className="text-white hover:bg-white/20 transition-all duration-200 rounded-lg p-2"
                    title="Admin Panel"
                  >
                    <Shield className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddContact(true)}
                  className="text-white hover:bg-white/20 transition-all duration-200 rounded-lg p-2"
                  title="Add Contact"
                >
                  <UserPlus className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCreateGroup(true)}
                  className="text-white hover:bg-white/20 transition-all duration-200 rounded-lg p-2"
                  title="Create Group"
                >
                  <Users className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search chats..."
              className="pl-10"
            />
          </div>
        </div>

        {/* Chat List */}
        <ScrollArea className="flex-1">
          <div className="divide-y divide-gray-100">
            {chats.map((chat) => (
              <div
                key={chat.id}
                className={`group p-3 hover:bg-gray-50 cursor-pointer transition-colors relative ${
                  selectedChat?.id === chat.id ? 'bg-green-50 border-r-4 border-green-500' : ''
                }`}
              >
                <div className="flex items-center space-x-3" onClick={() => setSelectedChat(chat)}>
                  <div className="relative">
                    <Avatar>
                      <AvatarImage src={chat.avatar_url} />
                      <AvatarFallback className="bg-gray-200">
                        {chat.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    {!chat.is_group && chat.is_online && (
                      <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-gray-900 truncate">{chat.name}</h3>
                      <div className="flex items-center space-x-1">
                        {chat.unread_count > 0 && (
                          <Badge className="bg-green-500 text-white text-xs px-2 py-1 rounded-full min-w-[20px] h-5 flex items-center justify-center">
                            {chat.unread_count}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-600 truncate flex-1 mr-2">
                        {chat.last_message || 'No messages yet'}
                      </p>
                      <span className="text-xs text-gray-500 font-medium">
                        {chat.last_message_time && formatTime(chat.last_message_time)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-7 h-7 p-0 bg-white/80 hover:bg-white shadow-sm">
                        <MoreVertical className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={() => archiveChat(chat.id, chat.is_group)}>
                        <Archive className="w-4 h-4 mr-2" />
                        Archive
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => deleteChat(chat.id, chat.is_group)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        
        {/* Logout Button at Bottom */}
        <div className="p-3 border-t border-gray-200 bg-gray-50">
          <Button
            variant="outline"
            onClick={logout}
            className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 transition-all duration-200"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col ${isMobile && sidebarOpen ? 'hidden' : ''}`}>
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="bg-gradient-to-r from-green-500 to-green-600 p-4 text-white border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <Avatar>
                      <AvatarImage src={selectedChat.avatar_url} />
                      <AvatarFallback className="bg-green-700 text-white">
                        {selectedChat.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    {!selectedChat.is_group && selectedChat.is_online && (
                      <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-white"></div>
                    )}
                  </div>
                  <div>
                    <h2 className="font-semibold">{selectedChat.name}</h2>
                    <p className="text-xs text-green-100">
                      {selectedChat.is_group 
                        ? `Group • ${groups.find(g => g.id === selectedChat.id)?.member_count || 0} members`
                        : selectedChat.is_online 
                          ? 'Online' 
                          : `Last seen ${formatLastSeen(selectedChat.last_seen || '')}`
                      }
                    </p>
                    {typingUsers.size > 0 && (
                      <p className="text-xs text-green-200">
                        {Array.from(typingUsers).map(userId => 
                          users.find(u => u.id === userId)?.full_name
                        ).join(', ')} typing...
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button variant="ghost" size="sm" className="text-white hover:bg-green-600">
                    <Phone className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-white hover:bg-green-600">
                    <Video className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-white hover:bg-green-600">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4 bg-gradient-to-b from-gray-50 to-gray-100">
              <div className="space-y-4">
                {(() => {
                  const elements: React.ReactNode[] = [];
                  
                  messages.forEach((message, index) => {
                    const messageDate = new Date(message.created_at).toDateString();
                    const prevMessageDate = index > 0 ? new Date(messages[index - 1].created_at).toDateString() : null;
                    
                    if (messageDate !== prevMessageDate) {
                      elements.push(
                        <div key={`date-${messageDate}`} className="flex justify-center my-4">
                          <span className="bg-gray-200 text-gray-600 text-xs px-3 py-1 rounded-full">
                            {messageDate === new Date().toDateString() ? 'Today' : new Date(messageDate).toLocaleDateString()}
                          </span>
                        </div>
                      );
                    }
                    
                    elements.push(
                      <div
                        key={message.id}
                        className={`flex ${
                          message.sender_id === currentUser?.id ? 'justify-end' : 'justify-start'
                        }`}
                      >
                    <div className="group relative">
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl shadow-md transition-all duration-200 hover:shadow-lg ${
                          message.sender_id === currentUser?.id
                            ? 'bg-gradient-to-r from-green-500 to-green-600 text-white'
                            : 'bg-white text-gray-900 border border-gray-200'
                        }`}
                      >
                        {selectedChat.is_group && message.sender_id !== currentUser?.id && (
                          <p className="text-xs font-medium text-green-600 mb-1">
                            {message.sender_name}
                          </p>
                        )}
                        
                        {message.message_type === 'file' ? (
                          <div className="space-y-2">
                            {message.file_name && message.file_id ? (
                              <>
                                {/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(message.file_name) ? (
                                  <div className="max-w-xs">
                                    <img 
                                      src={`${import.meta.env.VITE_API_URL}/api/files/${message.file_id}`}
                                      alt={message.file_name}
                                      className="rounded-lg max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
                                      onClick={() => window.open(`${import.meta.env.VITE_API_URL}/api/files/${message.file_id}`, '_blank')}
                                    />
                                    <p className="text-xs mt-1 opacity-75">{message.file_name}</p>
                                  </div>
                                ) : /\.pdf$/i.test(message.file_name) ? (
                                  <div className="border rounded-lg p-3 bg-gray-50 max-w-sm">
                                    <div className="flex items-center space-x-2 mb-2">
                                      <FileText className="w-5 h-5 text-red-500" />
                                      <span className="text-sm font-medium">{message.file_name}</span>
                                    </div>
                                    <iframe 
                                      src={`${import.meta.env.VITE_API_URL}/api/files/${message.file_id}`}
                                      className="w-full h-32 rounded border"
                                      title={message.file_name}
                                    />
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      className="mt-2 w-full"
                                      onClick={() => window.open(`${import.meta.env.VITE_API_URL}/api/files/${message.file_id}`, '_blank')}
                                    >
                                      <Download className="w-4 h-4 mr-2" />
                                      Open PDF
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg max-w-sm cursor-pointer hover:bg-gray-100 transition-colors"
                                       onClick={() => window.open(`${import.meta.env.VITE_API_URL}/api/files/${message.file_id}`, '_blank')}>
                                    <Download className="w-4 h-4" />
                                    <div className="flex-1">
                                      <span className="text-sm font-medium">{message.file_name}</span>
                                      <p className="text-xs text-gray-500">Click to download</p>
                                    </div>
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(`${import.meta.env.VITE_API_URL}/api/files/${message.file_id}`, '_blank');
                                      }}
                                    >
                                      <Download className="w-4 h-4" />
                                    </Button>
                                  </div>
                                )}
                              </>
                            ) : message.content && (
                              <div className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg max-w-sm">
                                <Download className="w-4 h-4" />
                                <div className="flex-1">
                                  <span className="text-sm font-medium">{message.content.replace('📎 ', '')}</span>
                                  <p className="text-xs text-gray-500">Legacy file - click to download</p>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm leading-relaxed">{message.content}</p>
                        )}
                        
                        <div className="flex items-center justify-between mt-2">
                          <span className={`text-xs ${
                            message.sender_id === currentUser?.id ? 'text-green-100' : 'text-gray-500'
                          }`}>
                            {formatTime(message.created_at)}
                          </span>
                          <div className="flex items-center space-x-1">
                            {getMessageStatus(message)}
                          </div>
                        </div>
                      </div>
                      
                      <div className="absolute -top-2 -right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(message.content)}
                          className="bg-white shadow-md hover:bg-gray-50 w-8 h-8 p-0"
                        >
                          <Copy className="w-3 h-3 text-gray-600" />
                        </Button>
                        {message.sender_id === currentUser?.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteMessage(message.id)}
                            className="bg-white shadow-md hover:bg-red-50 w-8 h-8 p-0"
                          >
                            <Trash2 className="w-3 h-3 text-red-600" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                    );
                  });
                  
                  return elements;
                })()}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Message Input */}
            <div className="p-4 bg-white border-t border-gray-200">
              <div className="flex items-center space-x-3">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleFileSelect}
                  className="hover:bg-gray-100 transition-colors"
                >
                  <Paperclip className="w-5 h-5 text-gray-600" />
                </Button>
                
                <div className="flex-1 relative">
                  <Input
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value);
                      
                      if (!isTyping) {
                        setIsTyping(true);
                        handleTyping(true);
                      }
                      
                      if (typingTimeoutRef.current) {
                        clearTimeout(typingTimeoutRef.current);
                      }
                      
                      typingTimeoutRef.current = setTimeout(() => {
                        setIsTyping(false);
                        handleTyping(false);
                      }, 1000);
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        sendMessage();
                      }
                    }}
                    className="pr-20 rounded-full border-gray-300 focus:border-green-500 focus:ring-green-500"
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex space-x-1">
                    <div className="relative">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className="hover:bg-gray-100 transition-colors"
                      >
                        <Smile className="w-4 h-4 text-gray-600" />
                      </Button>
                      
                      {showEmojiPicker && (
                        <div className="emoji-picker absolute bottom-12 right-0 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50">
                          <div className="grid grid-cols-8 gap-1 w-64">
                            {['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '👍', '👎', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👋', '🤚', '🖐️', '✋', '🖖', '👏', '🙌', '🤝', '🙏', '✍️', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄', '💋'].map((emoji) => (
                              <button
                                key={emoji}
                                onClick={() => insertEmoji(emoji)}
                                className="p-1 hover:bg-gray-100 rounded text-lg transition-colors"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowEmojiPicker(false)}
                            className="absolute top-1 right-1 w-6 h-6 p-0"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    <Button variant="ghost" size="sm" className="hover:bg-gray-100 transition-colors">
                      <Mic className="w-4 h-4 text-gray-600" />
                    </Button>
                  </div>
                </div>
                
                <Button 
                  onClick={sendMessage} 
                  className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-full px-6 py-2 transition-all duration-200 shadow-md hover:shadow-lg"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                className="hidden"
                accept="*/*"
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="w-40 h-40 mx-auto mb-6 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-3xl flex items-center justify-center shadow-lg transform rotate-3">
                <div className="w-32 h-32 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg transform -rotate-3">
                  <MessageCircle className="w-16 h-16 text-white" />
                </div>
              </div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent mb-3">Welcome to Local Chat</h2>
              <p className="text-gray-600 text-lg">Select a chat to start messaging</p>
            </div>
          </div>
        )}
      </div>

      {/* Admin Panel Dialog */}
      <Dialog open={showAdminPanel} onOpenChange={setShowAdminPanel}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Admin Panel</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="requests" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="requests">Pending Requests</TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="create-user">Create User</TabsTrigger>
              <TabsTrigger value="groups">Groups</TabsTrigger>
            </TabsList>
            
            <TabsContent value="requests" className="space-y-4">
              {pendingRequests.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No pending requests</p>
              ) : (
                pendingRequests.map((request) => (
                  <Card key={request.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium">{request.full_name}</h3>
                          <p className="text-sm text-gray-600">@{request.username} • {request.company_id}</p>
                          <p className="text-sm text-gray-600">{request.email}</p>
                          <p className="text-xs text-gray-500">
                            Requested: {new Date(request.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            onClick={() => approveRequest(request.id, true)}
                            className="bg-green-500 hover:bg-green-600"
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => approveRequest(request.id, false, 'Rejected by admin')}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
            
            <TabsContent value="users" className="space-y-4">
              <div className="grid gap-4">
                {users.map((user) => (
                  <Card key={user.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-3">
                        <div className="relative">
                          <Avatar className="w-12 h-12">
                            <AvatarImage src={user.avatar_url} />
                            <AvatarFallback className="bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold">
                              {user.full_name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          {user.is_online && (
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                          )}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{user.full_name}</h3>
                          <p className="text-sm text-gray-600">@{user.username} • {user.company_id}</p>
                          <p className="text-sm text-gray-500">{user.email}</p>
                          <div className="flex items-center space-x-2 mt-2">
                            {user.is_admin && (
                              <Badge variant="secondary" className="bg-purple-100 text-purple-800">Admin</Badge>
                            )}
                            <Badge variant={user.is_online ? "default" : "secondary"} className={user.is_online ? "bg-green-100 text-green-800" : ""}>
                              {user.is_online ? 'Online' : `Last seen ${formatLastSeen(user.last_seen)}`}
                            </Badge>
                          </div>
                        </div>
                        {!user.is_admin && (
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => deleteUser(user.id)}
                            className="ml-2"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="create-user" className="space-y-4">
              <Card>
                <CardContent className="p-6">
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    createUser({
                      username: formData.get('username') as string,
                      password: formData.get('password') as string,
                      full_name: formData.get('full_name') as string,
                      email: formData.get('email') as string,
                      company_id: formData.get('company_id') as string,
                    });
                  }} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="create-username">Username</Label>
                        <Input id="create-username" name="username" required className="mt-1" />
                      </div>
                      <div>
                        <Label htmlFor="create-password">Password</Label>
                        <Input id="create-password" name="password" type="password" required className="mt-1" />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="create-full-name">Full Name</Label>
                      <Input id="create-full-name" name="full_name" required className="mt-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="create-email">Email</Label>
                        <Input id="create-email" name="email" type="email" required className="mt-1" />
                      </div>
                      <div>
                        <Label htmlFor="create-company-id">Company ID</Label>
                        <Input id="create-company-id" name="company_id" required className="mt-1" />
                      </div>
                    </div>
                    <Button type="submit" className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700">
                      Create User
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="groups" className="space-y-4">
              <div className="grid gap-4">
                {groups.map((group) => (
                  <Card key={group.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Avatar className="w-12 h-12">
                            <AvatarImage src={group.avatar_url} />
                            <AvatarFallback className="bg-gradient-to-r from-green-500 to-blue-600 text-white font-semibold">
                              {group.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h3 className="font-semibold text-gray-900">{group.name}</h3>
                            <p className="text-sm text-gray-600">{group.description}</p>
                            <p className="text-xs text-gray-500">
                              {group.member_count} members • Created {new Date(group.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <Badge variant={group.is_active ? "default" : "secondary"} className={group.is_active ? "bg-green-100 text-green-800" : ""}>
                          {group.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Create Group Dialog */}
      <Dialog open={showCreateGroup} onOpenChange={setShowCreateGroup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Group</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            createGroup(
              formData.get('name') as string,
              formData.get('description') as string
            );
          }} className="space-y-4">
            <div>
              <Label htmlFor="group-name">Group Name</Label>
              <Input id="group-name" name="name" required />
            </div>
            <div>
              <Label htmlFor="group-description">Description (optional)</Label>
              <Textarea id="group-description" name="description" />
            </div>
            <Button type="submit" className="w-full">Create Group</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Contact Dialog */}
      <Dialog open={showAddContact} onOpenChange={setShowAddContact}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Add Contact</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 max-h-96 overflow-y-auto">
              {users.filter(user => user.id !== currentUser?.id).map((user) => (
                <Card key={user.id} className="cursor-pointer hover:bg-gradient-to-r hover:from-green-50 hover:to-blue-50 transition-all duration-200 border-l-4 border-l-transparent hover:border-l-green-500" onClick={() => {
                  const existingChat = chats.find(chat => !chat.is_group && chat.id === user.id);
                  if (existingChat) {
                    setSelectedChat(existingChat);
                  } else {
                    const newChat: Chat = {
                      id: user.id,
                      name: user.full_name,
                      avatar_url: user.avatar_url,
                      unread_count: 0,
                      is_group: false,
                      is_online: user.is_online,
                      last_seen: user.last_seen
                    };
                    setChats(prev => [newChat, ...prev]);
                    setSelectedChat(newChat);
                  }
                  setShowAddContact(false);
                }}>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-4">
                      <div className="relative">
                        <Avatar className="w-12 h-12">
                          <AvatarImage src={user.avatar_url} />
                          <AvatarFallback className="bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold">
                            {user.full_name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        {user.is_online && (
                          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{user.full_name}</h3>
                        <p className="text-sm text-gray-600">@{user.username} • {user.company_id}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {user.is_online ? (
                            <span className="text-green-600 font-medium">Online</span>
                          ) : (
                            `Last seen ${formatLastSeen(user.last_seen)}`
                          )}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" className="hover:bg-green-50 hover:border-green-300">
                        Add Chat
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* File Upload Progress Dialog */}
      <Dialog open={showFileUpload} onOpenChange={setShowFileUpload}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Uploading File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Upload className="w-5 h-5 text-blue-500" />
              <span className="text-sm">Uploading your file...</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile Overlay */}
      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
