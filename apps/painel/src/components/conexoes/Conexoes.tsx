'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Check,
  CheckCheck,
  CircleHelp,
  FlaskConical,
  History,
  LockKeyhole,
  MessageSquare,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  Unplug,
  UserPlus,
  UsersRound,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ListaConversasDTO, NumeroDTO, SimuladorBody } from '@sales-hub/shared';
import { ehNumeroFicticio, normalizarTelefoneBr } from '@sales-hub/shared';
import { bff } from '@/lib/bff';
import { chaves, useNumeros } from '@/lib/queries';
import { formatarDataRelativa, iniciais } from '@/lib/formatos';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DemoBadge } from '@/components/shell/DemoBadge';
import { EmDesenvolvimento } from '@/components/ui/em-desenvolvimento';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type QrDTO = { base64: string | null; pairingCode: string | null };
type PermitidosDTO = { numeros: string[] };

/** Máscara (DD) 9XXXX-XXXX sobre os dígitos; o +55 é fixo na tela. */
function mascararTelefone(valor: string): string {
  let d = valor.replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

type Modo = 'adicionar' | 'trocar';

export function Conexoes() {
  const client = useQueryClient();
  const numeros = useNumeros();
  const [aba, setAba] = useState('numeros');
  const [qrAbertoId, setQrAbertoId] = useState<string | null>(null);
  const [acao, setAcao] = useState<{ numero: NumeroDTO; tipo: 'reiniciar' | 'desconectar' } | null>(
    null,
  );
  const [form, setForm] = useState<Modo | null>(null);
  const [rotulo, setRotulo] = useState('');
  const [telefone, setTelefone] = useState('');
  const [erroForm, setErroForm] = useState('');
  const [confirmar, setConfirmar] = useState<'trocar' | 'remover' | null>(null);
  const [renomear, setRenomear] = useState<NumeroDTO | null>(null);
  const [novoRotulo, setNovoRotulo] = useState('');

  const reais = numeros.data?.filter((n) => !n.ficticio) ?? [];
  // e164 de placeholder e não conectado = ainda não configurado: mostra o estado vazio
  const atual = reais.find((n) => !ehNumeroFicticio(n.e164) || n.estado === 'conectado') ?? null;
  const pareando = !!atual && atual.estado !== 'conectado';

  // Enquanto não está conectado, consulta o estado com frequência para mostrar "Conectado" ao parear.
  useEffect(() => {
    if (!pareando) return;
    const t = setInterval(() => void numeros.refetch(), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pareando]);

  const mutation = useMutation({
    mutationFn: ({ numero, tipo }: { numero: NumeroDTO; tipo: 'reiniciar' | 'desconectar' }) =>
      bff.post(`numeros/${numero.id}/${tipo}`),
    onSuccess: async () => {
      toast.success(
        acao?.tipo === 'desconectar'
          ? 'Número desconectado.'
          : 'Reconexão solicitada. Abra o QR para parear.',
      );
      setAcao(null);
      await client.invalidateQueries({ queryKey: chaves.numeros() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const salvarNumero = useMutation({
    mutationFn: async ({ modo, e164 }: { modo: Modo; e164: string }) => {
      if (modo === 'trocar' && atual) await bff.post(`numero-operacao/${atual.id}/remover`);
      return bff.post<NumeroDTO>('numero-operacao', { rotulo: rotulo.trim(), e164 });
    },
    onSuccess: async (n) => {
      toast.success('Número adicionado. Escaneie o QR para parear.');
      setForm(null);
      setQrAbertoId(n.id);
      await client.invalidateQueries({ queryKey: chaves.numeros() });
    },
    onError: async (e: Error) => {
      setErroForm(e.message);
      await client.invalidateQueries({ queryKey: chaves.numeros() });
    },
  });

  const removerNumero = useMutation({
    mutationFn: (id: string) => bff.post(`numero-operacao/${id}/remover`),
    onSuccess: async () => {
      toast.success('Número removido.');
      setConfirmar(null);
      setQrAbertoId(null);
      await client.invalidateQueries({ queryKey: chaves.numeros() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renomearNumero = useMutation({
    mutationFn: ({ id, nome }: { id: string; nome: string }) =>
      bff.put(`numero-operacao/${id}`, { rotulo: nome }),
    onSuccess: async () => {
      toast.success('Nome atualizado.');
      setRenomear(null);
      await client.invalidateQueries({ queryKey: chaves.numeros() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function abrirForm(modo: Modo) {
    setRotulo(modo === 'trocar' ? (atual?.rotulo ?? '') : '');
    setTelefone('');
    setErroForm('');
    salvarNumero.reset();
    setForm(modo);
  }
  function enviarForm() {
    if (salvarNumero.isPending || !form) return;
    if (rotulo.trim().length < 2) {
      setErroForm('Informe o nome do número, por exemplo Comercial.');
      return;
    }
    const e164 = normalizarTelefoneBr(telefone.replace(/\D/g, ''));
    if (!e164) {
      setErroForm('Informe um celular brasileiro válido com DDD.');
      return;
    }
    setErroForm('');
    salvarNumero.mutate({ modo: form, e164 });
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold text-ink-3">Estrutura da operação</p>
          <h1 className="text-[26px] font-semibold tracking-tight">Conexões e equipe</h1>
          <p className="mt-2 text-sm text-ink-2">
            Conecte seu WhatsApp, teste o atendimento e organize os acessos.
          </p>
        </div>
        <Button
          variant="outline"
          className="h-9 cursor-pointer bg-panel"
          onClick={() => numeros.refetch()}
        >
          <RefreshCw className={numeros.isFetching ? 'animate-spin' : ''} />
          Atualizar conexões
        </Button>
      </header>
      <nav
        className="flex gap-1 overflow-x-auto border-b border-line"
        aria-label="Seções de conexões"
      >
        {[
          { id: 'numeros', nome: 'Números', I: Smartphone },
          { id: 'equipe', nome: 'Equipe e permissões', I: UsersRound },
          { id: 'demonstracao', nome: 'Ambiente de demonstração', I: FlaskConical },
        ].map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={cn(
              'flex shrink-0 cursor-pointer items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold focus-visible:outline-sinal',
              aba === a.id
                ? 'border-sinal text-sinal-forte'
                : 'border-transparent text-ink-3 hover:text-ink',
            )}
            aria-current={aba === a.id ? 'page' : undefined}
          >
            <a.I className="size-4" />
            {a.nome}
          </button>
        ))}
      </nav>
      {aba === 'numeros' ? (
        <>
          <div className="flex items-start gap-3 rounded-panel border border-line bg-panel p-4">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-hum-fg" />
            <div>
              <p className="font-semibold">Seu número, dentro da central</p>
              <p className="mt-1 text-sm text-ink-2">
                A central usa um único número de WhatsApp: é por ele que o agente atende. Depois do
                pareamento, o WhatsApp real envia e recebe mensagens.
              </p>
            </div>
            <span className="ml-auto hidden rounded-full bg-chat px-3 py-1 text-xs font-semibold text-ink-2 sm:block">
              Canal WhatsApp
            </span>
          </div>
          {numeros.isError ? (
            <div
              role="alert"
              className="rounded-panel border border-emg-border bg-emg-bg p-5 text-emg-fg"
            >
              <p>Não foi possível consultar as conexões. {numeros.error.message}</p>
              <Button
                variant="outline"
                className="mt-3 cursor-pointer"
                onClick={() => numeros.refetch()}
              >
                Tentar de novo
              </Button>
            </div>
          ) : numeros.isLoading ? (
            <div className="h-64 rounded-panel border border-line bg-panel p-5">
              <div className="h-5 w-40 rounded bg-chat" />
              <div className="mt-6 h-24 rounded bg-canvas" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[17px] font-semibold">Número da operação</h2>
                {atual ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="h-9 cursor-pointer"
                      onClick={() => setConfirmar('trocar')}
                    >
                      <ArrowLeftRight />
                      Trocar número
                    </Button>
                    <Button
                      variant="outline"
                      className="h-9 cursor-pointer text-emg-fg"
                      onClick={() => setConfirmar('remover')}
                    >
                      <Trash2 />
                      Remover número
                    </Button>
                  </div>
                ) : null}
              </div>
              {atual ? (
                <NumeroCard
                  numero={atual}
                  qrAberto={qrAbertoId === atual.id}
                  onQr={() => setQrAbertoId(qrAbertoId === atual.id ? null : atual.id)}
                  onAction={(tipo) => setAcao({ numero: atual, tipo })}
                  onRenomear={() => {
                    setNovoRotulo(atual.rotulo);
                    setRenomear(atual);
                  }}
                />
              ) : (
                <div className="flex flex-col items-center rounded-panel border border-dashed border-line-control bg-panel p-8 text-center">
                  <Smartphone className="mb-3 size-8 text-ink-3" />
                  <h3 className="text-base font-semibold">Nenhum número da operação</h3>
                  <p className="mt-2 max-w-lg text-sm text-ink-2">
                    Adicione o número de WhatsApp pelo qual o agente vai atender. Em seguida, o QR
                    de pareamento aparece aqui para você conectar o aparelho.
                  </p>
                  <Button className="mt-4 cursor-pointer" onClick={() => abrirForm('adicionar')}>
                    <Plus />
                    Adicionar número
                  </Button>
                </div>
              )}
            </>
          )}
          <section className="grid gap-5 rounded-panel border border-line bg-panel p-5 md:grid-cols-[1fr_1.4fr]">
            <div>
              <div className="mb-3 flex size-9 items-center justify-center rounded-card bg-chat">
                <CircleHelp className="size-5 text-ink-2" />
              </div>
              <h2 className="text-[17px] font-semibold">Como conectar</h2>
              <p className="mt-2 text-sm text-ink-2">
                Mantenha o celular conectado à internet durante o pareamento.
              </p>
            </div>
            <ol className="space-y-4">
              {[
                'Adicione o número da operação e deixe o QR de pareamento aberto.',
                'No WhatsApp do celular, abra Configurações e depois Aparelhos conectados.',
                'Toque em “Conectar um aparelho” e escaneie o QR exibido.',
                'Quando o estado mudar para Conectado, abra Atendimento para enviar uma mensagem.',
              ].map((x, i) => (
                <li key={x} className="flex gap-3 text-sm text-ink-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-chat text-xs font-bold text-ink">
                    {i + 1}
                  </span>
                  {x}
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : aba === 'equipe' ? (
        <Equipe />
      ) : (
        <DemoPanel />
      )}

      <Dialog
        open={!!form}
        onOpenChange={(v) => {
          if (!v && !salvarNumero.isPending) setForm(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              enviarForm();
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle className="font-display text-lg">
                {form === 'trocar' ? 'Trocar número da operação' : 'Adicionar número'}
              </DialogTitle>
              <DialogDescription>
                {form === 'trocar'
                  ? 'O número atual será desconectado e removido ao salvar. O histórico de conversas é mantido.'
                  : 'Informe o nome e o número de WhatsApp que o agente vai usar para atender.'}
              </DialogDescription>
            </DialogHeader>
            <label className="block text-sm font-semibold">
              Nome do número
              <Input
                value={rotulo}
                maxLength={60}
                placeholder="Comercial"
                disabled={salvarNumero.isPending}
                onChange={(e) => setRotulo(e.target.value)}
                className="mt-2 h-10 bg-panel"
                autoFocus
              />
            </label>
            <label className="block text-sm font-semibold">
              Número do WhatsApp
              <div className="mt-2 flex items-center gap-2">
                <span className="flex h-10 items-center rounded-control border border-line-control bg-chat px-3 text-sm text-ink-2">
                  +55
                </span>
                <Input
                  value={telefone}
                  inputMode="tel"
                  placeholder="(82) 99999-9999"
                  disabled={salvarNumero.isPending}
                  onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
                  className="h-10 bg-panel tabular"
                />
              </div>
            </label>
            {erroForm ? (
              <p role="alert" className="text-sm text-emg-fg">
                {erroForm}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer"
                disabled={salvarNumero.isPending}
                onClick={() => setForm(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="cursor-pointer" disabled={salvarNumero.isPending}>
                {salvarNumero.isPending
                  ? 'Salvando…'
                  : form === 'trocar'
                    ? 'Trocar número'
                    : 'Adicionar número'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!renomear}
        onOpenChange={(v) => {
          if (!v && !renomearNumero.isPending) setRenomear(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (renomear && novoRotulo.trim().length >= 2 && !renomearNumero.isPending)
                renomearNumero.mutate({ id: renomear.id, nome: novoRotulo.trim() });
            }}
          >
            <DialogHeader>
              <DialogTitle className="font-display text-lg">Editar nome do número</DialogTitle>
              <DialogDescription>O nome aparece só aqui, na central.</DialogDescription>
            </DialogHeader>
            <Input
              value={novoRotulo}
              maxLength={60}
              onChange={(e) => setNovoRotulo(e.target.value)}
              className="h-10 bg-panel"
              autoFocus
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer"
                onClick={() => setRenomear(null)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="cursor-pointer"
                disabled={renomearNumero.isPending || novoRotulo.trim().length < 2}
              >
                {renomearNumero.isPending ? 'Salvando…' : 'Salvar nome'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmar}
        onOpenChange={(v) => {
          if (!v && !removerNumero.isPending) setConfirmar(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmar === 'trocar' ? 'Trocar o número da operação?' : 'Remover o número?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {atual?.rotulo} ({atual?.telefoneExibicao}).{' '}
              {confirmar === 'trocar'
                ? 'Você informará o novo número a seguir. O atual só é desconectado quando você salvar o novo.'
                : 'O WhatsApp será desconectado e o agente deixará de atender até que um novo número seja adicionado. O histórico de conversas é mantido.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer" disabled={removerNumero.isPending}>
              Cancelar
            </AlertDialogCancel>
            {confirmar === 'trocar' ? (
              <Button
                className="cursor-pointer"
                onClick={() => {
                  setConfirmar(null);
                  abrirForm('trocar');
                }}
              >
                Continuar
              </Button>
            ) : (
              <Button
                variant="destructive"
                className="cursor-pointer"
                disabled={removerNumero.isPending}
                onClick={() => atual && removerNumero.mutate(atual.id)}
              >
                {removerNumero.isPending ? 'Removendo…' : 'Remover número'}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!acao}
        onOpenChange={(v) => {
          if (!v && !mutation.isPending) setAcao(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {acao?.tipo === 'desconectar' ? 'Desconectar este número?' : 'Reiniciar a conexão?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {acao?.numero.rotulo} ({acao?.numero.telefoneExibicao}).{' '}
              {acao?.tipo === 'desconectar'
                ? 'O envio e o recebimento ficarão indisponíveis até um novo pareamento.'
                : 'O canal pode ficar temporariamente indisponível e solicitar um novo pareamento.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer" disabled={mutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <Button
              variant={acao?.tipo === 'desconectar' ? 'destructive' : 'default'}
              className="cursor-pointer"
              disabled={mutation.isPending}
              onClick={() => acao && mutation.mutate(acao)}
            >
              {mutation.isPending
                ? 'Aguarde…'
                : acao?.tipo === 'desconectar'
                  ? 'Desconectar número'
                  : 'Reiniciar conexão'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function QrInline({ numero }: { numero: NumeroDTO }) {
  const qr = useQuery({
    queryKey: ['numero-qr', numero.id],
    queryFn: () => bff.get<QrDTO>(`numeros/${numero.id}/qr`),
    refetchInterval: 20000,
    refetchOnWindowFocus: false,
    gcTime: 0,
    retry: false,
  });
  return (
    <div className="mx-5 mb-4 grid gap-4 rounded-card border border-line bg-canvas/60 p-4 md:grid-cols-[auto_1fr]">
      <div className="flex min-h-64 min-w-64 flex-col items-center justify-center rounded-card border border-line bg-white p-3">
        {qr.isLoading ? (
          <>
            <RefreshCw className="mb-3 size-7 animate-spin text-ink-3" />
            <p className="text-sm text-ink-2">Solicitando QR ao canal…</p>
          </>
        ) : qr.isError ? (
          <>
            <WifiOff className="mb-3 size-8 text-emg-fg" />
            <p role="alert" className="max-w-56 text-center text-sm text-emg-fg">
              Não foi possível obter o QR. {qr.error.message}
            </p>
            <Button variant="outline" className="mt-4 cursor-pointer" onClick={() => qr.refetch()}>
              Tentar novamente
            </Button>
          </>
        ) : qr.data?.base64 ? (
          <img
            width={256}
            height={256}
            className="max-w-full"
            src={
              qr.data.base64.startsWith('data:image/')
                ? qr.data.base64
                : `data:image/png;base64,${qr.data.base64}`
            }
            alt="QR de pareamento fornecido pelo canal WhatsApp"
          />
        ) : (
          <>
            <QrCode className="mb-3 size-10 text-ink-3" />
            <p className="max-w-56 text-center text-sm text-ink-2">
              O QR ainda não está disponível. A sessão está sendo criada.
            </p>
            <Button variant="outline" className="mt-4 cursor-pointer" onClick={() => qr.refetch()}>
              <RefreshCw />
              Consultar novamente
            </Button>
          </>
        )}
      </div>
      <div className="text-sm text-ink-2">
        <p className="font-semibold text-ink">Pareie o aparelho</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>No celular, abra o WhatsApp e vá em Configurações.</li>
          <li>Toque em Aparelhos conectados e depois em Conectar um aparelho.</li>
          <li>Escaneie o QR ao lado. Ele é renovado a cada 20 segundos.</li>
        </ol>
        {qr.data?.pairingCode ? (
          <div className="mt-3 rounded-control border border-line bg-chat p-3 text-center">
            <p className="text-xs text-ink-3">Código de pareamento fornecido pelo canal</p>
            <strong className="mt-1 block text-xl tabular tracking-widest">
              {qr.data.pairingCode}
            </strong>
          </div>
        ) : null}
        <p className="mt-3 text-xs text-ink-3">
          Use o aparelho do número {numero.telefoneExibicao}. Quando o pareamento terminar, o estado
          muda para Conectado.
        </p>
      </div>
    </div>
  );
}

function NumeroCard({
  numero: n,
  qrAberto,
  onQr,
  onAction,
  onRenomear,
}: {
  numero: NumeroDTO;
  qrAberto: boolean;
  onQr: () => void;
  onAction: (tipo: 'reiniciar' | 'desconectar') => void;
  onRenomear: () => void;
}) {
  const conectado = n.estado === 'conectado';
  const aguardando = n.estado === 'reconectando';
  return (
    <article className="overflow-hidden rounded-panel border border-line bg-panel">
      <div className="flex items-start gap-3 p-5">
        <span className="flex size-11 items-center justify-center rounded-card bg-chat text-noite">
          <Smartphone className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <h3 className="text-base font-semibold">{n.rotulo}</h3>
            <button
              type="button"
              onClick={onRenomear}
              className="flex size-7 cursor-pointer items-center justify-center rounded-control text-ink-3 hover:bg-chat hover:text-ink focus-visible:outline-sinal"
              aria-label="Editar nome do número"
            >
              <Pencil className="size-3.5" />
            </button>
          </div>
          <p className="mt-1 text-sm text-ink-2 tabular">
            {n.telefoneExibicao || 'Número ainda não identificado'}
          </p>
        </div>
        <span
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
            conectado
              ? 'bg-hum-bg text-hum-fg'
              : aguardando
                ? 'bg-pau-bg text-pau-fg'
                : 'bg-emg-bg text-emg-fg',
          )}
        >
          {conectado ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
          {conectado
            ? 'Conectado'
            : aguardando
              ? 'Reconectando'
              : n.estado === 'erro'
                ? 'Falha na conexão'
                : 'Desconectado'}
        </span>
      </div>
      <dl className="mx-5 space-y-3 border-t border-line-subtle py-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-3">Instância</dt>
          <dd className="truncate font-medium">{n.instancia}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-3">Última atualização</dt>
          <dd className="font-medium">
            {n.ultimoEstadoEm ? formatarDataRelativa(n.ultimoEstadoEm) : 'Aguardando conexão'}
          </dd>
        </div>
      </dl>
      {n.ultimaFalha ? (
        <div
          role="status"
          className="mx-5 mb-4 rounded-control border border-emg-border bg-emg-bg p-3 text-xs text-emg-fg"
        >
          <strong className="block">Última falha</strong>
          <p className="mt-1">{n.ultimaFalha}</p>
        </div>
      ) : (
        <p className="mx-5 mb-4 text-xs text-ink-3">
          {conectado
            ? 'Canal disponível para envio e recebimento.'
            : 'Pareie o aparelho para começar a atender neste número.'}
        </p>
      )}
      {!conectado && qrAberto ? <QrInline numero={n} /> : null}
      <div className="flex flex-wrap gap-2 border-t border-line-subtle bg-canvas/60 px-5 py-4">
        {!conectado ? (
          <Button className="h-9 cursor-pointer" onClick={onQr}>
            <QrCode />
            {qrAberto ? 'Ocultar QR' : 'Exibir QR de pareamento'}
          </Button>
        ) : (
          <Button asChild className="h-9 cursor-pointer">
            <Link href="/atendimento">
              <MessageSquare />
              Abrir atendimento
            </Link>
          </Button>
        )}
        <Button className="h-9 cursor-pointer" variant="outline" onClick={() => onAction('reiniciar')}>
          <RefreshCw />
          Reconectar
        </Button>
        {conectado ? (
          <Button className="h-9 cursor-pointer" variant="ghost" onClick={() => onAction('desconectar')}>
            <Unplug />
            Desconectar
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function DemoPanel() {
  const client = useQueryClient();
  const [texto, setTexto] = useState(
    'Olá! Gostaria de saber mais sobre os planos para a minha família.',
  );
  const [contato, setContato] = useState('novo');
  const [nome, setNome] = useState('Contato de apresentação');
  const [lista, setLista] = useState<string | null>(null);
  const [erroLista, setErroLista] = useState('');
  const [ultimaConversa, setUltimaConversa] = useState<string | null>(null);
  const permitidos = useQuery({
    queryKey: ['demo', 'numeros-permitidos'],
    queryFn: () => bff.get<PermitidosDTO>('demo/numeros-permitidos'),
  });
  const conversas = useQuery({
    queryKey: chaves.conversas('todas', ''),
    queryFn: () => bff.get<ListaConversasDTO>('conversas?filtro=todas&limite=50'),
  });
  const simulador = useMutation({
    mutationFn: (body: SimuladorBody) =>
      bff.post<{ conversationId?: string }>('demo/simulador', body),
    onSuccess: async (r) => {
      toast.success('Mensagem simulada criada. Aguarde o processamento no atendimento.');
      setUltimaConversa(r?.conversationId ?? null);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['conversas'] }),
        client.invalidateQueries({ queryKey: ['mensagens'] }),
        client.invalidateQueries({ queryKey: ['visao-geral'] }),
      ]);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const salvar = useMutation({
    mutationFn: (numeros: string[]) => bff.put('demo/numeros-permitidos', { numeros }),
    onSuccess: async () => {
      toast.success('Números de teste atualizados. Nenhuma mensagem enviada.');
      await client.invalidateQueries({ queryKey: ['demo', 'numeros-permitidos'] });
      setLista(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const contatos = Array.from(
    new Map(
      (conversas.data?.itens ?? [])
        .filter((c) => ehNumeroFicticio(c.contato.e164))
        .map((c) => [c.contato.id, c.contato]),
    ).values(),
  );
  function salvarLista() {
    const entradas = (lista ?? permitidos.data?.numeros.join('\n') ?? '')
      .split(/[\n,;]+/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (entradas.length > 100) {
      setErroLista('Use no máximo 100 números de teste.');
      return;
    }
    const invalidos = entradas.filter((n) => !normalizarTelefoneBr(n));
    if (invalidos.length) {
      setErroLista(
        `Confira os telefones: ${invalidos.join(', ')}. Informe números brasileiros válidos com DDD.`,
      );
      return;
    }
    setErroLista('');
    salvar.mutate([...new Set(entradas.map((n) => normalizarTelefoneBr(n)!))]);
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <DemoBadge />
        <p className="text-sm text-ink-2">
          Prepare uma apresentação sem depender de mensagens externas.
        </p>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[1.3fr_1fr]">
        <section className="rounded-panel border border-line bg-panel p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-card bg-esp-bg text-esp-fg">
              <FlaskConical className="size-5" />
            </span>
            <div>
              <h2 className="text-[17px] font-semibold">Simular mensagem recebida</h2>
              <p className="mt-1 text-xs text-ink-3">
                Cria uma entrada local na central, sem enviar pelo WhatsApp.
              </p>
            </div>
          </div>
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (simulador.isPending || !texto.trim() || (contato === 'novo' && !nome.trim()))
                return;
              simulador.mutate({
                ...(contato === 'novo'
                  ? { novoContato: { nome: nome.trim() } }
                  : { contactId: contato }),
                texto: texto.trim(),
              });
            }}
          >
            <div className="block text-sm font-semibold">
              Contato
              <Select
                value={contato}
                disabled={simulador.isPending}
                onValueChange={(v) => {
                  setContato(v);
                  simulador.reset();
                }}
              >
                <SelectTrigger size="lg" className="mt-2 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="novo">Criar novo contato fictício</SelectItem>
                  {contatos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome ?? c.telefoneExibicao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {conversas.isError ? (
              <p role="status" className="text-xs text-pau-fg">
                Os contatos existentes não puderam ser carregados. Você ainda pode criar um novo
                contato fictício.
              </p>
            ) : null}
            {contato === 'novo' ? (
              <label className="block text-sm font-semibold">
                Nome do contato
                <Input
                  value={nome}
                  maxLength={160}
                  disabled={simulador.isPending}
                  onChange={(e) => {
                    setNome(e.target.value);
                    simulador.reset();
                  }}
                  className="mt-2 h-10 bg-panel"
                  required
                />
              </label>
            ) : null}
            <label className="block text-sm font-semibold">
              Mensagem do cliente
              <textarea
                rows={5}
                value={texto}
                maxLength={4096}
                disabled={simulador.isPending}
                onChange={(e) => {
                  setTexto(e.target.value);
                  simulador.reset();
                }}
                className="mt-2 w-full rounded-control border border-line-control bg-panel p-3 font-normal outline-sinal"
                required
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-xs text-ink-3">
                <LockKeyhole className="size-3.5" />
                Somente no ambiente local
              </span>
              <Button
                className="h-9"
                disabled={
                  simulador.isPending || !texto.trim() || (contato === 'novo' && !nome.trim())
                }
              >
                <Send />
                {simulador.isPending ? 'Simulando…' : 'Simular recebimento'}
              </Button>
            </div>
          </form>
          {simulador.isError ? (
            <p
              role="alert"
              className="mt-4 rounded-control border border-emg-border bg-emg-bg p-3 text-sm text-emg-fg"
            >
              A simulação não foi criada. {simulador.error.message}
            </p>
          ) : null}
          {simulador.isSuccess ? (
            <div
              role="status"
              className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-control border border-hum-border bg-hum-bg p-3 text-sm text-hum-fg"
            >
              <span className="flex items-center gap-2">
                <CheckCheck className="size-4 shrink-0" />
                Simulação criada e aguardando processamento
              </span>
              <Link
                className="font-semibold underline"
                href={ultimaConversa ? `/atendimento?c=${ultimaConversa}` : '/atendimento'}
              >
                Abrir atendimento
              </Link>
            </div>
          ) : null}
        </section>
        <div className="space-y-6">
          <section className="rounded-panel border border-line bg-panel p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-ink-2" />
              <h2 className="text-[17px] font-semibold">Números permitidos para teste</h2>
            </div>
            <p className="mt-2 text-sm text-ink-2">
              Destinatários autorizados para testar envios reais no modo restrito. Use um telefone
              brasileiro com DDD por linha.
            </p>
            {permitidos.isError ? (
              <p role="alert" className="mt-3 text-sm text-emg-fg">
                {permitidos.error.message}{' '}
                <button className="cursor-pointer underline" onClick={() => permitidos.refetch()}>
                  Tentar de novo
                </button>
              </p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!salvar.isPending) salvarLista();
                }}
              >
                <label className="sr-only" htmlFor="permitidos">
                  Números brasileiros permitidos
                </label>
                <textarea
                  id="permitidos"
                  rows={4}
                  className="mt-4 w-full rounded-control border border-line-control bg-panel p-3 text-sm tabular outline-sinal"
                  placeholder="+5511900000000"
                  value={lista ?? permitidos.data?.numeros.join('\n') ?? ''}
                  onChange={(e) => {
                    setLista(e.target.value);
                    setErroLista('');
                    salvar.reset();
                  }}
                  disabled={permitidos.isLoading || salvar.isPending}
                  aria-invalid={!!erroLista}
                  aria-describedby="permitidos-ajuda permitidos-erro"
                />
                <p id="permitidos-ajuda" className="mt-1 text-xs text-ink-3">
                  Salvar esta lista não envia mensagens. Uma lista vazia não autoriza nenhum
                  destinatário no modo restrito.
                </p>
                <p
                  id="permitidos-erro"
                  role={erroLista || salvar.isError ? 'alert' : undefined}
                  className="mt-2 text-xs text-emg-fg"
                >
                  {erroLista || (salvar.isError ? salvar.error.message : '')}
                </p>
                <Button
                  className="mt-4 h-9"
                  variant="outline"
                  disabled={salvar.isPending || permitidos.isLoading || lista === null}
                >
                  <Check />
                  {salvar.isPending ? 'Salvando…' : 'Salvar números permitidos'}
                </Button>
                {salvar.isSuccess ? (
                  <p role="status" className="mt-3 text-xs text-hum-fg">
                    Números permitidos atualizados. Nenhuma mensagem enviada.
                  </p>
                ) : null}
              </form>
            )}
          </section>
          <section className="rounded-panel border border-line bg-panel p-5">
            <History className="mb-3 size-5 text-ink-3" />
            <h2 className="text-[17px] font-semibold">Preservação da demonstração</h2>
            <p className="mt-2 text-sm text-ink-2">
              A base fictícia é preservada durante a apresentação. A restauração é feita manualmente
              pela preparação de dados no servidor.
            </p>
            <Button variant="outline" className="mt-4 h-9" disabled>
              <RefreshCw />
              Restauração pelo servidor
            </Button>
            <p className="mt-2 text-xs text-ink-3">
              A central não apaga nem restaura esses registros.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
function Equipe() {
  const membros = [
    { nome: 'Ana Oliveira', papel: 'Dona', email: 'ana@example.com', setor: 'Gestão' },
    { nome: 'Marcos Silva', papel: 'Gestor', email: 'marcos@example.com', setor: 'Comercial' },
    {
      nome: 'Júlia Santos',
      papel: 'Atendente',
      email: 'julia@example.com',
      setor: 'Comercial',
    },
  ];
  const permissoes = [
    { acao: 'Atender e enviar mensagens', p: [true, true, true] },
    { acao: 'Transferir conversas', p: [true, true, true] },
    { acao: 'Controlar a IA da operação', p: [true, true, false] },
    { acao: 'Gerenciar produtos e regras', p: [true, true, false] },
    { acao: 'Administrar conexões e equipe', p: [true, false, false] },
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <DemoBadge />
        <p className="text-sm text-ink-2">
          Prévia visual da gestão de equipe. Os perfis abaixo são fictícios.
        </p>
      </div>
      <section className="overflow-hidden rounded-panel border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle p-5">
          <div>
            <h2 className="text-[17px] font-semibold">Pessoas da operação</h2>
            <p className="mt-1 text-xs text-ink-3">
              Cada pessoa tem um papel e um limite de atuação.
            </p>
          </div>
          <EmDesenvolvimento recurso="Convidar pessoas">
            {(abrir) => (
              <Button className="h-9 cursor-pointer" onClick={abrir}>
                <UserPlus />
                Convidar pessoa
              </Button>
            )}
          </EmDesenvolvimento>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-canvas text-xs text-ink-3">
              <tr>
                {['Pessoa', 'Papel', 'Setor', 'Acesso'].map((x) => (
                  <th key={x} className="px-5 py-3 font-semibold">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {membros.map((m) => (
                <tr key={m.nome}>
                  <td className="flex items-center gap-3 px-5 py-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sunken text-xs font-bold text-ink-2">
                      {iniciais(m.nome)}
                    </span>
                    <div>
                      <p className="font-semibold">{m.nome}</p>
                      <p className="text-xs text-ink-3">{m.email}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4">{m.papel}</td>
                  <td className="px-5 py-4 text-ink-2">{m.setor}</td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-hum-bg px-2 py-1 text-xs font-semibold text-hum-fg">
                      Ativo (fictício)
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="overflow-hidden rounded-panel border border-line bg-panel">
        <div className="border-b border-line-subtle p-5">
          <h2 className="text-[17px] font-semibold">Permissões por papel</h2>
          <p className="mt-1 text-xs text-ink-3">Prévia das responsabilidades de cada perfil.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-canvas text-xs text-ink-3">
              <tr>
                <th className="px-5 py-3">Ação</th>
                {['Dono', 'Gestor', 'Atendente'].map((x) => (
                  <th key={x} className="px-5 py-3 text-center">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {permissoes.map((p) => (
                <tr key={p.acao}>
                  <td className="px-5 py-4">{p.acao}</td>
                  {p.p.map((v, i) => (
                    <td key={i} className="px-5 py-4 text-center">
                      {v ? (
                        <Check className="mx-auto size-4 text-hum-fg" aria-label="Permitido" />
                      ) : (
                        <LockKeyhole
                          className="mx-auto size-3.5 text-ink-3"
                          aria-label="Restrito"
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
