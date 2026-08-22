import express from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import { db } from '../db/index';
import { exams, examAttempts, examDistributions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { log, errorFields } from '../utils/logger';

const router = express.Router();

/**
 * questionsData 배열을 검증한다. 문제가 있으면 오류 메시지, 정상이면 null.
 * - 비어있지 않은 배열
 * - 각 문항의 correctAnswer 는 1~5 정수
 * - totalQuestions 가 함께 왔다면 문항 수와 일치
 */
function validateQuestionsData(questionsData: any, totalQuestions?: any): string | null {
  if (!Array.isArray(questionsData) || questionsData.length === 0) {
    return 'questionsData 는 비어있지 않은 배열이어야 합니다.';
  }

  if (totalQuestions !== undefined && Number(totalQuestions) !== questionsData.length) {
    return `총 문항 수(${totalQuestions})와 문항 데이터 개수(${questionsData.length})가 일치하지 않습니다.`;
  }

  for (let i = 0; i < questionsData.length; i++) {
    const q = questionsData[i];
    if (!q || typeof q !== 'object') {
      return `${i + 1}번째 문항 데이터가 올바르지 않습니다.`;
    }

    const answer = Number(q.correctAnswer ?? q.answer);
    if (!Number.isInteger(answer) || answer < 1 || answer > 5) {
      const label = q.number ?? q.questionNumber ?? i + 1;
      return `${label}번 문항의 정답이 올바르지 않습니다. 정답은 1~5 사이의 정수여야 합니다.`;
    }
  }

  return null;
}

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
    log.error('exam.get_exams_failed', errorFields(error));
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
    log.error('exam.get_available_exams_failed', errorFields(error));
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
    log.error('exam.get_exam_failed', errorFields(error));
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

    const validationError = validateQuestionsData(questionsData, totalQuestions);
    if (validationError) {
      return res.status(400).json({ message: validationError });
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
    log.error('exam.create_exam_failed', errorFields(error));
    res.status(500).json({ message: '시험 생성 중 오류가 발생했습니다.' });
  }
});

// PATCH /api/exams/:id - 시험 수정
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // 허용된 필드만 화이트리스트로 필터링
    const allowedFields = [
      'title',
      'subject',
      'grade',
      'description',
      'overallReview',
      'examTrends',
      'questionsData',
      'totalQuestions',
      'totalScore',
    ];
    const updateData: Record<string, any> = {};

    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        updateData[key] = req.body[key];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: '수정할 필드가 없습니다.' });
    }

    // questionsData 를 수정하면 정답·개수를 검증하고 파생값(문항수·총점)을 함께 맞춘다
    if (updateData.questionsData !== undefined) {
      const validationError = validateQuestionsData(
        updateData.questionsData,
        updateData.totalQuestions
      );
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      const questions = updateData.questionsData as any[];
      updateData.totalQuestions = questions.length;
      updateData.totalScore = questions.reduce(
        (sum: number, q: any) => sum + (Number(q.points ?? q.score) || 0),
        0
      );
    } else if (updateData.totalQuestions !== undefined || updateData.totalScore !== undefined) {
      // 문항 데이터 없이 문항수/총점만 바꾸면 채점 결과와 어긋나므로 거부
      return res.status(400).json({
        message: '총 문항 수·총점은 문항 데이터(questionsData)와 함께 수정해야 합니다.',
      });
    }

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
    log.error('exam.update_exam_failed', errorFields(error));
    res.status(500).json({ message: '시험 수정 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/exams/:id - 시험 삭제
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const force = req.query.force === 'true';

    // 존재하지 않는 id 에 성공 응답하지 않는다
    const [exam] = await db.select().from(exams).where(eq(exams.id, id)).limit(1);
    if (!exam) {
      return res.status(404).json({ message: '시험을 찾을 수 없습니다.' });
    }

    // 응시 기록이 있으면 기본적으로 거부 (cascade 로 성적·보고서가 함께 사라지므로)
    const attempts = await db
      .select({ id: examAttempts.id })
      .from(examAttempts)
      .where(eq(examAttempts.examId, id));

    if (attempts.length > 0 && !force) {
      const distributions = await db
        .select({ id: examDistributions.id })
        .from(examDistributions)
        .where(eq(examDistributions.examId, id));

      return res.status(409).json({
        message: `응시 기록 ${attempts.length}건이 존재합니다. 삭제하면 성적과 AI 보고서도 함께 삭제됩니다.`,
        attemptCount: attempts.length,
        distributionCount: distributions.length,
        hint: '그래도 삭제하려면 force=true 로 다시 요청하세요.',
      });
    }

    await db.delete(exams).where(eq(exams.id, id));

    res.json({
      success: true,
      message: '시험이 삭제되었습니다.',
      deletedAttempts: attempts.length,
    });
  } catch (error) {
    log.error('exam.delete_exam_failed', errorFields(error));
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
    let questionsEndIndex = 3;

    // 문항 블록은 4행(index 3)부터 시작해 빈 행이 나올 때까지. 상한을 45문항으로
    // 하드코딩하면 그 이후 문항이 조용히 잘리므로 실제 데이터 길이를 따른다.
    for (let i = 3; i < data.length; i++) {
      const row = data[i];

      // 빈 행 = 문항 블록의 끝 (이후는 출제경향·총평 영역)
      if (!row || row[0] === undefined || row[0] === null || String(row[0]).trim() === '') {
        break;
      }

      const questionNumber = parseInt(String(row[0]));
      if (isNaN(questionNumber)) {
        // 아직 문항을 하나도 못 읽었으면 헤더 행으로 보고 건너뛴다.
        // 이미 읽었다면 문항 블록이 끝난 것이므로 중단한다.
        if (questionsData.length === 0) continue;
        break;
      }

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
      questionsEndIndex = i + 1;
    }

    if (questionsData.length === 0) {
      return res.status(400).json({ message: '문제 데이터를 찾을 수 없습니다.' });
    }

    // Calculate total score
    const totalScore = questionsData.reduce((sum, q) => sum + q.points, 0);

    // Parse exam trends (표준 양식은 50~52행 = index 49~51).
    // 문항이 45개를 넘어 블록이 그 아래까지 내려온 경우 문항 행을 경향으로 잘못 읽지 않도록
    // 시작 위치를 문항 블록 끝 이후로 민다.
    const trendsStart = Math.max(49, questionsEndIndex);
    const examTrends: any[] = [];
    for (let i = trendsStart; i < trendsStart + 3 && i < data.length; i++) {
      const row = data[i];
      if (row && row[0] && row[1]) {
        examTrends.push({
          questionNumbers: String(row[0]),
          description: String(row[1]),
        });
      }
    }

    // Parse overall review (표준 양식은 54행 = index 53). 위와 같은 이유로 하한을 민다.
    const overallReview = data[Math.max(53, trendsStart + 4)]?.[0] || '';

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
    log.error('exam.upload_exam_failed', errorFields(error));
    res.status(500).json({ message: '시험 업로드 중 오류가 발생했습니다.' });
  }
});

export default router;
