import express from 'express';
import OpenAI from 'openai';
import { db } from '../db/index';
import { aiReports, examAttempts, exams, students, users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { escapeHtml } from '../utils/helpers';

const router = express.Router();

if (!process.env.OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY not set. AI report generation will not work.');
}

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
