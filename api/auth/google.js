import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Mock database of staff
const staffDatabase = {
  'hod@gvsuniversity.edu.in': { role: 'staff', name: 'HOD Architecture', level: 'hod' },
  'faculty@gvsuniversity.edu.in': { role: 'staff', name: 'Dr. GVS', level: 'faculty' },
};

export default async function handler(req, res) {
  // Set CORS headers for Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub } = payload;

    // Check if user is staff
    let userRole = 'student';
    let userLevel = null;

    if (staffDatabase[email]) {
      const staffInfo = staffDatabase[email];
      userRole = staffInfo.role || 'staff';
      userLevel = staffInfo.level;
    }

    // Create JWT token for your app
    const authToken = jwt.sign(
      {
        email,
        name,
        picture,
        sub,
        role: userRole,
        level: userLevel,
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      token: authToken,
      email,
      name,
      picture,
      role: userRole === 'staff' ? userLevel : userRole, // Mapping to frontend roles
      user: {
        name,
        role: userRole === 'staff' ? userLevel : userRole,
        email,
        picture
      },
      message: `Welcome, ${name}!`,
    });
  } catch (error) {
    console.error('Google auth error:', error);
    return res.status(401).json({
      success: false,
      error: 'Google authentication failed',
    });
  }
}
