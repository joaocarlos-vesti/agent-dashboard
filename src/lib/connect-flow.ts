import { localDay } from './day';
import { exactTime, formatRelativeTime } from './format';

export interface ConnectionStatus { hasKey: boolean; keyCreatedAt: string | null; lastEventAt: string | null }

type StatusState = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'ready'; value: ConnectionStatus };
type StepState = { kind: 'idle' } | { kind: 'confirming' } | { kind: 'generating' } | { kind: 'generated'; key: string; copied: boolean } | { kind: 'failed' };
export interface ConnectState { status: StatusState; step: StepState }

export type ConnectAction =
  | { type: 'statusLoaded'; status: ConnectionStatus }
  | { type: 'statusFailed'; message: string }
  | { type: 'retryStatus' }
  | { type: 'requestNew' }
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'generated'; key: string }
  | { type: 'generateFailed' }
  | { type: 'copied' };

export const initialConnectState: ConnectState = { status: { kind: 'loading' }, step: { kind: 'idle' } };

const withStep = (state: ConnectState, step: StepState): ConnectState => ({ ...state, step });
const hasExistingKey = (status: StatusState) => status.kind === 'ready' && status.value.hasKey;

/** Gerar chave desliga a anterior; por isso só o botão inicia, e com conexão existente só depois da confirmação. */
export function connectReducer(state: ConnectState, action: ConnectAction): ConnectState {
  const { step } = state;
  switch (action.type) {
    case 'statusLoaded':
      return { ...state, status: { kind: 'ready', value: action.status } };
    case 'statusFailed':
      return { ...state, status: { kind: 'failed', message: action.message } };
    case 'retryStatus':
      return state.status.kind === 'failed' ? { ...state, status: { kind: 'loading' } } : state;
    case 'requestNew': {
      if (state.status.kind !== 'ready' || (step.kind !== 'idle' && step.kind !== 'failed')) return state;
      return withStep(state, hasExistingKey(state.status) ? { kind: 'confirming' } : { kind: 'generating' });
    }
    case 'confirm':
      return step.kind === 'confirming' ? withStep(state, { kind: 'generating' }) : state;
    case 'cancel':
      return step.kind === 'confirming' ? withStep(state, { kind: 'idle' }) : state;
    case 'generated':
      return step.kind === 'generating' ? withStep(state, { kind: 'generated', key: action.key, copied: false }) : state;
    case 'generateFailed':
      return step.kind === 'generating' ? withStep(state, { kind: 'failed' }) : state;
    case 'copied':
      return step.kind === 'generated' ? withStep(state, { ...step, copied: true }) : state;
  }
}

export interface ConnectContext { now: number; origin: string; networkHost: string; timeZone: string | undefined }
export interface ConnectView {
  headline: string;
  hint: string | null;
  error: string | null;
  canRetryStatus: boolean;
  action: { label: string; disabled: boolean } | null;
  confirmation: { text: string; confirmLabel: string; cancelLabel: string } | null;
  install: { command: string; cloudVariable: string; networkHost: string; copyLabel: string } | null;
}

const CONFIRMATION_TEXT = 'Isso desliga o Claude Code já conectado, no terminal e na nuvem. Depois você roda o comando de novo em cada lugar.';
const GENERATE_FAILED_TEXT = 'Não foi possível gerar a conexão. Confira a internet e tente de novo.';
const NEW_KEY_HINT = 'A conexão anterior foi desligada. Rode o comando abaixo para conectar de novo.';

const EMPTY_VIEW: ConnectView = { headline: '', hint: null, error: null, canRetryStatus: false, action: null, confirmation: null, install: null };

// Evento anterior à chave atual veio da chave já desligada: não prova que a conexão atual funciona.
const hasEventSinceKey = ({ hasKey, keyCreatedAt, lastEventAt }: ConnectionStatus) =>
  hasKey && lastEventAt !== null && (keyCreatedAt === null || Date.parse(lastEventAt) > Date.parse(keyCreatedAt));

function generatedAtText(keyCreatedAt: string | null, { now, timeZone }: Pick<ConnectContext, 'now' | 'timeZone'>): string {
  if (!keyCreatedAt) return '';
  const dayAndTime = exactTime(keyCreatedAt, timeZone);
  return localDay(Date.parse(keyCreatedAt), timeZone) === localDay(now, timeZone) ? ` às ${dayAndTime.slice(-5)}` : ` em ${dayAndTime}`;
}

const keyWithoutEventHint = (keyCreatedAt: string | null, context: Pick<ConnectContext, 'now' | 'timeZone'>) =>
  `Conexão gerada${generatedAtText(keyCreatedAt, context)} — ainda não chegou nenhum evento. Rode no seu terminal o comando que apareceu ao gerar, ou gere uma nova conexão.`;

function overviewOf(status: ConnectionStatus, context: Pick<ConnectContext, 'now' | 'timeZone'>): Pick<ConnectView, 'headline' | 'hint'> & { actionLabel: string } {
  if (status.lastEventAt && hasEventSinceKey(status)) return { headline: `Conectado · último evento ${formatRelativeTime(status.lastEventAt, context.now)}`, hint: null, actionLabel: 'Gerar nova conexão' };
  return status.hasKey
    ? { headline: 'Ainda não conectado', hint: keyWithoutEventHint(status.keyCreatedAt, context), actionLabel: 'Gerar nova conexão' }
    : { headline: 'Ainda não conectado', hint: null, actionLabel: 'Gerar conexão' };
}

/** O que a tela Conectar mostra, em texto pronto. */
export function connectView(state: ConnectState, { now, origin, networkHost, timeZone }: ConnectContext): ConnectView {
  const { status, step } = state;
  if (status.kind === 'loading') return { ...EMPTY_VIEW, headline: 'Consultando a conexão…' };
  if (status.kind === 'failed') return { ...EMPTY_VIEW, headline: 'Conexão', error: `Não foi possível consultar a conexão: ${status.message}.`, canRetryStatus: true };
  const overview = overviewOf(status.value, { now, timeZone });
  if (step.kind === 'generated') {
    return {
      ...EMPTY_VIEW, headline: 'Nova conexão gerada', hint: NEW_KEY_HINT,
      install: { command: `curl -fsSL ${origin}/install.sh | bash -s -- ${step.key}`, cloudVariable: `INGEST_KEY=${step.key}`, networkHost, copyLabel: step.copied ? 'Copiado!' : 'Copiar comando' },
    };
  }
  const base: ConnectView = { ...EMPTY_VIEW, headline: overview.headline, hint: overview.hint, action: { label: overview.actionLabel, disabled: false } };
  if (step.kind === 'generating') return { ...base, action: { label: 'Gerando…', disabled: true } };
  if (step.kind === 'confirming') return { ...base, action: null, confirmation: { text: CONFIRMATION_TEXT, confirmLabel: 'Desligar a atual e gerar nova', cancelLabel: 'Cancelar' } };
  if (step.kind === 'failed') return { ...base, error: GENERATE_FAILED_TEXT };
  return base;
}
