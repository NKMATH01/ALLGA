import 'dotenv/config';
import { db } from './index';
import { users, students, branches, examDistributions, examAttempts, exams } from './schema';
import { eq } from 'drizzle-orm';
import { hashPassword, calculateGrade } from '../utils/helpers';

async function addSongdoStudents() {
  try {
    console.log('송도점 찾기...');
    const [songdoBranch] = await db
      .select()
      .from(branches)
      .where(eq(branches.name, '송도점'))
      .limit(1);

    if (!songdoBranch) {
      console.error('송도점을 찾을 수 없습니다.');
      process.exit(1);
    }

    console.log(`송도점 ID: ${songdoBranch.id}`);

    // 중3 학생 10명 데이터
    const studentNames = [
      '김민준', '이서준', '박도윤', '정예준', '최시우',
      '강하준', '조준서', '윤지호', '장은우', '임서진'
    ];

    const createdStudents = [];

    for (let i = 0; i < studentNames.length; i++) {
      const name = studentNames[i];
      const phone = `01012340${String(i + 10).padStart(2, '0')}`; // 01012340 10~19
      const username = phone;
      const password = phone.slice(-4); // 마지막 4자리

      console.log(`\n${i + 1}. ${name} 학생 생성 중...`);

      // 사용자 생성
      const passwordHash = await hashPassword(password);
      const [user] = await db
        .insert(users)
        .values({
          username,
          passwordHash,
          role: 'student',
          name,
          phone,
          branchId: songdoBranch.id,
        })
        .returning();

      console.log(`   사용자 생성 완료: ${user.username}`);

      // 학생 생성
      const [student] = await db
        .insert(students)
        .values({
          userId: user.id,
          branchId: songdoBranch.id,
          grade: '중3',
          school: '송도중학교',
        })
        .returning();

      console.log(`   학생 생성 완료: ${student.id}`);
      createdStudents.push(student);
    }

    console.log(`\n총 ${createdStudents.length}명의 학생이 생성되었습니다.`);

    // 시험 찾기 (첫 번째 시험 사용)
    console.log('\n시험 찾기...');
    const [exam] = await db.select().from(exams).limit(1);

    if (!exam) {
      console.error('시험을 찾을 수 없습니다.');
      process.exit(1);
    }

    console.log(`시험: ${exam.title}`);

    // 배포 찾기 (송도점의 첫 번째 배포)
    const [distribution] = await db
      .select()
      .from(examDistributions)
      .where(eq(examDistributions.branchId, songdoBranch.id))
      .limit(1);

    if (!distribution) {
      console.error('배포를 찾을 수 없습니다.');
      process.exit(1);
    }

    console.log(`배포 ID: ${distribution.id}`);

    // 앞의 8명은 시험을 본 것으로 처리
    console.log('\n앞의 8명 학생에게 시험 응시 기록 생성...');
    for (let i = 0; i < 8; i++) {
      const student = createdStudents[i];
      const studentName = studentNames[i];

      // 랜덤 점수 생성 (60~100점)
      const randomScore = Math.floor(Math.random() * 41) + 60;
      const maxScore = exam.totalScore;
      const percentage = (randomScore / maxScore) * 100;
      const grade = calculateGrade(percentage);

      // 정답 개수 계산 (점수에 비례)
      const totalQuestions = exam.totalQuestions;
      const correctCount = Math.floor((randomScore / maxScore) * totalQuestions);

      // 랜덤 답안 생성
      const answers: any = {};
      const questionsData = exam.questionsData as any[];

      // correctCount만큼 정답(1)으로, 나머지는 오답(2~5 중 랜덤)
      const shuffledQuestions = [...questionsData].sort(() => Math.random() - 0.5);

      for (let j = 0; j < questionsData.length; j++) {
        const question = questionsData[j];
        const questionNum = question.number || question.questionNumber;

        if (j < correctCount) {
          // 정답
          answers[questionNum] = 1;
        } else {
          // 오답 (2~5 중 랜덤)
          answers[questionNum] = Math.floor(Math.random() * 4) + 2;
        }
      }

      const now = new Date();
      const startedAt = new Date(now.getTime() - Math.floor(Math.random() * 24 * 60 * 60 * 1000)); // 지난 24시간 이내

      const [attempt] = await db
        .insert(examAttempts)
        .values({
          examId: exam.id,
          studentId: student.id,
          distributionId: distribution.id,
          answers,
          score: randomScore,
          maxScore,
          grade,
          correctCount,
          startedAt,
          submittedAt: now,
          gradedAt: now,
        })
        .returning();

      console.log(`   ${studentName}: ${randomScore}점 (${correctCount}/${totalQuestions} 정답, ${grade}등급)`);
    }

    console.log('\n뒤의 2명은 시험을 보지 않은 상태로 유지됩니다.');
    console.log(`   ${studentNames[8]}: 미응시`);
    console.log(`   ${studentNames[9]}: 미응시`);

    console.log('\n✅ 송도점 중3 학생 10명 생성 완료!');
    console.log('   - 시험 응시: 8명');
    console.log('   - 미응시: 2명');

    process.exit(0);
  } catch (error) {
    console.error('오류 발생:', error);
    process.exit(1);
  }
}

addSongdoStudents();
