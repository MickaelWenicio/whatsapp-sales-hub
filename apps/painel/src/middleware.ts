/**
 * Protege o painel (browser para Next). A regra está no callback `authorized` de `src/auth.ts`:
 * sem sessão vai para /login; já logado em /login vai para /visao-geral. As rotas /api cuidam
 * da própria autenticação (BFF e stream devolvem 401).
 */
export { auth as middleware } from '@/auth';

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|brand).*)'],
};
