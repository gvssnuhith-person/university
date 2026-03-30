import React, { useState, useEffect, useRef } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import './App.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'PENDING_CLIENT_ID';

const UniversityApp = () => {
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
  const [activeTab, setActiveTab] = useState('notifications');
  const [faculty, setFaculty] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [loginMode, setLoginMode] = useState('login'); 
  const [loginError, setLoginError] = useState('');
  const [targetedFacultyId, setTargetedFacultyId] = useState('');
  const [newFaculty, setNewFaculty] = useState({ name: '', dept: '', bio: '', icon: '👨‍🏫' });
  const [notifForm, setNotifForm] = useState({ title: '', content: '' });
  const [notifFile, setNotifFile] = useState(null); 
  const [adminRoles, setAdminRoles] = useState({});
  const [pendingUsers, setPendingUsers] = useState({});
  const [promoteForm, setPromoteForm] = useState({ name: '', password: '' });
  const [staffForm, setStaffForm] = useState({ username: '', name: '', password: '', confirmPassword: '', role: 'faculty' });
  const [stats, setStats] = useState({ totalStudents: 0, totalFaculty: 0, totalHODs: 0, posts: 0 });
  const [userList, setUserList] = useState([]);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [students, setStudents] = useState([]);
  const [attForm, setAttForm] = useState({ studentName: '', status: 'Present', date: new Date().toISOString().split('T')[0] });

  useEffect(() => {
    if (user) {
      fetchFaculty();
      fetchNotifications();
      fetchAttendance();
      if (user.role === 'hod' || user.role === 'faculty') fetchStudents();
      if (user.role === 'hod' || user.role === 'admin') {
        fetchRoles();
        fetchPending();
        fetchStats();
        fetchUsers();
      }
    }
  }, [user]);

  const handleGoogleSignIn = async (credentialResponse) => {
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: credentialResponse.credential }) 
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('user', JSON.stringify(data.user));
        setUser(data.user);
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try { setUser(JSON.parse(savedUser)); } catch (e) { localStorage.removeItem('user'); }
    }
  }, []);

  const logout = () => {
    localStorage.removeItem('user');
    setUser(null);
  };

  const fetchRoles = async () => {
    const res = await fetch('/api/admin/roles');
    const data = await res.json();
    setAdminRoles(data);
  };

  const fetchPending = async () => {
    const res = await fetch('/api/admin/pending');
    const data = await res.json();
    setPendingUsers(data);
  };

  const fetchAttendance = async () => {
    const res = await fetch(`/api/attendance?username=${user.name}&role=${user.role}`);
    const data = await res.json();
    setAttendanceLogs(data?.records ? Object.values(data.records) : (Array.isArray(data) ? data : []));
  };

  const fetchStudents = async () => {
    const res = await fetch('/api/students');
    const data = await res.json();
    setStudents(data);
  };

  const fetchStats = async () => {
    const res = await fetch('/api/admin/stats');
    const data = await res.json();
    setStats(data);
  };

  const fetchUsers = async () => {
    const res = await fetch('/api/admin/users');
    const data = await res.json();
    setUserList(data);
  };

  const fetchFaculty = async () => {
    const res = await fetch('/api/faculty');
    const data = await res.json();
    setFaculty(data);
  };

  const fetchNotifications = async () => {
    const res = await fetch('/api/notifications');
    const data = await res.json();
    setNotifications(data);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const endpoint = loginMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...loginData, name: loginData.username, role: loginMode === 'signup' ? 'student' : undefined })
    });
    const data = await res.json();
    if (res.ok && data.user) setUser(data.user);
    else setLoginError(data.error || 'Login failed');
  };

  const handleMarkAttendance = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...attForm, markedBy: user.name })
    });
    if (res.ok) {
      setAttForm({ ...attForm, studentName: '' });
      fetchAttendance();
    }
  };

  const handlePostNotif = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...notifForm, sender: user.name, role: user.role })
    });
    if (res.ok) {
      setNotifForm({ title: '', content: '' });
      fetchNotifications();
    }
  };

  if (!user) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>RISE <span className="gradient-text">UNIVERSITY</span></h1>
          <div className="security-badge">SECURE ACADEMIC PORTAL</div>
          <form onSubmit={handleLogin}>
            <input placeholder="Username" value={loginData.username} onChange={e => setLoginData({ ...loginData, username: e.target.value })} required />
            <input type="password" placeholder="Password" value={loginData.password} onChange={e => setLoginData({ ...loginData, password: e.target.value })} required />
            <button type="submit" className="login-btn">ACCESS PORTAL</button>
          </form>
          <div className="google-signin-section">
            <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
               <GoogleLogin onSuccess={handleGoogleSignIn} theme="filled_black" width="100%" />
            </GoogleOAuthProvider>
          </div>
        </div>
      </div>
    );
  }

  const canPostNotif = user.role === 'hod' || user.role === 'faculty' || user.role === 'cr';

  return (
    <div className="college-app">
      <nav className="college-nav">
        <div className="nav-container">
          <div className="college-logo">UNIVERSITY PORTAL</div>
          <div className="nav-links">
            <button className={activeTab === 'notifications' ? 'active' : ''} onClick={() => setActiveTab('notifications')}>Announcements</button>
            <button className={activeTab === 'faculty' ? 'active' : ''} onClick={() => setActiveTab('faculty')}>Faculty</button>
            <button className={activeTab === 'attendance' ? 'active' : ''} onClick={() => setActiveTab('attendance')}>Attendance</button>
            {(user.role === 'admin' || user.role === 'hod') && <button className={activeTab === 'admin' ? 'active' : ''} onClick={() => setActiveTab('admin')}>Management</button>}
            <button onClick={logout} className="logout-btn">Logout</button>
          </div>
        </div>
      </nav>

      <main className="main-container">
        {activeTab === 'notifications' && (
          <div className="notifications-section">
            <h1>Official <span className="gradient-text">Announcements</span></h1>
            {canPostNotif && (
              <div className="admin-form-card">
                <h3>Post Notification</h3>
                <form onSubmit={handlePostNotif}>
                  <input placeholder="Title" value={notifForm.title} onChange={e => setNotifForm({ ...notifForm, title: e.target.value })} required />
                  <textarea placeholder="Content" value={notifForm.content} onChange={e => setNotifForm({ ...notifForm, content: e.target.value })} required />
                  <button type="submit" className="submit-btn">Broadcast</button>
                </form>
              </div>
            )}
            <div className="notif-list">
              {notifications.map(n => (
                <div key={n.id} className="notif-card">
                  <h3>{n.title}</h3>
                  <p>{n.content}</p>
                  <div className="notif-footer">By {n.sender} • {new Date(n.timestamp).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'attendance' && (
          <div className="attendance-section">
            <h1>Student <span className="gradient-text">Attendance</span></h1>
            {(user.role === 'hod' || user.role === 'faculty') && (
              <div className="admin-form-card">
                <h3>Mark Attendance</h3>
                <form onSubmit={handleMarkAttendance}>
                  <select value={attForm.studentName} onChange={e => setAttForm({ ...attForm, studentName: e.target.value })} required>
                    <option value="">Select Student...</option>
                    {students.map(s => <option key={s.username} value={s.username}>{s.name}</option>)}
                  </select>
                  <select value={attForm.status} onChange={e => setAttForm({ ...attForm, status: e.target.value })}>
                    <option value="Present">Present</option>
                    <option value="Absent">Absent</option>
                  </select>
                  <input type="date" value={attForm.date} onChange={e => setAttForm({ ...attForm, date: e.target.value })} required />
                  <button type="submit" className="submit-btn">Save</button>
                </form>
              </div>
            )}
            <table className="attendance-table" style={{ width: '100%', marginTop: '2rem' }}>
              <thead>
                <tr><th>Date</th><th>Student</th><th>Status</th><th>By</th></tr>
              </thead>
              <tbody>
                {attendanceLogs.map(log => (
                  <tr key={log.id}>
                    <td>{log.date}</td>
                    <td>{log.studentName}</td>
                    <td style={{ color: log.status === 'Present' ? '#00ff00' : '#ff4d4d' }}>{log.status}</td>
                    <td>{log.markedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'faculty' && (
          <div className="faculty-section">
            <h1>University <span className="gradient-text">Faculty</span></h1>
            <div className="faculty-grid">
              {faculty.map(f => (
                <div key={f.id} className="faculty-card">
                  <div className="fac-icon">{f.icon}</div>
                  <h3>{f.name}</h3>
                  <div className="fac-dept">{f.dept}</div>
                  <p>{f.bio}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'admin' && (
           <div className="admin-section">
             <h1><span className="gradient-text">Management</span> Portal</h1>
             <div className="admin-grid">
               <div className="admin-form-card">
                 <h3>System Statistics</h3>
                 <p>Students: {stats.totalStudents}</p>
                 <p>Faculty: {stats.totalFaculty}</p>
                 <button onClick={fetchStats} className="submit-btn">Sync Data</button>
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

export default UniversityApp;
