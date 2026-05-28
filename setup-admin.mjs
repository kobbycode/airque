/**
 * Setup Script: Create Initial Admin Account
 * 
 * Run this script to create the first admin account for the platform.
 * Usage: node setup-admin.mjs <email> <password> <firstName> <lastName>
 * 
 * Example: node setup-admin.mjs admin@example.com password123 Admin User
 */

import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load Firebase config from .env.local or use environment variables
let firebaseConfig;
try {
  const envPath = join(__dirname, '.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  const envVars = {};
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      envVars[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
    }
  });
  
  firebaseConfig = {
    apiKey: envVars.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: envVars.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: envVars.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: envVars.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: envVars.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: envVars.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
} catch (err) {
  console.error('Error loading .env.local file:', err.message);
  console.error('Make sure .env.local exists in the project root with Firebase configuration.');
  process.exit(1);
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function createAdminAccount(email, password, firstName, lastName) {
  try {
    console.log(`Creating admin account for: ${email}`);
    
    // Create Firebase Auth user
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const { uid } = userCredential.user;
    
    console.log(`✓ Firebase Auth user created with UID: ${uid}`);
    
    // Set user role to admin in Firestore
    await setDoc(doc(db, 'users', uid), {
      email,
      firstName,
      lastName,
      role: 'admin',
      createdAt: serverTimestamp(),
    }, { merge: true });
    
    console.log('✓ User document created with admin role');
    
    // Also add to creators collection for consistency
    await setDoc(doc(db, 'creators', uid), {
      uid,
      firstName,
      lastName,
      email,
      role: 'admin',
      createdAt: serverTimestamp(),
    }, { merge: true });
    
    console.log('✓ Creator document created');
    
    console.log('\n✅ Admin account created successfully!');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log(`Name: ${firstName} ${lastName}`);
    console.log(`Role: admin`);
    console.log('\nYou can now sign in at: http://localhost:3000/login');
    
  } catch (err) {
    console.error('❌ Error creating admin account:', err.message);
    
    if (err.code === 'auth/email-already-in-use') {
      console.error('\nA user with this email already exists.');
      console.error('To make them an admin, manually update their role in Firebase Console:');
      console.error(`1. Go to Firestore Database → users → ${email}`);
      console.error(`2. Change the 'role' field to 'admin'`);
    }
    
    process.exit(1);
  }
}

// Get command line arguments
const args = process.argv.slice(2);
if (args.length < 4) {
  console.log('Usage: node setup-admin.mjs <email> <password> <firstName> <lastName>');
  console.log('Example: node setup-admin.mjs admin@example.com password123 Admin User');
  process.exit(1);
}

const [email, password, firstName, lastName] = args;

// Validate inputs
if (!email.includes('@')) {
  console.error('Invalid email address');
  process.exit(1);
}

if (password.length < 6) {
  console.error('Password must be at least 6 characters');
  process.exit(1);
}

// Create admin account
createAdminAccount(email, password, firstName, lastName)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
