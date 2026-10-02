export interface ConnectionSession<T> {
  settings:T | null;
  error:string;
  sequence:number;
  isLoading:boolean;
  isWriting:boolean;
}
export function createConnectionSession<T>():ConnectionSession<T>;
export function requestConnection<T>(session:ConnectionSession<T>,request:()=>Promise<T>,isWriting?:boolean)
  :Promise<'applied' | 'failed' | 'stale' | 'skipped'>;
