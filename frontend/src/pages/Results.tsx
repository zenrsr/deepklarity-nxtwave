import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ResultSummary from '../components/ResultSummary';
import QuizDisplay from '../components/QuizDisplay';
import type { GradeResponse, QuizResponse } from '../api/types';
import Spinner from '../components/Spinner';
import { Button } from '@/components/ui/button';

export default function Results() {
  const nav = useNavigate();
  const { state } = useLocation() as {
    state?: { quiz: QuizResponse; result: GradeResponse };
  };

  useEffect(() => {
    if (!state?.quiz || !state?.result) {
      nav('/');
    }
  }, [state, nav]);

  if (!state?.quiz || !state?.result) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <Spinner label="Loading results..." />
      </div>
    );
  }

  const { quiz, result } = state;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-16 pt-12 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-lg ring-1 ring-slate-900/5 backdrop-blur-sm sm:p-8">
          <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">{quiz.full_quiz_data.title}</h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
            {quiz.full_quiz_data.summary}
          </p>
          <div className="mt-4 inline-flex items-center gap-3 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600">
            Score: <span className="text-slate-900">{result.correct}</span> / {result.total} (
            {Math.round(result.score)}%)
          </div>
        </header>

        <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-lg ring-1 ring-slate-900/5 backdrop-blur-sm sm:p-8">
          <QuizDisplay payload={quiz.full_quiz_data} />
        </div>

        <ResultSummary result={result} questions={quiz.full_quiz_data.quiz} />

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            variant="outline"
            className="rounded-xl border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700"
            onClick={() => nav(`/quiz/${quiz.id}`)}
          >
            Review questions
          </Button>
          <Button
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-black shadow-lg shadow-blue-600/20 hover:bg-blue-700"
            onClick={() => nav('/')}
          >
            Generate another quiz
          </Button>
        </div>
      </div>
    </div>
  );
}
