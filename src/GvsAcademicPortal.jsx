import React, { useState, useEffect } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import './App.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'PENDING_CLIENT_ID';

// Role cards for the selection screen
const ROLE_OPTIONS = [
  { id: 'student',    label: 'Student',     icon: '🎓', desc: 'View announcements & attendance' },
  { id: 'faculty',    label: 'Staff',        icon: '📚', desc: 'Mark & view attendance' },
  { id: 'hod',        label: 'Coordinator',  icon: '🧑‍💼', desc: 'Manage attendance & announcements' },
  { id: 'admin',      label: 'Management',   icon: '🔐', desc: 'Full access & administration' },
];

const GvsAcademicPortal = () => {
  // ── Login flow state ──────────────────────────────────────────────
  const [selectedRole, setSelectedRole] = useState(null); // null = role screen
  const [loginForm, setLoginForm]       = useState({ username: '', password: '' });
  const [loginMsg,  setLoginMsg]        = useState('');

  // ── App state ─────────────────────────────────────────────────────
  const [currentUser, setCurrentUser]   = useState(null);
  const [currentTab,  setCurrentTab]    = useState('notifications');
  const [facList,     setFacList]       = useState([]);
  const [notifList,   setNotifList]     = useState([]);
  const [academicLogs, setAcademicLogs] = useState([]);
  const [studentList, setStudentList]   = useState([]);
  const [portalStats, setPortalStats]   = useState({ totalStudents: 0, totalFaculty: 0 });

  // ── Form state ────────────────────────────────────────────────────
  const [markForm,      setMarkForm]      = useState({ studentName: '', status: 'Present', date: new Date().toISOString().split('T')[0] });
  const [broadcastForm, setBroadcastForm] = useState({ title: '', content: '' });
  const [newFacForm,    setNewFacForm]    = useState({ name: '', dept: '', bio: '', icon: '👨‍🏫' });

  // ── Permission helpers ─────────────────────────────────────────────
  const isAdmin   = currentUser?.role === 'admin';
  const isHod     = currentUser?.role === 'hod';
  const isFaculty = currentUser?.role === 'faculty';
  const canManage = isAdmin || isHod;
  const canMark   = isAdmin || isHod || isFaculty;

  // ── Data sync ──────────────────────────────────────────────────────
  const syncAll = async (user) => {
    if (!user) return;
    try {
      const [f, n] = await Promise.all([
        fetch('/api/faculty').then(r => r.json()),
        fetch('/api/notifications').then(r => r.json()),
      ]);
      setFacList(Array.isArray(f) ? f : []);
      setNotifList(Array.isArray(n) ? n : []);

      const attRes = await fetch(`/api/attendance?username=${encodeURIComponent(user.name)}&role=${encodeURIComponent(user.role)}`);
      const attData = await attRes.json();
      setAcademicLogs(attData?.records ? Object.values(attData.records) : (Array.isArray(attData) ? attData : []));

      if (['admin', 'hod', 'faculty'].includes(user.role)) {
        fetch('/api/students').then(r => r.json()).then(s => setStudentList(Array.isArray(s) ? s : []));
      }
      if (['admin', 'hod'].includes(user.role)) {
        fetch('/api/admin/stats').then(r => r.json()).then(setPortalStats);
      }
    } catch (err) { console.error('Sync failed:', err); }
  };

  useEffect(() => {
    const session = localStorage.getItem('gvs_portal_user');
    if (session) {
      try {
        const u = JSON.parse(session);
        setCurrentUser(u);
        syncAll(u);
      } catch { localStorage.removeItem('gvs_portal_user'); }
    }
  }, []);

  const loginUser = (user) => {
    localStorage.setItem('gvs_portal_user', JSON.stringify(user));
    setCurrentUser(user);
    syncAll(user);
  };

  const handleLogout = () => {
    localStorage.removeItem('gvs_portal_user');
    setCurrentUser(null);
    setSelectedRole(null);
    setLoginForm({ username: '', password: '' });
    setLoginMsg('');
  };

  // ── Auth handlers ──────────────────────────────────────────────────
  const executeLogin = async (e) => {
    e.preventDefault();
    setLoginMsg('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: loginForm.username, password: loginForm.password, name: loginForm.username })
    });
    const data = await res.json();
    if (res.ok && data.user) {
      // Warn if role mismatch
      if (selectedRole && data.user.role !== selectedRole) {
        setLoginMsg(`⚠️ Logged in as ${data.user.role} (not ${selectedRole}). Proceeding.`);
        setTimeout(() => loginUser(data.user), 1200);
      } else {
        loginUser(data.user);
      }
    } else {
      setLoginMsg(data.error || 'Access Denied. Check your credentials.');
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: credentialResponse.credential })
      });
      const data = await res.json();
      if (res.ok && data.user) loginUser(data.user);
      else setLoginMsg(data.error || 'Google Sign-In failed');
    } catch { setLoginMsg('Google Sign-In error. Please try again.'); }
  };

  // ── CRUD handlers (Admin / HOD only) ──────────────────────────────
  const deleteNotif = async (id) => {
    if (!canManage || !window.confirm('Delete this announcement?')) return;
    const res = await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
    if (res.ok) setNotifList(prev => prev.filter(n => n.id !== id));
  };

  const deleteLog = async (id) => {
    if (!canManage || !window.confirm('Delete this attendance record?')) return;
    const res = await fetch(`/api/attendance/${id}`, { method: 'DELETE' });
    if (res.ok) setAcademicLogs(prev => prev.filter(l => l.id !== id));
  };

  const deleteFaculty = async (id) => {
    if (!canManage || !window.confirm('Remove this faculty member?')) return;
    const res = await fetch(`/api/faculty/${id}`, { method: 'DELETE' });
    if (res.ok) setFacList(prev => prev.filter(f => f.id !== id));
  };

  const addFaculty = async (e) => {
    e.preventDefault();
    if (!canManage) return;
    const res = await fetch('/api/faculty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newFacForm)
    });
    if (res.ok) {
      setNewFacForm({ name: '', dept: '', bio: '', icon: '👨‍🏫' });
      fetch('/api/faculty').then(r => r.json()).then(f => setFacList(Array.isArray(f) ? f : []));
    }
  };

  const submitBroadcast = async (e) => {
    e.preventDefault();
    if (!canManage) return;
    const res = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...broadcastForm, sender: currentUser.name, role: currentUser.role })
    });
    if (res.ok) {
      setBroadcastForm({ title: '', content: '' });
      fetch('/api/notifications').then(r => r.json()).then(n => setNotifList(Array.isArray(n) ? n : []));
    }
  };

  const submitAttendance = async (e) => {
    e.preventDefault();
    if (!canMark) return;
    const res = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...markForm, markedBy: currentUser.name })
    });
    if (res.ok) {
      setMarkForm({ ...markForm, studentName: '' });
      const attRes = await fetch(`/api/attendance?username=${encodeURIComponent(currentUser.name)}&role=${encodeURIComponent(currentUser.role)}`);
      const d = await attRes.json();
      setAcademicLogs(d?.records ? Object.values(d.records) : (Array.isArray(d) ? d : []));
    }
  };

  // ══════════════════════════════════════════════════════════════════
  // SCREEN 1 — Role Selection
  // ══════════════════════════════════════════════════════════════════
  if (!currentUser && !selectedRole) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ maxWidth: '520px' }}>
          <h1>RISE <span className="gradient-text">UNIVERSITY</span></h1>
          <div className="security-badge">SECURE ACADEMIC PORTAL</div>
          <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', margin: '1rem 0 1.5rem', fontSize: '0.9rem' }}>
            Who are you signing in as?
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {ROLE_OPTIONS.map(opt => (
              <button
                key={opt.id}
                onClick={() => { setSelectedRole(opt.id); setLoginMsg(''); }}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '12px',
                  padding: '1.2rem 0.8rem',
                  color: '#fff',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,212,255,0.12)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              >
                <span style={{ fontSize: '2rem' }}>{opt.icon}</span>
                <span style={{ fontWeight: 700, letterSpacing: '0.05em' }}>{opt.label}</span>
                <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // SCREEN 2 — Login Form (after role chosen)
  // ══════════════════════════════════════════════════════════════════
  if (!currentUser && selectedRole) {
    const roleLabel = ROLE_OPTIONS.find(r => r.id === selectedRole)?.label || selectedRole;
    const roleIcon  = ROLE_OPTIONS.find(r => r.id === selectedRole)?.icon || '🔐';
    return (
      <div className="login-page">
        <div className="login-card">
          <button
            onClick={() => { setSelectedRole(null); setLoginMsg(''); }}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.85rem', marginBottom: '0.5rem', alignSelf: 'flex-start' }}
          >
            ← Back
          </button>

          <h1>RISE <span className="gradient-text">UNIVERSITY</span></h1>
          <div className="security-badge" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
            <span>{roleIcon}</span> Signing in as <strong>{roleLabel}</strong>
          </div>

          <form onSubmit={executeLogin} style={{ marginTop: '1.5rem' }}>
            <input
              placeholder="Username"
              value={loginForm.username}
              onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={loginForm.password}
              onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
              required
            />
            <button type="submit" className="login-btn">ACCESS PORTAL</button>
          </form>

          {loginMsg && (
            <p style={{ color: loginMsg.startsWith('⚠') ? '#ffd700' : '#ff4d4d', marginTop: '0.75rem', textAlign: 'center', fontSize: '0.875rem' }}>
              {loginMsg}
            </p>
          )}

          <div style={{ margin: '1.2rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.12)' }} />
            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem' }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.12)' }} />
          </div>

          <div className="google-signin-section">
            <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setLoginMsg('Google Sign-In failed')}
                theme="filled_black"
                size="large"
                width="100%"
                text="signin_with"
              />
            </GoogleOAuthProvider>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // SCREEN 3 — Main Dashboard
  // ══════════════════════════════════════════════════════════════════

  // Reusable delete button style
  const deleteBtnStyle = {
    background: 'rgba(255,77,77,0.12)',
    border: '1px solid rgba(255,77,77,0.35)',
    color: '#ff4d4d',
    borderRadius: '6px',
    padding: '0.25rem 0.65rem',
    cursor: 'pointer',
    fontSize: '0.78rem',
    fontWeight: 600,
    transition: 'background 0.2s',
  };

  return (
    <div className="college-app">
      <nav className="college-nav">
        <div className="nav-container">
          <div className="college-logo">UNIVERSITY PORTAL</div>
          <div className="nav-links">
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem' }}>
              {currentUser.name} · {currentUser.role}
            </span>
            <button className={currentTab === 'notifications' ? 'active' : ''} onClick={() => setCurrentTab('notifications')}>Announcements</button>
            <button className={currentTab === 'faculty'       ? 'active' : ''} onClick={() => setCurrentTab('faculty')}>Faculty</button>
            <button className={currentTab === 'attendance'    ? 'active' : ''} onClick={() => setCurrentTab('attendance')}>Attendance</button>
            {canManage && <button className={currentTab === 'admin' ? 'active' : ''} onClick={() => setCurrentTab('admin')}>Management</button>}
            <button onClick={handleLogout} className="logout-btn">Logout</button>
          </div>
        </div>
      </nav>

      <main className="main-container">

        {/* ── ANNOUNCEMENTS ── */}
        {currentTab === 'notifications' && (
          <div className="notifications-section FadeIn">
            <h1>Official <span className="gradient-text">Announcements</span></h1>

            {canManage && (
              <div className="admin-form-card">
                <h3>📢 Post Announcement <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>(Admin / HOD only)</span></h3>
                <form onSubmit={submitBroadcast}>
                  <input placeholder="Title" value={broadcastForm.title} onChange={e => setBroadcastForm({ ...broadcastForm, title: e.target.value })} required />
                  <textarea placeholder="Content" value={broadcastForm.content} onChange={e => setBroadcastForm({ ...broadcastForm, content: e.target.value })} required />
                  <button type="submit" className="submit-btn">Broadcast</button>
                </form>
              </div>
            )}

            <div className="notif-list">
              {notifList.length === 0 && <p style={{ color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '2rem' }}>No announcements yet.</p>}
              {notifList.map(item => (
                <div key={item.id} className="notif-card" style={{ position: 'relative' }}>
                  <h3>{item.title}</h3>
                  <p>{item.content}</p>
                  <div className="notif-footer">By {item.sender} · {new Date(item.timestamp).toLocaleDateString()}</div>
                  {canManage && (
                    <button style={{ ...deleteBtnStyle, position: 'absolute', top: '0.75rem', right: '0.75rem' }} onClick={() => deleteNotif(item.id)}>
                      🗑 Delete
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ATTENDANCE ── */}
        {currentTab === 'attendance' && (
          <div className="attendance-section FadeIn">
            <h1>Student <span className="gradient-text">Attendance</span></h1>

            {canMark && (
              <div className="admin-form-card">
                <h3>✅ Mark Attendance <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>(Admin / HOD / Faculty)</span></h3>
                <form onSubmit={submitAttendance}>
                  <select value={markForm.studentName} onChange={e => setMarkForm({ ...markForm, studentName: e.target.value })} required>
                    <option value="">Select Student...</option>
                    {studentList.map(s => <option key={s.username} value={s.username}>{s.name}</option>)}
                  </select>
                  <select value={markForm.status} onChange={e => setMarkForm({ ...markForm, status: e.target.value })}>
                    <option value="Present">Present</option>
                    <option value="Absent">Absent</option>
                  </select>
                  <input type="date" value={markForm.date} onChange={e => setMarkForm({ ...markForm, date: e.target.value })} required />
                  <button type="submit" className="submit-btn">Save Record</button>
                </form>
              </div>
            )}

            <table className="attendance-table" style={{ width: '100%', marginTop: '2rem' }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Student</th>
                  <th>Status</th>
                  <th>Marked By</th>
                  {canManage && <th style={{ width: '80px' }}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {academicLogs.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 5 : 4} style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: '2rem' }}>
                      No attendance records found.
                    </td>
                  </tr>
                )}
                {academicLogs.map(log => (
                  <tr key={log.id}>
                    <td>{log.date}</td>
                    <td>{log.studentName}</td>
                    <td style={{ color: log.status === 'Present' ? '#00ff88' : '#ff4d4d', fontWeight: 600 }}>{log.status}</td>
                    <td>{log.markedBy}</td>
                    {canManage && (
                      <td style={{ textAlign: 'center' }}>
                        <button style={deleteBtnStyle} onClick={() => deleteLog(log.id)}>🗑</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── FACULTY ── */}
        {currentTab === 'faculty' && (
          <div className="faculty-section FadeIn">
            <h1>University <span className="gradient-text">Faculty</span></h1>

            {canManage && (
              <div className="admin-form-card" style={{ marginBottom: '2rem' }}>
                <h3>➕ Add Faculty Member <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>(Admin / HOD only)</span></h3>
                <form onSubmit={addFaculty} style={{ display: 'grid', gap: '0.75rem' }}>
                  <input placeholder="Full Name" value={newFacForm.name} onChange={e => setNewFacForm({ ...newFacForm, name: e.target.value })} required />
                  <input placeholder="Department" value={newFacForm.dept} onChange={e => setNewFacForm({ ...newFacForm, dept: e.target.value })} required />
                  <textarea placeholder="Bio (optional)" value={newFacForm.bio} onChange={e => setNewFacForm({ ...newFacForm, bio: e.target.value })} />
                  <button type="submit" className="submit-btn">Add Faculty</button>
                </form>
              </div>
            )}

            <div className="faculty-grid">
              {facList.map(prof => (
                <div key={prof.id} className="faculty-card" style={{ position: 'relative' }}>
                  <div className="fac-icon">{prof.icon}</div>
                  <h3>{prof.name}</h3>
                  <div className="fac-dept">{prof.dept}</div>
                  <p>{prof.bio}</p>
                  {canManage && (
                    <button style={{ ...deleteBtnStyle, marginTop: '0.75rem', width: '100%', padding: '0.4rem' }} onClick={() => deleteFaculty(prof.id)}>
                      🗑 Remove Faculty
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── MANAGEMENT (Admin/HOD) ── */}
        {currentTab === 'admin' && canManage && (
          <div className="admin-section FadeIn">
            <h1><span className="gradient-text">Management</span> Portal</h1>
            <div className="admin-grid">
              <div className="admin-form-card">
                <h3>System Statistics</h3>
                <p>👥 Students: <strong style={{ color: '#00d4ff' }}>{portalStats.totalStudents}</strong></p>
                <p>🎓 Faculty: <strong style={{ color: '#00d4ff' }}>{portalStats.totalFaculty}</strong></p>
                <button className="submit-btn" onClick={() => fetch('/api/admin/stats').then(r => r.json()).then(setPortalStats)}>
                  🔄 Refresh Stats
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      <footer className="college-footer">
        <p>© 2026 RISE KRISHNA SAI GANDHI University Portal</p>
      </footer>
    </div>
  );
};

export default GvsAcademicPortal;
