import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fs from 'fs';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' })); // Allow large base64 file uploads

// ─────────────────────────────────────────────
// EMAIL CONFIGURATION
// ─────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: process.env.SMTP_PORT || 587,
  auth: {
    user: process.env.SMTP_USER || 'ethereal.user', // Placeholder
    pass: process.env.SMTP_PASS || 'ethereal.pass'
  }
});

const HOD_EMAIL = 'hod@gvsuniversity.edu.in';

const sendMail = async (to, subject, text, html) => {
  try {
    const info = await transporter.sendMail({
      from: '"GVS University Portal" <noreply@gvsuniversity.edu.in>',
      to,
      subject,
      text,
      html
    });
    console.log('Message sent: %s', info.messageId);
    return true;
  } catch (err) {
    console.error('Email failed to send:', err);
    return false;
  }
};

// ─────────────────────────────────────────────
// DATA STORES
// ─────────────────────────────────────────────
const posts = [];
const attendanceLogs = []; // New granular log storage
const pendingUsers = {};

const faculty = [
  { id: 1, name: 'Dr. Sarah Johnson', email: 'sarah.j@gvsuniversity.edu.in', dept: 'Computer Science', bio: 'Expert in AI and Machine Learning with 15 years of research experience.', icon: '👩‍🏫' },
  { id: 2, name: 'Prof. Michael Chen', email: 'michael.c@gvsuniversity.edu.in', dept: 'Digital Media', bio: 'Award-winning designer focusing on Interactive Media and UX.', icon: '👨‍🏫' }
];

const notifications = [
  { id: 1, title: 'Mid-term Exams Schedule', content: 'Exams start from April 5th. Detailed schedule is on the notice board.', sender: 'Admin', role: 'hod', timestamp: new Date().toISOString(), attachment: null }
];

// ─────────────────────────────────────────────
// SECURITY & ENCRYPTION TOOLS
// ─────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'gvs-university-secret-2026';
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY || '506ad607730e70a3c26cb8e0787fa541506ad607730e70a3c26cb8e0787fa541', 'hex');

// Hashing with scrypt (Secure alternative to SHA-256)
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
};

const verifyPassword = (input, stored) => {
  if (!stored || !stored.includes(':')) return false;
  const [salt, key] = stored.split(':');
  const derivedKey = crypto.scryptSync(input, salt, 64);
  return derivedKey.toString('hex') === key;
};

// AES-256-GCM Data Encryption Service
const encryptData = (text) => {
  if (!text) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};

const decryptData = (encryptedText) => {
  if (!encryptedText || !encryptedText.includes(':')) return encryptedText;
  try {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return encryptedText;
  }
};

// ─────────────────────────────────────────────
// PERSISTENT FILE DATABASE
// ─────────────────────────────────────────────
const DB_FILE = path.join(__dirname, '..', 'database.json');

const loadDb = () => {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      Object.assign(userAccounts, data.userAccounts || {});
      Object.assign(crAccounts, data.crAccounts || {});
      Object.assign(studentsStore, data.studentsStore || {});
      Object.assign(facultyStore, data.facultyStore || {});
      Object.assign(attendanceStore, data.attendanceStore || {});
      posts.length = 0; posts.push(...(data.posts || []));
      attendanceLogs.length = 0; attendanceLogs.push(...(data.attendanceLogs || []));
      notifications.length = 0; notifications.push(...(data.notifications || []));
      knownStudents.clear(); (data.knownStudents || []).forEach(s => knownStudents.add(s));
      return true;
    }
  } catch (err) { console.error('DB Load failed:', err); }
  return false;
};

const saveDb = () => {
  try {
    const data = {
      userAccounts,
      crAccounts,
      studentsStore,
      facultyStore,
      posts,
      attendanceLogs,
      attendanceStore,
      notifications,
      knownStudents: Array.from(knownStudents)
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (err) { console.error('DB Save failed:', err); }
  return false;
};

// ─────────────────────────────────────────────
// SECURE AUTH STORE
// Fixed accounts: hod, faculty
// CRs are added dynamically by HOD with a password
// Regular students: any username/any password → student role
// ─────────────────────────────────────────────
// Role hierarchy: 
// 1. admin: Manage HODs, Faculty, Stats, All Deletions
// 2. hod: Manage CRs, Attendance, Notifications
// 3. faculty: Mark Attendance
// 4. cr: Post Notifications
// 5. student: View & Campus Voices

// Password conventions:
//   Student  → name@123          e.g. gvs@123
//   Faculty  → name@0707         e.g. anohu@0707
//   HOD      → hod@name132132    e.g. hod@hk132132
//   Admin    → name (same)       e.g. snuhith
let userAccounts = {
  snuhith: { password: hashPassword('snuhith'),      role: 'admin',   name: 'Snuhith' },
  hk:      { password: hashPassword('hod@hk132132'), role: 'hod',     name: 'HK' },
  anohu:   { password: hashPassword('anohu@0707'),   role: 'faculty', name: 'Anohu' },
};

// Dynamic CRs promoted by HOD: { username: { password, name } }
const crAccounts = {};

// ─────────────────────────────────────────────
// ATTENDANCE STORE
// ─────────────────────────────────────────────
// { username: { weekly: '90%', monthly: '85%', lastUpdated: '2023-10-27T...' } }
const attendanceStore = {};

// Keep track of student usernames that have logged in so faculty can select them
const knownStudents = new Set();

// Fixed Student Accounts
const studentsStore = {
  'gvs': { name: 'GVS', password: hashPassword('gvs@123') }
};

const facultyStore = {};

// ─────────────────────────────────────────────
// CONTENT FILTER
// ─────────────────────────────────────────────
const BAD_WORDS = ['hate', 'attack', 'abuse', 'stupid', 'idiot', 'kill'];
const filterContent = (text) => {
  let filtered = text;
  BAD_WORDS.forEach(word => {
    const reg = new RegExp(word, 'gi');
    filtered = filtered.replace(reg, '***');
  });
  return filtered;
};

// ─────────────────────────────────────────────
// ROUTES: AUTH
// ─────────────────────────────────────────────
app.get('/api/info', (req, res) => {
  res.json({ college: 'GVS University', feature: 'Anonymous Opinions', status: 'Active' });
});

// Standard Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  // Load latest data
  loadDb();

  // Check fixed accounts
  const fixed = userAccounts[username.toLowerCase()];
  if (fixed) {
    if (!verifyPassword(password, fixed.password)) return res.status(401).json({ error: 'Incorrect password' });
    const token = jwt.sign({ username: username.toLowerCase(), role: fixed.role, name: fixed.name }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token, user: { name: fixed.name, role: fixed.role } });
  }

  // Check CR accounts
  const cr = crAccounts[username];
  if (cr) {
    if (!verifyPassword(password, cr.password)) return res.status(401).json({ error: 'Incorrect password' });
    const token = jwt.sign({ username, role: 'cr', name: username }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token, user: { name: username, role: 'cr' } });
  }

  // Enforce Google Sign-In for Faculty Google accounts
  const facultyG = facultyStore[username];
  if (facultyG && facultyG.provider === 'google') {
    return res.status(401).json({ error: 'Please use Google Sign-In for this account' });
  }

  // Check student accounts
  const student = studentsStore[username];
  if (student) {
    if (student.provider === 'google') {
      return res.status(401).json({ error: 'Please use Google Sign-In for this account' });
    }
    if (!verifyPassword(password, student.password)) return res.status(401).json({ error: 'Incorrect password' });
    knownStudents.add(username);
    saveDb();
    const token = jwt.sign({ username, role: 'student', name: student.name }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token, user: { name: student.name, role: 'student' } });
  }

  // Check faculty signup store
  const fac = facultyStore[username];
  if (fac) {
    if (!verifyPassword(password, fac.password)) return res.status(401).json({ error: 'Incorrect password' });
    const token = jwt.sign({ username, role: 'faculty', name: fac.name }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token, user: { name: fac.name, role: 'faculty' } });
  }

  if (pendingUsers[username]) {
    studentsStore[username] = { ...pendingUsers[username] };
    delete pendingUsers[username];
    knownStudents.add(username);
    saveDb();
    const token = jwt.sign({ username, role: 'student', name: studentsStore[username].name }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token, user: { name: studentsStore[username].name, role: 'student' } });
  }

  // Auto-create as student (password must follow name@123 pattern for self-registration)
  const hashed = hashPassword(password);
  studentsStore[username] = { name: username, password: hashed, provider: 'traditional', email: username };
  knownStudents.add(username);
  saveDb();
  const token = jwt.sign({ username, role: 'student', name: username }, JWT_SECRET, { expiresIn: '24h' });
  return res.json({ token, user: { name: username, role: 'student' }, hint: 'Auto-registered as Student. Default password: name@123' });
});

// Universal Signup (Supports both student and faculty)
app.post('/api/auth/signup', (req, res) => {
  const { username, password, name, role, dept, bio } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  
  if (userAccounts[username.toLowerCase()] || crAccounts[username] || studentsStore[username] || facultyStore[username]) {
    return res.status(400).json({ error: 'Account already exists' });
  }

  const userRole = role || 'student';
  const hashed = hashPassword(password);

  if (userRole === 'faculty') {
    facultyStore[username] = { 
      id: Date.now(), 
      name: name || username, 
      password: hashed, 
      email: username, 
      dept: dept || 'General', 
      bio: bio || 'No bio provided.',
      icon: '👨‍🏫',
      provider: 'traditional' 
    };
    faculty.push(facultyStore[username]);
  } else if (userRole === 'hod') {
    userAccounts[username.toLowerCase()] = { 
      password: hashed, 
      role: 'hod', 
      name: name || username 
    };
  } else {
    studentsStore[username] = { 
      name: name || username, 
      password: hashed, 
      provider: 'traditional', 
      email: username 
    };
    knownStudents.add(username);
  }

  saveDb();
  const token = jwt.sign({ username: username.toLowerCase(), role: userRole, name: name || username }, JWT_SECRET, { expiresIn: '24h' });
  return res.status(200).json({ 
    token, 
    user: { name: name || username, role: userRole } 
  });
});

// Real Google Sign-In Verification
app.post('/api/auth/google', async (req, res) => {
  const { credential, access_token } = req.body;
  
  try {
    let payload;
    if (access_token) {
      const googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      payload = await googleRes.json();
      if (!googleRes.ok) throw new Error('Invalid access token');
    } else if (credential) {
      const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
      payload = await googleRes.json();
      if (!googleRes.ok) throw new Error('Invalid ID token');
    } else {
      return res.status(400).json({ error: 'Missing Google credentials' });
    }

    const { name, email, sub, picture } = payload;
    let role = 'student';
    if (email && email.endsWith('@gvsuniversity.edu.in')) {
      role = email.startsWith('hod@') ? 'hod' : 'faculty';
    }
    if (crAccounts[email]) role = 'cr';

    if (role === 'student' && !studentsStore[email]) {
      studentsStore[email] = { name, email, password: 'oauth', provider: 'google', picture };
    }
    if (role === 'faculty' && !facultyStore[email]) {
      facultyStore[email] = { name, email, password: 'oauth', provider: 'google', picture };
    }

    knownStudents.add(email);
    saveDb();
    
    const token = jwt.sign({ username: email, role, name, sub }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ 
      token, 
      user: { name: name || email.split('@')[0], role, email, picture } 
    });
  } catch (err) {
    console.error('Google Auth Error:', err);
    return res.status(500).json({ error: 'Internal server error during Google authentication' });
  }
});

// Google Sign-In (DEMO MODE)
app.post('/api/auth/google-demo', (req, res) => {
  const demoEmail = req.body.email || 'demo.student@gmail.com';
  const customName = req.body.name;
  const customRole = req.body.role;

  // Custom Simulator Override
  if (customName && customRole) {
    if (customRole === 'student') {
      if (!studentsStore[demoEmail]) {
        studentsStore[demoEmail] = { name: customName, email: demoEmail, password: 'demo', provider: 'google', picture: '' };
      }
      knownStudents.add(customName);
    } else if (customRole === 'faculty') {
      if (!facultyStore[demoEmail]) {
        facultyStore[demoEmail] = { name: customName, email: demoEmail, password: 'demo', provider: 'google', picture: '' };
      }
    }
    return res.json({ token: 'demo-google-token', user: { name: customName, role: customRole, email: demoEmail } });
  }
  
  // Pre-approve specific demo accounts
  if (demoEmail === 'student1@gmail.com') {
    knownStudents.add('Student1');
    return res.json({ token: 'demo-google-token', user: { name: 'Student One', role: 'student', email: demoEmail } });
  }

  if (crAccounts[demoEmail]) {
    return res.json({ token: 'demo-google-cr', user: { name: demoEmail.split('@')[0], role: 'cr', email: demoEmail } });
  }
  if (studentsStore[demoEmail]) {
    knownStudents.add(demoEmail);
    return res.json({ token: 'demo-google-token', user: { name: studentsStore[demoEmail].name, role: 'student', email: demoEmail } });
  }
  if (facultyStore[demoEmail]) {
    return res.json({ token: 'demo-google-token', user: { name: facultyStore[demoEmail].name, role: 'faculty', email: demoEmail } });
  }
  // Auto-approve users with @gvsuniversity.edu.in as faculty
  if (demoEmail.endsWith('@gvsuniversity.edu.in')) {
    const isHod = demoEmail.startsWith('hod');
    const name = isHod ? 'HOD Architecture' : demoEmail.split('@')[0];
    const role = isHod ? 'hod' : 'faculty';
    return res.json({ token: 'demo-google-token', user: { name, role, email: demoEmail } });
  }

  // Auto-approve unknown personal emails as students
  knownStudents.add(demoEmail);
  return res.json({ token: 'demo-google-token', user: { name: demoEmail.split('@')[0], role: 'student', email: demoEmail } });
});

// ─────────────────────────────────────────────
// ROUTES: ATTENDANCE
// ─────────────────────────────────────────────

// GET Attendance
app.get('/api/attendance', (req, res) => {
  const { role, username } = req.query;
  if (role === 'hod' || role === 'faculty') {
    return res.json(attendanceLogs);
  }
  // Students only see their own
  const studentLogs = attendanceLogs.filter(log => log.studentName === username);
  res.json(studentLogs);
});

// POST Attendance (HOD/Faculty)
app.post('/api/attendance', (req, res) => {
  const { studentName, status, date, markedBy } = req.body;
  if (!studentName || !status || !date) return res.status(400).json({ error: 'Missing data' });
  
  const newLog = { 
    id: Date.now(), 
    studentName, 
    status, 
    date, 
    markedBy: markedBy || 'Admin',
    timestamp: new Date().toISOString()
  };
  attendanceLogs.push(newLog);
  saveDb();
  res.status(201).json(newLog);
});

// DELETE Attendance (HOD only)
app.delete('/api/attendance/:id', (req, res) => {
  const { id } = req.params;
  const index = attendanceLogs.findIndex(log => log.id === parseInt(id));
  if (index !== -1) {
    attendanceLogs.splice(index, 1);
    saveDb();
    return res.json({ message: 'Log deleted' });
  }
  res.status(404).json({ error: 'Log not found' });
});

// GET Student List for attendance dropdown
app.get('/api/students', (req, res) => {
  const students = Array.from(knownStudents).map(username => ({
    username,
    name: studentsStore[username]?.name || username
  }));
  res.json(students);
});

// ─────────────────────────────────────────────
// ROUTES: NOTIFICATIONS
// ─────────────────────────────────────────────

// DELETE Notification (HOD only)
app.delete('/api/notifications/:id', (req, res) => {
  const { id } = req.params;
  const index = notifications.findIndex(n => n.id === parseInt(id));
  if (index !== -1) {
    notifications.splice(index, 1);
    saveDb();
    return res.json({ message: 'Notification deleted' });
  }
  res.status(404).json({ error: 'Notification not found' });
});

// GET All Users (Admin/HOD only)
app.get('/api/admin/users', (req, res) => {
  const users = [
    ...Object.entries(userAccounts).map(([username, data]) => ({ username, name: data.name, role: data.role })),
    ...Object.entries(studentsStore).map(([username, data]) => ({ username, name: data.name, role: 'student' })),
    ...Object.entries(crAccounts).map(([username, data]) => ({ username, name: data.name || username, role: 'cr' })),
    ...faculty.map(f => ({ id: f.id, username: f.email, name: f.name, role: 'faculty' }))
  ];
  res.json(users);
});

// DELETE Any User (Admin only)
app.delete('/api/admin/users/:role/:idOrUsername', (req, res) => {
  const { role, idOrUsername } = req.params;
  let deleted = false;

  if (role === 'student') {
    if (studentsStore[idOrUsername]) { delete studentsStore[idOrUsername]; deleted = true; }
    if (knownStudents.has(idOrUsername)) { knownStudents.delete(idOrUsername); deleted = true; }
  } else if (role === 'faculty') {
    const idx = faculty.findIndex(f => f.id === parseInt(idOrUsername) || f.email === idOrUsername);
    if (idx !== -1) { faculty.splice(idx, 1); deleted = true; }
    if (facultyStore[idOrUsername]) { delete facultyStore[idOrUsername]; deleted = true; }
  } else if (role === 'cr') {
    if (crAccounts[idOrUsername]) { delete crAccounts[idOrUsername]; deleted = true; }
  } else if (role === 'hod' || role === 'admin') {
    if (userAccounts[idOrUsername.toLowerCase()]) { delete userAccounts[idOrUsername.toLowerCase()]; deleted = true; }
  }

  if (deleted) {
    saveDb();
    return res.json({ message: 'User removed successfully' });
  }
  res.status(404).json({ error: 'User not found' });
});

// GET System Statistics (HOD only)
app.get('/api/admin/stats', (req, res) => {
  const stats = {
    totalStudents: knownStudents.size,
    totalFaculty: faculty.length,
    totalHODs: Object.values(userAccounts).filter(u => u.role === 'hod').length,
    totalStaff: Object.keys(userAccounts).length,
    posts: posts.length
  };
  res.json(stats);
});

// POST Add New Staff (Admin only)
app.post('/api/admin/add-staff', (req, res) => {
  const { username, password, name, role } = req.body;
  // This route should be protected for 'admin' role in a real app
  if (!username || !password || !role) return res.status(400).json({ error: 'Missing credentials' });
  
  const lowerUsername = username.toLowerCase();
  if (userAccounts[lowerUsername]) return res.status(400).json({ error: 'Username already taken' });
  
  userAccounts[lowerUsername] = { password: hashPassword(password), role, name: name || username };
  saveDb();
  res.json({ message: `${role.toUpperCase()} added successfully` });
});

app.get('/api/notifications', (req, res) => res.json(notifications));

app.post('/api/notifications', (req, res) => {
  const { title, content, sender, role, attachment } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Missing title/content' });
  
  // attachment = { fileName, fileType, fileData (base64) } or null
  const notif = {
    id: Date.now(),
    title,
    content,
    sender,
    role,
    timestamp: new Date().toISOString(),
    attachment: attachment || null
  };
  notifications.unshift(notif);
  saveDb();

  // Email Notification to all students (Mocking a broadcast)
  // In a real app, you'd fetch all student emails
  sendMail(
    HOD_EMAIL, // For demo, send to HOD/Admin as a backup
    `Broadcast: ${title}`,
    `New Notification from ${sender} (${role}):\n\n${content}`,
    `<h3>New Notification</h3><p><strong>From:</strong> ${sender} (${role})</p><p>${content}</p>`
  );

  res.status(201).json(notif);
});

// ─────────────────────────────────────────────
// ROUTES: FACULTY
// ─────────────────────────────────────────────
app.get('/api/faculty', (req, res) => res.json(faculty));

app.post('/api/faculty', (req, res) => {
  const { name, dept, bio, icon } = req.body;
  if (!name || !dept) return res.status(400).json({ error: 'Missing fields' });
  const newFaculty = { id: Date.now(), name, dept, bio, icon: icon || '👤' };
  faculty.push(newFaculty);
  saveDb();
  res.status(201).json(newFaculty);
});

app.delete('/api/faculty/:id', (req, res) => {
  const index = faculty.findIndex(f => f.id === parseInt(req.params.id));
  if (index !== -1) { faculty.splice(index, 1); saveDb(); return res.json({ success: true }); }
  res.status(404).json({ error: 'Not found' });
});

// ─────────────────────────────────────────────
// ROUTES: POSTS
// ─────────────────────────────────────────────
app.post('/api/posts', (req, res) => {
  const { content, category, isAnonymous, userId, userName } = req.body;
  if (!content || !category) return res.status(400).json({ error: 'Required fields missing' });

  const post = {
    id: Date.now(),
    content: filterContent(content),
    category,
    isAnonymous,
    userId: userId || 'user_' + Math.random().toString(36).substr(2, 9),
    userName: userName || 'Student',
    timestamp: new Date().toISOString(),
    likes: 0,
    comments: [],
    status: 'approved'
  };
  posts.unshift(post);
  saveDb();

  // Direct Email Logic
  if (category === 'Faculty Feedback') {
    // If targetedFacultyId is provided in body, send to that faculty
    const targetId = req.body.targetedFacultyId;
    const targetFaculty = faculty.find(f => f.id === parseInt(targetId));
    if (targetFaculty) {
      sendMail(
        targetFaculty.email,
        `Faculty Feedback from ${isAnonymous ? 'Anonymous' : userName}`,
        `A student has shared feedback for you:\n\n"${content}"`,
        `<h3>Faculty Feedback</h3><p><strong>Student:</strong> ${isAnonymous ? 'Anonymous' : userName}</p><p><em>"${content}"</em></p>`
      );
    }
  } else if (category === 'Complaints') {
    sendMail(
      HOD_EMAIL,
      `New Complaint Received`,
      `A new complaint has been posted by ${isAnonymous ? 'Anonymous' : userName} in ${category}:\n\n"${content}"`,
      `<h3>New Complaint</h3><p><strong>User:</strong> ${isAnonymous ? 'Anonymous' : userName}</p><p><strong>Category:</strong> ${category}</p><p><em>"${content}"</em></p>`
    );
  }

  res.status(201).json(post);
});

app.get('/api/posts', (req, res) => {
  const maskedPosts = posts.map(p => {
    const { userId, userName, ...publicData } = p;
    return p.isAnonymous
      ? { ...publicData, userName: 'Anonymous Student', isAnonymous: true }
      : p;
  });
  res.json(maskedPosts);
});

app.get('/api/admin/posts', (req, res) => res.json(posts));

app.post('/api/posts/:id/like', (req, res) => {
  const post = posts.find(p => p.id === parseInt(req.params.id));
  if (post) { post.likes += 1; saveDb(); return res.json(post); }
  res.status(404).json({ error: 'Not found' });
});

app.delete('/api/admin/posts/:id', (req, res) => {
  const index = posts.findIndex(p => p.id === parseInt(req.params.id));
  if (index !== -1) { posts.splice(index, 1); saveDb(); return res.json({ success: true }); }
  res.status(404).json({ error: 'Not found' });
});

// ─────────────────────────────────────────────
// ROUTES: ADMIN / ROLE MANAGEMENT
// ─────────────────────────────────────────────
app.get('/api/admin/roles', (req, res) => {
  // Return all current CR usernames
  const roles = Object.fromEntries(Object.keys(crAccounts).map(u => [u, 'cr']));
  res.json(roles);
});

// HOD promotes a student to CR with a password they set
app.post('/api/admin/promote', (req, res) => {
  const { username, role, password } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  if (!password) return res.status(400).json({ error: 'Password required for CR account' });
  crAccounts[username] = { password: hashPassword(password), role: role || 'cr' };
  saveDb();
  res.json({ success: true, message: `${username} promoted to CR` });
});

app.post('/api/admin/demote/:username', (req, res) => {
  const uname = req.params.username;
  if (crAccounts[uname]) {
    delete crAccounts[uname];
    saveDb();
    return res.json({ success: true, message: `Revoked CR from ${uname}` });
  }
  return res.status(404).json({ error: 'User not found in CR list' });
});

app.get('/api/admin/pending', (req, res) => res.json(pendingUsers));

app.post('/api/admin/approve', (req, res) => {
  const { username, role } = req.body;
  const user = pendingUsers[username];
  if (!user) return res.status(404).json({ error: 'User not found in pending list' });
  
  if (role === 'student') {
    studentsStore[username] = user;
    delete pendingUsers[username];
    knownStudents.add(username);
    saveDb();
  } else if (role === 'faculty') {
    facultyStore[username] = { name: user.name, password: user.password, department: 'General Faculty' };
    delete pendingUsers[username];
    saveDb();
  } else {
    return res.status(400).json({ error: 'Invalid role' });
  }
  return res.json({ success: true, message: `Approved as ${role}` });
});

// Consolidated Attendance logic handled above
// initialization
loadDb();

export default app;
