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

interface AddContactRequest {
  name: string;
  email: string;
  country_code: number;
  number: number;
  created_by: string;
}

interface UserResponse {
  id: string;
  username: string;
}

interface ContactResponse {
  id: string;
  name: string;
  email: string;
  country_code: number;
  number: number;
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

app.post('/api/contacts/addContact', async (req: Request<{}, {}, AddContactRequest>, res: Response) => {
  try {
    const { name, email, country_code, number, created_by } = req.body;

    // Check if user exists
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', created_by)
      .single();

    if (userError || !userData) {
      return res.status(401).json({ error: 'User not found' });
    } 

    // Check if contact already exists
    const { data: existingContact, error: existingContactError } = await supabase
      .from('contacts')
      .select('id')
      .eq('email', email)
      .eq('phone_number->country_code', country_code)
      .eq('phone_number->number', number)
      .single();

    if (existingContact) {
      return res.status(400).json({ error: 'Contact already exists' });
    }

    // Create new contact
    const { data: newContact, error: newContactError } = await supabase
      .from('contacts')
      .insert([
        {
          name,
          email,
          phone_number: {
            country_code,
            number
          },
          created_by
        }
      ])
      .select()
      .single();

    if (newContactError) throw newContactError;

    const response: { message: string; contact: ContactResponse } = {
      message: 'Contact added successfully',
      contact: {
        id: newContact.id,
        name: newContact.name,
        email: newContact.email,
        country_code: newContact.country_code,
        number: newContact.number
      }
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Add contact error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'An error occurred' });
  }
});

app.get('/api/contacts/getContacts', async (req: Request, res: Response) => {
  try {
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('*')
      .eq('created_by', req.body.created_by);
      
    res.status(200).json(contacts);
  } catch (error) {
  console.error('Get contacts error:', error);
  res.status(500).json({ error: error instanceof Error ? error.message : 'An error occurred' });
}
});


// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});