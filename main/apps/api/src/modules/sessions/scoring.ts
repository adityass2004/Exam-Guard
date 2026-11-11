export interface ScoringQuestion {
  id: string;
  points: number;
  correctOptionId: string | null;
}

export interface ScoringAnswer {
  questionId: string;
  optionId: string | null;
}

export interface ScoreResult {
  score: number;
  maxScore: number;
  percentage: number;
}

export function computeExamScore(
  questions: ScoringQuestion[],
  answers: ScoringAnswer[]
): ScoreResult {
  const answerMap = new Map<string, string | null>();
  for (const ans of answers) {
    answerMap.set(ans.questionId, ans.optionId);
  }

  let totalScore = 0;
  let maxScore = 0;

  for (const q of questions) {
    maxScore += q.points;
    const selectedOption = answerMap.get(q.id);
    if (selectedOption && q.correctOptionId && selectedOption === q.correctOptionId) {
      totalScore += q.points;
    }
  }

  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 10000) / 100 : 0;

  return {
    score: totalScore,
    maxScore,
    percentage,
  };
}

