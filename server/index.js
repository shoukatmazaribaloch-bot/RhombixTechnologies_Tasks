const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 4000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const initialData = {
  users: [
    {
      id: 'user-ava',
      name: 'Ava Thompson',
      username: 'ava',
      email: 'ava@pulse.social',
      bio: 'Product designer sharing the story behind thoughtful digital experiences.',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
      location: 'Seattle, WA',
      status: 'Available to connect',
      friends: ['user-jon', 'user-mila'],
      privacy: {
        profileVisibility: 'friends',
        postVisibility: 'friends',
      },
    },
    {
      id: 'user-jon',
      name: 'Jon Lee',
      username: 'jon',
      email: 'jon@pulse.social',
      bio: 'Startup founder building communities for remote teams.',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80',
      location: 'Austin, TX',
      status: 'Shipping ideas fast',
      friends: ['user-ava'],
      privacy: {
        profileVisibility: 'friends',
        postVisibility: 'friends',
      },
    },
    {
      id: 'user-mila',
      name: 'Mila Chen',
      username: 'mila',
      email: 'mila@pulse.social',
      bio: 'Photographer and travel storyteller sharing visual stories.',
      avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=300&q=80',
      location: 'New York, NY',
      status: 'In Tokyo for a photo sprint',
      friends: ['user-ava'],
      privacy: {
        profileVisibility: 'public',
        postVisibility: 'friends',
      },
    },
    {
      id: 'user-noah',
      name: 'Noah Brooks',
      username: 'noah',
      email: 'noah@pulse.social',
      bio: 'Engineering at the intersection of AI and creative tooling.',
      avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&q=80',
      location: 'Boston, MA',
      status: 'Exploring the next deep-work loop',
      friends: [],
      privacy: {
        profileVisibility: 'public',
        postVisibility: 'public',
      },
    },
  ],
  posts: [
    {
      id: 'post-1',
      authorId: 'user-mila',
      content: 'Sunrise on the coast. A little reminder that creative momentum is often built in the quiet hours.',
      createdAt: '2026-09-10T08:10:00.000Z',
      visibility: 'friends',
      media: {
        type: 'image',
        url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
      },
      likes: ['user-ava'],
      comments: [
        {
          id: 'comment-1',
          authorId: 'user-jon',
          text: 'That light is unreal. The framing is beautiful.',
          createdAt: '2026-09-10T08:35:00.000Z',
        },
      ],
    },
    {
      id: 'post-2',
      authorId: 'user-ava',
      content: 'Designing a new workspace flow for small teams. Tiny improvements in context switching can compound into serious momentum.',
      createdAt: '2026-09-13T09:00:00.000Z',
      visibility: 'public',
      media: null,
      likes: ['user-jon', 'user-mila'],
      comments: [
        {
          id: 'comment-2',
          authorId: 'user-noah',
          text: 'Love this. The small changes really matter.',
          createdAt: '2026-09-13T09:12:00.000Z',
        },
      ],
    },
  ],
  notifications: [
    {
      id: 'notif-1',
      userId: 'user-ava',
      type: 'friend_request',
      message: 'Noah Brooks sent you a friend request.',
      read: false,
      createdAt: '2026-09-14T12:15:00.000Z',
    },
  ],
  friendRequests: [
    {
      id: 'request-1',
      fromUserId: 'user-noah',
      toUserId: 'user-ava',
      status: 'pending',
      createdAt: '2026-09-14T12:15:00.000Z',
    },
  ],
};

const safeRead = () => {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
  }

  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return raw ? JSON.parse(raw) : initialData;
  } catch (error) {
    return initialData;
  }
};

let state = safeRead();

const saveState = () => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
};

const normalizeUser = (user) => ({
  ...user,
  friends: user.friends || [],
  privacy: {
    profileVisibility: user.privacy?.profileVisibility || 'friends',
    postVisibility: user.privacy?.postVisibility || 'friends',
  },
});

state.users = (state.users || []).map(normalizeUser);
state.posts = state.posts || [];
state.notifications = state.notifications || [];
state.friendRequests = state.friendRequests || [];

const broadcast = () => {
  const payload = {
    users: state.users,
    posts: [...state.posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    notifications: [...state.notifications].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    friendRequests: [...state.friendRequests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
  };

  io.emit('feed-update', payload);
};

const createNotification = (userId, message, type = 'info') => {
  const notification = {
    id: crypto.randomUUID(),
    userId,
    type,
    message,
    read: false,
    createdAt: new Date().toISOString(),
  };

  state.notifications.unshift(notification);
  saveState();
  return notification;
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, status: 'Pulse social is live' });
});

app.get('/api/bootstrap', (req, res) => {
  const userId = req.query.userId || state.users[0]?.id;
  const user = state.users.find((entry) => entry.id === userId) || state.users[0];

  const visiblePosts = state.posts.filter((post) => {
    if (post.authorId === userId) return true;
    if (post.visibility === 'public') return true;
    if (post.visibility === 'friends') return user?.friends?.includes(post.authorId) || post.authorId === userId;
    return false;
  });

  res.json({
    currentUserId: user?.id || null,
    currentUserPrivacy: user?.privacy?.profileVisibility || 'friends',
    users: state.users,
    posts: visiblePosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    notifications: state.notifications.filter((item) => item.userId === userId).slice(0, 12),
    friendRequests: state.friendRequests.filter((request) => request.toUserId === userId && request.status === 'pending'),
  });
});

app.get('/api/users', (_req, res) => {
  res.json({ users: state.users });
});

app.post('/api/users', (req, res) => {
  const { name, username, email, bio = '', location = '', status = 'New to Pulse' } = req.body;

  if (!name || !username || !email) {
    return res.status(400).json({ message: 'Name, username and email are required.' });
  }

  const user = {
    id: `user-${crypto.randomUUID().slice(0, 8)}`,
    name,
    username,
    email,
    bio,
    location,
    status,
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80',
    friends: [],
    privacy: {
      profileVisibility: 'friends',
      postVisibility: 'friends',
    },
  };

  state.users.push(user);
  saveState();
  broadcast();

  res.status(201).json({ user });
});

app.patch('/api/users/:id/privacy', (req, res) => {
  const { id } = req.params;
  const { profileVisibility = 'friends', postVisibility = 'friends' } = req.body;

  const user = state.users.find((entry) => entry.id === id);
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  user.privacy = {
    profileVisibility,
    postVisibility,
  };

  saveState();
  broadcast();

  res.json({ user });
});

app.post('/api/posts', upload.single('media'), (req, res) => {
  const { authorId, content, visibility = 'friends' } = req.body;

  if (!authorId || !content.trim()) {
    return res.status(400).json({ message: 'Author and content are required.' });
  }

  const media = req.file
    ? {
        type: req.file.mimetype.startsWith('video/') ? 'video' : 'image',
        url: `/uploads/${req.file.filename}`,
      }
    : null;

  const post = {
    id: `post-${crypto.randomUUID().slice(0, 8)}`,
    authorId,
    content: content.trim(),
    createdAt: new Date().toISOString(),
    visibility,
    media,
    likes: [],
    comments: [],
  };

  state.posts.unshift(post);
  saveState();
  createNotification(authorId, 'Your post is live.', 'post');
  broadcast();

  io.emit('post-created', post);
  res.status(201).json({ post });
});

app.post('/api/posts/:id/comments', (req, res) => {
  const { id } = req.params;
  const { userId, text } = req.body;

  if (!userId || !text || !text.trim()) {
    return res.status(400).json({ message: 'User and comment text are required.' });
  }

  const post = state.posts.find((entry) => entry.id === id);
  if (!post) {
    return res.status(404).json({ message: 'Post not found.' });
  }

  const comment = {
    id: `comment-${crypto.randomUUID().slice(0, 8)}`,
    authorId: userId,
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };

  post.comments.push(comment);

  const author = state.users.find((user) => user.id === post.authorId);
  if (author && author.id !== userId) {
    createNotification(post.authorId, `${state.users.find((u) => u.id === userId)?.name || 'Someone'} commented on your post.`, 'comment');
  }

  saveState();
  broadcast();

  res.status(201).json({ comment, post });
});

app.post('/api/posts/:id/like', (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'User identifier is required.' });
  }

  const post = state.posts.find((entry) => entry.id === id);
  if (!post) {
    return res.status(404).json({ message: 'Post not found.' });
  }

  if (post.likes.includes(userId)) {
    post.likes = post.likes.filter((likeId) => likeId !== userId);
  } else {
    post.likes.push(userId);
    const author = state.users.find((user) => user.id === post.authorId);
    const actor = state.users.find((user) => user.id === userId);
    if (author && author.id !== userId) {
      createNotification(post.authorId, `${actor?.name || 'Someone'} liked your post.`, 'like');
    }
  }

  saveState();
  broadcast();

  res.json({ post });
});

app.get('/api/notifications/:userId', (req, res) => {
  const { userId } = req.params;
  res.json({
    notifications: state.notifications.filter((item) => item.userId === userId).slice(0, 12),
  });
});

app.post('/api/friend-requests', (req, res) => {
  const { fromUserId, toUserId } = req.body;

  if (!fromUserId || !toUserId) {
    return res.status(400).json({ message: 'Sender and recipient are required.' });
  }

  const existing = state.friendRequests.find(
    (request) =>
      request.fromUserId === fromUserId && request.toUserId === toUserId && request.status === 'pending',
  );

  if (existing) {
    return res.status(409).json({ message: 'A request is already pending.' });
  }

  const request = {
    id: `request-${crypto.randomUUID().slice(0, 8)}`,
    fromUserId,
    toUserId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  state.friendRequests.push(request);
  const sender = state.users.find((user) => user.id === fromUserId);
  createNotification(toUserId, `${sender?.name || 'Someone'} sent you a friend request.`, 'friend_request');
  saveState();
  broadcast();

  res.status(201).json({ request });
});

app.post('/api/friend-requests/:id/accept', (req, res) => {
  const { id } = req.params;
  const request = state.friendRequests.find((entry) => entry.id === id && entry.status === 'pending');

  if (!request) {
    return res.status(404).json({ message: 'Friend request not found.' });
  }

  request.status = 'accepted';

  const fromUser = state.users.find((user) => user.id === request.fromUserId);
  const toUser = state.users.find((user) => user.id === request.toUserId);

  if (fromUser && !fromUser.friends.includes(request.toUserId)) {
    fromUser.friends.push(request.toUserId);
  }

  if (toUser && !toUser.friends.includes(request.fromUserId)) {
    toUser.friends.push(request.fromUserId);
  }

  createNotification(request.fromUserId, `${toUser?.name || 'A friend'} accepted your request.`, 'friend_request');
  saveState();
  broadcast();

  res.json({ request, users: state.users });
});

io.on('connection', (socket) => {
  socket.on('join-user', (userId) => {
    if (userId) {
      socket.join(userId);
      socket.emit('connected', { userId, socketId: socket.id });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Pulse social API running on http://localhost:${PORT}`);
});
