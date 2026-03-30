import React, { useState, useEffect, useRef } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import './App.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'PENDING_CLIENT_ID';
const CATEGORIES = ['All', 'Academics', 'Faculty Feedback', 'Campus Life', 'Complaints', 'Confessions'];

const VoicesApp = () => {
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('Campus Life');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [loginMode, setLoginMode] = useState('login'); 
  const [loginError, setLoginError] = useState('');
  const [faculty, setFaculty] = useState([]); // Still need for 'Faculty Feedback' dropdown

  useEffect(() => {
    if (user) {
      fetchPosts();
      fetchFaculty();
    }
  }, [user]);

  const handleGoogleSignIn = async (credentialResponse) => {
    setLoading(true);
    setLoginError('');
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: credentialResponse.credential }) 
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setUser(data.user);
      } else {
        setLoginError(data.error || 'Google sign-in failed');
      }
    } catch (err) {
      setLoginError('Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try { setUser(JSON.parse(savedUser)); } catch (e) { localStorage.removeItem('user'); }
    }
  }, []);

  const logout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('authToken');
    setUser(null);
  };

  const fetchPosts = async () => {
    try {
      const res = await fetch('/api/posts');
      const data = await res.json();
      setPosts(data);
    } catch (err) { console.error(err); }
  };

  const fetchFaculty = async () => {
    try {
      const res = await fetch('/api/faculty');
      const data = await res.json();
      setFaculty(data);
    } catch (err) { console.error(err); }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const isSignup = loginMode === 'signup';
      const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...loginData, name: loginData.username, role: 'student' })
      });
      const data = await res.json();
      if (res.ok && data.user) setUser(data.user);
      else setLoginError(data.error || 'Authentication failed');
    } catch (err) { setLoginError('Server error. Please try again.'); }
  };

  const handleSubmitPost = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content, 
          category, 
          isAnonymous, 
          userId: user.name + '_id', 
          userName: user.name 
        })
      });
      if (res.ok) { setContent(''); setIsAnonymous(false); fetchPosts(); setShowWarning(false); }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleLike = async (id) => {
    await fetch(`/api/posts/${id}/like`, { method: 'POST' });
    fetchPosts();
  };

  if (!user) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>CAMPUS <span className="gradient-text">VOICES</span></h1>
          <div className="security-badge">
            <span className="encrypted-pulse"></span>
            ANONYMOUS & SECURE
          </div>
          <p className="login-subtitle" style={{ marginTop: '1rem' }}>
             Share your thoughts freely with the GVS community.
          </p>

          {loginError && <div className="login-error">⚠️ {loginError}</div>}

          <form onSubmit={handleLogin}>
            <input
              type="text"
              placeholder="Username"
              value={loginData.username}
              onChange={e => setLoginData({ ...loginData, username: e.target.value })}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={loginData.password}
              onChange={e => setLoginData({ ...loginData, password: e.target.value })}
              required
            />
            <button type="submit" className="login-btn">
               {loginMode === 'signup' ? 'JOIN THE CONVERSATION' : 'ENTER VOICES'}
            </button>
          </form>

          <div className="google-signin-section">
            <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
              <GoogleLogin
                onSuccess={handleGoogleSignIn}
                onError={() => setLoginError('Google Sign-In failed')}
                theme="filled_black"
                width="100%"
              />
            </GoogleOAuthProvider>
          </div>

          <div className="login-toggle">
            {loginMode === 'login' ? (
              <p>New here? <button onClick={() => setLoginMode('signup')}>Create Account</button></p>
            ) : (
              <p>Back to <button onClick={() => setLoginMode('login')}>Login</button></p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const filteredPosts = activeCategory === 'All' ? posts : posts.filter(p => p.category === activeCategory);

  return (
    <div className="college-app">
      <div className="cyber-grid"></div>
      <nav className="college-nav">
        <div className="nav-container">
          <div className="college-logo">CAMPUS VOICES</div>
          <div className="nav-links">
            <div className="user-chip">
              <span className="role-dot role-student"></span>
              <span style={{ fontWeight: 600 }}>{user.name}</span>
            </div>
            <button onClick={logout} className="logout-btn">Logout</button>
          </div>
        </div>
      </nav>

      <main className="main-container">
        <header className="feed-header">
          <h1>College <span className="gradient-text">Voices</span></h1>
          <p>Unfiltered campus conversation. Stay respectful, stay honest.</p>
        </header>

        <div className="create-post-card">
          {showWarning && <div className="warning-banner">⚠️ Be mindful: Anonymity is for privacy, not for harassment.</div>}
          <form onSubmit={handleSubmitPost}>
            <textarea
              placeholder="Speak your mind..."
              value={content}
              onChange={(e) => { setContent(e.target.value); if (e.target.value.length > 0) setShowWarning(true); }}
              required
            />
            <div className="post-actions">
              <div className="post-options">
                <select className="category-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <label className="anon-toggle">
                  <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
                  Post Anonymously
                </label>
              </div>
              <button type="submit" className="submit-btn" disabled={loading}>{loading ? 'Sharing...' : 'Post Voice'}</button>
            </div>
          </form>
        </div>

        <div className="category-chips">
          {CATEGORIES.map(c => (
            <div key={c} className={`chip ${activeCategory === c ? 'active' : ''}`} onClick={() => setActiveCategory(c)}>{c}</div>
          ))}
        </div>

        <div className="post-section">
          {filteredPosts.length === 0 ? <div className="no-posts">Silence in the halls... start the chat. 📢</div> : (
            filteredPosts.map(post => (
              <div key={post.id} className="post-card">
                <div className="post-header">
                  <div className="user-info">
                    <div className={`avatar ${post.isAnonymous ? 'anonymous' : ''}`}>{post.isAnonymous ? '🎭' : post.userName.charAt(0)}</div>
                    <div>
                      <div className="username">{post.userName} {post.isAnonymous && <span className="anon-tag">(Anonymous)</span>}</div>
                      <div className="post-time">{new Date(post.timestamp).toLocaleString()}</div>
                    </div>
                  </div>
                  <span className="post-category">{post.category}</span>
                </div>
                <div className="post-content">{post.content}</div>
                <div className="post-footer">
                  <div className="footer-action" onClick={() => handleLike(post.id)}>❤️ {post.likes} Likes</div>
                  <div className="footer-action">💬 {post.comments.length} Comments</div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
};

export default VoicesApp;
