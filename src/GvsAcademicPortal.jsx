import React, { useState, useEffect } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import './App.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'PENDING_CLIENT_ID';

const GvsAcademicPortal = () => {
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

  const [currentUser, setCurrentUser] = useState(null);
  const [currentTab, setCurrentTab] = useState('notifications');
  const [facList, setFacList] = useState([]);
  const [notifList, setNotifList] = useState([]);
  const [academicLogs, setAcademicLogs] = useState([]);
  const [studentList, setStudentList] = useState([]);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginMsg, setLoginMsg] = useState('');
  const [markForm, setMarkForm] = useState({ studentName: '', status: 'Present', date: new Date().toISOString().split('T')[0] });
  const [broadcastForm, setBroadcastForm] = useState({ title: '', content: '' });
  const [portalStats, setPortalStats] = useState({ totalStudents: 0, totalFaculty: 0, totalHODs: 0, posts: 0 });

  // Unified Data Synchronizer
  useEffect(() => {
    if (!currentUser) return;

    // Load All Categories
    const syncData = async () => {
      try {
        const [f, n] = await Promise.all([
          fetch('/api/faculty').then(r => r.json()),
          fetch('/api/notifications').then(r => r.json())
        ]);
        setFacList(f);
        setNotifList(n);

        const attRes = await fetch(`/api/attendance?username=${encodeURIComponent(currentUser.name)}&role=${encodeURIComponent(currentUser.role)}`);
        const attData = await attRes.json();
        setAcademicLogs(attData?.records ? Object.values(attData.records) : (Array.isArray(attData) ? attData : []));

        if (currentUser.role === 'hod' || currentUser.role === 'faculty') {
          const s = await fetch('/api/students').then(r => r.json());
          setStudentList(s);
        }

        if (currentUser.role === 'hod' || currentUser.role === 'admin') {
          const st = await fetch('/api/admin/stats').then(r => r.json());
          setPortalStats(st);
        }
      } catch (err) { console.error('Data Sync Failed:', err); }
    };

    syncData();
  }, [currentUser]);

  useEffect(() => {
    const session = localStorage.getItem('user');
    if (session) {
      try { setCurrentUser(JSON.parse(session)); } catch (e) { localStorage.removeItem('user'); }
    }
  }, []);

  const handleHubLogout = () => {
    localStorage.removeItem('user');
    setCurrentUser(null);
  };

  const executeLogin = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...loginForm, name: loginForm.username })
    });
    const data = await res.json();
    if (res.ok && data.user) {
      localStorage.setItem('user', JSON.stringify(data.user));
      setCurrentUser(data.user);
    } else {
      setLoginMsg(data.error || 'Access Denied');
    }
  };

  const submitAttendance = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...markForm, markedBy: currentUser.name })
    });
    if (res.ok) {
      setMarkForm({ ...markForm, studentName: '' });
      const attRes = await fetch(`/api/attendance?username=${currentUser.name}&role=${currentUser.role}`);
      const attData = await attRes.json();
      setAcademicLogs(attData?.records ? Object.values(attData.records) : (Array.isArray(attData) ? attData : []));
    }
  };

  const submitBroadcast = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...broadcastForm, sender: currentUser.name, role: currentUser.role })
    });
    if (res.ok) {
      setBroadcastForm({ title: '', content: '' });
      fetch('/api/notifications').then(r => r.json()).then(setNotifList);
    }
  };

  if (!currentUser) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>RISE <span className="gradient-text">UNIVERSITY</span></h1>
          <div className="security-badge">SECURE ACADEMIC PORTAL</div>
          <form onSubmit={executeLogin}>
            <input placeholder="Username" value={loginForm.username} onChange={e => setLoginForm({ ...loginForm, username: e.target.value })} required />
            <input type="password" placeholder="Password" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} required />
            <button type="submit" className="login-btn">ACCESS PORTAL</button>
          </form>
          {loginMsg && <p className="error-msg">{loginMsg}</p>}
        </div>
      </div>
    );
  }

  const isCoordinator = currentUser.role === 'hod' || currentUser.role === 'faculty' || currentUser.role === 'cr';

  return (
    <div className="college-app">
      <nav className="college-nav">
        <div className="nav-container">
          <div className="college-logo">UNIVERSITY PORTAL</div>
          <div className="nav-links">
            <button className={currentTab === 'notifications' ? 'active' : ''} onClick={() => setCurrentTab('notifications')}>Announcements</button>
            <button className={currentTab === 'faculty' ? 'active' : ''} onClick={() => setCurrentTab('faculty')}>Faculty</button>
            <button className={currentTab === 'attendance' ? 'active' : ''} onClick={() => setCurrentTab('attendance')}>Attendance</button>
            {(currentUser.role === 'admin' || currentUser.role === 'hod') && <button className={currentTab === 'admin' ? 'active' : ''} onClick={() => setCurrentTab('admin')}>Management</button>}
            <button onClick={handleHubLogout} className="logout-btn">Logout</button>
          </div>
        </div>
      </nav>

      <main className="main-container">
        {currentTab === 'notifications' && (
          <div className="notifications-section FadeIn">
            <h1>Official <span className="gradient-text">Announcements</span></h1>
            {isCoordinator && (
              <div className="admin-form-card">
                <h3>Post Notification</h3>
                <form onSubmit={submitBroadcast}>
                  <input placeholder="Title" value={broadcastForm.title} onChange={e => setBroadcastForm({ ...broadcastForm, title: e.target.value })} required />
                  <textarea placeholder="Content" value={broadcastForm.content} onChange={e => setBroadcastForm({ ...broadcastForm, content: e.target.value })} required />
                  <button type="submit" className="submit-btn">Broadcast</button>
                </form>
              </div>
            )}
            <div className="notif-list">
              {notifList.map(item => (
                <div key={item.id} className="notif-card">
                  <h3>{item.title}</h3>
                  <p>{item.content}</p>
                  <div className="notif-footer">By {item.sender} • {new Date(item.timestamp).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentTab === 'attendance' && (
          <div className="attendance-section FadeIn">
            <h1>Student <span className="gradient-text">Attendance</span></h1>
            {(currentUser.role === 'hod' || currentUser.role === 'faculty') && (
              <div className="admin-form-card">
                <h3>Mark Attendance</h3>
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
                  <button type="submit" className="submit-btn">Save</button>
                </form>
              </div>
            )}
            <table className="attendance-table" style={{ width: '100%', marginTop: '2rem' }}>
              <thead>
                <tr><th>Date</th><th>Student</th><th>Status</th><th>By</th></tr>
              </thead>
              <tbody>
                {academicLogs.map(log => (
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

        {currentTab === 'faculty' && (
          <div className="faculty-section FadeIn">
            <h1>University <span className="gradient-text">Faculty</span></h1>
            <div className="faculty-grid">
              {facList.map(prof => (
                <div key={prof.id} className="faculty-card">
                  <div className="fac-icon">{prof.icon}</div>
                  <h3>{prof.name}</h3>
                  <div className="fac-dept">{prof.dept}</div>
                  <p>{prof.bio}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentTab === 'admin' && (
           <div className="admin-section FadeIn">
             <h1><span className="gradient-text">Management</span> Portal</h1>
             <div className="admin-grid">
               <div className="admin-form-card">
                 <h3>System Statistics</h3>
                 <p>Students: {portalStats.totalStudents}</p>
                 <p>Faculty: {portalStats.totalFaculty}</p>
                 <button onClick={() => fetch('/api/admin/stats').then(r => r.json()).then(setPortalStats)} className="submit-btn">Sync Data</button>
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
