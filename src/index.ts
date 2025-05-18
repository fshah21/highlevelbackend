import express, { response } from 'express';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.json());

// Mock function to generate interview questions using a free LLM
const generateInterviewQuestions = async (resume: string, jobDescription: string): Promise<string[]> => {
  console.log("IN GENERATE INTERVIEW QUESTIONS NOWWW");
  const prompt = `
You are an AI interviewer.

Given this **resume**:
---
${resume}
---

And this **job description**:
---
${jobDescription}
---

Generate 5 tailored interview question that test the candidate's fit for the role. Keep the questions clear and relevant. There should be no numbers in the beginning.
`;

  try {
    console.log("OPENROUTER_API_KEY", process.env.OPENROUTER_API_KEY);
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'mistralai/mistral-7b-instruct',
        messages: [
          { role: 'system', content: 'You are an AI assistant that generates job interview questions.' },
          { role: 'user', content: prompt }
        ],
      },
      {
        headers: {
          'HTTP-Referer': 'https://github.com/fshah21/ai-interview-backend',
          'X-Title': 'AI Interview Backend',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const rawOutput = response.data.choices[0].message.content;
    
    // Optionally parse questions (split by lines or bullets)
    const questions = rawOutput
      .split(/\n+/)
      .filter((q: string)=> q.trim().length > 0)
      .map((q: string) => q.replace(/^\d+\.?\s*/, '').trim());

    return questions;
  } catch (err: any) {
    console.error('LLM API Error:', err.response?.data || err.message);
    throw new Error('Failed to get interview questions from LLM');
  }
};

// Mock function to generate feedback based on responses
const generateFeedback = async (responses: string[]): Promise<string> => {
  // In a real app, this would call an LLM API
  const prompt = `
You are an AI interviewer providing feedback on a candidate's interview performance.

Given these responses from the candidate:
---
${responses.join('\n\n')}
---

Please provide detailed feedback on:
1. Communication skills
2. Technical knowledge
3. Problem-solving abilities
4. Areas for improvement
5. Overall assessment

Keep the feedback constructive and specific.`;

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'mistralai/mistral-7b-instruct',
        messages: [
          { role: 'system', content: 'You are an AI assistant that provides detailed interview feedback.' },
          { role: 'user', content: prompt }
        ],
      },
      {
        headers: {
          'HTTP-Referer': 'https://github.com/fshah21/ai-interview-backend',
          'X-Title': 'AI Interview Backend',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (err: any) {
    console.error('LLM API Error:', err.response?.data || err.message);
    throw new Error('Failed to generate feedback');
  }
};

// Endpoint to start the interview
const upload = multer();

app.post('/api/start-interview', upload.fields([{ name: 'resume' }, { name: 'jobDescription' }]), async (req, res) => {
  try {
    console.log("START INTERVIEW ENDPOINT");
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    if (!files?.resume?.[0] || !files?.jobDescription?.[0]) {
      return res.status(400).json({ error: 'Resume and job description files are required' });
    }

    const resumeFile = files.resume[0];
    const jdFile = files.jobDescription[0];

    const resumeText = await extractText(resumeFile);
    const jobDescriptionText = await extractText(jdFile);

    // Generate a unique interview ID using timestamp and random string
    const interviewId = `interview_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    console.log(interviewId);

    // Store the resume and job description texts against the interview ID
    const { data: savedData, error: saveError } = await supabase
      .from('interview_data')
      .insert({
        id: interviewId,
        resume_text: resumeText,
        job_description: jobDescriptionText
      });
    
    console.log('Supabase save attempt:', {
      success: !saveError,
      data: savedData,
      error: saveError
    });

    if (saveError) throw saveError;

    const questions = await generateInterviewQuestions(resumeText, jobDescriptionText);
    console.log("QUESTIONS", questions);
    
    // Save questions to Supabase
    const { data, error } = await supabase
      .from('interviews')
      .upsert({
        id: interviewId,
        current_question_id: 0,
        questions: questions,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
    if (error) {
      console.log(error);
      throw error;
    }
    res.json({ interviewId, current_question: questions[0] });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Failed to generate questions' });
  }
});

const extractText = async (file: Express.Multer.File): Promise<string> => {
  const mime = file.mimetype;

  if (mime === 'application/pdf') {
    const data = await pdfParse(file.buffer);
    return data.text;
  }

  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
  }

  if (mime.startsWith('text/')) {
    return file.buffer.toString('utf-8');
  }

  throw new Error(`Unsupported file type: ${mime}`);
};

// Endpoint to end the interview and generate feedback
app.post('/api/end-interview', async (req, res) => {
  const { interviewId } = req.body;
  try {
    const { data: interviewData, error: fetchError } = await supabase
    .from('interviews')
    .select('responses, questions')
    .eq('id', interviewId)
    .single();

    if (fetchError) throw fetchError;

    // Initialize or update responses array
    const responses = interviewData?.responses || [];
    const feedback = await generateFeedback(responses);
    console.log("FEEDBACK", feedback);
    // Save feedback to Supabase
    const { data, error } = await supabase
      .from('interviews')
      .upsert({
        id: interviewId,
        feedback: feedback,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
    if (error) throw error;
    res.json({ feedback });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Failed to generate feedback' });
  }
});

app.post('/api/get-next-question', async (req, res) => {
  const { response, interviewId, current_question_id } = req.body;
  try {
    // Get existing interview data
    const { data: interviewData, error: fetchError } = await supabase
      .from('interviews')
      .select('responses, questions')
      .eq('id', interviewId)
      .single();

    if (fetchError) throw fetchError;

    // Initialize or update responses array
    const responses = interviewData?.responses || [];
    responses.push(response);

    // Save updated responses to Supabase
    const { data, error } = await supabase
      .from('interviews')
      .upsert({
        id: interviewId,
        responses: responses,
        updated_at: new Date().toISOString()
      });
      
    if (error) throw error;

    // Get next question
    const nextQuestionId = current_question_id + 1;
    const questions = interviewData.questions;
    const nextQuestion = questions[nextQuestionId];

    console.log("NEXT QUESTION", nextQuestion);
    console.log("NEXT QUESTION ID", nextQuestionId);
    console.log("RESPONSES", responses);
    console.log("QUESTIONS DATA", questions);

    res.json({ 
      question: nextQuestion,
      current_question_id: nextQuestionId
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Failed to process next question' });
  }
});

app.get('/', (req, res) => {
  res.send('Hello from the backend!');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});