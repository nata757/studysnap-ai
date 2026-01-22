import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ConfidenceBadge } from '@/components/ai/ConfidenceBadge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Flashcard } from '@/lib/types';
import { SPACED_REPETITION_INTERVALS } from '@/lib/constants';
import { addDays, format } from 'date-fns';
import { Check, X, Eye, PartyPopper } from 'lucide-react';

export default function Review() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(0);

  useEffect(() => {
    if (!user) return;

    const fetchDueCards = async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const { data } = await supabase
        .from('flashcards')
        .select('*')
        .lte('due_date', today)
        .order('due_date', { ascending: true });

      if (data) {
        setCards(data as Flashcard[]);
      }
      setLoading(false);
    };

    fetchDueCards();
  }, [user]);

  const handleAnswer = async (knew: boolean) => {
    const card = cards[currentIndex];
    if (!card) return;

    let newStage = card.stage;
    let newDueDate: Date;

    if (knew) {
      newStage = Math.min(card.stage + 1, 3);
      const interval = SPACED_REPETITION_INTERVALS[newStage];
      newDueDate = addDays(new Date(), interval);
    } else {
      newStage = 0;
      newDueDate = addDays(new Date(), 1);
    }

    await supabase
      .from('flashcards')
      .update({
        stage: newStage,
        due_date: format(newDueDate, 'yyyy-MM-dd'),
      })
      .eq('id', card.id);

    setCompleted((prev) => prev + 1);
    setShowAnswer(false);
    setCurrentIndex((prev) => prev + 1);
  };

  const currentCard = cards[currentIndex];
  const progress = cards.length > 0 ? (completed / cards.length) * 100 : 0;
  const remaining = cards.length - currentIndex;

  if (loading) {
    return (
      <AppLayout title={t('review.title')} showLogo={false}>
        <div className="flex h-64 items-center justify-center">
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      </AppLayout>
    );
  }

  if (cards.length === 0 || !currentCard) {
    return (
      <AppLayout title={t('review.title')} showLogo={false}>
        <div className="flex h-64 flex-col items-center justify-center gap-4">
          {completed > 0 ? (
            <>
              <PartyPopper className="h-16 w-16 text-primary" />
              <p className="text-xl font-semibold">{t('review.complete')}</p>
            </>
          ) : (
            <p className="text-muted-foreground">{t('review.noCards')}</p>
          )}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={t('review.title')} showLogo={false}>
      <div className="space-y-6">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('review.remaining')}: {remaining}</span>
            <span className="text-muted-foreground">{completed}/{cards.length}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Flashcard */}
        <Card className="min-h-[300px]">
          <CardContent className="flex flex-col items-center justify-center p-6 text-center">
            <ConfidenceBadge 
              confidence={currentCard.confidence as 'high' | 'medium' | 'low'} 
              className="mb-4"
            />
            
            <div className="mb-6 text-lg">
              <p className="font-medium">{currentCard.question}</p>
            </div>

            {showAnswer ? (
              <div className="w-full space-y-4">
                <div className="rounded-lg bg-muted p-4">
                  <p>{currentCard.answer}</p>
                </div>
                
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() => handleAnswer(false)}
                  >
                    <X className="mr-2 h-4 w-4" />
                    {t('review.didntKnow')}
                  </Button>
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => handleAnswer(true)}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    {t('review.knew')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button onClick={() => setShowAnswer(true)} size="lg">
                <Eye className="mr-2 h-4 w-4" />
                {t('review.showAnswer')}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
