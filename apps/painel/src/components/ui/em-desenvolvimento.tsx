'use client';

import { useState, type ReactNode } from 'react';
import { Construction } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Modal padrão para recursos que existem só como visual no protótipo.
 * Uso: envolva o gatilho com <EmDesenvolvimento recurso="Convidar pessoas">...</EmDesenvolvimento>
 * ou controle com `aberto`/`onAbertoChange`.
 */
export function EmDesenvolvimentoDialog({
  aberto,
  onAbertoChange,
  recurso,
  detalhe,
}: {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  recurso: string;
  detalhe?: string;
}) {
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-[var(--color-pau-bg)] text-[var(--color-pau-fg)]">
            <Construction className="size-5" aria-hidden />
          </div>
          <DialogTitle>{recurso} está em desenvolvimento</DialogTitle>
          <DialogDescription>
            {detalhe ??
              'Este recurso faz parte da versão completa da Central Comercial e não está disponível neste protótipo.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onAbertoChange(false)}>Entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Envolve um gatilho (botão, item de menu) e abre o modal ao clicar. */
export function EmDesenvolvimento({
  recurso,
  detalhe,
  children,
}: {
  recurso: string;
  detalhe?: string;
  children: (abrir: () => void) => ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      {children(() => setAberto(true))}
      <EmDesenvolvimentoDialog aberto={aberto} onAbertoChange={setAberto} recurso={recurso} detalhe={detalhe} />
    </>
  );
}
