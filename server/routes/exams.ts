import express from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import { db } from '../db/index';
import { exams } from '../db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      cb(null, true);
    } else {
      cb(new Error('Excel 파일만 업로드 가능합니다.'));
    }
  },
});

// GET /api/exams - 시험 목록 조회
router.get('/', requireAuth, async (_req, res) => {
  try {
    const examList = await db.select().from(exams).orderBy(exams.createdAt);

    res.json({
      success: true,
      data: examList,
    });
  } catch (error) {
    console.error('Get exams error:', error);
    res.status(500).json({ message: '시험 목록 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/exams/available - 배포 가능한 시험 목록 (간소화)
router.get('/available', requireAuth, async (_req, res) => {
  try {
    const examList = await db
      .select({
        id: exams.id,
        title: exams.title,
        subject: exams.subject,
        totalQuestions: exams.totalQuestions,
        totalScore: exams.totalScore,
      })
      .from(exams)
      .orderBy(exams.createdAt);

    res.json({
      success: true,
      data: examList,
    });
  } catch (error) {
    console.error('Get available exams error:', error);
    res.status(500).json({ message: '시험 목록 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/exams/:id - 시험 상세 조회
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const [exam] = await db.select().from(exams).where(eq(exams.id, id)).limit(1);

    if (!exam) {
      return res.status(404).json({ message: '시험을 찾을 수 없습니다.' });
    }

    res.json({
      success: true,
      data: exam,
    });
  } catch (error) {
    console.error('Get exam error:', error);
    res.status(500).json({ message: '시험 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/exams - 시험 수동 생성
router.post('/', requireAdmin, async (req, res) => {
  try {
    const {
      title,
      subject,
      grade,
      description,
      totalQuestions,
      totalScore,
      questionsData,
      examTrends,
      overallReview,
    } = req.body;

    if (!title || !subject || !totalQuestions || !totalScore || !questionsData) {
      return res.status(400).json({ message: '필수 정보를 모두 입력해주세요.' });
    }

    const [exam] = await db
      .insert(exams)
      .values({
        title,
        subject,
        grade,
        description,
        totalQuestions,
        totalScore,
        questionsData,
        examTrends: examTrends || [],
        overallReview,
        createdBy: req.session.user!.id,
      })
      .returning();

    res.status(201).json({
      success: true,
      data: exam,
      message: '시험이 생성되었습니다.',
    });
  } catch (error) {
    console.error('Create exam error:', error);
    res.status(500).json({ message: '시험 생성 중 오류가 발생했습니다.' });
  }
});

// PATCH /api/exams/:id - 시험 수정
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const [exam] = await db.update(exams).set(updateData).where(eq(exams.id, id)).returning();

    if (!exam) {
      return res.status(404).json({ message: '시험을 찾을 수 없습니다.' });
    }

    res.json({
      success: true,
      data: exam,
      message: '시험이 수정되었습니다.',
    });
  } catch (error) {
    console.error('Update exam error:', error);
    res.status(500).json({ message: '시험 수정 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/exams/:id - 시험 삭제
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    await db.delete(exams).where(eq(exams.id, id));

    res.json({
      success: true,
      message: '시험이 삭제되었습니다.',
    });
  } catch (error) {
    console.error('Delete exam error:', error);
    res.status(500).json({ message: '시험 삭제 중 오류가 발생했습니다.' });
  }
});

// POST /api/exams/upload - Excel 파일로 시험 업로드
router.post('/upload', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Excel 파일을 업로드해주세요.' });
    }

    // Parse Excel file
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

    // Extract metadata from first rows
    const title = data[0]?.[0] || '제목 없음';
    const subject = data[1]?.[0] || '과목 미지정';

    // Parse questions data (starting from row 4, index 3)
    const questionsData: any[] = [];
    const seenQuestionNumbers = new Set<number>();

    for (let i = 3; i < data.length && i < 48; i++) {
      const row = data[i];
      if (!row || !row[0]) continue;

      const questionNumber = parseInt(String(row[0]));
      if (isNaN(questionNumber)) continue;

      // Skip duplicates (keep last occurrence)
      if (seenQuestionNumbers.has(questionNumber)) {
        const existingIndex = questionsData.findIndex(q => q.questionNumber === questionNumber);
        if (existingIndex >= 0) {
          questionsData.splice(existingIndex, 1);
        }
      }
      seenQuestionNumbers.add(questionNumber);

      const difficulty = row[1] || '중';
      const domain = row[2] || '미분류';  // 출제영역
      const typeAnalysis = row[3] || '';   // 유형분석
      const subcategory = row[4] || '';    // 소분류
      const explanation = row[5] || '';    // 해설
      const correctAnswer = parseInt(String(row[6]));
      const points = parseInt(String(row[7])) || 2;

      if (isNaN(correctAnswer) || isNaN(points)) {
        return res.status(400).json({
          message: `${questionNumber}번 문제의 필수 정보가 누락되었습니다.`
        });
      }

      questionsData.push({
        number: questionNumber,
        difficulty,
        domain,
        category: domain,  // domain과 category를 같은 값으로
        typeAnalysis,
        questionIntent: typeAnalysis,  // 유형분석을 출제 의도로도 사용
        subcategory,
        explanation,
        correctAnswer,
        score: points,
        points,
      });
    }

    if (questionsData.length === 0) {
      return res.status(400).json({ message: '문제 데이터를 찾을 수 없습니다.' });
    }

    // Calculate total score
    const totalScore = questionsData.reduce((sum, q) => sum + q.points, 0);

    // Parse exam trends (rows 50-52, index 49-51)
    const examTrends: any[] = [];
    for (let i = 49; i < 52 && i < data.length; i++) {
      const row = data[i];
      if (row && row[0] && row[1]) {
        examTrends.push({
          questionNumbers: String(row[0]),
          description: String(row[1]),
        });
      }
    }

    // Parse overall review (row 54, index 53)
    const overallReview = data[53]?.[0] || '';

    // Insert exam into database
    const [exam] = await db
      .insert(exams)
      .values({
        title,
        subject,
        totalQuestions: questionsData.length,
        totalScore,
        questionsData,
        examTrends,
        overallReview: String(overallReview),
        createdBy: req.session.user!.id,
      })
      .returning();

    res.json({
      success: true,
      message: '시험이 업로드되었습니다.',
      exam: {
        id: exam.id,
        title: exam.title,
        totalQuestions: exam.totalQuestions,
        totalScore: exam.totalScore,
      },
    });
  } catch (error) {
    console.error('Upload exam error:', error);
    res.status(500).json({ message: '시험 업로드 중 오류가 발생했습니다.' });
  }
});

export default router;
