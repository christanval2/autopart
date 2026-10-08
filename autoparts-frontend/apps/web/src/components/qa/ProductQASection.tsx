// ── Q&A produit (V3) : questions publiques, réponses vendeur ──
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HelpCircle, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardContent, Textarea } from '@autoparts/ui';
import { qaApi } from '@autoparts/api';
import { formatDate } from '@autoparts/utils';
import { useAuthStore } from '@/store/auth.store';

export function ProductQASection({ productId }: { productId: string }) {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [question, setQuestion] = useState('');
  const [answerFor, setAnswerFor] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');

  const { data: questions = [] } = useQuery({
    queryKey: ['qa', productId],
    queryFn: () => qaApi.forProduct(productId),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['qa', productId] });

  const canAnswer = (user?.roles ?? []).some(
    (r) => r === 'seller' || r === 'org_admin' || r === 'super_admin',
  );

  const ask = useMutation({
    mutationFn: () => qaApi.ask(productId, question),
    onSuccess: () => {
      toast.success('Question envoyée — le vendeur est notifié');
      setQuestion('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reply = useMutation({
    mutationFn: (id: string) => qaApi.answer(id, answer),
    onSuccess: () => {
      toast.success('Réponse publiée');
      setAnswerFor(null);
      setAnswer('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {user && (
        <Card>
          <CardContent className="space-y-3">
            <h3 className="text-sm font-semibold">Poser une question</h3>
            <Textarea
              placeholder="Ex. Est-ce compatible avec Toyota Hilux 2018 ?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <Button size="sm" loading={ask.isPending} disabled={question.trim().length < 5} onClick={() => ask.mutate()}>
              Publier la question
            </Button>
          </CardContent>
        </Card>
      )}

      {questions.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Aucune question pour le moment — soyez le premier !
        </p>
      ) : (
        questions.map((q) => (
          <Card key={q.id}>
            <CardContent className="space-y-2">
              <div className="flex items-start gap-2">
                <HelpCircle strokeWidth={1.5} className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{q.question}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {q.user ? `${q.user.firstName} ${q.user.lastName.charAt(0)}.` : 'Client'} · {formatDate(q.createdAt)}
                  </p>
                </div>
              </div>

              {q.answer ? (
                <div className="ml-6 flex items-start gap-2 rounded-input bg-muted/50 p-3">
                  <MessageSquare strokeWidth={1.5} className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                  <div>
                    <p className="text-sm">{q.answer}</p>
                    <Badge tone="success" className="mt-1">Réponse vendeur</Badge>
                  </div>
                </div>
              ) : canAnswer ? (
                <div className="ml-6">
                  {answerFor === q.id ? (
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Votre réponse (mise en avant sur la fiche)…"
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" loading={reply.isPending} disabled={answer.trim().length < 3} onClick={() => reply.mutate(q.id)}>
                          Répondre
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setAnswerFor(null)}>Annuler</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => { setAnswerFor(q.id); setAnswer(''); }}>
                      Répondre en tant que vendeur
                    </Button>
                  )}
                </div>
              ) : (
                <p className="ml-6 text-xs text-muted-foreground">En attente de réponse du vendeur.</p>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
