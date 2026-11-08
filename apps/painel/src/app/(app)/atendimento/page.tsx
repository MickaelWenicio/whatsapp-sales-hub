import { Suspense } from 'react';
import { Atendimento, AtendimentoSkeleton } from '@/components/atendimento/atendimento';

export default function Pagina() {
  return (
    <Suspense fallback={<AtendimentoSkeleton />}>
      <Atendimento />
    </Suspense>
  );
}
