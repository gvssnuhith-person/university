import React, { useState, useEffect, useRef } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import './App.css';

// Load Google Client ID from environment variables
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'PENDING_CLIENT_ID';

const CATEGORIES = ['All', 'Academics', 'Faculty Feedback', 'Campus Life', 'Complaints', 'Confessions'];

const App = () => {
  const getRoleDisplayName = (role) => {
    switch (role?.toLowerCase()) {
      case 'admin': return 'Management';
      case 'hod': return 'Coordinator';
      case 'faculty': return 'Staff';
      case 'cr': return 'Representative';
      case 'student': return 'Student';
      default: return role || 'Guest';
    }
  };

  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('voices');
  const [posts, setPosts] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('Campus Life');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [loginMode, setLoginMode] = useState('login'); // 'login' | 'signup'
  const [loginError, setLoginError] = useState('');
  const [showGoogleMails, setShowGoogleMails] = useState(false);
  const [targetedFacultyId, setTargetedFacultyId] = useState('');
  const [newFaculty, setNewFaculty] = useState({ name: '', dept: '', bio: '', icon: '👨‍🏫' });
  const [notifForm, setNotifForm] = useState({ title: '', content: '' });
  const [notifFile, setNotifFile] = useState(null); // { fileName, fileType, fileData }
  const [adminRoles, setAdminRoles] = useState({});
  const [pendingUsers, setPendingUsers] = useState({});
  const [promoteForm, setPromoteForm] = useState({ name: '', password: '' });
  const [staffForm, setStaffForm] = useState({ username: '', name: '', password: '', confirmPassword: '', role: 'faculty' });
  const [stats, setStats] = useState({ totalStudents: 0, totalFaculty: 0, totalHODs: 0, posts: 0 });
  const [userList, setUserList] = useState([]);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [students, setStudents] = useState([]);
  const [attForm, setAttForm] = useState({ studentName: '', status: 'Present', date: new Date().toISOString().split('T')[0] });
  const googleBtnRef = useRef(null);

  useEffect(() => {
    if (user) {
      fetchPosts();
      fetchFaculty();
      fetchNotifications();
      fetchAttendance();
      if (user.role === 'hod' || user.role === 'faculty') {
        fetchStudents();
      }
      if (user.role === 'hod' || user.role === 'admin') {
        fetchRoles();
        fetchPending();
        fetchStats();
      }
    }
  }, [user]);

  // Full Google OAuth 2.0 Flow with Account Selection
  const triggerGoogleAuth = () => {
    if (GOOGLE_CLIENT_ID === 'PENDING_CLIENT_ID') {
      setShowGoogleMails(true);
      return;
    }

    if (!window.google) {
      setLoginError('Google services not available. Please refresh.');
      return;
    }

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'openid email profile',
      prompt: 'select_account', // Ensures account selection
      callback: async (response) => {
        if (response.access_token) {
          handleGoogleSignIn(response.access_token);
        }
      },
    });
    client.requestAccessToken();
  };

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
        // Save auth data for persistence
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

  // Check for existing session on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('user');
      }
    }
  }, []);

  const logout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('authToken');
    setUser(null);
  };

  const fetchRoles = async () => {
    try {
      const res = await fetch('/api/admin/roles');
      const data = await res.json();
      setAdminRoles(data);
    } catch (err) { console.error('Error fetching roles', err); }
  };

  const fetchPending = async () => {
    try {
      const res = await fetch('/api/admin/pending');
      const data = await res.json();
      setPendingUsers(data);
    } catch (err) { console.error('Error fetching pending', err); }
  };

  const fetchAttendance = async () => {
    try {
      const res = await fetch(`/api/attendance?username=${user.name}&role=${user.role}`);
      const data = await res.json();
      setAttendanceLogs(data);
    } catch (err) { console.error('Error fetching attendance', err); }
  };

  const fetchStudents = async () => {
    try {
      const res = await fetch('/api/students');
      const data = await res.json();
      setStudents(data);
    } catch (err) { console.error('Error fetching students', err); }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      setStats(data);
    } catch (err) { console.error('Error fetching stats', err); }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      setUserList(data);
    } catch (err) { console.error('Error fetching users', err); }
  };

  const removeUser = async (role, idOrUsername) => {
    if (!window.confirm(`Are you sure you want to remove this ${role}?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${role}/${idOrUsername}`, { method: 'DELETE' });
      if (res.ok) {
        fetchUsers();
        fetchStats();
      }
    } catch (err) { console.error('Remove user failed', err); }
  };

  useEffect(() => {
    if (user && (user.role === 'admin' || user.role === 'hod')) {
      fetchStats();
      fetchUsers();
    }
  }, [user]);

  const handleAddStaff = async (e) => {
    e.preventDefault();
    if (staffForm.password !== staffForm.confirmPassword) {
      alert('Passwords do not match');
      return;
    }
    try {
      const res = await fetch('/api/admin/add-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staffForm)
      });
      if (res.ok) {
        alert(`${staffForm.role.toUpperCase()} added!`);
        setStaffForm({ username: '', password: '', name: '', role: 'faculty' });
        fetchStats();
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (err) { console.error('Error adding staff', err); }
  };

  const handleMarkAttendance = async (e) => {
    e.preventDefault();
    if (!attForm.studentName || !attForm.status || !attForm.date) return;
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...attForm, markedBy: user.name })
      });
      if (res.ok) {
        setAttForm({ ...attForm, studentName: '' });
        fetchAttendance();
      }
    } catch (err) { console.error('Error marking attendance', err); }
  };

  const deleteAttendance = async (id) => {
    if (window.confirm('Delete this attendance record?')) {
      await fetch(`/api/attendance/${id}`, { method: 'DELETE' });
      fetchAttendance();
    }
  };

  const deleteNotification = async (id) => {
    if (window.confirm('Delete this notification?')) {
      await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
      fetchNotifications();
    }
  };

  const deleteFaculty = async (id) => {
    if (window.confirm('Are you sure you want to remove this faculty member?')) {
      await fetch(`/api/faculty/${id}`, { method: 'DELETE' });
      fetchFaculty();
    }
  };

  const deleteStudent = async (username) => {
    if (window.confirm(`Are you sure you want to delete account: ${username}?`)) {
      await fetch(`/api/students/${username}`, { method: 'DELETE' });
      fetchStudents();
    }
  };

  const handlePromote = async (e) => {
    e.preventDefault();
    if (!promoteForm.name || !promoteForm.password) return;
    try {
      const res = await fetch('/api/admin/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: promoteForm.name, role: 'cr', password: promoteForm.password })
      });
      if (res.ok) { setPromoteForm({ name: '', password: '' }); fetchRoles(); }
    } catch (err) { console.error('Promote failed', err); }
  };

  const handleDemote = async (username) => {
    try {
      const res = await fetch(`/api/admin/demote/${username}`, { method: 'DELETE' });
      if (res.ok) fetchRoles();
    } catch (err) { console.error('Demote failed', err); }
  };

  const handleApprove = async (username, role) => {
    try {
      const res = await fetch('/api/admin/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, role })
      });
      if (res.ok) {
        fetchPending();
        fetchFaculty(); // refresh faculty list if a new faculty was approved
      }
    } catch (err) { console.error('Approval failed', err); }
  };

  const handleUpdateAttendance = async (e) => {
    e.preventDefault();
    if (!attForm.username) return;
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attForm)
      });
      if (res.ok) {
        setAttForm({ username: '', weekly: '', monthly: '' });
        fetchAttendance();
      }
    } catch (err) { console.error('Failed to update attendance', err); }
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

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      const data = await res.json();
      setNotifications(data);
    } catch (err) { console.error(err); }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const isSignup = loginMode === 'signup' || loginMode === 'facultySignup' || loginMode === 'hodSignup';
      
      if (isSignup && loginData.password !== loginData.confirmPassword) {
        setLoginError('Passwords do not match');
        return;
      }

      const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...loginData, 
          name: loginData.username,
          role: loginMode === 'facultySignup' ? 'faculty' : (loginMode === 'hodSignup' ? 'hod' : (loginMode === 'signup' ? 'student' : undefined))
        })
      });
      const data = await res.json();
      if (res.ok && data.user) setUser(data.user);
      else if (res.status === 202) setLoginError(data.message); // Pending approval message
      else setLoginError(data.error || 'Authentication failed');
    } catch (err) { setLoginError('Server error. Please try again.'); }
  };

  const handleGoogleDemoLogin = async (email, name, role) => {
    try {
      const res = await fetch('/api/auth/google-demo', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, role })
      });
      const data = await res.json();
      if (res.ok) setUser(data.user);
      else setLoginError(data.error || 'Pending HOD approval');
    } catch (err) { setLoginError('Google Demo failed'); }
    setShowGoogleMails(false);
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
          userName: user.name,
          targetedFacultyId: category === 'Faculty Feedback' ? targetedFacultyId : null
        })
      });
      if (res.ok) { setContent(''); setIsAnonymous(false); setTargetedFacultyId(''); fetchPosts(); setShowWarning(false); }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleAddFaculty = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/faculty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newFaculty)
      });
      if (res.ok) { setNewFaculty({ name: '', dept: '', bio: '', icon: '👨‍🏫' }); fetchFaculty(); }
    } catch (err) { console.error(err); }
  };

  // Read selected file as base64
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) { setNotifFile(null); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setNotifFile({
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileData: reader.result // base64 data URL
      });
    };
    reader.readAsDataURL(file);
  };

  const handlePostNotif = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...notifForm,
          sender: user.name,
          role: user.role,
          attachment: notifFile || null
        })
      });
      if (res.ok) {
        setNotifForm({ title: '', content: '' });
        setNotifFile(null);
        fetchNotifications();
      }
    } catch (err) { console.error(err); }
  };

  const handleLike = async (id) => {
    await fetch(`/api/posts/${id}/like`, { method: 'POST' });
    fetchPosts();
  };

  const deletePost = async (id) => {
    if (window.confirm('Delete this post?')) {
      await fetch(`/api/admin/posts/${id}`, { method: 'DELETE' });
      fetchPosts();
    }
  };

  const downloadAttachment = (attachment) => {
    const a = document.createElement('a');
    a.href = attachment.fileData;
    a.download = attachment.fileName;
    a.click();
  };

  const getFileIcon = (fileType) => {
    if (!fileType) return '📎';
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType === 'application/pdf') return '📄';
    if (fileType.includes('word')) return '📝';
    if (fileType.includes('excel') || fileType.includes('sheet')) return '📊';
    if (fileType.includes('zip') || fileType.includes('rar')) return '🗜️';
    return '📎';
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // ─── LOGIN PAGE ──────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>RISE <span className="gradient-text">GVS PORTAL</span></h1>
          <div className="security-badge">
            <span className="encrypted-pulse"></span>
            AES-256 BIT ENCRYPTED SESSION
          </div>
          <p className="login-subtitle" style={{ marginTop: '1rem' }}>
             {loginMode === 'signup' ? 'Secure Student Enrollment' : 
             loginMode === 'facultySignup' ? 'Staff Credentialing' : 
             loginMode === 'hodSignup' ? 'Coordinator Authorization' : 
             'Cybersecurity-First Academic Portal'}
          </p>

          {loginError && <div className="login-error">⚠️ {loginError}</div>}

          <form onSubmit={handleLogin}>
            <input
              type="text"
              placeholder={
                 loginMode === 'signup' ? 'Enter student username' : 
                 loginMode === 'facultySignup' ? 'Enter staff username' : 
                 loginMode === 'hodSignup' ? 'Enter coordinator username' : 
                 'Username'
              }
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
            {(loginMode === 'signup' || loginMode === 'facultySignup' || loginMode === 'hodSignup') && (
              <input
                type="password"
                placeholder="Confirm Password"
                value={loginData.confirmPassword}
                onChange={e => setLoginData({ ...loginData, confirmPassword: e.target.value })}
                required
              />
            )}
            {loginMode === 'facultySignup' && (
              <>
                <input
                  type="text"
                  placeholder="Department (e.g. CSE, ECE)"
                  value={loginData.dept}
                  onChange={e => setLoginData({ ...loginData, dept: e.target.value })}
                  required
                />
                <textarea
                  placeholder="Short Professional Bio"
                  value={loginData.bio}
                  onChange={e => setLoginData({ ...loginData, bio: e.target.value })}
                  required
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', color: 'white', marginBottom: '1rem' }}
                />
              </>
            )}
                  <button type="submit" className="login-btn">
               {loginMode === 'signup' ? 'CREATE SECURE ACCOUNT' : 
                loginMode === 'facultySignup' ? 'REGISTER STAFF' : 
                loginMode === 'hodSignup' ? 'AUTHORIZE COORDINATOR' : 
                'VERIFY & ACCESS'}
             </button>
          </form>

          {loginMode === 'login' && (
            <div className="student-tip" style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '8px' }}>
              <strong>Student Tip:</strong> To join, just enter your <strong>Full Name</strong> as your Username and choose a password. You'll be logged in instantly!
            </div>
          )}

          <div className="google-signin-section">
            <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
              <div className="google-signin-container">
                {GOOGLE_CLIENT_ID === 'PENDING_CLIENT_ID' ? (
                  <div className="google-oauth-error" style={{ textAlign: 'center', color: '#ffb3b3', background: 'rgba(255, 0, 0, 0.1)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(255, 0, 0, 0.3)' }}>
                    <strong style={{ display: 'block', marginBottom: '8px' }}>⚠️ Google Authentication Required</strong>
                    <p style={{ fontSize: '0.85rem' }}>The fully upgraded app requires a real Google Client ID.</p>
                    <p style={{ fontSize: '0.75rem', marginTop: '8px', opacity: 0.8 }}>Add <code>VITE_GOOGLE_CLIENT_ID</code> to Vercel Environment Variables.</p>
                  </div>
                ) : (
                  <GoogleLogin
                    onSuccess={handleGoogleSignIn}
                    onError={() => setLoginError('Google Sign-In failed')}
                    text="signin_with"
                    shape="rectangular"
                    theme="filled_black"
                    width="100%"
                  />
                )}
                {loading && <p className="loading">Processing...</p>}
              </div>
            </GoogleOAuthProvider>
          </div>

          <div className="login-toggle">
            {loginMode === 'login' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                 <p>New student? <button onClick={() => { setLoginMode('signup'); setLoginError(''); }}>Sign up</button></p>
                 <p>New staff? <button onClick={() => { setLoginMode('facultySignup'); setLoginError(''); }}>Sign up</button></p>
                 <p>New coordinator? <button onClick={() => { setLoginMode('hodSignup'); setLoginError(''); }}>Sign up</button></p>
              </div>
            ) : (
              <p>Already have an account? <button onClick={() => { setLoginMode('login'); setLoginError(''); }}>Login</button></p>
            )}
          </div>

          {/* Credentials removed from public view - admin has access */}

          {/* Removed Demo Modal per user request for fully upgraded app */}
        </div>
      </div>
    );
  }

  const filteredPosts = activeCategory === 'All' ? posts : posts.filter(p => p.category === activeCategory);
  const canPostNotif = user.role === 'hod' || user.role === 'faculty' || user.role === 'cr';

  // ─── MAIN APP ────────────────────────────────────────────────────
  return (
    <div className="college-app">
      <div className="cyber-grid"></div>
      <nav className="college-nav">
        <div className="nav-container">
          <div className="college-logo" onClick={() => setActiveTab('voices')}>RISE GVS UNIVERSITY</div>
          <div className="nav-links">
            <button className={activeTab === 'voices' ? 'active' : ''} onClick={() => setActiveTab('voices')}>Voices</button>
            <button className={activeTab === 'faculty' ? 'active' : ''} onClick={() => setActiveTab('faculty')}>Faculty</button>
            <button className={activeTab === 'notifications' ? 'active' : ''} onClick={() => setActiveTab('notifications')}>Notifications</button>
            <button className={activeTab === 'attendance' ? 'active' : ''} onClick={() => setActiveTab('attendance')}>Attendance</button>
            {(user.role === 'hod' || user.role === 'admin') && <button className={activeTab === 'admin' ? 'active' : ''} onClick={() => setActiveTab('admin')}>{getRoleDisplayName(user.role)} Portal</button>}
            <div className="user-chip">
              <span className={`role-dot role-${user.role}`}></span>
               <span style={{ fontWeight: 600 }}>{user.name}</span>
               <small style={{ opacity: 0.6, marginLeft: '0.4rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                 {getRoleDisplayName(user.role)}
               </small>
               <div className="security-badge" style={{ marginLeft: '1rem', border: 'none', background: 'transparent' }}>
                 <span className="encrypted-pulse"></span>
                 <span style={{ fontSize: '0.6rem' }}>ENCRYPTED</span>
               </div>
            </div>
            <button onClick={logout} className="logout-btn">Logout</button>
          </div>
        </div>
      </nav>

      <main className="main-container">
        {/* Security Insights (Admin/HOD Only) */}
        {(user.role === 'hod' || user.role === 'admin') && (
          <div className="security-status">
            <h4><span className="encrypted-pulse"></span> SYSTEM SECURITY PROTOCOLS ACTIVE</h4>
            <div className="security-line">&gt; AES-256-GCM DATA ENCRYPTION: ENABLED</div>
            <div className="security-line">&gt; PASSWORD HASHING: SCRYPT-64-16-1 (SECURE)</div>
            <div className="security-line">&gt; SESSION INTEGRITY: HS256 JWT SIGNED</div>
            <div className="security-line">&gt; SYSTEM PERSISTENCE: ENCRYPTED JSON STORE</div>
          </div>
        )}

        {/* ─── VOICES TAB ─── */}
        {activeTab === 'voices' && (
          <>
            <header className="feed-header">
              <h1>Campus <span className="gradient-text">Voices</span></h1>
              <p>The heartbeat of GVS. Speak your truth, {user.name}.</p>
            </header>

            <div className="create-post-card">
              {showWarning && <div className="warning-banner">⚠️ Please follow guidelines. Anonymous posts are tracked for accountability.</div>}
              <form onSubmit={handleSubmitPost}>
                <textarea
                  placeholder="What's on your mind?..."
                  value={content}
                  onChange={(e) => { setContent(e.target.value); if (e.target.value.length > 0) setShowWarning(true); }}
                  required
                />
                <div className="post-actions">
                  <div className="post-options">
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                      <select className="category-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                        {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      {category === 'Faculty Feedback' && (
                        <select className="category-select" value={targetedFacultyId} onChange={(e) => setTargetedFacultyId(e.target.value)} required style={{ borderColor: 'var(--college-accent)' }}>
                          <option value="">Select Faculty...</option>
                          {faculty.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                      )}
                    </div>
                    <label className="anon-toggle">
                      <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
                      Post Anonymously
                    </label>
                  </div>
                  <button type="submit" className="submit-btn" disabled={loading || (category === 'Faculty Feedback' && !targetedFacultyId)}>{loading ? 'Posting...' : 'Share Voice'}</button>
                </div>
              </form>
            </div>

            <div className="category-chips">
              {CATEGORIES.map(c => (
                <div key={c} className={`chip ${activeCategory === c ? 'active' : ''}`} onClick={() => setActiveCategory(c)}>{c}</div>
              ))}
            </div>

            <div className="post-section">
              {filteredPosts.length === 0 ? <div className="no-posts">The air is silent... be the first to speak. 📢</div> : (
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
                      {user.role === 'hod' && <div className="footer-action delete-text" onClick={() => deletePost(post.id)}>🗑️ Delete</div>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* ─── FACULTY TAB ─── */}
        {activeTab === 'faculty' && (
          <div className="faculty-section">
            <header className="feed-header">
              <h1>University <span className="gradient-text">Faculty</span></h1>
              <p>Connect with our expert educators and researchers.</p>
            </header>

            {user.role === 'hod' && (
              <div className="admin-form-card">
                 <h3>Add New Staff</h3>
                <form onSubmit={handleAddFaculty}>
                  <div className="form-row">
                    <input placeholder="Name" value={newFaculty.name} onChange={e => setNewFaculty({ ...newFaculty, name: e.target.value })} required />
                    <input placeholder="Department" value={newFaculty.dept} onChange={e => setNewFaculty({ ...newFaculty, dept: e.target.value })} required />
                  </div>
                  <textarea placeholder="Biography" value={newFaculty.bio} onChange={e => setNewFaculty({ ...newFaculty, bio: e.target.value })} />
                  <div className="form-row">
                    <select value={newFaculty.icon} onChange={e => setNewFaculty({ ...newFaculty, icon: e.target.value })}>
                      <option value="👨‍🏫">👨‍🏫 Male Prof</option>
                      <option value="👩‍🏫">👩‍🏫 Female Prof</option>
                      <option value="🧑‍🔬">🧑‍🔬 Scientist</option>
                      <option value="🎨">🎨 Creative</option>
                    </select>
                     <button type="submit" className="submit-btn">Register Staff</button>
                  </div>
                </form>
              </div>
            )}

            <div className="faculty-grid">
                <div key={f.id} className="faculty-card" style={{ position: 'relative' }}>
                  {user.role === 'hod' && (
                    <button 
                      onClick={() => deleteFaculty(f.id)} 
                      style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(255, 0, 0, 0.1)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', color: '#ff4d4d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Remove Faculty"
                    >
                      🗑️
                    </button>
                  )}
                  <div className="fac-icon">{f.icon}</div>
                  <h3>{f.name}</h3>
                  <div className="fac-dept">{f.dept}</div>
                  <p className="fac-bio">{f.bio}</p>
                </div>
            </div>
          </div>
        )}

        {/* ─── NOTIFICATIONS TAB ─── */}
        {activeTab === 'notifications' && (
          <div className="notifications-section">
            <header className="feed-header">
              <h1>Class <span className="gradient-text">Notifications</span></h1>
              <p>Official updates and files from your department.</p>
            </header>

            {canPostNotif && (
              <div className="admin-form-card">
                <h3>Post Official Notification</h3>
                <form onSubmit={handlePostNotif}>
                  <input
                    placeholder="Subject / Title"
                    value={notifForm.title}
                    onChange={e => setNotifForm({ ...notifForm, title: e.target.value })}
                    required
                    className="notif-title-input"
                    style={{ width: '100%', marginBottom: '0.75rem' }}
                  />
                  <textarea
                    placeholder="Content / Announcement..."
                    value={notifForm.content}
                    onChange={e => setNotifForm({ ...notifForm, content: e.target.value })}
                    required
                  />

                  {/* File Upload */}
                  <div className="file-upload-area">
                    <label className="file-upload-label" htmlFor="notif-file">
                      <span className="file-upload-icon">📎</span>
                      <span>{notifFile ? notifFile.fileName : 'Attach a file (PDF, image, doc…)'}</span>
                    </label>
                    <input
                      id="notif-file"
                      type="file"
                      accept="*/*"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                    />
                    {notifFile && (
                      <div className="file-preview">
                        <span>{getFileIcon(notifFile.fileType)} {notifFile.fileName}</span>
                        <span className="file-size">{formatFileSize(notifFile.fileSize)}</span>
                        <button type="button" className="remove-file-btn" onClick={() => setNotifFile(null)}>✕</button>
                      </div>
                    )}
                  </div>

                  <button type="submit" className="submit-btn" style={{ background: 'var(--college-secondary)', width: '100%' }}>
                    📣 Broadcast Message
                  </button>
                </form>
              </div>
            )}

            {!canPostNotif && (
              <div className="info-banner">👁️ You can view notifications. Only HOD, Faculty, and CRs can post.</div>
            )}

            <div className="notif-list">
              {notifications.length === 0 ? <div className="no-posts">The notice board is empty. 📝</div> : (
                notifications.map(n => (
                  <div key={n.id} className={`notif-card role-${n.role}`}>
                    <div className="notif-header">
                      <div className="notif-badge">{n.role?.toUpperCase()}</div>
                      {user.role === 'hod' && (
                        <button onClick={() => deleteNotification(n.id)} className="delete-btn-tiny" style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>🗑️</button>
                      )}
                    </div>
                    <h3>{n.title}</h3>
                    <p className="notif-content">{n.content}</p>

                    {/* Attachment */}
                    {n.attachment && (
                      <div className="attachment-chip" onClick={() => downloadAttachment(n.attachment)}>
                        <span>{getFileIcon(n.attachment.fileType)}</span>
                        <span>{n.attachment.fileName}</span>
                        <span className="file-size">{formatFileSize(n.attachment.fileSize)}</span>
                        <span className="download-label">⬇ Download</span>
                      </div>
                    )}

                    <div className="notif-footer">
                      <span>By {n.sender}</span>
                      <span>{new Date(n.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ─── ATTENDANCE TAB ─── */}
        {activeTab === 'attendance' && (
          <div className="attendance-section">
            <header className="feed-header">
              <h1>Student <span className="gradient-text">Attendance</span></h1>
              <p>Granular attendance tracking for RISE KRISHNA SAI GANDHI.</p>
            </header>

            {(user.role === 'hod' || user.role === 'faculty') && (
              <div className="admin-form-card" style={{ marginBottom: '2rem' }}>
                <h3>Mark Student Attendance</h3>
                <form onSubmit={handleMarkAttendance}>
                  <div className="form-row">
                    <select 
                      value={attForm.studentName} 
                      onChange={e => setAttForm({...attForm, studentName: e.target.value})} 
                      required 
                      className="category-select"
                      style={{ flex: 2 }}
                    >
                      <option value="">Select Student...</option>
                      {students.map(s => <option key={s.username} value={s.username}>{s.name} ({s.username})</option>)}
                    </select>
                    <select 
                      value={attForm.status} 
                      onChange={e => setAttForm({...attForm, status: e.target.value})} 
                      className="category-select"
                    >
                      <option value="Present">✅ Present</option>
                      <option value="Absent">❌ Absent</option>
                    </select>
                    <input 
                      type="date" 
                      value={attForm.date} 
                      onChange={e => setAttForm({...attForm, date: e.target.value})} 
                      required 
                      className="category-select"
                    />
                    <button type="submit" className="submit-btn">Mark Attendance</button>
                  </div>
                </form>
              </div>
            )}

            <div className="attendance-list-card" style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border-glass)' }}>
              <table className="attendance-table" style={{ width: '100%', borderCollapse: 'collapse', color: 'white' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-glass)', textAlign: 'left' }}>
                    <th style={{ padding: '1rem' }}>Date</th>
                    <th style={{ padding: '1rem' }}>Student</th>
                    <th style={{ padding: '1rem' }}>Status</th>
                    <th style={{ padding: '1rem' }}>Marked By</th>
                    {user.role === 'hod' && <th style={{ padding: '1rem' }}>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {attendanceLogs.length === 0 ? (
                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>No attendance records found.</td></tr>
                  ) : (
                    attendanceLogs.map(log => (
                      <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '1rem' }}>{log.date}</td>
                        <td style={{ padding: '1rem' }}><strong>{log.studentName}</strong></td>
                        <td style={{ padding: '1rem' }}>
                          <span className={`status-badge ${log.status === 'Present' ? 'status-p' : 'status-a'}`} style={{ padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', background: log.status === 'Present' ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 0, 0, 0.1)', color: log.status === 'Present' ? '#00ff00' : '#ff4d4d' }}>
                            {log.status}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.9rem', opacity: 0.8 }}>{log.markedBy}</td>
                        {(user.role === 'hod' || user.role === 'admin') && (
                          <td style={{ padding: '1rem' }}>
                            <button onClick={() => deleteAttendance(log.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>🗑️</button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── ADMIN TAB ─── */}
        {(activeTab === 'admin') && (user.role === 'hod' || user.role === 'admin') && (
          <div className="admin-section">
            <header className="feed-header">
              <h1>{user.role === 'admin' ? 'System' : 'HOD'} <span className="gradient-text">{user.role === 'admin' ? 'Administrator' : 'Portal'}</span></h1>
              <p>{user.role === 'admin' ? 'Manage staff, HODs, and system resources.' : 'Manage class representatives and attendance records.'}</p>
            </header>

            <div className="admin-grid" style={{ marginTop: '2rem' }}>
              {user.role === 'admin' && (
                <div className="admin-form-card">
                  <h3>Add New Staff (HOD/Faculty)</h3>
                  <form onSubmit={handleAddStaff}>
                    <input placeholder="Username" value={staffForm.username} onChange={e => setStaffForm({ ...staffForm, username: e.target.value })} required />
                    <input placeholder="Full Name" value={staffForm.name} onChange={e => setStaffForm({ ...staffForm, name: e.target.value })} required />
                    <input type="password" placeholder="Password" value={staffForm.password} onChange={e => setStaffForm({ ...staffForm, password: e.target.value })} required />
                    <input type="password" placeholder="Confirm Password" value={staffForm.confirmPassword} onChange={e => setStaffForm({ ...staffForm, confirmPassword: e.target.value })} required />
                    <select value={staffForm.role} onChange={e => setStaffForm({ ...staffForm, role: e.target.value })} className="category-select" style={{ width: '100%', marginBottom: '1rem' }}>
                      <option value="faculty">Faculty</option>
                      <option value="hod">HOD (HK Level)</option>
                    </select>
                    <button type="submit" className="submit-btn" style={{ width: '100%' }}>Create Account</button>
                  </form>
                </div>
              )}

              {user.role === 'hod' && (
                <div className="admin-form-card">
                  <h3>Appoint Class Representative (CR)</h3>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    Set a username and record for a student CR.
                  </p>
                  <form onSubmit={handlePromote}>
                    <div className="form-row">
                      <input placeholder="Student Username" value={promoteForm.name} onChange={e => setPromoteForm({ ...promoteForm, name: e.target.value })} required />
                      <input type="password" placeholder="Passcode" value={promoteForm.password} onChange={e => setPromoteForm({ ...promoteForm, password: e.target.value })} required />
                    </div>
                    <button type="submit" className="submit-btn" style={{ width: '100%', marginTop: '0.5rem' }}>🎖️ Grant CR Access</button>
                  </form>
                </div>
              )}

              <div className="admin-form-card">
                <h3>System Performance & Stats</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                  <div className="att-statBox" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <span className="att-label">Total Students</span>
                    <span className="att-value">{stats.totalStudents || 0}</span>
                  </div>
                  <div className="att-statBox" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <span className="att-label">Faculty Docs</span>
                    <span className="att-value">{stats.totalFaculty || 0}</span>
                  </div>
                  <div className="att-statBox" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <span className="att-label">Active HODs</span>
                    <span className="att-value">{stats.totalHODs || 0}</span>
                  </div>
                  <div className="att-statBox" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <span className="att-label">Campus Voices</span>
                    <span className="att-value">{stats.posts || 0}</span>
                  </div>
                </div>
                <button onClick={fetchStats} className="submit-btn-outline" style={{ width: '100%', marginTop: '1rem', padding: '0.6rem', background: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)', cursor: 'pointer', borderRadius: '4px' }}>Sync Live Data</button>
              </div>
            </div>

              {/* ─── USER DIRECTORY ─── */}
              <div className="admin-form-card" style={{ marginTop: '2rem', gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ margin: 0 }}>👥 User Directory (Management)</h3>
                  <button onClick={fetchUsers} className="refresh-btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>🔄 Refresh List</button>
                </div>
                <div className="attendance-list-card" style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                  <table className="attendance-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-glass)', textAlign: 'left' }}>
                        <th style={{ padding: '1rem' }}>Name</th>
                        <th style={{ padding: '1rem' }}>Username / ID</th>
                        <th style={{ padding: '1rem' }}>Role</th>
                        <th style={{ padding: '1rem' }}>Status</th>
                        <th style={{ padding: '1rem' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userList.length === 0 ? (
                        <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>No users found in directory.</td></tr>
                      ) : (
                        userList.map((u, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '1rem' }}><strong>{u.name}</strong></td>
                            <td style={{ padding: '1rem', opacity: 0.7 }}>{u.username || u.id}</td>
                            <td style={{ padding: '1rem' }}>
                              <span className={`status-badge role-${u.role}`} style={{ fontSize: '0.7rem', textTransform: 'uppercase', padding: '2px 6px' }}>
                                {u.role}
                              </span>
                            </td>
                            <td style={{ padding: '1rem', color: '#00ff00', fontSize: '0.8rem' }}>● Active</td>
                            <td style={{ padding: '1rem' }}>
                              {u.username !== 'snuhith' && (
                                <button 
                                  onClick={() => removeUser(u.role, u.username || u.id)}
                                  className="delete-post-btn"
                                  style={{ background: 'rgba(255,0,0,0.1)', color: '#ff4d4d', border: '1px solid rgba(255,0,0,0.2)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                  Remove Access
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              
              <div className="roles-list" style={{ marginTop: '2rem', gridColumn: '1 / -1' }}>
                <h3>Current Class Representatives</h3>
                <div className="roles-grid">
                  {Object.keys(adminRoles).length === 0 ? (
                    <p style={{ color: 'var(--text-dim)' }}>No CRs appointed yet.</p>
                  ) : (
                    Object.entries(adminRoles).map(([uname, role]) => (
                      <div key={uname} className="role-item">
                        <span><strong>{uname}</strong> — {role.toUpperCase()}</span>
                        {user.role === 'hod' && <button className="demote-btn" onClick={() => handleDemote(uname)}>Revoke Access</button>}
                      </div>
                    ))
                  )}
                </div>
              </div>
          </div>
        )}
      </main>

      <footer className="college-footer">
        <p>© 2026 RISE KRISHNA SAI GANDHI Student Portal</p>
        <p>Privacy First • Accountability Always</p>
      </footer>
    </div>
  );
};

export default App;
