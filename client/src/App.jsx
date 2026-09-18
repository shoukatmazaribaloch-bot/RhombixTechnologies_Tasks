import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { Heart, MessageCircle, Share2, Users, Bell, Search, Settings } from 'lucide-react';
import './App.css';

const API_URL = 'http://localhost:4000/api';

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Request failed');
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

const formatTime = (value) =>
  new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

function App() {
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [currentUserId, setCurrentUserId] = useState('user-ava');
  const [draft, setDraft] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [privacyLevel, setPrivacyLevel] = useState('friends');
  const [commentDrafts, setCommentDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);

  const loadData = async (userId = currentUserId) => {
    try {
      const data = await requestJson(`${API_URL}/bootstrap?userId=${userId}`);
      setUsers(data.users || []);
      setPosts(data.posts || []);
      setNotifications(data.notifications || []);
      setFriendRequests(data.friendRequests || []);
      setCurrentUserId(data.currentUserId || userId);
      const user = (data.users || []).find((entry) => entry.id === (data.currentUserId || userId));
      setPrivacyLevel(user?.privacy?.postVisibility || 'friends');
    } catch (loadError) {
      setError(loadError.message || 'Unable to load Pulse data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(currentUserId);
  }, []);

  useEffect(() => {
    const socket = io('http://localhost:4000', {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('join-user', currentUserId);
    });

    socket.on('disconnect', () => setSocketConnected(false));
    socket.on('feed-update', (payload) => {
      setUsers(payload.users || []);
      setPosts(payload.posts || []);
      setNotifications((payload.notifications || []).filter((item) => item.userId === currentUserId));
      setFriendRequests(
        (payload.friendRequests || []).filter(
          (request) => request.toUserId === currentUserId && request.status === 'pending',
        ),
      );
    });

    socket.on('notification', (payload) => {
      if (payload.userId === currentUserId) {
        setNotifications((prev) => [payload, ...prev]);
      }
    });

    return () => socket.disconnect();
  }, [currentUserId]);

  const currentUser = users.find((user) => user.id === currentUserId) || users[0];

  const visiblePosts = useMemo(() => {
    if (!currentUser) return [];

    return posts.filter((post) => {
      if (post.authorId === currentUserId) return true;
      if (post.visibility === 'public') return true;
      if (post.visibility === 'friends') return currentUser.friends?.includes(post.authorId);
      return false;
    });
  }, [posts, currentUser, currentUserId]);

  const userMap = useMemo(
    () =>
      users.reduce((acc, user) => {
        acc[user.id] = user;
        return acc;
      }, {}),
    [users],
  );

  const pendingRequests = friendRequests.filter((request) => request.toUserId === currentUserId);
  const outgoingRequests = friendRequests.filter(
    (request) => request.fromUserId === currentUserId && request.status === 'pending',
  );

  const toggleLike = async (postId) => {
    try {
      await requestJson(`${API_URL}/posts/${postId}/like`, {
        method: 'POST',
        body: JSON.stringify({ userId: currentUserId }),
      });
    } catch (likeError) {
      setError(likeError.message || 'Unable to update like status');
    }
  };

  const addComment = async (postId) => {
    const comment = (commentDrafts[postId] || '').trim();
    if (!comment) return;

    try {
      await requestJson(`${API_URL}/posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ userId: currentUserId, text: comment }),
      });
      setCommentDrafts((prev) => ({ ...prev, [postId]: '' }));
    } catch (commentError) {
      setError(commentError.message || 'Unable to post a comment');
    }
  };

  const switchUser = async (userId) => {
    setCurrentUserId(userId);
    setLoading(true);
    await loadData(userId);
  };

  const sendFriendRequest = async (targetUserId) => {
    try {
      await requestJson(`${API_URL}/friend-requests`, {
        method: 'POST',
        body: JSON.stringify({ fromUserId: currentUserId, toUserId: targetUserId }),
      });
      await loadData(currentUserId);
    } catch (friendError) {
      setError(friendError.message || 'Unable to send friend request');
    }
  };

  const acceptFriendRequest = async (requestId) => {
    try {
      await requestJson(`${API_URL}/friend-requests/${requestId}/accept`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await loadData(currentUserId);
    } catch (friendError) {
      setError(friendError.message || 'Unable to accept request');
    }
  };

  const updatePrivacy = async (value) => {
    try {
      setPrivacyLevel(value);
      await requestJson(`${API_URL}/users/${currentUserId}/privacy`, {
        method: 'PATCH',
        body: JSON.stringify({
          profileVisibility: currentUser?.privacy?.profileVisibility || 'friends',
          postVisibility: value,
        }),
      });
      await loadData(currentUserId);
    } catch (privacyError) {
      setError(privacyError.message || 'Unable to update privacy settings');
    }
  };

  const createPost = async (event) => {
    event.preventDefault();
    if (!draft.trim() && !mediaFile) return;

    try {
      const formData = new FormData();
      formData.append('authorId', currentUserId);
      formData.append('content', draft);
      formData.append('visibility', privacyLevel);
      if (mediaFile) {
        formData.append('media', mediaFile);
      }

      await fetch(`${API_URL}/posts`, {
        method: 'POST',
        body: formData,
      });

      setDraft('');
      setMediaFile(null);
      await loadData(currentUserId);
    } catch (postError) {
      setError(postError.message || 'Unable to publish this post');
    }
  };

  if (loading) {
    return <div className="loading-shell">Loading Pulse Social…</div>;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-section">
          <div className="brand-mark">
            <span>P</span>
          </div>
          <div className="brand-text">
            <h1>Pulse Social</h1>
            <p>Community Platform</p>
          </div>
        </div>

        <div className="topbar-center">
          <div className="search-bar">
            <Search size={18} />
            <input type="text" placeholder="Search people, posts..." />
          </div>
        </div>

        <div className="topbar-actions">
          <div className={`status-indicator ${socketConnected ? 'connected' : 'disconnected'}`}>
            <span className="status-dot"></span>
            <span className="status-text">{socketConnected ? 'Live' : 'Connecting'}</span>
          </div>
          <select value={currentUserId} onChange={(event) => switchUser(event.target.value)} className="user-switcher">
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <main className="layout-grid">
        <aside className="sidebar">
          <div className="profile-card">
            <div className="profile-header">
              <img src={currentUser?.avatar} alt={currentUser?.name} className="avatar avatar-xl" />
            </div>
            <h2>{currentUser?.name}</h2>
            <p className="username">@{currentUser?.username}</p>
            <p className="bio">{currentUser?.bio}</p>
            <div className="profile-stats">
              <div className="stat">
                <span className="stat-value">{currentUser?.friends?.length || 0}</span>
                <span className="stat-label">Friends</span>
              </div>
              <div className="stat">
                <span className="stat-value">{visiblePosts.length}</span>
                <span className="stat-label">Posts</span>
              </div>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="section-header">
              <Settings size={18} />
              <h3>Privacy</h3>
            </div>
            <label className="privacy-select">
              <span>Default post visibility</span>
              <select value={privacyLevel} onChange={(event) => updatePrivacy(event.target.value)}>
                <option value="public">🌍 Public</option>
                <option value="friends">👥 Friends Only</option>
                <option value="private">🔒 Private</option>
              </select>
            </label>
          </div>

          <div className="sidebar-section">
            <div className="section-header">
              <Users size={18} />
              <h3>Friend requests</h3>
              {pendingRequests.length > 0 && <span className="badge">{pendingRequests.length}</span>}
            </div>

            {pendingRequests.length === 0 ? (
              <p className="empty-state">No pending requests</p>
            ) : (
              <div className="requests-list">
                {pendingRequests.map((request) => (
                  <div key={request.id} className="request-item">
                    <img src={userMap[request.fromUserId]?.avatar} alt="" className="avatar avatar-sm" />
                    <div className="request-info">
                      <strong>{userMap[request.fromUserId]?.name}</strong>
                      <p>Wants to connect</p>
                    </div>
                    <button className="btn-accept" onClick={() => acceptFriendRequest(request.id)}>✓</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className="feed">
          <form className="composer" onSubmit={createPost}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Share a thought, update, or milestone…"
              rows={4}
            />

            <div className="composer-actions">
              <label className="upload-button">
                <input type="file" accept="image/*,video/*" onChange={(event) => setMediaFile(event.target.files?.[0] || null)} />
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <span>{mediaFile ? 'Media attached' : 'Add media'}</span>
              </label>

              <button type="submit" className="btn-primary">
                Publish post
              </button>
            </div>
          </form>

          <div className="feed-list">
            {visiblePosts.length === 0 ? (
              <div className="empty-state-card">No public updates available for this view yet.</div>
            ) : (
              visiblePosts.map((post) => {
                const author = userMap[post.authorId];
                const hadLiked = post.likes.includes(currentUserId);

                return (
                  <article key={post.id} className="post-card">
                    <div className="post-header">
                      <div className="post-author">
                        <img src={author?.avatar} alt={author?.name} className="avatar" />
                        <div>
                          <h3>{author?.name}</h3>
                          <p>{formatTime(post.createdAt)}</p>
                        </div>
                      </div>
                      <span className="visibility-badge">{post.visibility}</span>
                    </div>

                    <p className="post-content">{post.content}</p>

                    {post.media ? (
                      post.media.type === 'image' ? (
                        <img src={`http://localhost:4000${post.media.url}`} alt="Post media" className="post-media" />
                      ) : (
                        <video controls src={`http://localhost:4000${post.media.url}`} className="post-media" />
                      )
                    ) : null}

                    <div className="post-actions">
                      <button 
                        type="button" 
                        className={`action-btn like-btn ${hadLiked ? 'liked' : ''}`} 
                        onClick={() => toggleLike(post.id)}
                      >
                        <Heart size={18} fill={hadLiked ? 'currentColor' : 'none'} />
                        <span>{post.likes.length}</span>
                      </button>
                      <button type="button" className="action-btn">
                        <MessageCircle size={18} />
                        <span>{post.comments.length}</span>
                      </button>
                      <button type="button" className="action-btn">
                        <Share2 size={18} />
                      </button>
                    </div>

                    <div className="comments-box">
                      {post.comments.map((comment) => (
                        <div key={comment.id} className="comment-item">
                          <strong>{userMap[comment.authorId]?.name || 'Member'}:</strong>
                          <span>{comment.text}</span>
                        </div>
                      ))}
                    </div>

                    <div className="comment-form">
                      <input
                        value={commentDrafts[post.id] || ''}
                        onChange={(event) =>
                          setCommentDrafts((prev) => ({
                            ...prev,
                            [post.id]: event.target.value,
                          }))
                        }
                        placeholder="Write a comment"
                      />
                      <button type="button" onClick={() => addComment(post.id)}>
                        Comment
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <aside className="rightbar">
          <div className="sidebar-section">
            <div className="section-header">
              <Bell size={18} />
              <h3>Notifications</h3>
              {notifications.length > 0 && <span className="badge">{notifications.length}</span>}
            </div>
            {notifications.length === 0 ? (
              <p className="empty-state">You’re all caught up.</p>
            ) : (
              notifications.slice(0, 6).map((notification) => (
                <div key={notification.id} className="notification-item">
                  <div className="dot" />
                  <div>
                    <p>{notification.message}</p>
                    <small>{formatTime(notification.createdAt)}</small>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="sidebar-section">
            <div className="section-header">
              <h3>People to meet</h3>
            </div>
            {users
              .filter((user) => user.id !== currentUserId && !currentUser?.friends?.includes(user.id))
              .slice(0, 4)
              .map((user) => (
                <div key={user.id} className="people-card">
                  <img src={user.avatar} alt={user.name} className="avatar" />
                  <div>
                    <strong>{user.name}</strong>
                    <p>{user.status}</p>
                  </div>
                  <button type="button" onClick={() => sendFriendRequest(user.id)}>
                    {outgoingRequests.some((request) => request.toUserId === user.id) ? 'Sent' : 'Connect'}
                  </button>
                </div>
              ))}
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
