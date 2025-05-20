import express, { Request, Response } from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js'
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

interface User {
  id: string;
  username: string;
  email: string;
  password: string;
}

interface SignupRequest {
  username: string;
  email: string;
  password: string;
}

interface LoginRequest {
  username: string;
  password: string;
}

interface UserResponse {
  id: string;
  username: string;
}

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Hello endpoint
app.get('/', (req: Request, res: Response) => {
  res.json("Hello from the backend!");
});

// Signup endpoint
app.post('/api/signup', async (req: Request<{}, {}, SignupRequest>, res: Response) => {
  try {
    const { username, email, password } = req.body;

    // Check if username already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Create user in users table
    const { data: userData, error: insertError } = await supabase
      .from('users')
      .insert([
        {
          username,
          email,
          password // Note: In production, you should hash the password
        }
      ])
      .select()
      .single();

    if (insertError) throw insertError;

    const response: { message: string; user: UserResponse } = {
      message: 'User created successfully',
      user: {
        id: userData.id,
        username: userData.username
      }
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'An error occurred' });
  }
});

// Login endpoint
app.post('/api/login', async (req: Request<{}, {}, LoginRequest>, res: Response) => {
  try {
    const { username, password } = req.body;

    // Check credentials in users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single();

    if (userError || !userData) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const response: { message: string; user: UserResponse } = {
      message: 'Login successful',
      user: {
        id: userData.id,
        username: userData.username
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'An error occurred' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});