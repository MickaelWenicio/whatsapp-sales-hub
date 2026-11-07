/**
 * Cliente do BFF para componentes do browser: `/api/bff/<caminho>` repassa para
 * `${ADMIN_API_URL}/admin/<caminho>` com a sessão. Caminhos sem barra inicial e sem `admin/`.
 */
export class BffError extends Error {
  constructor(
    public status: number,
    message: string,
    public corpo?: unknown,
  ) {
    super(message);
    this.name = 'BffError';
  }
}

async function chamar<T>(metodo: 'GET' | 'POST' | 'PUT', caminho: string, corpo?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/bff/${caminho.replace(/^\/+/, '')}`, {
      method: metodo,
      headers: corpo !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch {
    throw new BffError(0, 'Sem conexão com o servidor. Confira a internet e tente de novo.');
  }

  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.assign('/login');
  }
  if (res.status === 204) return undefined as T;

  const texto = await res.text();
  let json: unknown;
  try {
    json = texto ? JSON.parse(texto) : undefined;
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    const msg =
      json && typeof json === 'object' && 'message' in json
        ? String((json as { message: unknown }).message)
        : `Erro ${res.status}. Tente de novo.`;
    throw new BffError(res.status, msg, json);
  }
  return json as T;
}

export const bff = {
  get: <T>(caminho: string) => chamar<T>('GET', caminho),
  post: <T = void>(caminho: string, corpo?: unknown) => chamar<T>('POST', caminho, corpo ?? {}),
  put: <T = void>(caminho: string, corpo?: unknown) => chamar<T>('PUT', caminho, corpo ?? {}),
};
