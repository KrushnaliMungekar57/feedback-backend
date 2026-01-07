import express from 'express';
import cors from 'cors';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// In-memory storage
let submissions = [];

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'API is running', 
    endpoints: ['/api/submit', '/api/submissions'],
    totalSubmissions: submissions.length
  });
});

// Submit review endpoint
app.post('/api/submit', async (req, res) => {
  try {
    const { rating, review } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ 
        error: 'Invalid rating. Must be between 1 and 5.' 
      });
    }

    const reviewText = review?.trim() || '';

    // Generate user response
    const userCompletion = await groq.chat.completions.create({
      messages: [{
        role: "user",
        content: `You are a friendly customer service AI. A user submitted a ${rating}-star review: "${reviewText}". Respond in 2-3 sentences thanking them. If rating >= 4: show appreciation. If rating <= 3: show empathy. Be warm and professional.`
      }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 200
    });
    const userResponse = userCompletion.choices[0]?.message?.content || "Thank you for your feedback!";

    // Generate summary
    const summaryCompletion = await groq.chat.completions.create({
      messages: [{
        role: "user",
        content: `Summarize this ${rating}-star review in 1-2 sentences: "${reviewText}". If empty, summarize based on rating only.`
      }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.5,
      max_tokens: 150
    });
    const summary = summaryCompletion.choices[0]?.message?.content || `${rating}-star rating submitted.`;

    // Generate actions
    const actionsCompletion = await groq.chat.completions.create({
      messages: [{
        role: "user",
        content: `Based on this ${rating}-star review: "${reviewText}", suggest 2-3 specific actionable recommendations for the business. Format as a numbered list.`
      }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.6,
      max_tokens: 200
    });
    const actions = actionsCompletion.choices[0]?.message?.content || "Continue monitoring feedback.";

    const submission = {
      id: Date.now().toString(),
      rating,
      review: reviewText,
      userResponse,
      summary,
      recommendedActions: actions,
      timestamp: new Date().toISOString()
    };

    submissions.unshift(submission);

    if (submissions.length > 100) {
      submissions = submissions.slice(0, 100);
    }

    res.json({
      success: true,
      message: submission.userResponse,
      submissionId: submission.id
    });

  } catch (error) {
    console.error('Error processing submission:', error);
    
    res.status(500).json({
      error: 'Failed to process submission',
      message: error.message || 'Unknown error occurred'
    });
  }
});

// Get all submissions (admin endpoint)
app.get('/api/submissions', (req, res) => {
  try {
    // Calculate statistics
    const stats = {
      total: submissions.length,
      byRating: {
        1: submissions.filter(s => s.rating === 1).length,
        2: submissions.filter(s => s.rating === 2).length,
        3: submissions.filter(s => s.rating === 3).length,
        4: submissions.filter(s => s.rating === 4).length,
        5: submissions.filter(s => s.rating === 5).length
      },
      averageRating: submissions.length > 0
        ? (submissions.reduce((sum, s) => sum + s.rating, 0) / submissions.length).toFixed(2)
        : 0
    };

    res.json({
      submissions,
      stats
    });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ 
      error: 'Failed to fetch submissions',
      message: error.message 
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📍 API URL: http://localhost:${PORT}`);
});

// Export for serverless platforms
export default app;